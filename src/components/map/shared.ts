import { useStore } from "../../store";
import { type Workspace } from "../../types";

// Empty GeoJSON source payload — used to clear a layer's data.
export const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Resolve a file shipped in /public against the app's base path. Needed for
// GitHub Pages, where the site lives under /<repo>/ rather than the domain root.
export function asset(file: string): string {
  return import.meta.env.BASE_URL + file.replace(/^\//, "");
}

// Workspaces whose data should be on the map now: just the active one, or the
// union of a folder's member spaces.
export function displayedWorkspaces(): Workspace[] {
  const { workspaces, activeWorkspaceId } = useStore.getState();
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  if (!active) return [];
  if (active.members) {
    const set = new Set(active.members);
    return workspaces.filter((w) => set.has(w.id) && !w.members);
  }
  return [active];
}
