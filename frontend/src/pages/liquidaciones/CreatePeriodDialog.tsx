import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ApiError, request } from "../../api/client";
import type { Period } from "./types";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type Props = {
  open: boolean;
  existing: Period[];
  onClose: () => void;
  onCreated: (period: Period) => void;
};

const currentYearMonth = (): { year: number; month: number } => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

export default function CreatePeriodDialog({
  open,
  existing,
  onClose,
  onCreated,
}: Props) {
  const [year, setYear] = useState<number>(() => currentYearMonth().year);
  const [month, setMonth] = useState<number>(() => currentYearMonth().month);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const now = currentYearMonth();
      setYear(now.year);
      setMonth(now.month);
      setError(null);
    }
  }, [open]);

  const taken = new Set(existing.map((p) => `${p.year}-${p.month}`));
  const isTaken = taken.has(`${year}-${month}`);

  const years = (() => {
    const base = currentYearMonth().year;
    return [base - 1, base, base + 1];
  })();

  const submit = async () => {
    if (isTaken) {
      setError("Ya existe un periodo para ese mes.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await request<Period>("/api/payslips/periods", {
        method: "POST",
        body: { year, month },
      });
      onCreated(created);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo crear el periodo. Intenta nuevamente."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nuevo periodo</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Elige el mes y año al que corresponden las liquidaciones. Las
            constantes legales (UF, AFP, tope imponible, etc.) se toman del
            archivo del mismo año.
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Mes"
              select
              size="small"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              fullWidth
            >
              {MONTHS.map((name, idx) => (
                <MenuItem key={idx + 1} value={idx + 1}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Año"
              select
              size="small"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              fullWidth
            >
              {years.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {isTaken && (
            <Alert severity="warning">
              Ya existe un periodo para {MONTHS[month - 1]} {year}.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={submitting || isTaken}
          startIcon={submitting ? <CircularProgress size={14} /> : undefined}
        >
          Crear periodo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
