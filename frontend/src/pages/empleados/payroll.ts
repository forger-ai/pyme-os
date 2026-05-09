export type AfpOption = {
  code: string;
  name: string;
  total_rate: number;
};

export type HealthOption = {
  code: string;
  name: string;
  kind: "fonasa" | "isapre";
};

export type PayrollCatalogs = {
  year: number;
  verified: boolean;
  minimum_wage_clp: number;
  uf_default_clp: number;
  utm_default_clp: number;
  afp_options: AfpOption[];
  health_options: HealthOption[];
  notes: string[];
};

export type Anchor = "base" | "liquido" | "costo_empresa";

export type NonImponibleItem = {
  label: string;
  amount_clp: number;
};

export type PreviewRequest = {
  anchor: Anchor;
  target_amount_clp: number;
  contract_type: "indefinite" | "fixed_term" | "project_based" | "part_time";
  afp_code: string;
  health_provider: "fonasa" | "isapre";
  isapre_plan_uf: number;
  year: number;
  uf_value_clp: number;
  utm_value_clp: number;
  include_gratification: boolean;
  non_imponible_items: NonImponibleItem[];
};

export type PreviewResponse = {
  anchor: Anchor;
  base_salary_clp: number;
  contract_type: string;
  afp_code: string;
  afp_total_rate: number;
  health_provider: string;
  isapre_plan_uf: number;
  year: number;
  uf_value_clp: number;
  utm_value_clp: number;

  gratification_clp: number;
  imponible_clp: number;
  capped_imponible_afp_health_clp: number;
  capped_imponible_afc_clp: number;
  non_imponible_items: NonImponibleItem[];
  non_imponible_total_clp: number;

  afp_employee_clp: number;
  health_employee_clp: number;
  unemployment_employee_clp: number;
  taxable_base_clp: number;
  income_tax_clp: number;
  total_employee_deductions_clp: number;
  net_salary_clp: number;

  sis_clp: number;
  mutual_clp: number;
  afc_employer_clp: number;
  ley_sanna_clp: number;
  reforma_previsional_clp: number;
  total_employer_extras_clp: number;
  total_employer_cost_clp: number;

  notes: string[];
};
