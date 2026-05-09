import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/EditOutlined";
import { ApiError, get } from "../../api/client";
import EmpleadoForm from "./EmpleadoForm";
import SolicitudForm from "../vacaciones/SolicitudForm";
import type { VacationRequestApi } from "../vacaciones/types";
import {
  ageLabel,
  contractBadge,
  contractLabel,
  formatCLP,
  formatDate,
  formatLongDate,
  formatRut,
  initials,
  tenureLabel,
} from "./format";
import type {
  EmployeeDetail,
  PayslipRow,
  VacationEntryRow,
} from "./types";

type Props = {
  employeeId: string;
  onBack: () => void;
};

type TabId =
  | "resumen"
  | "liquidaciones"
  | "documentos"
  | "historia"
  | "bitacora"
  | "asistencia"
  | "items"
  | "vacaciones";

const TABS: { id: TabId; label: string; ready: boolean }[] = [
  { id: "resumen", label: "Resumen", ready: true },
  { id: "liquidaciones", label: "Liquidaciones", ready: true },
  { id: "documentos", label: "Documentos", ready: false },
  { id: "historia", label: "Historia", ready: false },
  { id: "bitacora", label: "Bitácora", ready: false },
  { id: "asistencia", label: "Asistencia", ready: false },
  { id: "items", label: "Ítems", ready: false },
  { id: "vacaciones", label: "Vacaciones", ready: true },
];

export default function FichaEmpleado({ employeeId, onBack }: Props) {
  const [tab, setTab] = useState<TabId>("resumen");
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    setDetail(null);
    setError(null);
    get<EmployeeDetail>(`/api/employees/${employeeId}`)
      .then(setDetail)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar ficha")
      );
  }, [employeeId, reloadToken]);

  if (error) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
          Volver al listado
        </Button>
        <Alert severity="error">{error}</Alert>
      </Stack>
    );
  }
  if (!detail) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
          Volver al listado
        </Button>
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ alignSelf: "flex-start" }}>
        Volver al listado
      </Button>

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          gap: 2,
          alignItems: "stretch",
        }}
      >
        <Box sx={{ flex: { md: "0 0 320px" } }}>
          <ProfileSidebar detail={detail} onEdit={() => setEditing(true)} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Paper variant="outlined">
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v as TabId)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              {TABS.map((t) => (
                <Tab
                  key={t.id}
                  value={t.id}
                  label={
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>{t.label}</span>
                      {!t.ready && (
                        <Chip
                          label="Próx."
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      )}
                    </Stack>
                  }
                />
              ))}
            </Tabs>
            <Box sx={{ p: 3 }}>
              {tab === "resumen" && <ResumenTab detail={detail} />}
              {tab === "liquidaciones" && <LiquidacionesTab employeeId={employeeId} />}
              {tab === "vacaciones" && (
                <VacacionesTab
                  employeeId={employeeId}
                  summaryDays={detail.vacation_summary.balance_days}
                />
              )}
              {tab !== "resumen" &&
                tab !== "liquidaciones" &&
                tab !== "vacaciones" && (
                  <PlaceholderTab label={TABS.find((t) => t.id === tab)?.label ?? ""} />
                )}
            </Box>
          </Paper>
        </Box>
      </Box>

      <EmpleadoForm
        open={editing}
        mode="edit"
        initial={detail}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          setReloadToken((t) => t + 1);
        }}
      />
    </Stack>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function ProfileSidebar({
  detail,
  onEdit,
}: {
  detail: EmployeeDetail;
  onEdit: () => void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack alignItems="center" spacing={1.5}>
        <Stack direction="row" alignSelf="flex-end">
          {detail.current_contract && (
            <Chip
              label={contractBadge(detail.current_contract.contract_type)}
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 700,
                color: "success.main",
                borderColor: "success.light",
              }}
            />
          )}
        </Stack>
        <Avatar sx={{ width: 96, height: 96, bgcolor: "primary.light" }}>
          {initials(detail.full_name)}
        </Avatar>
        <Typography variant="h6" fontWeight={700} textAlign="center">
          {detail.full_name}
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {detail.current_contract?.job_title ?? "Sin cargo"}
        </Typography>
        <Button startIcon={<EditIcon />} variant="outlined" onClick={onEdit}>
          Actualizar Datos
        </Button>
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Información General
      </Typography>
      <Stack spacing={1.5}>
        <SidebarField label="Identificación">
          <Typography variant="body2" color="text.secondary">
            RUT
          </Typography>
          <Typography variant="body2">{formatRut(detail.rut)}</Typography>
        </SidebarField>

        <SidebarField label="Correo Corporativo">
          {detail.email ? (
            <Link href={`mailto:${detail.email}`} underline="hover">
              {detail.email}
            </Link>
          ) : (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          )}
        </SidebarField>

        <SidebarField label="Teléfono Particular">
          {detail.phone ? (
            <Link href={`tel:${detail.phone.replace(/\s/g, "")}`} underline="hover">
              {detail.phone}
            </Link>
          ) : (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          )}
        </SidebarField>

        <SidebarField label="Cumpleaños">
          <Typography variant="body2">{ageLabel(detail.birth_date)}</Typography>
        </SidebarField>

        <SidebarField label="Dirección">
          <Typography variant="body2">{detail.address ?? "—"}</Typography>
        </SidebarField>

        <SidebarField label="Fecha de Ingreso">
          <Typography variant="body2">{formatDate(detail.hire_date)}</Typography>
        </SidebarField>
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        Previsión y Pago
      </Typography>
      <Stack spacing={1.5}>
        <SidebarField label="Previsión Salud">
          <Typography variant="body2">
            {detail.health_provider === "fonasa" ? "Fonasa" : "Isapre"}
          </Typography>
        </SidebarField>
        <SidebarField label="AFP">
          <Typography variant="body2">{detail.afp_code ?? "—"}</Typography>
        </SidebarField>
      </Stack>
    </Paper>
  );
}

function SidebarField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Typography variant="caption" fontWeight={700} color="text.primary">
        {label}
      </Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  );
}

// ── Resumen tab ──────────────────────────────────────────────────────────────

function ResumenTab({ detail }: { detail: EmployeeDetail }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Cargo", value: detail.current_contract?.job_title ?? "—" },
    {
      label: "Área",
      value: [detail.area, detail.subarea ? `(${detail.subarea})` : null]
        .filter(Boolean)
        .join(" ") || "—",
    },
    { label: "División", value: detail.division ?? "—" },
    { label: "Empresa", value: detail.empresa ?? "—" },
    { label: "Supervisor", value: detail.manager_name ?? "Sin supervisor" },
    {
      label: "Equipo",
      value:
        detail.direct_reports_count > 0
          ? `${detail.direct_reports_count} ${
              detail.direct_reports_count === 1 ? "Colaborador" : "Colaboradores"
            }`
          : "Sin equipo a cargo",
    },
    { label: "Suplente", value: "Sin suplencia" },
    {
      label: "Tipo Contrato",
      value: contractLabel(detail.current_contract?.contract_type ?? null),
    },
    {
      label: "Jornada Laboral",
      value: detail.current_contract
        ? `Mensual ${detail.current_contract.weekly_hours} hrs.`
        : "—",
    },
    {
      label: "Fecha Ingreso Compañía",
      value: `${formatLongDate(detail.hire_date)} (${tenureLabel(detail.hire_date)})`,
    },
    {
      label: "Saldo Vacaciones",
      value: `${detail.vacation_summary.balance_days.toFixed(1)} días`,
    },
  ];

  return (
    <Stack spacing={3}>
      <Stack divider={<Divider flexItem />} spacing={1.5}>
        {rows.map((row) => (
          <Box
            key={row.label}
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              gap: { xs: 0.25, sm: 2 },
            }}
          >
            <Box sx={{ flex: { sm: "0 0 200px" } }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {row.label}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {row.value}
              </Typography>
            </Box>
          </Box>
        ))}
      </Stack>

      <CostoEmpresaCard detail={detail} />
    </Stack>
  );
}

// ── Costo Empresa ────────────────────────────────────────────────────────────

/**
 * Estimacion del costo total mensual del colaborador para la empresa.
 *
 * Importante: estos porcentajes son una aproximacion. El motor de calculo
 * real (con SIS por edad/genero, Mutual por tasa real, AFC empleador,
 * gratificacion legal topada, etc.) no esta implementado en esta version.
 * El usuario puede sobrescribir cualquier rubro cuando construyamos el
 * editor de remuneracion.
 */
const EMPLOYER_COST_RATES = {
  sis: 0.0188, // Seguro de Invalidez y Sobrevivencia (referencial)
  mutual: 0.0093, // Mutual base (referencial, varia por actividad)
  afc_empleador: 0.024, // AFC empleador para indefinidos
  ley_sanna: 0.003,
  reforma_previsional: 0.01,
} as const;

function CostoEmpresaCard({ detail }: { detail: EmployeeDetail }) {
  const baseSalary = detail.current_contract?.base_salary_clp ?? 0;
  if (baseSalary === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Costo Empresa
        </Typography>
        <Alert severity="info">
          Sin contrato vigente, no se puede estimar el costo empresa.
        </Alert>
      </Paper>
    );
  }

  const isIndefinite = detail.current_contract?.contract_type === "indefinite";
  const items = [
    { label: "Sueldo bruto contractual", value: baseSalary },
    {
      label: "SIS (Seguro Invalidez y Sobrevivencia)",
      value: baseSalary * EMPLOYER_COST_RATES.sis,
      note: `${(EMPLOYER_COST_RATES.sis * 100).toFixed(2)}%`,
    },
    {
      label: "Mutual de Seguridad (base)",
      value: baseSalary * EMPLOYER_COST_RATES.mutual,
      note: `${(EMPLOYER_COST_RATES.mutual * 100).toFixed(2)}%`,
    },
    {
      label: "AFC empleador",
      value: isIndefinite ? baseSalary * EMPLOYER_COST_RATES.afc_empleador : 0,
      note: isIndefinite
        ? `${(EMPLOYER_COST_RATES.afc_empleador * 100).toFixed(2)}% (indefinido)`
        : "0% (no aplica)",
    },
    {
      label: "Ley SANNA",
      value: baseSalary * EMPLOYER_COST_RATES.ley_sanna,
      note: `${(EMPLOYER_COST_RATES.ley_sanna * 100).toFixed(2)}%`,
    },
    {
      label: "Reforma previsional (cargo empleador)",
      value: baseSalary * EMPLOYER_COST_RATES.reforma_previsional,
      note: `${(EMPLOYER_COST_RATES.reforma_previsional * 100).toFixed(2)}%`,
    },
  ];
  const totalEmployerExtras = items
    .slice(1)
    .reduce((acc, it) => acc + it.value, 0);
  const totalCost = baseSalary + totalEmployerExtras;
  const overheadPct = baseSalary > 0 ? (totalEmployerExtras / baseSalary) * 100 : 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Costo Empresa
        </Typography>
        <Chip label="Estimado" size="small" variant="outlined" color="warning" />
      </Stack>
      <Alert severity="info" sx={{ mb: 2 }}>
        Estimación con tasas referenciales. El motor de cálculo real (SIS por
        edad/género, Mutual por actividad, gratificación legal topada, etc.)
        aún no está implementado.
      </Alert>

      <Table size="small">
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.label}>
              <TableCell sx={{ borderBottom: "none", py: 0.5, pl: 0 }}>
                <Typography variant="body2">{it.label}</Typography>
                {it.note && (
                  <Typography variant="caption" color="text.secondary">
                    {it.note}
                  </Typography>
                )}
              </TableCell>
              <TableCell
                align="right"
                sx={{ borderBottom: "none", py: 0.5, pr: 0 }}
              >
                <Typography variant="body2">{formatCLP(it.value)}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Divider sx={{ my: 1 }} />

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
      >
        <Stack>
          <Typography variant="subtitle2" fontWeight={700}>
            Costo total estimado
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Overhead sobre bruto: +{overheadPct.toFixed(1)}%
          </Typography>
        </Stack>
        <Typography variant="h6" fontWeight={700} color="primary.main">
          {formatCLP(totalCost)}
        </Typography>
      </Stack>
    </Paper>
  );
}

// ── Liquidaciones tab ────────────────────────────────────────────────────────

function LiquidacionesTab({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<PayslipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    get<PayslipRow[]>(`/api/employees/${employeeId}/payslips`)
      .then(setRows)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar")
      );
  }, [employeeId]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (rows === null) return <CircularProgress size={20} />;
  if (rows.length === 0)
    return (
      <Alert severity="info">
        No hay liquidaciones registradas para este colaborador.
      </Alert>
    );

  return (
    <Stack spacing={1}>
      <Alert severity="info">
        Vista resumida. La liquidación detallada (haberes imponibles, no
        imponibles, descuentos legales, líquido a recibir, base tributable) se
        construirá cuando se implemente el motor de cálculo.
      </Alert>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Mes</TableCell>
              <TableCell align="right">Sueldo Bruto</TableCell>
              <TableCell align="right">Sueldo Líquido</TableCell>
              <TableCell>Estado</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>{row.period_label}</TableCell>
                <TableCell align="right">{formatCLP(row.gross_salary_clp)}</TableCell>
                <TableCell align="right">{formatCLP(row.net_salary_clp)}</TableCell>
                <TableCell>
                  <Chip
                    label={row.status === "issued" ? "Emitida" : "Borrador"}
                    size="small"
                    color={row.status === "issued" ? "success" : "default"}
                    variant="outlined"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

// ── Vacaciones tab ───────────────────────────────────────────────────────────

function VacacionesTab({
  employeeId,
  summaryDays,
}: {
  employeeId: string;
  summaryDays: number;
}) {
  const [rows, setRows] = useState<VacationEntryRow[] | null>(null);
  const [requests, setRequests] = useState<VacationRequestApi[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    setRows(null);
    setRequests(null);
    setError(null);
    Promise.all([
      get<VacationEntryRow[]>(`/api/employees/${employeeId}/vacations`),
      get<VacationRequestApi[]>(
        `/api/vacations/requests?employee_id=${employeeId}`
      ),
    ])
      .then(([entries, reqs]) => {
        setRows(entries);
        setRequests(reqs);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar")
      );
  }, [employeeId, reloadToken]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (rows === null || requests === null) return <CircularProgress size={20} />;

  const accrued = rows
    .filter((r) => r.days > 0)
    .reduce((acc, r) => acc + r.days, 0);
  const taken = rows.filter((r) => r.days < 0).reduce((acc, r) => acc - r.days, 0);

  return (
    <Stack spacing={3}>
      <Box>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle1" fontWeight={700}>
            Saldo
          </Typography>
          <Button size="small" variant="contained" onClick={() => setShowForm(true)}>
            Solicitar vacaciones
          </Button>
        </Stack>
        <Alert severity="info" sx={{ mb: 2 }}>
          Saldo computado como suma simple del libro. El cálculo legal con
          prescripción y vacaciones progresivas no está implementado.
        </Alert>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          <SummaryCard label="(+) Acumuladas" value={`${accrued.toFixed(1)} días`} />
          <SummaryCard label="(-) Tomadas" value={`${taken.toFixed(1)} días`} />
          <SummaryCard
            label="(=) Total saldo"
            value={`${summaryDays.toFixed(1)} días`}
            highlight
          />
        </Box>
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Solicitudes
        </Typography>
        {requests.length === 0 ? (
          <Alert severity="info">Sin solicitudes registradas.</Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Período</TableCell>
                  <TableCell align="right">Días</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Notas</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {formatDate(r.start_date)} → {formatDate(r.end_date)}
                    </TableCell>
                    <TableCell align="right">{r.days.toFixed(1)}</TableCell>
                    <TableCell>
                      <Chip
                        label={
                          r.status === "pending"
                            ? "Pendiente"
                            : r.status === "approved"
                            ? "Aprobada"
                            : r.status === "rejected"
                            ? "Rechazada"
                            : "Cancelada"
                        }
                        size="small"
                        color={
                          r.status === "approved"
                            ? "success"
                            : r.status === "pending"
                            ? "warning"
                            : r.status === "rejected"
                            ? "error"
                            : "default"
                        }
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {r.notes ?? "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Movimientos del libro
        </Typography>
        {rows.length === 0 ? (
          <Alert severity="info">Sin movimientos en el libro.</Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Días</TableCell>
                  <TableCell>Periodo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.occurred_on)}</TableCell>
                    <TableCell>{r.kind}</TableCell>
                    <TableCell align="right">{r.days.toFixed(1)}</TableCell>
                    <TableCell>{r.period_label ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <SolicitudForm
        open={showForm}
        fixedEmployeeId={employeeId}
        onClose={() => setShowForm(false)}
        onCreated={() => {
          setShowForm(false);
          setReloadToken((t) => t + 1);
        }}
      />
    </Stack>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        textAlign: "center",
        bgcolor: highlight ? "primary.light" : "background.paper",
        color: highlight ? "primary.contrastText" : "text.primary",
      }}
    >
      <Typography variant="caption" fontWeight={700}>
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {value}
      </Typography>
    </Paper>
  );
}

// ── Placeholder tabs ─────────────────────────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <Alert severity="info">
      <strong>{label}</strong> — esta sección estará disponible próximamente.
      Aun no hay datos ni lógica detrás.
    </Alert>
  );
}
