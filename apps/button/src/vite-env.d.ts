/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BUTTON_MOCK?: string;
  readonly VITE_BUTTON_MOCK_SCENARIO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
