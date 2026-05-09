import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { ApiError, get } from "../../api/client";
import EmpleadoForm from "./EmpleadoForm";
import { contractBadge, contractLabel, formatDate, formatRut } from "./format";
import type { EmployeePage, EmployeeRow } from "./types";

type Vigencia = "vigentes" | "no_vigentes";

type SortColumn =
  | "first_name"
  | "rut"
  | "hire_date"
  | "division"
  | "area"
  | "subarea";

type SortOrder = "asc" | "desc";

type ColumnFilters = {
  q_name: string;
  q_rut: string;
  q_cargo: string;
  q_division: string;
  q_area: string;
  q_subarea: string;
};

const EMPTY_FILTERS: ColumnFilters = {
  q_name: "",
  q_rut: "",
  q_cargo: "",
  q_division: "",
  q_area: "",
  q_subarea: "",
};

const PAGE_SIZES = [10, 25, 50, 100] as const;

type Props = {
  onSelect: (employeeId: string) => void;
};

export default function EmpleadosList({ onSelect }: Props) {
  const [vigencia, setVigencia] = useState<Vigencia>("vigentes");
  const [filters, setFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState<ColumnFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortColumn>("first_name");
  const [order, setOrder] = useState<SortOrder>("asc");
  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState<number>(0);
  const [page, setPage] = useState<EmployeePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [reloadToken, setReloadToken] = useState<number>(0);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce per-column filter typing (~300ms).
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedFilters(filters);
      setOffset(0);
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [filters]);

  // Reset offset when vigencia changes.
  useEffect(() => {
    setOffset(0);
  }, [vigencia]);

  // Fetch.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("vigentes", vigencia === "vigentes" ? "true" : "false");
    params.set("sort", sort);
    params.set("order", order);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    for (const [k, v] of Object.entries(debouncedFilters)) {
      if (v.trim()) params.set(k, v.trim());
    }
    setLoading(true);
    setError(null);
    get<EmployeePage>(`/api/employees?${params.toString()}`)
      .then(setPage)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar empleados")
      )
      .finally(() => setLoading(false));
  }, [vigencia, debouncedFilters, sort, order, limit, offset, reloadToken]);

  const handleSort = (col: SortColumn) => {
    if (sort === col) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setOrder("asc");
    }
  };

  const total = page?.total ?? 0;
  const items = page?.items ?? [];
  const fromIndex = total === 0 ? 0 : offset + 1;
  const toIndex = Math.min(offset + items.length, total);

  const exportCsv = () => {
    if (!items.length) return;
    const header = [
      "RUT",
      "Nombre",
      "Cargo",
      "Tipo Contrato",
      "Empresa",
      "Division",
      "Area",
      "Sub-area",
      "Fecha Ingreso",
      "Estado",
    ];
    const rows = items.map((e) => [
      formatRut(e.rut),
      e.full_name,
      e.cargo ?? "",
      contractLabel(e.contract_type),
      e.empresa ?? "",
      e.division ?? "",
      e.area ?? "",
      e.subarea ?? "",
      formatDate(e.hire_date),
      e.status,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empleados-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtersActive = useMemo(
    () => Object.values(filters).some((v) => v.trim().length > 0),
    [filters]
  );

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
      >
        <Typography variant="h5" fontWeight={700}>
          Colaboradores
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowCreate(true)}
        >
          Nuevo colaborador
        </Button>
      </Stack>

      <Tabs
        value={vigencia}
        onChange={(_, v) => setVigencia(v as Vigencia)}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="vigentes" label="Vigentes" />
        <Tab value="no_vigentes" label="No Vigentes" />
      </Tabs>

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Tooltip title={filtersActive ? "Filtros activos" : "Sin filtros"}>
          <IconButton
            color={filtersActive ? "primary" : "default"}
            onClick={() => setFilters(EMPTY_FILTERS)}
            aria-label="Limpiar filtros"
          >
            <FilterAltIcon />
          </IconButton>
        </Tooltip>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Ver
            </Typography>
            <Select
              size="small"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setOffset(0);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="body2" color="text.secondary">
              de {total}
            </Typography>
          </Stack>
          <Tooltip title="Exportar pagina actual a CSV">
            <span>
              <IconButton onClick={exportCsv} disabled={!items.length}>
                <DownloadIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sortDirection={sort === "first_name" ? order : false}>
                  <TableSortLabel
                    active={sort === "first_name"}
                    direction={sort === "first_name" ? order : "asc"}
                    onClick={() => handleSort("first_name")}
                  >
                    Nombre
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort === "rut" ? order : false}>
                  <TableSortLabel
                    active={sort === "rut"}
                    direction={sort === "rut" ? order : "asc"}
                    onClick={() => handleSort("rut")}
                  >
                    Numero de Documento
                  </TableSortLabel>
                </TableCell>
                <TableCell>Cargo</TableCell>
                <TableCell sortDirection={sort === "division" ? order : false}>
                  <TableSortLabel
                    active={sort === "division"}
                    direction={sort === "division" ? order : "asc"}
                    onClick={() => handleSort("division")}
                  >
                    Division
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort === "area" ? order : false}>
                  <TableSortLabel
                    active={sort === "area"}
                    direction={sort === "area" ? order : "asc"}
                    onClick={() => handleSort("area")}
                  >
                    Area
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort === "subarea" ? order : false}>
                  <TableSortLabel
                    active={sort === "subarea"}
                    direction={sort === "subarea" ? order : "asc"}
                    onClick={() => handleSort("subarea")}
                  >
                    Sub-area
                  </TableSortLabel>
                </TableCell>
                <TableCell sortDirection={sort === "hire_date" ? order : false}>
                  <TableSortLabel
                    active={sort === "hire_date"}
                    direction={sort === "hire_date" ? order : "asc"}
                    onClick={() => handleSort("hire_date")}
                  >
                    Fecha Ingreso
                  </TableSortLabel>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Buscar por…"
                    fullWidth
                    value={filters.q_name}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q_name: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Buscar por…"
                    fullWidth
                    value={filters.q_rut}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q_rut: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Buscar por…"
                    fullWidth
                    value={filters.q_cargo}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q_cargo: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Buscar por…"
                    fullWidth
                    value={filters.q_division}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q_division: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Buscar por…"
                    fullWidth
                    value={filters.q_area}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q_area: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    placeholder="Buscar por…"
                    fullWidth
                    value={filters.q_subarea}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, q_subarea: e.target.value }))
                    }
                  />
                </TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin resultados.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {items.map((row: EmployeeRow) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => onSelect(row.id)}
                >
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography
                        variant="body2"
                        sx={{ color: "primary.main", fontWeight: 500 }}
                      >
                        {row.last_name}, {row.first_name}
                      </Typography>
                      {row.contract_type && (
                        <Chip
                          size="small"
                          label={contractBadge(row.contract_type)}
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontWeight: 700,
                            color: "success.main",
                            borderColor: "success.light",
                          }}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{formatRut(row.rut)}</TableCell>
                  <TableCell>{row.cargo ?? "—"}</TableCell>
                  <TableCell>{row.division ?? "—"}</TableCell>
                  <TableCell>{row.area ?? "—"}</TableCell>
                  <TableCell>{row.subarea ?? "—"}</TableCell>
                  <TableCell>{formatDate(row.hire_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {total > limit && (
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ p: 1.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              {fromIndex}–{toIndex} de {total}
            </Typography>
            <Box>
              <Button
                size="small"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Anterior
              </Button>
              <Button
                size="small"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Siguiente
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>

      <EmpleadoForm
        open={showCreate}
        mode="create"
        onClose={() => setShowCreate(false)}
        onSaved={(newId) => {
          setShowCreate(false);
          setReloadToken((t) => t + 1);
          onSelect(newId);
        }}
      />
    </Stack>
  );
}
