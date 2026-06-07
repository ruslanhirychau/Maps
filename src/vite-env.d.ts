/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN: string;
  readonly VITE_AISSTREAM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
