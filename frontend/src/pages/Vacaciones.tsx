import { Alert, Stack, Typography } from "@mui/material";

export default function VacacionesPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={600}>
        Vacaciones
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Registro de vacaciones devengadas, usadas y proporcionales por empleado.
      </Typography>

      <Alert severity="info">
        En esta version puedes registrar entradas en el libro de vacaciones (devengadas, usadas, ajustes). El calculo del saldo legal con feriado progresivo y prescripcion se implementa en una proxima version.
      </Alert>
    </Stack>
  );
}
