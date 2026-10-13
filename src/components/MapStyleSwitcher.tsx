import { useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { useStore, selectActiveWorkspace } from "../store";
import { MAP_STYLES, type MapStyleId } from "../mapStyles";

// On-map basemap picker. Saves the chosen style to the active workspace.
export function MapStyleSwitcher() {
  const workspace = useStore(selectActiveWorkspace);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const [open, setOpen] = useState(false);

  if (!workspace) return null;

  const currentId: MapStyleId = workspace.style;
  const current = MAP_STYLES.find((s) => s.id === currentId);

  function choose(id: MapStyleId) {
    updateWorkspace(workspace!.id, { style: id });
    setOpen(false);
  }

  return (
    <div className="map-style">
      <button
        className="map-style-btn"
        title="Map style"
        onClick={() => setOpen((o) => !o)}
      >
        <MapIcon size={16} />
        <span className="map-style-label">{current?.label ?? "Style"}</span>
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
