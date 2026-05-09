import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import { ApiError, get, request } from "../../api/client";
import WizardRemuneracion from "./WizardRemuneracion";
import { formatCLP } from "./format";
import type { NonImponibleItem, PayrollCatalogs } from "./payroll";
import type { ContractType, EmployeeDetail } from "./types";

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  mode: Mode;
  /** When mode === "edit", the existing detail to pre-fill. */
  initial?: EmployeeDetail | null;
  onClose: () => void;
  onSaved: (savedId: string) => void;
};

type FormState = {
  rut: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  address: string;
  hire_date: string;
  empresa: string;
  division: string;
  area: string;
  subarea: string;
  manager_id: string;
  afp_code: string;
  health_code: string;
  isapre_plan_uf: string;
  status: "active" | "on_leave" | "terminated";
  termination_date: string;
  notes: string;
  // Contract
  contract_type: ContractType;
  job_title: string;
  base_salary_clp: string;
  weekly_hours: string;
  non_imponible_items: NonImponibleItem[];
};

const EMPTY: FormState = {
  rut: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  birth_date: "",
  address: "",
  hire_date: new Date().toISOString().slice(0, 10),
  empresa: "",
  division: "",
  area: "",
  subarea: "",
  manager_id: "",
  afp_code: "",
  health_code: "fonasa",
  isapre_plan_uf: "",
  status: "active",
  termination_date: "",
  notes: "",
  contract_type: "indefinite",
  job_title: "",
  base_salary_clp: "",
  weekly_hours: "45",
  non_imponible_items: [],
};

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: "indefinite", label: "Indefinido" },
  { value: "fixed_term", label: "Plazo fijo" },
  { value: "project_based", label: "Por obra" },
  { value: "part_time", label: "Part-time" },
];

type ManagerOption = { id: string; full_name: string; cargo: string | null };

export default function EmpleadoForm({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [catalogs, setCatalogs] = useState<PayrollCatalogs | null>(null);
  const [wizardOpen, setWizardOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm({
        rut: initial.rut,
        first_name: initial.first_name,
        last_name: initial.last_name,
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        birth_date: initial.birth_date ?? "",
        address: initial.address ?? "",
        hire_date: initial.hire_date,
        empresa: initial.empresa ?? "",
        division: initial.division ?? "",
        area: initial.area ?? "",
        subarea: initial.subarea ?? "",
        manager_id: initial.manager_id ?? "",
        afp_code: initial.afp_code ?? "",
        // Map detail.health_provider ('fonasa'|'isapre') to a catalog code; if
        // it's already a specific isapre code, use it as-is. The catalog load
        // below normalizes anything unknown to fonasa.
        health_code: initial.health_provider ?? "fonasa",
        isapre_plan_uf: "",
        status: initial.status,
        termination_date: initial.termination_date ?? "",
        notes: initial.notes ?? "",
        contract_type: initial.current_contract?.contract_type ?? "indefinite",
        job_title: initial.current_contract?.job_title ?? "",
        base_salary_clp: initial.current_contract
          ? String(initial.current_contract.base_salary_clp)
          : "",
        weekly_hours: initial.current_contract
          ? String(initial.current_contract.weekly_hours)
          : "45",
        non_imponible_items:
          initial.current_contract?.non_imponible_items ?? [],
      });
    } else if (mode === "create") {
      setForm(EMPTY);
    }
    setError(null);
  }, [open, mode, initial]);

  // Load potential managers (active employees, excluding self).
  useEffect(() => {
    if (!open) return;
    get<{ items: ManagerOption[] }>("/api/employees?vigentes=true&limit=500")
      .then((d) => setManagers(d.items))
      .catch(() => setManagers([]));
  }, [open]);

  // Load payroll catalogs once.
  useEffect(() => {
    if (!open || catalogs) return;
    get<PayrollCatalogs>("/api/payroll/catalogs")
      .then((c) => {
        setCatalogs(c);
        // Normalize health_code if the saved value isn't in the catalog.
        setForm((f) => {
          const known = c.health_options.some((h) => h.code === f.health_code);
          return known ? f : { ...f, health_code: "fonasa" };
        });
      })
      .catch(() => setCatalogs(null));
  }, [open, catalogs]);

  const filteredManagers = useMemo(
    () =>
      managers.filter(
        (m) => mode === "create" || m.id !== initial?.id
      ),
    [managers, mode, initial]
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!form.first_name.trim()) return "El nombre es obligatorio";
    if (!form.last_name.trim()) return "El apellido es obligatorio";
    if (!form.rut.trim()) return "El RUT es obligatorio";
    if (!form.hire_date) return "La fecha de ingreso es obligatoria";
    if (mode === "create") {
      if (!form.job_title.trim())
        return "El cargo es obligatorio para crear un colaborador";
      if (!form.base_salary_clp.trim() || Number(form.base_salary_clp) <= 0)
        return "El sueldo base debe ser un número positivo";
    }
    return null;
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    const healthOption = catalogs?.health_options.find(
      (h) => h.code === form.health_code
    );
    const healthProvider: "fonasa" | "isapre" =
      healthOption?.kind === "isapre" ? "isapre" : "fonasa";
    try {
      if (mode === "create") {
        const body = {
          rut: form.rut.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          birth_date: form.birth_date || null,
          address: form.address.trim() || null,
          hire_date: form.hire_date,
          empresa: form.empresa.trim() || null,
          division: form.division.trim() || null,
          area: form.area.trim() || null,
          subarea: form.subarea.trim() || null,
          manager_id: form.manager_id || null,
          afp_code: form.afp_code.trim() || null,
          health_provider: healthProvider,
          contract: {
            contract_type: form.contract_type,
            job_title: form.job_title.trim(),
            base_salary_clp: Number(form.base_salary_clp),
            weekly_hours: Number(form.weekly_hours) || 45,
            non_imponible_items: form.non_imponible_items,
          },
        };
        const created = await request<EmployeeDetail>("/api/employees", {
          method: "POST",
          body,
        });
        onSaved(created.id);
      } else if (mode === "edit" && initial) {
        const empBody = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          birth_date: form.birth_date || null,
          address: form.address.trim() || null,
          hire_date: form.hire_date,
          termination_date: form.termination_date || null,
          status: form.status,
          empresa: form.empresa.trim() || null,
          division: form.division.trim() || null,
          area: form.area.trim() || null,
          subarea: form.subarea.trim() || null,
          manager_id: form.manager_id || null,
          afp_code: form.afp_code.trim() || null,
          health_provider: healthProvider,
          notes: form.notes.trim() || null,
        };
        await request<EmployeeDetail>(`/api/employees/${initial.id}`, {
          method: "PATCH",
          body: empBody,
        });
        // Update contract if anything contract-side changed.
        const contractBody: Record<string, unknown> = {};
        if (form.job_title.trim()) contractBody.job_title = form.job_title.trim();
        if (form.base_salary_clp.trim())
          contractBody.base_salary_clp = Number(form.base_salary_clp);
        contractBody.contract_type = form.contract_type;
        contractBody.weekly_hours = Number(form.weekly_hours) || 45;
        contractBody.non_imponible_items = form.non_imponible_items;
        await request<EmployeeDetail>(
          `/api/employees/${initial.id}/current-contract`,
          { method: "PATCH", body: contractBody }
        );
        onSaved(initial.id);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={submitting ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 520 } } }}
    >
      <Box sx={{ p: 3, display: "flex", flexDirection: "column", height: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography variant="h6" fontWeight={700}>
            {mode === "create" ? "Nuevo colaborador" : "Actualizar datos"}
          </Typography>
          <IconButton onClick={onClose} disabled={submitting} aria-label="Cerrar">
            <CloseIcon />
          </IconButton>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ flex: 1, overflowY: "auto", pr: 1 }}>
          <Stack spacing={2}>
            <SectionTitle>Identificación</SectionTitle>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField
                label="Nombre"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                size="small"
                required
              />
              <TextField
                label="Apellido"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                size="small"
                required
              />
            </Box>
            <TextField
              label="RUT"
              value={form.rut}
              onChange={(e) => update("rut", e.target.value)}
              size="small"
              required
              disabled={mode === "edit"}
              helperText={mode === "edit" ? "El RUT no se puede modificar" : undefined}
            />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                size="small"
              />
              <TextField
                label="Teléfono"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                size="small"
              />
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField
                label="Fecha de nacimiento"
                type="date"
                value={form.birth_date}
                onChange={(e) => update("birth_date", e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Fecha de ingreso"
                type="date"
                value={form.hire_date}
                onChange={(e) => update("hire_date", e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                required
              />
            </Box>
            <TextField
              label="Dirección"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              size="small"
            />

            <Divider />
            <SectionTitle>Organización</SectionTitle>
            <TextField
              label="Empresa"
              value={form.empresa}
              onChange={(e) => update("empresa", e.target.value)}
              size="small"
            />
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
              <TextField
                label="División"
                value={form.division}
                onChange={(e) => update("division", e.target.value)}
                size="small"
              />
              <TextField
                label="Área"
                value={form.area}
                onChange={(e) => update("area", e.target.value)}
                size="small"
              />
              <TextField
                label="Sub-área"
                value={form.subarea}
                onChange={(e) => update("subarea", e.target.value)}
                size="small"
              />
            </Box>
            <TextField
              label="Supervisor"
              select
              value={form.manager_id}
              onChange={(e) => update("manager_id", e.target.value)}
              size="small"
            >
              <MenuItem value="">— Sin supervisor —</MenuItem>
              {filteredManagers.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.full_name}
                  {m.cargo ? ` · ${m.cargo}` : ""}
                </MenuItem>
              ))}
            </TextField>

            <Divider />
            <SectionTitle>Contrato vigente</SectionTitle>
            <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 2 }}>
              <TextField
                label="Cargo"
                value={form.job_title}
                onChange={(e) => update("job_title", e.target.value)}
                size="small"
                required={mode === "create"}
              />
              <TextField
                label="Tipo contrato"
                select
                value={form.contract_type}
                onChange={(e) =>
                  update("contract_type", e.target.value as ContractType)
                }
                size="small"
              >
                {CONTRACT_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box
              sx={{
                p: 1.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 2,
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Sueldo base (mensual)
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {form.base_salary_clp
                    ? formatCLP(Number(form.base_salary_clp))
                    : "Sin definir"}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<TuneIcon />}
                onClick={() => setWizardOpen(true)}
                disabled={!catalogs}
              >
                Configurar
              </Button>
            </Box>
            <TextField
              label="Horas semanales"
              type="number"
              value={form.weekly_hours}
              onChange={(e) => update("weekly_hours", e.target.value)}
              size="small"
            />

            <Divider />
            <SectionTitle>Previsión</SectionTitle>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
              <TextField
                label="AFP"
                select
                value={form.afp_code}
                onChange={(e) => update("afp_code", e.target.value)}
                size="small"
                disabled={!catalogs}
              >
                {(catalogs?.afp_options ?? []).map((a) => (
                  <MenuItem key={a.code} value={a.code}>
                    {a.name} ({(a.total_rate * 100).toFixed(2)}%)
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Salud"
                select
                value={form.health_code}
                onChange={(e) => update("health_code", e.target.value)}
                size="small"
                disabled={!catalogs}
              >
                {(catalogs?.health_options ?? []).map((h) => (
                  <MenuItem key={h.code} value={h.code}>
                    {h.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {mode === "edit" && (
              <>
                <Divider />
                <SectionTitle>Estado</SectionTitle>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                  <TextField
                    label="Estado"
                    select
                    value={form.status}
                    onChange={(e) =>
                      update(
                        "status",
                        e.target.value as "active" | "on_leave" | "terminated"
                      )
                    }
                    size="small"
                  >
                    <MenuItem value="active">Vigente</MenuItem>
                    <MenuItem value="on_leave">Con licencia</MenuItem>
                    <MenuItem value="terminated">No vigente</MenuItem>
                  </TextField>
                  <TextField
                    label="Fecha de término"
                    type="date"
                    value={form.termination_date}
                    onChange={(e) => update("termination_date", e.target.value)}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    disabled={form.status !== "terminated"}
                  />
                </Box>
                <TextField
                  label="Notas"
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  size="small"
                  multiline
                  minRows={2}
                />
              </>
            )}
          </Stack>
        </Box>

        <Divider sx={{ my: 2 }} />
        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            startIcon={
              submitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <SaveIcon />
              )
            }
            onClick={submit}
            disabled={submitting}
          >
            {mode === "create" ? "Crear colaborador" : "Guardar cambios"}
          </Button>
        </Stack>
      </Box>

      <WizardRemuneracion
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initial={{
          base_salary_clp: Number(form.base_salary_clp) || 0,
          contract_type: form.contract_type,
          afp_code: form.afp_code || "habitat",
          health_code: form.health_code || "fonasa",
          isapre_plan_uf: Number(form.isapre_plan_uf) || 0,
          non_imponible_items: form.non_imponible_items,
        }}
        onApply={(result) => {
          setForm((f) => ({
            ...f,
            base_salary_clp: String(result.base_salary_clp),
            afp_code: result.afp_code,
            health_code: result.health_code,
            isapre_plan_uf:
              result.isapre_plan_uf > 0 ? String(result.isapre_plan_uf) : "",
            non_imponible_items: result.non_imponible_items,
          }));
          setWizardOpen(false);
        }}
      />
    </Drawer>
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
