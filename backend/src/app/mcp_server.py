from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlmodel import Session, select

from app.constants_cl import available_years
from app.database import engine, init_db
from app.mcp_runtime import ToolError, ToolRegistry, main
from app.models import (
    Contract,
    ContractType,
    Employee,
    EmployeeStatus,
    PayrollPeriod,
    Payslip,
    VacationLedgerEntry,
    utcnow,
)
from app.routers.employees import (
    ContractRead,
    EmployeeCreate,
    EmployeeRead,
)
from app.routers.payslips import (
    PayslipRead,
    PeriodCreate,
    PeriodRead,
)
from app.routers.vacations import (
    VacationBalance,
    VacationEntryCreate,
    VacationEntryRead,
)

registry = ToolRegistry()


def _dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _require_string(args: dict[str, Any], name: str) -> str:
    value = args.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ToolError(f"{name} is required", code="invalid_input")
    return value.strip()


def _employee_read(employee: Employee) -> dict[str, Any]:
    return _dump(EmployeeRead.from_model(employee))


def _contract_read(contract: Contract) -> dict[str, Any]:
    return _dump(
        ContractRead(
            id=contract.id,
            employee_id=contract.employee_id,
            contract_type=contract.contract_type,
            start_date=contract.start_date,
            end_date=contract.end_date,
            job_title=contract.job_title,
            base_salary_clp=float(contract.base_salary_clp),
            weekly_hours=contract.weekly_hours,
            is_current=contract.is_current,
        )
    )


def _period_read(period: PayrollPeriod) -> dict[str, Any]:
    return _dump(
        PeriodRead(
            id=period.id,
            year=period.year,
            month=period.month,
            constants_year=period.constants_year,
            closed_at=period.closed_at,
        )
    )


def _payslip_read(payslip: Payslip) -> dict[str, Any]:
    return _dump(
        PayslipRead(
            id=payslip.id,
            period_id=payslip.period_id,
            employee_id=payslip.employee_id,
            status=payslip.status,
            gross_salary_clp=(
                float(payslip.gross_salary_clp)
                if payslip.gross_salary_clp is not None
                else None
            ),
            net_salary_clp=(
                float(payslip.net_salary_clp)
                if payslip.net_salary_clp is not None
                else None
            ),
        )
    )


def _vacation_entry_read(entry: VacationLedgerEntry) -> dict[str, Any]:
    return _dump(
        VacationEntryRead(
            id=entry.id,
            employee_id=entry.employee_id,
            kind=entry.kind,
            days=float(entry.days),
            occurred_on=entry.occurred_on,
            period_label=entry.period_label,
        )
    )


@registry.tool(
    "list_employees",
    "List PymeOS employees, optionally active only.",
    {
        "type": "object",
        "properties": {"active_only": {"type": "boolean"}},
        "additionalProperties": False,
    },
)
def list_employees(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    active_only = args.get("active_only") is True
    with Session(engine) as session:
        statement = select(Employee)
        if active_only:
            statement = statement.where(Employee.status == EmployeeStatus.active)
        rows = session.exec(
            statement.order_by(Employee.last_name, Employee.first_name)
        ).all()
        return {"success": True, "employees": [_employee_read(row) for row in rows]}


@registry.tool(
    "create_employee",
    "Create one PymeOS employee record.",
    {
        "type": "object",
        "properties": {
            "rut": {"type": "string"},
            "first_name": {"type": "string"},
            "last_name": {"type": "string"},
            "email": {"type": ["string", "null"]},
            "phone": {"type": ["string", "null"]},
            "hire_date": {"type": "string"},
            "afp_code": {"type": ["string", "null"]},
            "health_provider": {"type": "string", "enum": ["fonasa", "isapre"]},
        },
        "required": ["rut", "first_name", "last_name", "hire_date"],
        "additionalProperties": False,
    },
)
def create_employee(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    payload = EmployeeCreate(**args)
    with Session(engine) as session:
        existing = session.exec(
            select(Employee).where(Employee.rut == payload.rut)
        ).first()
        if existing is not None:
            raise ToolError("Employee with this RUT already exists", code="conflict")
        employee = Employee(**payload.model_dump())
        session.add(employee)
        session.commit()
        session.refresh(employee)
        return {"success": True, "employee": _employee_read(employee)}


@registry.tool(
    "get_employee",
    "Get one PymeOS employee by ID.",
    {
        "type": "object",
        "properties": {"employee_id": {"type": "string"}},
        "required": ["employee_id"],
        "additionalProperties": False,
    },
)
def get_employee(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    employee_id = _require_string(args, "employee_id")
    with Session(engine) as session:
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise ToolError("Employee not found", code="not_found")
        return {"success": True, "employee": _employee_read(employee)}


@registry.tool(
    "list_contracts",
    "List contracts for one PymeOS employee.",
    {
        "type": "object",
        "properties": {"employee_id": {"type": "string"}},
        "required": ["employee_id"],
        "additionalProperties": False,
    },
)
def list_contracts(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    employee_id = _require_string(args, "employee_id")
    with Session(engine) as session:
        if session.get(Employee, employee_id) is None:
            raise ToolError("Employee not found", code="not_found")
        rows = session.exec(
            select(Contract)
            .where(Contract.employee_id == employee_id)
            .order_by(Contract.start_date.desc())  # type: ignore[union-attr]
        ).all()
        return {"success": True, "contracts": [_contract_read(row) for row in rows]}


@registry.tool(
    "create_contract",
    "Create one contract for an existing PymeOS employee.",
    {
        "type": "object",
        "properties": {
            "employee_id": {"type": "string"},
            "contract_type": {
                "type": "string",
                "enum": ["indefinite", "fixed_term", "project_based", "part_time"],
            },
            "start_date": {"type": "string"},
            "end_date": {"type": ["string", "null"]},
            "job_title": {"type": "string"},
            "base_salary_clp": {"type": "number"},
            "weekly_hours": {"type": "number"},
            "is_current": {"type": "boolean"},
            "notes": {"type": ["string", "null"]},
        },
        "required": [
            "employee_id",
            "contract_type",
            "start_date",
            "job_title",
            "base_salary_clp",
        ],
        "additionalProperties": False,
    },
)
def create_contract(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    employee_id = _require_string(args, "employee_id")
    with Session(engine) as session:
        if session.get(Employee, employee_id) is None:
            raise ToolError("Employee not found", code="not_found")
        is_current = args.get("is_current")
        current = True if not isinstance(is_current, bool) else is_current
        if current:
            current_contracts = session.exec(
                select(Contract)
                .where(Contract.employee_id == employee_id)
                .where(Contract.is_current == True)  # noqa: E712
            ).all()
            for contract in current_contracts:
                contract.is_current = False
                contract.updated_at = utcnow()
                session.add(contract)
        contract = Contract(
            employee_id=employee_id,
            contract_type=ContractType(args["contract_type"]),
            start_date=date.fromisoformat(_require_string(args, "start_date")),
            end_date=(
                date.fromisoformat(args["end_date"])
                if isinstance(args.get("end_date"), str) and args["end_date"]
                else None
            ),
            job_title=_require_string(args, "job_title"),
            base_salary_clp=Decimal(str(args["base_salary_clp"])),
            weekly_hours=int(args.get("weekly_hours") or 45),
            is_current=current,
            notes=args.get("notes") if isinstance(args.get("notes"), str) else None,
        )
        session.add(contract)
        session.commit()
        session.refresh(contract)
        return {"success": True, "contract": _contract_read(contract)}


@registry.tool(
    "list_vacation_entries",
    "List PymeOS vacation ledger entries, optionally for one employee.",
    {
        "type": "object",
        "properties": {"employee_id": {"type": "string"}},
        "additionalProperties": False,
    },
)
def list_vacation_entries(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    employee_id = args.get("employee_id")
    with Session(engine) as session:
        statement = select(VacationLedgerEntry)
        if isinstance(employee_id, str) and employee_id.strip():
            statement = statement.where(VacationLedgerEntry.employee_id == employee_id)
        rows = session.exec(
            statement.order_by(
                VacationLedgerEntry.occurred_on.desc()  # type: ignore[union-attr]
            )
        ).all()
        return {"success": True, "entries": [_vacation_entry_read(row) for row in rows]}


@registry.tool(
    "create_vacation_entry",
    "Create one PymeOS vacation ledger entry.",
    {
        "type": "object",
        "properties": {
            "employee_id": {"type": "string"},
            "kind": {
                "type": "string",
                "enum": ["legal", "progressive", "proportional", "adjustment"],
            },
            "days": {"type": "number"},
            "occurred_on": {"type": "string"},
            "period_label": {"type": ["string", "null"]},
        },
        "required": ["employee_id", "kind", "days", "occurred_on"],
        "additionalProperties": False,
    },
)
def create_vacation_entry(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    payload = VacationEntryCreate(**args)
    with Session(engine) as session:
        if session.get(Employee, payload.employee_id) is None:
            raise ToolError("Employee not found", code="not_found")
        entry = VacationLedgerEntry(**payload.model_dump())
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return {"success": True, "entry": _vacation_entry_read(entry)}


@registry.tool(
    "get_vacation_balance",
    "Get the current naive vacation balance for one employee.",
    {
        "type": "object",
        "properties": {"employee_id": {"type": "string"}},
        "required": ["employee_id"],
        "additionalProperties": False,
    },
)
def get_vacation_balance(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    employee_id = _require_string(args, "employee_id")
    with Session(engine) as session:
        if session.get(Employee, employee_id) is None:
            raise ToolError("Employee not found", code="not_found")
        rows = session.exec(
            select(VacationLedgerEntry).where(
                VacationLedgerEntry.employee_id == employee_id
            )
        ).all()
        total = sum((row.days for row in rows), Decimal(0))
        return {
            "success": True,
            "balance": _dump(
                VacationBalance(
                    employee_id=employee_id,
                    naive_balance_days=float(total),
                )
            ),
        }


@registry.tool(
    "list_payroll_periods",
    "List PymeOS payroll periods.",
)
def list_payroll_periods(_args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    with Session(engine) as session:
        rows = session.exec(
            select(PayrollPeriod).order_by(
                PayrollPeriod.year.desc(),  # type: ignore[union-attr]
                PayrollPeriod.month.desc(),  # type: ignore[union-attr]
            )
        ).all()
        return {"success": True, "periods": [_period_read(row) for row in rows]}


@registry.tool(
    "create_payroll_period",
    "Create one PymeOS payroll period if constants exist for the selected year.",
    {
        "type": "object",
        "properties": {
            "year": {"type": "number"},
            "month": {"type": "number", "minimum": 1, "maximum": 12},
            "constants_year": {"type": "number"},
        },
        "required": ["year", "month"],
        "additionalProperties": False,
    },
)
def create_payroll_period(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    payload = PeriodCreate(**args)
    if payload.month < 1 or payload.month > 12:
        raise ToolError("month must be between 1 and 12", code="invalid_input")
    constants_year = payload.constants_year or payload.year
    if constants_year not in available_years():
        raise ToolError(
            f"No constants file for year {constants_year}",
            code="missing_constants",
        )
    with Session(engine) as session:
        existing = session.exec(
            select(PayrollPeriod)
            .where(PayrollPeriod.year == payload.year)
            .where(PayrollPeriod.month == payload.month)
        ).first()
        if existing is not None:
            raise ToolError("Period already exists", code="conflict")
        period = PayrollPeriod(
            year=payload.year,
            month=payload.month,
            constants_year=constants_year,
        )
        session.add(period)
        session.commit()
        session.refresh(period)
        return {"success": True, "period": _period_read(period)}


@registry.tool(
    "list_payslips",
    "List stored PymeOS payslips; calculation is not implemented in this version.",
    {
        "type": "object",
        "properties": {"period_id": {"type": "string"}},
        "additionalProperties": False,
    },
)
def list_payslips(args: dict[str, Any]) -> dict[str, Any]:
    init_db()
    with Session(engine) as session:
        statement = select(Payslip)
        if isinstance(args.get("period_id"), str) and args["period_id"].strip():
            statement = statement.where(Payslip.period_id == args["period_id"].strip())
        rows = session.exec(statement).all()
        return {
            "success": True,
            "payslips": [_payslip_read(row) for row in rows],
            "calculationImplemented": False,
        }


@registry.tool(
    "payroll_capability_status",
    "Return the implementation status of payroll calculation and Previred export.",
)
def payroll_capability_status(_args: dict[str, Any]) -> dict[str, Any]:
    return {
        "success": True,
        "payrollCalculation": {
            "implemented": False,
            "message": "Payroll calculation engine is not implemented in this version.",
        },
        "previredExport": {
            "implemented": False,
            "message": "Previred export is not implemented in this version.",
        },
        "availableConstantsYears": available_years(),
        "checkedAt": datetime.now(UTC).isoformat(),
    }


if __name__ == "__main__":
    from app import models as _models  # noqa: F401

    main(registry, server_name="pyme-os")
