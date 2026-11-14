import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const brailleTarget = env.BRAILLE_BACKEND_URL || 'http://127.0.0.1:8000';
  return {
  server: {
    proxy: {
      '/api/braille': { target: brailleTarget },
      '/api/health': { target: brailleTarget },
      '/api/speech': { target: env.SPEECH_BACKEND_URL || 'http://127.0.0.1:8001' },
    },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    clearMocks: true,
  },
  };
});
