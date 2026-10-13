// Parse the manually-copied FPV list into markers.
// - DMS / decimal coordinate rows  -> exact coords (parsed here)
// - named places                   -> matched to the Google export by name
// - "Dropped pin / Near X" + leftover named -> queued for Mapbox geocoding
const fs = require("fs");

const raw = fs.readFileSync(__dirname + "/fpv_raw.txt", "utf8");
const gfile = JSON.parse(
  fs.readFileSync("/Users/ruslan/Downloads/6a22be7ebb00b8f25f932310.json", "utf8"),
);

// Split into blocks on lines that are exactly "Note".
const blocks = [];
let cur = [];
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (t === "Note") {
    if (cur.length) blocks.push(cur);
    cur = [];
  } else if (t) {
    cur.push(t);
  }
}
if (cur.length) blocks.push(cur);

const dms = /(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/;
const dec = /^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/;

function dmsToDec(d, m, s, hemi) {
  let v = +d + +m / 60 + +s / 3600;
  if (hemi === "S" || hemi === "W") v = -v;
  return v;
}

// Index Google export by normalized name for matching.
const norm = (s) => s.toLowerCase().replace(/[^a-zа-я0-9]+/gi, " ").trim();
const byName = new Map();
for (const p of gfile) {
  if (p.gps && p.name && !p.isCoordinateOnly) byName.set(norm(p.name), p);
}

const out = []; // {title, lngLat?, props, geo?}  geo = address string to geocode
let exact = 0, matched = 0, geo = 0;

for (const b of blocks) {
  const first = b[0];
  const m = first.match(dms);
  if (m) {
    const lat = dmsToDec(m[1], m[2], m[3], m[4]);
    const lng = dmsToDec(m[5], m[6], m[7], m[8]);
    out.push({ title: "FPV spot", lngLat: [lng, lat], props: {} });
    exact++;
    continue;
  }
  const dm = first.match(dec);
  if (dm) {
    out.push({ title: "FPV spot", lngLat: [+dm[2], +dm[1]], props: {} });
    exact++;
    continue;
  }
  if (first === "Dropped pin") {
    const near = b[1] && b[1].startsWith("Near ") ? b[1].slice(5) : null;
    out.push({
      title: near ? "Dropped pin — " + near : "Dropped pin",
      props: near ? { text: "Near " + near } : {},
      geo: near, // null => no location info, skip
    });
    if (near) geo++;
    continue;
  }
  // Named place. Try to match the Google export for exact coords.
  const hit = byName.get(norm(first));
  const rest = b.slice(1);
  const ratingLine = rest.find((l) => /^\d\.\d\(/.test(l));
  const typeLine = rest.find((l) => !/^\d\.\d\(/.test(l));
  const props = {};
  if (typeLine) props.text = typeLine;
  if (hit) {
    if (typeof hit.ratingsAverage === "number") props.rating = Math.round(hit.ratingsAverage);
    if (hit.address) props.address = hit.address;
    if (hit.originalUrl || hit.googleUrl) props.url = hit.originalUrl || hit.googleUrl;
    out.push({ title: first, lngLat: [hit.gps.lng, hit.gps.lat], props });
    matched++;
  } else {
    // address-style block: join the lines as the geocode query
    const query = b.join(", ");
    out.push({ title: first, props, geo: query });
    geo++;
  }
}

fs.writeFileSync(__dirname + "/fpv_parsed.json", JSON.stringify(out, null, 2));
console.log("blocks", blocks.length, "| exact", exact, "| matched", matched, "| needGeo", geo,
  "| noLocation", out.filter((o) => !o.lngLat && o.geo == null).length);
