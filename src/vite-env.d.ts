/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHARE_API_URL?: string;
  readonly VITE_CF_WEB_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
