import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/AddCircleOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import SaveIcon from "@mui/icons-material/Save";
import { ApiError, get, request } from "../../api/client";
import { formatCLP } from "../empleados/format";
import type { Item, PayslipDetail, PayslipInputs } from "./types";

type Props = {
  payslipId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

type ItemKey = "imponible_extras" | "non_imponible_items" | "post_tax_discounts";

const SECTIONS: { key: ItemKey; title: string; help: string; placeholder: string }[] = [
  {
    key: "imponible_extras",
    title: "Bonos / Comisiones (imponibles)",
    help: "Suman al imponible: cotizan AFP, salud y pagan impuesto.",
    placeholder: "Ej: Bono trimestral, comisión venta",
  },
  {
    key: "non_imponible_items",
    title: "Haberes no imponibles",
    help: "Suman al líquido sin cotizar.",
    placeholder: "Ej: Movilización, colación",
  },
  {
    key: "post_tax_discounts",
    title: "Descuentos extras",
    help: "Restan del líquido (no afectan costo empresa).",
    placeholder: "Ej: Anticipo, préstamo",
  },
];

export default function PayslipEditor({ payslipId, onClose, onSaved }: Props) {
  const [detail, setDetail] = useState<PayslipDetail | null>(null);
  const [inputs, setInputs] = useState<PayslipInputs | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load on open.
  useEffect(() => {
    if (!payslipId) {
      setDetail(null);
      setInputs(null);
      return;
    }
    setLoading(true);
    setError(null);
    get<PayslipDetail>(`/api/payroll/payslips/${payslipId}`)
      .then((d) => {
        setDetail(d);
        setInputs(d.inputs);
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar")
      )
      .finally(() => setLoading(false));
  }, [payslipId]);

  // Re-preview on every input change (server is source of truth for math).
  useEffect(() => {
    if (!inputs || !payslipId) return;
    const handler = setTimeout(async () => {
      try {
        const updated = await request<PayslipDetail>(
          `/api/payroll/payslips/${payslipId}`,
          {
            method: "PATCH",
            body: { inputs },
          }
        );
        // Update breakdown only; keep editing inputs from local state.
        setDetail(updated);
      } catch {
        // Silently ignore preview errors; the user gets a hard error on Save.
      }
    }, 350);
    return () => clearTimeout(handler);
  }, [inputs, payslipId]);

  const open = payslipId !== null;

  const updateBase = (val: string) => {
    if (!inputs) return;
    setInputs({ ...inputs, base_salary_clp: Number(val) || 0 });
  };

  const addItem = (key: ItemKey) => {
    if (!inputs) return;
    setInputs({
      ...inputs,
      [key]: [...inputs[key], { label: "", amount_clp: 0 }],
    });
  };
  const removeItem = (key: ItemKey, idx: number) => {
    if (!inputs) return;
    setInputs({
      ...inputs,
      [key]: inputs[key].filter((_, i) => i !== idx),
    });
  };
  const updateItem = (key: ItemKey, idx: number, patch: Partial<Item>) => {
    if (!inputs) return;
    setInputs({
      ...inputs,
      [key]: inputs[key].map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    });
  };

  const save = async () => {
    if (!inputs || !payslipId) return;
    setSubmitting(true);
    setError(null);
    try {
      await request(`/api/payroll/payslips/${payslipId}`, {
        method: "PATCH",
        body: { inputs },
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const issue = async () => {
    if (!inputs || !payslipId) return;
    if (
      !confirm(
        "Emitir esta liquidación es definitivo: ya no podrá modificarse. ¿Continuar?"
      )
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      // Save current edits first.
      await request(`/api/payroll/payslips/${payslipId}`, {
        method: "PATCH",
        body: { inputs },
      });
      await request(`/api/payroll/payslips/${payslipId}/issue`, {
        method: "POST",
        body: {},
      });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al emitir");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={submitting ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 720 } } }}
    >
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ mb: 1 }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Liquidación
            </Typography>
            {detail && (
              <Typography variant="body2" color="text.secondary">
                {detail.employee_name} · {detail.cargo ?? ""} · {detail.period_label}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} disabled={submitting}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {detail?.status === "issued" && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            Esta liquidación ya está emitida y no se puede modificar.
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        {detail && inputs && (
          <Box sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
            <Stack spacing={3}>
              {/* Resumen en cards */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 1.5,
                }}
              >
                <SummaryBox
                  label="Imponible"
                  value={detail.breakdown.imponible_clp}
                />
                <SummaryBox
                  label="Líquido a recibir"
                  value={detail.breakdown.net_salary_clp}
                  highlight
                />
                <SummaryBox
                  label="Costo empresa"
                  value={detail.breakdown.total_employer_cost_clp}
                />
              </Box>

              {/* Sueldo base override + días trabajados */}
              <Box>
                <SectionTitle>Sueldo y días trabajados</SectionTitle>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                  <TextField
                    label="Sueldo base (CLP)"
                    type="number"
                    size="small"
                    value={inputs.base_salary_clp || ""}
                    onChange={(e) => updateBase(e.target.value)}
                    sx={{ flex: 2 }}
                  />
                  <TextField
                    label="Días trabajados"
                    type="number"
                    size="small"
                    value={inputs.days_worked}
                    onChange={(e) =>
                      setInputs({
                        ...inputs,
                        days_worked: Math.max(
                          0,
                          Math.min(30, Number(e.target.value) || 0)
                        ),
                      })
                    }
                    helperText="0–30 (mes Chile = 30 días)"
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  El sueldo base y los haberes no imponibles se prorratean por
                  días. El contrato del colaborador no se modifica.
                </Typography>
              </Box>

              {SECTIONS.map((s) => (
                <Box key={s.key}>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 0.5 }}
                  >
                    <SectionTitle>{s.title}</SectionTitle>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => addItem(s.key)}
                    >
                      Agregar
                    </Button>
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1 }}
                  >
                    {s.help}
                  </Typography>
                  {inputs[s.key].length === 0 ? (
                    <Typography variant="caption" color="text.disabled">
                      Sin ítems.
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {inputs[s.key].map((it, idx) => (
                        <Stack
                          key={idx}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                        >
                          <TextField
                            label="Concepto"
                            size="small"
                            value={it.label}
                            placeholder={s.placeholder}
                            onChange={(e) =>
                              updateItem(s.key, idx, { label: e.target.value })
                            }
                            sx={{ flex: 2 }}
                          />
                          <TextField
                            label="Monto (CLP)"
                            size="small"
                            type="number"
                            value={it.amount_clp || ""}
                            onChange={(e) =>
                              updateItem(s.key, idx, {
                                amount_clp: Number(e.target.value) || 0,
                              })
                            }
                            sx={{ flex: 1 }}
                          />
                          <IconButton
                            size="small"
                            onClick={() => removeItem(s.key, idx)}
                            aria-label="Eliminar"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              ))}

              <Divider />

              {/* Detalle del cálculo */}
              <Box>
                <SectionTitle>Detalle del cálculo</SectionTitle>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 2,
                    mt: 1,
                  }}
                >
                  <DetailTable
                    title="Haberes"
                    rows={[
                      ["Sueldo base", detail.breakdown.base_salary_clp],
                      ["Gratificación legal", detail.breakdown.gratification_clp],
                      [
                        "Bonos / comisiones",
                        detail.breakdown.imponible_extras_total_clp,
                      ],
                      ["Imponible", detail.breakdown.imponible_clp, true],
                      [
                        "Haberes no imponibles",
                        detail.breakdown.non_imponible_total_clp,
                      ],
                    ]}
                  />
                  <DetailTable
                    title="Descuentos"
                    rows={[
                      ["AFP", detail.breakdown.afp_employee_clp],
                      ["Salud", detail.breakdown.health_employee_clp],
                      ["Cesantía", detail.breakdown.unemployment_employee_clp],
                      ["Impuesto único", detail.breakdown.income_tax_clp],
                      [
                        "Total previsional",
                        detail.breakdown.total_employee_deductions_clp,
                        true,
                      ],
                      [
                        "Descuentos extras",
                        detail.breakdown.post_tax_discounts_total_clp,
                      ],
                    ]}
                  />
                  <Box sx={{ gridColumn: { sm: "1 / span 2" } }}>
                    <DetailTable
                      title="Costo empresa (sobre bruto)"
                      rows={[
                        [
                          "Aportes empleador",
                          detail.breakdown.total_employer_extras_clp,
                        ],
                        [
                          "Total costo empresa",
                          detail.breakdown.total_employer_cost_clp,
                          true,
                        ],
                      ]}
                    />
                  </Box>
                </Box>
              </Box>
            </Stack>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={onClose} disabled={submitting}>
            Cerrar
          </Button>
          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={save}
            disabled={submitting || !inputs || detail?.status === "issued"}
          >
            Guardar borrador
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={
              submitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <CheckCircleIcon />
              )
            }
            onClick={issue}
            disabled={submitting || !inputs || detail?.status === "issued"}
          >
            Emitir
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}

function SummaryBox({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1,
        bgcolor: highlight ? "primary.light" : "background.default",
        color: highlight ? "primary.contrastText" : "text.primary",
        textAlign: "center",
      }}
    >
      <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
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

function DetailTable({
  title,
  rows,
}: {
  title: string;
  rows: ([string, number] | [string, number, boolean])[];
}) {
  return (
    <Box>
      <Chip label={title} size="small" sx={{ mb: 0.5 }} />
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
    </Box>
  );
}
