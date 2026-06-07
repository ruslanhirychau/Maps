import { useEffect, type RefObject } from "react";
import type { Map as MbMap, GeoJSONSource } from "mapbox-gl";
import { SHIPS_ID } from "../../types";
import { EMPTY } from "./shared";

// Live ships (AISStream WebSocket), only while "Live Ships" is active. The socket
// is (re)connected with the current viewport bbox; ships are pruned when stale.
export function useShipsLayer(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setShips = (fc: GeoJSON.FeatureCollection) =>
      (map.getSource("ships") as GeoJSONSource | undefined)?.setData(fc);

    const KEY = import.meta.env.VITE_AISSTREAM_KEY as string | undefined;
    if (activeWorkspaceId !== SHIPS_ID || !KEY) {
      setShips(EMPTY);
      return;
    }

    interface Ship {
      lon: number;
      lat: number;
      cog: number;
      sog: number;
      name: string;
      t: number; // last seen
    }
    const ships = new Map<number, Ship>();
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnect = 0;
    let moveDebounce = 0;
    const STALE = 90000; // drop ships not seen for 90s

    function render() {
      const cutoff = Date.now() - STALE;
      const features: GeoJSON.Feature[] = [];
      ships.forEach((s, mmsi) => {
        if (s.t < cutoff) {
          ships.delete(mmsi);
          return;
        }
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
          properties: { cog: s.cog, sog: Math.round(s.sog), name: s.name },
        });
      });
      setShips({ type: "FeatureCollection", features });
    }

    // Reconnect with the current viewport's bbox (AISStream applies the bbox on
    // connect; updating it on a live socket isn't reliable).
    function connect() {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      const b = mapRef.current?.getBounds();
      if (!b) return;
      const sub = JSON.stringify({
        APIKey: KEY,
        BoundingBoxes: [
          [
            [b.getNorth(), b.getWest()],
            [b.getSouth(), b.getEast()],
          ],
        ],
        FilterMessageTypes: ["PositionReport"],
      });
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      ws.onopen = () => ws?.send(sub);
      ws.onmessage = async (e) => {
        try {
          const text =
            typeof e.data === "string" ? e.data : await (e.data as Blob).text();
          const msg = JSON.parse(text);
          if (msg.MessageType !== "PositionReport") return;
          const pr = msg.Message.PositionReport;
          const meta = msg.MetaData;
          const lon = pr.Longitude ?? meta.longitude;
          const lat = pr.Latitude ?? meta.latitude;
          if (typeof lon !== "number" || typeof lat !== "number") return;
          ships.set(meta.MMSI, {
            lon,
            lat,
            cog: typeof pr.Cog === "number" && pr.Cog < 360 ? pr.Cog : 0,
            sog: typeof pr.Sog === "number" ? pr.Sog : 0,
            name: (meta.ShipName ?? "").trim() || String(meta.MMSI),
            t: Date.now(),
          });
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) reconnect = window.setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    }

    connect();
    const renderTimer = window.setInterval(render, 1000);
    const onMove = () => {
      window.clearTimeout(moveDebounce);
      moveDebounce = window.setTimeout(connect, 1200);
    };
    map.on("moveend", onMove);

    return () => {
      closed = true;
      window.clearInterval(renderTimer);
      window.clearTimeout(reconnect);
      window.clearTimeout(moveDebounce);
      map.off("moveend", onMove);
      ws?.close();
      setShips(EMPTY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);
}
