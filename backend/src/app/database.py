"""SQLite engine and session helpers shared across all vite-fastapi-sqlite apps."""

from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy.event import listens_for
from sqlmodel import Session, SQLModel, create_engine

_DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "app.sqlite"


def _resolve_database_url() -> str:
    raw = os.getenv("DATABASE_URL", "")
    return raw.strip() if raw.strip() else f"sqlite:///{_DEFAULT_DB_PATH}"


DATABASE_URL = _resolve_database_url()

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

if DATABASE_URL.startswith("sqlite"):

    @listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON")
        finally:
            cursor.close()


def init_db() -> None:
    """Create all tables defined in SQLModel.metadata."""
    if DATABASE_URL.startswith("sqlite"):
        _DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    _apply_soft_migrations()


def _apply_soft_migrations() -> None:
    """Apply tiny ad-hoc schema additions for SQLite without losing data.

    SQLModel.metadata.create_all() only creates missing tables; it does NOT
    add new columns to tables that already exist. For development convenience
    we patch known column additions here. This is not Alembic — only safe for
    the small additive changes done during skeleton iteration.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return
    expected_columns: dict[str, list[tuple[str, str]]] = {
        "contract": [
            ("non_imponible_items_json", "TEXT NOT NULL DEFAULT '[]'"),
        ],
        "employee": [
            ("birth_date", "DATE"),
            ("address", "TEXT"),
            ("empresa", "TEXT"),
            ("division", "TEXT"),
            ("area", "TEXT"),
            ("subarea", "TEXT"),
            ("manager_id", "TEXT"),
        ],
        "payslip": [
            ("inputs_json", "TEXT NOT NULL DEFAULT '{}'"),
            ("employer_cost_clp", "NUMERIC"),
        ],
    }
    from sqlalchemy import text

    with engine.begin() as conn:
        for table, columns in expected_columns.items():
            existing = {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            }
            for col_name, col_decl in columns:
                if col_name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_decl}"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
