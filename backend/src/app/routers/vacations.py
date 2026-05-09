"""Vacation ledger and request endpoints.

Two surfaces:
- Ledger: append-only record of vacation accruals/uses (legal,
  progressive, proportional, adjustment). Naive sum gives the balance.
- Requests: approval workflow. Approving a request appends a negative
  ledger entry that reduces the balance. Cancelling a previously-approved
  request reverses that ledger entry.

Note: legal vacation balance with prescription rules and progressive
vacation eligibility is NOT implemented. The "balance" exposed here is a
straight sum of the ledger.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine
from app.models import (
    Employee,
    EmployeeStatus,
    VacationKind,
    VacationLedgerEntry,
    VacationRequest,
    VacationRequestStatus,
)

router = APIRouter()


# ── Ledger (legacy, kept) ────────────────────────────────────────────────────


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
            select(VacationLedgerEntry).where(
                VacationLedgerEntry.employee_id == employee_id
            )
        ).all()
        total = sum((row.days for row in rows), Decimal(0))
        return VacationBalance(
            employee_id=employee_id, naive_balance_days=float(total)
        )


# ── Balances overview ─────────────────────────────────────────────────────────


class EmployeeBalance(BaseModel):
    employee_id: str
    employee_name: str
    cargo: Optional[str]
    accrued_days: float
    taken_days: float
    pending_days: float  # approved requests not yet "taken" (future-dated)
    balance_days: float


@router.get("/balances", response_model=list[EmployeeBalance])
def balances() -> list[EmployeeBalance]:
    """Vacation balance overview for all active employees."""
    from app.models import Contract

    with Session(engine) as session:
        employees = session.exec(
            select(Employee).where(Employee.status != EmployeeStatus.terminated)
        ).all()

        out: list[EmployeeBalance] = []
        today = date.today()
        for emp in employees:
            ledger = session.exec(
                select(VacationLedgerEntry).where(
                    VacationLedgerEntry.employee_id == emp.id
                )
            ).all()
            accrued = sum(
                (row.days for row in ledger if row.days > 0),
                Decimal(0),
            )
            taken = sum(
                (-row.days for row in ledger if row.days < 0),
                Decimal(0),
            )
            balance = sum((row.days for row in ledger), Decimal(0))

            # Approved requests in the future: count as "pending to be used".
            future_approved = session.exec(
                select(VacationRequest)
                .where(VacationRequest.employee_id == emp.id)
                .where(VacationRequest.status == VacationRequestStatus.approved)
                .where(VacationRequest.start_date > today)
            ).all()
            pending = sum(
                (req.days for req in future_approved), Decimal(0)
            )

            contract = session.exec(
                select(Contract)
                .where(Contract.employee_id == emp.id)
                .where(Contract.is_current.is_(True))
            ).first()

            out.append(
                EmployeeBalance(
                    employee_id=emp.id,
                    employee_name=f"{emp.first_name} {emp.last_name}".strip(),
                    cargo=contract.job_title if contract else None,
                    accrued_days=float(accrued),
                    taken_days=float(taken),
                    pending_days=float(pending),
                    balance_days=float(balance),
                )
            )
        out.sort(key=lambda b: b.employee_name)
        return out


# ── Vacation requests ─────────────────────────────────────────────────────────


class VacationRequestRead(BaseModel):
    id: str
    employee_id: str
    employee_name: str
    cargo: Optional[str]
    kind: VacationKind
    start_date: date
    end_date: date
    days: float
    status: VacationRequestStatus
    notes: Optional[str]
    decision_notes: Optional[str]
    decided_at: Optional[datetime]
    created_at: datetime


class VacationRequestCreate(BaseModel):
    employee_id: str
    start_date: date
    end_date: date
    days: Optional[float] = None  # Default: end - start + 1 calendar days
    kind: VacationKind = VacationKind.legal
    notes: Optional[str] = None


class VacationDecision(BaseModel):
    decision_notes: Optional[str] = None


def _to_read(req: VacationRequest, session: Session) -> VacationRequestRead:
    from app.models import Contract

    emp = session.get(Employee, req.employee_id)
    contract = (
        session.exec(
            select(Contract)
            .where(Contract.employee_id == req.employee_id)
            .where(Contract.is_current.is_(True))
        ).first()
        if emp
        else None
    )
    return VacationRequestRead(
        id=req.id,
        employee_id=req.employee_id,
        employee_name=f"{emp.first_name} {emp.last_name}".strip() if emp else "",
        cargo=contract.job_title if contract else None,
        kind=req.kind,
        start_date=req.start_date,
        end_date=req.end_date,
        days=float(req.days),
        status=req.status,
        notes=req.notes,
        decision_notes=req.decision_notes,
        decided_at=req.decided_at,
        created_at=req.created_at,
    )


class CalendarEntry(BaseModel):
    request_id: str
    employee_id: str
    employee_name: str
    cargo: Optional[str]
    start_date: date
    end_date: date
    days: float
    status: VacationRequestStatus


@router.get("/calendar", response_model=list[CalendarEntry])
def calendar(
    range_from: date = Query(..., alias="from"),
    range_to: date = Query(..., alias="to"),
) -> list[CalendarEntry]:
    """Vacation requests overlapping the given date range.

    Includes both approved and pending requests so the planner can see
    everything in flight. Cancelled and rejected are excluded.
    """
    if range_to < range_from:
        raise HTTPException(
            status_code=400, detail="range_to no puede ser anterior a range_from"
        )
    from app.models import Contract

    with Session(engine) as session:
        rows = session.exec(
            select(VacationRequest, Employee)
            .join(Employee, Employee.id == VacationRequest.employee_id)
            .where(
                VacationRequest.status.in_(
                    [
                        VacationRequestStatus.pending,
                        VacationRequestStatus.approved,
                    ]
                )
            )
            .where(VacationRequest.start_date <= range_to)
            .where(VacationRequest.end_date >= range_from)
            .order_by(Employee.first_name, VacationRequest.start_date)
        ).all()
        out: list[CalendarEntry] = []
        for req, emp in rows:
            contract = session.exec(
                select(Contract)
                .where(Contract.employee_id == emp.id)
                .where(Contract.is_current.is_(True))
            ).first()
            out.append(
                CalendarEntry(
                    request_id=req.id,
                    employee_id=emp.id,
                    employee_name=f"{emp.first_name} {emp.last_name}".strip(),
                    cargo=contract.job_title if contract else None,
                    start_date=req.start_date,
                    end_date=req.end_date,
                    days=float(req.days),
                    status=req.status,
                )
            )
        return out


@router.get("/requests", response_model=list[VacationRequestRead])
def list_requests(
    status: Optional[VacationRequestStatus] = None,
    employee_id: Optional[str] = None,
) -> list[VacationRequestRead]:
    with Session(engine) as session:
        stmt = select(VacationRequest)
        if status is not None:
            stmt = stmt.where(VacationRequest.status == status)
        if employee_id is not None:
            stmt = stmt.where(VacationRequest.employee_id == employee_id)
        stmt = stmt.order_by(VacationRequest.created_at.desc())
        rows = session.exec(stmt).all()
        return [_to_read(req, session) for req in rows]


@router.post("/requests", response_model=VacationRequestRead, status_code=201)
def create_request(payload: VacationRequestCreate) -> VacationRequestRead:
    if payload.end_date < payload.start_date:
        raise HTTPException(
            status_code=400, detail="La fecha de termino no puede ser anterior al inicio"
        )
    with Session(engine) as session:
        if session.get(Employee, payload.employee_id) is None:
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")

        days = payload.days
        if days is None or days <= 0:
            days = (payload.end_date - payload.start_date).days + 1

        req = VacationRequest(
            employee_id=payload.employee_id,
            kind=payload.kind,
            start_date=payload.start_date,
            end_date=payload.end_date,
            days=Decimal(str(days)),
            status=VacationRequestStatus.pending,
            notes=payload.notes,
        )
        session.add(req)
        session.commit()
        session.refresh(req)
        return _to_read(req, session)


@router.post("/requests/{request_id}/approve", response_model=VacationRequestRead)
def approve_request(request_id: str, payload: VacationDecision) -> VacationRequestRead:
    with Session(engine) as session:
        req = session.get(VacationRequest, request_id)
        if req is None:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if req.status != VacationRequestStatus.pending:
            raise HTTPException(
                status_code=400,
                detail=f"La solicitud esta en estado {req.status.value}, no se puede aprobar",
            )

        # Create the negative ledger entry that consumes balance.
        ledger = VacationLedgerEntry(
            employee_id=req.employee_id,
            kind=req.kind,
            days=Decimal(str(-float(req.days))),
            occurred_on=req.start_date,
            period_label=f"Solicitud {req.id[:8]}",
            notes=req.notes,
        )
        session.add(ledger)
        session.flush()

        req.status = VacationRequestStatus.approved
        req.decided_at = datetime.now(timezone.utc)
        req.decision_notes = payload.decision_notes
        req.ledger_entry_id = ledger.id
        req.updated_at = req.decided_at
        session.add(req)
        session.commit()
        session.refresh(req)
        return _to_read(req, session)


@router.post("/requests/{request_id}/reject", response_model=VacationRequestRead)
def reject_request(request_id: str, payload: VacationDecision) -> VacationRequestRead:
    with Session(engine) as session:
        req = session.get(VacationRequest, request_id)
        if req is None:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if req.status != VacationRequestStatus.pending:
            raise HTTPException(
                status_code=400,
                detail=f"La solicitud esta en estado {req.status.value}, no se puede rechazar",
            )
        req.status = VacationRequestStatus.rejected
        req.decided_at = datetime.now(timezone.utc)
        req.decision_notes = payload.decision_notes
        req.updated_at = req.decided_at
        session.add(req)
        session.commit()
        session.refresh(req)
        return _to_read(req, session)


@router.post("/requests/{request_id}/cancel", response_model=VacationRequestRead)
def cancel_request(request_id: str, payload: VacationDecision) -> VacationRequestRead:
    """Cancel a pending OR approved request. If approved, the ledger entry is
    reversed (deleted) so the balance returns to what it was before approval.
    """
    with Session(engine) as session:
        req = session.get(VacationRequest, request_id)
        if req is None:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if req.status in (
            VacationRequestStatus.rejected,
            VacationRequestStatus.cancelled,
        ):
            raise HTTPException(
                status_code=400,
                detail=f"La solicitud ya esta {req.status.value}, no se puede cancelar",
            )

        if req.status == VacationRequestStatus.approved and req.ledger_entry_id:
            ledger = session.get(VacationLedgerEntry, req.ledger_entry_id)
            if ledger is not None:
                session.delete(ledger)
            req.ledger_entry_id = None

        req.status = VacationRequestStatus.cancelled
        req.decided_at = datetime.now(timezone.utc)
        req.decision_notes = payload.decision_notes
        req.updated_at = req.decided_at
        session.add(req)
        session.commit()
        session.refresh(req)
        return _to_read(req, session)
