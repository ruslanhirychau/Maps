import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { NUCLEAR_ID } from "../../types";
import { EMPTY } from "./shared";

// Nuclear power plants worldwide (WRI Global Power Plant Database). Bundled as a
// static asset — a FeatureCollection of plant points carrying name / country /
// capacity (MW) / commissioning year / owner. Loaded once while the workspace
// is active.
export function useNuclearLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("nuclear") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== NUCLEAR_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch("/nuclear.geojson")
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
