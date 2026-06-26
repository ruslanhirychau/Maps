import { memo } from "react";
import { useStore } from "../store";
import { AIRCRAFT_ID, SHIPS_ID, type Workspace } from "../types";

interface Props {
  workspace: Workspace;
  onEdit: () => void;
}

// One workspace's pane: header + layers + objects.
export const WorkspacePane = memo(function WorkspacePane({
  workspace,
  onEdit,
}: Props) {
  const toggleLayer = useStore((s) => s.toggleLayer);
  const toggleLayerCluster = useStore((s) => s.toggleLayerCluster);
  const flyToFeature = useStore((s) => s.flyToFeature);

  const isEmpty = workspace.layers.flatMap((l) => l.features).length === 0;
  const canCluster = workspace.id !== AIRCRAFT_ID && workspace.id !== SHIPS_ID;

  return (
    <div className="ws-pane" style={{ ["--accent" as string]: workspace.color }}>
      <header className="ws-header" title="Edit workspace" onClick={onEdit}>
        <span className="ws-header-icon">{workspace.icon}</span>
        <span className="ws-header-name">{workspace.name}</span>
        <span className="ws-edit">✎</span>
      </header>

      <div className="sidebar-body">
        <section>
          <h2>Layers</h2>
          {workspace.layers.map((lyr) => (
            <div key={lyr.id} className="layer">
              <label>
                <input
                  type="checkbox"
                  checked={lyr.visible}
                  onChange={() => toggleLayer(lyr.id)}
                />
                <span className="swatch" style={{ background: lyr.color }} />
                {lyr.name} ({lyr.features.length})
              </label>
              {canCluster && (
                <label title="Group nearby markers">
                  <input
                    type="checkbox"
                    checked={lyr.cluster !== false}
                    onChange={() => toggleLayerCluster(lyr.id)}
                  />
                  Cluster
                </label>
              )}
            </div>
          ))}
        </section>

        <section className="features">
          <h2>Objects</h2>
          {isEmpty && <p className="hint">Empty for now — add a marker or text.</p>}
          {workspace.layers.flatMap((lyr) =>
            lyr.features.map((f) => (
              <div
                key={f.id}
                className="feature-row clickable"
                title="Fly to this object"
                onClick={() => flyToFeature(f.lngLat)}
              >
                <span>
                  {f.kind === "text" ? "🅰" : "📍"} {f.title}
                </span>
              </div>
            )),
          )}
        </section>
      </div>
    </div>
  );
});
