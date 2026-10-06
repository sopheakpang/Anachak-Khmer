import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths: the built panel is also served by the bridge at http://localhost:7420/host/
  base: './',
  server: { fs: { allow: ['../..'] } },
  build: { assetsInlineLimit: 0 },
});
