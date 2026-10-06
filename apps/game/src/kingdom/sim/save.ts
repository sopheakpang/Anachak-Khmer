import type { KingdomData } from '@temples/shared';
import { generateMap } from './map';
import type { MarketSave } from './market';
import { KingdomSim, type Animal, type Building, type Unit, type WeatherId } from './sim';

/**
 * Kingdom saves: versioned JSON with a checksum, three slots (autosave, quick, manual)
 * and rotating backups per slot. A save is written to a temporary key and checked before
 * the old one is moved into the backups, so a failed save never destroys the last good
 * one; loading falls back to the newest backup that is intact. Old versions are migrated.
 */

/**
 * v3: the Khmer Empire world (D60) with a random layout per game: the seed rebuilds the
 * resources, only the resources that changed are stored, plus animals, places found, the
 * weather and automation. v2 (Greater Angkor map) and v1 (v0.1 map) can't be carried over.
 */
export const SAVE_VERSION = 3;
export type Slot = 'autosave' | 'quick' | 'manual';

export interface SaveFile {
  version: number;
  scenario: string;
  difficulty: KingdomSim['difficulty'];
  savedAt: string;
  time: number;
  nextId: number;
  res: KingdomSim['res'];
  techs: string[];
  seed: number;
  /** Resources that differ from the generated world: [id, amount left]; amount -1 = gone. */
  nodes: Array<[number, number]>;
  /** Nodes made during play (meat from hunting): [id, kind, tx, tz, amount]. */
  extraNodes: Array<[number, string, number, number, number]>;
  animals: Animal[];
  discovered: string[];
  weather: { id: WeatherId; next: number };
  autoWork: boolean;
  /** Commanders raised (names go round) and resource patches watchmen reported (optional: older v3 files). */
  commandersRaised?: number;
  reported?: number[];
  buildings: Building[];
  units: Array<Omit<Unit, 'path' | 'repathAt'>>;
  explored: string;
  ai: KingdomSim['ai'];
  monumentDoneAt: number;
  outcome: KingdomSim['outcome'];
  chapter: number;
  completed: string[];
  /** Game time the chapter began (the in-game calendar); older saves start the year anew. */
  chapterStart?: number;
  /** The order board (Hay Day-style); older saves get fresh orders. */
  market?: MarketSave;
  /** PK: the king's decree, ceremonies and royal power (older saves start with none). */
  royal?: {
    decree: KingdomSim['decree'];
    ceremony: KingdomSim['ceremony'];
    ceremonyAt: number;
    ceremoniesHeld: number;
    prestige: number;
  };
  /** Anachak Khmer (D92): the world with royal roads, caravans' clocks, people called to arms. */
  variant?: 'kingdom' | 'anachak';
  roads?: { caravanAt: Record<string, number>; levied: number };
  /** The market's prices and the total traded (Anachak Khmer). */
  exchange?: { prices: Record<string, number>; traded: number };
}

/** Run-length code for the explored fog (mostly long runs of 0s and 1s). */
function rle(bits: Uint8Array): string {
  const out: number[] = [];
  let cur = 0;
  let n = 0;
  for (const b of bits) {
    if (b === cur) n++;
    else {
      out.push(n);
      cur = b;
      n = 1;
    }
  }
  out.push(n);
  return out.join(',');
}

function unrle(s: string, into: Uint8Array): void {
  let i = 0;
  let cur = 0;
  for (const part of s.split(',')) {
    const n = Number(part);
    into.fill(cur, i, Math.min(into.length, i + n));
    i += n;
    cur ^= 1;
  }
}

export function serialize(sim: KingdomSim): SaveFile {
  return {
    version: SAVE_VERSION,
    scenario: sim.data.rules.scenario.id,
    difficulty: sim.difficulty,
    savedAt: new Date().toISOString(),
    time: sim.time,
    nextId: sim.nextId,
    res: [{ ...sim.res[0] }, { ...sim.res[1] }],
    techs: [...sim.techs],
    seed: sim.seed,
    nodes: changedNodes(sim),
    extraNodes: [...sim.nodes.values()]
      .filter((n) => n.id > sim.map.nodes.length)
      .map((n) => [n.id, n.kind, n.tx, n.tz, n.amount]),
    animals: [...sim.animals.values()].map((a) => ({ ...a })),
    discovered: [...sim.discovered],
    weather: { ...sim.weather },
    autoWork: sim.autoWork,
    commandersRaised: sim.commandersRaised,
    reported: [...sim.reported],
    buildings: [...sim.buildings.values()].map((b) => ({ ...b, queue: b.queue.map((q) => ({ ...q })) })),
    units: [...sim.units.values()].map(({ path: _p, repathAt: _r, ...u }) => ({
      ...u,
      task: structuredClone(u.task),
    })),
    explored: rle(sim.fog.explored),
    ai: { ...sim.ai },
    monumentDoneAt: sim.monumentDoneAt,
    outcome: sim.outcome,
    chapter: sim.chapter,
    completed: [...sim.completed],
    chapterStart: sim.chapterStart,
    market: sim.market.save(),
    royal: {
      decree: sim.decree,
      ceremony: sim.ceremony ? { ...sim.ceremony } : null,
      ceremonyAt: sim.ceremonyAt,
      ceremoniesHeld: sim.ceremoniesHeld,
      prestige: sim.prestige,
    },
    variant: sim.variant,
    roads: { caravanAt: { ...sim.caravanAt }, levied: sim.levied },
    exchange: { prices: { ...sim.prices }, traded: sim.traded },
  };
}

/** Bring an older save up to the current version (fields added later get defaults). */
export function migrate(raw: Partial<SaveFile> & { version?: number }): SaveFile {
  const f = { ...raw } as SaveFile;
  if (!f.version || f.version < 1) throw new Error('not a Khmer Kingdoms save');
  if (f.version > SAVE_VERSION) throw new Error(`save is from a newer game (v${f.version})`);
  // v1 saves were made on the small v0.1 map; they cannot be placed on the campaign map.
  if (f.version < 2) throw new Error('save is from Khmer Kingdoms v0.1 (old map); start the campaign anew');
  if (f.version < 3)
    throw new Error('save is from the Greater Angkor map (before the empire world); start the campaign anew');
  f.chapter ??= 0;
  f.completed ??= [];
  f.monumentDoneAt ??= -1;
  f.outcome ??= null;
  return f;
}

export function restore(data: KingdomData, raw: unknown): KingdomSim {
  const f = migrate(raw as SaveFile);
  if (f.scenario !== data.rules.scenario.id) throw new Error(`save is for scenario ${f.scenario}`);
  const sim = new KingdomSim(data, f.difficulty, false, f.seed, f.variant ?? 'kingdom');
  sim.time = f.time;
  sim.setChapter(Math.min(f.chapter, data.campaign.chapters.length));
  sim.completed.push(...f.completed);
  sim.chapterStart = f.chapterStart ?? f.time;
  sim.nextId = f.nextId;
  sim.res[0] = { ...f.res[0] };
  sim.res[1] = { ...f.res[1] };
  for (const t of f.techs) sim.techs.add(t);
  // Resources: the seed rebuilt the world; apply what changed (cut trees and emptied rocks
  // are gone and walkable again).
  for (const [id, amount] of f.nodes) {
    const n = sim.nodes.get(id);
    if (!n) continue;
    if (amount < 0) {
      sim.nodes.delete(id);
      if (n.kind === 'tree' || n.kind === 'stone' || n.kind === 'gold' || n.kind === 'gems')
        sim.grid.setRect(n.tx, n.tz, 1, 1, true);
    } else n.amount = amount;
  }
  for (const [id, kind, tx, tz, amount] of f.extraNodes)
    sim.nodes.set(id, { id, kind: kind as 'meat', tx, tz, amount });
  for (const a of f.animals) sim.animals.set(a.id, { ...a });
  for (const p of f.discovered) sim.discovered.add(p);
  sim.weather = { ...f.weather };
  sim.autoWork = f.autoWork;
  sim.commandersRaised = f.commandersRaised ?? 0;
  for (const id of f.reported ?? []) sim.reported.add(id);
  for (const b of f.buildings) {
    sim.buildings.set(b.id, { ...b, queue: b.queue.map((q) => ({ ...q })) });
    if (b.type !== 'riceField') sim.grid.setRect(b.tx, b.tz, b.w, b.d, false);
  }
  for (const u of f.units)
    sim.units.set(u.id, { ...u, task: structuredClone(u.task), path: null, repathAt: 0 });
  unrle(f.explored, sim.fog.explored);
  Object.assign(sim.ai, f.ai);
  sim.monumentDoneAt = f.monumentDoneAt;
  sim.outcome = f.outcome;
  if (f.market) sim.market.load(f.market);
  if (f.royal)
    Object.assign(sim, { ...f.royal, ceremony: f.royal.ceremony ? { ...f.royal.ceremony } : null });
  if (f.roads) {
    sim.caravanAt = { ...f.roads.caravanAt };
    sim.levied = f.roads.levied;
  }
  if (f.exchange) {
    for (const r of ['food', 'wood', 'stone', 'gold'] as const)
      if (Number.isFinite(f.exchange.prices[r])) sim.prices[r] = f.exchange.prices[r]!;
    sim.traded = f.exchange.traded;
  }
  // A unit played by hand when the game was saved goes back to the AI.
  for (const u of sim.units.values()) u.manual = undefined;
  sim.updateFog();
  return sim;
}

// ---------------------------------------------------------------- slots and backups

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Browser storage wrapped so a blocked or full storage never breaks the game. */
export function browserStorage(): KeyValue {
  const mem = new Map<string, string>();
  const ls = (() => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  })();
  return {
    get: (k) => {
      try {
        return ls ? ls.getItem(k) : (mem.get(k) ?? null);
      } catch {
        return mem.get(k) ?? null;
      }
    },
    set: (k, v) => {
      try {
        if (ls) ls.setItem(k, v);
        else mem.set(k, v);
      } catch {
        mem.set(k, v);
      }
    },
    remove: (k) => {
      try {
        ls?.removeItem(k);
      } catch {
        /* ignore */
      }
      mem.delete(k);
    },
  };
}

/** FNV-1a hash as hex: enough to spot a truncated or edited save. */
function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface SlotInfo {
  slot: Slot;
  savedAt: string;
  time: number;
}

export class SaveStore {
  constructor(
    private readonly kv: KeyValue,
    private readonly backups = 3,
    private readonly prefix = 'kingdom.',
  ) {}

  private key(slot: Slot, n = 0): string {
    return `${this.prefix}${slot}${n ? `.bak${n}` : ''}`;
  }

  private pack(file: SaveFile): string {
    const body = JSON.stringify(file);
    return JSON.stringify({ sum: checksum(body), body });
  }

  private unpack(s: string | null): SaveFile | null {
    if (!s) return null;
    try {
      const { sum, body } = JSON.parse(s) as { sum: string; body: string };
      if (checksum(body) !== sum) return null;
      return migrate(JSON.parse(body) as SaveFile);
    } catch {
      return null;
    }
  }

  /** Save; the previous save becomes backup 1 (older ones shift down). */
  save(slot: Slot, sim: KingdomSim): boolean {
    const packed = this.pack(serialize(sim));
    const tmp = `${this.key(slot)}.tmp`;
    this.kv.set(tmp, packed);
    if (this.kv.get(tmp) !== packed || !this.unpack(packed)) {
      this.kv.remove(tmp);
      return false; // the old save is untouched
    }
    for (let n = this.backups; n >= 1; n--) {
      const from = this.kv.get(this.key(slot, n - 1));
      if (from) this.kv.set(this.key(slot, n), from);
    }
    this.kv.set(this.key(slot), packed);
    this.kv.remove(tmp);
    return true;
  }

  /** The newest intact save of a slot (falls back to backups). `recovered` = a backup was used. */
  load(slot: Slot, data: KingdomData): { sim: KingdomSim; recovered: boolean } | null {
    for (let n = 0; n <= this.backups; n++) {
      const f = this.unpack(this.kv.get(this.key(slot, n)));
      if (!f) continue;
      try {
        return { sim: restore(data, f), recovered: n > 0 };
      } catch {
        /* try the next backup */
      }
    }
    return null;
  }

  info(slot: Slot): SlotInfo | null {
    const f = this.unpack(this.kv.get(this.key(slot)));
    return f ? { slot, savedAt: f.savedAt, time: f.time } : null;
  }
}

/** Generated resources whose amount changed or that are gone (amount -1). */
function changedNodes(sim: KingdomSim): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const base = generateMap(sim.data, sim.seed).nodes;
  for (const n of base) {
    const now = sim.nodes.get(n.id);
    if (!now) out.push([n.id, -1]);
    else if (now.amount !== n.amount) out.push([n.id, Math.round(now.amount * 100) / 100]);
  }
  return out;
}
