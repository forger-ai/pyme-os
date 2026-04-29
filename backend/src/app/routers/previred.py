"""Previred export endpoints.

This module exposes the surface of the Previred capability. The
production of the actual Previred-compatible monthly file is not
implemented in 0.1.0. When implemented, the output is a file the user
uploads manually to previred.cl; PymeOS does not call any external
service.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlmodel import Session

from app.database import engine
from app.models import PayrollPeriod

router = APIRouter()


@router.post("/{period_id}/generate", status_code=501)
def generate_previred(period_id: str) -> dict:
    """Generate a Previred-compatible monthly file for the given period.

    Not implemented in 0.1.0. Returns 501 so the frontend can surface a
    clear "exporter not yet available" state without producing a fake file.
    """
    with Session(engine) as session:
        if session.get(PayrollPeriod, period_id) is None:
            raise HTTPException(status_code=404, detail="Period not found")
        raise HTTPException(
            status_code=501,
            detail="Previred export is not implemented in this version.",
        )
