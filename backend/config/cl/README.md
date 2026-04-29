# Chilean Payroll Constants

This directory holds versioned legal parameters used by PymeOS payroll calculations.

Files are named by year: `2026.json`, `2027.json`, etc.

The active year is selected at calculation time, not at server startup. This lets a payslip generated for a March 2026 period use `2026.json` even when the server is running into 2027.

## File Format

```json
{
  "_meta": {
    "year": 2026,
    "updated_at": "YYYY-MM-DD",
    "source": "Free-form description of where each value comes from",
    "verified": false,
    "notes": "Plain-text notes about anything pending verification"
  },
  "currency": "CLP",
  "minimum_wage_clp": 510000,
  "imponible_caps": {
    "afp_health_uf": 87.8,
    "unemployment_insurance_uf": 131.7
  },
  "afp": [
    { "code": "modelo",   "name": "AFP Modelo",   "total_rate": 0.1058 },
    { "code": "uno",      "name": "AFP Uno",      "total_rate": 0.1049 },
    { "code": "planvital","name": "AFP PlanVital","total_rate": 0.1116 },
    { "code": "habitat",  "name": "AFP Habitat",  "total_rate": 0.1127 },
    { "code": "capital",  "name": "AFP Capital",  "total_rate": 0.1144 },
    { "code": "cuprum",   "name": "AFP Cuprum",   "total_rate": 0.1144 },
    { "code": "provida",  "name": "AFP Provida",  "total_rate": 0.1145 }
  ],
  "health": {
    "fonasa_rate": 0.07,
    "isapre_minimum_rate": 0.07
  },
  "unemployment_insurance": {
    "indefinite": { "employee": 0.006, "employer": 0.024 },
    "fixed_term": { "employee": 0.0,   "employer": 0.030 }
  },
  "income_tax_brackets_utm": [
    { "from": 0,    "to": 13.5, "rate": 0.0,   "deduction_utm": 0.0 },
    { "from": 13.5, "to": 30,   "rate": 0.04,  "deduction_utm": 0.54 },
    { "from": 30,   "to": 50,   "rate": 0.08,  "deduction_utm": 1.74 },
    { "from": 50,   "to": 70,   "rate": 0.135, "deduction_utm": 4.49 },
    { "from": 70,   "to": 90,   "rate": 0.23,  "deduction_utm": 11.14 },
    { "from": 90,   "to": 120,  "rate": 0.304, "deduction_utm": 17.80 },
    { "from": 120,  "to": 310,  "rate": 0.35,  "deduction_utm": 23.32 },
    { "from": 310,  "to": null, "rate": 0.40,  "deduction_utm": 38.82 }
  ],
  "uf_default": null,
  "utm_default": null,
  "vacation": {
    "annual_business_days": 15,
    "progressive_threshold_years": 10,
    "progressive_extra_per_three_years": 1
  }
}
```

## Update Workflow

1. When a Chilean legal parameter changes (annual UF reset, new minimum wage, AFP rate change, tax bracket change), copy the most recent file to a new file named after the affected year.
2. Edit the values that changed.
3. Set `_meta.updated_at` and add a note in `_meta.notes`.
4. Set `_meta.verified` to `false` until a human reviewer confirms the figures match the official publications.
5. Bump the app `manifest.json` version and add a `changelog` entry pointing at the constants update.

## Sources

These values must always trace to the corresponding official source. Common ones for Chile:

- **Sueldo minimo**: Direccion del Trabajo or Ministerio del Trabajo decree.
- **Topes imponibles (AFP/Salud y Cesantia)**: Superintendencia de Pensiones annual circular.
- **Tasas AFP**: each AFP publishes its commission monthly; `total_rate` aggregates the mandatory 10% and the AFP's commission.
- **Tramos del impuesto unico**: SII publishes monthly tables in UTM.
- **Cotizaciones de salud**: Ley 18.469 (Fonasa) and 18.933 (Isapres).
- **Cesantia (AFC)**: Ley 19.728.
- **Vacaciones legales y progresivas**: Codigo del Trabajo art. 67 y 68.

## Important

The PymeOS agent must never invent values or claim a calculation matches the law. The agent presents what is in the file. Updates that affect calculations require explicit user confirmation.
