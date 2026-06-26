import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { CRASH_ID } from "../../types";
import { EMPTY, asset } from "./shared";

// Aviation accidents worldwide (Wikidata, geolocated). Bundled as a static
// asset — a FeatureCollection of crash sites carrying name / operator /
// fatalities / year. Loaded once while the workspace is active.
export function useCrashesLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("crashes") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== CRASH_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch(asset("/crashes.geojson"))
      .then((r) => r.json())
      .then((j: GeoJSON.FeatureCollection) => {
        if (cancelled) return;
        setData(j && j.features ? j : EMPTY);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, styleVersion, mapRef, loadedRef]);
}
