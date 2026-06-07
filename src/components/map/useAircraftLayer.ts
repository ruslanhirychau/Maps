import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { AIRCRAFT_ID } from "../../types";
import { EMPTY } from "./shared";

// Live aircraft (OpenSky via the dev proxy), only while the "Live Aircraft"
// workspace is active. The server is polled periodically; between polls each
// plane is moved by dead reckoning (speed + heading) so they glide continuously.
export function useAircraftLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setAircraft = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("aircraft") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== AIRCRAFT_ID) {
      setAircraft(EMPTY);
      return;
    }

    interface Plane {
      lon: number;
      lat: number;
      v: number; // m/s
      hdg: number; // deg
      alt: number;
      callsign: string;
      t0: number; // performance.now() of last server fix
    }
    let planes: Plane[] = [];
    let cancelled = false;
    let debounce = 0;
    let lastPoll = 0; // throttle requests (fair-use)

    // Extrapolate positions from the last fix and push to the map.
    function render() {
      const now = performance.now();
      const features: GeoJSON.Feature[] = planes.map((p) => {
        const dt = (now - p.t0) / 1000;
        const dist = p.v * dt; // meters travelled since the fix
        const rad = (p.hdg * Math.PI) / 180;
        const dLat = (dist * Math.cos(rad)) / 111320;
        const dLon =
          (dist * Math.sin(rad)) / (111320 * Math.cos((p.lat * Math.PI) / 180));
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon + dLon, p.lat + dLat] },
          properties: {
            callsign: p.callsign,
            heading: Math.round(p.hdg),
            alt: Math.round(p.alt),
            speed: Math.round(p.v * 3.6), // m/s → km/h
          },
        };
      });
      setAircraft({ type: "FeatureCollection", features });
    }

    async function poll() {
      const m = mapRef.current;
      if (!m) return;
      const t = Date.now();
      if (t - lastPoll < 4000) return; // at most ~1 request / 4s
      lastPoll = t;
      try {
        const b = m.getBounds();
        if (!b) return;
        const url =
          `/aircraft?lamin=${b.getSouth().toFixed(3)}` +
          `&lomin=${b.getWest().toFixed(3)}&lamax=${b.getNorth().toFixed(3)}` +
          `&lomax=${b.getEast().toFixed(3)}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          aircraft?: Array<{
            lon: number;
            lat: number;
            v: number;
            hdg: number;
            alt: number;
            callsign: string;
          }>;
        };
        // Keep the current planes on a malformed/rate-limited response (don't blank).
        if (!Array.isArray(data.aircraft)) return;
        const now = performance.now();
        planes = data.aircraft.map((a) => ({
          lon: a.lon,
          lat: a.lat,
          v: a.v,
          hdg: a.hdg,
          alt: a.alt,
          callsign: a.callsign,
          t0: now,
        }));
        render();
      } catch {
        /* ignore network errors */
      }
    }

    poll();
    const pollTimer = window.setInterval(poll, 12000);
    const moveTimer = window.setInterval(render, 200); // smooth interpolation
    const onMove = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(poll, 1200);
    };
    map.on("moveend", onMove);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearInterval(moveTimer);
      window.clearTimeout(debounce);
      map.off("moveend", onMove);
      setAircraft(EMPTY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);
}
