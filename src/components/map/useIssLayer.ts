import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { ISS_ID } from "../../types";
import { EMPTY } from "./shared";

// How much to exaggerate the ISS orbital altitude so it reads as "floating" on
// the globe (real ~420 km is only ~6% of Earth's radius). 1 = realistic.
const ISS_ALT_EXAGGERATION = 1;

// Initial compass bearing (deg) from point 1 to point 2 — used to dead-reckon
// the ISS between polls so it glides instead of jumping.
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δλ = (lon2 - lon1) * toRad;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// Points along the great circle through (lat,lon) heading `bearing` — i.e. the
// instantaneous orbital plane of the ISS. Returned as elevated point features
// (each carries `zoff` meters) so they can float at the orbit altitude.
function orbitRing(
  lat: number,
  lon: number,
  bearing: number,
  zoff: number,
  steps = 220,
): GeoJSON.FeatureCollection {
  const toRad = Math.PI / 180;
  const φ1 = lat * toRad;
  const λ1 = lon * toRad;
  const θ = bearing * toRad;
  const features: GeoJSON.Feature[] = [];
  for (let i = 0; i <= steps; i++) {
    const δ = (2 * Math.PI * i) / steps; // angular distance along the circle
    const φ2 = Math.asin(
      Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
    );
    const λ2 =
      λ1 +
      Math.atan2(
        Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
        Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
      );
    let lonDeg = (λ2 / toRad) % 360;
    if (lonDeg > 180) lonDeg -= 360;
    if (lonDeg < -180) lonDeg += 360;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lonDeg, φ2 / toRad] },
      properties: { zoff },
    });
  }
  return { type: "FeatureCollection", features };
}

// Live ISS position + orbit ring (wheretheiss.at), only while the "Space Station"
// workspace is active. Polled every few seconds; dead-reckoned between polls for
// a smooth glide. Drives the "iss" / "iss-orbit" sources added by addBaseLayers.
export function useIssLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setIss = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("iss") as GeoJSONSource | undefined)?.setData(fc);
    const setOrbit = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("iss-orbit") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== ISS_ID) {
      setIss(EMPTY);
      setOrbit(EMPTY);
      return;
    }

    let lon = 0;
    let lat = 0;
    let bearing = 0;
    let speed = 0; // km/h
    let alt = 0; // km
    let t0 = 0; // performance.now() of last fix
    let fixed = false; // got at least one position
    let bearingKnown = false; // got two positions → can extrapolate
    let centered = false;
    let cancelled = false;

    function render() {
      if (!fixed) return;
      let plon = lon;
      let plat = lat;
      if (bearingKnown) {
        const dist = (speed / 3.6) * ((performance.now() - t0) / 1000); // m
        const rad = (bearing * Math.PI) / 180;
        plat = lat + (dist * Math.cos(rad)) / 111320;
        plon = lon + (dist * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
      }
      setIss({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [plon, plat] },
            properties: {
              alt: Math.round(alt),
              speed: Math.round(speed),
              zoff: alt * 1000 * ISS_ALT_EXAGGERATION, // meters above the surface
            },
          },
        ],
      });
    }

    async function poll() {
      try {
        const res = await fetch("https://api.wheretheiss.at/v1/satellites/25544");
        if (!res.ok || cancelled) return;
        const d = (await res.json()) as {
          latitude: number;
          longitude: number;
          altitude: number; // km
          velocity: number; // km/h
        };
        if (fixed) {
          bearing = bearingDeg(lat, lon, d.latitude, d.longitude);
          bearingKnown = true;
        }
        lon = d.longitude;
        lat = d.latitude;
        alt = d.altitude;
        speed = d.velocity;
        t0 = performance.now();
        fixed = true;
        if (bearingKnown) {
          setOrbit(orbitRing(lat, lon, bearing, alt * 1000 * ISS_ALT_EXAGGERATION));
        }
        if (!centered) {
          centered = true;
          mapRef.current?.flyTo({ center: [lon, lat], zoom: 3, duration: 1500 });
        }
        render();
      } catch {
        /* ignore network errors — keep the last position */
      }
    }

    poll();
    const pollTimer = window.setInterval(poll, 3000);
    const renderTimer = window.setInterval(render, 200);
    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearInterval(renderTimer);
      setIss(EMPTY);
      setOrbit(EMPTY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);
}
