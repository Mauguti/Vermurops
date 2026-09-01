/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' = conectar a los emuladores locales de Firebase. Ver src/firebase.ts. */
  readonly VITE_USAR_EMULADORES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
