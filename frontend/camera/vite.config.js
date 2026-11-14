import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// The camera app reuses the read-only Braille preview, validator and styles from
// ../speech, so Vite must be allowed to read one directory up.
export default defineConfig({
  // HTTPS=1 npm run dev:phone serves over https (self-signed) so phone browsers allow the camera.
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  // Shared speech files must use this app's React, not a second copy.
  resolve: {
    alias: { react: here('./node_modules/react'), 'react-dom': here('./node_modules/react-dom') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api/braille': { target: process.env.BRAILLE_BACKEND_URL || 'http://127.0.0.1:8000' },
      '/api/health': { target: process.env.BRAILLE_BACKEND_URL || 'http://127.0.0.1:8000' },
    },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    clearMocks: true,
    server: { deps: { inline: [/speech/] } },
  },
});
