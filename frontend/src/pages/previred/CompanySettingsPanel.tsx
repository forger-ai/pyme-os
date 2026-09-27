import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/EditOutlined";
import CheckIcon from "@mui/icons-material/CheckOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import { ApiError, request } from "../../api/client";

type EconomicActivity = {
  code: string;
  name: string;
  additional_rate: number;
  ciiu_section: string | null;
  examples: string | null;
};

type CompanySettings = {
  economic_activity_code: string | null;
  mutual_additional_rate_override: number | null;
  effective_mutual_additional_rate: number;
  effective_mutual_rate: number;
  activities: EconomicActivity[];
  additional_rate_tiers: number[];
};

const OTHER_CODE = "otro";

const fmtPct = (rate: number): string => `${(rate * 100).toFixed(2)}%`;

export default function CompanySettingsPanel() {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [overridePct, setOverridePct] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    request<CompanySettings>("/api/settings/company")
      .then(setSettings)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar configuración")
      );
  };

  useEffect(() => {
    load();
  }, []);

  const currentActivity = useMemo(() => {
    if (!settings || !settings.economic_activity_code) return null;
    if (settings.economic_activity_code === OTHER_CODE) return null;
    return (
      settings.activities.find(
        (a) => a.code === settings.economic_activity_code
      ) ?? null
    );
  }, [settings]);

  const beginEdit = () => {
    if (!settings) return;
    setSelectedCode(settings.economic_activity_code ?? "");
    setOverridePct(
      settings.mutual_additional_rate_override !== null
        ? (settings.mutual_additional_rate_override * 100).toString()
        : ""
    );
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSelectedCode("");
    setOverridePct("");
  };

  const save = async () => {
    if (!selectedCode) return;
    const body: {
      economic_activity_code: string;
      mutual_additional_rate_override?: number;
    } = { economic_activity_code: selectedCode };
    if (selectedCode === OTHER_CODE) {
      const numeric = Number(overridePct);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10) {
        setError(
          "Ingresa una tasa adicional válida entre 0% y 10%."
        );
        return;
      }
      body.mutual_additional_rate_override = numeric / 100;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await request<CompanySettings>("/api/settings/company", {
        method: "PATCH",
        body,
      });
      setSettings(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  if (settings === null && !error) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <CircularProgress size={18} />
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Datos de la empresa
        </Typography>
        {settings && !editing && (
          <Button
            size="small"
            startIcon={<EditIcon />}
            onClick={beginEdit}
            variant="text"
          >
            {settings.economic_activity_code ? "Cambiar rubro" : "Configurar rubro"}
          </Button>
        )}
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {settings && !editing && (
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Rubro / actividad económica
            </Typography>
            <Typography variant="body1">
              {settings.economic_activity_code === OTHER_CODE
                ? "Otro (tasa ingresada manualmente)"
                : currentActivity
                ? currentActivity.name
                : "Sin configurar"}
            </Typography>
            {currentActivity?.examples && (
              <Typography variant="caption" color="text.secondary">
                Ej.: {currentActivity.examples}
              </Typography>
            )}
          </Box>
          <Divider />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Tasa Mutual aplicada
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="baseline"
              flexWrap="wrap"
            >
              <Typography variant="h6" fontWeight={700}>
                {fmtPct(settings.effective_mutual_rate)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                0,93% base + {fmtPct(settings.effective_mutual_additional_rate)}{" "}
                cotización adicional (D.S. 110)
              </Typography>
            </Stack>
            {!settings.economic_activity_code && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Sin rubro configurado se usa solo la base 0,93%. Configura el
                rubro para reflejar el costo Mutual real en liquidaciones y
                costo empresa.
              </Alert>
            )}
          </Box>
        </Stack>
      )}

      {settings && editing && (
        <Stack spacing={2}>
          <TextField
            label="Rubro de la empresa"
            select
            size="small"
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            fullWidth
            helperText={
              selectedCode && selectedCode !== OTHER_CODE
                ? settings.activities.find((a) => a.code === selectedCode)
                    ?.examples ?? ""
                : selectedCode === OTHER_CODE
                ? "Ingresa la tasa adicional informada por tu Mutual."
                : "Selecciona el rubro que mejor describe tu empresa."
            }
          >
            {settings.activities.map((a) => (
              <MenuItem key={a.code} value={a.code}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  sx={{ width: "100%" }}
                  spacing={2}
                >
                  <span>{a.name}</span>
                  <Chip
                    size="small"
                    label={`+${fmtPct(a.additional_rate)}`}
                    variant="outlined"
                  />
                </Stack>
              </MenuItem>
            ))}
            <MenuItem value={OTHER_CODE}>
              Otro / no aparece en la lista
            </MenuItem>
          </TextField>

          {selectedCode === OTHER_CODE && (
            <TextField
              label="Tasa adicional (%)"
              size="small"
              type="number"
              inputProps={{ step: "0.01", min: 0, max: 10 }}
              value={overridePct}
              onChange={(e) => setOverridePct(e.target.value)}
              helperText="Ejemplo: 1,70 para 1,70%."
            />
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <IconButton onClick={cancelEdit} disabled={saving} size="small">
              <CloseIcon />
            </IconButton>
            <Button
              variant="contained"
              size="small"
              startIcon={
                saving ? <CircularProgress size={14} /> : <CheckIcon />
              }
              onClick={save}
              disabled={saving || !selectedCode}
            >
              Guardar
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
