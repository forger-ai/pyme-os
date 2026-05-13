"""Chilean payroll calculation engine.

Pure functions, no IO. The constants are loaded by the caller from
`app.constants_cl.load_for_year(year)` and passed in. Decisions:

- Gratificación legal: assumed at 25% of remuneración imponible, capped at
  4.75 IMM / 12 (legal cap), unless the employer overrides it. This is a
  common simplification — many SMBs include it in the contractual base.
- AFC empleado: 0.6% for indefinite contracts, 0% for fixed-term and project.
- AFC empleador: 2.4% indefinite, 3.0% fixed-term.
- Health: Fonasa flat 7%; Isapre is the larger of (7% imponible, plan UF * UF).
- Employer extra costs (SIS, Mutual, Ley SANNA, Reforma previsional) use
  referential rates and apply on the imponible.
- IUSC (impuesto único de segunda categoría): tabla mensual en UTM cargada
  desde constants.

Caveats:
- These are referential calculations for planning a salary in a small
  company. They are NOT certified for issuing official payslips.
- UF and UTM are passed as monthly snapshots; we do not query SBIF/SII.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

from app.constants_cl import load_for_year


@dataclass(frozen=True)
class NonImponibleItem:
    label: str
    amount_clp: float


@dataclass(frozen=True)
class ImponibleExtra:
    """Bonos / comisiones / horas extras: suman al imponible antes de cotizar."""

    label: str
    amount_clp: float


@dataclass(frozen=True)
class PostTaxDiscount:
    """Descuentos extras (prestamos, anticipos, etc.) que restan del liquido."""

    label: str
    amount_clp: float

# Referential employer extra costs (over imponible). These are the fallback
# values used only if the year's constants JSON does not declare them under
# `employer_extras`. Keeping them aligned with the JSON so the math stays
# consistent if the file is missing the section.
EMPLOYER_EXTRA_RATES_FALLBACK = {
    "sis": 0.0162,
    "mutual_base": 0.0093,
    "ley_sanna": 0.003,
    "reforma_previsional": 0.01,
}

ContractKind = Literal["indefinite", "fixed_term", "project_based", "part_time"]


@dataclass(frozen=True)
class PayrollInput:
    base_salary_clp: float
    contract_type: ContractKind
    afp_code: str
    health_provider: Literal["fonasa", "isapre"]
    isapre_plan_uf: float = 0.0  # Only used when health_provider == "isapre".
    year: int = 2026
    uf_value_clp: float = 40146.82  # Snapshot mayo 2026 (Banco Central)
    utm_value_clp: float = 70588.0  # Snapshot mayo 2026 (SII)
    include_gratification: bool = True
    non_imponible_items: tuple[NonImponibleItem, ...] = field(default_factory=tuple)
    imponible_extras: tuple[ImponibleExtra, ...] = field(default_factory=tuple)
    post_tax_discounts: tuple[PostTaxDiscount, ...] = field(default_factory=tuple)
    # Standard Chilean payroll uses 30-day months. For partial months
    # (entrants/leavers) days_worked < 30 pro-rates base salary, gratification,
    # and non-imponible items proportionally. Extras (bonos) are NOT pro-rated
    # because they typically reflect a specific event in the period.
    days_worked: int = 30
    # Cotización adicional diferenciada de Mutual (D.S. 110). Applied on top of
    # `employer_extras.mutual_base`. The router resolves the rate from
    # `CompanySettings.economic_activity_code` (or the manual override) and
    # passes it in; the engine stays a pure function.
    mutual_additional_rate: float = 0.0


@dataclass(frozen=True)
class PayrollBreakdown:
    # Inputs echoed for traceability
    base_salary_clp: float
    contract_type: ContractKind
    afp_code: str
    afp_total_rate: float
    health_provider: str
    isapre_plan_uf: float
    year: int
    uf_value_clp: float
    utm_value_clp: float
    days_worked: int
    # Haberes
    gratification_clp: float
    imponible_clp: float
    capped_imponible_afp_health_clp: float
    capped_imponible_afc_clp: float
    non_imponible_items: tuple[NonImponibleItem, ...]
    non_imponible_total_clp: float
    imponible_extras: tuple[ImponibleExtra, ...]
    imponible_extras_total_clp: float
    post_tax_discounts: tuple[PostTaxDiscount, ...]
    post_tax_discounts_total_clp: float
    # Descuentos empleado
    afp_employee_clp: float
    health_employee_clp: float
    unemployment_employee_clp: float
    taxable_base_clp: float
    income_tax_clp: float
    total_employee_deductions_clp: float
    net_salary_clp: float
    # Costo empleador
    sis_clp: float
    mutual_clp: float
    mutual_rate: float  # Effective Mutual rate: base + cotización adicional.
    afc_employer_clp: float
    ley_sanna_clp: float
    reforma_previsional_clp: float
    total_employer_extras_clp: float
    total_employer_cost_clp: float
    notes: list[str]


def _afp_rate(constants: dict, code: str) -> float:
    for entry in constants.get("afp", []):
        if entry["code"] == code:
            return float(entry["total_rate"])
    return 0.1144  # safe default if catalog is missing the code


def _legal_gratification_cap_clp(constants: dict) -> float:
    """Cap on monthly legal gratification: 4.75 IMM / 12."""
    immc = float(constants.get("minimum_wage_clp", 510_000))
    return (4.75 * immc) / 12.0


def _income_tax_brackets(constants: dict) -> list[dict]:
    return constants.get("income_tax_brackets_utm", [])


def _round(value: float) -> float:
    return float(round(value))


def compute_from_base(input: PayrollInput) -> PayrollBreakdown:
    """Forward calculation: from contractual base salary, compute everything."""
    constants = load_for_year(input.year)
    afp_rate = _afp_rate(constants, input.afp_code)

    cap_health_uf = float(
        constants.get("imponible_caps", {}).get("afp_health_uf", 87.8)
    )
    cap_afc_uf = float(
        constants.get("imponible_caps", {}).get("unemployment_insurance_uf", 131.7)
    )
    cap_health_clp = cap_health_uf * input.uf_value_clp
    cap_afc_clp = cap_afc_uf * input.uf_value_clp

    # Pro-rate base salary by days worked (Chilean payroll uses 30-day months).
    days = max(0, min(30, input.days_worked))
    day_factor = days / 30.0
    prorated_base = input.base_salary_clp * day_factor

    # Gratificación legal mensual = mín(25% sueldo prorrateado, 4.75 IMM / 12 prorrateado).
    if input.include_gratification:
        gratification = min(
            0.25 * prorated_base,
            _legal_gratification_cap_clp(constants) * day_factor,
        )
    else:
        gratification = 0.0

    # Bonos / comisiones / horas extras: ingresan al imponible (no se prorratean
    # porque representan eventos puntuales del periodo).
    imponible_extras_total = sum(item.amount_clp for item in input.imponible_extras)

    imponible = prorated_base + gratification + imponible_extras_total
    capped_health = min(imponible, cap_health_clp)
    capped_afc = min(imponible, cap_afc_clp)

    # Descuentos empleado.
    afp_employee = capped_health * afp_rate

    if input.health_provider == "fonasa":
        health_rate = float(constants.get("health", {}).get("fonasa_rate", 0.07))
        health_employee = capped_health * health_rate
    else:
        # Isapre: el mayor entre 7% imponible y plan UF * UF.
        min_rate = float(
            constants.get("health", {}).get("isapre_minimum_rate", 0.07)
        )
        plan_clp = input.isapre_plan_uf * input.uf_value_clp
        health_employee = max(capped_health * min_rate, plan_clp)

    afc_emp_rate = (
        constants.get("unemployment_insurance", {})
        .get(input.contract_type, {"employee": 0.0})
        .get("employee", 0.0)
    )
    unemployment_employee = capped_afc * float(afc_emp_rate)

    # IUSC (mensual, sobre base tributable).
    taxable_base = imponible - (afp_employee + health_employee + unemployment_employee)
    income_tax = _income_tax(taxable_base, _income_tax_brackets(constants), input.utm_value_clp)

    total_employee = afp_employee + health_employee + unemployment_employee + income_tax
    # Non-imponibles (movilizacion, colacion) se prorratean por dias trabajados.
    non_imponible_total = sum(
        item.amount_clp * day_factor for item in input.non_imponible_items
    )
    post_tax_total = sum(item.amount_clp for item in input.post_tax_discounts)
    net = imponible - total_employee + non_imponible_total - post_tax_total

    # Costo empleador.
    afc_emp_employer_rate = (
        constants.get("unemployment_insurance", {})
        .get(input.contract_type, {"employer": 0.0})
        .get("employer", 0.0)
    )
    afc_employer = capped_afc * float(afc_emp_employer_rate)
    extras = {**EMPLOYER_EXTRA_RATES_FALLBACK, **constants.get("employer_extras", {})}
    sis = capped_health * float(extras["sis"])
    mutual_rate = float(extras["mutual_base"]) + max(0.0, float(input.mutual_additional_rate))
    mutual = imponible * mutual_rate
    ley_sanna = capped_health * float(extras["ley_sanna"])
    reforma = capped_health * float(extras["reforma_previsional"])

    total_employer_extras = afc_employer + sis + mutual + ley_sanna + reforma
    total_employer_cost = imponible + total_employer_extras + non_imponible_total

    notes: list[str] = []
    if not constants.get("_meta", {}).get("verified", False):
        notes.append(
            "Constantes legales sin verificar oficialmente (usadas como referencia)."
        )
    if input.health_provider == "isapre" and input.isapre_plan_uf == 0:
        notes.append(
            "Plan Isapre en UF no especificado: se usa el mínimo legal (7% imponible)."
        )

    return PayrollBreakdown(
        base_salary_clp=_round(prorated_base),
        contract_type=input.contract_type,
        afp_code=input.afp_code,
        afp_total_rate=afp_rate,
        health_provider=input.health_provider,
        isapre_plan_uf=input.isapre_plan_uf,
        year=input.year,
        uf_value_clp=input.uf_value_clp,
        utm_value_clp=input.utm_value_clp,
        days_worked=days,
        gratification_clp=_round(gratification),
        imponible_clp=_round(imponible),
        capped_imponible_afp_health_clp=_round(capped_health),
        capped_imponible_afc_clp=_round(capped_afc),
        non_imponible_items=tuple(input.non_imponible_items),
        non_imponible_total_clp=_round(non_imponible_total),
        imponible_extras=tuple(input.imponible_extras),
        imponible_extras_total_clp=_round(imponible_extras_total),
        post_tax_discounts=tuple(input.post_tax_discounts),
        post_tax_discounts_total_clp=_round(post_tax_total),
        afp_employee_clp=_round(afp_employee),
        health_employee_clp=_round(health_employee),
        unemployment_employee_clp=_round(unemployment_employee),
        taxable_base_clp=_round(taxable_base),
        income_tax_clp=_round(income_tax),
        total_employee_deductions_clp=_round(total_employee),
        net_salary_clp=_round(net),
        sis_clp=_round(sis),
        mutual_clp=_round(mutual),
        mutual_rate=mutual_rate,
        afc_employer_clp=_round(afc_employer),
        ley_sanna_clp=_round(ley_sanna),
        reforma_previsional_clp=_round(reforma),
        total_employer_extras_clp=_round(total_employer_extras),
        total_employer_cost_clp=_round(total_employer_cost),
        notes=notes,
    )


def _income_tax(taxable_clp: float, brackets_utm: list[dict], utm_clp: float) -> float:
    if utm_clp <= 0 or taxable_clp <= 0:
        return 0.0
    taxable_utm = taxable_clp / utm_clp
    for bracket in brackets_utm:
        upper = bracket.get("to")
        if upper is None or taxable_utm <= float(upper):
            rate = float(bracket["rate"])
            deduction_utm = float(bracket["deduction_utm"])
            tax_utm = taxable_utm * rate - deduction_utm
            return max(0.0, tax_utm * utm_clp)
    return 0.0


def solve_for_anchor(
    anchor: Literal["base", "liquido", "costo_empresa"],
    target_amount: float,
    template: PayrollInput,
) -> PayrollBreakdown:
    """Find the contractual base salary that yields the requested anchor.

    For anchor='base' just runs the forward calculation.
    For anchor in ('liquido', 'costo_empresa') runs binary search on base.
    """
    if anchor == "base":
        return compute_from_base(
            PayrollInput(
                base_salary_clp=target_amount,
                contract_type=template.contract_type,
                afp_code=template.afp_code,
                health_provider=template.health_provider,
                isapre_plan_uf=template.isapre_plan_uf,
                year=template.year,
                uf_value_clp=template.uf_value_clp,
                utm_value_clp=template.utm_value_clp,
                include_gratification=template.include_gratification,
                non_imponible_items=template.non_imponible_items,
                imponible_extras=template.imponible_extras,
                post_tax_discounts=template.post_tax_discounts,
                days_worked=template.days_worked,
            )
        )

    extractor = (
        (lambda b: b.net_salary_clp)
        if anchor == "liquido"
        else (lambda b: b.total_employer_cost_clp)
    )

    low = max(target_amount * 0.3, 100_000.0)
    high = max(target_amount * 3.0, 1_000_000.0)
    last: Optional[PayrollBreakdown] = None
    for _ in range(60):
        mid = (low + high) / 2
        candidate = compute_from_base(
            PayrollInput(
                base_salary_clp=mid,
                contract_type=template.contract_type,
                afp_code=template.afp_code,
                health_provider=template.health_provider,
                isapre_plan_uf=template.isapre_plan_uf,
                year=template.year,
                uf_value_clp=template.uf_value_clp,
                utm_value_clp=template.utm_value_clp,
                include_gratification=template.include_gratification,
                non_imponible_items=template.non_imponible_items,
                imponible_extras=template.imponible_extras,
                post_tax_discounts=template.post_tax_discounts,
                days_worked=template.days_worked,
            )
        )
        produced = extractor(candidate)
        if abs(produced - target_amount) < 1.0:
            return candidate
        if produced < target_amount:
            low = mid
        else:
            high = mid
        last = candidate
    assert last is not None
    return last
