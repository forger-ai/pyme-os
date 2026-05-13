export type EmployeeStatus = "active" | "on_leave" | "terminated";

export type ContractType =
  | "indefinite"
  | "fixed_term"
  | "project_based"
  | "part_time";

export type EmployeeRow = {
  id: string;
  rut: string;
  first_name: string;
  last_name: string;
  full_name: string;
  hire_date: string;
  status: EmployeeStatus;
  empresa: string | null;
  division: string | null;
  area: string | null;
  subarea: string | null;
  cargo: string | null;
  contract_type: ContractType | null;
};

export type EmployeePage = {
  items: EmployeeRow[];
  total: number;
  limit: number;
  offset: number;
};

export type NonImponibleItem = {
  label: string;
  amount_clp: number;
};

export type CurrentContractInfo = {
  id: string;
  contract_type: ContractType;
  job_title: string;
  start_date: string;
  end_date: string | null;
  weekly_hours: number;
  base_salary_clp: number;
  non_imponible_items: NonImponibleItem[];
};

export type VacationSummary = {
  accrued_days: number;
  taken_days: number;
  balance_days: number;
  note: string;
};

export type EmployerCostBreakdown = {
  base_salary_clp: number;
  gratification_clp: number;
  imponible_clp: number;
  non_imponible_total_clp: number;
  sis_clp: number;
  mutual_clp: number;
  afc_employer_clp: number;
  ley_sanna_clp: number;
  reforma_previsional_clp: number;
  total_employer_extras_clp: number;
  total_employer_cost_clp: number;
  contract_type: ContractType;
  year: number;
  uf_value_clp: number;
  notes: string[];
};

export type EmployeeDetail = {
  id: string;
  rut: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  hire_date: string;
  termination_date: string | null;
  status: EmployeeStatus;
  empresa: string | null;
  division: string | null;
  area: string | null;
  subarea: string | null;
  afp_code: string | null;
  health_provider: string;
  notes: string | null;
  manager_id: string | null;
  manager_name: string | null;
  direct_reports_count: number;
  current_contract: CurrentContractInfo | null;
  vacation_summary: VacationSummary;
  employer_cost: EmployerCostBreakdown | null;
};

export type PayslipRow = {
  id: string;
  period_id: string;
  period_label: string;
  status: "draft" | "issued";
  gross_salary_clp: number | null;
  net_salary_clp: number | null;
};

export type VacationEntryRow = {
  id: string;
  kind: "legal" | "progressive" | "proportional" | "adjustment";
  days: number;
  occurred_on: string;
  period_label: string | null;
};
