import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigs, type BridgeMessage } from '@temples/shared';
import { Pipeline } from './pipeline';
import { SqliteStore } from './sqliteStore';
import { MemoryStore, type WorldStore } from './store';

const configs = loadConfigs();
const T0 = new Date('2026-09-28T20:00:00').getTime();
const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'temples-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Play the same stream into any store. */
function playStream(store: WorldStore): Pipeline {
  const out: BridgeMessage[] = [];
  const p = new Pipeline(configs, store, [], (m) => out.push(m));
  let i = 0;
  const e = (type: string, u: [string, string], extra: Record<string, unknown> = {}) =>
    p.enqueue({
      id: `s${++i}`,
      type,
      user: { id: u[0], name: u[1], handle: u[0] },
      ts: T0,
      count: 1,
      ...extra,
    });
  e('comment', ['u1', 'Dara'], { text: '2' });
  e('gift', ['u1', 'Dara'], { giftName: 'Doughnut', giftCoins: 30 });
  e('gift', ['u2', 'សុខា'], { giftName: 'Lion', giftCoins: 29999 });
  e('follow', ['u3', 'Pich']);
  e('like', ['u3', 'Pich'], { count: 40 });
  e('share', ['u4', 'Bopha']);
  p.tick(T0 + 50);
  p.tick(T0 + 2100);
  return p;
}

describe.each([
  ['memory', () => new MemoryStore(configs) as WorldStore],
  ['sqlite', () => new SqliteStore(':memory:', configs, { flushMs: 0 }) as WorldStore],
])('%s store behaves the same', (_name, make) => {
  it('progress, leaderboard, guilds, likes', () => {
    const store = make();
    playStream(store);
    expect(store.progress()).toMatchObject({ templeId: 'preah-ko', progress: 150 + 450 + 20 + 40 + 10 });
    expect(store.progress().stockpile).toBe(29999 * 5 - 450);
    const day = '2026-09-28';
    expect(store.top('temple', 5, day).map((b) => [b.name, b.units])).toEqual([
      ['សុខា', 149995],
      ['Dara', 150],
      ['Pich', 60],
      ['Bopha', 10],
    ]);
    expect(store.top('today', 1, day)[0]?.rankEn).toBe('Royal Architect');
    expect(store.guildTotals('preah-ko')['2']).toBe(150);
    expect(store.likes(day)).toBe(40);
    expect(store.lifetimeUnits('u1')).toBe(150);
    expect(store.guildOf('u1')).toBe('2');
    store.close();
  });

  it('removeName replaces a viewer’s name everywhere', () => {
    const store = make();
    playStream(store);
    store.removeName('u1', 'អ្នកសាងសង់');
    expect(store.top('temple', 5, '2026-09-28').find((b) => b.userId === 'u1')?.name).toBe('អ្នកសាងសង់');
    store.close();
  });
});

describe('AC-16: saved world survives a restart', () => {
  it('restores progress, stockpile, names, stones, ranks and guilds exactly', () => {
    const file = join(tmp(), 'temples.db');
    const a = new SqliteStore(file, configs, { flushMs: 0 });
    const p = playStream(a);
    const before = p.state(T0 + 3000);
    const stonesBefore = a.stonesOf('u2');
    a.close();

    const b = new SqliteStore(file, configs, { flushMs: 0 });
    const p2 = new Pipeline(configs, b, [], () => {});
    const after = p2.state(T0 + 3000);
    expect(after).toEqual(before);
    expect(b.stonesOf('u2')).toEqual(stonesBefore);
    expect(b.stonesOf('u2')[0]).toMatchObject({ name: 'សុខា', tier: 'huge' });
    b.close();
  });

  it('the stockpile is kept (AC-07 persistence)', () => {
    const file = join(tmp(), 'temples.db');
    const a = new SqliteStore(file, configs, { flushMs: 0 });
    a.applyUnits(149995);
    a.close();
    const b = new SqliteStore(file, configs, { flushMs: 0 });
    expect(b.progress()).toMatchObject({ progress: 450, stockpile: 149545 });
    b.close();
  });

  it('settings such as the game mode survive a restart (AX-01)', () => {
    const file = join(tmp(), 'temples.db');
    const a = new SqliteStore(file, configs, { flushMs: 0 });
    expect(a.getMeta('mode')).toBeNull();
    a.setMeta('mode', 'expedition');
    a.setMeta('mode', 'build');
    a.setMeta('mode', 'expedition');
    a.close();
    const b = new SqliteStore(file, configs, { flushMs: 0 });
    expect(b.getMeta('mode')).toBe('expedition');
    expect(b.getMeta('schema_version')).not.toBeNull();
    b.close();
  });

  it('a new database starts the campaign at Preah Ko', () => {
    const s = new SqliteStore(join(tmp(), 'new.db'), configs, { flushMs: 0 });
    expect(s.progress()).toEqual({
      templeId: 'preah-ko',
      target: 3000,
      progress: 0,
      stockpile: 0,
      completed: false,
    });
    s.close();
  });

  it('writes are batched: nothing hits the disk until flush, then all at once', () => {
    const file = join(tmp(), 'temples.db');
    const a = new SqliteStore(file, configs, { flushMs: 0 });
    a.applyUnits(10);
    const reader = new SqliteStore(file, configs, { flushMs: 0 });
    expect(reader.progress().progress).toBe(0);
    reader.close();
    a.flush();
    const reader2 = new SqliteStore(file, configs, { flushMs: 0 });
    expect(reader2.progress().progress).toBe(10);
    reader2.close();
    a.close();
  });

  it('backup writes a full copy to data/backups', () => {
    const dir = tmp();
    const a = new SqliteStore(join(dir, 'temples.db'), configs, { flushMs: 0 });
    playStream(a);
    const file = a.backup(join(dir, 'backups'), T0);
    a.close();
    expect(existsSync(file)).toBe(true);
    expect(file).toMatch(/temples-2026-09-28-2000\.db$/);
    const again = new SqliteStore(join(dir, 'temples.db'), configs, { flushMs: 0 });
    expect(again.backup(join(dir, 'backups'), T0)).toMatch(/temples-2026-09-28-2000-2\.db$/);
    again.close();
    const copy = new SqliteStore(file, configs, { flushMs: 0 });
    expect(copy.progress().progress).toBe(670);
    copy.close();
  });

  it('the automatic flush timer commits on its own', async () => {
    const file = join(tmp(), 'temples.db');
    const a = new SqliteStore(file, configs, { flushMs: 20 });
    a.applyUnits(33);
    await new Promise((r) => setTimeout(r, 80));
    const reader = new SqliteStore(file, configs, { flushMs: 0 });
    expect(reader.progress().progress).toBe(33);
    reader.close();
    a.close();
    a.close(); // closing twice is safe
  });
});

describe('carved slots are saved (prompt 10)', () => {
  it('survive a restart and a reset clears them', () => {
    const file = join(tmp(), 'temples.db');
    const a = new SqliteStore(file, configs, { flushMs: 0 });
    playStream(a);
    const names = a.namedSlots('preah-ko', 100);
    expect(names.length).toBeGreaterThan(0);
    expect(a.bigUsed('preah-ko')).toBe(2); // Doughnut + Lion
    a.close();
    const b = new SqliteStore(file, configs, { flushMs: 0 });
    expect(b.namedSlots('preah-ko', 100)).toEqual(names);
    b.clearSlots('preah-ko');
    expect(b.namedSlots('preah-ko', 100)).toEqual([]);
    expect(b.bigUsed('preah-ko')).toBe(0);
    b.close();
  });

  it('an older saved world (schema 1) is upgraded without losing data', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const file = join(tmp(), 'old.db');
    const a = new SqliteStore(file, configs, { flushMs: 0 });
    a.applyUnits(42);
    a.close();
    const raw = new DatabaseSync(file);
    raw.exec(
      "DROP INDEX stones_slots; ALTER TABLE stones DROP COLUMN slot_kind; UPDATE meta SET value = '1' WHERE key = 'schema_version';",
    );
    raw.close();
    const b = new SqliteStore(file, configs, { flushMs: 0 });
    expect(b.progress().progress).toBe(42);
    expect(b.namedSlots('preah-ko', 10)).toEqual([]);
    b.close();
  });
});
