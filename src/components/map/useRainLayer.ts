import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MbMap, RasterTileSource } from "mapbox-gl";
import { RAIN_ID } from "../../types";

export interface RainFrame {
  time: number;
  path: string;
}

// Weather radar (RainViewer): loads frames while the Rain workspace is active and
// drives the "rain" raster layer. Owns the frame list + selected index, returned
// so a timeline UI can scrub them. `loadedRef`/`styleVersion` let it re-add the
// layer after the basemap reloads.
export function useRainLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  const [frames, setFrames] = useState<RainFrame[]>([]);
  const [index, setIndex] = useState(0);
  const hostRef = useRef("https://tilecache.rainviewer.com");

  // Load frames when the Rain workspace is active, then refresh them periodically
  // (RainViewer rotates frames every ~10 min — stale paths 404).
  useEffect(() => {
    if (activeWorkspaceId !== RAIN_ID) {
      setFrames([]);
      return;
    }
    let cancelled = false;
    const load = (initial: boolean) =>
      fetch("https://api.rainviewer.com/public/weather-maps.json")
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          if (typeof j.host === "string") hostRef.current = j.host;
          const past: RainFrame[] = j.radar?.past ?? [];
          const nowcast: RainFrame[] = j.radar?.nowcast ?? [];
          setFrames([...past, ...nowcast]);
          if (initial) setIndex(Math.max(0, past.length - 1)); // latest observed
        })
        .catch(() => {});
    load(true);
    const timer = window.setInterval(() => load(false), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspaceId]);

  // Manage the rain raster layer: create it only when needed, swap the frame,
  // remove it otherwise. Re-runs on style.load (styleVersion) so it survives the
  // basemap being reloaded.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;
    const frame = frames[index];
    const active = activeWorkspaceId === RAIN_ID && !!frame;
    try {
      if (!active) {
        if (m.getLayer("rain")) m.removeLayer("rain");
        if (m.getSource("rain")) m.removeSource("rain");
        return;
      }
      const url = `${hostRef.current}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      if (m.getLayer("rain")) {
        (m.getSource("rain") as RasterTileSource).setTiles([url]);
      } else {
        if (!m.getSource("rain")) {
          m.addSource("rain", { type: "raster", tiles: [url], tileSize: 256 });
        }
        m.addLayer(
          {
            id: "rain",
            type: "raster",
            source: "rain",
            paint: { "raster-opacity": 0.7, "raster-fade-duration": 0 },
          },
          m.getLayer("markers") ? "markers" : undefined,
        );
      }
    } catch {
      /* map busy — will re-apply on the next style.load */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, frames, index, styleVersion]);

  return { frames, index, setIndex };
}
