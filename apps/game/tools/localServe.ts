/**
 * Play on an iPad (or any phone) from the PC over home Wi-Fi (D74): pure helpers for
 * serve-local.ts, which serves the built phone page (dist-mobile) to the local network.
 */
import { extname, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export function mimeFor(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** The file for a request path inside root, or null for anything outside it. "/" → index.html. */
export function fileFor(root: string, urlPath: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(urlPath.split('?')[0]!.split('#')[0]!);
  } catch {
    return null;
  }
  if (p.endsWith('/')) p += 'index.html';
  const base = resolve(root);
  const full = resolve(base, '.' + normalize('/' + p));
  return full === base || full.startsWith(base + sep) ? full : null;
}

export interface NetIf {
  address: string;
  family: string | number;
  internal: boolean;
}

/** The addresses a tablet on the same Wi-Fi can open: private IPv4 first (192.168.x, 10.x, 172.16–31.x). */
export function lanUrls(ifaces: Record<string, NetIf[] | undefined>, port: number): string[] {
  const ips = Object.values(ifaces)
    .flat()
    .filter((i): i is NetIf => !!i && !i.internal && (i.family === 'IPv4' || i.family === 4))
    .map((i) => i.address);
  const priv = (ip: string): number =>
    /^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return [...new Set(ips)].sort((a, b) => priv(a) - priv(b)).map((ip) => `http://${ip}:${port}/`);
}
