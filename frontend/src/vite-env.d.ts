/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAKE_WEBHOOK_URL?: string;
  readonly VITE_MOCK_API_URL?: string;
  readonly VITE_ELEVENLABS_API_KEY?: string;
  readonly VITE_ELEVENLABS_VOICE_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
