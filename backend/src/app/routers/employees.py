"""Employees and contracts endpoints.

Scope of this version: list, create, and fetch employee records and their
current contract. The CRUD shape is intentionally minimal so the frontend
shell has live endpoints to call before the calculation layer is added.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Contract, ContractType, Employee, EmployeeStatus, HealthProvider

router = APIRouter()


class EmployeeRead(BaseModel):
    id: str
    rut: str
    first_name: str
    last_name: str
    email: Optional[str] = None
    hire_date: date
    status: EmployeeStatus

    @classmethod
    def from_model(cls, employee: Employee) -> "EmployeeRead":
        return cls(
            id=employee.id,
            rut=employee.rut,
            first_name=employee.first_name,
            last_name=employee.last_name,
            email=employee.email,
            hire_date=employee.hire_date,
            status=employee.status,
        )


class EmployeeCreate(BaseModel):
    rut: str
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    hire_date: date
    afp_code: Optional[str] = None
    health_provider: HealthProvider = HealthProvider.fonasa


@router.get("", response_model=list[EmployeeRead])
def list_employees(active_only: bool = False) -> list[EmployeeRead]:
    with Session(engine) as session:
        stmt = select(Employee)
        if active_only:
            stmt = stmt.where(Employee.status == EmployeeStatus.active)
        rows = session.exec(stmt).all()
        return [EmployeeRead.from_model(row) for row in rows]


@router.post("", response_model=EmployeeRead, status_code=201)
def create_employee(payload: EmployeeCreate) -> EmployeeRead:
    with Session(engine) as session:
        existing = session.exec(
            select(Employee).where(Employee.rut == payload.rut)
        ).first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Employee with this RUT already exists")
        employee = Employee(**payload.model_dump())
        session.add(employee)
        session.commit()
        session.refresh(employee)
        return EmployeeRead.from_model(employee)


@router.get("/{employee_id}", response_model=EmployeeRead)
def get_employee(employee_id: str) -> EmployeeRead:
    with Session(engine) as session:
        employee = session.get(Employee, employee_id)
        if employee is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        return EmployeeRead.from_model(employee)


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
