/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for the Button frontend.
 *
 * `server.proxy` forwards `/v1` to the local House HTTP server during development so the app
 * talks to the real governed backend. In tests/e2e the app uses an injected mock transport
 * (toggled by `VITE_BUTTON_MOCK`) so no backend is required.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/v1': {
        target: process.env['BUTTON_API_TARGET'] ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
