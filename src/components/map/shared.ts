import { useStore } from "../../store";
import { EVERYTHING_ID, type Workspace } from "../../types";

// Empty GeoJSON source payload — used to clear a layer's data.
export const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Workspaces whose data should be on the map now: all of them in "Everything",
// otherwise just the active one (a folder shows the union of its members).
export function displayedWorkspaces(): Workspace[] {
  const { workspaces, activeWorkspaceId } = useStore.getState();
  // Everything = all real spaces (not folders).
  if (activeWorkspaceId === EVERYTHING_ID) return workspaces.filter((w) => !w.members);
  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  if (!active) return [];
  if (active.members) {
    const set = new Set(active.members);
    return workspaces.filter((w) => set.has(w.id) && !w.members);
  }
  return [active];
}
