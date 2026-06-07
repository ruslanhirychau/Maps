import { useEffect, useState, type RefObject } from "react";
import type { Map as MbMap } from "mapbox-gl";
import { WORLD_ID } from "../../types";

// --- Country choropleth: World Bank indicators joined to mapbox boundaries ---
export const WB_INDICATORS = {
  pop: { code: "SP.POP.TOTL", short: "Население", unit: "чел.", format: "compact" as const },
  gdp: { code: "NY.GDP.MKTP.CD", short: "ВВП", unit: "$", format: "compact" as const },
  life: { code: "SP.DYN.LE00.IN", short: "Жизнь", unit: "лет", format: "decimal" as const },
  co2: { code: "EN.ATM.CO2E.PC", short: "CO₂", unit: "т/чел", format: "decimal" as const },
};
export type WbKey = keyof typeof WB_INDICATORS;
type ChoroFormat = "compact" | "decimal";

// Sequential viridis-ish ramp (dark→bright) for 6 buckets; gray = no data.
const CHORO_COLORS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];
const CHORO_NODATA = "#3a3a46";

export interface ChoroLegend {
  breaks: number[];
  colors: string[];
  format: ChoroFormat;
  unit: string;
}

function fmtValue(v: number, format: ChoroFormat): string {
  if (format === "decimal") return v.toFixed(1);
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);
}

// 5 ascending quantile breakpoints → 6 buckets (strictly increasing for `step`).
function quantileBreaks(sorted: number[], count = 5): number[] {
  const res: number[] = [];
  for (let i = 1; i <= count; i++) {
    const idx = Math.floor((i / (count + 1)) * (sorted.length - 1));
    let b = sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
    if (res.length && b <= res[res.length - 1]) b = res[res.length - 1] + 1e-6;
    res.push(b);
  }
  return res;
}

export function bucketLabel(lg: ChoroLegend, i: number): string {
  const f = (v: number) => fmtValue(v, lg.format);
  if (i === 0) return `< ${f(lg.breaks[0])}`;
  if (i === lg.colors.length - 1) return `≥ ${f(lg.breaks[lg.breaks.length - 1])}`;
  return `${f(lg.breaks[i - 1])} – ${f(lg.breaks[i])}`;
}

// Colour mapbox country polygons by a World Bank indicator (joined via
// feature-state on the ISO-3 code). Owns the selected indicator + legend.
export function useWorldData(
  mapRef: RefObject<MbMap | null>,
  activeWorkspaceId: string | null,
  styleVersion: number,
  loadedRef: RefObject<boolean>,
) {
  const [indicator, setIndicator] = useState<WbKey>("pop");
  const [legend, setLegend] = useState<ChoroLegend | null>(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loadedRef.current) return;

    if (activeWorkspaceId !== WORLD_ID) {
      if (m.getLayer("countries-fill")) m.removeLayer("countries-fill");
      if (m.getSource("countries")) m.removeSource("countries");
      setLegend(null);
      return;
    }

    if (!m.getSource("countries")) {
      m.addSource("countries", {
        type: "vector",
        url: "mapbox://mapbox.country-boundaries-v1",
        promoteId: { country_boundaries: "iso_3166_1_alpha_3" },
      });
    }
    if (!m.getLayer("countries-fill")) {
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.addLayer(
        {
          id: "countries-fill",
          type: "fill",
          source: "countries",
          "source-layer": "country_boundaries",
          // Show one consistent worldview (avoids overlapping disputed polygons).
          filter: [
            "any",
            ["==", "all", ["get", "worldview"]],
            ["in", "US", ["get", "worldview"]],
          ],
          paint: {
            "fill-color": CHORO_NODATA,
            "fill-opacity": 0.82,
            "fill-outline-color": "rgba(255,255,255,0.18)",
          },
        },
        firstSymbol,
      );
    }

    let cancelled = false;
    const ind = WB_INDICATORS[indicator];
    fetch(
      `https://api.worldbank.org/v2/country/all/indicator/${ind.code}` +
        `?format=json&per_page=400&mrnev=1`,
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !mapRef.current) return;
        const rows: Array<{ countryiso3code?: string; value: number | null }> =
          Array.isArray(json) ? json[1] : null;
        if (!Array.isArray(rows)) return;
        m.removeFeatureState({ source: "countries", sourceLayer: "country_boundaries" });
        const values: number[] = [];
        for (const row of rows) {
          const iso3 = row.countryiso3code;
          if (!iso3 || iso3.length !== 3 || row.value == null) continue;
          m.setFeatureState(
            { source: "countries", sourceLayer: "country_boundaries", id: iso3 },
            { v: row.value },
          );
          values.push(row.value);
        }
        if (values.length === 0) return;
        values.sort((a, b) => a - b);
        const breaks = quantileBreaks(values, 5);
        // step(feature-state v): color0 < b1 <= color1 < b2 ... ; null → no-data.
        const step: unknown[] = ["step", ["feature-state", "v"], CHORO_COLORS[0]];
        breaks.forEach((b, i) => step.push(b, CHORO_COLORS[i + 1]));
        m.setPaintProperty("countries-fill", "fill-color", [
          "case",
          ["==", ["feature-state", "v"], null],
          CHORO_NODATA,
          step,
        ] as never);
        setLegend({ breaks, colors: CHORO_COLORS, format: ind.format, unit: ind.unit });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, indicator, styleVersion]);

  return { indicator, setIndicator, legend };
}
