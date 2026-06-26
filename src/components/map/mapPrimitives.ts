import type { Map as MbMap } from "mapbox-gl";
import { installBaseLayerRegistry } from "./layerRegistry";
import type { Feature } from "../../types";

// Turn a list of features into a GeoJSON collection for Mapbox.
// The layer color travels in properties so each point keeps its own color.
export function toGeoJSON(
  items: { feature: Feature; color: string; icon?: string }[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map(({ feature, color, icon }) => {
      const p = feature.properties;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: feature.lngLat },
        properties: {
          id: feature.id,
          kind: feature.kind,
          title: feature.title,
          text: typeof p.text === "string" ? p.text : "",
          // Text styling (data-driven on the text-labels layer); colour can be
          // overridden per-text, otherwise falls back to the layer colour.
          color: typeof p.color === "string" ? p.color : color,
          size: typeof p.size === "number" ? p.size : 16,
          rotation: typeof p.rotation === "number" ? p.rotation : 0,
          bold: p.bold === true,
          zoomScale: p.zoomScale === true,
          anchorZoom: typeof p.anchorZoom === "number" ? p.anchorZoom : 0,
          icon: icon ?? "",
        },
      };
    }),
  };
}

// Draw a marker glyph (shape or emoji) to a canvas image and register it with
// the map, so emoji render in full color (Mapbox SDF text can't show emoji).
// Shapes are tinted with `color`; emoji keep their own colors.
export function ensureMarkerImage(map: MbMap, glyph: string, color: string): string {
  const id = `m:${glyph}:${color}`;
  if (map.hasImage(id)) return id;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${Math.round(size * 0.74)}px "Apple Color Emoji", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // White edge for contrast (mostly visible on the tinted shapes).
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.strokeText(glyph, size / 2, size / 2);
  ctx.fillStyle = color;
  ctx.fillText(glyph, size / 2, size / 2);
  map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
  return id;
}

// (Re)add our sources and layers. Called on every style load, because
// setStyle() wipes all custom sources/layers when the basemap changes.
export function addBaseLayers(map: MbMap, dark: boolean) {
  if (map.getSource("markers")) return;
  installBaseLayerRegistry(map, dark);
}
