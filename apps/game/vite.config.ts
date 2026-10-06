import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { musicFiles } from './tools/musicFiles';

export default defineConfig({
  // Relative paths so the built game also opens from disk in the Electron window.
  base: './',
  // The phone page's manifest and icons (iPhone web app, D73), harmless for the desktop page.
  publicDir: 'public-mobile',
  server: { fs: { allow: ['../..'] } },
  // PK's own music (D76): public/music/ served at ./music/ and copied to dist/music/ (see the plugin).
  plugins: [musicFiles({ dir: resolve(__dirname, 'public/music'), copy: true })],
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1100,
    // The phone page (D72) is built alongside, so tests and previews can open /mobile.html.
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), mobile: resolve(__dirname, 'mobile.html') },
    },
  },
});
