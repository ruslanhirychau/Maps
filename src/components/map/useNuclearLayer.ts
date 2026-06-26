import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { NUCLEAR_ID } from "../../types";
import { EMPTY, asset } from "./shared";

// Nuclear power plants worldwide (Wikidata). Bundled as a static asset — a
// FeatureCollection of plant points carrying name / country / capacity (MW) and
// a status (operating / shutdown / construction / planned / unknown). Loaded
// once while the workspace is active.
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
    fetch(asset("/nuclear.geojson"))
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
