import { useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { useStore, selectActiveWorkspace } from "../store";
import { MAP_STYLES, type MapStyleId } from "../mapStyles";
import { EVERYTHING_ID } from "../types";

// On-map basemap picker. Saves the chosen style to the active workspace, or to
// the "Everything" view's own basemap when it's active.
export function MapStyleSwitcher() {
  const workspace = useStore(selectActiveWorkspace);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const everythingStyle = useStore((s) => s.everythingStyle);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const setEverythingStyle = useStore((s) => s.setEverythingStyle);
  const [open, setOpen] = useState(false);

  const isEverything = activeWorkspaceId === EVERYTHING_ID;
  if (!isEverything && !workspace) return null;

  const currentId: MapStyleId = isEverything
    ? everythingStyle
    : (workspace!.style);
  const current = MAP_STYLES.find((s) => s.id === currentId);

  function choose(id: MapStyleId) {
    if (isEverything) setEverythingStyle(id);
    else updateWorkspace(workspace!.id, { style: id });
    setOpen(false);
  }

  return (
    <div className="map-style">
      <button
        className="map-style-btn"
        title="Map style"
        onClick={() => setOpen((o) => !o)}
      >
        <MapIcon size={16} /> {current?.label ?? "Style"}
      </button>
      {open && (
        <div className="map-style-menu">
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              className={s.id === currentId ? "style-opt active" : "style-opt"}
              onClick={() => choose(s.id)}
            >
              <span className="style-opt-label">{s.label}</span>
              <span className="style-opt-hint">{s.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
