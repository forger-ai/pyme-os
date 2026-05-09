export type Period = {
  id: string;
  year: number;
  month: number;
  constants_year: number;
  closed_at: string | null;
};

export type PayslipStatus = "draft" | "issued";

export type PayslipRowApi = {
  id: string;
  period_id: string;
  employee_id: string;
  employee_name: string;
  cargo: string | null;
  status: PayslipStatus;
  days_worked: number;
  gross_salary_clp: number | null;
  net_salary_clp: number | null;
  employer_cost_clp: number | null;
};

export type Item = {
  label: string;
  amount_clp: number;
};

export type PayslipInputs = {
  base_salary_clp: number;
  contract_type: "indefinite" | "fixed_term" | "project_based" | "part_time";
  afp_code: string;
  health_provider: "fonasa" | "isapre";
  isapre_plan_uf: number;
  year: number;
  uf_value_clp: number;
  utm_value_clp: number;
  include_gratification: boolean;
  non_imponible_items: Item[];
  imponible_extras: Item[];
  post_tax_discounts: Item[];
  days_worked: number;
};

export type PayslipBreakdownApi = {
  base_salary_clp: number;
  days_worked: number;
  gratification_clp: number;
  imponible_extras_total_clp: number;
  imponible_clp: number;
  non_imponible_total_clp: number;
  afp_employee_clp: number;
  health_employee_clp: number;
  unemployment_employee_clp: number;
  income_tax_clp: number;
  total_employee_deductions_clp: number;
  post_tax_discounts_total_clp: number;
  net_salary_clp: number;
  total_employer_extras_clp: number;
  total_employer_cost_clp: number;
};

export type PayslipDetail = {
  id: string;
  period_id: string;
  period_label: string;
  employee_id: string;
  employee_name: string;
  cargo: string | null;
  status: PayslipStatus;
  inputs: PayslipInputs;
  breakdown: PayslipBreakdownApi;
  issued_at: string | null;
};
