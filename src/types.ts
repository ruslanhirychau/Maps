// Data hierarchy: Workspace -> Layer -> Feature.
// Geometry is stored as GeoJSON so it can be fed directly into Mapbox
// and later moved to PostGIS/Supabase without reshaping.

export type FeatureKind = "marker" | "text" | "line" | "polygon";

export interface Feature {
  id: string;
  kind: FeatureKind;
  // GeoJSON point coordinates: [longitude, latitude]. For line/polygon this is a
  // representative point (first vertex) used for fly-to / list focus.
  lngLat: [number, number];
  // Full GeoJSON geometry for line/polygon features (managed via Mapbox Draw).
  geometry?: GeoJSON.Geometry;
  // Title (for marker) or the on-map text itself (for text).
  title: string;
  // Free-form fields — each workspace has its own schema (rating, date, etc.).
  properties: Record<string, unknown>;
  createdAt: number;
}

export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  features: Feature[];
}

import type { MapStyleId } from "./mapStyles";

// Sentinel active id for the virtual "Everything" view (all workspaces at once).
export const EVERYTHING_ID = "everything";

// Default "Inbox" workspace — where features added from Everything land.
export const INBOX_ID = "ws-inbox";

// Live aircraft demo workspace (OpenSky) — rendered from a live feed, not data.
export const AIRCRAFT_ID = "ws-aircraft";

// Live ships demo workspace (AISStream) — rendered from a live AIS feed.
export const SHIPS_ID = "ws-ships";

// Weather radar workspace (RainViewer) — raster precipitation overlay + timeline.
export const RAIN_ID = "ws-rain";

// Live ISS position (wheretheiss.at) — a single live point orbiting the globe.
export const ISS_ID = "ws-iss";

// Country choropleth (World Bank indicators joined to mapbox boundaries).
export const WORLD_ID = "ws-world";

// Live lightning strikes (Blitzortung WebSocket) — global real-time flashes.
export const LIGHTNING_ID = "ws-lightning";

// Meteorite landings (NASA, ~32k historical impact sites) — static scatter.
export const METEORITE_ID = "ws-meteorites";

export interface Workspace {
  id: string;
  name: string;
  // Visual identity (Arc-style): emoji icon and accent color that themes the UI.
  icon: string;
  color: string;
  // Per-workspace Mapbox style (see MAP_STYLES catalog).
  style: MapStyleId;
  // Marker shape id (circle/square/diamond/star/pin) or a custom emoji.
  marker: string;
  // A folder aggregates these member workspace ids (undefined = normal space).
  members?: string[];
  // Pinned workspaces show in the collapsed tab bar (top group in the sidebar).
  pinned: boolean;
  // Initial camera position when the workspace is selected.
  center: [number, number];
  zoom: number;
  layers: Layer[];
}

export interface AppData {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  // Basemap used by the "Everything" view (it has no workspace of its own).
  everythingStyle: MapStyleId;
}
