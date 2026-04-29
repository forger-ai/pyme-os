import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { get } from "../api/client";

type Period = {
  id: string;
  year: number;
  month: number;
  constants_year: number;
  closed_at: string | null;
};

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function LiquidacionesPage() {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<Period[]>("/api/payslips/periods")
      .then(setPeriods)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={600}>
        Liquidaciones
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Periodos mensuales de remuneraciones. El motor de calculo bruto a liquido aun no esta implementado en esta version.
      </Typography>

      <Alert severity="info">
        En esta version puedes registrar periodos y empleados. El calculo automatico de AFP, salud, cesantia e impuesto unico se implementa en una proxima version.
      </Alert>

      {error && <Alert severity="error">{error}</Alert>}

      {periods === null && !error && (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {periods && periods.length === 0 && (
        <Alert severity="info">Aun no hay periodos creados.</Alert>
      )}

      {periods && periods.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Periodo</TableCell>
                <TableCell>Constantes (anio)</TableCell>
                <TableCell>Cerrado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {periods.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{MONTHS[p.month - 1]} {p.year}</TableCell>
                  <TableCell>{p.constants_year}</TableCell>
                  <TableCell>{p.closed_at ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
