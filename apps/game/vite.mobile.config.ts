import { readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { cacheVersion, offlineFiles, serviceWorkerSource } from './src/pwa/offline';
import { musicFiles } from './tools/musicFiles';
import musicJson from '../../config/kingdom/music.json';
import qualityJson from '../../config/quality.json';
import { shrinkModels } from './tools/phoneModels';

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

/**
 * Model folders the phone build leaves out. PK 2026-10-20 (D163): the phone has the PC's models
 * now (models/real, models/buildings, phone-sized by tools/phoneModels.ts); only the old Meshy
 * heroes (models/heroes, replaced by models/real/people in D155) stay off it.
 */
export const PC_ONLY = ['models/heroes'];

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
      async closeBundle() {
        const out = resolve(__dirname, 'dist-mobile');
        renameSync(resolve(out, 'mobile.html'), resolve(out, 'index.html'));
        for (const dir of PC_ONLY) rmSync(resolve(out, dir), { recursive: true, force: true });
        // D163: the PC's 3D models, at the phone's texture size (cached in .phone-models/).
        const M = qualityJson.mobile as { modelTextureMax?: number; modelMaxTris?: number; modelKeepWhole?: string[] };
        const r = await shrinkModels(
          resolve(__dirname, 'public-mobile'),
          out,
          resolve(__dirname, '.phone-models'),
          M.modelTextureMax ?? 1024,
          M.modelMaxTris ?? Infinity,
          M.modelKeepWhole ?? [],
        );
        console.log(`phone models: ${r.files} (${r.made} made), ${(r.saved / 1e6).toFixed(1)} MB smaller`);
        const files = walk(out).map((p) => [relative(out, p).replace(/\\/g, '/'), statSync(p).size] as const);
        const list = offlineFiles(files.map(([f]) => f));
        writeFileSync(resolve(out, 'sw.js'), serviceWorkerSource(list, cacheVersion(files)));
      },
    },
  ],
});
