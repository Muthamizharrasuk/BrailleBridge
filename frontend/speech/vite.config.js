import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  server: {
    proxy: {
      '/api/speech': { target: loadEnv(mode, process.cwd(), '').SPEECH_BACKEND_URL || 'http://127.0.0.1:8001' },
    },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    clearMocks: true,
  },
}));
