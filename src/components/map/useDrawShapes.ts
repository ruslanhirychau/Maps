import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MbMap, IControl } from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import type { Feature, FeatureKind } from "../../types";
import { displayedWorkspaces } from "./shared";

// Mapbox Draw styles recoloured to the brand accent (reads on light + dark).
const DRAW_BRAND = "#845ef7";
const DRAW_STYLES = [
  {
    id: "gl-draw-line",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": DRAW_BRAND,
      "line-width": 3,
      "line-dasharray": ["case", ["==", ["get", "active"], "true"], ["literal", [0.4, 2]], ["literal", [1, 0]]],
    },
  },
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    paint: {
      "fill-color": DRAW_BRAND,
      "fill-opacity": ["case", ["==", ["get", "active"], "true"], 0.2, 0.12],
    },
  },
  {
    id: "gl-draw-polygon-stroke",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": DRAW_BRAND, "line-width": 3 },
  },
  {
    id: "gl-draw-vertex-halo",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 6, "circle-color": "#fff" },
  },
  {
    id: "gl-draw-vertex",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 4, "circle-color": DRAW_BRAND },
  },
  {
    id: "gl-draw-midpoint",
    type: "circle",
    filter: ["all", ["==", "meta", "midpoint"], ["==", "$type", "Point"]],
    paint: { "circle-radius": 3, "circle-color": DRAW_BRAND },
  },
];

// Build a Draw FeatureCollection from a workspace's line/polygon features.
function shapesToDraw(features: Feature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => (f.kind === "line" || f.kind === "polygon") && f.geometry)
      .map((f) => ({
        type: "Feature",
        id: f.id,
        geometry: f.geometry as GeoJSON.Geometry,
        properties: {},
      })),
  };
}

// Mapbox Draw — line/polygon creation + vertex editing. Owns the Draw control,
// syncs edits back into the store, and loads the active view's shapes into Draw.
// `drawingRef` is shared with the map's click/long-press handlers so they back
// off while a draw/edit mode is active.
export function useDrawShapes(
  map: MbMap | null,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
  drawingRef: RefObject<boolean>,
  upsertShape: (id: string, kind: FeatureKind, geometry: GeoJSON.Geometry) => void,
  removeFeature: (id: string) => void,
) {
  const drawRef = useRef<MapboxDraw | null>(null);
  const [drawMode, setDrawMode] = useState<"line" | "polygon" | null>(null);
  // True whenever Draw is in any non-default mode (drawing or editing vertices).
  const [drawActive, setDrawActive] = useState(false);
  // True when a shape is currently selected (so it can be deleted).
  const [hasSelection, setHasSelection] = useState(false);
  const upsertRef = useRef(upsertShape);
  upsertRef.current = upsertShape;
  const removeRef = useRef(removeFeature);
  removeRef.current = removeFeature;

  // Create the Draw control once the map exists; wire edits back to the store.
  useEffect(() => {
    if (!map || drawRef.current) return;
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      styles: DRAW_STYLES as never,
    });
    drawRef.current = draw;
    map.addControl(draw as unknown as IControl);

    const dmap = map as unknown as {
      on: (t: string, cb: (e: { features: GeoJSON.Feature[]; mode?: string }) => void) => void;
    };
    const syncShape = (e: { features: GeoJSON.Feature[] }) => {
      for (const f of e.features) {
        const kind = f.geometry.type === "Polygon" ? "polygon" : "line";
        upsertRef.current(String(f.id), kind, f.geometry);
      }
    };
    dmap.on("draw.create", syncShape);
    dmap.on("draw.update", syncShape);
    dmap.on("draw.delete", (e) => {
      for (const f of e.features) removeRef.current(String(f.id));
    });
    dmap.on("draw.modechange", (e) => {
      const active = e.mode !== "simple_select";
      drawingRef.current = active;
      setDrawActive(active);
      if (!active) setDrawMode(null);
    });
    dmap.on("draw.selectionchange", (e) => {
      setHasSelection(e.features.length > 0);
    });
  }, [map, drawingRef]);

  // Load the current view's drawn shapes into Mapbox Draw. Runs on workspace and
  // style changes (not on every edit, so live drawing/editing isn't clobbered).
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !loadedRef.current) return;
    const shapes: Feature[] = [];
    displayedWorkspaces().forEach((ws) =>
      ws.layers.forEach((lyr) => {
        if (lyr.visible) shapes.push(...lyr.features);
      }),
    );
    try {
      draw.set(shapesToDraw(shapes));
    } catch {
      /* draw not ready yet — will retry on the next style load */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, styleVersion, map]);

  const startLine = () => {
    drawRef.current?.changeMode("draw_line_string");
    drawingRef.current = true;
    setDrawMode("line");
  };
  const startPolygon = () => {
    drawRef.current?.changeMode("draw_polygon");
    drawingRef.current = true;
    setDrawMode("polygon");
  };
  const deleteSelected = () => drawRef.current?.trash();
  const stopDrawing = () => drawRef.current?.changeMode("simple_select");

  return {
    drawMode,
    drawActive,
    hasSelection,
    startLine,
    startPolygon,
    deleteSelected,
    stopDrawing,
  };
}
