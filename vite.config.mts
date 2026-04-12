import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { resolveManualChunk } from './src/build/chunking';

const landingEntry = fileURLToPath(new URL('./index.html', import.meta.url));
const appEntry = fileURLToPath(new URL('./app/index.html', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      jsts: 'jsts/dist/jsts.min.js',
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'app/index.html'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        landing: landingEntry,
        app: appEntry,
      },
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
});
