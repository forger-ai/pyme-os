import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Chip,
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

type Employee = {
  id: string;
  rut: string;
  first_name: string;
  last_name: string;
  email: string | null;
  hire_date: string;
  status: "active" | "on_leave" | "terminated";
};

export default function EmpleadosPage() {
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<Employee[]>("/api/employees")
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={600}>
        Empleados
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Ficha de cada trabajador con datos personales, contrato vigente y estado.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {rows === null && !error && (
        <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}

      {rows && rows.length === 0 && (
        <Alert severity="info">
          Aun no hay empleados registrados. Comienza agregando la primera ficha.
        </Alert>
      )}

      {rows && rows.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>RUT</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Correo</TableCell>
                <TableCell>Ingreso</TableCell>
                <TableCell>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.rut}</TableCell>
                  <TableCell>{row.first_name} {row.last_name}</TableCell>
                  <TableCell>{row.email ?? "-"}</TableCell>
                  <TableCell>{row.hire_date}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={row.status}
                      color={row.status === "active" ? "success" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
