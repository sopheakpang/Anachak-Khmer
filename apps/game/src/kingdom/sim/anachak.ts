import type { Cost, Resource } from '@temples/shared';
import { seasonalTwilight } from './sunPath';
import { PLAYER, RIVAL, type Animal, type Fail, type KingdomSim, type Result, type Unit } from './sim';
import { templeShortfall } from './decree';
import { currentCeremony } from './ceremony';
import { tileToWorld, type XZ } from './map';

/**
 * Anachak Khmer (PK's second Kingdom tab, D92): the king's levy (villagers become soldiers,
 * paying the army type's price), his order to fight, his overview of the kingdom, and the
 * royal roads' rest houses and caravans. Numbers are in config/kingdom/anachak.json.
 */

/** The army types the king can call villagers up as, and why one cannot be called now. */
export function levyChoices(sim: KingdomSim): Array<{ type: string; why: Fail | null }> {
  const L = sim.data.anachak.levy;
  return Object.values(sim.data.units)
    .filter((d) => L.roles.includes(d.role))
    .filter((d) => sim.allows('units', d.id))
    .map((d) => ({ type: d.id, why: canLevy(sim, d.id, 1) }));
}

/** Villagers who may be called up, in the order they go: idle, gatherers, builders, farmers. */
export function recruits(sim: KingdomSim): Unit[] {
  const keepFarmers = sim.data.anachak.levy.keepFarmers;
  const rank = (u: Unit): number => {
    const t = u.task;
    if (t.kind === 'idle') return 0;
    if (t.kind === 'gather' && t.field !== null) return keepFarmers ? -1 : 3;
    if (t.kind === 'gather' || t.kind === 'hunt') return 1;
    if (t.kind === 'build') return 2;
    return 1;
  };
  return [...sim.units.values()]
    .filter((u) => u.team === PLAYER && u.type === 'villager' && !u.manual && rank(u) >= 0)
    .sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

/** Why `n` villagers cannot become `type` now (null = they can). */
export function canLevy(sim: KingdomSim, type: string, n: number): Fail | null {
  const d = sim.data.units[type];
  if (!d || !sim.data.anachak.levy.roles.includes(d.role)) return 'unknown';
  if (!sim.allows('units', type)) return 'era';
  if (!d.requires.every((t) => sim.techs.has(t))) return 'requires';
  if (d.max !== undefined && sim.countOf(type) + n > d.max) return 'limit';
  if (recruits(sim).length < n) return 'pop';
  const cost: Cost = {};
  for (const [r, v] of Object.entries(d.cost)) cost[r as Resource] = (v ?? 0) * n;
  if (!sim.canAfford(cost)) return 'cost';
  const villager = sim.def('villager').pop;
  if (sim.popUsed() + (d.pop - villager) * n > sim.popCap()) return 'pop';
  return null;
}

/** Where recruits gather: south of the royal hall. */
export function rallyPoint(sim: KingdomSim): XZ {
  const h = [...sim.buildings.values()].find((b) => b.team === PLAYER && b.type === 'townCentre');
  if (!h) return [0, 0];
  const [cx, cz] = sim.center(h);
  return [cx, cz + (h.d / 2 + sim.data.anachak.levy.rallyTiles) * sim.map.tile];
}

/**
 * The king calls up to `n` villagers to arms as `type` (PK): each pays the type's full price
 * and takes its place in the houses; they keep their health share and bring home what they
 * carried, then gather at the rally point. Returns how many answered.
 */
export function levy(sim: KingdomSim, type: string, n: number): Result<number> {
  let done = 0;
  let why: Fail | null = null;
  const d = sim.def(type);
  const rally = rallyPoint(sim);
  for (const u of recruits(sim)) {
    if (done >= n) break;
    why = canLevy(sim, type, 1);
    if (why) break;
    sim.pay(d.cost);
    if (u.carry && u.carry.n >= 1) sim.res[PLAYER][u.carry.res] += Math.floor(u.carry.n);
    const share = u.hp / sim.def(u.type).hp;
    u.type = type;
    u.hp = Math.max(1, Math.round(d.hp * share));
    u.carry = null;
    u.idleSince = undefined;
    u.fleeUntil = undefined;
    u.afterFlee = undefined;
    if (type === 'commander') {
      const r = sim.commanderRank;
      u.name = r.names.length ? r.names[sim.commandersRaised % r.names.length]! : { km: r.km, en: r.en };
      sim.commandersRaised++;
    }
    const a = (done / Math.max(1, n)) * Math.PI * 2;
    const r = sim.data.anachak.levy.rallySpread;
    u.task = { kind: 'move', to: [rally[0] + Math.cos(a) * r, rally[1] + Math.sin(a) * r] };
    u.path = null;
    u.repathAt = 0;
    done++;
  }
  if (!done) return { ok: false, reason: why ?? 'pop' };
  sim.levied += done;
  sim.events.push({ kind: 'levy', unit: type, n: done, t: sim.time });
  return { ok: true, id: done };
}

/** The player's soldiers (not workers, carts, scouts, nor the one being played by hand). */
export function soldiers(sim: KingdomSim): Unit[] {
  const roles = sim.data.anachak.levy.roles;
  return [...sim.units.values()].filter(
    (u) => u.team === PLAYER && !u.manual && roles.includes(sim.def(u.type).role),
  );
}

/**
 * The king's order to fight (PK): every soldier marches, attacking on the way, to the nearest
 * enemy he knows of (raiders first, then a rival camp he has seen); with none, to the hall.
 */
export function battle(sim: KingdomSim): { to: XZ | null; n: number } {
  const army = soldiers(sim);
  const rally = rallyPoint(sim);
  const reach = sim.data.anachak.battle.searchTiles * sim.map.tile;
  let to: XZ | null = null;
  let bd = reach;
  for (const e of sim.units.values()) {
    if (e.team !== RIVAL) continue;
    const d = Math.hypot(e.x - rally[0], e.z - rally[1]);
    // Raiders only where they are seen now (no peeking through the fog); camps once explored.
    if (d < bd && sim.fog.visible[sim.tileIndex(e.x, e.z)]) {
      bd = d;
      to = [e.x, e.z];
    }
  }
  if (!to)
    for (const b of sim.buildings.values()) {
      if (b.team !== RIVAL) continue;
      const [x, z] = sim.center(b);
      const d = Math.hypot(x - rally[0], z - rally[1]);
      if (d < bd && sim.fog.explored[sim.tileIndex(x, z)]) {
        bd = d;
        to = [x, z];
      }
    }
  const ids = army.map((u) => u.id);
  if (ids.length) sim.cmdMove(ids, to ?? rally, true);
  sim.events.push({ kind: 'battle', to, n: ids.length, t: sim.time });
  return { to, n: ids.length };
}

/** Are the rest houses standing yet (from Jayavarman VII's era)? */
export function restsActive(sim: KingdomSim): boolean {
  const order = sim.data.eras.map((e) => e.id);
  return order.indexOf(sim.era.id) >= order.indexOf(sim.data.anachak.roads.restEra);
}

/** Once a second: rest houses heal travellers; caravans come in from found places. */
export function updateRoads(sim: KingdomSim): void {
  const R = sim.data.anachak.roads;
  const lay = sim.map.roads;
  if (!lay) return;
  if (restsActive(sim)) {
    const r = R.restRadiusTiles * sim.map.tile;
    for (const h of lay.rests) {
      const [hx, hz] = tileToWorld(sim.map, h.tx, h.tz);
      for (const u of sim.units.values()) {
        if (u.team !== PLAYER || Math.abs(u.x - hx) > r || Math.abs(u.z - hz) > r) continue;
        if (Math.hypot(u.x - hx, u.z - hz) < r) u.hp = Math.min(sim.def(u.type).hp, u.hp + R.restHealPerSec);
      }
    }
  }
  for (const rt of R.routes) {
    if (!sim.discovered.has(rt.dest)) continue;
    const at = sim.caravanAt[rt.id];
    if (at === undefined) {
      sim.caravanAt[rt.id] = sim.time + R.caravanSec;
      continue;
    }
    if (sim.time < at) continue;
    sim.caravanAt[rt.id] = sim.time + R.caravanSec;
    sim.addResources(rt.caravan);
    sim.events.push({ kind: 'caravan', route: rt.id, cost: rt.caravan, t: sim.time });
  }
}

/** Everything the king sees at a glance (PK: his overview from the circle menu). */
export interface Overview {
  res: Record<Resource, number>;
  pop: { used: number; cap: number };
  people: {
    total: number;
    idle: number;
    farming: number;
    gathering: Partial<Record<Resource, number>>;
    building: number;
    hunting: number;
    scouts: number;
  };
  soldiers: Record<string, number>;
  houses: number;
  stores: Record<string, number>;
  rising: Array<{ type: string; progress: number }>;
  queued: Array<{ at: string; id: string; left: number }>;
  temple: { id: string; progress: number; short: Partial<Record<Resource, number>> };
  decree: boolean;
  ceremony: string | null;
  prestige: number;
  levied: number;
  roads: { found: number; total: number; next: number | null };
}

export function overview(sim: KingdomSim): Overview {
  const people: Overview['people'] = {
    total: 0,
    idle: 0,
    farming: 0,
    gathering: {},
    building: 0,
    hunting: 0,
    scouts: 0,
  };
  const army: Record<string, number> = {};
  const roles = sim.data.anachak.levy.roles;
  for (const u of sim.units.values()) {
    if (u.team !== PLAYER) continue;
    const role = sim.def(u.type).role;
    if (roles.includes(role)) {
      army[u.type] = (army[u.type] ?? 0) + 1;
      continue;
    }
    if (role === 'scout') people.scouts++;
    if (role !== 'worker') continue;
    people.total++;
    const t = u.task;
    if (t.kind === 'idle') people.idle++;
    else if (t.kind === 'build') people.building++;
    else if (t.kind === 'hunt') people.hunting++;
    else if (t.kind === 'gather' && t.field !== null) people.farming++;
    else if (t.kind === 'gather') people.gathering[t.res] = (people.gathering[t.res] ?? 0) + 1;
  }
  let houses = 0;
  const stores: Record<string, number> = {};
  const rising: Overview['rising'] = [];
  const queued: Overview['queued'] = [];
  for (const b of sim.buildings.values()) {
    if (b.team !== PLAYER) continue;
    if (b.progress < 1) {
      rising.push({ type: b.type, progress: b.progress });
      continue;
    }
    if (b.type === 'house') houses++;
    if (sim.bdef(b.type).dropOff.length) stores[b.type] = (stores[b.type] ?? 0) + 1;
    for (const q of b.queue) queued.push({ at: b.type, id: q.id, left: q.left });
  }
  const t = sim.currentTemple();
  const R = sim.data.anachak.roads;
  const found = R.routes.filter((r) => sim.discovered.has(r.dest));
  const next = found.map((r) => sim.caravanAt[r.id]).filter((x): x is number => x !== undefined);
  return {
    res: { ...sim.res[PLAYER] },
    pop: { used: sim.popUsed(), cap: sim.popCap() },
    people,
    soldiers: army,
    houses,
    stores,
    rising: rising.sort((a, b) => b.progress - a.progress),
    queued,
    temple: { id: sim.chapterData.temple, progress: t?.progress ?? 0, short: templeShortfall(sim) },
    decree: sim.decree === 'temple',
    ceremony: currentCeremony(sim)?.id ?? null,
    prestige: sim.prestige,
    levied: sim.levied,
    roads: {
      found: found.length,
      total: R.routes.length,
      next: next.length ? Math.max(0, Math.min(...next) - sim.time) : null,
    },
  };
}

// ---------------------------------------------------------------- day and night (PK: fires at night)

/** How dark it is, 0 (day) .. 1 (full night), at sim time t: dusk and dawn ease in and out. */
export function nightness(t: number, N: KingdomSim['data']['anachak']['night']): number {
  const p = (((t / N.daySec) % 1) + 1) % 1;
  const ease = (a: number, b: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  // PK 1.8.0: the seasons move dusk and dawn (longer days in the wet season).
  const { dusk, dawn } = seasonalTwilight(t, N);
  return ease(dusk[0], dusk[1], p) * (1 - ease(dawn[0], dawn[1], p));
}

/** The rest houses' fires: a little glow by day, bright at night. */
export function fireGlow(night: number, N: KingdomSim['data']['anachak']['night']): number {
  return N.fire.day + (N.fire.night - N.fire.day) * night;
}

// ---------------------------------------------------------------- the tiger (PK: hero mode)

/**
 * A tiger comes out of the forest near the hero: placed on a forest tile `dist` metres away
 * (the nearest ring that has forest), stalking whoever is played (the sim's predator rules
 * chase a unit; the king is chased by the hero mode). Returns the tiger, or null when no tiger
 * can come here (no forest near, or a tiger already close).
 */
export function tigerEncounter(
  sim: KingdomSim,
  x: number,
  z: number,
  prey: number | null,
  rand: () => number = Math.random,
): Animal | null {
  const T = sim.data.anachak.tiger;
  const kind = sim.data.world.animals.kinds.find((k) => k.id === 'tiger');
  if (!kind) return null;
  for (const a of sim.animals.values())
    if (a.kind === 'tiger' && Math.hypot(a.x - x, a.z - z) < T.dist[1] * 1.5) return null;
  const start = rand() * Math.PI * 2;
  for (let r = T.dist[0]; r <= T.dist[1]; r += 2)
    for (let i = 0; i < 16; i++) {
      const ang = start + (i / 16) * Math.PI * 2;
      const ax = x + Math.sin(ang) * r;
      const az = z + Math.cos(ang) * r;
      const half = (sim.map.size * sim.map.tile) / 2;
      if (Math.abs(ax) >= half || Math.abs(az) >= half) continue;
      if (sim.map.terrain[sim.tileIndex(ax, az)] !== 'forest') continue;
      const a: Animal = {
        id: sim.nextId++,
        kind: 'tiger',
        x: ax,
        z: az,
        hp: kind.hp,
        heading: Math.atan2(x - ax, z - az),
        home: [x, z], // its leash is round the hero, so it does not give up at once
        target: null,
        fleeUntil: 0,
        fleeFrom: null,
        ready: sim.time + 1.5,
        moving: false,
        ...(prey !== null ? { prey } : {}),
      };
      sim.animals.set(a.id, a);
      return a;
    }
  return null;
}
