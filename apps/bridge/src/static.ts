import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

/**
 * Serve the built host panel (apps/host/dist) at /host/ so stream mode needs no extra
 * dev server. Returns false when the request is not for /host.
 */
export function serveHost(req: IncomingMessage, res: ServerResponse, distDir: string): boolean {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/host') {
    res.writeHead(301, { location: '/host/' }).end();
    return true;
  }
  if (!url.pathname.startsWith('/host/')) return false;
  if (!existsSync(join(distDir, 'index.html'))) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Host panel not built yet. Run: npm run build -w @temples/host');
    return true;
  }
  const rel = decodeURIComponent(url.pathname.slice('/host/'.length)) || 'index.html';
  const file = normalize(join(distDir, rel));
  // Never serve anything outside the dist folder.
  if (!file.startsWith(normalize(distDir) + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return true;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
  return true;
}
