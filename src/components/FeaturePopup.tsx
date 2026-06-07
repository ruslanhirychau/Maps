import { useState } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";

interface Props {
  featureId: string;
  x: number;
  y: number;
  onClose: () => void;
}

// Detail card for a clicked marker / text: shows its properties and lets you
// rename or delete it.
export function FeaturePopup({ featureId, x, y, onClose }: Props) {
  const workspaces = useStore((s) => s.workspaces);
  const updateFeature = useStore((s) => s.updateFeature);
  const removeFeature = useStore((s) => s.removeFeature);

  // Search all workspaces (works in "Everything" too, where there's no active one).
  const feature = workspaces
    .flatMap((w) => w.layers)
    .flatMap((l) => l.features)
    .find((f) => f.id === featureId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feature?.title ?? "");

  if (!feature) return null; // deleted elsewhere

  const p = feature.properties as Record<string, unknown>;
  const rating = typeof p.rating === "number" ? p.rating : null;
  const address = typeof p.address === "string" ? p.address : "";
  const text = typeof p.text === "string" ? p.text : "";
  const url = typeof p.url === "string" ? p.url : "";

  function save() {
    if (title.trim()) updateFeature(feature!.id, { title: title.trim() });
    setEditing(false);
  }

  return (
    <div className="feature-popup" style={{ left: x, top: y }}>
      <button className="fp-close" title="Close" onClick={onClose}>
        <X size={15} />
      </button>

      {editing ? (
        <input
          className="fp-title-input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <div className="fp-title">
          {feature.kind === "text" ? "🅰" : "📍"} {feature.title}
        </div>
      )}

      {rating !== null && (
        <div className="fp-row">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</div>
      )}
      {address && <div className="fp-row fp-muted">{address}</div>}
      {text && <div className="fp-row">{text}</div>}
      {url && (
        <a className="fp-row fp-link" href={url} target="_blank" rel="noreferrer">
          Open in Google Maps ↗
        </a>
      )}

      <div className="fp-actions">
        {editing ? (
          <button className="fp-btn" onClick={save}>
            Save
          </button>
        ) : (
          <button className="fp-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button
          className="fp-btn danger"
          onClick={() => {
            removeFeature(feature.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
