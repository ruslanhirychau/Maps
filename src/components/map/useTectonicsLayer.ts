import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { TECTONIC_ID } from "../../types";
import { EMPTY, asset } from "./shared";

// "Ring of Fire" workspace: three sources rendered together —
//  • plates    — tectonic plate boundaries (static, fraxen/PB2002)
//  • volcanoes — Holocene volcanoes (static, Smithsonian GVP)
//  • quakes    — earthquakes of the past month (live USGS feed, refreshed)
// All three are gated on the Tectonics workspace being active.
export function useTectonicsLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const set = (id: string, fc: GeoJSON.FeatureCollection) =>
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== TECTONIC_ID) {
      set("plates", EMPTY);
      set("volcanoes", EMPTY);
      set("quakes", EMPTY);
      return;
    }

    let cancelled = false;
    const load = (url: string, id: string) =>
      fetch(url)
        .then((r) => r.json())
        .then((j: GeoJSON.FeatureCollection) => {
          if (!cancelled) set(id, j && j.features ? j : EMPTY);
        })
        .catch(() => {});

    // Static layers — load once.
    load(asset("/plates.geojson"), "plates");
    load(asset("/volcanoes.geojson"), "volcanoes");

    // Live earthquakes (past 30 days) — refresh every 5 minutes.
    const loadQuakes = () =>
      load(
        "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
        "quakes",
      );
    loadQuakes();
    const timer = window.setInterval(loadQuakes, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspaceId, styleVersion, mapRef, loadedRef]);
}
