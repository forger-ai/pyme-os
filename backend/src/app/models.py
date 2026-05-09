from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import uuid4

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class EmployeeStatus(str, Enum):
    active = "active"
    on_leave = "on_leave"
    terminated = "terminated"


class ContractType(str, Enum):
    indefinite = "indefinite"
    fixed_term = "fixed_term"
    project_based = "project_based"
    part_time = "part_time"


class HealthProvider(str, Enum):
    fonasa = "fonasa"
    isapre = "isapre"


class PayslipStatus(str, Enum):
    draft = "draft"
    issued = "issued"


class VacationKind(str, Enum):
    legal = "legal"
    progressive = "progressive"
    proportional = "proportional"
    adjustment = "adjustment"


class Employee(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    rut: str = Field(index=True, unique=True)
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[date] = None
    address: Optional[str] = None
    hire_date: date
    termination_date: Optional[date] = None
    status: EmployeeStatus = Field(default=EmployeeStatus.active)
    # Org placement: free strings now; can migrate to FK entities later.
    empresa: Optional[str] = None
    division: Optional[str] = Field(default=None, index=True)
    area: Optional[str] = Field(default=None, index=True)
    subarea: Optional[str] = Field(default=None, index=True)
    manager_id: Optional[str] = Field(default=None, foreign_key="employee.id", index=True)
    afp_code: Optional[str] = None
    health_provider: HealthProvider = Field(default=HealthProvider.fonasa)
    health_plan_uf: Optional[Decimal] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Contract(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    employee_id: str = Field(foreign_key="employee.id", index=True)
    contract_type: ContractType
    start_date: date
    end_date: Optional[date] = None
    job_title: str
    base_salary_clp: Decimal
    weekly_hours: int = Field(default=45)
    # JSON-encoded list of {label, amount_clp} entries. Stored as TEXT for SQLite
    # portability. Empty list when there are no items.
    non_imponible_items_json: str = Field(
        default="[]", sa_column=Column("non_imponible_items_json", Text, nullable=False, server_default="[]")
    )
    is_current: bool = Field(default=True, index=True)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PayrollPeriod(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    year: int = Field(index=True)
    month: int = Field(index=True)
    closed_at: Optional[datetime] = None
    constants_year: int
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Payslip(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    period_id: str = Field(foreign_key="payrollperiod.id", index=True)
    employee_id: str = Field(foreign_key="employee.id", index=True)
    contract_id: str = Field(foreign_key="contract.id")
    status: PayslipStatus = Field(default=PayslipStatus.draft)
    gross_salary_clp: Optional[Decimal] = None
    afp_discount_clp: Optional[Decimal] = None
    health_discount_clp: Optional[Decimal] = None
    unemployment_discount_clp: Optional[Decimal] = None
    income_tax_clp: Optional[Decimal] = None
    other_discounts_clp: Optional[Decimal] = None
    net_salary_clp: Optional[Decimal] = None
    employer_cost_clp: Optional[Decimal] = None
    # Full snapshot of inputs used to compute this payslip:
    # base_salary_clp, contract_type, afp_code, health_provider, isapre_plan_uf,
    # non_imponible_items, imponible_extras, post_tax_discounts, uf, utm.
    # Stored as TEXT for SQLite portability.
    inputs_json: str = Field(
        default="{}",
        sa_column=Column("inputs_json", Text, nullable=False, server_default="{}"),
    )
    issued_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class VacationLedgerEntry(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    employee_id: str = Field(foreign_key="employee.id", index=True)
    kind: VacationKind
    days: Decimal
    occurred_on: date
    period_label: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class VacationRequestStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class VacationRequest(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    employee_id: str = Field(foreign_key="employee.id", index=True)
    kind: VacationKind = Field(default=VacationKind.legal)
    start_date: date
    end_date: date
    days: Decimal
    status: VacationRequestStatus = Field(
        default=VacationRequestStatus.pending, index=True
    )
    notes: Optional[str] = None
    decision_notes: Optional[str] = None
    decided_at: Optional[datetime] = None
    # Backlink to the ledger entry created on approve (for cancel/rollback later).
    ledger_entry_id: Optional[str] = Field(default=None, foreign_key="vacationledgerentry.id")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
