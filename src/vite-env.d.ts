/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Live API base for the dashboard's data (server/main.py). Defaults to the deployed API. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
