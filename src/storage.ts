import type { AppData } from "./types";
import { seedData } from "./seed";

// Single place that talks to the storage backend. For now — localStorage.
// Later the same interface (load/save) can be reimplemented on top of Supabase
// without touching the rest of the code.

const STORAGE_KEY = "maps-prototype:v27";

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppData;
  } catch (err) {
    console.warn("Failed to read data from localStorage:", err);
  }
  return seedData();
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
