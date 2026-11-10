import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5199, host: '127.0.0.1', open: false },
  preview: { port: 5199, host: '127.0.0.1' },
  build: { target: 'esnext', chunkSizeWarningLimit: 1200 },
});
