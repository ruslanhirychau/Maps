# Maps

An interactive data-visualization map prototype built on Mapbox GL JS. Data is
grouped into **workspaces** (live feeds, overlays, your own markers/notes), each
with its own basemap and accent color. The UI theme follows the active map style
(dark map → dark UI), and everything is stored locally in `localStorage`.

## Features

- **Live feeds** — aircraft (OpenSky / adsb.lol), ships (AISStream), the ISS
  with its orbit ring (wheretheiss.at), and global lightning strikes that flash
  in real time (Blitzortung).
- **Overlays** — weather radar with a timeline (RainViewer), a country
  choropleth by World Bank indicators, and ~32k historical meteorite landings
  (NASA).
- **Your own data** — drop markers and on-map text labels (with size, rotation,
  color, zoom-pinning), and draw lines & polygons (Mapbox GL Draw). Per-item
  undo/redo while editing.
- **Workspaces & folders** — pin spaces to a floating tab bar or a sidebar;
  folders aggregate several spaces into one view.

## Setup

```bash
npm install
cp .env.example .env   # then paste your Mapbox public token
npm run dev
```

Open http://localhost:5173.

Environment variables (see `.env.example`):

- `VITE_MAPBOX_TOKEN` — **required**, your Mapbox public token (`pk.…`).
- `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` — optional, for live aircraft
  (used server-side via the Vite dev middleware; falls back to keyless adsb.lol).
- `VITE_AISSTREAM_KEY` — optional, for live ships (used client-side).

## Build

```bash
npm run build     # tsc -b && vite build  → dist/
npm run preview
```

## Notes

- **Live Aircraft** is proxied through the Vite dev server (`/aircraft`, which
  also hides the OpenSky secret). On a plain static host that endpoint won't
  exist, so the aircraft layer will simply be empty — wire up a serverless
  function if you need it in production.
- `VITE_AISSTREAM_KEY` ships in the client bundle (the `VITE_` prefix), so it is
  visible to anyone using a public deploy.

## Data sources

OpenSky Network · adsb.lol · AISStream · wheretheiss.at · Blitzortung ·
RainViewer · World Bank Open Data · NASA Meteorite Landings · Mapbox.
