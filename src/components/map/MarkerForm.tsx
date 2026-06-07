import { useEffect, useState } from "react";
import type { Map as MbMap } from "mapbox-gl";
import { Check, X } from "lucide-react";
import { MARKER_SHAPES, markerGlyph } from "../../markers";

export interface MarkerDraft {
  title: string;
  color: string;
  icon: string;
}

const MARKER_COLORS = ["#845ef7", "#e8590c", "#c92a2a", "#1971c2", "#2f9e44", "#f08c00"];

// Preview pin pinned to the map's center point (it stays put on screen while you
// pan the map underneath it — Google-Maps-style placement).
export function CenterPin({
  map,
  icon,
  color,
}: {
  map: MbMap;
  icon: string;
  color: string;
}) {
  const [pos, setPos] = useState(() => map.project(map.getCenter()));
  useEffect(() => {
    const update = () => setPos(map.project(map.getCenter()));
    update();
    map.on("move", update);
    map.on("resize", update);
    return () => {
      map.off("move", update);
      map.off("resize", update);
    };
  }, [map]);
  return (
    <div className="center-pin" style={{ left: pos.x, top: pos.y, color }}>
      {markerGlyph(icon)}
    </div>
  );
}

// Bottom form for the marker draft: note, icon, colour + done / cancel.
export function MarkerForm({
  draft,
  onChange,
  onDone,
  onCancel,
}: {
  draft: MarkerDraft;
  onChange: (patch: Partial<MarkerDraft>) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="text-toolbar">
      <button className="tt-btn tt-circle" onClick={onCancel} title="Отмена">
        <X size={14} />
      </button>
      <input
        className="mf-input"
        autoFocus
        placeholder="Заметка…"
        value={draft.title}
        onChange={(e) => onChange({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone();
          else if (e.key === "Escape") onCancel();
        }}
      />
      <span className="mf-icons">
        {MARKER_SHAPES.map((s) => (
          <button
            key={s.id}
            className={"mf-ic" + (draft.icon === s.id ? " active" : "")}
            onClick={() => onChange({ icon: s.id })}
            title={s.label}
          >
            {s.glyph}
          </button>
        ))}
      </span>
      <span className="tt-swatches">
        {MARKER_COLORS.map((c) => (
          <button
            key={c}
            className={"tt-sw" + (c === draft.color ? " active" : "")}
            style={{ background: c }}
            onClick={() => onChange({ color: c })}
          />
        ))}
      </span>
      <button className="tt-btn primary tt-circle" onClick={onDone} title="Готово">
        <Check size={14} />
      </button>
    </div>
  );
}
