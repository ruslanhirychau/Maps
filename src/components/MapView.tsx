import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { EMPTY, displayedWorkspaces } from "./map/shared";
import { useIssLayer } from "./map/useIssLayer";
import { useAircraftLayer } from "./map/useAircraftLayer";
import { useShipsLayer } from "./map/useShipsLayer";
import { useLightningLayer } from "./map/useLightningLayer";
import { useMeteoritesLayer } from "./map/useMeteoritesLayer";
import { useFiresLayer } from "./map/useFiresLayer";
import { useCablesLayer } from "./map/useCablesLayer";
import { useCovidLayer } from "./map/useCovidLayer";
import { useNuclearLayer } from "./map/useNuclearLayer";
import { useCrashesLayer } from "./map/useCrashesLayer";
import { useWrecksLayer } from "./map/useWrecksLayer";
import { useTectonicsLayer } from "./map/useTectonicsLayer";
import { useUnescoLayer } from "./map/useUnescoLayer";
import { useAirLayer } from "./map/useAirLayer";
import { useNukeTestsLayer } from "./map/useNukeTestsLayer";
import { useRainLayer } from "./map/useRainLayer";
import { RainTimeline } from "./map/RainTimeline";
import { useDrawShapes } from "./map/useDrawShapes";
import { DrawTools } from "./map/DrawTools";
import { UndoRedo } from "./map/UndoRedo";
import { CenterPin, MarkerForm, type MarkerDraft } from "./map/MarkerForm";
import { useDraftHistory } from "./map/useDraftHistory";
import { useStore, selectActiveWorkspace } from "../store";
import { styleUrl, isDarkStyle, DEFAULT_STYLE } from "../mapStyles";
import { markerGlyph } from "../markers";
import { loadView, saveView } from "../storage";
import {
  Type,
  Check,
  Bold,
  RotateCw,
  Trash2,
  X,
  ScanSearch,
} from "lucide-react";
import { MapStyleSwitcher } from "./MapStyleSwitcher";
import { MapCompass } from "./MapCompass";
import { FeaturePopup } from "./FeaturePopup";
import { RAIN_ID, type Feature } from "../types";

// In-progress inline text being typed directly on the map canvas. `id` set =
// editing an existing label; unset = creating a new one.
interface TextDraft {
  id?: string;
  lngLat: [number, number];
  text: string;
  size: number;
  rotation: number;
  color: string;
  bold: boolean;
  // When true the label scales with zoom (anchored at `anchorZoom`), so it's
  // tiny/invisible when zoomed out and only readable when you zoom back in.
  zoomScale: boolean;
  anchorZoom: number;
}

const TEXT_COLORS = ["#ffffff", "#ffd43b", "#ff6b6b", "#4dabf7", "#69db7c", "#212529"];

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Left padding (px) applied to the map when the sidebar overlays it, so the
// optical center / vanishing point sits in the visible area, not under the bar.
const SIDEBAR_PAD = 296; // sidebar width (280) + 8px gap on each side
const leftPad = (layout: string) => (layout === "sidebar" ? SIDEBAR_PAD : 0);

// Turn a list of features into a GeoJSON collection for Mapbox.
// The layer color travels in properties so each point keeps its own color.
function toGeoJSON(
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
function ensureMarkerImage(map: mapboxgl.Map, glyph: string, color: string): string {
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
function addBaseLayers(map: mapboxgl.Map, dark: boolean) {
  if (map.getSource("markers")) return;

  // Label colors adapt to the basemap: light text on dark maps, dark on light.
  const labelColor = dark ? "#e9ecef" : "#212529";
  const haloColor = dark ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.85)";

  // Markers source. Clustering disabled for now (see commented layers below).
  map.addSource("markers", {
    type: "geojson",
    data: EMPTY,
    // cluster: true,
    // clusterRadius: 50,
    // clusterMaxZoom: 14,
  });
  // Texts — separate, never clustered (on-map text labels).
  map.addSource("texts", { type: "geojson", data: EMPTY });

  // --- Clustering (disabled for now) ---
  // Re-enable cluster:true on the "markers" source above to bring these back.
  // map.addLayer({ id: "clusters", type: "circle", source: "markers",
  //   filter: ["has", "point_count"], paint: { ... } });
  // map.addLayer({ id: "cluster-count", type: "symbol", source: "markers",
  //   filter: ["has", "point_count"], layout: { ... } });

  // Marker icon (canvas image of the shape/emoji — supports colored emoji).
  map.addLayer({
    id: "markers",
    type: "symbol",
    source: "markers",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-size": 0.85,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  // Marker label (collides/hides automatically when crowded).
  map.addLayer({
    id: "marker-labels",
    type: "symbol",
    source: "markers",
    layout: {
      "text-field": ["get", "title"],
      "text-size": 11,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
    },
    paint: {
      "text-color": labelColor,
      "text-halo-color": haloColor,
      "text-halo-width": 1.2,
      "text-halo-blur": 0.5,
    },
  });
  // Live aircraft (OpenSky) — triangle rotated by heading, tinted by altitude.
  map.addSource("aircraft", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "aircraft",
    type: "symbol",
    source: "aircraft",
    layout: {
      "text-field": "▲",
      "text-size": 16,
      "text-rotate": ["get", "heading"],
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": [
        "interpolate",
        ["linear"],
        ["get", "alt"],
        0,
        "#fa5252",
        3000,
        "#fab005",
        8000,
        "#51cf66",
        12000,
        "#4dabf7",
      ],
      "text-halo-color": dark ? "rgba(0,0,0,0.5)" : "#fff",
      "text-halo-width": 1,
    },
  });

  // Live ships (AISStream) — arrow rotated by course over ground.
  map.addSource("ships", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ships",
    type: "symbol",
    source: "ships",
    layout: {
      "text-field": "▲",
      "text-size": 13,
      "text-rotate": ["get", "cog"],
      "text-rotation-alignment": "map",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#15aabf",
      "text-halo-color": dark ? "rgba(0,0,0,0.5)" : "#fff",
      "text-halo-width": 1,
    },
  });

  // Live lightning (Blitzortung) — a glowing circle per strike that grows + fades
  // (driven by the `age` 0→1 property set in the lightning hook).
  map.addSource("lightning", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "lightning",
    type: "circle",
    source: "lightning",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "age"], 0, 5, 1, 16],
      "circle-color": "#fffbe6",
      "circle-blur": 0.6,
      "circle-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.95, 1, 0],
      "circle-stroke-color": "#facc15",
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": ["interpolate", ["linear"], ["get", "age"], 0, 0.9, 1, 0],
    },
  });

  // Meteorite landings (NASA) — static scatter. Cyan = observed falls, amber =
  // found; bigger dots for heavier meteorites.
  map.addSource("meteorites", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "meteorites",
    type: "circle",
    source: "meteorites",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "m"], 0],
        0, 1.6,
        1000, 2.4,
        100000, 4,
        10000000, 7,
      ],
      "circle-color": ["case", ["==", ["get", "f"], 1], "#22d3ee", "#f59e0b"],
      "circle-opacity": 0.55,
      "circle-stroke-color": "#000",
      "circle-stroke-width": 0.3,
    },
  });

  // Submarine cables (TeleGeography) — undersea network as coloured lines, each
  // cable keeping its own colour from the dataset.
  map.addSource("cables", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "cables",
    type: "line",
    source: "cables",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#22d3ee"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 4, 1.5, 8, 3],
      "line-opacity": 0.8,
    },
  });

  // Live wildfires (NASA EONET) — glowing dots, warmer + bigger with fire size.
  map.addSource("fires", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "fires",
    type: "circle",
    source: "fires",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "acres"], 0],
        0, 4,
        1000, 6,
        50000, 10,
        500000, 16,
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "acres"], 0],
        0, "#fde047",
        5000, "#fb923c",
        100000, "#ef4444",
      ],
      "circle-blur": 0.5,
      "circle-opacity": 0.75,
    },
  });

  // COVID-19 totals by country — bubbles sized by total cases (radius ~√cases so
  // area tracks the count), tinted by case-fatality ratio (yellow → deep red).
  map.addSource("covid", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "covid",
    type: "circle",
    source: "covid",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["sqrt", ["coalesce", ["get", "cases"], 0]],
        0, 2,
        3000, 8, // ~9M cases
        9000, 24, // ~80M cases
        27000, 55, // ~730M (global) — never reached per-country
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "cfr"], 0],
        0, "#fde047",
        1.5, "#fb923c",
        4, "#dc2626",
      ],
      "circle-opacity": 0.6,
      "circle-stroke-color": "#7f1d1d",
      "circle-stroke-width": 0.6,
    },
  });

  // Nuclear power plants (Wikidata) — dots coloured by status (green = operating,
  // grey = shut down, amber = under construction, blue = planned, dim green =
  // unknown), sized by capacity (MW) where known.
  map.addSource("nuclear", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "nuclear",
    type: "circle",
    source: "nuclear",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["sqrt", ["coalesce", ["get", "mw"], 100]], // default ~size for unknown capacity
        0, 3,
        30, 6, // ~900 MW
        70, 11, // ~5 GW
        90, 16, // ~8 GW (largest)
      ],
      "circle-color": [
        "match",
        ["get", "status"],
        "operating", "#4ade80",
        "shutdown", "#9ca3af",
        "construction", "#fbbf24",
        "planned", "#60a5fa",
        /* unknown */ "#15803d",
      ],
      "circle-blur": 0.3,
      "circle-opacity": ["match", ["get", "status"], "planned", 0.5, 0.75],
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 0.6,
    },
  });

  // Aviation accidents (Wikidata) — red dots, bigger + brighter with the death
  // toll. Crashes with no recorded fatalities still show as a small dim dot.
  map.addSource("crashes", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "crashes",
    type: "circle",
    source: "crashes",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["sqrt", ["coalesce", ["get", "deaths"], 0]],
        0, 2.5,
        5, 5, // ~25 deaths
        12, 9, // ~150 deaths
        24, 16, // ~580 (deadliest)
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "deaths"], 0],
        0, "#fca5a5",
        50, "#ef4444",
        200, "#b91c1c",
        500, "#7f1d1d",
      ],
      "circle-blur": 0.35,
      "circle-opacity": 0.72,
      "circle-stroke-color": "#450a0a",
      "circle-stroke-width": 0.5,
    },
  });

  // Shipwrecks (Wikidata, notable wrecks with a Wikipedia article) — teal dots
  // marking historic wreck sites, growing on zoom.
  map.addSource("wrecks", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "wrecks",
    type: "circle",
    source: "wrecks",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 4, 3.5, 8, 6, 12, 9],
      "circle-color": "#2dd4bf",
      "circle-opacity": 0.75,
      "circle-stroke-color": "#042f2e",
      "circle-stroke-width": 0.4,
    },
  });

  // --- Tectonics ("Ring of Fire") workspace: plates + volcanoes + quakes ---
  // Plate boundaries (fraxen/PB2002) — amber lines, drawn under everything else.
  map.addSource("plates", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "plates",
    type: "line",
    source: "plates",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#f59e0b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 5, 1.8, 9, 3],
      "line-opacity": 0.55,
      "line-dasharray": [2, 1.5],
    },
  });
  // Holocene volcanoes (Smithsonian GVP) — orange triangles.
  map.addSource("volcanoes", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "volcanoes",
    type: "symbol",
    source: "volcanoes",
    layout: {
      "text-field": "▲",
      "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 6, 16],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#fb923c",
      "text-halo-color": dark ? "rgba(0,0,0,0.6)" : "#fff",
      "text-halo-width": 1.2,
    },
  });
  // Earthquakes, past 30 days (live USGS) — circles sized + tinted by magnitude.
  map.addSource("quakes", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "quakes",
    type: "circle",
    source: "quakes",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "mag"], 0],
        0, 1.5,
        3, 4,
        5, 9,
        7, 18,
      ],
      // Hollow rings: no fill, magnitude colour carried by the outline.
      "circle-color": "#000000",
      "circle-opacity": 0,
      "circle-stroke-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "mag"], 0],
        1, "#fde047",
        3, "#fb923c",
        5, "#ef4444",
        7, "#b91c1c",
      ],
      "circle-stroke-width": 1.3,
      "circle-stroke-opacity": 0.85,
    },
  });

  // UNESCO World Heritage Sites (Wikidata) — dots coloured by category:
  // cultural = gold, natural = green, mixed = purple.
  map.addSource("unesco", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "unesco",
    type: "circle",
    source: "unesco",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.2, 4, 3.4, 8, 6, 12, 9],
      "circle-color": [
        "match",
        ["get", "cat"],
        "natural", "#22c55e",
        "mixed", "#a855f7",
        /* cultural */ "#eab308",
      ],
      "circle-opacity": 0.8,
      "circle-stroke-color": "#1c1917",
      "circle-stroke-width": 0.4,
    },
  });

  // Air quality by city (Open-Meteo) — bubbles tinted by the European AQI band
  // (green = good → purple = extremely poor), sized by PM2.5 concentration.
  map.addSource("air", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "air",
    type: "circle",
    source: "air",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["sqrt", ["coalesce", ["get", "pm25"], 0]],
        0, 5,
        5, 8, // ~25 µg/m³
        10, 13, // ~100 µg/m³
        16, 20, // ~250 µg/m³
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "aqi"], 0],
        0, "#22c55e",
        20, "#a3e635",
        40, "#facc15",
        60, "#fb923c",
        80, "#ef4444",
        100, "#7e22ce",
      ],
      "circle-blur": 0.3,
      "circle-opacity": 0.65,
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 0.5,
    },
  });

  // Nuclear weapon tests 1945–1998 (SIPRI) — coloured by testing country,
  // sized by yield (kt). The five declared powers plus India & Pakistan.
  map.addSource("nuketests", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "nuketests",
    type: "circle",
    source: "nuketests",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "kt"], 0],
        0, 2.5,
        20, 5,
        1000, 11,
        50000, 22,
      ],
      "circle-color": [
        "match",
        ["get", "country"],
        "USA", "#3b82f6",
        "USSR", "#ef4444",
        "FRANCE", "#a855f7",
        "UK", "#22c55e",
        "CHINA", "#eab308",
        "INDIA", "#f97316",
        "PAKIST", "#14b8a6",
        /* other */ "#9ca3af",
      ],
      "circle-blur": 0.25,
      "circle-opacity": 0.6,
      "circle-stroke-color": "#1c1917",
      "circle-stroke-width": 0.4,
    },
  });

  // ISS orbit ring — a great circle drawn as elevated dots (line-z-offset isn't
  // supported on globe, but symbol-z-offset is), so it floats at orbit altitude.
  map.addSource("iss-orbit", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "iss-orbit",
    type: "symbol",
    source: "iss-orbit",
    layout: {
      "text-field": "●",
      "text-size": 9,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "symbol-z-elevate": true,
    },
    paint: {
      "text-color": "#f783ac",
      "text-opacity": 0.5,
      "symbol-z-offset": ["coalesce", ["get", "zoff"], 0],
    },
  });

  // Live ISS position (wheretheiss.at) — a single satellite emoji marker.
  map.addSource("iss", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "iss",
    type: "symbol",
    source: "iss",
    layout: {
      "text-field": ["format", "🛰️", {}, "\n", {}, "ISS", { "font-scale": 0.5 }],
      "text-size": 26,
      "text-line-height": 1.1,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      // Lift the symbol off the surface by symbol-z-offset meters (real altitude).
      "symbol-z-elevate": true,
    },
    paint: {
      "text-color": "#f783ac",
      "text-halo-color": dark ? "rgba(0,0,0,0.6)" : "#fff",
      "text-halo-width": 1.5,
      "symbol-z-offset": ["coalesce", ["get", "zoff"], 0],
    },
  });

  // On-map text (no icon). When a label is pinned to zoom, the set size is the
  // MAXIMUM: it stays constant for zoom ≥ anchorZoom and shrinks below it —
  // base · min(1, 2^(zoom − anchorZoom)). Mapbox forbids nesting zoom inside
  // `min`, so we bake the cap into the outputs of a top-level zoom interpolate
  // (one stop per integer zoom).
  const baseSize = ["coalesce", ["get", "size"], 16];
  const MIN_VISIBLE = 6; // hide a zoom-pinned label once it shrinks below this (px)
  const effSizeAt = (z: number) => [
    "min",
    baseSize,
    ["*", baseSize, ["^", 2, ["-", z, ["coalesce", ["get", "anchorZoom"], 0]]]],
  ];
  const sizeStops: unknown[] = [];
  const opacityStops: unknown[] = [];
  for (let z = 0; z <= 22; z++) {
    sizeStops.push(z, [
      "case",
      ["==", ["get", "zoomScale"], true],
      effSizeAt(z),
      baseSize,
    ]);
    // Fade the label out once it becomes too small to read; always show others.
    opacityStops.push(z, [
      "case",
      ["==", ["get", "zoomScale"], true],
      ["case", [">=", effSizeAt(z), MIN_VISIBLE], 1, 0],
      1,
    ]);
  }
  map.addLayer({
    id: "text-labels",
    type: "symbol",
    source: "texts",
    layout: {
      "text-field": ["get", "title"],
      "text-size": ["interpolate", ["linear"], ["zoom"], ...sizeStops] as never,
      "text-rotate": ["coalesce", ["get", "rotation"], 0],
      "text-rotation-alignment": "map",
      "text-font": [
        "case",
        ["get", "bold"],
        ["literal", ["DIN Pro Bold", "Arial Unicode MS Bold"]],
        ["literal", ["DIN Pro Medium", "Arial Unicode MS Regular"]],
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": ["get", "color"],
      "text-opacity": ["interpolate", ["linear"], ["zoom"], ...opacityStops] as never,
      "text-halo-color": haloColor,
      "text-halo-width": 1.5,
    },
  });
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);

  // Marker draft: a pin pinned to screen-center + a bottom form (note/icon/colour).
  // Each draft carries its own local undo/redo (steps within editing this item).
  const markerH = useDraftHistory<MarkerDraft>();
  const markerDraft = markerH.value;
  const markerDraftRef = useRef(false);
  markerDraftRef.current = markerDraft !== null;
  // Inline on-canvas text editor (create or edit a label by typing on the map).
  const textH = useDraftHistory<TextDraft>();
  const textDraft = textH.value;
  const editingTextRef = useRef(false);
  editingTextRef.current = textDraft !== null;
  // Lets the map click handler open the inline editor for an existing label.
  const openTextEditRef = useRef<(d: TextDraft) => void>(() => {});
  openTextEditRef.current = (d: TextDraft) => {
    setSelected(null);
    textH.open(d);
  };
  // Keyboard undo/redo targets whichever editor is currently open (text/marker).
  const editorKeysRef = useRef<{ undo: () => void; redo: () => void; has: boolean }>({
    undo: () => {},
    redo: () => {},
    has: false,
  });
  editorKeysRef.current = textH.value
    ? { undo: textH.undo, redo: textH.redo, has: true }
    : markerH.value
      ? { undo: markerH.undo, redo: markerH.redo, has: true }
      : { undo: () => {}, redo: () => {}, has: false };
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  // Mapbox Draw (line/polygon drawing + vertex editing).
  // Shared with the draw hook (modechange) and the click handlers.
  const drawingRef = useRef(false); // true while a draw/edit mode is active
  const [styleVersion, setStyleVersion] = useState(0); // bumps on each style.load

  // Selected feature: where the detail popup is shown.
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const setSelectedRef = useRef(setSelected);
  setSelectedRef.current = setSelected;
  // Style currently applied to the map, to avoid redundant setStyle calls.
  const styleRef = useRef<string>("");

  const workspace = useStore(selectActiveWorkspace);
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const addFeature = useStore((s) => s.addFeature);
  const updateFeature = useStore((s) => s.updateFeature);
  const removeFeature = useStore((s) => s.removeFeature);
  const upsertShape = useStore((s) => s.upsertShape);

  // Commit the marker draft at the current map center with its note/icon/colour.
  function commitMarker() {
    if (!markerDraft) return;
    const m = mapRef.current;
    if (m) {
      const c = m.getCenter();
      addFeature([c.lng, c.lat], "marker", markerDraft.title.trim(), {
        color: markerDraft.color,
        icon: markerDraft.icon,
      });
    }
    markerH.close();
  }
  const focus = useStore((s) => s.focus);
  const fitNonce = useStore((s) => s.fitNonce);
  const layout = useStore((s) => s.layout);

  const desiredStyle = styleUrl(workspace ? workspace.style : DEFAULT_STYLE);

  // Keep current values in refs so handlers attached once stay up to date.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // Mapbox Draw (line/polygon creation + vertex editing).
  const { drawMode, hasSelection, startLine, startPolygon, deleteSelected, stopDrawing } =
    useDrawShapes(
    map,
    activeWorkspaceId,
    styleVersion,
    loadedRef,
    drawingRef,
    upsertShape,
    removeFeature,
  );

  // Rebuild both sources. In "Everything" the features of ALL workspaces are
  // aggregated; otherwise just the active workspace's.
  function refreshData() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const markers: { feature: Feature; color: string; icon: string }[] = [];
    const texts: { feature: Feature; color: string }[] = [];
    displayedWorkspaces().forEach((ws) => {
      const glyph = markerGlyph(ws.marker);
      ws.layers.forEach((lyr) => {
        if (!lyr.visible) return;
        lyr.features.forEach((feature) => {
          if (feature.kind === "text") {
            texts.push({ feature, color: lyr.color });
          } else if (feature.kind === "marker") {
            // Per-marker icon/colour override the workspace defaults if set.
            const p = feature.properties;
            const mGlyph = typeof p.icon === "string" && p.icon ? markerGlyph(p.icon) : glyph;
            const mColor = typeof p.color === "string" && p.color ? p.color : lyr.color;
            const icon = ensureMarkerImage(map, mGlyph, mColor);
            markers.push({ feature, color: mColor, icon });
          }
          // line/polygon are rendered/edited by Mapbox Draw, not these sources.
        });
      });
    });
    (map.getSource("markers") as mapboxgl.GeoJSONSource | undefined)?.setData(
      toGeoJSON(markers),
    );
    (map.getSource("texts") as mapboxgl.GeoJSONSource | undefined)?.setData(
      toGeoJSON(texts),
    );
  }

  // Initialize the map — once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    styleRef.current = desiredStyle;
    // Restore the last camera position/zoom remembered across reloads.
    const view = loadView();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: desiredStyle,
      center: view.center,
      zoom: view.zoom,
    });
    mapRef.current = map;
    setMap(map); // expose to the custom compass

    // Offset the optical center for the overlaid sidebar, then re-anchor the
    // saved center so it stays put (no drift across reloads).
    map.once("load", () => {
      map.setPadding({ top: 0, right: 0, bottom: 0, left: leftPad(layout) });
      map.setCenter(view.center);
    });

    // Remember camera position/zoom after every move (pan, zoom, fly).
    map.on("moveend", () => {
      const c = map.getCenter();
      saveView({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });

    // Runs on the first style load AND after every setStyle (basemap/theme change).
    map.on("style.load", () => {
      addBaseLayers(map, isDarkStyle(workspaceRef.current?.style ?? DEFAULT_STYLE));
      loadedRef.current = true;
      refreshData();
      setStyleVersion((v) => v + 1); // re-apply overlays (rain) after the layer exists
    });

    // Click: select a feature (or open the editor for a text label).
    map.on("click", (e) => {
      if (markerDraftRef.current) return; // pin is centered; clicks do nothing
      if (editingTextRef.current || drawingRef.current) return; // ignore while editing/drawing
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["markers", "marker-labels", "text-labels"],
      });
      const hit = hits[0];
      const id = hit?.properties?.id as string | undefined;
      // Clicking a text label opens the inline editor (re-type + restyle);
      // anything else opens the regular feature popup.
      if (hit && hit.properties?.kind === "text") {
        const p = hit.properties;
        const coords = (hit.geometry as GeoJSON.Point).coordinates as [number, number];
        openTextEditRef.current({
          id: id,
          lngLat: coords,
          text: typeof p.title === "string" ? p.title : "",
          size: typeof p.size === "number" ? p.size : 16,
          rotation: typeof p.rotation === "number" ? p.rotation : 0,
          color: typeof p.color === "string" ? p.color : "#ffffff",
          bold: p.bold === true || p.bold === "true",
          zoomScale: p.zoomScale === true || p.zoomScale === "true",
          anchorZoom: typeof p.anchorZoom === "number" ? p.anchorZoom : map.getZoom(),
        });
        return;
      }
      setSelectedRef.current(id ? { id, x: e.point.x, y: e.point.y } : null);
    });

    // Pointer cursor when hovering a feature.
    ["markers", "marker-labels", "text-labels"].forEach((id) => {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    });

    // Hover tooltip for live aircraft.
    const planePopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "plane-popup",
    });
    map.on("mousemove", "aircraft", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        callsign: string;
        alt: number;
        speed: number;
        heading: number;
      };
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div class="pp-call">✈ ${p.callsign || "—"}</div>` +
            `<div class="pp-row">Alt&nbsp;${p.alt.toLocaleString()} m</div>` +
            `<div class="pp-row">Speed&nbsp;${p.speed} km/h</div>` +
            `<div class="pp-row">Heading&nbsp;${p.heading}°</div>`,
        )
        .addTo(map);
    });
    map.on("mouseleave", "aircraft", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for live ships.
    map.on("mousemove", "ships", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { name: string; sog: number; cog: number };
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div class="pp-call">🚢 ${p.name || "—"}</div>` +
            `<div class="pp-row">Speed&nbsp;${p.sog} kn</div>` +
            `<div class="pp-row">Course&nbsp;${Math.round(p.cog)}°</div>`,
        )
        .addTo(map);
    });
    map.on("mouseleave", "ships", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for meteorite landings (name, year, mass, fall type).
    const fmtMass = (m: number) =>
      m < 1000
        ? `${Math.round(m)} g`
        : m < 1e6
          ? `${(m / 1000).toFixed(1)} kg`
          : `${(m / 1e6).toFixed(1)} t`;
    map.on("mousemove", "meteorites", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { n?: string; m?: number; y?: number; f?: number };
      const rows = [
        p.y ? `<div class="pp-row">Year&nbsp;${p.y}</div>` : "",
        typeof p.m === "number" ? `<div class="pp-row">Mass&nbsp;${fmtMass(p.m)}</div>` : "",
        `<div class="pp-row">${p.f === 1 ? "Observed fall" : "Found"}</div>`,
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">☄ ${p.n || "—"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "meteorites", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for active wildfires (name, size, last detection date).
    map.on("mousemove", "fires", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { title?: string; acres?: number; date?: string };
      const rows = [
        typeof p.acres === "number"
          ? `<div class="pp-row">Area&nbsp;${Math.round(p.acres).toLocaleString()} acres</div>`
          : "",
        p.date
          ? `<div class="pp-row">${new Date(p.date).toLocaleDateString()}</div>`
          : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">🔥 ${p.title || "Wildfire"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "fires", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for submarine cables (cable name at the cursor).
    map.on("mousemove", "cables", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { name?: string };
      planePopup
        .setLngLat(e.lngLat)
        .setHTML(`<div class="pp-call">🌐 ${p.name || "Cable"}</div>`)
        .addTo(map);
    });
    map.on("mouseleave", "cables", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for COVID-19 country totals (cases / deaths / recovered / CFR).
    const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US");
    map.on("mousemove", "covid", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        country?: string;
        cases?: number;
        deaths?: number;
        recovered?: number;
        cfr?: number;
      };
      const rows = [
        `<div class="pp-row">Cases&nbsp;${fmtNum(p.cases ?? 0)}</div>`,
        `<div class="pp-row">Deaths&nbsp;${fmtNum(p.deaths ?? 0)}</div>`,
        (p.recovered ?? 0) > 0
          ? `<div class="pp-row">Recovered&nbsp;${fmtNum(p.recovered ?? 0)}</div>`
          : "",
        typeof p.cfr === "number" ? `<div class="pp-row">Fatality&nbsp;${p.cfr}%</div>` : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">🦠 ${p.country || "—"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "covid", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for nuclear power plants (capacity, year, country, owner).
    map.on("mousemove", "nuclear", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        name?: string;
        country?: string;
        mw?: number;
        status?: string;
      };
      const STATUS_LABEL: Record<string, string> = {
        operating: "Operating",
        shutdown: "Shut down",
        construction: "Under construction",
        planned: "Planned",
        unknown: "Status unknown",
      };
      const rows = [
        p.status
          ? `<div class="pp-row">${STATUS_LABEL[p.status] ?? p.status}</div>`
          : "",
        typeof p.mw === "number"
          ? `<div class="pp-row">Capacity&nbsp;${p.mw.toLocaleString("en-US")} MW</div>`
          : "",
        p.country ? `<div class="pp-row">${p.country}</div>` : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">☢ ${p.name || "Nuclear plant"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "nuclear", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for aviation accidents (operator, year, fatalities).
    map.on("mousemove", "crashes", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        name?: string;
        op?: string;
        deaths?: number;
        year?: number;
      };
      const meta = [p.op, p.year].filter(Boolean).join(" · ");
      const rows = [
        meta ? `<div class="pp-row">${meta}</div>` : "",
        typeof p.deaths === "number"
          ? `<div class="pp-row">Fatalities&nbsp;${p.deaths.toLocaleString("en-US")}</div>`
          : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">🛩 ${p.name || "Aviation accident"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "crashes", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for shipwrecks (vessel type, country).
    map.on("mousemove", "wrecks", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        name?: string;
        type?: string;
        country?: string;
        deaths?: number;
      };
      const meta = [p.type, p.country].filter(Boolean).join(" · ");
      const rows = [
        meta ? `<div class="pp-row">${meta}</div>` : "",
        typeof p.deaths === "number"
          ? `<div class="pp-row">Fatalities&nbsp;${p.deaths.toLocaleString("en-US")}</div>`
          : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">⚓ ${p.name || "Shipwreck"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "wrecks", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for UNESCO sites (category, country).
    const UNESCO_CAT: Record<string, string> = {
      cultural: "Cultural",
      natural: "Natural",
      mixed: "Mixed",
    };
    map.on("mousemove", "unesco", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { name?: string; country?: string; cat?: string };
      const meta = [p.cat ? UNESCO_CAT[p.cat] ?? p.cat : "", p.country]
        .filter(Boolean)
        .join(" · ");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(
          `<div class="pp-call">🏛 ${p.name || "World Heritage Site"}</div>` +
            (meta ? `<div class="pp-row">${meta}</div>` : ""),
        )
        .addTo(map);
    });
    map.on("mouseleave", "unesco", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for air quality (PM2.5 + European AQI band).
    const aqiBand = (a: number) =>
      a <= 20
        ? "Good"
        : a <= 40
          ? "Fair"
          : a <= 60
            ? "Moderate"
            : a <= 80
              ? "Poor"
              : a <= 100
                ? "Very poor"
                : "Extremely poor";
    map.on("mousemove", "air", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        name?: string;
        country?: string;
        aqi?: number;
        pm25?: number;
      };
      const rows = [
        typeof p.aqi === "number"
          ? `<div class="pp-row">AQI&nbsp;${Math.round(p.aqi)} · ${aqiBand(p.aqi)}</div>`
          : "",
        typeof p.pm25 === "number"
          ? `<div class="pp-row">PM2.5&nbsp;${p.pm25.toFixed(1)} µg/m³</div>`
          : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">🌫 ${p.name || "—"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "air", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for nuclear tests (country, year, yield, deployment type).
    const NUKE_COUNTRY: Record<string, string> = {
      USA: "United States",
      USSR: "Soviet Union",
      FRANCE: "France",
      UK: "United Kingdom",
      CHINA: "China",
      INDIA: "India",
      PAKIST: "Pakistan",
    };
    const fmtKt = (kt: number) =>
      kt >= 1000 ? `${(kt / 1000).toLocaleString("en-US")} Mt` : `${kt} kt`;
    map.on("mousemove", "nuketests", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        name?: string;
        country?: string;
        year?: number;
        kt?: number;
        type?: string;
      };
      const head = [p.country ? NUKE_COUNTRY[p.country] ?? p.country : "", p.year]
        .filter(Boolean)
        .join(" · ");
      const rows = [
        head ? `<div class="pp-row">${head}</div>` : "",
        typeof p.kt === "number" ? `<div class="pp-row">Yield&nbsp;${fmtKt(p.kt)}</div>` : "",
        p.type ? `<div class="pp-row">${p.type}</div>` : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">☢ ${p.name || "Nuclear test"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "nuketests", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for earthquakes (magnitude, place, date).
    map.on("mousemove", "quakes", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { mag?: number; place?: string; time?: number };
      const rows = [
        p.place ? `<div class="pp-row">${p.place}</div>` : "",
        p.time ? `<div class="pp-row">${new Date(p.time).toLocaleString()}</div>` : "",
      ].join("");
      const mag = typeof p.mag === "number" ? p.mag.toFixed(1) : "—";
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">🌐 M ${mag}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "quakes", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for volcanoes (type, last eruption, country, elevation).
    const fmtErupt = (y: number) =>
      y < 0 ? `${-y} BCE` : y === 0 ? "—" : `${y} CE`;
    map.on("mousemove", "volcanoes", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as {
        name?: string;
        type?: string;
        last?: number;
        country?: string;
        elev?: number;
      };
      const rows = [
        [p.type, p.country].filter(Boolean).length
          ? `<div class="pp-row">${[p.type, p.country].filter(Boolean).join(" · ")}</div>`
          : "",
        typeof p.last === "number"
          ? `<div class="pp-row">Last eruption&nbsp;${fmtErupt(p.last)}</div>`
          : "",
        typeof p.elev === "number"
          ? `<div class="pp-row">Elevation&nbsp;${p.elev.toLocaleString("en-US")} m</div>`
          : "",
      ].join("");
      planePopup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<div class="pp-call">🌋 ${p.name || "Volcano"}</div>${rows}`)
        .addTo(map);
    });
    map.on("mouseleave", "volcanoes", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Hover tooltip for plate boundaries (boundary name).
    map.on("mousemove", "plates", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      const p = f.properties as { name?: string };
      planePopup
        .setLngLat(e.lngLat)
        .setHTML(`<div class="pp-call">🗺 ${p.name || "Plate boundary"}</div>`)
        .addTo(map);
    });
    map.on("mouseleave", "plates", () => {
      map.getCanvas().style.cursor = "";
      planePopup.remove();
    });

    // Close the feature popup when the user pans/zooms the map.
    const dismiss = () => {
      setSelectedRef.current(null);
    };
    map.on("dragstart", dismiss);
    map.on("zoomstart", dismiss);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap/theme when the active workspace's style changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === desiredStyle) return;
    styleRef.current = desiredStyle;
    loadedRef.current = false; // until style.load re-adds our layers
    map.setStyle(desiredStyle);
  }, [desiredStyle]);

  // Refresh source data on any data change or active switch (covers "Everything",
  // where the active workspace object doesn't change as features are added).
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, activeWorkspaceId]);

  // Frame all visible points currently displayed (active workspace, or all).
  function fitActive() {
    const map = mapRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    displayedWorkspaces().forEach((ws) =>
      ws.layers.forEach((lyr) => {
        if (!lyr.visible) return;
        lyr.features.forEach((f) => points.push(f.lngLat));
      }),
    );
    if (points.length === 0) return;
    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new mapboxgl.LngLatBounds(points[0], points[0]),
    );
    const pad = leftPad(useStore.getState().layout);
    // Inset by the sidebar on the left so points aren't framed under it.
    // Cap zoom so a single point (or tight cluster) doesn't zoom to the max.
    map.fitBounds(bounds, {
      padding: { top: 60, right: 60, bottom: 60, left: 60 + pad },
      maxZoom: 14,
      duration: 800,
    });
  }

  // Fit when the workspace actually CHANGES — not on the initial mount (so the
  // restored camera survives) and not on StrictMode's double-invoke.
  const prevWsIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevWsIdRef.current === null || prevWsIdRef.current === activeWorkspaceId) {
      prevWsIdRef.current = activeWorkspaceId;
      return;
    }
    prevWsIdRef.current = activeWorkspaceId;
    fitActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  // Fit on explicit request (e.g. clicking the already-active workspace).
  // Compare the previous nonce (not a one-shot flag) so StrictMode's double
  // invoke on mount can't fire an unwanted fit that overwrites the saved camera.
  const prevFitNonceRef = useRef(fitNonce);
  useEffect(() => {
    if (prevFitNonceRef.current === fitNonce) return;
    prevFitNonceRef.current = fitNonce;
    fitActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // On layout change: animate the map padding so the optical center follows
  // the sidebar appearing/disappearing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      padding: { top: 0, right: 0, bottom: 0, left: leftPad(layout) },
      duration: 300,
    });
  }, [layout]);

  // Live aircraft + ships + lightning (extracted hooks).
  useAircraftLayer(mapRef, activeWorkspaceId);
  useShipsLayer(mapRef, activeWorkspaceId);
  useLightningLayer(mapRef, activeWorkspaceId);
  useMeteoritesLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useFiresLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCablesLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCovidLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useNuclearLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCrashesLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useWrecksLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useTectonicsLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useUnescoLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useAirLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useNukeTestsLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);

  // Live ISS position + orbit ring (wheretheiss.at).
  useIssLayer(mapRef, activeWorkspaceId);

  // Weather radar layer + frames (RainViewer).
  const { frames: rainFrames, index: rainIndex, setIndex: setRainIndex } = useRainLayer(
    mapRef,
    activeWorkspaceId,
    styleVersion,
    loadedRef,
  );

  // Fly to a feature requested from the list (nonce re-triggers on repeat clicks).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: focus.lngLat, zoom: Math.max(map.getZoom(), 14), duration: 800 });
  }, [focus]);

  // Undo/redo (⌘/Ctrl+Z, ⇧ for redo) — only while an item editor is open, and
  // scoped to that editor's own history (no global document undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "z" && e.key !== "Z") || !(e.metaKey || e.ctrlKey)) return;
      if (!editorKeysRef.current.has) return;
      e.preventDefault();
      if (e.shiftKey) editorKeysRef.current.redo();
      else editorKeysRef.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While editing an existing label inline, hide its on-map copy (the overlay
  // input renders the live version in its place).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("text-labels")) return;
    const editId = textDraft?.id;
    m.setFilter("text-labels", editId ? ["!=", ["get", "id"], editId] : null);
  }, [textDraft, styleVersion]);

  // Commit the inline text draft: create, update, or delete (when emptied).
  function commitText() {
    if (!textDraft) return;
    const text = textDraft.text.trim();
    const props = {
      size: textDraft.size,
      rotation: textDraft.rotation,
      color: textDraft.color,
      bold: textDraft.bold,
      zoomScale: textDraft.zoomScale,
      anchorZoom: textDraft.anchorZoom,
    };
    if (!text) {
      if (textDraft.id) removeFeature(textDraft.id);
    } else if (textDraft.id) {
      updateFeature(textDraft.id, { title: text, properties: props });
    } else {
      // New label commits at the current map center (it was pinned there).
      const c = mapRef.current?.getCenter();
      const lngLat: [number, number] = c ? [c.lng, c.lat] : textDraft.lngLat;
      addFeature(lngLat, "text", text, props);
    }
    textH.close();
  }

  if (!TOKEN) {
    return (
      <div className="map-error">
        <div>
          <h2>No Mapbox token</h2>
          <p>
            Copy <code>.env.example</code> to <code>.env</code> and paste your
            <code> VITE_MAPBOX_TOKEN</code> (starts with <code>pk.</code>), then
            restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="map-wrap"
      style={{ ["--left-inset" as string]: `${leftPad(layout)}px` }}
    >
      <div ref={containerRef} className="map-container" />
      <MapCompass map={map} />
      <MapStyleSwitcher />
      {textDraft && map && (
        <TextEditor
          map={map}
          draft={textDraft}
          onChange={textH.change}
          onCommit={commitText}
          onCancel={() => textH.close()}
          onDelete={() => {
            if (textDraft.id) removeFeature(textDraft.id);
            textH.close();
          }}
        />
      )}
      {selected && (
        <FeaturePopup
          key={selected.id}
          featureId={selected.id}
          x={selected.x}
          y={selected.y}
          onClose={() => setSelected(null)}
        />
      )}
      {activeWorkspaceId === RAIN_ID && rainFrames.length > 0 && (
        <RainTimeline frames={rainFrames} index={rainIndex} onIndex={setRainIndex} />
      )}
      {markerDraft && map && (
        <>
          <CenterPin map={map} icon={markerDraft.icon} color={markerDraft.color} />
          <MarkerForm
            draft={markerDraft}
            onChange={markerH.change}
            onDone={commitMarker}
            onCancel={() => markerH.close()}
          />
        </>
      )}
      <DrawTools
        active={markerDraft ? "marker" : textDraft ? "text" : drawMode}
        canDelete={hasSelection}
        onMarker={() => {
          stopDrawing();
          textH.close();
          if (markerDraft) markerH.close();
          else
            markerH.open({
              title: "",
              color: workspaceRef.current?.layers?.[0]?.color ?? "#845ef7",
              icon: "pin",
            });
        }}
        onText={() => {
          stopDrawing();
          markerH.close();
          if (textDraft) {
            textH.close();
          } else {
            const c = mapRef.current?.getCenter();
            const isDark = document.documentElement.dataset.theme === "dark";
            textH.open({
              lngLat: c ? [c.lng, c.lat] : [0, 0],
              text: "",
              size: 16,
              rotation: 0,
              color: isDark ? "#ffffff" : "#212529",
              bold: false,
              zoomScale: false,
              anchorZoom: mapRef.current?.getZoom() ?? 0,
            });
          }
        }}
        onLine={() => {
          markerH.close();
          textH.close();
          startLine();
        }}
        onPolygon={() => {
          markerH.close();
          textH.close();
          startPolygon();
        }}
        onDelete={deleteSelected}
      />
      <UndoRedo
        editing={textDraft !== null || markerDraft !== null}
        canUndo={textDraft ? textH.canUndo : markerDraft ? markerH.canUndo : false}
        canRedo={textDraft ? textH.canRedo : markerDraft ? markerH.canRedo : false}
        onUndo={() => (textDraft ? textH.undo() : markerH.undo())}
        onRedo={() => (textDraft ? textH.redo() : markerH.redo())}
      />
    </div>
  );
}

// Inline text editor: an input anchored to a map point (so you type the label
// right where it will sit) plus a fixed toolbar for size / rotation / colour.
function TextEditor({
  map,
  draft,
  onChange,
  onCommit,
  onCancel,
  onDelete,
}: {
  map: mapboxgl.Map;
  draft: TextDraft;
  onChange: (patch: Partial<TextDraft>) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // A new label is pinned to the screen center (pan the map to position it); an
  // existing one stays anchored at its own point while you re-type/restyle.
  const isNew = draft.id === undefined;
  const anchor = () => (isNew ? map.getCenter() : draft.lngLat);
  const [pos, setPos] = useState(() => map.project(anchor()));

  // Keep the input glued to its anchor (screen center for new) as the map moves.
  useEffect(() => {
    const update = () => setPos(map.project(isNew ? map.getCenter() : draft.lngLat));
    update();
    map.on("move", update);
    return () => {
      map.off("move", update);
    };
  }, [map, isNew, draft.lngLat]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stops a control from stealing focus from the input on click.
  const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

  // Drag the rotation handle around the anchor — its angle sets the text rotation.
  function startRotate(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const container = map.getContainer();
    const bearing = map.getBearing();
    const move = (ev: globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const a = map.project(anchor());
      const dx = ev.clientX - rect.left - a.x;
      const dy = ev.clientY - rect.top - a.y;
      let r = (Math.atan2(-dx, dy) * 180) / Math.PI + bearing;
      r = (((r + 180) % 360) + 360) % 360 - 180; // normalize to [-180, 180)
      onChange({ rotation: Math.round(r) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Effective on-screen size (matches the map): when pinned to zoom the label
  // scales by 2^(zoom − anchorZoom) so the preview tracks what the map renders.
  const effSize = draft.zoomScale
    ? draft.size * Math.min(1, Math.pow(2, map.getZoom() - draft.anchorZoom))
    : draft.size;

  // Rotation handle sits on a radius below the text, orbiting as rotation changes.
  const visAngle = ((draft.rotation - map.getBearing()) * Math.PI) / 180;
  const radius = effSize / 2 + 30;
  const rotPos = {
    x: pos.x - radius * Math.sin(visAngle),
    y: pos.y + radius * Math.cos(visAngle),
  };

  return (
    <>
      <input
        ref={inputRef}
        className="map-text-input"
        value={draft.text}
        placeholder="Text…"
        onChange={(e) => onChange({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        style={{
          left: pos.x,
          top: pos.y,
          transform: `translate(-50%, -50%) rotate(${draft.rotation - map.getBearing()}deg)`,
          fontSize: Math.max(1, effSize),
          color: draft.color,
          fontWeight: draft.bold ? 700 : 500,
          width: `${Math.max(2, draft.text.length + 1)}ch`,
          caretColor: draft.color,
        }}
      />
      <div
        className="map-text-tether"
        style={{
          left: pos.x,
          top: pos.y,
          height: radius,
          transform: `translateX(-50%) rotate(${draft.rotation - map.getBearing()}deg)`,
        }}
      />
      <button
        className="map-text-rot"
        style={{ left: rotPos.x, top: rotPos.y }}
        onPointerDown={startRotate}
        onMouseDown={keepFocus}
        title="Rotate"
      >
        <RotateCw size={12} />
      </button>
      <div className="text-toolbar">
        <button
          className="tt-btn tt-circle"
          onMouseDown={keepFocus}
          onClick={onCancel}
          title="Cancel"
        >
          <X size={14} />
        </button>
        <span className="tt-group" title="Size">
          <Type size={14} />
          <input
            type="range"
            min={10}
            max={80}
            value={draft.size}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
          />
        </span>
        <button
          className={"tt-btn" + (draft.bold ? " active" : "")}
          onMouseDown={keepFocus}
          onClick={() => onChange({ bold: !draft.bold })}
          title="Bold"
        >
          <Bold size={14} />
        </button>
        <button
          className={"tt-btn" + (draft.zoomScale ? " active" : "")}
          onMouseDown={keepFocus}
          onClick={() =>
            onChange(
              draft.zoomScale
                ? { zoomScale: false }
                : { zoomScale: true, anchorZoom: map.getZoom() },
            )
          }
          title="Pin size to zoom (only visible when zoomed in)"
        >
          <ScanSearch size={14} />
        </button>
        <span className="tt-swatches">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              className={"tt-sw" + (c === draft.color ? " active" : "")}
              style={{ background: c }}
              onMouseDown={keepFocus}
              onClick={() => onChange({ color: c })}
            />
          ))}
        </span>
        {draft.id && (
          <button className="tt-btn" onMouseDown={keepFocus} onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
        <button
          className="tt-btn primary tt-circle"
          onMouseDown={keepFocus}
          onClick={onCommit}
          title="Done"
        >
          <Check size={14} />
        </button>
      </div>
    </>
  );
}
