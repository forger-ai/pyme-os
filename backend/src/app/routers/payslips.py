"""Payslip endpoints.

This module exposes the surface of the payroll capability. The actual
gross-to-net calculation is not implemented in 0.1.0; endpoints return
records as stored without computed amounts. When the calculation engine
is added, it will read parameters via `app.constants_cl.load_for_year`
using the `constants_year` recorded on the corresponding `PayrollPeriod`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.constants_cl import available_years, load_for_year
from app.database import engine
from app.models import PayrollPeriod, Payslip, PayslipStatus

router = APIRouter()


class PeriodRead(BaseModel):
    id: str
    year: int
    month: int
    constants_year: int
    closed_at: Optional[datetime]


class PeriodCreate(BaseModel):
    year: int
    month: int
    constants_year: Optional[int] = None


@router.get("/periods", response_model=list[PeriodRead])
def list_periods() -> list[PeriodRead]:
    with Session(engine) as session:
        rows = session.exec(select(PayrollPeriod).order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc())).all()
        return [
            PeriodRead(
                id=row.id,
                year=row.year,
                month=row.month,
                constants_year=row.constants_year,
                closed_at=row.closed_at,
            )
            for row in rows
        ]


@router.post("/periods", response_model=PeriodRead, status_code=201)
def create_period(payload: PeriodCreate) -> PeriodRead:
    if payload.month < 1 or payload.month > 12:
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")
    constants_year = payload.constants_year or payload.year
    if constants_year not in available_years():
        raise HTTPException(
            status_code=400,
            detail=f"No constants file for year {constants_year}. Add backend/config/cl/{constants_year}.json before creating this period.",
        )
    with Session(engine) as session:
        existing = session.exec(
            select(PayrollPeriod)
            .where(PayrollPeriod.year == payload.year)
            .where(PayrollPeriod.month == payload.month)
        ).first()
        if existing is not None:
            raise HTTPException(status_code=409, detail="Period already exists")
        period = PayrollPeriod(
            year=payload.year,
            month=payload.month,
            constants_year=constants_year,
        )
        session.add(period)
        session.commit()
        session.refresh(period)
        return PeriodRead(
            id=period.id,
            year=period.year,
            month=period.month,
            constants_year=period.constants_year,
            closed_at=period.closed_at,
        )


class PayslipRead(BaseModel):
    id: str
    period_id: str
    employee_id: str
    status: PayslipStatus
    gross_salary_clp: Optional[float]
    net_salary_clp: Optional[float]


@router.get("", response_model=list[PayslipRead])
def list_payslips(period_id: Optional[str] = None) -> list[PayslipRead]:
    with Session(engine) as session:
        stmt = select(Payslip)
        if period_id is not None:
            stmt = stmt.where(Payslip.period_id == period_id)
        rows = session.exec(stmt).all()
        return [
            PayslipRead(
                id=row.id,
                period_id=row.period_id,
                employee_id=row.employee_id,
                status=row.status,
                gross_salary_clp=float(row.gross_salary_clp) if row.gross_salary_clp is not None else None,
                net_salary_clp=float(row.net_salary_clp) if row.net_salary_clp is not None else None,
            )
            for row in rows
        ]


@router.post("/{period_id}/calculate", status_code=501)
def calculate_period(period_id: str) -> dict:
    """Trigger payroll calculation for a period.

    Not implemented in 0.1.0. Returns 501 so the frontend can surface a
    clear "engine not yet available" state without faking results.
    """
    with Session(engine) as session:
        period = session.get(PayrollPeriod, period_id)
        if period is None:
            raise HTTPException(status_code=404, detail="Period not found")
        load_for_year(period.constants_year)
        raise HTTPException(
            status_code=501,
            detail="Payroll calculation engine is not implemented in this version.",
        )
