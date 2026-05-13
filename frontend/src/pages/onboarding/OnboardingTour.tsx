/**
 * First-run walkthrough.
 *
 * Three steps:
 *  1. Welcome (centered Dialog, blocks UI). Sets the expectation that
 *     PymeOS is local, the data is the user's, and they will customize
 *     the app themselves via Forger.
 *  2. Create the first collaborator (non-blocking floating card in the
 *     bottom-right corner). Polls `/api/employees` and auto-advances as
 *     soon as the first one is created.
 *  3. Modify the app via Forger (floating card, manual "Listo"). We
 *     cannot detect the change from inside the app, so the user
 *     confirms when they have asked Forger to remove the División
 *     column.
 *
 * `onTabHint` lets the tour suggest which tab to surface in the parent
 * AppBar so the user does not need to navigate manually mid-step.
 */

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Link,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined";
import { ApiError, get, request } from "../../api/client";
import Spotlight from "./Spotlight";

const FORGER_PROMPT = "Quita la columna División de la tabla de Colaboradores.";
// Forger Desktop registers the `forger://` URL scheme and routes
// `forger://chat` URLs to its main window, focusing the chat scoped to
// the named app and prefilling the composer. `app=pyme-os` matches the
// manifest name; Desktop resolves it to `pyme-os-dev` when running the
// dev install.
const FORGER_CHAT_URL = `forger://chat?app=pyme-os&prompt=${encodeURIComponent(
  FORGER_PROMPT
)}`;

type EmployeesPage = { items: unknown[]; total: number };
type OnboardingState = { completed: boolean; completed_at: string | null };

type Step = "welcome" | "first_employee" | "first_modification" | "done";

const POLL_INTERVAL_MS = 2_000;

type Props = {
  onRequestTab: (tab: "empleados" | "organigrama" | "liquidaciones" | "vacaciones" | "previred") => void;
};

export default function OnboardingTour({ onRequestTab }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [visible, setVisible] = useState<boolean>(false);
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [confirmSkipOpen, setConfirmSkipOpen] = useState(false);

  // Decide on mount whether to show the tour at all.
  useEffect(() => {
    get<OnboardingState>("/api/onboarding/state")
      .then((s) => {
        if (!s.completed) setVisible(true);
      })
      .catch(() => {
        // Fail open: if the backend can't tell, skip the tour rather
        // than blocking the user.
      });
  }, []);

  // Poll the employee list while we are on step 2 so we can auto-advance.
  useEffect(() => {
    if (!visible || step !== "first_employee") return;
    let cancelled = false;
    const tick = () => {
      get<EmployeesPage>("/api/employees?limit=1")
        .then((page) => {
          if (cancelled) return;
          setEmployeeCount(page.total);
          if (page.total > 0) setStep("first_modification");
        })
        .catch(() => {
          // ignore — the tour stays on the same step and retries.
        });
    };
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [visible, step]);

  const finish = async () => {
    try {
      await request<OnboardingState>("/api/onboarding/complete", {
        method: "POST",
      });
    } catch {
      // Surface failure but still hide the tour to avoid trapping the user.
    }
    setStep("done");
    setVisible(false);
  };

  const startTour = () => {
    onRequestTab("empleados");
    setStep("first_employee");
  };

  const skip = () => setConfirmSkipOpen(true);
  const confirmSkip = () => {
    setConfirmSkipOpen(false);
    finish();
  };

  if (!visible) return null;

  return (
    <>
      <WelcomeDialog
        open={step === "welcome"}
        onStart={startTour}
        onSkip={skip}
      />

      {step === "first_employee" && (
        <Spotlight targetSelector='[data-tour-id="empleados-nuevo"]' />
      )}

      <FloatingCard
        visible={step === "first_employee"}
        title="Paso 1 de 2 · Crea tu primer colaborador"
        progress={0}
        onSkip={skip}
      >
        <Typography variant="body2">
          Hacé clic en el botón resaltado <strong>Nuevo colaborador</strong>{" "}
          para abrir el formulario. Necesitas al menos su nombre, RUT y
          sueldo base.
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Detecto automáticamente cuando lo crees y avanzo al siguiente paso.
        </Typography>
        {employeeCount !== null && employeeCount === 0 && (
          <LinearProgress sx={{ mt: 1 }} />
        )}
      </FloatingCard>

      <FloatingCard
        visible={step === "first_modification"}
        title="Paso 2 de 2 · Personaliza tu tabla"
        progress={50}
        onSkip={skip}
      >
        <Typography variant="body2" sx={{ mb: 1 }}>
          PymeOS es tuyo: pídele a Forger que la modifique para que se
          ajuste a tu pyme. Probemos sacando una columna que no usas de
          la tabla de Colaboradores.
        </Typography>
        <Paper
          variant="outlined"
          sx={{ p: 1.5, mb: 1.5, bgcolor: "background.default" }}
        >
          <Typography variant="caption" color="text.secondary">
            Mensaje que enviaremos a Forger:
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>
            "{FORGER_PROMPT}"
          </Typography>
        </Paper>
        <Typography variant="caption" color="text.secondary">
          El botón abre el chat de Forger con el mensaje ya escrito —
          solo lo revisas y lo envías. Cuando Forger termine el cambio,
          vuelve aquí y marca "Listo".
        </Typography>
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <Button
            component="a"
            href={FORGER_CHAT_URL}
            variant="contained"
            size="small"
            startIcon={<OpenInNewIcon />}
            fullWidth
          >
            Abrir chat de Forger
          </Button>
          <Button variant="text" size="small" onClick={finish} fullWidth>
            Listo, ya hice el cambio
          </Button>
        </Stack>
      </FloatingCard>

      <SkipConfirmDialog
        open={confirmSkipOpen}
        onCancel={() => setConfirmSkipOpen(false)}
        onConfirm={confirmSkip}
      />
    </>
  );
}

function WelcomeDialog({
  open,
  onStart,
  onSkip,
}: {
  open: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={700}>
            Bienvenido a PymeOS
          </Typography>
          <Chip size="small" label="Tour rápido" variant="outlined" />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            PymeOS es tu app local para sueldos, vacaciones y planilla
            Previred. Todos los datos viven en tu equipo: no hay servidor
            externo ni cuenta que crear.
          </Typography>
          <Alert severity="info" icon={false}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              En 2 pasos veremos:
            </Typography>
            <Stack component="ol" spacing={0.5} sx={{ pl: 2.5, m: 0 }}>
              <li>
                <Typography variant="body2">
                  Cómo crear tu primer colaborador.
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  Cómo pedirle a Forger que modifique la app a tu medida.
                </Typography>
              </li>
            </Stack>
          </Alert>
          <Typography variant="caption" color="text.secondary">
            Si prefieres explorar por tu cuenta, puedes{" "}
            <Link component="button" onClick={onSkip} underline="hover">
              saltar el tour
            </Link>
            .
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onSkip}>Saltar</Button>
        <Button variant="contained" onClick={onStart}>
          Empezar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FloatingCard({
  visible,
  title,
  progress,
  onSkip,
  children,
}: {
  visible: boolean;
  title: string;
  progress: number;
  onSkip: () => void;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <Paper
      elevation={6}
      sx={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 360,
        maxWidth: "calc(100vw - 40px)",
        // Below MUI's Drawer (1200) so that when the user opens the new
        // collaborator form from inside the spotlight, the form drawer
        // covers both the dim layer and this card. Once the drawer
        // closes the tour reappears (and usually auto-advances 2s later
        // once the employee creation is detected).
        zIndex: 1150,
        overflow: "hidden",
      }}
    >
      <LinearProgress variant="determinate" value={progress} />
      <Box sx={{ p: 2 }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle2" fontWeight={700}>
            {title}
          </Typography>
          <IconButton size="small" onClick={onSkip} aria-label="Saltar tour">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Stack spacing={1}>{children}</Stack>
      </Box>
    </Paper>
  );
}

function SkipConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} maxWidth="xs" fullWidth>
      <DialogTitle>¿Saltar el tour?</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2">
          Puedes seguir solo. El tour no se volverá a mostrar a menos que lo
          reactives desde la configuración.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="contained" onClick={onConfirm}>
          Saltar tour
        </Button>
      </DialogActions>
    </Dialog>
  );
}
