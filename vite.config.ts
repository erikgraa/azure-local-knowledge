import { defineConfig } from 'vite';

// Project Pages are served from /<repo>/, so CI passes VITE_BASE from actions/configure-pages.
// The './' fallback keeps local builds and previews working from any location.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
});
