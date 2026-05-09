export type VacationKind =
  | "legal"
  | "progressive"
  | "proportional"
  | "adjustment";

export type VacationRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type EmployeeBalance = {
  employee_id: string;
  employee_name: string;
  cargo: string | null;
  accrued_days: number;
  taken_days: number;
  pending_days: number;
  balance_days: number;
};

export type CalendarEntry = {
  request_id: string;
  employee_id: string;
  employee_name: string;
  cargo: string | null;
  start_date: string;
  end_date: string;
  days: number;
  status: "pending" | "approved";
};

export type VacationRequestApi = {
  id: string;
  employee_id: string;
  employee_name: string;
  cargo: string | null;
  kind: VacationKind;
  start_date: string;
  end_date: string;
  days: number;
  status: VacationRequestStatus;
  notes: string | null;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
};
