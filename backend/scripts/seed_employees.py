"""Seed pyme-os with example employees for skeleton iteration.

Drops the local SQLite database (development convenience) and recreates the
schema from SQLModel metadata, then inserts a small org with one CEO, two
areas, contracts, two payroll periods with payslips, and vacation ledger
entries so the UI has something to render.

Usage:

    uv run python scripts/seed_employees.py
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sqlmodel import Session, SQLModel, select

from app import models as _models  # noqa: F401  (load metadata)
from app.database import DATABASE_URL, engine, init_db
from app.models import (
    Contract,
    ContractType,
    Employee,
    EmployeeStatus,
    HealthProvider,
    PayrollPeriod,
    Payslip,
    PayslipStatus,
    VacationKind,
    VacationLedgerEntry,
)


EMPRESA = "PYME OS DEMO SPA"


def reset_schema() -> None:
    """Drop and recreate all known tables. Local-dev convenience only."""
    if DATABASE_URL.startswith("sqlite"):
        SQLModel.metadata.drop_all(engine)
    init_db()


def seed() -> None:
    today = date.today()

    employees: list[tuple[Employee, str, ContractType, Decimal]] = []

    # CEO ----------------------------------------------------------------
    ceo = Employee(
        rut="11.111.111-1",
        first_name="Jaime",
        last_name="Perez",
        email="jaime.perez@pymeos.demo",
        phone="9 1111 1111",
        birth_date=date(1975, 5, 12),
        address="Av. Apoquindo 1234, Las Condes",
        hire_date=date(2018, 1, 2),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Direccion General",
        subarea="Direccion",
        afp_code="provida",
        health_provider=HealthProvider.fonasa,
    )
    employees.append((ceo, "Chief Executive Officer", ContractType.indefinite, Decimal("4500000")))

    # Comercial ----------------------------------------------------------
    sales_lead = Employee(
        rut="12.222.222-2",
        first_name="Maria",
        last_name="Vega",
        email="maria.vega@pymeos.demo",
        phone="9 2222 2222",
        birth_date=date(1985, 3, 20),
        address="Av. Providencia 980, Providencia",
        hire_date=date(2019, 4, 15),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area Comercial",
        subarea="Ventas",
        afp_code="cuprum",
        health_provider=HealthProvider.isapre,
    )
    employees.append((sales_lead, "Sales Manager", ContractType.indefinite, Decimal("3200000")))

    sales_1 = Employee(
        rut="13.333.333-3",
        first_name="Alberto",
        last_name="Armstrong",
        email="alberto.armstrong@pymeos.demo",
        phone="9 3333 3333",
        birth_date=date(1990, 8, 1),
        hire_date=date(2021, 6, 1),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area Comercial",
        subarea="Ventas",
    )
    employees.append((sales_1, "Sales Executive", ContractType.indefinite, Decimal("1850000")))

    sales_2 = Employee(
        rut="14.444.444-4",
        first_name="Evelyn",
        last_name="Ricci",
        email="evelyn.ricci@pymeos.demo",
        phone="9 4444 4444",
        birth_date=date(1992, 12, 4),
        hire_date=date(2022, 9, 12),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area Comercial",
        subarea="Customer Success",
    )
    employees.append((sales_2, "Customer Solutions Analyst", ContractType.indefinite, Decimal("1750000")))

    sales_3 = Employee(
        rut="15.555.555-5",
        first_name="Juan",
        last_name="Chavarri",
        email="juan.chavarri@pymeos.demo",
        phone="9 5555 5555",
        birth_date=date(1988, 6, 22),
        hire_date=date(2020, 2, 18),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area Comercial",
        subarea="Ventas",
    )
    employees.append((sales_3, "Business Development Representative", ContractType.fixed_term, Decimal("1600000")))

    # Tecnologia ----------------------------------------------------------
    cto = Employee(
        rut="16.666.666-6",
        first_name="Roberto",
        last_name="Montegu",
        email="roberto.montegu@pymeos.demo",
        phone="9 6660 9446",
        birth_date=date(1990, 7, 2),
        address="Ortuza 299, depto 410",
        hire_date=date(2021, 9, 1),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area de Operaciones - Tecnologia",
        subarea="Producto",
        afp_code="planvital",
        health_provider=HealthProvider.isapre,
    )
    employees.append((cto, "Chief Technology Officer", ContractType.indefinite, Decimal("4250354")))

    tech_1 = Employee(
        rut="17.777.777-7",
        first_name="Stefano",
        last_name="Garate",
        email="stefano.garate@pymeos.demo",
        phone="9 7777 7777",
        birth_date=date(1991, 1, 9),
        hire_date=date(2017, 6, 19),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area de Operaciones - Tecnologia",
        subarea="Producto",
    )
    employees.append((tech_1, "Technical Leader", ContractType.indefinite, Decimal("3650000")))

    tech_2 = Employee(
        rut="18.888.888-8",
        first_name="Felipe",
        last_name="Pezoa",
        email="felipe.pezoa@pymeos.demo",
        phone="9 8888 8888",
        birth_date=date(1987, 11, 30),
        hire_date=date(2020, 9, 1),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area de Operaciones - Tecnologia",
        subarea="Producto",
    )
    employees.append((tech_2, "Technical Leader", ContractType.indefinite, Decimal("3500000")))

    tech_3 = Employee(
        rut="19.999.999-9",
        first_name="Glenn",
        last_name="Marcano",
        email="glenn.marcano@pymeos.demo",
        phone="9 9999 9999",
        birth_date=date(1993, 4, 14),
        hire_date=date(2023, 12, 11),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area de Operaciones - Tecnologia",
        subarea="Producto",
    )
    employees.append((tech_3, "Full Stack Developer", ContractType.indefinite, Decimal("2400000")))

    tech_4 = Employee(
        rut="20.123.456-7",
        first_name="Sergio",
        last_name="Neira",
        email="sergio.neira@pymeos.demo",
        phone="9 1010 1010",
        birth_date=date(1995, 2, 25),
        hire_date=date(2024, 2, 19),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area de Operaciones - Tecnologia",
        subarea="Producto",
    )
    employees.append((tech_4, "Full Stack Developer", ContractType.fixed_term, Decimal("2200000")))

    tech_5 = Employee(
        rut="21.234.567-8",
        first_name="Omar",
        last_name="Prado",
        email="omar.prado@pymeos.demo",
        phone="9 1212 1212",
        birth_date=date(1986, 9, 7),
        hire_date=date(2017, 7, 3),
        status=EmployeeStatus.active,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area de Operaciones - Tecnologia",
        subarea="Producto",
    )
    employees.append((tech_5, "Backend Developer", ContractType.indefinite, Decimal("2900000")))

    # Terminated ----------------------------------------------------------
    ex_employee = Employee(
        rut="22.345.678-9",
        first_name="Cesar",
        last_name="Romero",
        email="cesar.romero@pymeos.demo",
        birth_date=date(1989, 10, 1),
        hire_date=date(2019, 9, 9),
        termination_date=date(2024, 11, 30),
        status=EmployeeStatus.terminated,
        empresa=EMPRESA,
        division=EMPRESA,
        area="Area Comercial",
        subarea="Marketing",
    )
    employees.append((ex_employee, "Product Designer", ContractType.indefinite, Decimal("2100000")))

    with Session(engine) as session:
        for emp, _, _, _ in employees:
            session.add(emp)
        session.commit()
        for emp, _, _, _ in employees:
            session.refresh(emp)

        # Manager assignments (after IDs exist).
        sales_lead.manager_id = ceo.id
        for sub in (sales_1, sales_2, sales_3, ex_employee):
            sub.manager_id = sales_lead.id
        cto.manager_id = ceo.id
        for sub in (tech_1, tech_2, tech_3, tech_4, tech_5):
            sub.manager_id = cto.id
        for emp, _, _, _ in employees:
            session.add(emp)
        session.commit()

        # Contracts (current).
        for emp, job_title, ctype, salary in employees:
            session.add(
                Contract(
                    employee_id=emp.id,
                    contract_type=ctype,
                    start_date=emp.hire_date,
                    end_date=emp.termination_date,
                    job_title=job_title,
                    base_salary_clp=salary,
                    weekly_hours=45,
                    is_current=emp.status != EmployeeStatus.terminated,
                )
            )
        session.commit()

        # Two payroll periods + payslips for active employees.
        periods = [
            PayrollPeriod(year=today.year, month=max(today.month - 2, 1), constants_year=today.year),
            PayrollPeriod(year=today.year, month=max(today.month - 1, 1), constants_year=today.year),
        ]
        for period in periods:
            session.add(period)
        session.commit()
        for period in periods:
            session.refresh(period)

        for emp, _, _, salary in employees:
            if emp.status == EmployeeStatus.terminated:
                continue
            current = session.exec(
                select(Contract)
                .where(Contract.employee_id == emp.id)
                .where(Contract.is_current.is_(True))
            ).first()
            if current is None:
                continue
            for period in periods:
                gross = salary
                net = (salary * Decimal("0.83")).quantize(Decimal("1"))
                session.add(
                    Payslip(
                        period_id=period.id,
                        employee_id=emp.id,
                        contract_id=current.id,
                        status=PayslipStatus.draft,
                        gross_salary_clp=gross,
                        net_salary_clp=net,
                    )
                )
        session.commit()

        # Vacation ledger: accrue 15 legal days, take 3.
        for emp, _, _, _ in employees:
            if emp.status == EmployeeStatus.terminated:
                continue
            session.add(
                VacationLedgerEntry(
                    employee_id=emp.id,
                    kind=VacationKind.legal,
                    days=Decimal("15"),
                    occurred_on=date(today.year, 1, 1),
                    period_label=f"Anio {today.year}",
                )
            )
            session.add(
                VacationLedgerEntry(
                    employee_id=emp.id,
                    kind=VacationKind.legal,
                    days=Decimal("-3"),
                    occurred_on=today - timedelta(days=120),
                    period_label="Tomadas",
                )
            )
        session.commit()


def main() -> None:
    print(f"Resetting database at {DATABASE_URL}")
    reset_schema()
    seed()
    print("Seed complete.")


if __name__ == "__main__":
    main()
