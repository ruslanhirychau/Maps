import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource, LngLatBounds } from "mapbox-gl";
import { AIRCRAFT_ID } from "../../types";
import { EMPTY } from "./shared";

// Normalized plane fix shared by both data sources.
interface NormPlane {
  lon: number;
  lat: number;
  v: number; // m/s
  hdg: number; // deg
  alt: number; // m
  callsign: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Fetch a viewport's worth of planes. In dev we go through the /aircraft proxy
// (OpenSky with the owner's keys). The proxy doesn't exist on a static host, so
// in production we hit the keyless, CORS-enabled airplanes.live directly and
// normalize its readsb-style payload the same way the proxy does for adsb.lol.
async function fetchAircraft(b: LngLatBounds): Promise<NormPlane[] | null> {
  if (import.meta.env.DEV) {
    const url =
      `/aircraft?lamin=${b.getSouth().toFixed(3)}` +
      `&lomin=${b.getWest().toFixed(3)}&lamax=${b.getNorth().toFixed(3)}` +
      `&lomax=${b.getEast().toFixed(3)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { aircraft?: NormPlane[] };
    return Array.isArray(data.aircraft) ? data.aircraft : null;
  }

  const latc = (b.getSouth() + b.getNorth()) / 2;
  const lonc = (b.getWest() + b.getEast()) / 2;
  const distNm = Math.min(
    250,
    Math.max(20, Math.round(haversineKm(latc, lonc, b.getNorth(), b.getEast()) / 1.852)),
  );
  const res = await fetch(
    `https://api.airplanes.live/v2/point/${latc.toFixed(3)}/${lonc.toFixed(3)}/${distNm}`,
  );
  if (!res.ok) return null;
  const d = (await res.json()) as {
    ac?: Array<{
      lat?: number;
      lon?: number;
      gs?: number;
      track?: number;
      mag_heading?: number;
      alt_baro?: number | string;
      flight?: string;
      hex?: string;
    }>;
  };
  if (!Array.isArray(d.ac)) return null;
  return d.ac
    .filter((a) => typeof a.lat === "number" && typeof a.lon === "number" && a.alt_baro !== "ground")
    .map((a) => ({
      lon: a.lon as number,
      lat: a.lat as number,
      v: (a.gs ?? 0) * 0.514444, // knots → m/s
      hdg: a.track ?? a.mag_heading ?? 0,
      alt: (typeof a.alt_baro === "number" ? a.alt_baro : 0) * 0.3048, // ft → m
      callsign: (a.flight ?? a.hex ?? "").trim(),
    }));
}

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
        const fixes = await fetchAircraft(b);
        // Keep the current planes on a malformed/rate-limited response (don't blank).
        if (cancelled || !fixes) return;
        const now = performance.now();
        planes = fixes.map((a) => ({ ...a, t0: now }));
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
