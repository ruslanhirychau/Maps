import type { AppData, Layer } from "./types";
import { AIRCRAFT_ID, SHIPS_ID } from "./types";
import { seedData } from "./seed";

// Single place that talks to the storage backend. For now — localStorage.
// Later the same interface (load/save) can be reimplemented on top of Supabase
// without touching the rest of the code.

const STORAGE_KEY = "maps-prototype:v40";

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateData(JSON.parse(raw) as AppData);
  } catch (err) {
    console.warn("Failed to read data from localStorage:", err);
  }
  return migrateData(seedData());
}

function migrateData(data: AppData): AppData {
  const seededLists = new Map(
    seedData()
      .workspaces.filter((workspace) => workspace.id.startsWith("ws-list-"))
      .map((workspace) => [workspace.id, workspace]),
  );
  // Drop imported lists (ws-list-*) that no longer ship in the seed, so removing
  // a list from the code also clears it from existing browsers.
  const workspaces = data.workspaces
    .filter((ws) => !ws.id.startsWith("ws-list-") || seededLists.has(ws.id))
    .map((ws) => ({
      ...ws,
      layers: (seededLists.has(ws.id) && ws.layers.every((layer) => layer.features.length === 0)
        ? seededLists.get(ws.id)!.layers
        : ws.layers
      ).map((layer): Layer => {
        if (layer.cluster !== undefined) return layer;
        return {
          ...layer,
          cluster: ws.id !== AIRCRAFT_ID && ws.id !== SHIPS_ID,
        };
      }),
    }));
  // If the active workspace was one we just dropped, fall back to a valid one.
  const activeWorkspaceId = workspaces.some((ws) => ws.id === data.activeWorkspaceId)
    ? data.activeWorkspaceId
    : workspaces[0]?.id ?? data.activeWorkspaceId;
  return { ...data, workspaces, activeWorkspaceId };
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to save data to localStorage:", err);
  }
}

// Persisted view state: UI layout + last map camera (remembered across reloads).
export interface ViewState {
  layout: "sidebar" | "topbar";
  center: [number, number];
  zoom: number;
}

const VIEW_KEY = "maps-prototype:view:v2";
const DEFAULT_VIEW: ViewState = {
  layout: "sidebar",
  center: [10, 25], // a global view by default (shows the data layers at once)
  zoom: 1.6,
};

export function loadView(): ViewState {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) return { ...DEFAULT_VIEW, ...(JSON.parse(raw) as Partial<ViewState>) };
  } catch (err) {
    console.warn("Failed to read view from localStorage:", err);
  }
  return DEFAULT_VIEW;
}

// Merge a partial update into the saved view (layout and camera saved separately).
export function saveView(patch: Partial<ViewState>): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ ...loadView(), ...patch }));
  } catch (err) {
    console.warn("Failed to save view to localStorage:", err);
  }
}
