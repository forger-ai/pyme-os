"""Previred export endpoints.

Generates an audit-friendly CSV with the cotizaciones data for a closed
period. The user is expected to use this CSV to validate / fill in the
official Previred template at previred.cl. PymeOS does NOT call any
external service.

NOT included in this version:
- The official Previred fixed-width text format with institutional codes
  (AFP code, Isapre code, Mutual code, etc.). Those mappings are TODO.
"""

from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.constants_cl import load_for_year
from app.database import engine
from app.models import Contract, Employee, PayrollPeriod, Payslip, PayslipStatus

router = APIRouter()


_MONTHS_ES = [
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


def _parse_inputs(payslip: Payslip) -> dict:
    try:
        data = json.loads(payslip.inputs_json or "{}")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _institutional_codes(year: int) -> dict:
    """Build code lookups: {kind: {our_code: previred_code}} plus defaults."""
    constants = load_for_year(year)
    out: dict = {"afp": {}, "health": {}, "mutual": {}, "caja": {}}
    for entry in constants.get("afp", []):
        out["afp"][entry["code"]] = str(entry.get("previred_code") or "00")
    for entry in constants.get("health", {}).get("providers", []):
        out["health"][entry["code"]] = str(entry.get("previred_code") or "00")
    mutual_section = constants.get("mutual", {})
    for entry in mutual_section.get("providers", []):
        out["mutual"][entry["code"]] = str(entry.get("previred_code") or "00")
    out["mutual_default"] = next(
        (
            str(p.get("previred_code") or "00")
            for p in mutual_section.get("providers", [])
            if p.get("code") == mutual_section.get("default_code")
        ),
        "00",
    )
    caja_section = constants.get("caja_compensacion", {})
    for entry in caja_section.get("providers", []):
        out["caja"][entry["code"]] = str(entry.get("previred_code") or "00")
    out["caja_default"] = next(
        (
            str(p.get("previred_code") or "00")
            for p in caja_section.get("providers", [])
            if p.get("code") == caja_section.get("default_code")
        ),
        "00",
    )
    return out


def _split_rut(rut: str) -> tuple[str, str]:
    """Return (digits-only body, single DV) or ('', '') if malformed."""
    cleaned = "".join(ch for ch in rut if ch.isalnum()).upper()
    if len(cleaned) < 2:
        return "", ""
    return cleaned[:-1], cleaned[-1]


@router.get("/closed-periods")
def list_closed_periods() -> list[dict]:
    """List periods that are closed and ready to export Previred."""
    with Session(engine) as session:
        rows = session.exec(
            select(PayrollPeriod)
            .where(PayrollPeriod.closed_at.is_not(None))
            .order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc())
        ).all()
        return [
            {
                "id": p.id,
                "year": p.year,
                "month": p.month,
                "label": f"{_MONTHS_ES[p.month - 1].capitalize()} {p.year}",
                "closed_at": p.closed_at.isoformat() if p.closed_at else None,
            }
            for p in rows
        ]


@router.get("/{period_id}/export.csv")
def export_csv(period_id: str) -> StreamingResponse:
    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")
        if period.closed_at is None:
            raise HTTPException(
                status_code=400,
                detail="El periodo aun no esta cerrado. Cierra el periodo antes de exportar Previred.",
            )

        rows = session.exec(
            select(Payslip, Employee, Contract)
            .join(Employee, Employee.id == Payslip.employee_id)
            .join(Contract, Contract.id == Payslip.contract_id)
            .where(Payslip.period_id == period_id)
            .where(Payslip.status == PayslipStatus.issued)
            .order_by(Employee.first_name)
        ).all()

        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=";")  # Previred convention: semicolon
        writer.writerow(
            [
                "RUT",
                "Apellido",
                "Nombre",
                "Dias trabajados",
                "AFP",
                "Tipo Salud",
                "Imponible AFP/Salud",
                "Imponible AFC",
                "Cotizacion AFP",
                "Cotizacion Salud",
                "Seguro Cesantia trabajador",
                "Impuesto Unico",
                "Total descuentos trabajador",
                "Liquido a pagar",
                "Costo total empresa",
            ]
        )

        for payslip, employee, _contract in rows:
            inputs = _parse_inputs(payslip)
            afp_code = inputs.get("afp_code", employee.afp_code or "")
            health = inputs.get(
                "health_provider",
                employee.health_provider.value if employee.health_provider else "fonasa",
            )
            dias = int(inputs.get("days_worked", 30))
            writer.writerow(
                [
                    employee.rut,
                    employee.last_name,
                    employee.first_name,
                    dias,
                    afp_code,
                    health,
                    int(payslip.gross_salary_clp or 0),
                    int(payslip.gross_salary_clp or 0),
                    int(payslip.afp_discount_clp or 0),
                    int(payslip.health_discount_clp or 0),
                    int(payslip.unemployment_discount_clp or 0),
                    int(payslip.income_tax_clp or 0),
                    int(
                        (payslip.afp_discount_clp or 0)
                        + (payslip.health_discount_clp or 0)
                        + (payslip.unemployment_discount_clp or 0)
                        + (payslip.income_tax_clp or 0)
                    ),
                    int(payslip.net_salary_clp or 0),
                    int(payslip.employer_cost_clp or 0),
                ]
            )

        buffer.seek(0)
        filename = f"previred_{period.year}_{period.month:02d}.csv"
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


# ── Posicional (formato Previred simplificado) ───────────────────────────────


def _pad(value: str, length: int, side: str = "right", fill: str = " ") -> str:
    """Pad/truncate a string to exactly `length` chars."""
    s = str(value)[:length]
    if side == "left":
        return s.rjust(length, fill)
    return s.ljust(length, fill)


def _pad_int(value: int, length: int) -> str:
    return _pad(str(int(value)), length, side="left", fill="0")


@router.get("/{period_id}/export.txt")
def export_txt(period_id: str) -> StreamingResponse:
    """Genera el archivo posicional Previred del periodo.

    Usa los codigos institucionales (AFP, Isapre, Mutual, Caja Compensacion)
    cargados en las constantes anuales. El archivo no incluye lineas de
    cabecera: cada linea corresponde a un trabajador y puede subirse
    directamente a previred.cl. La especificacion oficial tiene mas campos
    (APV, cargas familiares con tramos, datos de extranjeros, cargas
    invalidas, etc.). Los que no modelamos quedan en 0 o en blanco.
    """
    from app.constants_cl import load_for_year as _load_constants

    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Periodo no encontrado")
        if period.closed_at is None:
            raise HTTPException(
                status_code=400,
                detail="El periodo aun no esta cerrado.",
            )

        codes = _institutional_codes(period.constants_year)
        rows = session.exec(
            select(Payslip, Employee, Contract)
            .join(Employee, Employee.id == Payslip.employee_id)
            .join(Contract, Contract.id == Payslip.contract_id)
            .where(Payslip.period_id == period_id)
            .where(Payslip.status == PayslipStatus.issued)
            .order_by(Employee.first_name)
        ).all()

        # Periodo en formato ddmmyyyy (Previred espera fechas concretas).
        from datetime import date as _date, timedelta as _td

        period_start = _date(period.year, period.month, 1)
        next_month_first = (
            _date(period.year + 1, 1, 1)
            if period.month == 12
            else _date(period.year, period.month + 1, 1)
        )
        period_end = next_month_first - _td(days=1)

        period_from_str = period_start.strftime("%d%m%Y")
        period_to_str = period_end.strftime("%d%m%Y")

        # Constants for employer-side amounts.
        constants = _load_constants(period.constants_year)
        ui_rates = {**constants.get("employer_extras", {})}
        sis_rate = float(ui_rates.get("sis", 0.0162))
        ui_unemp = constants.get("unemployment_insurance", {})

        lines: list[str] = []

        for payslip, employee, _contract in rows:
            inputs = _parse_inputs(payslip)
            rut_body, rut_dv = _split_rut(employee.rut)

            afp_local = inputs.get("afp_code", employee.afp_code or "habitat")
            afp_code = codes["afp"].get(afp_local, "00")
            health_local = inputs.get("health_provider", "fonasa")
            health_code = codes["health"].get(health_local, "00")

            days_worked = int(inputs.get("days_worked", 30))
            imponible = int(payslip.gross_salary_clp or 0)
            contract_kind = str(inputs.get("contract_type", "indefinite"))
            afc_emp_employer_rate = float(
                (ui_unemp.get(contract_kind) or {}).get("employer", 0.0)
            )
            sis_amount = int(round(imponible * sis_rate))
            afc_employer_amount = int(round(imponible * afc_emp_employer_rate))

            # Plan de salud en pesos (si Isapre con plan UF se cobra ese; si Fonasa, 7%).
            isapre_plan_uf = float(inputs.get("isapre_plan_uf", 0))
            uf_value = float(inputs.get("uf_value_clp", 40146.82))
            plan_pactado_pesos = int(round(isapre_plan_uf * uf_value)) if isapre_plan_uf > 0 else 0

            mutual_code = codes.get("mutual_default", "00")
            caja_code = codes.get("caja_default", "00")

            # ── Layout posicional (campos numericos: zero-pad izquierda;
            #    campos texto: blank-pad derecha) ───────────────────────────────
            line = (
                # Identificacion (74 chars)
                _pad(rut_body, 10, side="left", fill="0")          # RUT cuerpo
                + _pad(rut_dv, 1)                                  # DV
                + _pad(employee.last_name or "", 30)               # Apellido paterno
                + _pad("", 30)                                     # Apellido materno (no modelado)
                + _pad(employee.first_name or "", 30)              # Nombres
                + "N"                                              # Sexo (M/F/N)
                + "CHL"                                            # Nacionalidad ISO3
                + "1"                                              # Tipo pago (1=mensual)
                # Periodo (24 chars)
                + period_from_str                                  # Periodo desde ddmmyyyy
                + period_to_str                                    # Periodo hasta ddmmyyyy
                + ("A" if afp_code != "00" else "I")               # Regimen previsional
                + "0"                                              # Tipo trabajador (0=Activo)
                + _pad_int(days_worked, 2)                         # Dias trabajados
                # Cargas familiares (no modelado: ceros)
                + "0"                                              # Tramo asignacion familiar
                + _pad_int(0, 2)                                   # Numero cargas
                + _pad_int(0, 2)                                   # Cargas maternales
                + _pad_int(0, 2)                                   # Cargas invalidas
                + _pad_int(0, 8)                                   # Asignacion familiar pesos
                # AFP
                + _pad(afp_code, 2)                                # Codigo AFP
                + _pad_int(imponible, 9)                           # Renta imponible AFP
                + _pad_int(int(payslip.afp_discount_clp or 0), 9)  # Cotizacion obligatoria AFP
                + _pad_int(sis_amount, 9)                          # Cotizacion SIS (empleador)
                + _pad_int(0, 9)                                   # Aporte indemn (no modelado)
                + _pad_int(0, 9)                                   # Renta APV
                + _pad_int(0, 9)                                   # Cotizacion APV
                # Salud
                + _pad(health_code, 2)                             # Codigo institucion salud
                + _pad_int(imponible, 9)                           # Renta imponible salud
                + _pad_int(plan_pactado_pesos, 9)                  # Plan pactado en pesos
                + _pad_int(int(payslip.health_discount_clp or 0), 9)  # Cot obligatoria salud
                + _pad_int(0, 9)                                   # Cot adicional voluntaria
                + _pad_int(0, 9)                                   # GES
                # AFC
                + ("I" if contract_kind == "indefinite" else "P")  # Tipo contrato AFC (I/P)
                + _pad_int(imponible, 9)                           # Renta imponible AFC
                + _pad_int(int(payslip.unemployment_discount_clp or 0), 9)  # Aporte trabajador AFC
                + _pad_int(afc_employer_amount, 9)                 # Aporte empleador AFC
                # CCAF (Caja de Compensacion)
                + _pad(caja_code, 2)                               # Codigo CCAF
                + _pad_int(0, 9)                                   # Cotizacion CCAF
                # Mutual
                + _pad(mutual_code, 2)                             # Codigo Mutual
                + _pad_int(0, 9)                                   # Cotizacion Mutual (lo asume el sistema)
                # Tributario y liquido
                + _pad_int(int(payslip.income_tax_clp or 0), 9)    # Impuesto unico
                + _pad_int(int(payslip.net_salary_clp or 0), 9)    # Liquido
            )
            lines.append(line)

        body = "\r\n".join(lines) + "\r\n"
        filename = f"previred_{period.year}_{period.month:02d}.txt"
        return StreamingResponse(
            iter([body]),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
