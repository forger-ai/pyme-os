"""Payroll catalogs and salary preview endpoints.

The preview endpoint runs the calculation engine in `app.payroll_engine` and
returns the full breakdown so the frontend wizard can show real-time results
as the user edits the salary anchor.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Literal, Optional

from datetime import datetime, timezone
from decimal import Decimal
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.constants_cl import available_years, load_for_year
from app.database import engine
from app.models import (
    Contract,
    ContractType,
    Employee,
    EmployeeStatus,
    HealthProvider,
    PayrollPeriod,
    Payslip,
    PayslipStatus,
)
from app.payroll_engine import (
    ImponibleExtra,
    NonImponibleItem,
    PayrollBreakdown,
    PayrollInput,
    PostTaxDiscount,
    compute_from_base,
    solve_for_anchor,
)
from app.routers.settings import resolve_mutual_additional_rate

router = APIRouter()


class AfpOption(BaseModel):
    code: str
    name: str
    total_rate: float


class HealthOption(BaseModel):
    code: str
    name: str
    kind: Literal["fonasa", "isapre"]


class PayrollCatalogs(BaseModel):
    year: int
    verified: bool
    minimum_wage_clp: float
    uf_default_clp: float
    utm_default_clp: float
    afp_options: list[AfpOption]
    health_options: list[HealthOption]
    notes: list[str]


@router.get("/catalogs", response_model=PayrollCatalogs)
def catalogs(year: Optional[int] = None) -> PayrollCatalogs:
    selected_year = year or (max(available_years()) if available_years() else 2026)
    constants = load_for_year(selected_year)

    afps = [
        AfpOption(
            code=entry["code"],
            name=entry["name"],
            total_rate=float(entry["total_rate"]),
        )
        for entry in constants.get("afp", [])
    ]

    health_raw = constants.get("health", {}).get("providers", [])
    if not health_raw:
        health_raw = [
            {"code": "fonasa", "name": "Fonasa", "kind": "fonasa"},
        ]
    health_options = [
        HealthOption(code=h["code"], name=h["name"], kind=h["kind"])
        for h in health_raw
    ]

    notes: list[str] = []
    if not constants.get("_meta", {}).get("verified", False):
        notes.append("Constantes legales sin verificar oficialmente.")

    return PayrollCatalogs(
        year=selected_year,
        verified=bool(constants.get("_meta", {}).get("verified", False)),
        minimum_wage_clp=float(constants.get("minimum_wage_clp", 0)),
        # Defaults for UF/UTM when the JSON doesn't store them.
        uf_default_clp=float(constants.get("uf_default") or 40146.82),
        utm_default_clp=float(constants.get("utm_default") or 70588.0),
        afp_options=afps,
        health_options=health_options,
        notes=notes,
    )


class NonImponibleItemDTO(BaseModel):
    label: str
    amount_clp: float


class PreviewRequest(BaseModel):
    anchor: Literal["base", "liquido", "costo_empresa"]
    target_amount_clp: float
    contract_type: Literal["indefinite", "fixed_term", "project_based", "part_time"] = (
        "indefinite"
    )
    afp_code: str = "habitat"
    health_provider: Literal["fonasa", "isapre"] = "fonasa"
    isapre_plan_uf: float = 0.0
    year: int = 2026
    uf_value_clp: float = 40146.82
    utm_value_clp: float = 70588.0
    include_gratification: bool = True
    non_imponible_items: list[NonImponibleItemDTO] = []
    imponible_extras: list[NonImponibleItemDTO] = []
    post_tax_discounts: list[NonImponibleItemDTO] = []
    days_worked: int = 30


class PreviewResponse(BaseModel):
    anchor: str
    base_salary_clp: float
    contract_type: str
    afp_code: str
    afp_total_rate: float
    health_provider: str
    isapre_plan_uf: float
    year: int
    uf_value_clp: float
    utm_value_clp: float
    days_worked: int

    gratification_clp: float
    imponible_clp: float
    capped_imponible_afp_health_clp: float
    capped_imponible_afc_clp: float
    non_imponible_items: list[NonImponibleItemDTO]
    non_imponible_total_clp: float
    imponible_extras: list[NonImponibleItemDTO]
    imponible_extras_total_clp: float
    post_tax_discounts: list[NonImponibleItemDTO]
    post_tax_discounts_total_clp: float

    afp_employee_clp: float
    health_employee_clp: float
    unemployment_employee_clp: float
    taxable_base_clp: float
    income_tax_clp: float
    total_employee_deductions_clp: float
    net_salary_clp: float

    sis_clp: float
    mutual_clp: float
    mutual_rate: float
    afc_employer_clp: float
    ley_sanna_clp: float
    reforma_previsional_clp: float
    total_employer_extras_clp: float
    total_employer_cost_clp: float

    notes: list[str]


@router.post("/preview", response_model=PreviewResponse)
def preview(payload: PreviewRequest) -> PreviewResponse:
    if payload.target_amount_clp <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser positivo")
    non_imps = tuple(
        NonImponibleItem(label=it.label, amount_clp=it.amount_clp)
        for it in payload.non_imponible_items
    )
    imp_extras = tuple(
        ImponibleExtra(label=it.label, amount_clp=it.amount_clp)
        for it in payload.imponible_extras
    )
    post_tax = tuple(
        PostTaxDiscount(label=it.label, amount_clp=it.amount_clp)
        for it in payload.post_tax_discounts
    )
    template = PayrollInput(
        base_salary_clp=payload.target_amount_clp,
        contract_type=payload.contract_type,
        afp_code=payload.afp_code,
        health_provider=payload.health_provider,
        isapre_plan_uf=payload.isapre_plan_uf,
        year=payload.year,
        uf_value_clp=payload.uf_value_clp,
        utm_value_clp=payload.utm_value_clp,
        include_gratification=payload.include_gratification,
        non_imponible_items=non_imps,
        imponible_extras=imp_extras,
        post_tax_discounts=post_tax,
        days_worked=payload.days_worked,
        mutual_additional_rate=resolve_mutual_additional_rate(payload.year),
    )
    breakdown = solve_for_anchor(payload.anchor, payload.target_amount_clp, template)
    data = asdict(breakdown)
    # Convert nested dataclasses to plain dicts for the response model.
    for key in ("non_imponible_items", "imponible_extras", "post_tax_discounts"):
        data[key] = [
            {"label": it["label"], "amount_clp": it["amount_clp"]}
            for it in data.get(key, [])
        ]
    return PreviewResponse(anchor=payload.anchor, **data)


# ── Payslips ──────────────────────────────────────────────────────────────────


class ItemDTO(BaseModel):
    label: str
    amount_clp: float


class PayslipInputs(BaseModel):
    """Snapshot of all inputs needed to recompute a payslip."""

    base_salary_clp: float
    contract_type: str = "indefinite"
    afp_code: str = "habitat"
    health_provider: str = "fonasa"
    isapre_plan_uf: float = 0.0
    year: int = 2026
    uf_value_clp: float = 40146.82
    utm_value_clp: float = 70588.0
    include_gratification: bool = True
    non_imponible_items: list[ItemDTO] = []
    imponible_extras: list[ItemDTO] = []
    post_tax_discounts: list[ItemDTO] = []
    days_worked: int = 30
    mutual_additional_rate: float = 0.0


class PayslipBreakdown(BaseModel):
    base_salary_clp: float
    days_worked: int
    gratification_clp: float
    imponible_extras_total_clp: float
    imponible_clp: float
    non_imponible_total_clp: float
    afp_employee_clp: float
    health_employee_clp: float
    unemployment_employee_clp: float
    income_tax_clp: float
    total_employee_deductions_clp: float
    post_tax_discounts_total_clp: float
    net_salary_clp: float
    total_employer_extras_clp: float
    total_employer_cost_clp: float


class PayslipRow(BaseModel):
    id: str
    period_id: str
    employee_id: str
    employee_name: str
    cargo: Optional[str]
    status: PayslipStatus
    days_worked: int
    gross_salary_clp: Optional[float]
    net_salary_clp: Optional[float]
    employer_cost_clp: Optional[float]


class PayslipDetail(BaseModel):
    id: str
    period_id: str
    period_label: str
    employee_id: str
    employee_name: str
    cargo: Optional[str]
    status: PayslipStatus
    inputs: PayslipInputs
    breakdown: PayslipBreakdown
    issued_at: Optional[datetime]


def _full_name(emp: Employee) -> str:
    return f"{emp.first_name} {emp.last_name}".strip()


def _period_label(period: PayrollPeriod) -> str:
    months_es = [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ]
    return f"{months_es[period.month - 1].capitalize()} {period.year}"


def _days_worked_for_period(
    employee: Employee, period: PayrollPeriod
) -> int:
    """Compute working days in the period for an employee, capped at 30.

    Chilean payroll convention: every month has 30 days for proration purposes.
    - Hired during the period -> count from hire_date to end of month.
    - Terminated during the period -> count from start of month to termination_date.
    - Both events in the same period -> count between the two dates.
    - Otherwise full 30.
    """
    from datetime import date

    period_start = date(period.year, period.month, 1)
    period_end = date(period.year, period.month, 30)  # Chilean 30-day convention.

    start = max(employee.hire_date, period_start)
    end_candidate = period_end
    if employee.termination_date is not None:
        end_candidate = min(end_candidate, employee.termination_date)

    if start > end_candidate:
        return 0

    # Cap day-of-month at 30 to honor the 30-day convention.
    start_day = min(start.day, 30) if start.month == period.month else 1
    end_day = min(end_candidate.day, 30) if end_candidate.month == period.month else 30
    days = end_day - start_day + 1
    return max(0, min(30, days))


def _build_inputs_from_contract(
    contract: Contract,
    employee: Employee,
    period: Optional[PayrollPeriod] = None,
) -> dict:
    """Initial snapshot for a freshly generated payslip."""
    items_raw: list[dict] = []
    try:
        parsed = json.loads(contract.non_imponible_items_json or "[]")
        if isinstance(parsed, list):
            items_raw = [
                {"label": str(p.get("label", "")), "amount_clp": float(p.get("amount_clp", 0))}
                for p in parsed
                if isinstance(p, dict)
            ]
    except (TypeError, ValueError):
        items_raw = []

    health = (
        employee.health_provider.value
        if isinstance(employee.health_provider, HealthProvider)
        else str(employee.health_provider or "fonasa")
    )

    days = _days_worked_for_period(employee, period) if period else 30

    period_year = period.constants_year if period else 2026
    return {
        "base_salary_clp": float(contract.base_salary_clp),
        "contract_type": (
            contract.contract_type.value
            if isinstance(contract.contract_type, ContractType)
            else str(contract.contract_type or "indefinite")
        ),
        "afp_code": employee.afp_code or "habitat",
        "health_provider": health if health in ("fonasa", "isapre") else "fonasa",
        "isapre_plan_uf": 0.0,
        "year": period_year,
        "uf_value_clp": 40146.82,
        "utm_value_clp": 70588.0,
        "days_worked": days,
        "include_gratification": True,
        "non_imponible_items": items_raw,
        "imponible_extras": [],
        "post_tax_discounts": [],
        # Snapshot the Mutual cotización adicional rate at generation time so
        # the payslip is reproducible even if company settings change later.
        "mutual_additional_rate": resolve_mutual_additional_rate(period_year),
    }


def _inputs_dict_to_payroll(inputs: dict) -> PayrollInput:
    return PayrollInput(
        base_salary_clp=float(inputs.get("base_salary_clp", 0)),
        contract_type=inputs.get("contract_type", "indefinite"),  # type: ignore[arg-type]
        afp_code=inputs.get("afp_code", "habitat"),
        health_provider=inputs.get("health_provider", "fonasa"),  # type: ignore[arg-type]
        isapre_plan_uf=float(inputs.get("isapre_plan_uf", 0)),
        year=int(inputs.get("year", 2026)),
        uf_value_clp=float(inputs.get("uf_value_clp", 40146.82)),
        utm_value_clp=float(inputs.get("utm_value_clp", 70588.0)),
        include_gratification=bool(inputs.get("include_gratification", True)),
        non_imponible_items=tuple(
            NonImponibleItem(label=it["label"], amount_clp=float(it["amount_clp"]))
            for it in inputs.get("non_imponible_items", [])
            if isinstance(it, dict)
        ),
        imponible_extras=tuple(
            ImponibleExtra(label=it["label"], amount_clp=float(it["amount_clp"]))
            for it in inputs.get("imponible_extras", [])
            if isinstance(it, dict)
        ),
        post_tax_discounts=tuple(
            PostTaxDiscount(label=it["label"], amount_clp=float(it["amount_clp"]))
            for it in inputs.get("post_tax_discounts", [])
            if isinstance(it, dict)
        ),
        days_worked=int(inputs.get("days_worked", 30)),
        mutual_additional_rate=float(inputs.get("mutual_additional_rate", 0.0)),
    )


def _persist_breakdown(payslip: Payslip, breakdown: PayrollBreakdown) -> None:
    payslip.gross_salary_clp = Decimal(str(breakdown.imponible_clp))
    payslip.afp_discount_clp = Decimal(str(breakdown.afp_employee_clp))
    payslip.health_discount_clp = Decimal(str(breakdown.health_employee_clp))
    payslip.unemployment_discount_clp = Decimal(str(breakdown.unemployment_employee_clp))
    payslip.income_tax_clp = Decimal(str(breakdown.income_tax_clp))
    payslip.other_discounts_clp = Decimal(str(breakdown.post_tax_discounts_total_clp))
    payslip.net_salary_clp = Decimal(str(breakdown.net_salary_clp))
    payslip.employer_cost_clp = Decimal(str(breakdown.total_employer_cost_clp))


def _breakdown_to_dto(b: PayrollBreakdown) -> PayslipBreakdown:
    return PayslipBreakdown(
        base_salary_clp=b.base_salary_clp,
        days_worked=b.days_worked,
        gratification_clp=b.gratification_clp,
        imponible_extras_total_clp=b.imponible_extras_total_clp,
        imponible_clp=b.imponible_clp,
        non_imponible_total_clp=b.non_imponible_total_clp,
        afp_employee_clp=b.afp_employee_clp,
        health_employee_clp=b.health_employee_clp,
        unemployment_employee_clp=b.unemployment_employee_clp,
        income_tax_clp=b.income_tax_clp,
        total_employee_deductions_clp=b.total_employee_deductions_clp,
        post_tax_discounts_total_clp=b.post_tax_discounts_total_clp,
        net_salary_clp=b.net_salary_clp,
        total_employer_extras_clp=b.total_employer_extras_clp,
        total_employer_cost_clp=b.total_employer_cost_clp,
    )


def _inputs_dict_to_dto(d: dict) -> PayslipInputs:
    return PayslipInputs(
        base_salary_clp=float(d.get("base_salary_clp", 0)),
        contract_type=str(d.get("contract_type", "indefinite")),
        afp_code=str(d.get("afp_code", "habitat")),
        health_provider=str(d.get("health_provider", "fonasa")),
        isapre_plan_uf=float(d.get("isapre_plan_uf", 0)),
        year=int(d.get("year", 2026)),
        uf_value_clp=float(d.get("uf_value_clp", 40146.82)),
        utm_value_clp=float(d.get("utm_value_clp", 70588.0)),
        days_worked=int(d.get("days_worked", 30)),
        include_gratification=bool(d.get("include_gratification", True)),
        non_imponible_items=[
            ItemDTO(label=it["label"], amount_clp=float(it["amount_clp"]))
            for it in d.get("non_imponible_items", [])
            if isinstance(it, dict)
        ],
        imponible_extras=[
            ItemDTO(label=it["label"], amount_clp=float(it["amount_clp"]))
            for it in d.get("imponible_extras", [])
            if isinstance(it, dict)
        ],
        post_tax_discounts=[
            ItemDTO(label=it["label"], amount_clp=float(it["amount_clp"]))
            for it in d.get("post_tax_discounts", [])
            if isinstance(it, dict)
        ],
    )


@router.post("/periods/{period_id}/generate")
def generate_period_payslips(period_id: str) -> dict:
    """Create draft payslips for every active employee in this period.

    Idempotent: skips employees that already have a payslip in this period.
    Each new payslip captures a snapshot of the employee's current contract.
    """
    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")

        existing_employee_ids = {
            row.employee_id
            for row in session.exec(
                select(Payslip).where(Payslip.period_id == period_id)
            ).all()
        }

        employees = session.exec(
            select(Employee).where(Employee.status != EmployeeStatus.terminated)
        ).all()

        created = 0
        for emp in employees:
            if emp.id in existing_employee_ids:
                continue
            current_contract = session.exec(
                select(Contract)
                .where(Contract.employee_id == emp.id)
                .where(Contract.is_current.is_(True))
                .order_by(Contract.start_date.desc())
            ).first()
            if current_contract is None:
                continue
            inputs = _build_inputs_from_contract(current_contract, emp, period)
            payslip = Payslip(
                period_id=period_id,
                employee_id=emp.id,
                contract_id=current_contract.id,
                status=PayslipStatus.draft,
                inputs_json=json.dumps(inputs),
            )
            breakdown = compute_from_base(_inputs_dict_to_payroll(inputs))
            _persist_breakdown(payslip, breakdown)
            session.add(payslip)
            created += 1
        session.commit()

        skipped = len(existing_employee_ids)
        return {"created": created, "skipped_existing": skipped, "period_id": period_id}


@router.get("/periods/{period_id}/payslips", response_model=list[PayslipRow])
def list_period_payslips(period_id: str) -> list[PayslipRow]:
    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")
        rows = session.exec(
            select(Payslip, Employee, Contract)
            .join(Employee, Employee.id == Payslip.employee_id)
            .join(Contract, Contract.id == Payslip.contract_id)
            .where(Payslip.period_id == period_id)
            .order_by(Employee.first_name)
        ).all()
        # Backfill legacy rows (seed-created with no inputs_json or no
        # employer_cost) so the list shows correct totals on first open.
        dirty = False
        for payslip, employee, contract in rows:
            needs = (
                not payslip.inputs_json
                or payslip.inputs_json == "{}"
                or payslip.employer_cost_clp is None
            )
            if not needs:
                continue
            inputs = _build_inputs_from_contract(contract, employee, period)
            payslip.inputs_json = json.dumps(inputs)
            breakdown = compute_from_base(_inputs_dict_to_payroll(inputs))
            _persist_breakdown(payslip, breakdown)
            session.add(payslip)
            dirty = True
        if dirty:
            session.commit()
            for payslip, _, _ in rows:
                session.refresh(payslip)

        out: list[PayslipRow] = []
        for payslip, employee, contract in rows:
            try:
                days = int(json.loads(payslip.inputs_json or "{}").get("days_worked", 30))
            except (TypeError, ValueError):
                days = 30
            out.append(
                PayslipRow(
                    id=payslip.id,
                    period_id=payslip.period_id,
                    employee_id=employee.id,
                    employee_name=_full_name(employee),
                    cargo=contract.job_title,
                    status=payslip.status,
                    days_worked=days,
                    gross_salary_clp=float(payslip.gross_salary_clp)
                    if payslip.gross_salary_clp is not None
                    else None,
                    net_salary_clp=float(payslip.net_salary_clp)
                    if payslip.net_salary_clp is not None
                    else None,
                    employer_cost_clp=float(payslip.employer_cost_clp)
                    if payslip.employer_cost_clp is not None
                    else None,
                )
            )
        return out


@router.get("/payslips/{payslip_id}", response_model=PayslipDetail)
def get_payslip(payslip_id: str) -> PayslipDetail:
    with Session(engine) as session:
        payslip = session.get(Payslip, payslip_id)
        if payslip is None:
            raise HTTPException(status_code=404, detail="Liquidacion no encontrada")
        employee = session.get(Employee, payslip.employee_id)
        contract = session.get(Contract, payslip.contract_id)
        period = session.get(PayrollPeriod, payslip.period_id)
        if not employee or not contract or not period:
            raise HTTPException(status_code=500, detail="Datos relacionados ausentes")
        try:
            inputs_dict = json.loads(payslip.inputs_json or "{}")
        except (TypeError, ValueError):
            inputs_dict = {}
        if not inputs_dict:
            # Backfill on read for legacy payslips with empty snapshot.
            inputs_dict = _build_inputs_from_contract(contract, employee, period)
            payslip.inputs_json = json.dumps(inputs_dict)
            breakdown = compute_from_base(_inputs_dict_to_payroll(inputs_dict))
            _persist_breakdown(payslip, breakdown)
            session.add(payslip)
            session.commit()
        else:
            breakdown = compute_from_base(_inputs_dict_to_payroll(inputs_dict))

        return PayslipDetail(
            id=payslip.id,
            period_id=payslip.period_id,
            period_label=_period_label(period),
            employee_id=employee.id,
            employee_name=_full_name(employee),
            cargo=contract.job_title,
            status=payslip.status,
            inputs=_inputs_dict_to_dto(inputs_dict),
            breakdown=_breakdown_to_dto(breakdown),
            issued_at=payslip.issued_at,
        )


@router.post("/payslips/{payslip_id}/issue", response_model=PayslipDetail)
def issue_payslip(payslip_id: str) -> PayslipDetail:
    """Mark a draft payslip as issued. Issued payslips can no longer be edited."""
    with Session(engine) as session:
        payslip = session.get(Payslip, payslip_id)
        if payslip is None:
            raise HTTPException(status_code=404, detail="Liquidacion no encontrada")
        if payslip.status == PayslipStatus.issued:
            raise HTTPException(status_code=400, detail="Ya estaba emitida")
        payslip.status = PayslipStatus.issued
        payslip.issued_at = datetime.now(timezone.utc)
        payslip.updated_at = payslip.issued_at
        session.add(payslip)
        session.commit()
    # Return fresh detail.
    return get_payslip(payslip_id)


class ClosePeriodResponse(BaseModel):
    period_id: str
    closed_at: datetime
    issued_count: int
    already_issued_count: int


@router.post("/periods/{period_id}/close", response_model=ClosePeriodResponse)
def close_period(period_id: str) -> ClosePeriodResponse:
    """Issue all draft payslips of the period and mark the period as closed.

    After this, the Previred export becomes available and no payslip in the
    period can be modified.
    """
    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")
        if period.closed_at is not None:
            raise HTTPException(status_code=400, detail="El periodo ya esta cerrado")

        rows = session.exec(
            select(Payslip).where(Payslip.period_id == period_id)
        ).all()
        if not rows:
            raise HTTPException(
                status_code=400,
                detail="No hay liquidaciones para emitir. Genera las liquidaciones primero.",
            )

        now = datetime.now(timezone.utc)
        issued = 0
        already = 0
        for payslip in rows:
            if payslip.status == PayslipStatus.issued:
                already += 1
                continue
            payslip.status = PayslipStatus.issued
            payslip.issued_at = now
            payslip.updated_at = now
            session.add(payslip)
            issued += 1

        period.closed_at = now
        period.updated_at = now
        session.add(period)
        session.commit()

        return ClosePeriodResponse(
            period_id=period_id,
            closed_at=now,
            issued_count=issued,
            already_issued_count=already,
        )


class ReopenPeriodResponse(BaseModel):
    period_id: str
    payslips_reverted: int


@router.post("/periods/{period_id}/reopen", response_model=ReopenPeriodResponse)
def reopen_period(period_id: str) -> ReopenPeriodResponse:
    """Reopen a closed period. Reverts all its payslips back to draft so the
    user can edit them again. Use with care: any downstream export (Previred)
    that was already pulled is no longer in sync.
    """
    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")
        if period.closed_at is None:
            raise HTTPException(status_code=400, detail="El periodo no esta cerrado")

        rows = session.exec(
            select(Payslip).where(Payslip.period_id == period_id)
        ).all()
        reverted = 0
        for payslip in rows:
            if payslip.status == PayslipStatus.issued:
                payslip.status = PayslipStatus.draft
                payslip.issued_at = None
                payslip.updated_at = datetime.now(timezone.utc)
                session.add(payslip)
                reverted += 1
        period.closed_at = None
        period.updated_at = datetime.now(timezone.utc)
        session.add(period)
        session.commit()

        return ReopenPeriodResponse(period_id=period_id, payslips_reverted=reverted)


class PayslipUpdate(BaseModel):
    inputs: PayslipInputs


@router.patch("/payslips/{payslip_id}", response_model=PayslipDetail)
def update_payslip(payslip_id: str, payload: PayslipUpdate) -> PayslipDetail:
    with Session(engine) as session:
        payslip = session.get(Payslip, payslip_id)
        if payslip is None:
            raise HTTPException(status_code=404, detail="Liquidacion no encontrada")
        if payslip.status == PayslipStatus.issued:
            raise HTTPException(
                status_code=400,
                detail="La liquidacion ya esta emitida y no puede modificarse",
            )

        inputs_dict = payload.inputs.model_dump()
        breakdown = compute_from_base(_inputs_dict_to_payroll(inputs_dict))
        payslip.inputs_json = json.dumps(inputs_dict)
        _persist_breakdown(payslip, breakdown)
        payslip.updated_at = datetime.now(timezone.utc)
        session.add(payslip)
        session.commit()
        session.refresh(payslip)

        employee = session.get(Employee, payslip.employee_id)
        contract = session.get(Contract, payslip.contract_id)
        period = session.get(PayrollPeriod, payslip.period_id)
        return PayslipDetail(
            id=payslip.id,
            period_id=payslip.period_id,
            period_label=_period_label(period) if period else "",
            employee_id=employee.id if employee else "",
            employee_name=_full_name(employee) if employee else "",
            cargo=contract.job_title if contract else None,
            status=payslip.status,
            inputs=_inputs_dict_to_dto(inputs_dict),
            breakdown=_breakdown_to_dto(breakdown),
            issued_at=payslip.issued_at,
        )
