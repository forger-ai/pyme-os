"""Vacation ledger endpoints.

This module exposes the ledger surface. The legal balance computation
(progressive vacation, prescription) is not implemented in 0.1.0; the
endpoint returns the running sum of recorded ledger entries so the UI
has a number to display. The exact legal balance will be added later
and may differ from this naive sum.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import Employee, VacationKind, VacationLedgerEntry

router = APIRouter()


class VacationEntryRead(BaseModel):
    id: str
    employee_id: str
    kind: VacationKind
    days: float
    occurred_on: date
    period_label: Optional[str]


class VacationEntryCreate(BaseModel):
    employee_id: str
    kind: VacationKind
    days: Decimal
    occurred_on: date
    period_label: Optional[str] = None


class VacationBalance(BaseModel):
    employee_id: str
    naive_balance_days: float
    note: str = (
        "Naive sum of ledger entries. The legal balance, including progressive "
        "vacation and prescription rules, is not implemented in this version."
    )


@router.get("", response_model=list[VacationEntryRead])
def list_entries(employee_id: Optional[str] = None) -> list[VacationEntryRead]:
    with Session(engine) as session:
        stmt = select(VacationLedgerEntry)
        if employee_id is not None:
            stmt = stmt.where(VacationLedgerEntry.employee_id == employee_id)
        rows = session.exec(stmt).all()
        return [
            VacationEntryRead(
                id=row.id,
                employee_id=row.employee_id,
                kind=row.kind,
                days=float(row.days),
                occurred_on=row.occurred_on,
                period_label=row.period_label,
            )
            for row in rows
        ]


@router.post("", response_model=VacationEntryRead, status_code=201)
def create_entry(payload: VacationEntryCreate) -> VacationEntryRead:
    with Session(engine) as session:
        if session.get(Employee, payload.employee_id) is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        entry = VacationLedgerEntry(**payload.model_dump())
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return VacationEntryRead(
            id=entry.id,
            employee_id=entry.employee_id,
            kind=entry.kind,
            days=float(entry.days),
            occurred_on=entry.occurred_on,
            period_label=entry.period_label,
        )


@router.get("/{employee_id}/balance", response_model=VacationBalance)
def naive_balance(employee_id: str) -> VacationBalance:
    with Session(engine) as session:
        if session.get(Employee, employee_id) is None:
            raise HTTPException(status_code=404, detail="Employee not found")
        rows = session.exec(
            select(VacationLedgerEntry).where(VacationLedgerEntry.employee_id == employee_id)
        ).all()
        total = sum((row.days for row in rows), Decimal(0))
        return VacationBalance(employee_id=employee_id, naive_balance_days=float(total))
