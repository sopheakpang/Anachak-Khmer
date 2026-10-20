import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadConfigs, parseBlocklist, PORTS } from '@temples/shared';
import { createBridge } from './server';
import { fileLogger } from './logger';

// Node prints an "ExperimentalWarning" for its built-in SQLite; hide only that one.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') console.warn(w);
});
const { SqliteStore } = await import('./sqliteStore');

const root = resolve(import.meta.dirname, '../../..');
const configs = loadConfigs();
const blocklist = parseBlocklist(readFileSync(resolve(root, 'config/names-blocklist.txt'), 'utf8'));
const log = fileLogger(resolve(root, 'data/logs'));
// TEMPLES_DB=:memory: runs without saving (used by the browser tests).
const dbPath = process.env.TEMPLES_DB ?? resolve(root, 'data/temples.db');
const store = new SqliteStore(dbPath, configs);
const p = store.progress();
log.info('world loaded', {
  temple: p.templeId,
  progress: p.progress,
  target: p.target,
  stockpile: p.stockpile,
});

// The tests' copy of the Royal Orders starts from the real file each run (D157).
const ordersFile = process.env.TEMPLES_ORDERS
  ? resolve(root, process.env.TEMPLES_ORDERS)
  : resolve(root, 'config/kingdom/orders.json');
if (process.env.TEMPLES_ORDERS) {
  mkdirSync(dirname(ordersFile), { recursive: true });
  copyFileSync(resolve(root, 'config/kingdom/orders.json'), ordersFile);
}
const bridge = createBridge({
  configs,
  store,
  blocklist,
  log,
  hostDist: resolve(root, 'apps/host/dist'),
  // The Royal Orders the host dashboard edits (D157); TEMPLES_ORDERS points the tests elsewhere.
  ordersFile,
});
const port = await bridge.listen(Number(process.env.PORT_WS ?? PORTS.bridgeWs));
log.info(`listening on ws://localhost:${port} · host panel: http://localhost:${port}/host/`);

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await bridge.close();
  if (dbPath !== ':memory:') {
    const file = store.backup(resolve(root, 'data/backups'));
    log.info('saved and backed up', { file });
  }
  store.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('SIGBREAK', () => void shutdown()); // Windows: closing the console window
