import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { WRECK_ID } from "../../types";
import { EMPTY } from "./shared";

// Shipwrecks worldwide (Wikidata, ~30k geolocated wreck sites). Bundled as a
// static asset — a FeatureCollection of points carrying name / type / country.
// Loaded once while the workspace is active.
export function useWrecksLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("wrecks") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== WRECK_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch("/shipwrecks.geojson")
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
