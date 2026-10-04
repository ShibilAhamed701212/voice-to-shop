import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'http://localhost:8000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      // The API lives on :8000 in dev; proxying keeps every request same-origin.
      proxy: {
        '/api': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true }
      }
    },
    preview: { port: 4173 }
  };
});
