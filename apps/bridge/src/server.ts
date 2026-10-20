import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  GAME_MODES,
  OrderSchema,
  OrdersSchema,
  orderId,
  ordersFileText,
  type Orders,
  GAME_NAME,
  startTemple,
  type BridgeMessage,
  type Configs,
  type HostMessage,
  type StatusMessage,
} from '@temples/shared';
import { Pipeline, silentLogger, type Logger } from './pipeline';
import { SimulatorSource, type EventSource } from './sources';
import { serveHost } from './static';
import type { WorldStore } from './store';

export interface BridgeOptions {
  configs: Configs;
  store: WorldStore;
  blocklist: string[];
  source?: EventSource;
  log?: Logger;
  tickMs?: number;
  now?: () => number;
  /** Built host panel folder, served at /host/ (optional). */
  hostDist?: string;
  /**
   * PK 2026-10-20 (D157): config/kingdom/orders.json — the Royal Orders the host dashboard edits
   * (read at start, written after each change). Without it the dashboard cannot change them.
   */
  ordersFile?: string;
}

/** Read the Royal Orders file (null when there is none or it does not validate). */
export function readOrders(file: string | undefined): Orders | null {
  if (!file || !existsSync(file)) return null;
  const r = OrdersSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  return r.success ? r.data : null;
}

/**
 * Apply a dashboard change to the orders: add (validated; an id is made from the English text
 * when missing or taken) or remove (never the last one). Returns the new orders or why not.
 */
export function changeOrders(
  orders: Orders,
  change: { op: 'add'; order: unknown } | { op: 'remove'; id: string },
): { orders: Orders } | { error: string } {
  if (change.op === 'remove') {
    if (!orders.list.some((o) => o.id === change.id)) return { error: `no order ${change.id}` };
    if (orders.list.length <= 1) return { error: 'the last order cannot be removed' };
    return { orders: { ...orders, list: orders.list.filter((o) => o.id !== change.id) } };
  }
  const raw = { ...(change.order as Record<string, unknown>) };
  const taken = orders.list.map((o) => o.id);
  if (typeof raw.id !== 'string' || !raw.id || taken.includes(raw.id))
    raw.id = orderId(String(raw.en ?? ''), taken);
  const r = OrderSchema.safeParse(raw);
  if (!r.success) return { error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { orders: { ...orders, list: [...orders.list, r.data] } };
}

export interface Bridge {
  server: Server;
  pipeline: Pipeline;
  simulator: SimulatorSource;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

/**
 * HTTP /health + WebSocket on one port (7420).
 * Clients connect with ?role=game or ?role=host. Everyone receives every BridgeMessage;
 * only hosts may send simulate/control messages.
 */
export function createBridge(opts: BridgeOptions): Bridge {
  const log = opts.log ?? silentLogger;
  const now = opts.now ?? Date.now;
  const simulator = new SimulatorSource();
  const source = opts.source ?? simulator;
  let connection: StatusMessage['connection'] = 'offline';

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: GAME_NAME.en, source: source.name, connection }));
      return;
    }
    if (opts.hostDist && serveHost(req, res, opts.hostDist)) return;
    res.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server });

  const broadcast = (m: BridgeMessage): void => {
    const data = JSON.stringify(m);
    for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
  };
  const pipeline = new Pipeline(opts.configs, opts.store, opts.blocklist, broadcast, log);

  const status = (): StatusMessage => ({
    kind: 'status',
    source: source.name,
    connection,
    queue: pipeline.queueLength,
    dropped: pipeline.dropped,
    ts: now(),
  });

  source.onEvent((raw) => pipeline.enqueue(raw));
  source.onStatus((s) => {
    connection = s;
    broadcast(status());
    log.info('source status', { source: source.name, status: s });
  });
  if (source !== simulator) simulator.onEvent((raw) => pipeline.enqueue(raw)); // host test buttons always work

  let orders = readOrders(opts.ordersFile);
  const ordersMsg = (error?: string): BridgeMessage | null =>
    orders ? { kind: 'orders', orders, ts: now(), ...(error ? { error } : {}) } : null;

  wss.on('connection', (ws, req) => {
    const role = new URL(req.url ?? '/', 'http://x').searchParams.get('role') ?? 'game';
    const om = ordersMsg();
    if (om) ws.send(JSON.stringify(om));
    ws.send(JSON.stringify(pipeline.state(now())));
    ws.send(JSON.stringify(pipeline.names(now())));
    ws.send(JSON.stringify(status()));
    ws.on('message', (buf) => {
      if (role !== 'host') return;
      let msg: HostMessage;
      try {
        msg = JSON.parse(buf.toString()) as HostMessage;
      } catch {
        return;
      }
      handleHost(msg);
    });
  });

  function handleHost(msg: HostMessage): void {
    const t = now();
    if (msg.kind === 'simulate') {
      simulator.push(msg.event);
      return;
    }
    switch (msg.action) {
      case 'pause':
        pipeline.setPaused(true, t);
        break;
      case 'resume':
        pipeline.setPaused(false, t);
        break;
      case 'newStream':
        pipeline.newStream();
        log.info('new stream: per-stream limits reset');
        break;
      case 'resetTemple': {
        const p = opts.store.progress();
        opts.store.setProgress(startTemple(p.templeId, 0, opts.configs.temples, opts.configs.giftMap));
        opts.store.setProgress({ ...opts.store.progress(), stockpile: p.stockpile });
        opts.store.clearSlots(p.templeId);
        broadcast(pipeline.names(t));
        log.info('temple reset by host', { templeId: p.templeId });
        break;
      }
      case 'skipTo99': {
        const p = opts.store.progress();
        opts.store.setProgress({ ...p, progress: Math.floor(p.target * 0.99), completed: false });
        break;
      }
      case 'orders': {
        if (!orders || !opts.ordersFile) return;
        const change =
          msg.op === 'remove'
            ? { op: 'remove' as const, id: msg.id }
            : { op: 'add' as const, order: msg.order };
        const r = changeOrders(orders, change);
        if ('error' in r) {
          broadcast(ordersMsg(r.error)!);
          log.warn('royal order refused', { error: r.error });
          return;
        }
        orders = r.orders;
        writeFileSync(opts.ordersFile, ordersFileText(orders));
        broadcast(ordersMsg()!);
        log.info('royal orders changed', { op: msg.op, count: orders.list.length });
        return;
      }
      case 'kingdom':
        if (!['save', 'load', 'new'].includes(msg.op)) return;
        broadcast({ kind: 'command', name: 'kingdom', op: msg.op, difficulty: msg.difficulty, ts: t });
        log.info('kingdom control', { op: msg.op, difficulty: msg.difficulty });
        return;
      case 'safeZones':
        broadcast({ kind: 'command', name: 'safeZones', on: msg.on, ts: t });
        return;
      case 'setMode':
        if (!GAME_MODES.includes(msg.mode)) return;
        pipeline.setMode(msg.mode);
        log.info('mode changed by host', { mode: msg.mode });
        break;
      case 'removeName':
        opts.store.removeName(msg.userId, opts.configs.giftMap.names.fallbackKm);
        broadcast(pipeline.names(t));
        log.info('name removed on request', { userId: msg.userId });
        break;
    }
    pipeline.markDirty();
  }

  const timer = setInterval(() => pipeline.tick(now()), opts.tickMs ?? 50);
  const statusTimer = setInterval(() => broadcast(status()), 2000);

  return {
    server,
    pipeline,
    simulator,
    listen: (port) =>
      new Promise((resolve) => {
        server.listen(port, () => {
          void source.start();
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      }),
    close: async () => {
      clearInterval(timer);
      clearInterval(statusTimer);
      await source.stop();
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
      opts.store.flush();
    },
  };
}
