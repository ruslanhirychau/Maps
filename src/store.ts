import { create } from "zustand";
import type { AppData, Feature, FeatureKind, Workspace } from "./types";
import { INBOX_ID } from "./types";
import type { MapStyleId } from "./mapStyles";
import { loadData, loadView, saveData, saveView } from "./storage";
import { hasRequiredApiKeys } from "./apiKeys";
import { MOBILE_QUERY } from "./useIsMobile";

// First coordinate of a geometry — used as a shape's representative point.
function firstPoint(geom: GeoJSON.Geometry): [number, number] | null {
  if (geom.type === "LineString") return geom.coordinates[0] as [number, number];
  if (geom.type === "Polygon") return geom.coordinates[0]?.[0] as [number, number];
  if (geom.type === "Point") return geom.coordinates as [number, number];
  return null;
}

// Config for creating a workspace from the editor screen.
export interface WorkspaceConfig {
  name: string;
  icon: string;
  color: string;
  style: MapStyleId;
  marker: string;
}

// Tool selected in the panel: what happens when the map is clicked.
export type Tool = "none" | "marker" | "text";

// UI layout: full sidebar, or a floating tab bar over the map (iPad-style).
export type Layout = "sidebar" | "topbar";

interface AppState extends AppData {
  tool: Tool;
  layout: Layout;
  setLayout: (layout: Layout) => void;
  // True while the editor rail is open (so the brand overlay can hide).
  editing: boolean;
  setEditing: (v: boolean) => void;
  // Transient camera target requested from the UI (e.g. clicking a list item).
  // nonce makes repeated clicks on the same point re-trigger the flight.
  focus: { lngLat: [number, number]; nonce: number } | null;
  flyToFeature: (lngLat: [number, number]) => void;
  // Bumped to request framing all points of the active workspace.
  fitNonce: number;
  fitAll: () => void;
  setTool: (tool: Tool) => void;
  setActiveWorkspace: (id: string) => void;
  addWorkspace: (config: WorkspaceConfig) => void;
  // Create an empty folder (aggregating workspace) and return its id.
  addFolder: () => string;
  removeWorkspace: (id: string) => void;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
  // Drag-and-drop: move a workspace before `beforeId` (or to the group's end)
  // and set its pinned group. Reorders the single workspaces array.
  moveWorkspace: (draggedId: string, beforeId: string | null, pinned: boolean) => void;
  addFeature: (
    lngLat: [number, number],
    kind: FeatureKind,
    title: string,
    props?: Record<string, unknown>,
  ) => void;
  updateFeature: (featureId: string, patch: Partial<Feature>) => void;
  removeFeature: (featureId: string) => void;
  // Create-or-update a drawn shape (line/polygon) from Mapbox Draw by its id.
  upsertShape: (id: string, kind: FeatureKind, geometry: GeoJSON.Geometry) => void;
  toggleLayer: (layerId: string) => void;
  toggleLayerCluster: (layerId: string) => void;
  // API-keys popup: opened on first run (required key missing) or manually.
  keysOpen: boolean;
  setKeysOpen: (open: boolean) => void;
}

const initial = loadData();

// Accent palette offered as swatches in the workspace editor (Arc-style).
export const PALETTE = [
  "#e8590c",
  "#c92a2a",
  "#1971c2",
  "#2f9e44",
  "#9c36b5",
  "#0c8599",
  "#e8590c",
  "#f08c00",
];

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Persist the data slice (without UI state) to localStorage after each change.
function persist(state: AppState) {
  saveData({
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
  });
}

export const useStore = create<AppState>((set, get) => {
  // Apply a workspaces change and persist it. (Undo is editor-local, not here.)
  const commit = (next: Workspace[]) => {
    set({ workspaces: next });
    persist(get());
  };

  // A fresh mobile visit always lands on the topbar, even if a previous
  // desktop session last saved "sidebar" — the docked sidebar only makes
  // sense at desktop widths.
  const initialLayout: Layout = window.matchMedia(MOBILE_QUERY).matches
    ? "topbar"
    : loadView().layout;

  return {
  ...initial,
  tool: "none",
  layout: initialLayout,
  setLayout: (layout) => {
    set({ layout });
    saveView({ layout });
  },
  editing: false,
  setEditing: (editing) => set({ editing }),
  keysOpen: !hasRequiredApiKeys(),
  setKeysOpen: (open) => set({ keysOpen: open }),
  focus: null,

  flyToFeature: (lngLat) =>
    set((s) => ({ focus: { lngLat, nonce: (s.focus?.nonce ?? 0) + 1 } })),

  fitNonce: 0,
  fitAll: () => set((s) => ({ fitNonce: s.fitNonce + 1 })),

  setTool: (tool) => set({ tool }),

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id });
    persist(get());
  },

  addWorkspace: (config) => {
    const ws: Workspace = {
      id: genId("ws"),
      ...config,
      pinned: true,
      // Start at a neutral world view; the camera is saved per workspace later.
      center: [0, 20],
      zoom: 1.5,
      layers: [
        {
          id: genId("lyr"),
          name: "Layer 1",
          color: config.color,
          visible: true,
          cluster: true,
          features: [],
        },
      ],
    };
    set({ workspaces: [...get().workspaces, ws], activeWorkspaceId: ws.id });
    persist(get());
  },

  addFolder: () => {
    const id = genId("ws");
    const color = PALETTE[get().workspaces.length % PALETTE.length];
    const folder: Workspace = {
      id,
      name: "New folder",
      icon: "📁",
      color,
      style: "dark-v11",
      pinned: false,
      marker: "circle",
      members: [],
      center: [0, 20],
      zoom: 1.5,
      layers: [],
    };
    set({ workspaces: [...get().workspaces, folder], activeWorkspaceId: id });
    persist(get());
    return id;
  },

  removeWorkspace: (id) => {
    const remaining = get().workspaces.filter((ws) => ws.id !== id);
    const activeWorkspaceId =
      get().activeWorkspaceId === id
        ? (remaining[0]?.id ?? null)
        : get().activeWorkspaceId;
    set({ workspaces: remaining, activeWorkspaceId });
    persist(get());
  },

  updateWorkspace: (id, patch) => {
    const next = get().workspaces.map((ws) => {
      if (ws.id !== id) return ws;
      const updated = { ...ws, ...patch };
      // Changing the workspace color recolors its layers (and thus the markers).
      if (patch.color) {
        updated.layers = ws.layers.map((lyr) => ({ ...lyr, color: patch.color! }));
      }
      return updated;
    });
    set({ workspaces: next });
    persist(get());
  },

  moveWorkspace: (draggedId, beforeId, pinned) => {
    const list = [...get().workspaces];
    const from = list.findIndex((w) => w.id === draggedId);
    if (from < 0) return;
    const [item] = list.splice(from, 1);
    const moved = { ...item, pinned };
    const insertAt =
      beforeId !== null ? list.findIndex((w) => w.id === beforeId) : -1;
    list.splice(insertAt < 0 ? list.length : insertAt, 0, moved);
    set({ workspaces: list });
    persist(get());
  },

  addFeature: (lngLat, kind, title, props) => {
    const { activeWorkspaceId, workspaces } = get();
    // A folder aggregates other spaces — drop the note into Inbox instead.
    const active = workspaces.find((w) => w.id === activeWorkspaceId);
    const isAggregate = active?.members !== undefined;
    const targetId = isAggregate
      ? (workspaces.find((w) => w.id === INBOX_ID)?.id ?? workspaces[0]?.id ?? null)
      : activeWorkspaceId;
    const feature: Feature = {
      id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      lngLat,
      title,
      properties: props ?? {},
      createdAt: Date.now(),
    };
    if (!targetId) return;
    const next = workspaces.map((ws) => {
      if (ws.id !== targetId) return ws;
      // Add to the workspace's first layer (single layer in the prototype).
      const layers = ws.layers.map((lyr, i) =>
        i === 0 ? { ...lyr, features: [...lyr.features, feature] } : lyr,
      );
      return { ...ws, layers };
    });
    commit(next);
    set({ tool: "none" });
  },

  updateFeature: (featureId, patch) => {
    const next = get().workspaces.map((ws) => ({
      ...ws,
      layers: ws.layers.map((lyr) => ({
        ...lyr,
        features: lyr.features.map((f) =>
          f.id === featureId ? { ...f, ...patch } : f,
        ),
      })),
    }));
    commit(next);
  },

  removeFeature: (featureId) => {
    const next = get().workspaces.map((ws) => ({
      ...ws,
      layers: ws.layers.map((lyr) => ({
        ...lyr,
        features: lyr.features.filter((f) => f.id !== featureId),
      })),
    }));
    commit(next);
  },

  upsertShape: (id, kind, geometry) => {
    const { workspaces, activeWorkspaceId } = get();
    const firstCoord = firstPoint(geometry);
    const exists = workspaces.some((ws) =>
      ws.layers.some((lyr) => lyr.features.some((f) => f.id === id)),
    );
    if (exists) {
      // Geometry edited in Draw — update wherever the feature already lives.
      const next = workspaces.map((ws) => ({
        ...ws,
        layers: ws.layers.map((lyr) => ({
          ...lyr,
          features: lyr.features.map((f) =>
            f.id === id ? { ...f, geometry, lngLat: firstCoord ?? f.lngLat } : f,
          ),
        })),
      }));
      commit(next);
      return;
    }
    // New shape — route like addFeature (folders drop into Inbox).
    const active = workspaces.find((w) => w.id === activeWorkspaceId);
    const isAggregate = active?.members !== undefined;
    const targetId = isAggregate
      ? (workspaces.find((w) => w.id === INBOX_ID)?.id ?? workspaces[0]?.id ?? null)
      : activeWorkspaceId;
    if (!targetId) return;
    const feature: Feature = {
      id,
      kind,
      lngLat: firstCoord ?? [0, 0],
      geometry,
      title: kind === "polygon" ? "Polygon" : "Line",
      properties: {},
      createdAt: Date.now(),
    };
    const next = workspaces.map((ws) =>
      ws.id === targetId
        ? {
            ...ws,
            layers: ws.layers.map((lyr, i) =>
              i === 0 ? { ...lyr, features: [...lyr.features, feature] } : lyr,
            ),
          }
        : ws,
    );
    commit(next);
  },

  toggleLayer: (layerId) => {
    const next = get().workspaces.map((ws) => ({
      ...ws,
      layers: ws.layers.map((lyr) =>
        lyr.id === layerId ? { ...lyr, visible: !lyr.visible } : lyr,
      ),
    }));
    set({ workspaces: next });
    persist(get());
  },

  toggleLayerCluster: (layerId) => {
    const next = get().workspaces.map((ws) => ({
      ...ws,
      layers: ws.layers.map((lyr) =>
        lyr.id === layerId ? { ...lyr, cluster: lyr.cluster === false } : lyr,
      ),
    }));
    set({ workspaces: next });
    persist(get());
  },
  };
});

// Convenience selector for the active workspace.
export function selectActiveWorkspace(state: AppState): Workspace | undefined {
  return state.workspaces.find((ws) => ws.id === state.activeWorkspaceId);
}
