import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { UNESCO_ID } from "../../types";
import { EMPTY } from "./shared";

// UNESCO World Heritage Sites (Wikidata, sites with inscription criteria so each
// is categorised). Bundled as a static asset — points carrying name / country /
// category (cultural / natural / mixed). Loaded once while the workspace is
// active.
export function useUnescoLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("unesco") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== UNESCO_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch("/unesco.geojson")
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
