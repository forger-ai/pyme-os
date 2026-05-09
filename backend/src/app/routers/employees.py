"""Employees endpoints: list with filters, enriched detail, sub-resources.

Scope of this version:
- list with column-level search, sort, pagination, total
- enriched detail with current contract, supervisor and team count
- per-employee payslips and vacation balance summary
- org chart endpoint (flat list with manager_id, frontend renders the tree)

Calculation engines (payroll, legal vacation balance) remain out of scope.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.database import engine
from app.models import (
    Contract,
    ContractType,
    Employee,
    EmployeeStatus,
    HealthProvider,
    Payslip,
    PayslipStatus,
    VacationKind,
    VacationLedgerEntry,
)

router = APIRouter()


# ── Read shapes ───────────────────────────────────────────────────────────────


class EmployeeRow(BaseModel):
    """Row shape used by the list view (one network round-trip per page)."""

    id: str
    rut: str
    first_name: str
    last_name: str
    full_name: str
    hire_date: date
    status: EmployeeStatus
    empresa: Optional[str] = None
    division: Optional[str] = None
    area: Optional[str] = None
    subarea: Optional[str] = None
    cargo: Optional[str] = None
    contract_type: Optional[ContractType] = None


class EmployeePage(BaseModel):
    items: list[EmployeeRow]
    total: int
    limit: int
    offset: int


class NonImponibleItemOut(BaseModel):
    label: str
    amount_clp: float


class CurrentContractInfo(BaseModel):
    id: str
    contract_type: ContractType
    job_title: str
    start_date: date
    end_date: Optional[date]
    weekly_hours: int
    base_salary_clp: float
    non_imponible_items: list[NonImponibleItemOut] = []


class VacationSummary(BaseModel):
    accrued_days: float
    taken_days: float
    balance_days: float
    note: str = (
        "Naive sum of ledger entries. Legal balance with progressive vacation and "
        "prescription rules is not implemented."
    )


class EmployeeDetail(BaseModel):
    id: str
    rut: str
    first_name: str
    last_name: str
    full_name: str
    email: Optional[str]
    phone: Optional[str]
    birth_date: Optional[date]
    address: Optional[str]
    hire_date: date
    termination_date: Optional[date]
    status: EmployeeStatus
    empresa: Optional[str]
    division: Optional[str]
    area: Optional[str]
    subarea: Optional[str]
    afp_code: Optional[str]
    health_provider: HealthProvider
    notes: Optional[str]
    manager_id: Optional[str]
    manager_name: Optional[str]
    direct_reports_count: int
    current_contract: Optional[CurrentContractInfo]
    vacation_summary: VacationSummary


class PayslipRow(BaseModel):
    id: str
    period_id: str
    period_label: str
    status: PayslipStatus
    gross_salary_clp: Optional[float]
    net_salary_clp: Optional[float]


class VacationEntryRow(BaseModel):
    id: str
    kind: VacationKind
    days: float
    occurred_on: date
    period_label: Optional[str]


class OrgNode(BaseModel):
    id: str
    full_name: str
    cargo: Optional[str]
    empresa: Optional[str]
    area: Optional[str]
    manager_id: Optional[str]


# ── Helpers ───────────────────────────────────────────────────────────────────


SortColumn = Literal[
    "first_name",
    "last_name",
    "rut",
    "hire_date",
    "division",
    "area",
    "subarea",
    "status",
]
SortOrder = Literal["asc", "desc"]


def _full_name(employee: Employee) -> str:
    return f"{employee.first_name} {employee.last_name}".strip()


def _current_contract(session: Session, employee_id: str) -> Optional[Contract]:
    return session.exec(
        select(Contract)
        .where(Contract.employee_id == employee_id)
        .where(Contract.is_current.is_(True))
        .order_by(Contract.start_date.desc())
    ).first()


def _vacation_summary(session: Session, employee_id: str) -> VacationSummary:
    rows = session.exec(
        select(VacationLedgerEntry).where(
            VacationLedgerEntry.employee_id == employee_id
        )
    ).all()
    accrued = sum(
        (row.days for row in rows if row.kind != VacationKind.adjustment and row.days > 0),
        Decimal(0),
    )
    taken = sum(
        (-row.days for row in rows if row.days < 0), Decimal(0)
    )
    balance = sum((row.days for row in rows), Decimal(0))
    return VacationSummary(
        accrued_days=float(accrued),
        taken_days=float(taken),
        balance_days=float(balance),
    )


# ── List ──────────────────────────────────────────────────────────────────────


@router.get("", response_model=EmployeePage)
def list_employees(
    vigentes: Optional[bool] = Query(
        default=None,
        description="True returns only employees whose status is not 'terminated'.",
    ),
    q_name: Optional[str] = Query(default=None, description="Filter by name fragment."),
    q_rut: Optional[str] = Query(default=None, description="Filter by RUT fragment."),
    q_cargo: Optional[str] = Query(default=None, description="Filter by job title fragment."),
    q_division: Optional[str] = None,
    q_area: Optional[str] = None,
    q_subarea: Optional[str] = None,
    hire_date_from: Optional[date] = None,
    hire_date_to: Optional[date] = None,
    sort: SortColumn = "first_name",
    order: SortOrder = "asc",
    limit: int = Query(default=25, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> EmployeePage:
    with Session(engine) as session:
        contract_alias = aliased(Contract)

        base_stmt = select(Employee, contract_alias).join(
            contract_alias,
            (contract_alias.employee_id == Employee.id)
            & (contract_alias.is_current.is_(True)),
            isouter=True,
        )

        if vigentes is True:
            base_stmt = base_stmt.where(Employee.status != EmployeeStatus.terminated)
        if vigentes is False:
            base_stmt = base_stmt.where(Employee.status == EmployeeStatus.terminated)
        if q_name:
            like = f"%{q_name.lower()}%"
            base_stmt = base_stmt.where(
                func.lower(Employee.first_name + " " + Employee.last_name).like(like)
            )
        if q_rut:
            base_stmt = base_stmt.where(Employee.rut.like(f"%{q_rut}%"))
        if q_cargo:
            base_stmt = base_stmt.where(
                func.lower(contract_alias.job_title).like(f"%{q_cargo.lower()}%")
            )
        if q_division:
            base_stmt = base_stmt.where(
                func.lower(Employee.division).like(f"%{q_division.lower()}%")
            )
        if q_area:
            base_stmt = base_stmt.where(
                func.lower(Employee.area).like(f"%{q_area.lower()}%")
            )
        if q_subarea:
            base_stmt = base_stmt.where(
                func.lower(Employee.subarea).like(f"%{q_subarea.lower()}%")
            )
        if hire_date_from:
            base_stmt = base_stmt.where(Employee.hire_date >= hire_date_from)
        if hire_date_to:
            base_stmt = base_stmt.where(Employee.hire_date <= hire_date_to)

        sort_columns = {
            "first_name": Employee.first_name,
            "last_name": Employee.last_name,
            "rut": Employee.rut,
            "hire_date": Employee.hire_date,
            "division": Employee.division,
            "area": Employee.area,
            "subarea": Employee.subarea,
            "status": Employee.status,
        }
        sort_col = sort_columns[sort]
        base_stmt = base_stmt.order_by(
            sort_col.desc() if order == "desc" else sort_col.asc()
        )

        # Total count (recompute the where clauses on a count statement).
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total = session.exec(count_stmt).one()
        total_value = total[0] if isinstance(total, tuple) else int(total)

        page_rows = session.exec(base_stmt.offset(offset).limit(limit)).all()
        items = [
            EmployeeRow(
                id=emp.id,
                rut=emp.rut,
                first_name=emp.first_name,
                last_name=emp.last_name,
                full_name=_full_name(emp),
                hire_date=emp.hire_date,
                status=emp.status,
                empresa=emp.empresa,
                division=emp.division,
                area=emp.area,
                subarea=emp.subarea,
                cargo=contract.job_title if contract else None,
                contract_type=contract.contract_type if contract else None,
            )
            for emp, contract in page_rows
        ]
        return EmployeePage(items=items, total=int(total_value), limit=limit, offset=offset)


# ── Export CSV ────────────────────────────────────────────────────────────────


@router.get("/export.csv")
def export_csv(vigentes: Optional[bool] = None) -> StreamingResponse:
    with Session(engine) as session:
        stmt = select(Employee)
        if vigentes is True:
            stmt = stmt.where(Employee.status != EmployeeStatus.terminated)
        if vigentes is False:
            stmt = stmt.where(Employee.status == EmployeeStatus.terminated)
        rows = session.exec(stmt).all()

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "RUT",
                "Nombre",
                "Apellido",
                "Empresa",
                "Division",
                "Area",
                "Sub-area",
                "Cargo",
                "Tipo Contrato",
                "Fecha Ingreso",
                "Estado",
            ]
        )
        for emp in rows:
            contract = _current_contract(session, emp.id)
            writer.writerow(
                [
                    emp.rut,
                    emp.first_name,
                    emp.last_name,
                    emp.empresa or "",
                    emp.division or "",
                    emp.area or "",
                    emp.subarea or "",
                    contract.job_title if contract else "",
                    contract.contract_type.value if contract else "",
                    emp.hire_date.isoformat(),
                    emp.status.value,
                ]
            )
        buffer.seek(0)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="empleados.csv"'},
        )


# ── Org chart ─────────────────────────────────────────────────────────────────


@router.get("/org-chart", response_model=list[OrgNode])
def org_chart() -> list[OrgNode]:
    with Session(engine) as session:
        rows = session.exec(
            select(Employee).where(Employee.status != EmployeeStatus.terminated)
        ).all()
        nodes: list[OrgNode] = []
        for emp in rows:
            contract = _current_contract(session, emp.id)
            nodes.append(
                OrgNode(
                    id=emp.id,
                    full_name=_full_name(emp),
                    cargo=contract.job_title if contract else None,
                    empresa=emp.empresa,
                    area=emp.area,
                    manager_id=emp.manager_id,
                )
            )
        return nodes


# ── Create ────────────────────────────────────────────────────────────────────


class NonImponibleItemIn(BaseModel):
    label: str
    amount_clp: float


class ContractInput(BaseModel):
    contract_type: ContractType = ContractType.indefinite
    job_title: str
    base_salary_clp: float
    weekly_hours: int = 45
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    non_imponible_items: list[NonImponibleItemIn] = []


class EmployeeCreate(BaseModel):
    rut: str
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    address: Optional[str] = None
    hire_date: date
    empresa: Optional[str] = None
    division: Optional[str] = None
    area: Optional[str] = None
    subarea: Optional[str] = None
    manager_id: Optional[str] = None
    afp_code: Optional[str] = None
    health_provider: HealthProvider = HealthProvider.fonasa
    contract: Optional[ContractInput] = None


def _parse_non_imponibles(raw: Optional[str]) -> list[dict]:
    """Parse the JSON string column. Returns [] on missing/invalid."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    out: list[dict] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        label = entry.get("label")
        amount = entry.get("amount_clp")
        if not isinstance(label, str) or not isinstance(amount, (int, float)):
            continue
        out.append({"label": label, "amount_clp": float(amount)})
    return out


def _serialize_non_imponibles(items: Optional[list]) -> str:
    """Normalize and JSON-encode an items list for storage."""
    if not items:
        return "[]"
    out: list[dict] = []
    for entry in items:
        if isinstance(entry, BaseModel):
            entry = entry.model_dump()
        if not isinstance(entry, dict):
            continue
        label = str(entry.get("label", "")).strip()
        try:
            amount = float(entry.get("amount_clp", 0))
        except (TypeError, ValueError):
            continue
        if not label or amount == 0:
            continue
        out.append({"label": label, "amount_clp": amount})
    return json.dumps(out)


def _normalize_rut(rut: str) -> str:
    """Normalize a Chilean RUT: strip dots, uppercase, keep dash before DV."""
    cleaned = "".join(ch for ch in rut if ch.isalnum()).upper()
    if len(cleaned) < 2:
        return rut.strip()
    return f"{cleaned[:-1]}-{cleaned[-1]}"


@router.post("", response_model=EmployeeDetail, status_code=201)
def create_employee(payload: EmployeeCreate) -> EmployeeDetail:
    with Session(engine) as session:
        normalized_rut = _normalize_rut(payload.rut)
        # Compare both raw and normalized to catch legacy formats.
        existing = session.exec(
            select(Employee).where(
                (Employee.rut == payload.rut) | (Employee.rut == normalized_rut)
            )
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Ya existe un colaborador con ese RUT")
        if payload.manager_id and not session.get(Employee, payload.manager_id):
            raise HTTPException(status_code=400, detail="El supervisor seleccionado no existe")

        emp_data = payload.model_dump(exclude={"contract"})
        emp_data["rut"] = normalized_rut
        employee = Employee(**emp_data)
        session.add(employee)
        session.commit()
        session.refresh(employee)

        if payload.contract:
            contract_in = payload.contract
            session.add(
                Contract(
                    employee_id=employee.id,
                    contract_type=contract_in.contract_type,
                    job_title=contract_in.job_title,
                    base_salary_clp=Decimal(str(contract_in.base_salary_clp)),
                    weekly_hours=contract_in.weekly_hours,
                    start_date=contract_in.start_date or employee.hire_date,
                    end_date=contract_in.end_date,
                    non_imponible_items_json=_serialize_non_imponibles(
                        contract_in.non_imponible_items
                    ),
                    is_current=True,
                )
            )
            session.commit()

        return _build_detail(session, employee)


class EmployeeUpdate(BaseModel):
    """All fields optional — partial update."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    address: Optional[str] = None
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    status: Optional[EmployeeStatus] = None
    empresa: Optional[str] = None
    division: Optional[str] = None
    area: Optional[str] = None
    subarea: Optional[str] = None
    manager_id: Optional[str] = None
    afp_code: Optional[str] = None
    health_provider: Optional[HealthProvider] = None
    notes: Optional[str] = None


@router.patch("/{employee_id}", response_model=EmployeeDetail)
def update_employee(employee_id: str, payload: EmployeeUpdate) -> EmployeeDetail:
    with Session(engine) as session:
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")

        data = payload.model_dump(exclude_unset=True)
        if "manager_id" in data and data["manager_id"] is not None:
            if data["manager_id"] == employee_id:
                raise HTTPException(
                    status_code=400, detail="Un colaborador no puede ser su propio supervisor"
                )
            if not session.get(Employee, data["manager_id"]):
                raise HTTPException(
                    status_code=400, detail="El supervisor seleccionado no existe"
                )

        for field, value in data.items():
            setattr(employee, field, value)

        employee.updated_at = datetime.now(timezone.utc)
        session.add(employee)
        session.commit()
        session.refresh(employee)
        return _build_detail(session, employee)


class ContractUpdate(BaseModel):
    """Update fields of an existing contract. All optional."""

    contract_type: Optional[ContractType] = None
    job_title: Optional[str] = None
    base_salary_clp: Optional[float] = None
    weekly_hours: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    non_imponible_items: Optional[list[NonImponibleItemIn]] = None


@router.patch("/{employee_id}/current-contract", response_model=EmployeeDetail)
def update_current_contract(employee_id: str, payload: ContractUpdate) -> EmployeeDetail:
    """Update the current contract of an employee, or create one if missing."""
    with Session(engine) as session:
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")
        contract = _current_contract(session, employee_id)
        data = payload.model_dump(exclude_unset=True)

        if contract is None:
            # Promote to a new current contract if minimal fields are present.
            if "job_title" not in data or "base_salary_clp" not in data:
                raise HTTPException(
                    status_code=400,
                    detail="Para crear el contrato vigente se requieren al menos job_title y base_salary_clp",
                )
            contract = Contract(
                employee_id=employee_id,
                contract_type=data.get("contract_type", ContractType.indefinite),
                job_title=data["job_title"],
                base_salary_clp=Decimal(str(data["base_salary_clp"])),
                weekly_hours=data.get("weekly_hours", 45),
                start_date=data.get("start_date") or employee.hire_date,
                end_date=data.get("end_date"),
                non_imponible_items_json=_serialize_non_imponibles(
                    data.get("non_imponible_items")
                ),
                is_current=True,
            )
            session.add(contract)
        else:
            for field, value in data.items():
                if field == "base_salary_clp":
                    contract.base_salary_clp = Decimal(str(value))
                elif field == "non_imponible_items":
                    contract.non_imponible_items_json = _serialize_non_imponibles(value)
                else:
                    setattr(contract, field, value)
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)

        session.commit()
        session.refresh(employee)
        return _build_detail(session, employee)


# ── Detail and sub-resources ─────────────────────────────────────────────────


def _build_detail(session: Session, employee: Employee) -> EmployeeDetail:
    contract = _current_contract(session, employee.id)
    manager_name: Optional[str] = None
    if employee.manager_id:
        manager = session.get(Employee, employee.manager_id)
        if manager:
            manager_name = _full_name(manager)
    direct_reports_count = session.exec(
        select(func.count())
        .select_from(Employee)
        .where(Employee.manager_id == employee.id)
        .where(Employee.status != EmployeeStatus.terminated)
    ).one()
    direct_reports_value = (
        direct_reports_count[0]
        if isinstance(direct_reports_count, tuple)
        else int(direct_reports_count)
    )

    current_contract_info = None
    if contract:
        items_raw = _parse_non_imponibles(contract.non_imponible_items_json)
        current_contract_info = CurrentContractInfo(
            id=contract.id,
            contract_type=contract.contract_type,
            job_title=contract.job_title,
            start_date=contract.start_date,
            end_date=contract.end_date,
            weekly_hours=contract.weekly_hours,
            base_salary_clp=float(contract.base_salary_clp),
            non_imponible_items=[
                NonImponibleItemOut(**it) for it in items_raw
            ],
        )

    return EmployeeDetail(
        id=employee.id,
        rut=employee.rut,
        first_name=employee.first_name,
        last_name=employee.last_name,
        full_name=_full_name(employee),
        email=employee.email,
        phone=employee.phone,
        birth_date=employee.birth_date,
        address=employee.address,
        hire_date=employee.hire_date,
        termination_date=employee.termination_date,
        status=employee.status,
        empresa=employee.empresa,
        division=employee.division,
        area=employee.area,
        subarea=employee.subarea,
        afp_code=employee.afp_code,
        health_provider=employee.health_provider,
        notes=employee.notes,
        manager_id=employee.manager_id,
        manager_name=manager_name,
        direct_reports_count=int(direct_reports_value),
        current_contract=current_contract_info,
        vacation_summary=_vacation_summary(session, employee.id),
    )


@router.get("/{employee_id}", response_model=EmployeeDetail)
def get_employee(employee_id: str) -> EmployeeDetail:
    with Session(engine) as session:
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        return _build_detail(session, employee)


@router.get("/{employee_id}/payslips", response_model=list[PayslipRow])
def list_employee_payslips(employee_id: str) -> list[PayslipRow]:
    with Session(engine) as session:
        if session.get(Employee, employee_id) is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        from app.models import PayrollPeriod

        rows = session.exec(
            select(Payslip, PayrollPeriod)
            .join(PayrollPeriod, PayrollPeriod.id == Payslip.period_id)
            .where(Payslip.employee_id == employee_id)
            .order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc())
        ).all()
        return [
            PayslipRow(
                id=payslip.id,
                period_id=payslip.period_id,
                period_label=f"{period.month:02d}-{period.year}",
                status=payslip.status,
                gross_salary_clp=float(payslip.gross_salary_clp)
                if payslip.gross_salary_clp is not None
                else None,
                net_salary_clp=float(payslip.net_salary_clp)
                if payslip.net_salary_clp is not None
                else None,
            )
            for payslip, period in rows
        ]


@router.get("/{employee_id}/vacations", response_model=list[VacationEntryRow])
def list_employee_vacations(employee_id: str) -> list[VacationEntryRow]:
    with Session(engine) as session:
        if session.get(Employee, employee_id) is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        rows = session.exec(
            select(VacationLedgerEntry)
            .where(VacationLedgerEntry.employee_id == employee_id)
            .order_by(VacationLedgerEntry.occurred_on.desc())
        ).all()
        return [
            VacationEntryRow(
                id=row.id,
                kind=row.kind,
                days=float(row.days),
                occurred_on=row.occurred_on,
                period_label=row.period_label,
            )
            for row in rows
        ]


# ── Contracts (kept for backwards compat) ────────────────────────────────────


class ContractRead(BaseModel):
    id: str
    employee_id: str
    contract_type: ContractType
    start_date: date
    end_date: Optional[date]
    job_title: str
    base_salary_clp: float
    weekly_hours: int
    is_current: bool


@router.get("/{employee_id}/contracts", response_model=list[ContractRead])
def list_contracts(employee_id: str) -> list[ContractRead]:
    with Session(engine) as session:
        rows = session.exec(
            select(Contract).where(Contract.employee_id == employee_id)
        ).all()
        return [
            ContractRead(
                id=row.id,
                employee_id=row.employee_id,
                contract_type=row.contract_type,
                start_date=row.start_date,
                end_date=row.end_date,
                job_title=row.job_title,
                base_salary_clp=float(row.base_salary_clp),
                weekly_hours=row.weekly_hours,
                is_current=row.is_current,
            )
            for row in rows
        ]
