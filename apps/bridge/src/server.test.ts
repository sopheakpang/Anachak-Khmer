import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { loadConfigs, type BridgeMessage } from '@temples/shared';
import { createBridge, type Bridge } from './server';
import { MemoryStore } from './store';

const configs = loadConfigs();
let bridge: Bridge;
let port = 0;

beforeAll(async () => {
  bridge = createBridge({ configs, store: new MemoryStore(configs), blocklist: [], tickMs: 20 });
  port = await bridge.listen(0);
});
afterAll(() => bridge.close());

function connect(role: 'game' | 'host'): Promise<{ ws: WebSocket; messages: BridgeMessage[] }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/?role=${role}`);
    const messages: BridgeMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString()) as BridgeMessage));
    ws.on('open', () => resolve({ ws, messages }));
  });
}
const until = async (fn: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('bridge server', () => {
  it('answers /health', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(await res.json()).toMatchObject({ ok: true, name: 'The Temples', source: 'simulator' });
    expect((await fetch(`http://localhost:${port}/nope`)).status).toBe(404);
  });

  it('sends state and status on connect', async () => {
    const game = await connect('game');
    await until(() => game.messages.length >= 3);
    expect(game.messages.map((m) => m.kind)).toEqual(['state', 'names', 'status']);
    game.ws.close();
  });

  it('AC-01 end to end: host simulates a 30-coin gift, game gets a Large stone in < 200 ms', async () => {
    const game = await connect('game');
    const host = await connect('host');
    const sent = Date.now();
    host.ws.send(
      JSON.stringify({
        kind: 'simulate',
        event: {
          id: 'net-1',
          type: 'gift',
          giftName: 'Doughnut',
          giftCoins: 30,
          user: { id: 'u9', name: 'Vannak' },
          ts: sent,
        },
      }),
    );
    await until(() => game.messages.some((m) => m.kind === 'stone'));
    const elapsed = Date.now() - sent;
    expect(game.messages.find((m) => m.kind === 'stone')).toMatchObject({
      tier: 'large',
      units: 150,
      name: 'Vannak',
    });
    expect(elapsed).toBeLessThan(200);
    game.ws.close();
    host.ws.close();
  });

  it('ignores simulate messages from game clients', async () => {
    const game = await connect('game');
    const before = bridge.pipeline.queueLength;
    game.ws.send(
      JSON.stringify({
        kind: 'simulate',
        event: { id: 'bad', type: 'gift', giftCoins: 1, user: { id: 'x', name: 'x' }, ts: 1 },
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.pipeline.queueLength).toBe(before);
    game.ws.close();
  });

  it('host controls: pause, skip to 99%, safe zones', async () => {
    const game = await connect('game');
    const host = await connect('host');
    host.ws.send(JSON.stringify({ kind: 'control', action: 'pause' }));
    host.ws.send(JSON.stringify({ kind: 'control', action: 'skipTo99' }));
    host.ws.send(JSON.stringify({ kind: 'control', action: 'safeZones', on: true }));
    host.ws.send('not json');
    await until(() => game.messages.some((m) => m.kind === 'command' && m.name === 'safeZones'));
    expect(bridge.pipeline.paused).toBe(true);
    await until(() => game.messages.some((m) => m.kind === 'state' && m.temple.progress === 2970));
    host.ws.send(JSON.stringify({ kind: 'control', action: 'resetTemple' }));
    await until(() => game.messages.some((m) => m.kind === 'state' && m.temple.progress === 0));
    game.ws.close();
    host.ws.close();
  });

  it('AX-01: the host switches to Expedition and back; temple progress is kept', async () => {
    const game = await connect('game');
    const host = await connect('host');
    await until(() => game.messages.some((m) => m.kind === 'state'));
    const first = game.messages.find((m) => m.kind === 'state');
    expect(first && first.kind === 'state' && first.mode).toBe('build');
    const progress = bridge.pipeline.state(Date.now()).temple.progress;
    const sent = Date.now();
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'expedition' }));
    await until(() => game.messages.some((m) => m.kind === 'state' && m.mode === 'expedition'));
    expect(Date.now() - sent).toBeLessThan(2000);
    const exp = [...game.messages].reverse().find((m) => m.kind === 'state');
    expect(exp && exp.kind === 'state' && exp.temple.progress).toBe(progress);
    // Nonsense modes are ignored.
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'arena' }));
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'build' }));
    await until(() => bridge.pipeline.mode === 'build');
    // Game clients cannot change the mode.
    game.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'expedition' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.pipeline.mode).toBe('build');
    game.ws.close();
    host.ws.close();
  });

  it('hero votes (!1 !2 !3) reach the game only during an expedition', async () => {
    const game = await connect('game');
    const host = await connect('host');
    const vote = (text: string) =>
      host.ws.send(
        JSON.stringify({
          kind: 'simulate',
          event: {
            id: `v${Math.random()}`,
            type: 'comment',
            text,
            user: { id: 'u9', name: 'Sokha' },
            ts: Date.now(),
          },
        }),
      );
    vote('!2');
    await new Promise((r) => setTimeout(r, 80));
    expect(game.messages.some((m) => m.kind === 'command' && m.name === 'heroVote')).toBe(false);
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'expedition' }));
    await until(() => bridge.pipeline.mode === 'expedition');
    vote('!៣');
    await until(() => game.messages.some((m) => m.kind === 'command' && m.name === 'heroVote'));
    const v = game.messages.find((m) => m.kind === 'command' && m.name === 'heroVote');
    expect(v && v.kind === 'command' && v.choice).toBe(3);
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'build' }));
    await until(() => bridge.pipeline.mode === 'build');
    game.ws.close();
    host.ws.close();
  });

  it('KG: the host opens the Kingdom tab; council votes pass through; save/load/new reach the game', async () => {
    const game = await connect('game');
    const host = await connect('host');
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'kingdom' }));
    await until(() => game.messages.some((m) => m.kind === 'state' && m.mode === 'kingdom'));
    expect(bridge.pipeline.mode).toBe('kingdom');
    host.ws.send(
      JSON.stringify({
        kind: 'simulate',
        event: {
          id: `kv${Math.random()}`,
          type: 'comment',
          text: '!1',
          user: { id: 'u7', name: 'Dara' },
          ts: Date.now(),
        },
      }),
    );
    await until(() =>
      game.messages.some((m) => m.kind === 'command' && m.name === 'heroVote' && m.choice === 1),
    );
    host.ws.send(JSON.stringify({ kind: 'control', action: 'kingdom', op: 'new', difficulty: 'hard' }));
    await until(() =>
      game.messages.some((m) => m.kind === 'command' && m.name === 'kingdom' && m.op === 'new'),
    );
    const c = game.messages.find((m) => m.kind === 'command' && m.name === 'kingdom');
    expect(c && c.kind === 'command' && c.difficulty).toBe('hard');
    // Unknown operations are ignored.
    host.ws.send(JSON.stringify({ kind: 'control', action: 'kingdom', op: 'format-disk' }));
    await new Promise((r) => setTimeout(r, 60));
    expect(game.messages.filter((m) => m.kind === 'command' && m.name === 'kingdom').length).toBe(1);
    host.ws.send(JSON.stringify({ kind: 'control', action: 'setMode', mode: 'build' }));
    await until(() => bridge.pipeline.mode === 'build');
    game.ws.close();
    host.ws.close();
  });
});

describe('host panel files', () => {
  it('serves the built panel at /host/ and never outside it', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dist = mkdtempSync(join(tmpdir(), 'host-'));
    writeFileSync(join(dist, 'index.html'), '<title>Host</title>');
    const b = createBridge({ configs, store: new MemoryStore(configs), blocklist: [], hostDist: dist });
    const p = await b.listen(0);
    const get = (path: string) => fetch(`http://localhost:${p}${path}`, { redirect: 'manual' });
    expect((await get('/host')).status).toBe(301);
    const page = await get('/host/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('Host');
    expect((await get('/host/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
    expect((await get('/host/missing.js')).status).toBe(404);
    await b.close();
    rmSync(dist, { recursive: true, force: true });
  });

  it('explains when the panel is not built', async () => {
    const b = createBridge({ configs, store: new MemoryStore(configs), blocklist: [], hostDist: '/nope' });
    const p = await b.listen(0);
    const res = await fetch(`http://localhost:${p}/host/`);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain('npm run build');
    await b.close();
  });
});
