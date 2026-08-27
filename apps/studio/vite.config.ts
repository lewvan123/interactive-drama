import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/studio/',
  plugins: [react()],
  build: {
    outDir: '../server/dist/public',
    emptyOutDir: true,
    // The DOCX parser is intentionally lazy-loaded as a separate ~1 MB chunk.
    chunkSizeWarningLimit: 1100,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:6001',
      '/media': 'http://127.0.0.1:6001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
