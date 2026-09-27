import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/RefreshOutlined";
import { ApiError, request } from "../../api/client";

type RateSnapshot = {
  code: string;
  value_clp: number;
  snapshot_date: string;
  source: string;
  fetched_at: string | null;
  stale: boolean;
};

type CurrentRates = {
  uf: RateSnapshot | null;
  utm: RateSnapshot | null;
};

const fmtCLP = (value: number, fractionDigits = 2): string =>
  `$${value.toLocaleString("es-CL", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};

const fmtFetched = (iso: string | null): string | null => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export default function IndicatorRatesPanel() {
  const [rates, setRates] = useState<CurrentRates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    request<CurrentRates>("/api/payroll/rates")
      .then(setRates)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar indicadores")
      );
  };

  useEffect(() => {
    load();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const fresh = await request<CurrentRates>("/api/payroll/rates/refresh", {
        method: "POST",
      });
      setRates(fresh);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "No se pudo actualizar (sin conexión a mindicador.cl)"
      );
    } finally {
      setRefreshing(false);
    }
  };

  if (rates === null && !error) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <CircularProgress size={18} />
      </Paper>
    );
  }

  const anyStale =
    (rates?.uf?.stale ?? true) || (rates?.utm?.stale ?? true);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Stack>
          <Typography variant="subtitle1" fontWeight={700}>
            Indicadores económicos
          </Typography>
          <Typography variant="caption" color="text.secondary">
            UF y UTM aplicados al cálculo de liquidaciones y costo empresa.
          </Typography>
        </Stack>
        <Button
          size="small"
          variant="outlined"
          startIcon={
            refreshing ? <CircularProgress size={14} /> : <RefreshIcon />
          }
          onClick={refresh}
          disabled={refreshing}
        >
          Actualizar
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {anyStale && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Estás usando valores por defecto del archivo de constantes.
          "Actualizar" trae el valor del día desde mindicador.cl.
        </Alert>
      )}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        divider={<Divider orientation="vertical" flexItem />}
      >
        <RateBlock label="UF" snapshot={rates?.uf ?? null} />
        <RateBlock label="UTM" snapshot={rates?.utm ?? null} />
      </Stack>
    </Paper>
  );
}

function RateBlock({
  label,
  snapshot,
}: {
  label: string;
  snapshot: RateSnapshot | null;
}) {
  if (!snapshot) {
    return (
      <Box sx={{ flex: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2">—</Typography>
      </Box>
    );
  }
  const fetched = fmtFetched(snapshot.fetched_at);
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label} · {fmtDate(snapshot.snapshot_date)}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {fmtCLP(snapshot.value_clp, label === "UF" ? 2 : 0)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {snapshot.stale
          ? `Fallback: ${snapshot.source}`
          : `Fuente: ${snapshot.source}${fetched ? ` · actualizado ${fetched}` : ""}`}
      </Typography>
    </Box>
  );
}
