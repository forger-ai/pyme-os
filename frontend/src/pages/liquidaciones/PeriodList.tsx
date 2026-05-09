import { useEffect, useState } from "react";
import {
  Alert,
  Box,
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
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ApiError, get } from "../../api/client";
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
  onSelect: (period: Period) => void;
};

export default function PeriodList({ onSelect }: Props) {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<Period[]>("/api/payslips/periods")
      .then((data) =>
        setPeriods(
          [...data].sort((a, b) =>
            b.year !== a.year ? b.year - a.year : b.month - a.month
          )
        )
      )
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar")
      );
  }, []);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5" fontWeight={700}>
          Liquidaciones
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Periodos mensuales de remuneraciones. Clic en un periodo para ver y editar las liquidaciones de cada colaborador.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {periods === null && !error && (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {periods && periods.length === 0 && (
        <Alert severity="info">Aun no hay periodos registrados.</Alert>
      )}

      {periods && periods.length > 0 && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Constantes</TableCell>
                  <TableCell>Cerrado</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {periods.map((p) => (
                  <TableRow
                    key={p.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => onSelect(p)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {MONTHS[p.month - 1]} {p.year}
                      </Typography>
                    </TableCell>
                    <TableCell>{p.constants_year}</TableCell>
                    <TableCell>{p.closed_at ?? "—"}</TableCell>
                    <TableCell align="right">
                      <ChevronRightIcon fontSize="small" color="action" />
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
