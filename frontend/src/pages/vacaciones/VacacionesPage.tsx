import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import { ApiError, get, request } from "../../api/client";
import { formatDate } from "../empleados/format";
import CalendarioTab from "./CalendarioTab";
import SolicitudForm from "./SolicitudForm";
import type {
  EmployeeBalance,
  VacationRequestApi,
  VacationRequestStatus,
} from "./types";

type TabId = "saldos" | "calendario" | "solicitudes";

const STATUS_LABELS: Record<VacationRequestStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<
  VacationRequestStatus,
  "default" | "warning" | "success" | "error"
> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "default",
};

export default function VacacionesPage() {
  const [tab, setTab] = useState<TabId>("saldos");
  const [showForm, setShowForm] = useState<boolean>(false);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Vacaciones
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Saldos por colaborador y solicitudes de vacaciones.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowForm(true)}
        >
          Nueva solicitud
        </Button>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as TabId)}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="saldos" label="Saldos" />
        <Tab value="calendario" label="Calendario" />
        <Tab value="solicitudes" label="Solicitudes" />
      </Tabs>

      {tab === "saldos" && <SaldosTab />}
      {tab === "calendario" && <CalendarioTab />}
      {tab === "solicitudes" && <SolicitudesTab />}

      <SolicitudForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => {
          setShowForm(false);
          // Move to solicitudes tab to show the new one.
          setTab("solicitudes");
        }}
      />
    </Stack>
  );
}

// ── Saldos ───────────────────────────────────────────────────────────────────

function SaldosTab() {
  const [rows, setRows] = useState<EmployeeBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<EmployeeBalance[]>("/api/vacations/balances")
      .then(setRows)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar")
      );
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (rows === null)
    return (
      <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={20} />
      </Box>
    );
  if (rows.length === 0)
    return <Alert severity="info">Sin colaboradores activos.</Alert>;

  const totalAccrued = rows.reduce((a, r) => a + r.accrued_days, 0);
  const totalTaken = rows.reduce((a, r) => a + r.taken_days, 0);
  const totalPending = rows.reduce((a, r) => a + r.pending_days, 0);
  const totalBalance = rows.reduce((a, r) => a + r.balance_days, 0);

  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Colaborador</TableCell>
              <TableCell>Cargo</TableCell>
              <TableCell align="right">Acumulados</TableCell>
              <TableCell align="right">Tomados</TableCell>
              <TableCell align="right">Por usar (futuras)</TableCell>
              <TableCell align="right">Saldo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.employee_id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {row.employee_name}
                  </Typography>
                </TableCell>
                <TableCell>{row.cargo ?? "—"}</TableCell>
                <TableCell align="right">{row.accrued_days.toFixed(1)}</TableCell>
                <TableCell align="right">{row.taken_days.toFixed(1)}</TableCell>
                <TableCell align="right">
                  {row.pending_days > 0 ? (
                    <Chip
                      size="small"
                      label={`${row.pending_days.toFixed(1)} d`}
                      color="info"
                      variant="outlined"
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    color={row.balance_days < 0 ? "error.main" : "text.primary"}
                  >
                    {row.balance_days.toFixed(1)} días
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: "background.default" }}>
              <TableCell colSpan={2}>
                <Typography variant="body2" fontWeight={700}>
                  Totales ({rows.length})
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700}>
                  {totalAccrued.toFixed(1)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700}>
                  {totalTaken.toFixed(1)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700}>
                  {totalPending.toFixed(1)}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2" fontWeight={700}>
                  {totalBalance.toFixed(1)} días
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

// ── Solicitudes ──────────────────────────────────────────────────────────────

function SolicitudesTab() {
  const [filter, setFilter] = useState<VacationRequestStatus | "all">("pending");
  const [rows, setRows] = useState<VacationRequestApi[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);

  useEffect(() => {
    setRows(null);
    const url =
      filter === "all"
        ? "/api/vacations/requests"
        : `/api/vacations/requests?status=${filter}`;
    get<VacationRequestApi[]>(url)
      .then(setRows)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar")
      );
  }, [filter, reloadToken]);

  const counts = useMemo(() => {
    if (!rows) return { all: 0 };
    return { all: rows.length };
  }, [rows]);

  const decide = async (
    id: string,
    action: "approve" | "reject" | "cancel"
  ) => {
    const labels: Record<typeof action, string> = {
      approve: "aprobar",
      reject: "rechazar",
      cancel: "cancelar",
    };
    if (!confirm(`¿Estás seguro de ${labels[action]} esta solicitud?`)) return;
    try {
      await request(`/api/vacations/requests/${id}/${action}`, {
        method: "POST",
        body: { decision_notes: null },
      });
      setReloadToken((t) => t + 1);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Error al ejecutar la acción");
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Filtrar por estado:
        </Typography>
        <Select
          size="small"
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as VacationRequestStatus | "all")
          }
        >
          <MenuItem value="all">Todas</MenuItem>
          <MenuItem value="pending">Pendientes</MenuItem>
          <MenuItem value="approved">Aprobadas</MenuItem>
          <MenuItem value="rejected">Rechazadas</MenuItem>
          <MenuItem value="cancelled">Canceladas</MenuItem>
        </Select>
        {rows && (
          <Typography variant="caption" color="text.secondary">
            {counts.all} solicitud{counts.all === 1 ? "" : "es"}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {rows === null && !error && (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {rows && rows.length === 0 && (
        <Alert severity="info">Sin solicitudes con el filtro elegido.</Alert>
      )}

      {rows && rows.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Colaborador</TableCell>
                  <TableCell>Período</TableCell>
                  <TableCell align="right">Días</TableCell>
                  <TableCell>Notas</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {r.employee_name}
                      </Typography>
                      {r.cargo && (
                        <Typography variant="caption" color="text.secondary">
                          {r.cargo}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDate(r.start_date)} → {formatDate(r.end_date)}
                    </TableCell>
                    <TableCell align="right">{r.days.toFixed(1)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {r.notes ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[r.status]}
                        size="small"
                        color={STATUS_COLORS[r.status]}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {r.status === "pending" && (
                          <>
                            <Tooltip title="Aprobar">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={() => decide(r.id, "approve")}
                              >
                                <CheckIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Rechazar">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => decide(r.id, "reject")}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {(r.status === "pending" ||
                          r.status === "approved") && (
                          <Tooltip title="Cancelar">
                            <IconButton
                              size="small"
                              onClick={() => decide(r.id, "cancel")}
                            >
                              <UndoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}
