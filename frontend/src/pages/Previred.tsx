import { Alert, Stack, Typography } from "@mui/material";

export default function PreviredPage() {
  return (
    <Stack spacing={2}>
      <Typography variant="h5" fontWeight={600}>
        Previred
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Generacion de la planilla mensual de cotizaciones para subir manualmente a previred.cl.
      </Typography>

      <Alert severity="info">
        El generador del archivo Previred no esta implementado en esta version. Cuando este disponible, producira un archivo descargable que tu subes manualmente a previred.cl. PymeOS no se conecta directamente a Previred ni envia datos a servicios externos.
      </Alert>
    </Stack>
  );
}
