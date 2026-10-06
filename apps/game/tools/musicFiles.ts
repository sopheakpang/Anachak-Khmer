/**
 * PK's own background music for the Kingdom tab (D76): audio files in apps/game/public/music/,
 * served at ./music/ in dev and copied to the build.
 *
 * Why a plugin and not a public folder: both Vite configs use `publicDir: 'public-mobile'`
 * (the phone manifest and icons, D73), and Vite has only one public folder per build. Making
 * `public/` the public dir would drop those, and putting music into public-mobile would put
 * every song into the phone's offline cache. So this tiny plugin serves and copies only
 * apps/game/public/music/*.{mp3,ogg,m4a}: always for the PC page, for the phone build only
 * when config/kingdom/music.json says `tracksOnMobile`.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const TYPES: Record<string, string> = { mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4' };

/** A plain audio file name (no folders, no "..") we serve: mp3, ogg or m4a. */
export function isMusicFile(name: string): boolean {
  return /^[^/\\]+\.(mp3|ogg|m4a)$/i.test(name) && !name.startsWith('.');
}

export function musicType(name: string): string {
  return TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';
}

/** The file name a request for /music/<name> asks for, or null. */
export function musicRequest(url: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(url.split('?')[0]!.split('#')[0]!.replace(/^\/+/, ''));
  } catch {
    return null;
  }
  return isMusicFile(name) ? name : null;
}

/** The audio files in `dir` (none if it does not exist), sorted. */
export function listMusic(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => isMusicFile(n) && statSync(resolve(dir, n)).isFile())
    .sort();
}

export function musicFiles(opts: { dir: string; copy: boolean }): Plugin {
  return {
    name: 'temples-music-files',
    configureServer(server) {
      server.middlewares.use('/music/', (req, res, next) => {
        const name = musicRequest(req.url ?? '');
        const file = name ? resolve(opts.dir, name) : null;
        if (!file || !existsSync(file)) return next();
        res.setHeader('Content-Type', musicType(file));
        res.setHeader('Content-Length', String(statSync(file).size));
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      if (!opts.copy) return;
      for (const name of listMusic(opts.dir))
        this.emitFile({
          type: 'asset',
          fileName: `music/${name}`,
          source: readFileSync(resolve(opts.dir, name)),
        });
    },
  };
}
