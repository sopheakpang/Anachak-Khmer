import {
  applyToTemple,
  rankFor,
  startTemple,
  type ApplyResult,
  type BuilderSummary,
  type Configs,
  type TempleProgress,
  type SlotRef,
  type TierName,
} from '@temples/shared';

export type Guild = '1' | '2' | '3' | '4';

export interface Contribution {
  userId: string;
  name: string;
  handle?: string;
  units: number;
  kind: string;
  ts: number;
}

export interface StoneRecord {
  templeId: string;
  userId: string | null;
  name: string | null;
  tier: TierName;
  stones: number;
  units: number;
  slot: SlotRef | null;
  ts: number;
}

export interface NamedSlot {
  slot: SlotRef;
  name: string;
  tier: TierName;
  userId: string;
}

/**
 * Everything the bridge remembers. MemoryStore (tests, prompt 04) and SqliteStore
 * (prompt 05, saved across streams) both implement this.
 */
export interface WorldStore {
  progress(): TempleProgress;
  applyUnits(units: number): ApplyResult;
  setProgress(p: TempleProgress): void;
  addContribution(c: Contribution): void;
  addStone(s: StoneRecord): void;
  /** How many big pieces of this temple already carry a name. */
  bigUsed(templeId: string): number;
  /** Carved names on a temple, oldest first (at most `limit`, newest kept). */
  namedSlots(templeId: string, limit: number): NamedSlot[];
  /** Forget carvings on a temple (used when the host resets it). */
  clearSlots(templeId: string): void;
  setGuild(userId: string, guild: Guild): void;
  guildOf(userId: string): Guild | null;
  lifetimeUnits(userId: string): number;
  top(scope: 'temple' | 'today', n: number, day: string): BuilderSummary[];
  guildTotals(templeId: string): Record<Guild, number>;
  addLikes(day: string, n: number): void;
  likes(day: string): number;
  removeName(userId: string, fallback: string): void;
  /** Small settings kept across restarts (e.g. the game mode). */
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  flush(): void;
  close(): void;
}

/** Local calendar day, e.g. "2026-09-28" (the stream PC's own time zone). */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface MemBuilder {
  name: string;
  handle?: string;
  lifetime: number;
  guild: Guild | null;
}

export class MemoryStore implements WorldStore {
  private state: TempleProgress;
  private builders = new Map<string, MemBuilder>();
  private contributions: Array<Contribution & { templeId: string; day: string }> = [];
  readonly stones: StoneRecord[] = [];
  private likeDays = new Map<string, number>();

  constructor(private readonly configs: Configs) {
    this.state = startTemple(configs.temples.temples[0]!.id, 0, configs.temples, configs.giftMap);
  }

  progress(): TempleProgress {
    return this.state;
  }
  applyUnits(units: number): ApplyResult {
    const r = applyToTemple(this.state, units, this.configs.giftMap);
    this.state = r.state;
    return r;
  }
  setProgress(p: TempleProgress): void {
    this.state = p;
  }
  addContribution(c: Contribution): void {
    const b = this.builders.get(c.userId) ?? { name: c.name, lifetime: 0, guild: null };
    b.name = c.name;
    if (c.handle) b.handle = c.handle;
    b.lifetime += c.units;
    this.builders.set(c.userId, b);
    this.contributions.push({ ...c, templeId: this.state.templeId, day: dayKey(c.ts) });
  }
  addStone(s: StoneRecord): void {
    this.stones.push(s);
  }
  bigUsed(templeId: string): number {
    return this.stones.filter((s) => s.templeId === templeId && s.slot?.kind === 'big').length;
  }
  clearSlots(templeId: string): void {
    for (const s of this.stones) if (s.templeId === templeId) s.slot = null;
  }
  namedSlots(templeId: string, limit: number): NamedSlot[] {
    return this.stones
      .filter((s) => s.templeId === templeId && s.slot && s.userId && s.name)
      .slice(-limit)
      .map((s) => ({ slot: s.slot!, name: s.name!, tier: s.tier, userId: s.userId! }));
  }
  setGuild(userId: string, guild: Guild): void {
    const b = this.builders.get(userId) ?? { name: userId, lifetime: 0, guild: null };
    b.guild = guild;
    this.builders.set(userId, b);
  }
  guildOf(userId: string): Guild | null {
    return this.builders.get(userId)?.guild ?? null;
  }
  lifetimeUnits(userId: string): number {
    return this.builders.get(userId)?.lifetime ?? 0;
  }
  top(scope: 'temple' | 'today', n: number, day: string): BuilderSummary[] {
    const sums = new Map<string, number>();
    for (const c of this.contributions) {
      if (scope === 'temple' ? c.templeId !== this.state.templeId : c.day !== day) continue;
      sums.set(c.userId, (sums.get(c.userId) ?? 0) + c.units);
    }
    return [...sums.entries()]
      .filter(([, u]) => u > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([userId, units]) => this.summary(userId, units));
  }
  guildTotals(templeId: string): Record<Guild, number> {
    const out: Record<Guild, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
    for (const c of this.contributions) {
      if (c.templeId !== templeId) continue;
      const g = this.builders.get(c.userId)?.guild;
      if (g) out[g] += c.units;
    }
    return out;
  }
  addLikes(day: string, n: number): void {
    this.likeDays.set(day, (this.likeDays.get(day) ?? 0) + n);
  }
  likes(day: string): number {
    return this.likeDays.get(day) ?? 0;
  }
  removeName(userId: string, fallback: string): void {
    const b = this.builders.get(userId);
    if (b) b.name = fallback;
    for (const c of this.contributions) if (c.userId === userId) c.name = fallback;
    for (const s of this.stones) if (s.userId === userId) s.name = fallback;
  }
  private meta = new Map<string, string>();
  getMeta(key: string): string | null {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
  }
  flush(): void {}
  close(): void {}

  private summary(userId: string, units: number): BuilderSummary {
    const b = this.builders.get(userId);
    const r = rankFor(b?.lifetime ?? 0, this.configs.giftMap);
    return { userId, name: b?.name ?? userId, units, rankKm: r.km, rankEn: r.en, guild: b?.guild ?? null };
  }
}
