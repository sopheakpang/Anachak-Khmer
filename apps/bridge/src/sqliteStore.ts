import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  applyToTemple,
  rankFor,
  startTemple,
  type ApplyResult,
  type BuilderSummary,
  type Configs,
  type SlotRef,
  type TempleProgress,
  type TierName,
} from '@temples/shared';
import {
  dayKey,
  type Contribution,
  type Guild,
  type NamedSlot,
  type StoneRecord,
  type WorldStore,
} from './store';

const SCHEMA_VERSION = 2;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE builders (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, handle TEXT, lifetime INTEGER NOT NULL DEFAULT 0,
      guild TEXT, first_ts INTEGER NOT NULL, last_ts INTEGER NOT NULL
    );
    CREATE TABLE contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, builder_id TEXT NOT NULL, temple_id TEXT NOT NULL,
      day TEXT NOT NULL, units INTEGER NOT NULL, kind TEXT NOT NULL, ts INTEGER NOT NULL
    );
    CREATE INDEX contributions_temple ON contributions (temple_id, builder_id);
    CREATE INDEX contributions_day ON contributions (day, builder_id);
    CREATE TABLE stones (
      id INTEGER PRIMARY KEY AUTOINCREMENT, temple_id TEXT NOT NULL, builder_id TEXT, name TEXT,
      tier TEXT NOT NULL, stones INTEGER NOT NULL, units INTEGER NOT NULL, slot INTEGER, ts INTEGER NOT NULL
    );
    CREATE INDEX stones_builder ON stones (builder_id);
    CREATE TABLE campaign (
      id INTEGER PRIMARY KEY CHECK (id = 1), temple_id TEXT NOT NULL, target INTEGER NOT NULL,
      progress INTEGER NOT NULL, stockpile INTEGER NOT NULL, completed INTEGER NOT NULL
    );
    CREATE TABLE likes (day TEXT PRIMARY KEY, n INTEGER NOT NULL);
  `,
  // Prompt 10: which carved slot a named stone took ('normal' block or 'big' piece).
  2: `
    ALTER TABLE stones ADD COLUMN slot_kind TEXT;
    CREATE INDEX stones_slots ON stones (temple_id, slot_kind);
  `,
};

type Write = () => void;

/**
 * The saved world (prompt 05, AC-16): data/temples.db.
 * Writes are queued and committed together every 500 ms (one transaction), so a burst of
 * gifts doesn't hit the disk hundreds of times. Every read flushes first, so reads are exact.
 */
export class SqliteStore implements WorldStore {
  private readonly db: DatabaseSync;
  private pending: Write[] = [];
  private state: TempleProgress;
  private timer: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(
    private readonly path: string,
    private readonly configs: Configs,
    opts: { flushMs?: number } = {},
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.migrate();
    const row = this.db.prepare('SELECT * FROM campaign WHERE id = 1').get() as
      | { temple_id: string; target: number; progress: number; stockpile: number; completed: number }
      | undefined;
    if (row) {
      this.state = {
        templeId: row.temple_id,
        target: row.target,
        progress: row.progress,
        stockpile: row.stockpile,
        completed: row.completed === 1,
      };
    } else {
      this.state = startTemple(configs.temples.temples[0]!.id, 0, configs.temples, configs.giftMap);
      this.saveCampaign();
      this.flush();
    }
    const ms = opts.flushMs ?? 500;
    if (ms > 0) this.timer = setInterval(() => this.flush(), ms);
    this.timer?.unref();
  }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      { value: string } | undefined;
    let v = row ? Number(row.value) : 0;
    while (v < SCHEMA_VERSION) {
      v++;
      this.db.exec('BEGIN');
      this.db.exec(MIGRATIONS[v]!);
      this.db
        .prepare(
          "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(v));
      this.db.exec('COMMIT');
    }
  }

  private queue(w: Write): void {
    this.pending.push(w);
  }

  private saveCampaign(): void {
    const s = this.state;
    this.queue(() =>
      this.db
        .prepare(
          `INSERT INTO campaign (id, temple_id, target, progress, stockpile, completed) VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET temple_id = excluded.temple_id, target = excluded.target,
           progress = excluded.progress, stockpile = excluded.stockpile, completed = excluded.completed`,
        )
        .run(s.templeId, s.target, s.progress, s.stockpile, s.completed ? 1 : 0),
    );
  }

  getMeta(key: string): string | null {
    this.flush();
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.queue(() =>
      this.db
        .prepare(
          'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .run(key, value),
    );
  }

  flush(): void {
    if (this.pending.length === 0 || this.closed) return;
    const writes = this.pending;
    this.pending = [];
    this.db.exec('BEGIN');
    try {
      for (const w of writes) w();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  progress(): TempleProgress {
    return this.state;
  }

  applyUnits(units: number): ApplyResult {
    const r = applyToTemple(this.state, units, this.configs.giftMap);
    this.state = r.state;
    if (r.applied || r.toStockpile) this.saveCampaign();
    return r;
  }

  setProgress(p: TempleProgress): void {
    this.state = p;
    this.saveCampaign();
  }

  addContribution(c: Contribution): void {
    const templeId = this.state.templeId;
    this.queue(() => {
      this.db
        .prepare(
          `INSERT INTO builders (id, name, handle, lifetime, first_ts, last_ts) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, handle = COALESCE(excluded.handle, handle),
           lifetime = lifetime + excluded.lifetime, last_ts = excluded.last_ts`,
        )
        .run(c.userId, c.name, c.handle ?? null, c.units, c.ts, c.ts);
      this.db
        .prepare(
          'INSERT INTO contributions (builder_id, temple_id, day, units, kind, ts) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(c.userId, templeId, dayKey(c.ts), c.units, c.kind, c.ts);
    });
  }

  addStone(s: StoneRecord): void {
    this.queue(() =>
      this.db
        .prepare(
          `INSERT INTO stones (temple_id, builder_id, name, tier, stones, units, slot_kind, slot, ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          s.templeId,
          s.userId,
          s.name,
          s.tier,
          s.stones,
          s.units,
          s.slot?.kind ?? null,
          s.slot?.index ?? null,
          s.ts,
        ),
    );
  }

  bigUsed(templeId: string): number {
    this.flush();
    const r = this.db
      .prepare("SELECT COUNT(*) AS n FROM stones WHERE temple_id = ? AND slot_kind = 'big'")
      .get(templeId) as { n: number };
    return r.n;
  }

  namedSlots(templeId: string, limit: number): NamedSlot[] {
    this.flush();
    const rows = this.db
      .prepare(
        `SELECT slot_kind, slot, name, tier, builder_id FROM stones
         WHERE temple_id = ? AND slot_kind IS NOT NULL AND builder_id IS NOT NULL AND name IS NOT NULL
         ORDER BY id DESC LIMIT ?`,
      )
      .all(templeId, limit) as Array<{
      slot_kind: SlotRef['kind'];
      slot: number;
      name: string;
      tier: TierName;
      builder_id: string;
    }>;
    return rows.reverse().map((r) => ({
      slot: { kind: r.slot_kind, index: r.slot },
      name: r.name,
      tier: r.tier,
      userId: r.builder_id,
    }));
  }

  clearSlots(templeId: string): void {
    this.queue(() =>
      this.db.prepare('UPDATE stones SET slot = NULL, slot_kind = NULL WHERE temple_id = ?').run(templeId),
    );
    this.flush();
  }

  setGuild(userId: string, guild: Guild): void {
    const now = Date.now();
    this.queue(() =>
      this.db
        .prepare(
          `INSERT INTO builders (id, name, guild, first_ts, last_ts) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET guild = excluded.guild`,
        )
        .run(userId, userId, guild, now, now),
    );
  }

  guildOf(userId: string): Guild | null {
    this.flush();
    const r = this.db.prepare('SELECT guild FROM builders WHERE id = ?').get(userId) as
      { guild: Guild | null } | undefined;
    return r?.guild ?? null;
  }

  lifetimeUnits(userId: string): number {
    this.flush();
    const r = this.db.prepare('SELECT lifetime FROM builders WHERE id = ?').get(userId) as
      { lifetime: number } | undefined;
    return r?.lifetime ?? 0;
  }

  top(scope: 'temple' | 'today', n: number, day: string): BuilderSummary[] {
    this.flush();
    const where = scope === 'temple' ? 'c.temple_id = ?' : 'c.day = ?';
    const rows = this.db
      .prepare(
        `SELECT c.builder_id AS id, SUM(c.units) AS units, b.name AS name, b.lifetime AS lifetime, b.guild AS guild
         FROM contributions c JOIN builders b ON b.id = c.builder_id
         WHERE ${where} GROUP BY c.builder_id HAVING units > 0 ORDER BY units DESC, c.builder_id ASC LIMIT ?`,
      )
      .all(scope === 'temple' ? this.state.templeId : day, n) as Array<{
      id: string;
      units: number;
      name: string;
      lifetime: number;
      guild: Guild | null;
    }>;
    return rows.map((r) => {
      const rank = rankFor(r.lifetime, this.configs.giftMap);
      return {
        userId: r.id,
        name: r.name,
        units: r.units,
        rankKm: rank.km,
        rankEn: rank.en,
        guild: r.guild ?? null,
      };
    });
  }

  guildTotals(templeId: string): Record<Guild, number> {
    this.flush();
    const out: Record<Guild, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
    const rows = this.db
      .prepare(
        `SELECT b.guild AS guild, SUM(c.units) AS units FROM contributions c JOIN builders b ON b.id = c.builder_id
         WHERE c.temple_id = ? AND b.guild IS NOT NULL GROUP BY b.guild`,
      )
      .all(templeId) as Array<{ guild: Guild; units: number }>;
    for (const r of rows) out[r.guild] = r.units;
    return out;
  }

  addLikes(day: string, n: number): void {
    this.queue(() =>
      this.db
        .prepare('INSERT INTO likes (day, n) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET n = n + excluded.n')
        .run(day, n),
    );
  }

  likes(day: string): number {
    this.flush();
    const r = this.db.prepare('SELECT n FROM likes WHERE day = ?').get(day) as { n: number } | undefined;
    return r?.n ?? 0;
  }

  removeName(userId: string, fallback: string): void {
    this.queue(() => {
      this.db.prepare('UPDATE builders SET name = ?, handle = NULL WHERE id = ?').run(fallback, userId);
      this.db.prepare('UPDATE stones SET name = ? WHERE builder_id = ?').run(fallback, userId);
    });
    this.flush();
  }

  /** Names carved on stones by a viewer (used by "find my stone" and tests). */
  stonesOf(userId: string): Array<{ name: string | null; tier: string; units: number }> {
    this.flush();
    return this.db
      .prepare('SELECT name, tier, units FROM stones WHERE builder_id = ? ORDER BY units DESC, id ASC')
      .all(userId) as Array<{ name: string | null; tier: string; units: number }>;
  }

  /** Copy the whole world to data/backups/temples-<date>.db (safe while open). */
  backup(dir: string, now = Date.now()): string {
    this.flush();
    mkdirSync(dir, { recursive: true });
    const d = new Date(now);
    const stamp = `${dayKey(now)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    // VACUUM INTO refuses to overwrite, so a second backup in the same minute gets -2, -3, …
    let file = join(dir, `temples-${stamp}.db`);
    for (let i = 2; existsSync(file); i++) file = join(dir, `temples-${stamp}-${i}.db`);
    this.db.prepare('VACUUM INTO ?').run(file);
    return file;
  }

  close(): void {
    if (this.closed) return;
    clearInterval(this.timer);
    this.flush();
    this.closed = true;
    this.db.close();
  }
}
