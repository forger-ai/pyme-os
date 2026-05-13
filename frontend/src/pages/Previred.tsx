import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
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
import DownloadIcon from "@mui/icons-material/Download";
import { API_BASE_URL, ApiError, get } from "../api/client";
import CompanySettingsPanel from "./previred/CompanySettingsPanel";
import IndicatorRatesPanel from "./previred/IndicatorRatesPanel";

type ClosedPeriod = {
  id: string;
  year: number;
  month: number;
  label: string;
  closed_at: string | null;
};

export default function PreviredPage() {
  const [periods, setPeriods] = useState<ClosedPeriod[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<ClosedPeriod[]>("/api/previred/closed-periods")
      .then(setPeriods)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar")
      );
  }, []);

  const downloadCsv = (id: string) => {
    window.open(`${API_BASE_URL}/api/previred/${id}/export.csv`, "_blank");
  };
  const downloadTxt = (id: string) => {
    window.open(`${API_BASE_URL}/api/previred/${id}/export.txt`, "_blank");
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Previred
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Planilla de auditoría con cotizaciones por colaborador. Solo disponible
          para periodos cerrados.
        </Typography>
      </Box>

      <CompanySettingsPanel />
      <IndicatorRatesPanel />

      {error && <Alert severity="error">{error}</Alert>}
      {periods === null && !error && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {periods && periods.length === 0 && (
        <Alert severity="info">
          Aún no hay periodos cerrados. Cierra un periodo desde la pestaña
          Liquidaciones para habilitar la descarga.
        </Alert>
      )}

      {periods && periods.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Cerrado el</TableCell>
                  <TableCell align="right">Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {p.label}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {p.closed_at
                        ? new Date(p.closed_at).toLocaleString("es-CL", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          startIcon={<DownloadIcon />}
                          onClick={() => downloadCsv(p.id)}
                          variant="outlined"
                        >
                          CSV
                        </Button>
                        <Button
                          size="small"
                          startIcon={<DownloadIcon />}
                          onClick={() => downloadTxt(p.id)}
                          variant="contained"
                        >
                          .txt
                        </Button>
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
