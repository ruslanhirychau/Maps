import type { Map as MbMap } from "mapbox-gl";
import {
  co2HoverPopups,
  createLayerHoverPopup,
  datasetHoverPopups,
  liveFeedHoverPopups,
  tectonicHoverPopups,
} from "./layerHoverPopups";
import { EMPTY } from "./shared";

interface LayerRegistryContext {
  map: MbMap;
  dark: boolean;
  labelColor: string;
  haloColor: string;
}

interface LayerRegistryEntry {
  id: string;
  install: (ctx: LayerRegistryContext) => void;
  attachHoverPopups?: (ctx: LayerRegistryContext) => void;
}

const userFeatureLayers: LayerRegistryEntry = {
  id: "user-feature-layers",
  install: ({ map, labelColor, haloColor }) => {
    // Unclustered markers source.
    map.addSource("markers", {
      type: "geojson",
      data: EMPTY,
    });
    // Clustered markers source. Layer-level clustering is implemented by routing
    // marker features into this source or the plain "markers" source.
    map.addSource("clustered-markers", {
      type: "geojson",
      data: EMPTY,
      cluster: true,
      clusterRadius: 52,
      clusterMaxZoom: 13,
    });
    // Texts — separate, never clustered (on-map text labels).
    map.addSource("texts", { type: "geojson", data: EMPTY });

    map.addLayer({
      id: "marker-clusters",
      type: "circle",
      source: "clustered-markers",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          "#f59e0b",
          20,
          "#e8590c",
          80,
          "#c92a2a",
        ],
        "circle-radius": [
          "step",
          ["get", "point_count"],
          16,
          20,
          22,
          80,
          30,
        ],
        "circle-opacity": 0.86,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "marker-cluster-count",
      type: "symbol",
      source: "clustered-markers",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 12,
        "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.25)",
        "text-halo-width": 1,
      },
    });

    map.addLayer({
      id: "clustered-markers",
      type: "symbol",
      source: "clustered-markers",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": 0.85,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });
    map.addLayer({
      id: "clustered-marker-labels",
      type: "symbol",
      source: "clustered-markers",
      filter: ["!", ["has", "point_count"]],
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
  },
};

const liveFeedLayers: LayerRegistryEntry = {
  id: "live-feed-layers",
  install: ({ map, dark }) => {
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
  },
  attachHoverPopups: ({ map }) => {
    liveFeedHoverPopups(map, createLayerHoverPopup());
  },
};

const datasetLayers: LayerRegistryEntry = {
  id: "dataset-layers",
  install: ({ map, dark }) => {
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
  },
  attachHoverPopups: ({ map }) => {
    const popup = createLayerHoverPopup();
    datasetHoverPopups(map, popup);
    tectonicHoverPopups(map, popup);
  },
};

const co2Layers: LayerRegistryEntry = {
  id: "co2-layers",
  install: ({ map }) => {
    // CO2 emissions by country (Our World in Data) — a choropleth. The fill is
    // inserted beneath the basemap's labels so country/city names stay legible,
    // shaded on a log scale (a handful of countries dominate global emissions).
    const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addSource("co2", { type: "geojson", data: EMPTY });
    map.addLayer(
      {
        id: "co2-fill",
        type: "fill",
        source: "co2",
        paint: {
          "fill-color": [
            "case",
            ["has", "co2"],
            [
              "interpolate",
              ["linear"],
              ["log10", ["max", ["coalesce", ["get", "co2"], 0.1], 0.1]],
              0, "#fef9c3", // ~1 Mt
              1, "#fde68a", // 10
              2, "#fdba74", // 100
              3, "#fb923c", // 1,000
              4, "#ef4444", // 10,000
              4.2, "#7f1d1d", // ~12,000 (China)
            ],
            "#3f3f46", // no data
          ],
          "fill-opacity": 0.75,
        },
      },
      firstSymbol,
    );
    map.addLayer(
      {
        id: "co2-line",
        type: "line",
        source: "co2",
        paint: { "line-color": "#0f172a", "line-width": 0.5, "line-opacity": 0.5 },
      },
      firstSymbol,
    );
  },
  attachHoverPopups: ({ map }) => {
    co2HoverPopups(map, createLayerHoverPopup());
  },
};

const spaceLayers: LayerRegistryEntry = {
  id: "space-layers",
  install: ({ map, dark }) => {
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
  },
};

const textOverlayLayers: LayerRegistryEntry = {
  id: "text-overlay-layers",
  install: ({ map, haloColor }) => {
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
  },
};

export const baseLayerRegistry: LayerRegistryEntry[] = [
  userFeatureLayers,
  liveFeedLayers,
  datasetLayers,
  co2Layers,
  spaceLayers,
  textOverlayLayers,
];

export function installBaseLayerRegistry(map: MbMap, dark: boolean): void {
  const ctx = getLayerRegistryContext(map, dark);
  for (const entry of baseLayerRegistry) {
    entry.install(ctx);
  }
}

export function attachBaseLayerHoverPopups(map: MbMap, dark: boolean): void {
  const ctx = getLayerRegistryContext(map, dark);
  for (const entry of baseLayerRegistry) {
    entry.attachHoverPopups?.(ctx);
  }
}

function getLayerRegistryContext(map: MbMap, dark: boolean): LayerRegistryContext {
  // Label colors adapt to the basemap: light text on dark maps, dark on light.
  const labelColor = dark ? "#e9ecef" : "#212529";
  const haloColor = dark ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.85)";
  return { map, dark, labelColor, haloColor };
}
