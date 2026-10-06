import { readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { cacheVersion, offlineFiles, serviceWorkerSource } from './src/pwa/offline';
import { musicFiles } from './tools/musicFiles';
import musicJson from '../../config/kingdom/music.json';

/**
 * The phone build: only mobile.html, into dist-mobile/ as index.html.
 * - Android (D72): Capacitor copies it into the Android app (apps/android).
 * - iPhone (D73): the same folder is an installable offline web app: public-mobile/ adds the
 *   web manifest and icons, and sw.js (written below) keeps every file for offline play.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export default defineConfig({
  base: './',
  publicDir: 'public-mobile',
  server: { fs: { allow: ['../..'] } },
  build: {
    outDir: 'dist-mobile',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1100,
    rollupOptions: { input: resolve(__dirname, 'mobile.html') },
  },
  plugins: [
    // PK's music files go into the phone build only when music.json says so (D76).
    musicFiles({ dir: resolve(__dirname, 'public/music'), copy: musicJson.tracksOnMobile === true }),
    {
      name: 'mobile-index-and-offline',
      closeBundle() {
        const out = resolve(__dirname, 'dist-mobile');
        renameSync(resolve(out, 'mobile.html'), resolve(out, 'index.html'));
        const files = walk(out).map((p) => [relative(out, p).replace(/\\/g, '/'), statSync(p).size] as const);
        const list = offlineFiles(files.map(([f]) => f));
        writeFileSync(resolve(out, 'sw.js'), serviceWorkerSource(list, cacheVersion(files)));
      },
    },
  ],
});
