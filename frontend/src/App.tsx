import { useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import { get } from "./api/client";
import EmpleadosPage from "./pages/Empleados";
import LiquidacionesPage from "./pages/Liquidaciones";
import VacacionesPage from "./pages/Vacaciones";
import PreviredPage from "./pages/Previred";

type HealthStatus = "loading" | "ok" | "error";

const TABS = [
  { id: "empleados", label: "Empleados" },
  { id: "liquidaciones", label: "Liquidaciones" },
  { id: "vacaciones", label: "Vacaciones" },
  { id: "previred", label: "Previred" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [tab, setTab] = useState<TabId>("empleados");

  useEffect(() => {
    get<{ status: string }>("/api/health")
      .then((data) => setStatus(data.status === "ok" ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 0 }}>
            PymeOS
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ flexGrow: 1 }}
          >
            Sueldos y vacaciones para tu Pyme
          </Typography>
          {status === "loading" && <CircularProgress size={18} />}
          {status === "ok" && (
            <Chip label="API conectada" color="success" size="small" variant="outlined" />
          )}
          {status === "error" && (
            <Chip label="API no disponible" color="error" size="small" variant="outlined" />
          )}
        </Toolbar>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value as TabId)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((t) => (
            <Tab key={t.id} value={t.id} label={t.label} />
          ))}
        </Tabs>
      </AppBar>

      <Container maxWidth="lg" sx={{ flexGrow: 1, py: 3 }}>
        {tab === "empleados" && <EmpleadosPage />}
        {tab === "liquidaciones" && <LiquidacionesPage />}
        {tab === "vacaciones" && <VacacionesPage />}
        {tab === "previred" && <PreviredPage />}
      </Container>
    </Box>
  );
}
