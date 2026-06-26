import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { NUKETEST_ID } from "../../types";
import { EMPTY, asset } from "./shared";

// Nuclear weapon tests, 1945–1998 (SIPRI report dataset). Bundled as a static
// asset — points carrying name / country / year / yield (kt) / type. Loaded
// once while the workspace is active.
export function useNukeTestsLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("nuketests") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== NUKETEST_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    fetch(asset("/nuketests.geojson"))
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
