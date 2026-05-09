import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ChevronDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ChevronUpIcon from "@mui/icons-material/KeyboardArrowUp";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { ApiError, get } from "../../api/client";
import { initials } from "../empleados/format";

type OrgNode = {
  id: string;
  full_name: string;
  cargo: string | null;
  empresa: string | null;
  area: string | null;
  manager_id: string | null;
};

type TreeNode = OrgNode & { children: TreeNode[] };

function buildTree(nodes: OrgNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(
    nodes.map((n) => [n.id, { ...n, children: [] }])
  );
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.manager_id && byId.has(node.manager_id)) {
      byId.get(node.manager_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort children by name for stable layout.
  const sortRecursive = (n: TreeNode) => {
    n.children.sort((a, b) => a.full_name.localeCompare(b.full_name));
    n.children.forEach(sortRecursive);
  };
  roots.forEach(sortRecursive);
  return roots;
}

function filterTree(roots: TreeNode[], q: string): TreeNode[] {
  if (!q.trim()) return roots;
  const needle = q.trim().toLowerCase();
  const matches = (node: TreeNode): boolean => {
    return (
      node.full_name.toLowerCase().includes(needle) ||
      (node.cargo ?? "").toLowerCase().includes(needle) ||
      (node.area ?? "").toLowerCase().includes(needle)
    );
  };
  const prune = (node: TreeNode): TreeNode | null => {
    const childMatches = node.children.map(prune).filter(Boolean) as TreeNode[];
    if (childMatches.length > 0 || matches(node)) {
      return { ...node, children: childMatches };
    }
    return null;
  };
  return roots.map(prune).filter(Boolean) as TreeNode[];
}

function collectIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (n: TreeNode) => {
    ids.add(n.id);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

export default function Organigrama() {
  const [nodes, setNodes] = useState<OrgNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<number>(1);

  useEffect(() => {
    get<OrgNode[]>("/api/employees/org-chart")
      .then(setNodes)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "Error al cargar")
      );
  }, []);

  const tree = useMemo(
    () => (nodes ? filterTree(buildTree(nodes), q) : []),
    [nodes, q]
  );

  // When searching, force-expand everything so matches are visible.
  const effectiveCollapsed = useMemo(
    () => (q.trim() ? new Set<string>() : collapsed),
    [q, collapsed]
  );

  const allCount = nodes?.length ?? 0;
  const visibleCount = tree.length === 0 ? 0 : collectIds(tree).size;

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={2}
      >
        <Stack direction="row" alignItems="baseline" spacing={1.5}>
          <Typography variant="h5" fontWeight={700}>
            Organigrama
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {q.trim()
              ? `${visibleCount} de ${allCount} colaboradores`
              : `${allCount} colaboradores`}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            placeholder="Buscar por nombre, cargo o área"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            sx={{ width: { xs: 220, sm: 320 } }}
          />
          {collapsed.size > 0 && !q.trim() && (
            <Chip
              label={`${collapsed.size} ramas plegadas — expandir`}
              onClick={() => setCollapsed(new Set())}
              size="small"
              variant="outlined"
              clickable
            />
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {nodes === null && !error && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={20} />
        </Box>
      )}
      {nodes && tree.length === 0 && (
        <Alert severity="info">Sin coincidencias.</Alert>
      )}

      {tree.length > 0 && (
        <Box sx={{ position: "relative" }}>
          <Box
            sx={{
              overflowX: "auto",
              overflowY: "hidden",
              py: 3,
              px: 1,
              bgcolor: "background.default",
              borderRadius: 2,
              maxHeight: "calc(100vh - 280px)",
            }}
          >
            <Box
              sx={{
                // `zoom` recomputes layout (and the parent's scroll). Works in
                // Chromium/Webkit/Firefox 126+. Forger desktop is Electron, so
                // it's safe.
                zoom: zoom,
                minWidth: "fit-content",
              }}
            >
              <Stack
                direction="row"
                spacing={6}
                justifyContent={tree.length === 1 ? "center" : "flex-start"}
                sx={{ minWidth: "fit-content" }}
              >
                {tree.map((root) => (
                  <TreeNodeView
                    key={root.id}
                    node={root}
                    collapsed={effectiveCollapsed}
                    onToggle={toggleCollapsed}
                  />
                ))}
              </Stack>
            </Box>
          </Box>

          {/* Floating overlay controls: outside scroll box so they don't move with pan. */}
          <Box
            sx={{
              position: "absolute",
              bottom: 12,
              right: 12,
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            <Box sx={{ pointerEvents: "auto" }}>
              <ZoomControls zoom={zoom} onChange={setZoom} />
            </Box>
          </Box>
        </Box>
      )}
    </Stack>
  );
}

// ── Zoom controls ─────────────────────────────────────────────────────────────

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.75;
const ZOOM_STEP = 0.1;

function ZoomControls({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
  return (
    <Stack
      direction="column"
      spacing={0}
      sx={{
        width: "fit-content",
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <Tooltip title="Acercar" placement="left">
        <span>
          <IconButton
            size="small"
            onClick={() => onChange(clamp(zoom + ZOOM_STEP))}
            disabled={zoom >= ZOOM_MAX}
          >
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Box
        sx={{
          px: 0.75,
          py: 0.25,
          textAlign: "center",
          borderTop: 1,
          borderBottom: 1,
          borderColor: "divider",
          minWidth: 40,
        }}
      >
        <Typography variant="caption" fontWeight={700}>
          {Math.round(zoom * 100)}%
        </Typography>
      </Box>
      <Tooltip title="Alejar" placement="left">
        <span>
          <IconButton
            size="small"
            onClick={() => onChange(clamp(zoom - ZOOM_STEP))}
            disabled={zoom <= ZOOM_MIN}
          >
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Restablecer (100%)" placement="left">
        <span>
          <IconButton
            size="small"
            onClick={() => onChange(1)}
            disabled={zoom === 1}
            sx={{ borderTop: 1, borderColor: "divider", borderRadius: 0 }}
          >
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

// ── Recursive tree node ───────────────────────────────────────────────────────

const NODE_WIDTH = 200;
const NODE_GAP_X = 16;
const NODE_GAP_Y = 28;
const CONNECTOR_THICKNESS = 1.5;
const CONNECTOR_COLOR = "rgba(0,0,0,0.16)";

function TreeNodeView({
  node,
  collapsed,
  onToggle,
}: {
  node: TreeNode;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isCollapsed = collapsed.has(node.id);
  const hasChildren = node.children.length > 0;
  const showChildren = hasChildren && !isCollapsed;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        // Vertical line below the card, going down to the children row.
        // Only show when expanded and has children.
        "&::after":
          showChildren
            ? {
                content: '""',
                position: "absolute",
                top: "100%",
                left: "50%",
                width: `${CONNECTOR_THICKNESS}px`,
                height: `${NODE_GAP_Y}px`,
                bgcolor: CONNECTOR_COLOR,
                transform: "translateX(-50%)",
              }
            : undefined,
      }}
    >
      <NodeCard
        node={node}
        isCollapsed={isCollapsed}
        canCollapse={hasChildren}
        onToggle={() => onToggle(node.id)}
      />

      {showChildren && (
        <Box
          sx={{
            display: "flex",
            mt: `${NODE_GAP_Y * 2}px`,
            gap: `${NODE_GAP_X}px`,
            position: "relative",
            // Horizontal trunk connecting all immediate children.
            // Only draws between first and last child.
            "&::before":
              node.children.length > 1
                ? {
                    content: '""',
                    position: "absolute",
                    top: `-${NODE_GAP_Y}px`,
                    left: `${NODE_WIDTH / 2}px`,
                    right: `${NODE_WIDTH / 2}px`,
                    height: `${CONNECTOR_THICKNESS}px`,
                    bgcolor: CONNECTOR_COLOR,
                  }
                : undefined,
          }}
        >
          {node.children.map((child) => (
            <Box
              key={child.id}
              sx={{
                position: "relative",
                // Vertical drop from horizontal trunk to the child card.
                "&::before": {
                  content: '""',
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  width: `${CONNECTOR_THICKNESS}px`,
                  height: `${NODE_GAP_Y}px`,
                  bgcolor: CONNECTOR_COLOR,
                  transform: "translateX(-50%)",
                },
              }}
            >
              <TreeNodeView
                node={child}
                collapsed={collapsed}
                onToggle={onToggle}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  isCollapsed,
  canCollapse,
  onToggle,
}: {
  node: TreeNode;
  isCollapsed: boolean;
  canCollapse: boolean;
  onToggle: () => void;
}) {
  const totalReportsAll = countAllReports(node);
  return (
    <Tooltip
      title={
        <Box sx={{ p: 0.5 }}>
          <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
            {node.full_name}
          </Typography>
          {node.cargo && (
            <Typography variant="caption" sx={{ display: "block" }}>
              {node.cargo}
            </Typography>
          )}
          {(node.empresa || node.area) && (
            <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
              {[node.empresa, node.area].filter(Boolean).join(" · ")}
            </Typography>
          )}
          {totalReportsAll > 0 && (
            <Typography variant="caption" sx={{ display: "block", opacity: 0.8 }}>
              {totalReportsAll} en su organización
            </Typography>
          )}
        </Box>
      }
      placement="top"
      arrow
    >
      <Box
        sx={{
          width: NODE_WIDTH,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          p: 1.25,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          transition: "box-shadow 120ms ease, transform 120ms ease",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            transform: "translateY(-1px)",
            borderColor: "primary.light",
          },
          position: "relative",
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar
            sx={{
              width: 36,
              height: 36,
              bgcolor: "primary.light",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {initials(node.full_name)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={700}
              noWrap
              title={node.full_name}
            >
              {node.full_name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              title={node.cargo ?? undefined}
              sx={{ display: "block" }}
            >
              {node.cargo ?? "—"}
            </Typography>
          </Box>
        </Stack>

        {canCollapse && (
          <Box
            sx={{
              position: "absolute",
              bottom: -10,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1,
            }}
          >
            <IconButton
              size="small"
              onClick={onToggle}
              sx={{
                width: 22,
                height: 22,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                p: 0,
                "&:hover": { bgcolor: "background.default" },
              }}
              aria-label={isCollapsed ? "Expandir reportes" : "Contraer reportes"}
            >
              {isCollapsed ? (
                <ChevronDownIcon sx={{ fontSize: 16 }} />
              ) : (
                <ChevronUpIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Box>
        )}

        {canCollapse && (
          <Chip
            label={
              isCollapsed
                ? `+${node.children.length}`
                : `${node.children.length}`
            }
            size="small"
            sx={{
              position: "absolute",
              top: -8,
              right: -8,
              height: 18,
              fontSize: 10,
              fontWeight: 700,
              bgcolor: isCollapsed ? "warning.light" : "primary.light",
              color: isCollapsed ? "warning.contrastText" : "primary.contrastText",
            }}
          />
        )}
      </Box>
    </Tooltip>
  );
}

function countAllReports(node: TreeNode): number {
  return node.children.reduce(
    (acc, c) => acc + 1 + countAllReports(c),
    0
  );
}
