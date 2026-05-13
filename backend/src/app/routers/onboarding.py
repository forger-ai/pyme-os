"""First-run walkthrough state.

Singleton row (`OnboardingFlag`, id=1). The frontend reads `GET /state`
on mount to decide whether to show the tour, and POSTs `/complete` when
the user finishes or dismisses it. A separate `POST /reset` makes it
easy to re-trigger the tour from the developer console while iterating.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import Session

from app.database import engine
from app.models import OnboardingFlag, utcnow

router = APIRouter()


class OnboardingState(BaseModel):
    completed: bool
    completed_at: Optional[datetime] = None


def _to_state(row: Optional[OnboardingFlag]) -> OnboardingState:
    if row is None:
        return OnboardingState(completed=False, completed_at=None)
    return OnboardingState(completed=row.completed, completed_at=row.completed_at)


@router.get("/state", response_model=OnboardingState)
def get_state() -> OnboardingState:
    with Session(engine) as session:
        return _to_state(session.get(OnboardingFlag, 1))


@router.post("/complete", response_model=OnboardingState)
def complete() -> OnboardingState:
    with Session(engine) as session:
        row = session.get(OnboardingFlag, 1) or OnboardingFlag(id=1)
        row.completed = True
        row.completed_at = utcnow()
        row.updated_at = utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return _to_state(row)


@router.post("/reset", response_model=OnboardingState)
def reset() -> OnboardingState:
    """Re-arm the tour. Useful while iterating on the walkthrough copy."""
    with Session(engine) as session:
        row = session.get(OnboardingFlag, 1) or OnboardingFlag(id=1)
        row.completed = False
        row.completed_at = None
        row.updated_at = utcnow()
        session.add(row)
        session.commit()
        session.refresh(row)
        return _to_state(row)
