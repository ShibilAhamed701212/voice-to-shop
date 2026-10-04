/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin when the frontend is hosted separately from the API. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
