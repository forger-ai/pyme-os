import type { ContractType, EmployeeStatus } from "./types";

const CONTRACT_LABELS: Record<ContractType, string> = {
  indefinite: "Indefinido",
  fixed_term: "Plazo fijo",
  project_based: "Por obra",
  part_time: "Part-time",
};

const CONTRACT_BADGES: Record<ContractType, string> = {
  indefinite: "F1",
  fixed_term: "F2",
  project_based: "F3",
  part_time: "F4",
};

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Vigente",
  on_leave: "Con licencia",
  terminated: "No vigente",
};

export function contractLabel(t: ContractType | null): string {
  return t ? CONTRACT_LABELS[t] : "Sin contrato";
}

export function contractBadge(t: ContractType | null): string {
  return t ? CONTRACT_BADGES[t] : "—";
}

export function statusLabel(s: EmployeeStatus): string {
  return STATUS_LABELS[s];
}

/** Format a Chilean RUT with dots and dash. Accepts either format. */
export function formatRut(raw: string): string {
  const cleaned = raw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (cleaned.length < 2) return raw;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  let withDots = "";
  for (let i = 0; i < body.length; i++) {
    const fromEnd = body.length - i;
    withDots += body[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) withDots += ".";
  }
  return `${withDots}-${dv}`;
}

/** Format ISO date (YYYY-MM-DD) as DD/MM/YYYY. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso + "T00:00:00");
  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function tenureLabel(hireIso: string): string {
  const hire = new Date(hireIso + "T00:00:00");
  const now = new Date();
  const months =
    (now.getFullYear() - hire.getFullYear()) * 12 +
    (now.getMonth() - hire.getMonth());
  const years = Math.floor(months / 12);
  if (years >= 1) return `${years} ${years === 1 ? "año" : "años"}`;
  if (months >= 1) return `${months} ${months === 1 ? "mes" : "meses"}`;
  return "menos de un mes";
}

export function formatCLP(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export function ageLabel(birthIso: string | null): string {
  if (!birthIso) return "—";
  const birth = new Date(birthIso + "T00:00:00");
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) {
    years -= 1;
  }
  return `${formatDate(birthIso)} (${years} años)`;
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
