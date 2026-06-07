import { MapPin, Type, Spline, Hexagon, Trash2 } from "lucide-react";

// Floating add/draw toolbar: marker, text, line, polygon, delete selected.
export function DrawTools({
  active,
  canDelete,
  onMarker,
  onText,
  onLine,
  onPolygon,
  onDelete,
}: {
  active: "marker" | "text" | "line" | "polygon" | null;
  canDelete: boolean;
  onMarker: () => void;
  onText: () => void;
  onLine: () => void;
  onPolygon: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="draw-tools">
      <button
        className={"dt-btn" + (active === "marker" ? " active" : "")}
        onClick={onMarker}
        title="Поставить маркер"
      >
        <MapPin size={17} />
      </button>
      <button
        className={"dt-btn" + (active === "text" ? " active" : "")}
        onClick={onText}
        title="Добавить текст"
      >
        <Type size={17} />
      </button>
      <span className="dt-sep" />
      <button
        className={"dt-btn" + (active === "line" ? " active" : "")}
        onClick={onLine}
        title="Нарисовать линию"
      >
        <Spline size={17} />
      </button>
      <button
        className={"dt-btn" + (active === "polygon" ? " active" : "")}
        onClick={onPolygon}
        title="Нарисовать полигон"
      >
        <Hexagon size={17} />
      </button>
      {canDelete && (
        <>
          <span className="dt-sep" />
          <button className="dt-btn" onClick={onDelete} title="Удалить выбранное">
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );
}
