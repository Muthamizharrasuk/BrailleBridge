import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  resolve: {
    alias: {
      react: fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api/braille': { target: process.env.BRAILLE_BACKEND_URL || 'http://127.0.0.1:8000' },
      '/api/health': { target: process.env.BRAILLE_BACKEND_URL || 'http://127.0.0.1:8000' },
      '/api/speech': { target: process.env.SPEECH_BACKEND_URL || 'http://127.0.0.1:8001' },
    },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    clearMocks: true,
    server: { deps: { inline: [/speech/, /camera/] } },
  },
});
