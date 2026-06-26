import mapboxgl from "mapbox-gl";

export function createLayerHoverPopup(): mapboxgl.Popup {
  return new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: "plane-popup",
  });
}


export function liveFeedHoverPopups(map: mapboxgl.Map, popup: mapboxgl.Popup): void {
  // Hover tooltip for live aircraft.
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
    popup
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
    popup.remove();
  });

  // Hover tooltip for live ships.
  map.on("mousemove", "ships", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const p = f.properties as { name: string; sog: number; cog: number };
    popup
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
    popup.remove();
  });
}

export function datasetHoverPopups(map: mapboxgl.Map, popup: mapboxgl.Popup): void {
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">☄ ${p.n || "—"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "meteorites", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">🔥 ${p.title || "Wildfire"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "fires", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });

  // Hover tooltip for submarine cables (cable name at the cursor).
  map.on("mousemove", "cables", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const p = f.properties as { name?: string };
    popup
      .setLngLat(e.lngLat)
      .setHTML(`<div class="pp-call">🌐 ${p.name || "Cable"}</div>`)
      .addTo(map);
  });
  map.on("mouseleave", "cables", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">🦠 ${p.country || "—"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "covid", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">☢ ${p.name || "Nuclear plant"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "nuclear", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">🛩 ${p.name || "Aviation accident"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "crashes", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">⚓ ${p.name || "Shipwreck"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "wrecks", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(
        `<div class="pp-call">🏛 ${p.name || "World Heritage Site"}</div>` +
          (meta ? `<div class="pp-row">${meta}</div>` : ""),
      )
      .addTo(map);
  });
  map.on("mouseleave", "unesco", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">🌫 ${p.name || "—"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "air", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">☢ ${p.name || "Nuclear test"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "nuketests", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
}

export function co2HoverPopups(map: mapboxgl.Map, popup: mapboxgl.Popup): void {
  // Hover tooltip for the CO2 choropleth (annual total + per-capita emissions).
  map.on("mousemove", "co2-fill", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const p = f.properties as {
      name?: string;
      co2?: number;
      pc?: number;
      year?: number;
    };
    const total =
      typeof p.co2 === "number"
        ? p.co2 >= 1000
          ? `${(p.co2 / 1000).toFixed(2)} Gt`
          : `${p.co2.toLocaleString("en-US")} Mt`
        : null;
    const rows = [
      total
        ? `<div class="pp-row">CO₂&nbsp;${total}${p.year ? ` (${p.year})` : ""}</div>`
        : `<div class="pp-row">No data</div>`,
      typeof p.pc === "number"
        ? `<div class="pp-row">Per capita&nbsp;${p.pc.toFixed(1)} t</div>`
        : "",
    ].join("");
    popup
      .setLngLat(e.lngLat)
      .setHTML(`<div class="pp-call">🏭 ${p.name || "—"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "co2-fill", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
}

export function tectonicHoverPopups(map: mapboxgl.Map, popup: mapboxgl.Popup): void {
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">🌐 M ${mag}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "quakes", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
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
    popup
      .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
      .setHTML(`<div class="pp-call">🌋 ${p.name || "Volcano"}</div>${rows}`)
      .addTo(map);
  });
  map.on("mouseleave", "volcanoes", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });

  // Hover tooltip for plate boundaries (boundary name).
  map.on("mousemove", "plates", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    map.getCanvas().style.cursor = "pointer";
    const p = f.properties as { name?: string };
    popup
      .setLngLat(e.lngLat)
      .setHTML(`<div class="pp-call">🗺 ${p.name || "Plate boundary"}</div>`)
      .addTo(map);
  });
  map.on("mouseleave", "plates", () => {
    map.getCanvas().style.cursor = "";
    popup.remove();
  });
}
