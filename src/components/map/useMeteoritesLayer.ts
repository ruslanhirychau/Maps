import { useEffect, useRef, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { METEORITE_ID } from "../../types";
import { EMPTY } from "./shared";

// Static NASA meteorite-landings scatter (~32k points), served from /public so
// it loads same-origin and only when the workspace is opened. Cached after the
// first fetch and re-applied on style reloads.
export function useMeteoritesLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  const cache = useRef<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("meteorites") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== METEORITE_ID) {
      setData(EMPTY);
      return;
    }
    if (cache.current) {
      setData(cache.current);
      return;
    }
    let cancelled = false;
    fetch("/meteorites.geojson")
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        cache.current = fc;
        setData(fc);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, styleVersion, mapRef, loadedRef]);
}
