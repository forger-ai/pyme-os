import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import { ApiError, get } from "../../api/client";
import { formatDate, initials } from "../empleados/format";
import type { CalendarEntry } from "./types";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateToIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** ISO weekday (1=Mon..7=Sun) */
function isoWeekday(y: number, m0: number, d: number): number {
  const dow = new Date(y, m0, d).getDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

function parseIsoDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

// ── Layout constants ─────────────────────────────────────────────────────────
const CELL_W = 40;
const ROW_H = 56;
const NAME_COL = 240;
const HEADER_H = 56;

// Soft palette to color-code employees for fast visual scanning.
const PALETTE = [
  { bg: "#E3F2FD", border: "#1976D2", text: "#0D47A1" }, // blue
  { bg: "#E8F5E9", border: "#2E7D32", text: "#1B5E20" }, // green
  { bg: "#FFF3E0", border: "#EF6C00", text: "#E65100" }, // orange
  { bg: "#F3E5F5", border: "#7B1FA2", text: "#4A148C" }, // purple
  { bg: "#E0F7FA", border: "#00838F", text: "#006064" }, // cyan
  { bg: "#FCE4EC", border: "#C2185B", text: "#880E4F" }, // pink
  { bg: "#F1F8E9", border: "#558B2F", text: "#33691E" }, // lime
  { bg: "#FFF8E1", border: "#F9A825", text: "#F57F17" }, // amber
];

function paletteFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const PENDING_STYLE = {
  bg: "#FFF8E1",
  border: "#F9A825",
  text: "#E65100",
};

export default function CalendarioTab() {
  const today = new Date();
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth()); // 0-based
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const numDays = daysInMonth(year, month);
  const fromIso = dateToIso(year, month, 1);
  const toIso = dateToIso(year, month, numDays);

  useEffect(() => {
    setEntries(null);
    setError(null);
    get<CalendarEntry[]>(
      `/api/vacations/calendar?from=${fromIso}&to=${toIso}`
    )
      .then(setEntries)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : "Error al cargar")
      );
  }, [fromIso, toIso]);

  // Group by employee.
  const groupedByEmployee = useMemo(() => {
    if (!entries) return [];
    const map = new Map<
      string,
      { name: string; cargo: string | null; entries: CalendarEntry[] }
    >();
    for (const e of entries) {
      if (!map.has(e.employee_id)) {
        map.set(e.employee_id, {
          name: e.employee_name,
          cargo: e.cargo,
          entries: [],
        });
      }
      map.get(e.employee_id)!.entries.push(e);
    }
    return Array.from(map.entries())
      .map(([employee_id, v]) => ({ employee_id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const goPrev = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };
  const goNext = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();
  const todayDay = today.getDate();

  const calendarHeight =
    HEADER_H + (groupedByEmployee.length || 1) * ROW_H;

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={2}
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton size="small" onClick={goPrev} aria-label="Mes anterior">
            <ChevronLeftIcon />
          </IconButton>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ minWidth: 200, textAlign: "center", textTransform: "capitalize" }}
          >
            {MONTHS[month]} {year}
          </Typography>
          <IconButton size="small" onClick={goNext} aria-label="Mes siguiente">
            <ChevronRightIcon />
          </IconButton>
          <Button
            size="small"
            startIcon={<TodayIcon />}
            onClick={goToday}
            disabled={isCurrentMonth}
            sx={{ ml: 1 }}
          >
            Hoy
          </Button>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <LegendDot
            bg={PALETTE[0].bg}
            border={PALETTE[0].border}
            label="Aprobada"
          />
          <LegendDot
            bg={PENDING_STYLE.bg}
            border={PENDING_STYLE.border}
            dashed
            label="Pendiente"
          />
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {entries === null && !error && (
        <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {entries && entries.length === 0 && (
        <Alert severity="info">
          No hay solicitudes de vacaciones (aprobadas o pendientes) en este mes.
        </Alert>
      )}

      {entries && entries.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            overflow: "auto",
            borderRadius: 2,
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              minWidth: NAME_COL + numDays * CELL_W,
              minHeight: calendarHeight,
              position: "relative",
            }}
          >
            {/* Header */}
            <Box
              sx={{
                display: "flex",
                position: "sticky",
                top: 0,
                bgcolor: "background.paper",
                zIndex: 3,
                height: HEADER_H,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Box
                sx={{
                  width: NAME_COL,
                  flexShrink: 0,
                  px: 2,
                  display: "flex",
                  alignItems: "center",
                  borderRight: 1,
                  borderColor: "divider",
                  position: "sticky",
                  left: 0,
                  bgcolor: "background.paper",
                  zIndex: 4,
                }}
              >
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color="text.secondary"
                  sx={{ letterSpacing: 0.6, textTransform: "uppercase" }}
                >
                  Colaborador · {groupedByEmployee.length}
                </Typography>
              </Box>
              {Array.from({ length: numDays }, (_, i) => i + 1).map((day) => {
                const wd = isoWeekday(year, month, day);
                const isWeekend = wd >= 6;
                const isToday = isCurrentMonth && day === todayDay;
                return (
                  <Box
                    key={day}
                    sx={{
                      width: CELL_W,
                      flexShrink: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: isWeekend ? "grey.50" : "background.paper",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: isWeekend ? "text.disabled" : "text.secondary",
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {DAY_LABELS[wd - 1]}
                    </Typography>
                    {isToday ? (
                      <Box
                        sx={{
                          mt: 0.5,
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {day}
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 0.5,
                          fontWeight: 600,
                          color: isWeekend ? "text.disabled" : "text.primary",
                          lineHeight: 1,
                        }}
                      >
                        {day}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Today vertical line spanning full height */}
            {isCurrentMonth && (
              <Box
                sx={{
                  position: "absolute",
                  left: NAME_COL + (todayDay - 1) * CELL_W + CELL_W / 2 - 1,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  bgcolor: "primary.main",
                  opacity: 0.18,
                  zIndex: 2,
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Rows */}
            {groupedByEmployee.map((row, rowIdx) => {
              const palette = paletteFor(row.employee_id);
              return (
                <Box
                  key={row.employee_id}
                  sx={{
                    display: "flex",
                    height: ROW_H,
                    position: "relative",
                    bgcolor:
                      rowIdx % 2 === 0 ? "background.paper" : "grey.50",
                    "&:hover": { bgcolor: "action.hover" },
                    transition: "background-color 120ms",
                  }}
                >
                  <Box
                    sx={{
                      width: NAME_COL,
                      flexShrink: 0,
                      px: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      borderRight: 1,
                      borderColor: "divider",
                      position: "sticky",
                      left: 0,
                      bgcolor: "inherit",
                      zIndex: 1,
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        fontSize: 13,
                        fontWeight: 700,
                        bgcolor: palette.bg,
                        color: palette.text,
                        border: 1,
                        borderColor: palette.border,
                      }}
                    >
                      {initials(row.name)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        noWrap
                        title={row.name}
                      >
                        {row.name}
                      </Typography>
                      {row.cargo && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ display: "block", lineHeight: 1.2 }}
                          title={row.cargo}
                        >
                          {row.cargo}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Day cells background (subtle weekend tint) */}
                  <Box sx={{ position: "relative", display: "flex", flex: 1 }}>
                    {Array.from({ length: numDays }, (_, i) => i + 1).map(
                      (day) => {
                        const wd = isoWeekday(year, month, day);
                        const isWeekend = wd >= 6;
                        return (
                          <Box
                            key={day}
                            sx={{
                              width: CELL_W,
                              flexShrink: 0,
                              bgcolor: isWeekend
                                ? "rgba(0,0,0,0.02)"
                                : "transparent",
                            }}
                          />
                        );
                      }
                    )}
                    {/* Vacation bars */}
                    {row.entries.map((entry) => {
                      const start = parseIsoDate(entry.start_date);
                      const end = parseIsoDate(entry.end_date);
                      const monthStart = new Date(year, month, 1);
                      const monthEnd = new Date(year, month, numDays);
                      const visibleStart =
                        start < monthStart ? monthStart : start;
                      const visibleEnd =
                        end > monthEnd ? monthEnd : end;
                      if (visibleStart > visibleEnd) return null;
                      const startDay = visibleStart.getDate();
                      const endDay = visibleEnd.getDate();
                      const left = (startDay - 1) * CELL_W + 4;
                      const width = (endDay - startDay + 1) * CELL_W - 8;

                      const isApproved = entry.status === "approved";
                      const style = isApproved ? palette : PENDING_STYLE;
                      const truncatesLeft = start < monthStart;
                      const truncatesRight = end > monthEnd;

                      return (
                        <Tooltip
                          key={entry.request_id}
                          title={
                            <Box sx={{ p: 0.5 }}>
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "block",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                }}
                              >
                                {row.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ display: "block", mt: 0.25 }}
                              >
                                {isApproved ? "Aprobada" : "Pendiente"}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ display: "block" }}
                              >
                                {formatDate(entry.start_date)} →{" "}
                                {formatDate(entry.end_date)}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{ display: "block" }}
                              >
                                {entry.days} día
                                {entry.days === 1 ? "" : "s"}
                              </Typography>
                            </Box>
                          }
                          arrow
                        >
                          <Box
                            sx={{
                              position: "absolute",
                              top: 8,
                              left,
                              width,
                              height: ROW_H - 16,
                              borderRadius: 999,
                              bgcolor: style.bg,
                              border: 1.5,
                              borderStyle: isApproved ? "solid" : "dashed",
                              borderColor: style.border,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              px: 1.25,
                              overflow: "hidden",
                              boxShadow: isApproved
                                ? "0 1px 3px rgba(0,0,0,0.08)"
                                : "none",
                              transition:
                                "transform 120ms, box-shadow 120ms",
                              "&:hover": {
                                transform: "translateY(-1px)",
                                boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
                                zIndex: 2,
                              },
                              // Visual hint when the bar truncates at the edges.
                              ...(truncatesLeft && {
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                              }),
                              ...(truncatesRight && {
                                borderTopRightRadius: 0,
                                borderBottomRightRadius: 0,
                              }),
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                color: style.text,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                fontSize: 11,
                              }}
                            >
                              {width > 90
                                ? `${row.name.split(" ")[0]} · ${entry.days} d`
                                : `${entry.days} d`}
                            </Typography>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}
    </Stack>
  );
}

function LegendDot({
  bg,
  border,
  label,
  dashed = false,
}: {
  bg: string;
  border: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box
        sx={{
          width: 24,
          height: 12,
          borderRadius: 999,
          bgcolor: bg,
          border: 1.5,
          borderStyle: dashed ? "dashed" : "solid",
          borderColor: border,
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
