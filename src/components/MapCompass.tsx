import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import type { Map as MapboxMap } from "mapbox-gl";

// Custom compass: shown only when the map is rotated or tilted. The needle
// reflects the current bearing; clicking resets north-up and flat.
export function MapCompass({ map }: { map: MapboxMap | null }) {
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);

  useEffect(() => {
    if (!map) return;
    const update = () => {
      setBearing(map.getBearing());
      setPitch(map.getPitch());
    };
    update();
    map.on("rotate", update);
    map.on("pitch", update);
    return () => {
      map.off("rotate", update);
      map.off("pitch", update);
    };
  }, [map]);

  // Hidden when the camera is at its default orientation.
  if (Math.abs(bearing) < 0.5 && pitch < 0.5) return null;

  return (
    <button
      className="map-compass"
      title="Reset north"
      onClick={() => map?.easeTo({ bearing: 0, pitch: 0, duration: 300 })}
    >
      <Compass size={18} style={{ transform: `rotate(${-bearing}deg)` }} />
    </button>
  );
}
