"""Loader for Chilean payroll legal constants.

Constants are not hardcoded. They live in JSON files versioned by year under
the directory pointed to by the `PAYROLL_CONSTANTS_DIR` environment variable
(default: `<repo>/backend/config/cl`).

Each calculation must explicitly select the year of the constants file it
uses, and that year is recorded on the `PayrollPeriod` row so the same
period can be reproduced exactly even after the constants change.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


def _default_constants_dir() -> Path:
    here = Path(__file__).resolve()
    return here.parents[3] / "config" / "cl"


def constants_dir() -> Path:
    raw = os.environ.get("PAYROLL_CONSTANTS_DIR")
    if raw:
        return Path(raw)
    return _default_constants_dir()


@lru_cache(maxsize=16)
def load_for_year(year: int) -> dict[str, Any]:
    path = constants_dir() / f"{year}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"No payroll constants file for year {year} at {path}. "
            "Add the file under backend/config/cl/ before running calculations for this period."
        )
    with path.open("r", encoding="utf-8") as fh:
        data: dict[str, Any] = json.load(fh)
    return data


def available_years() -> list[int]:
    out: list[int] = []
    for entry in sorted(constants_dir().glob("*.json")):
        try:
            out.append(int(entry.stem))
        except ValueError:
            continue
    return out


def reset_cache() -> None:
    """Drop the cached constants. Useful in tests or after editing JSON files."""
    load_for_year.cache_clear()
