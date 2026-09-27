"""Company-level settings: economic activity (rubro) and Mutual rate.

The settings live in a single row (`CompanySettings`, id=1). When the row
does not exist yet, GET returns sensible defaults so the UI does not need
special-casing. The Mutual cotización adicional rate is resolved from
this module so payroll routers can call `resolve_mutual_additional_rate`
without duplicating fallback logic.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.constants_cl import available_years, load_for_year
from app.database import engine
from app.models import CompanySettings, utcnow

router = APIRouter()


OTHER_ACTIVITY_CODE = "otro"


class EconomicActivity(BaseModel):
    code: str
    name: str
    additional_rate: float
    ciiu_section: Optional[str] = None
    examples: Optional[str] = None


class CompanySettingsRead(BaseModel):
    economic_activity_code: Optional[str] = None
    mutual_additional_rate_override: Optional[float] = None
    # Effective rate currently applied (decimal, e.g. 0.017). Resolved from
    # the catalog entry or the manual override; 0 when nothing is configured.
    effective_mutual_additional_rate: float
    # Sum of base Mutual + cotización adicional, for display in the UI.
    effective_mutual_rate: float
    activities: list[EconomicActivity]
    additional_rate_tiers: list[float]


class CompanySettingsUpdate(BaseModel):
    economic_activity_code: Optional[str] = None
    mutual_additional_rate_override: Optional[float] = Field(
        default=None,
        ge=0,
        le=0.10,
        description="Tasa decimal (0,0170 = 1,70%). Solo se usa cuando el código es 'otro'.",
    )


def _load_mutual_config(year: Optional[int] = None) -> dict:
    selected_year = year or (max(available_years()) if available_years() else 2026)
    return load_for_year(selected_year).get("mutual", {})


def _mutual_base_rate(year: Optional[int] = None) -> float:
    selected_year = year or (max(available_years()) if available_years() else 2026)
    constants = load_for_year(selected_year)
    return float(constants.get("employer_extras", {}).get("mutual_base", 0.0093))


def _resolve_rate_from_settings(
    settings: Optional[CompanySettings], mutual_cfg: dict
) -> float:
    if settings is None or not settings.economic_activity_code:
        return 0.0
    if settings.economic_activity_code == OTHER_ACTIVITY_CODE:
        return float(settings.mutual_additional_rate_override or 0)
    for entry in mutual_cfg.get("economic_activities", []):
        if entry["code"] == settings.economic_activity_code:
            return float(entry["additional_rate"])
    return 0.0


def resolve_mutual_additional_rate(year: Optional[int] = None) -> float:
    """Return the cotización adicional rate for the current company settings.

    Returns 0.0 when no row exists yet or the configured code is unknown.
    Other routers should call this so the rate stays in one place.
    """
    mutual_cfg = _load_mutual_config(year)
    with Session(engine) as session:
        settings = session.get(CompanySettings, 1)
        return _resolve_rate_from_settings(settings, mutual_cfg)


def _build_read(
    settings: Optional[CompanySettings], year: Optional[int] = None
) -> CompanySettingsRead:
    mutual_cfg = _load_mutual_config(year)
    additional = _resolve_rate_from_settings(settings, mutual_cfg)
    base = _mutual_base_rate(year)
    activities = [
        EconomicActivity(
            code=entry["code"],
            name=entry["name"],
            additional_rate=float(entry["additional_rate"]),
            ciiu_section=entry.get("ciiu_section"),
            examples=entry.get("examples"),
        )
        for entry in mutual_cfg.get("economic_activities", [])
    ]
    tiers = [float(t) for t in mutual_cfg.get("additional_rate_tiers", [])]
    return CompanySettingsRead(
        economic_activity_code=settings.economic_activity_code if settings else None,
        mutual_additional_rate_override=(
            float(settings.mutual_additional_rate_override)
            if settings and settings.mutual_additional_rate_override is not None
            else None
        ),
        effective_mutual_additional_rate=additional,
        effective_mutual_rate=base + additional,
        activities=activities,
        additional_rate_tiers=tiers,
    )


@router.get("/company", response_model=CompanySettingsRead)
def get_company_settings() -> CompanySettingsRead:
    with Session(engine) as session:
        settings = session.get(CompanySettings, 1)
        return _build_read(settings)


@router.patch("/company", response_model=CompanySettingsRead)
def update_company_settings(payload: CompanySettingsUpdate) -> CompanySettingsRead:
    mutual_cfg = _load_mutual_config()
    valid_codes = {e["code"] for e in mutual_cfg.get("economic_activities", [])} | {
        OTHER_ACTIVITY_CODE
    }
    if payload.economic_activity_code is not None:
        if payload.economic_activity_code not in valid_codes:
            raise HTTPException(
                status_code=400,
                detail=f"Rubro desconocido: {payload.economic_activity_code}",
            )
    if (
        payload.economic_activity_code == OTHER_ACTIVITY_CODE
        and payload.mutual_additional_rate_override is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Cuando el rubro es 'otro' debes informar la tasa adicional",
        )
    with Session(engine) as session:
        settings = session.get(CompanySettings, 1)
        if settings is None:
            settings = CompanySettings(id=1)
        if payload.economic_activity_code is not None:
            settings.economic_activity_code = payload.economic_activity_code
            # Clear override when switching to a catalog code.
            if payload.economic_activity_code != OTHER_ACTIVITY_CODE:
                settings.mutual_additional_rate_override = None
        if payload.mutual_additional_rate_override is not None:
            settings.mutual_additional_rate_override = Decimal(
                str(payload.mutual_additional_rate_override)
            )
        settings.updated_at = utcnow()
        session.add(settings)
        session.commit()
        session.refresh(settings)
        return _build_read(settings)
