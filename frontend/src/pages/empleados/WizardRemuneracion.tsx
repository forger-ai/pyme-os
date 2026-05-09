import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/AddCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import { ApiError, request } from "../../api/client";
import { formatCLP } from "./format";
import type {
  Anchor,
  AfpOption,
  HealthOption,
  NonImponibleItem,
  PayrollCatalogs,
  PreviewResponse,
} from "./payroll";
import type { ContractType } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Initial values from the parent EmpleadoForm so the wizard starts with
   * coherent context. The wizard never mutates these directly.
   */
  initial: {
    base_salary_clp: number;
    contract_type: ContractType;
    afp_code: string;
    health_code: string; // fonasa | banmedica | colmena | ...
    isapre_plan_uf: number;
    non_imponible_items: NonImponibleItem[];
  };
  /** Called when the user accepts: returns the resulting base salary plus the chosen AFP/health codes. */
  onApply: (result: {
    base_salary_clp: number;
    afp_code: string;
    health_code: string;
    health_kind: "fonasa" | "isapre";
    isapre_plan_uf: number;
    non_imponible_items: NonImponibleItem[];
  }) => void;
};

const ANCHOR_LABELS: Record<Anchor, string> = {
  base: "Fijar Base",
  liquido: "Fijar Líquido",
  costo_empresa: "Fijar Costo Empresa",
};

const ANCHOR_HELP: Record<Anchor, string> = {
  base: "Defines el sueldo base contractual; el sistema deriva líquido y costo empresa.",
  liquido:
    "Defines cuánto debe recibir el colaborador en mano; el sistema busca la base que produce ese líquido.",
  costo_empresa:
    "Defines cuánto te puede costar mensualmente; el sistema busca la base que cabe en ese costo total.",
};

export default function WizardRemuneracion({
  open,
  onClose,
  initial,
  onApply,
}: Props) {
  const [catalogs, setCatalogs] = useState<PayrollCatalogs | null>(null);
  const [catalogsError, setCatalogsError] = useState<string | null>(null);

  const [anchor, setAnchor] = useState<Anchor>("base");
  const [targetAmount, setTargetAmount] = useState<string>("");
  const [contractType, setContractType] = useState<ContractType>(
    initial.contract_type
  );
  const [afpCode, setAfpCode] = useState<string>(initial.afp_code || "habitat");
  const [healthCode, setHealthCode] = useState<string>(
    initial.health_code || "fonasa"
  );
  const [isaprePlanUf, setIsaprePlanUf] = useState<string>(
    initial.isapre_plan_uf > 0 ? String(initial.isapre_plan_uf) : ""
  );
  const [nonImponibles, setNonImponibles] = useState<NonImponibleItem[]>(
    initial.non_imponible_items ?? []
  );

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [computing, setComputing] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when reopening.
  useEffect(() => {
    if (!open) return;
    setAnchor("base");
    setTargetAmount(String(initial.base_salary_clp || ""));
    setContractType(initial.contract_type);
    setAfpCode(initial.afp_code || "habitat");
    setHealthCode(initial.health_code || "fonasa");
    setIsaprePlanUf(initial.isapre_plan_uf > 0 ? String(initial.isapre_plan_uf) : "");
    setNonImponibles(initial.non_imponible_items ?? []);
    setPreview(null);
    setPreviewError(null);
  }, [open, initial]);

  // Load catalogs once on open.
  useEffect(() => {
    if (!open || catalogs) return;
    request<PayrollCatalogs>("/api/payroll/catalogs")
      .then(setCatalogs)
      .catch((e: unknown) =>
        setCatalogsError(e instanceof ApiError ? e.message : "Error al cargar catálogos")
      );
  }, [open, catalogs]);

  const currentHealth: HealthOption | undefined = useMemo(
    () => catalogs?.health_options.find((h) => h.code === healthCode),
    [catalogs, healthCode]
  );
  const isIsapre = currentHealth?.kind === "isapre";

  // Debounced preview compute.
  useEffect(() => {
    if (!open || !catalogs) return;
    const numericTarget = Number(targetAmount);
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setPreview(null);
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setComputing(true);
      setPreviewError(null);
      request<PreviewResponse>("/api/payroll/preview", {
        method: "POST",
        body: {
          anchor,
          target_amount_clp: numericTarget,
          contract_type: contractType,
          afp_code: afpCode,
          health_provider: isIsapre ? "isapre" : "fonasa",
          isapre_plan_uf: isIsapre ? Number(isaprePlanUf) || 0 : 0,
          year: catalogs.year,
          uf_value_clp: catalogs.uf_default_clp,
          utm_value_clp: catalogs.utm_default_clp,
          include_gratification: true,
          non_imponible_items: nonImponibles
            .filter((it) => it.label.trim() && it.amount_clp > 0)
            .map((it) => ({
              label: it.label.trim(),
              amount_clp: Number(it.amount_clp) || 0,
            })),
        },
      })
        .then((r) => setPreview(r))
        .catch((e: unknown) => {
          setPreview(null);
          setPreviewError(e instanceof ApiError ? e.message : "Error al calcular");
        })
        .finally(() => setComputing(false));
    }, 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [
    open,
    catalogs,
    anchor,
    targetAmount,
    contractType,
    afpCode,
    healthCode,
    isaprePlanUf,
    isIsapre,
    nonImponibles,
  ]);

  const apply = () => {
    if (!preview || !currentHealth) return;
    onApply({
      base_salary_clp: Math.round(preview.base_salary_clp),
      afp_code: afpCode,
      health_code: healthCode,
      health_kind: currentHealth.kind,
      isapre_plan_uf: isIsapre ? Number(isaprePlanUf) || 0 : 0,
      non_imponible_items: nonImponibles
        .filter((it) => it.label.trim() && it.amount_clp > 0)
        .map((it) => ({
          label: it.label.trim(),
          amount_clp: Number(it.amount_clp) || 0,
        })),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Configurar remuneración
        <IconButton onClick={onClose} aria-label="Cerrar">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {catalogsError && <Alert severity="error">{catalogsError}</Alert>}
        {!catalogs && !catalogsError && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={20} />
          </Box>
        )}
        {catalogs && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1.4fr" },
              gap: 3,
            }}
          >
            <Stack spacing={2}>
              <Tabs
                value={anchor}
                onChange={(_, v) => setAnchor(v as Anchor)}
                variant="fullWidth"
              >
                <Tab value="base" label={ANCHOR_LABELS.base} />
                <Tab value="liquido" label={ANCHOR_LABELS.liquido} />
                <Tab value="costo_empresa" label={ANCHOR_LABELS.costo_empresa} />
              </Tabs>
              <Typography variant="caption" color="text.secondary">
                {ANCHOR_HELP[anchor]}
              </Typography>

              <TextField
                label={
                  anchor === "base"
                    ? "Sueldo base (CLP)"
                    : anchor === "liquido"
                    ? "Líquido objetivo (CLP)"
                    : "Costo empresa objetivo (CLP)"
                }
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                size="small"
                fullWidth
              />

              <Divider />

              <TextField
                label="Tipo de contrato"
                select
                value={contractType}
                onChange={(e) => setContractType(e.target.value as ContractType)}
                size="small"
              >
                <MenuItem value="indefinite">Indefinido</MenuItem>
                <MenuItem value="fixed_term">Plazo fijo</MenuItem>
                <MenuItem value="project_based">Por obra</MenuItem>
                <MenuItem value="part_time">Part-time</MenuItem>
              </TextField>

              <TextField
                label="AFP"
                select
                value={afpCode}
                onChange={(e) => setAfpCode(e.target.value)}
                size="small"
                helperText={
                  catalogs.afp_options.find((a) => a.code === afpCode)
                    ? `Tasa total: ${(
                        catalogs.afp_options.find((a) => a.code === afpCode)!
                          .total_rate * 100
                      ).toFixed(2)}%`
                    : undefined
                }
              >
                {catalogs.afp_options.map((a: AfpOption) => (
                  <MenuItem key={a.code} value={a.code}>
                    {a.name} — {(a.total_rate * 100).toFixed(2)}%
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Salud"
                select
                value={healthCode}
                onChange={(e) => setHealthCode(e.target.value)}
                size="small"
              >
                {catalogs.health_options.map((h: HealthOption) => (
                  <MenuItem key={h.code} value={h.code}>
                    {h.name}
                  </MenuItem>
                ))}
              </TextField>

              {isIsapre && (
                <TextField
                  label="Plan Isapre (UF / mes)"
                  type="number"
                  value={isaprePlanUf}
                  onChange={(e) => setIsaprePlanUf(e.target.value)}
                  size="small"
                  helperText="Si lo dejas vacío, se aplica el mínimo legal (7% imponible)."
                />
              )}

              <Divider />
              <NonImponibleEditor
                items={nonImponibles}
                onChange={setNonImponibles}
              />

              <Divider />
              <Typography variant="caption" color="text.secondary">
                Constantes año {catalogs.year} · UF ${" "}
                {catalogs.uf_default_clp.toLocaleString("es-CL")} · UTM ${" "}
                {catalogs.utm_default_clp.toLocaleString("es-CL")}
                {!catalogs.verified && " · sin verificar"}
              </Typography>
            </Stack>

            <Box>
              <PreviewPanel
                preview={preview}
                computing={computing}
                error={previewError}
                anchor={anchor}
              />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={apply}
          disabled={!preview || computing}
        >
          Aplicar a la ficha
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PreviewPanel({
  preview,
  computing,
  error,
  anchor,
}: {
  preview: PreviewResponse | null;
  computing: boolean;
  error: string | null;
  anchor: Anchor;
}) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!preview)
    return (
      <Alert severity="info">
        Ingresa un monto para ver la simulación de la liquidación.
      </Alert>
    );

  return (
    <Stack spacing={1.5} sx={{ position: "relative" }}>
      {computing && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "text.secondary",
          }}
        >
          <CircularProgress size={14} />
          <Typography variant="caption">recalculando…</Typography>
        </Box>
      )}

      <BigNumberRow
        label="Sueldo base"
        value={preview.base_salary_clp}
        emphasized={anchor === "base"}
      />
      <BigNumberRow
        label="Líquido a recibir"
        value={preview.net_salary_clp}
        emphasized={anchor === "liquido"}
      />
      <BigNumberRow
        label="Costo empresa total"
        value={preview.total_employer_cost_clp}
        emphasized={anchor === "costo_empresa"}
      />

      <Divider sx={{ my: 1 }} />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 2,
        }}
      >
        <Box>
          <SectionTitle>Haberes imponibles</SectionTitle>
          <DetailTable
            rows={[
              ["Sueldo base", preview.base_salary_clp],
              ["Gratificación legal", preview.gratification_clp],
              ["Imponible", preview.imponible_clp, true],
            ]}
          />
        </Box>
        <Box>
          <SectionTitle>Haberes no imponibles</SectionTitle>
          {preview.non_imponible_items.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Sin ítems definidos.
            </Typography>
          ) : (
            <DetailTable
              rows={[
                ...preview.non_imponible_items.map(
                  (it) => [it.label, it.amount_clp] as [string, number]
                ),
                ["Total no imponibles", preview.non_imponible_total_clp, true] as [
                  string,
                  number,
                  boolean
                ],
              ]}
            />
          )}
        </Box>
        <Box>
          <SectionTitle>Descuentos empleado</SectionTitle>
          <DetailTable
            rows={[
              ["Cotización AFP", preview.afp_employee_clp],
              ["Cotización Salud", preview.health_employee_clp],
              ["Seguro Cesantía", preview.unemployment_employee_clp],
              ["Impuesto Único", preview.income_tax_clp],
              ["Total descuentos", preview.total_employee_deductions_clp, true],
            ]}
          />
        </Box>
        <Box sx={{ gridColumn: { md: "1 / span 2" } }}>
          <SectionTitle>Costo empresa (sobre bruto)</SectionTitle>
          <DetailTable
            rows={[
              ["SIS", preview.sis_clp],
              ["Mutual", preview.mutual_clp],
              ["AFC empleador", preview.afc_employer_clp],
              ["Ley SANNA", preview.ley_sanna_clp],
              ["Reforma previsional", preview.reforma_previsional_clp],
              ["Subtotal aportes empleador", preview.total_employer_extras_clp, true],
            ]}
          />
        </Box>
      </Box>

      {preview.notes.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {preview.notes.join(" · ")}
        </Alert>
      )}
    </Stack>
  );
}

function BigNumberRow({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: number;
  emphasized: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        p: 1.5,
        borderRadius: 1,
        bgcolor: emphasized ? "primary.light" : "background.default",
        color: emphasized ? "primary.contrastText" : "text.primary",
      }}
    >
      <Typography variant="subtitle2" fontWeight={emphasized ? 700 : 500}>
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {formatCLP(value)}
      </Typography>
    </Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      fontWeight={700}
      color="text.secondary"
      sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
    >
      {children}
    </Typography>
  );
}

function NonImponibleEditor({
  items,
  onChange,
}: {
  items: NonImponibleItem[];
  onChange: (next: NonImponibleItem[]) => void;
}) {
  const updateAt = (index: number, patch: Partial<NonImponibleItem>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const removeAt = (index: number) =>
    onChange(items.filter((_, i) => i !== index));
  const addNew = () =>
    onChange([...items, { label: "", amount_clp: 0 }]);

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <SectionTitle>Haberes no imponibles</SectionTitle>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={addNew}
          variant="text"
        >
          Agregar línea
        </Button>
      </Stack>
      {items.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Sin ítems. Ej: movilización, colación, asignación de zona.
        </Typography>
      )}
      <Stack spacing={1}>
        {items.map((it, i) => (
          <Stack
            key={i}
            direction="row"
            spacing={1}
            alignItems="center"
          >
            <TextField
              label="Concepto"
              size="small"
              value={it.label}
              onChange={(e) => updateAt(i, { label: e.target.value })}
              sx={{ flex: 2 }}
            />
            <TextField
              label="Monto (CLP)"
              size="small"
              type="number"
              value={it.amount_clp || ""}
              onChange={(e) =>
                updateAt(i, { amount_clp: Number(e.target.value) || 0 })
              }
              sx={{ flex: 1 }}
            />
            <IconButton
              size="small"
              onClick={() => removeAt(i)}
              aria-label="Eliminar"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function DetailTable({
  rows,
}: {
  rows: ([label: string, value: number] | [label: string, value: number, total: boolean])[];
}) {
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([label, value, total]) => (
          <TableRow key={label}>
            <TableCell sx={{ borderBottom: "none", py: 0.4, pl: 0 }}>
              <Typography variant="body2" fontWeight={total ? 700 : 400}>
                {label}
              </Typography>
            </TableCell>
            <TableCell
              align="right"
              sx={{ borderBottom: "none", py: 0.4, pr: 0 }}
            >
              <Typography variant="body2" fontWeight={total ? 700 : 400}>
                {formatCLP(value)}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
