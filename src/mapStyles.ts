// Catalog of default Mapbox styles available on any account.
// id is the part after `mapbox://styles/mapbox/`.
// `dark` marks basemaps with a dark background (so labels need a light color).
export const MAP_STYLES = [
  { id: "standard", label: "Standard", hint: "3D, dynamic light", dark: false },
  { id: "streets-v12", label: "Streets", hint: "Classic street map", dark: false },
  { id: "outdoors-v12", label: "Outdoors", hint: "Terrain & trails", dark: false },
  { id: "light-v11", label: "Light", hint: "Minimal light", dark: false },
  { id: "dark-v11", label: "Dark", hint: "Minimal dark", dark: true },
  { id: "satellite-v9", label: "Satellite", hint: "Imagery only", dark: true },
  { id: "satellite-streets-v12", label: "Satellite Streets", hint: "Imagery + labels", dark: true },
  { id: "navigation-day-v1", label: "Navigation Day", hint: "Driving, light", dark: false },
  { id: "navigation-night-v1", label: "Navigation Night", hint: "Driving, dark", dark: true },
] as const;

export type MapStyleId = (typeof MAP_STYLES)[number]["id"];

export function styleUrl(id: string): string {
  return `mapbox://styles/mapbox/${id}`;
}

// Whether the basemap has a dark background (defaults to dark if unknown).
export function isDarkStyle(id: string): boolean {
  return MAP_STYLES.find((s) => s.id === id)?.dark ?? true;
}
