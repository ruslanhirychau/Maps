import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { COVID_ID } from "../../types";
import { EMPTY, asset } from "./shared";

// COVID-19 totals by country (disease.sh, aggregating JHU/Worldometers).
// Bundled as a static asset — a FeatureCollection of country points carrying
// cases / deaths / recovered / case-fatality ratio. Loaded once while the
// COVID workspace is active.
export function useCovidLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("covid") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== COVID_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch(asset("/covid.geojson"))
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
