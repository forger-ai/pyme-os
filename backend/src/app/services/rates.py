"""UF / UTM rate fetcher and cache.

Pulls the latest UF and UTM values from mindicador.cl (free, no auth) and
stores them in `IndicatorSnapshot`. Payroll code reads through
`get_current_rates`, which falls back to the year's JSON defaults when the
DB has no snapshot yet — that way a brand-new install still computes
something sensible without a network call.

Why mindicador.cl: it is the lowest-friction option (no API key, public,
returns both UF and UTM, stable since 2017). The CMF official API requires
a per-user API key; SII publishes only HTML and would require scraping.
For local-first this trade-off is right.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, Optional

import httpx
from sqlmodel import Session

from app.constants_cl import available_years, load_for_year
from app.database import engine
from app.models import IndicatorSnapshot, utcnow

MINDICADOR_BASE = "https://mindicador.cl/api"
SUPPORTED_CODES = ("uf", "utm")
DEFAULT_SOURCE = "mindicador.cl"


@dataclass(frozen=True)
class RateSnapshot:
    code: str
    value_clp: Decimal
    snapshot_date: date
    source: str
    fetched_at: datetime


def _json_defaults(year: Optional[int] = None) -> dict:
    selected_year = year or (max(available_years()) if available_years() else 2026)
    return load_for_year(selected_year)


def _default_rate(code: str, year: Optional[int] = None) -> Decimal:
    constants = _json_defaults(year)
    key = "uf_default" if code == "uf" else "utm_default"
    return Decimal(str(constants.get(key, 0)))


def _to_snapshot(row: IndicatorSnapshot) -> RateSnapshot:
    return RateSnapshot(
        code=row.code,
        value_clp=row.value_clp,
        snapshot_date=row.snapshot_date,
        source=row.source,
        fetched_at=row.fetched_at,
    )


def get_cached_snapshot(code: str) -> Optional[RateSnapshot]:
    with Session(engine) as session:
        row = session.get(IndicatorSnapshot, code)
        return _to_snapshot(row) if row else None


def get_current_value(code: str, year: Optional[int] = None) -> Decimal:
    """Return the cached UF/UTM, or the JSON default if no snapshot exists.

    Payroll routers should call this rather than touching IndicatorSnapshot
    directly so the fallback stays in one place.
    """
    snap = get_cached_snapshot(code)
    if snap is not None:
        return snap.value_clp
    return _default_rate(code, year)


def get_current_rates(year: Optional[int] = None) -> tuple[Decimal, Decimal]:
    return get_current_value("uf", year), get_current_value("utm", year)


class RateFetchError(RuntimeError):
    """Raised when mindicador.cl is unreachable or returns malformed data."""


async def _fetch_one(client: httpx.AsyncClient, code: str) -> RateSnapshot:
    if code not in SUPPORTED_CODES:
        raise RateFetchError(f"Indicador no soportado: {code}")
    try:
        response = await client.get(f"{MINDICADOR_BASE}/{code}", timeout=10.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RateFetchError(f"No se pudo consultar {code} en mindicador.cl: {exc}") from exc
    payload = response.json()
    series = payload.get("serie") or []
    if not isinstance(series, list) or not series:
        raise RateFetchError(f"Respuesta inesperada de mindicador.cl para {code}")
    head = series[0]
    try:
        value = Decimal(str(head["valor"]))
        snap_date = date.fromisoformat(str(head["fecha"])[:10])
    except (KeyError, ValueError, TypeError) as exc:
        raise RateFetchError(
            f"Respuesta inesperada de mindicador.cl para {code}: {head!r}"
        ) from exc
    return RateSnapshot(
        code=code,
        value_clp=value,
        snapshot_date=snap_date,
        source=DEFAULT_SOURCE,
        fetched_at=utcnow(),
    )


async def fetch_rates(codes: Iterable[str] = SUPPORTED_CODES) -> list[RateSnapshot]:
    requested = tuple(c for c in codes if c in SUPPORTED_CODES)
    if not requested:
        return []
    async with httpx.AsyncClient() as client:
        return [await _fetch_one(client, code) for code in requested]


def persist_snapshots(snapshots: Iterable[RateSnapshot]) -> list[RateSnapshot]:
    saved: list[RateSnapshot] = []
    with Session(engine) as session:
        for snap in snapshots:
            row = session.get(IndicatorSnapshot, snap.code)
            if row is None:
                row = IndicatorSnapshot(code=snap.code, value_clp=snap.value_clp,
                                        snapshot_date=snap.snapshot_date,
                                        source=snap.source,
                                        fetched_at=snap.fetched_at)
            else:
                row.value_clp = snap.value_clp
                row.snapshot_date = snap.snapshot_date
                row.source = snap.source
                row.fetched_at = snap.fetched_at
            session.add(row)
            saved.append(snap)
        session.commit()
    return saved


async def refresh_rates(codes: Iterable[str] = SUPPORTED_CODES) -> list[RateSnapshot]:
    snapshots = await fetch_rates(codes)
    return persist_snapshots(snapshots)
