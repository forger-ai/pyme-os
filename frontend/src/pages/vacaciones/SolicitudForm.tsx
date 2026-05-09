import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import { ApiError, get, request } from "../../api/client";
import type { VacationRequestApi } from "./types";

type EmployeeOption = { id: string; full_name: string; cargo: string | null };

type Props = {
  open: boolean;
  /** When set, the form pre-fills + locks this employee. */
  fixedEmployeeId?: string | null;
  onClose: () => void;
  onCreated: (req: VacationRequestApi) => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function calcDays(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return diff < 0 ? 0 : Math.floor(diff) + 1;
}

export default function SolicitudForm({
  open,
  fixedEmployeeId,
  onClose,
  onCreated,
}: Props) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [start, setStart] = useState<string>(todayIso());
  const [end, setEnd] = useState<string>(todayIso());
  const [days, setDays] = useState<string>("1");
  const [autoDays, setAutoDays] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStart(todayIso());
    setEnd(todayIso());
    setDays("1");
    setAutoDays(true);
    setNotes("");
    setEmployeeId(fixedEmployeeId ?? "");
    if (fixedEmployeeId) return;
    get<{ items: EmployeeOption[] }>("/api/employees?vigentes=true&limit=500")
      .then((d) => setEmployees(d.items))
      .catch(() => setEmployees([]));
  }, [open, fixedEmployeeId]);

  // Auto-recompute days when start/end change (unless user manually edited).
  const computedDays = useMemo(() => calcDays(start, end), [start, end]);
  useEffect(() => {
    if (autoDays) {
      setDays(String(computedDays));
    }
  }, [computedDays, autoDays]);

  const submit = async () => {
    if (!employeeId) {
      setError("Selecciona un colaborador");
      return;
    }
    if (!start || !end) {
      setError("Indica fecha de inicio y término");
      return;
    }
    if (Number(days) <= 0) {
      setError("Los días deben ser mayor a 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await request<VacationRequestApi>(
        "/api/vacations/requests",
        {
          method: "POST",
          body: {
            employee_id: employeeId,
            start_date: start,
            end_date: end,
            days: Number(days),
            notes: notes.trim() || null,
          },
        }
      );
      onCreated(created);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al crear solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={submitting ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
    >
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="h6" fontWeight={700}>
            Nueva solicitud de vacaciones
          </Typography>
          <IconButton onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2} sx={{ mt: 1, flex: 1, overflowY: "auto" }}>
          {fixedEmployeeId ? (
            <Alert severity="info">
              Solicitud para{" "}
              <strong>
                {employees.find((e) => e.id === fixedEmployeeId)?.full_name ??
                  "este colaborador"}
              </strong>
            </Alert>
          ) : (
            <TextField
              select
              label="Colaborador"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              size="small"
              required
            >
              <MenuItem value="">— Seleccionar —</MenuItem>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.full_name}
                  {emp.cargo ? ` · ${emp.cargo}` : ""}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField
              label="Desde"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              required
            />
            <TextField
              label="Hasta"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              required
            />
          </Box>

          <TextField
            label="Días"
            type="number"
            value={days}
            onChange={(e) => {
              setAutoDays(false);
              setDays(e.target.value);
            }}
            size="small"
            helperText={
              autoDays
                ? "Calculado: días calendario en el rango. Edítalo si necesitas otra cantidad."
                : "Editado manualmente."
            }
          />

          <TextField
            label="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            size="small"
            multiline
            minRows={2}
            placeholder="Motivo, eventos especiales, etc."
          />
        </Stack>

        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            startIcon={
              submitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SaveIcon />
              )
            }
            onClick={submit}
            disabled={submitting}
          >
            Crear solicitud
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
