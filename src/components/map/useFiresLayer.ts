import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { FIRE_ID } from "../../types";
import { EMPTY } from "./shared";

interface EonetPoint {
  type: string;
  coordinates: [number, number];
  magnitudeValue?: number;
  date?: string;
}
interface EonetEvent {
  title: string;
  geometry?: EonetPoint[];
}

function toFeatures(events: EonetEvent[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const e of events) {
    const g = e.geometry?.[e.geometry.length - 1]; // most recent detection
    if (!g || g.type !== "Point") continue;
    const [lon, lat] = g.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        title: e.title,
        acres: typeof g.magnitudeValue === "number" ? g.magnitudeValue : null,
        date: g.date ?? null,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

// Live wildfires (NASA EONET), only while the Wildfires workspace is active.
// Plots the latest detection of each open fire event; refreshed periodically.
export function useFiresLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("fires") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== FIRE_ID) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    const load = () =>
      fetch(
        "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=500",
      )
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          setData(toFeatures(j.events ?? []));
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeWorkspaceId, styleVersion, mapRef, loadedRef]);
}
