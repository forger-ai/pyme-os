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
import AddIcon from "@mui/icons-material/AddOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { ApiError, get } from "../../api/client";
import type { Period } from "./types";
import CreatePeriodDialog from "./CreatePeriodDialog";

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

const sortPeriods = (data: Period[]): Period[] =>
  [...data].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  );

export default function PeriodList({ onSelect }: Props) {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    get<Period[]>("/api/payslips/periods")
      .then((data) => setPeriods(sortPeriods(data)))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar")
      );
  }, []);

  const onCreated = (created: Period) => {
    setPeriods((prev) => sortPeriods([...(prev ?? []), created]));
    setCreateOpen(false);
    onSelect(created);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Liquidaciones
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Periodos mensuales de remuneraciones. Clic en un periodo para ver y editar las liquidaciones de cada colaborador.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          disabled={periods === null}
        >
          Crear periodo
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {periods === null && !error && (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {periods && periods.length === 0 && (
        <Alert severity="info">
          Aun no hay periodos registrados. Crea el primero con el botón
          "Crear periodo".
        </Alert>
      )}

      <CreatePeriodDialog
        open={createOpen}
        existing={periods ?? []}
        onClose={() => setCreateOpen(false)}
        onCreated={onCreated}
      />

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
