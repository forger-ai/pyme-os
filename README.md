# pyme-os

Local-first payroll and HR app for Chilean SMBs (Pymes), built on the `vite-fastapi-sqlite` stack.

PymeOS replaces the spreadsheet-driven payroll process for a small Pyme (1 to 20 people) with a private, local app. All data lives in a SQLite file on the user's machine. Chilean legal parameters (UF, tope imponible, income tax brackets, minimum wage, AFP and health rates) are loaded from versioned JSON files under `backend/config/cl/<year>.json`, never hardcoded.

## Committed MVP Scope

PymeOS v0.1.x targets four capabilities:

1. **Employees and contracts** — employee record with personal data, contract, addenda, and active or terminated status.
2. **Payroll calculation** — monthly payslip from gross to net applying AFP, health, unemployment insurance, and second-category income tax.
3. **Vacation tracking** — legal and proportional vacation balance per employee, with prescription and progressive vacation rules.
4. **Previred export** — monthly contributions file in a Previred-compatible format that the user uploads manually.

The current state is the scaffolding: domain models, REST endpoints (empty), a four-tab frontend shell, and the constants loader. Calculation logic, contract templates, and the Previred CSV writer are pending.

## Non-Goals

To keep PymeOS focused, these are explicitly out of scope:

- electronic signature on contracts
- direct submission to SII or Direccion del Trabajo
- automatic UF or UTM fetching
- LRE (Libro de Remuneraciones Electronico) generation
- finiquito calculation
- attendance or time tracking
- multi-user, employee self-service, or authentication
- multi-company or multi-currency

When any of these is reconsidered, document it in `AGENTS.md` before adding code.

## Stack Common Dependency

PymeOS uses the shared stack contract, like the rest of `vite-fastapi-sqlite` apps.

- Required submodule: `commons/`
- Expected remote: `git@github.com:forger-ai/vite-fastapi-sqlite-commons.git`
- Docker mounts the shared helpers over local fallbacks:
  - `backend/src/app/database.py`
  - `backend/src/app/health.py`
  - `backend/src/app/cors.py`
  - `frontend/src/api/client.ts`

## Structure

```text
pyme-os/
├── manifest.json
├── AGENTS.md
├── docker-compose.yml
├── commons/                          # submodule: shared stack contract
├── backend/
│   ├── pyproject.toml
│   ├── config/
│   │   └── cl/                       # external versioned legal constants
│   │       ├── README.md
│   │       └── 2026.json
│   ├── data/                         # local SQLite (gitignored)
│   └── src/app/
│       ├── main.py
│       ├── models.py                 # Employee, Contract, VacationLedger, Payslip, PayrollPeriod
│       ├── constants_cl.py           # loader for backend/config/cl/<year>.json
│       ├── database.py               # local fallback, overridden in Docker
│       ├── health.py                 # local fallback, overridden in Docker
│       ├── cors.py                   # local fallback, overridden in Docker
│       └── routers/
│           ├── employees.py
│           ├── payslips.py
│           ├── vacations.py
│           └── previred.py
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx                   # four-tab shell
│       ├── theme.ts
│       ├── pages/
│       │   ├── Empleados.tsx
│       │   ├── Liquidaciones.tsx
│       │   ├── Vacaciones.tsx
│       │   └── Previred.tsx
│       └── api/client.ts             # local fallback, overridden in Docker
└── scripts/
    └── package_app.sh
```

## Clone

Always clone with submodules:

```bash
git clone --recurse-submodules git@github.com:forger-ai/pyme-os.git
```

If the local git config does not have SSH set up, use the rewrite once:

```bash
git -c url."https://github.com/".insteadOf="git@github.com:" submodule update --init --recursive
```

## Run with Docker (recommended)

```bash
docker compose up --build
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5181`
- Health: `GET http://localhost:8000/api/health`

## Run without Docker

```bash
cd backend
uv sync
PAYROLL_CONSTANTS_DIR=$(pwd)/config/cl uv run fastapi dev src/app/main.py
```

```bash
cd frontend
npm install
npm run dev -- --port 5181
```

## Update Chilean Legal Constants

Constants live as JSON files versioned by year:

```text
backend/config/cl/
├── README.md
└── 2026.json
```

When values change at a year boundary or due to a legal update, add a new file (for example `2027.json`), describe the change in the file's comments, and bump `manifest.json` to a new version. Do not edit Python code to override values.

## Verify

```bash
cd backend && uv run python -c "from app.constants_cl import load_for_year; print(load_for_year(2026)['minimum_wage_clp'])"
```

## Release

PymeOS follows the standard Forger app release flow:

1. tag the repository with `pyme-os/v<version>`
2. the release workflow builds the distributable ZIP
3. the workflow opens an automated PR against `forger-ai/apps-catalog`
4. once merged, the desktop catalog regenerates and the new version is installable
