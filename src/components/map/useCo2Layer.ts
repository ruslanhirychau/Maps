import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { CO2_ID } from "../../types";
import { EMPTY } from "./shared";

// CO2 emissions by country (Our World in Data, latest year baked into Natural
// Earth country polygons). Bundled as a static asset — a choropleth driven by
// the per-country `co2` (annual Mt) and `pc` (per capita) properties. Loaded
// once while the workspace is active.
export function useCo2Layer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("co2") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== CO2_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch("/co2.geojson")
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
