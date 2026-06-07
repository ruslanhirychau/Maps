import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { LIGHTNING_ID } from "../../types";
import { EMPTY } from "./shared";

// LZW decode used by Blitzortung's live-map WebSocket feed.
function decode(s: string): string {
  const dict: Record<number, string> = {};
  const data = (s + "").split("");
  let currChar = data[0];
  let oldPhrase = currChar;
  const out = [currChar];
  let code = 256;
  for (let i = 1; i < data.length; i++) {
    const cc = data[i].charCodeAt(0);
    const phrase = cc < 256 ? data[i] : dict[cc] ? dict[cc] : oldPhrase + currChar;
    out.push(phrase);
    currChar = phrase.charAt(0);
    dict[code] = oldPhrase + currChar;
    code++;
    oldPhrase = phrase;
  }
  return out.join("");
}

const SERVERS = ["wss://ws1.blitzortung.org/", "wss://ws7.blitzortung.org/", "wss://ws8.blitzortung.org/"];
const LIFETIME = 1400; // ms a flash takes to grow + fade out
const MAX_STRIKES = 600;

interface Strike {
  lon: number;
  lat: number;
  t: number; // performance.now() when received
}

// Live global lightning strikes (Blitzortung), only while the Lightning
// workspace is active. Each strike flashes (grows + fades) over ~1.4s.
export function useLightningLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setData = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("lightning") as GeoJSONSource | undefined)?.setData(fc);

    if (activeWorkspaceId !== LIGHTNING_ID) {
      setData(EMPTY);
      return;
    }

    let strikes: Strike[] = [];
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnect = 0;
    let serverIdx = 0;

    function connect() {
      ws = new WebSocket(SERVERS[serverIdx % SERVERS.length]);
      ws.onopen = () => ws?.send(JSON.stringify({ a: 111 }));
      ws.onmessage = (e) => {
        try {
          const o = JSON.parse(decode(e.data as string)) as { lat?: number; lon?: number };
          if (typeof o.lat === "number" && typeof o.lon === "number") {
            strikes.push({ lon: o.lon, lat: o.lat, t: performance.now() });
            if (strikes.length > MAX_STRIKES) strikes = strikes.slice(-MAX_STRIKES);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (closed) return;
        serverIdx++; // try the next server on reconnect
        reconnect = window.setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    }

    // Push aged flashes to the map and drop ones that have fully faded.
    function render() {
      const now = performance.now();
      const features: GeoJSON.Feature[] = [];
      strikes = strikes.filter((s) => now - s.t < LIFETIME);
      for (const s of strikes) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          properties: { age: (now - s.t) / LIFETIME },
        });
      }
      setData({ type: "FeatureCollection", features });
    }

    connect();
    const renderTimer = window.setInterval(render, 70);
    return () => {
      closed = true;
      window.clearInterval(renderTimer);
      window.clearTimeout(reconnect);
      ws?.close();
      setData(EMPTY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);
}
