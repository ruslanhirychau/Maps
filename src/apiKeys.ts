// Runtime API keys, described once here. On first run the user enters them in a
// popup; they're remembered per-browser in localStorage. When a value isn't set
// we fall back to the build-time VITE_* env var (handy for local dev / CI), so
// nothing has to live in the repo. The `id` doubles as the matching env-var name.

export interface ApiKeyDef {
  id: string;
  label: string;
  description: string;
  placeholder: string;
  required: boolean;
  docUrl: string;
  // Optional sanity check for the entered value (e.g. Mapbox tokens start "pk.").
  validate?: (value: string) => string | null;
}

export const API_KEY_DEFS: ApiKeyDef[] = [
  {
    id: "VITE_MAPBOX_TOKEN",
    label: "Mapbox token",
    description: "Powers the base map and place search. Public token, starts with “pk.”.",
    placeholder: "pk.…",
    required: true,
    docUrl: "https://account.mapbox.com/access-tokens/",
    validate: (v) => (v.startsWith("pk.") ? null : "Should start with “pk.”"),
  },
  {
    id: "VITE_AISSTREAM_KEY",
    label: "AISStream key",
    description: "Optional — enables the live “Ships” layer. Leave empty to skip it.",
    placeholder: "",
    required: false,
    docUrl: "https://aisstream.io/",
  },
];

const STORE_KEY = "maps-prototype:apikeys:v1";

export type ApiKeyMap = Record<string, string>;

const envFallback = import.meta.env as Record<string, string | undefined>;

function loadStored(): ApiKeyMap {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as ApiKeyMap;
  } catch (err) {
    console.warn("Failed to read API keys from localStorage:", err);
  }
  return {};
}

// Resolve a key's effective value: a user-entered value (localStorage) always
// wins. Otherwise we fall back to the local .env value — but ONLY during local
// development. In a production build the env fallback is ignored, so the baked-in
// token is never used and a fresh visitor is asked for their own key in the popup.
export function getApiKey(id: string): string | undefined {
  const stored = loadStored()[id]?.trim();
  if (stored) return stored;
  if (!import.meta.env.DEV) return undefined;
  const env = envFallback[id]?.trim();
  return env || undefined;
}

// Current effective values, used to prefill the form (shows what's in effect).
export function loadApiKeys(): ApiKeyMap {
  const out: ApiKeyMap = {};
  for (const def of API_KEY_DEFS) {
    const v = getApiKey(def.id);
    if (v) out[def.id] = v;
  }
  return out;
}

// Persist only the non-empty entered values (trimmed); env stays the fallback.
export function saveApiKeys(values: ApiKeyMap): void {
  const cleaned: ApiKeyMap = {};
  for (const [id, value] of Object.entries(values)) {
    const trimmed = value.trim();
    if (trimmed) cleaned[id] = trimmed;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cleaned));
  } catch (err) {
    console.warn("Failed to save API keys to localStorage:", err);
  }
}

// True once every *required* key has a value (from env or the user). Drives the
// first-run popup.
export function hasRequiredApiKeys(): boolean {
  return API_KEY_DEFS.every((def) => !def.required || !!getApiKey(def.id));
}
