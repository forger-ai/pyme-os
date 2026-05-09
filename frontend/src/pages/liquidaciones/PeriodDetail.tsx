import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import DownloadIcon from "@mui/icons-material/Download";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { API_BASE_URL, ApiError, get, request } from "../../api/client";
import { formatCLP } from "../empleados/format";
import PayslipEditor from "./PayslipEditor";
import type { Period, PayslipRowApi } from "./types";

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
  period: Period;
  onBack: () => void;
};

export default function PeriodDetail({ period, onBack }: Props) {
  const [rows, setRows] = useState<PayslipRowApi[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<boolean>(false);
  const [closing, setClosing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState<number>(0);
  const [periodState, setPeriodState] = useState<Period>(period);

  useEffect(() => {
    setRows(null);
    setError(null);
    get<PayslipRowApi[]>(`/api/payroll/periods/${periodState.id}/payslips`)
      .then(setRows)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar")
      );
  }, [periodState.id, reloadToken]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await request<{ created: number; skipped_existing: number }>(
        `/api/payroll/periods/${periodState.id}/generate`,
        { method: "POST", body: {} }
      );
      setReloadToken((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al generar");
    } finally {
      setGenerating(false);
    }
  };

  const closePeriod = async () => {
    if (
      !confirm(
        `Cerrar el período emite todas las liquidaciones en borrador y bloquea la edición. ¿Continuar?`
      )
    )
      return;
    setClosing(true);
    setError(null);
    try {
      const res = await request<{
        period_id: string;
        closed_at: string;
        issued_count: number;
        already_issued_count: number;
      }>(`/api/payroll/periods/${periodState.id}/close`, {
        method: "POST",
        body: {},
      });
      setPeriodState({ ...periodState, closed_at: res.closed_at });
      setReloadToken((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cerrar período");
    } finally {
      setClosing(false);
    }
  };

  const downloadPreviredCsv = () => {
    window.open(`${API_BASE_URL}/api/previred/${periodState.id}/export.csv`, "_blank");
  };

  const downloadPreviredTxt = () => {
    window.open(`${API_BASE_URL}/api/previred/${periodState.id}/export.txt`, "_blank");
  };

  const reopenPeriod = async () => {
    const monthLabel = `${MONTHS[periodState.month - 1]} ${periodState.year}`;
    const confirmation = prompt(
      `Reabrir ${monthLabel} revertirá TODAS las liquidaciones emitidas a borrador. ` +
        `Cualquier archivo Previred descargado quedará desactualizado.\n\n` +
        `Para confirmar, escribe REABRIR (en mayúsculas):`
    );
    if (confirmation !== "REABRIR") return;
    setClosing(true);
    setError(null);
    try {
      await request<{ payslips_reverted: number }>(
        `/api/payroll/periods/${periodState.id}/reopen`,
        { method: "POST", body: {} }
      );
      setPeriodState({ ...periodState, closed_at: null });
      setReloadToken((t) => t + 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al reabrir");
    } finally {
      setClosing(false);
    }
  };

  const totals = rows?.reduce(
    (acc, r) => ({
      gross: acc.gross + (r.gross_salary_clp ?? 0),
      net: acc.net + (r.net_salary_clp ?? 0),
      cost: acc.cost + (r.employer_cost_clp ?? 0),
    }),
    { gross: 0, net: 0, cost: 0 }
  );

  return (
    <Stack spacing={2}>
      <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ alignSelf: "flex-start" }}>
        Volver a periodos
      </Button>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5" fontWeight={700}>
              {MONTHS[periodState.month - 1]} {periodState.year}
            </Typography>
            {periodState.closed_at && (
              <Chip
                icon={<LockIcon sx={{ fontSize: 14 }} />}
                label="Cerrado"
                size="small"
                color="success"
                variant="outlined"
              />
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Constantes año {periodState.constants_year}
            {periodState.closed_at ? ` · Cerrado el ${new Date(periodState.closed_at).toLocaleDateString("es-CL")}` : " · En curso"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {!periodState.closed_at && (
            <>
              <Button
                variant="outlined"
                startIcon={<AutoAwesomeIcon />}
                disabled={generating || closing}
                onClick={generate}
              >
                {generating ? "Generando…" : "Generar liquidaciones"}
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<LockIcon />}
                disabled={
                  closing ||
                  generating ||
                  !rows ||
                  rows.length === 0
                }
                onClick={closePeriod}
              >
                {closing ? "Cerrando…" : "Cerrar período"}
              </Button>
            </>
          )}
          {periodState.closed_at && (
            <>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={downloadPreviredCsv}
              >
                CSV auditoría
              </Button>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={downloadPreviredTxt}
              >
                Previred (.txt)
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<LockOpenIcon />}
                disabled={closing}
                onClick={reopenPeriod}
              >
                Reabrir
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {rows === null && !error && (
        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {rows && rows.length === 0 && (
        <Alert severity="info">
          Este periodo no tiene liquidaciones aún. Usa "Generar liquidaciones" para
          crearlas a partir del contrato vigente de cada colaborador.
        </Alert>
      )}

      {rows && rows.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Colaborador</TableCell>
                  <TableCell>Cargo</TableCell>
                  <TableCell align="center">Días</TableCell>
                  <TableCell align="right">Imponible</TableCell>
                  <TableCell align="right">Líquido</TableCell>
                  <TableCell align="right">Costo empresa</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => setEditingId(row.id)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} color="primary.main">
                        {row.employee_name}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.cargo ?? "—"}</TableCell>
                    <TableCell align="center">
                      {row.days_worked < 30 ? (
                        <Chip
                          label={`${row.days_worked} d`}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      ) : (
                        row.days_worked
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {formatCLP(row.gross_salary_clp)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCLP(row.net_salary_clp)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCLP(row.employer_cost_clp)}
                    </TableCell>
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
                {totals && (
                  <TableRow sx={{ bgcolor: "background.default" }}>
                    <TableCell colSpan={3}>
                      <Typography variant="body2" fontWeight={700}>
                        Totales del periodo ({rows.length})
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}>
                        {formatCLP(totals.gross)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}>
                        {formatCLP(totals.net)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={700}>
                        {formatCLP(totals.cost)}
                      </Typography>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <PayslipEditor
        payslipId={editingId}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          setReloadToken((t) => t + 1);
        }}
      />
    </Stack>
  );
}
