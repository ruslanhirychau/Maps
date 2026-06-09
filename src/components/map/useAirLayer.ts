import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { AIR_ID } from "../../types";
import { EMPTY } from "./shared";

interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}
interface AqResult {
  current?: { pm2_5?: number; european_aqi?: number };
}

// Air quality by major city. The city list (top ~300 by population, GeoNames) is
// a bundled static asset; live PM2.5 + European AQI come from Open-Meteo's
// keyless air-quality API in a single bulk request, refreshed hourly. Only
// active while the Air Quality workspace is selected.
export function useAirLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("air") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== AIR_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    let cities: City[] = [];

    const refresh = () => {
      if (!cities.length) return;
      const lat = cities.map((c) => c.lat).join(",");
      const lon = cities.map((c) => c.lon).join(",");
      fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,european_aqi`,
      )
        .then((r) => r.json())
        .then((j: AqResult | AqResult[]) => {
          if (cancelled) return;
          const arr = Array.isArray(j) ? j : [j];
          const features: GeoJSON.Feature[] = [];
          cities.forEach((c, i) => {
            const cur = arr[i]?.current;
            const aqi = cur?.european_aqi;
            const pm = cur?.pm2_5;
            if (typeof aqi !== "number") return;
            features.push({
              type: "Feature",
              geometry: { type: "Point", coordinates: [c.lon, c.lat] },
              properties: {
                name: c.name,
                country: c.country,
                aqi,
                pm25: typeof pm === "number" ? pm : null,
              },
            });
          });
          setData({ type: "FeatureCollection", features });
        })
        .catch(() => {});
    };

    fetch("/aq_cities.json")
      .then((r) => r.json())
      .then((list: City[]) => {
        if (cancelled) return;
        cities = list;
        refresh();
      })
      .catch(() => {});

    const timer = window.setInterval(refresh, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspaceId, styleVersion, mapRef, loadedRef]);
}
