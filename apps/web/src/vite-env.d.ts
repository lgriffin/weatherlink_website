/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' when built for static hosting (GitHub Pages): data comes from a JSON snapshot. */
  readonly VITE_STATIC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
