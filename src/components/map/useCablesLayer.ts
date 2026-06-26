import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { CABLE_ID } from "../../types";
import { EMPTY, asset } from "./shared";

// Submarine communications cables (TeleGeography's Submarine Cable Map).
// Served as a bundled static asset (the upstream API has no CORS headers) — a
// FeatureCollection of LineStrings, each carrying its own colour and name.
// Loaded once while the Cables workspace is active.
export function useCablesLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("cables") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== CABLE_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch(asset("/cables.geojson"))
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
