// Geocode the "needs location" FPV rows via Mapbox, then emit final markers.
const fs = require("fs");

const token = fs
  .readFileSync(__dirname + "/../.env", "utf8")
  .split("\n")
  .find((l) => l.startsWith("VITE_MAPBOX_TOKEN="))
  .split("=")[1]
  .trim();

const rows = JSON.parse(fs.readFileSync(__dirname + "/fpv_parsed.json", "utf8"));

async function geocode(q) {
  const url =
    "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
    encodeURIComponent(q) +
    ".json?limit=1&access_token=" +
    token;
  const r = await fetch(url);
  if (!r.ok) return null;
  const d = await r.json();
  return d.features && d.features[0] ? d.features[0].center : null; // [lng,lat]
}

(async () => {
  const out = [];
  let ok = 0, fail = 0, dropped = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.lngLat) {
      out.push(row);
      continue;
    }
    if (row.geo == null) {
      dropped++; // bare dropped pin, no location at all
      continue;
    }
    let center = await geocode(row.geo);
    if (!center) center = await geocode(row.geo + ", Poland");
    if (center) {
      row.lngLat = center;
      row.props = { ...row.props, approx: true };
      out.push(row);
      ok++;
    } else {
      fail++;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  // Build final Feature objects.
  const feats = out.map((o, i) => ({
    id: "fpv-" + i,
    kind: "marker",
    lngLat: o.lngLat,
    title: o.title,
    properties: o.props || {},
    createdAt: Date.now() + i,
  }));
  fs.writeFileSync(__dirname + "/fpv_features.json", JSON.stringify(feats, null, 2));
  console.log("geocoded ok", ok, "| failed", fail, "| dropped(no loc)", dropped, "| total features", feats.length);
})();
