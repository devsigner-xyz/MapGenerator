import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      jsts: 'jsts/dist/jsts.min.js',
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
