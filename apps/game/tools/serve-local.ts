/**
 * Play Khmer Kingdoms on an iPad or phone from this PC over home Wi-Fi (D74).
 *   npm run ipad            (builds the phone page, then serves it)
 * Open the address it prints in Safari on the iPad (same Wi-Fi). Keep this window open while playing.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { fileFor, lanUrls, mimeFor } from './localServe';

const root = resolve(import.meta.dirname, '../dist-mobile');
const port = Number(process.env.PORT ?? 8080);
if (!existsSync(resolve(root, 'index.html'))) {
  console.error('dist-mobile is missing: run  npm run build:mobile -w @temples/game  first.');
  process.exit(1);
}

createServer((req, res) => {
  const file = fileFor(root, req.url ?? '/');
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': mimeFor(file),
    'cache-control': file.endsWith('index.html') || file.endsWith('sw.js') ? 'no-cache' : 'max-age=86400',
  });
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => {
  const urls = lanUrls(networkInterfaces(), port);
  console.log('\n  នគរខ្មែរ · Khmer Kingdoms — play on iPad / phone over Wi-Fi\n');
  console.log('  On the iPad (same Wi-Fi), open in Safari:');
  for (const u of urls) console.log(`    ${u}`);
  console.log(`\n  On this PC: http://localhost:${port}/`);
  console.log('  If Windows asks about the firewall, tick "Private networks" and Allow.');
  console.log('  Keep this window open while playing. Ctrl+C to stop.\n');
});
