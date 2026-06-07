import { MapPin, Type } from "lucide-react";
import { useStore } from "../store";

// Floating marker/text tools over the map. Selecting one arms a map click to
// place that object; the placement label is entered inline on the map.
export function MapTools() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);

  return (
    <div className="map-tools">
      <button
        className={tool === "marker" ? "map-tool active" : "map-tool"}
        onClick={() => setTool(tool === "marker" ? "none" : "marker")}
      >
        <MapPin size={16} /> Marker
      </button>
      <button
        className={tool === "text" ? "map-tool active" : "map-tool"}
        onClick={() => setTool(tool === "text" ? "none" : "text")}
      >
        <Type size={16} /> Text
      </button>
    </div>
  );
}
