import type { Anachak, HeroKit, Resource } from '@temples/shared';
import {
  PLAYER,
  RIVAL,
  blocksTile,
  resourceOf,
  type Animal,
  type Building,
  type KingdomSim,
  type Unit,
} from '../sim/sim';
import { worldToTile, type ResourceNode, type XZ } from '../sim/map';
import { inArc } from './heroCore';

/**
 * What the played hero does to the live game (Anachak Khmer, D92): strikes hurt raiders, rival
 * buildings and wild animals (kills become meat, as in a hunt); work swings cut wood, break
 * stone, pick fruit, raise buildings and tend rice; at a store the load goes into the stock.
 * The hero is a real unit of the sim (its HP, its load), or the king, who is not a unit.
 */

type Cfg = Anachak['hero'];

export interface HeroBody {
  x: number;
  z: number;
  heading: number;
  /** The sim unit played, or null for the king. */
  unit: Unit | null;
}

export interface StrikeResult {
  hits: Array<{ x: number; z: number; dmg: number; kill: boolean; what: 'unit' | 'animal' | 'building' }>;
}

/** Can the hero stand here: open ground, a ford or a bridge (no water, trees, rocks, walls)? */
export function heroOpen(sim: KingdomSim, x: number, z: number): boolean {
  const half = (sim.map.size * sim.map.tile) / 2 - 2;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  const [tx, tz] = worldToTile(sim.map, x, z);
  return sim.grid.ok(tx, tz);
}

/** The hero's attack per hit before armour. */
export function heroAttack(sim: KingdomSim, cfg: Cfg, body: HeroBody): number {
  return body.unit ? sim.attackOf(body.unit) * cfg.attackMul : cfg.king.attack;
}

/** Enemies in reach of a swing (or a skill's circle when arc ≥ 2π). */
export function targetsInArc(
  sim: KingdomSim,
  body: HeroBody,
  reach: number,
  arc: number,
): { units: Unit[]; animals: Animal[]; buildings: Building[] } {
  const units: Unit[] = [];
  const animals: Animal[] = [];
  const buildings: Building[] = [];
  for (const u of sim.units.values())
    if (u.team === RIVAL && inArc(body, u, reach, arc, sim.def(u.type).radius ?? 0.5)) units.push(u);
  for (const a of sim.animals.values()) if (inArc(body, a, reach, arc, 0.6)) animals.push(a);
  for (const b of sim.buildings.values()) {
    if (b.team !== RIVAL) continue;
    const [cx, cz] = sim.center(b);
    const pad = (Math.max(b.w, b.d) * sim.map.tile) / 2;
    if (inArc(body, { x: cx, z: cz }, reach, arc, pad)) buildings.push(b);
  }
  return { units, animals, buildings };
}

/** Land a blow (or a skill) on everything in the arc. */
export function strike(
  sim: KingdomSim,
  cfg: Cfg,
  body: HeroBody,
  reach: number,
  arc: number,
  mul: number,
): StrikeResult {
  const out: StrikeResult = { hits: [] };
  const atk = heroAttack(sim, cfg, body) * mul;
  const t = targetsInArc(sim, body, reach, arc);
  const by = body.unit ?? sim.units.values().next().value;
  for (const u of t.units) {
    const before = u.hp;
    if (by) sim.damageUnit(u, atk, by);
    else u.hp -= atk;
    out.hits.push({
      x: u.x,
      z: u.z,
      dmg: Math.round(before - Math.max(0, u.hp)),
      kill: !sim.units.has(u.id),
      what: 'unit',
    });
  }
  for (const a of t.animals) {
    const dmg = Math.round(atk * 1.5);
    const kill = hurtAnimal(sim, a, dmg, body);
    out.hits.push({ x: a.x, z: a.z, dmg, kill, what: 'animal' });
  }
  for (const b of t.buildings) {
    const before = b.hp;
    sim.damageBuilding(b, atk);
    const [x, z] = sim.center(b);
    out.hits.push({
      x,
      z,
      dmg: Math.round(before - Math.max(0, b.hp)),
      kill: !sim.buildings.has(b.id),
      what: 'building',
    });
  }
  return out;
}

/** Hurt a wild animal: it runs or turns on the hero; killed, it becomes meat (as a hunt). */
export function hurtAnimal(sim: KingdomSim, a: Animal, dmg: number, body: HeroBody): boolean {
  const k = sim.kindOf(a);
  a.hp -= dmg;
  if (k.behaviour === 'predator' || k.behaviour === 'defensive') {
    if (body.unit) a.prey = body.unit.id;
    a.angryUntil = sim.time + 8;
  } else {
    a.fleeUntil = sim.time + 2.5;
    a.fleeFrom = [body.x, body.z];
  }
  if (a.hp > 0) return false;
  sim.animals.delete(a.id);
  const [tx, tz] = worldToTile(sim.map, a.x, a.z);
  const meat: ResourceNode = { id: sim.nextId++, kind: 'meat', tx, tz, amount: k.meat };
  sim.nodes.set(meat.id, meat);
  sim.events.push({ kind: 'hunted', animal: a.kind, at: [a.x, a.z], node: meat.id, t: sim.time });
  if (body.unit?.type === 'watchman')
    body.unit.hides = (body.unit.hides ?? 0) + Math.round(k.meat * sim.data.rules.army.watchman.hideShare);
  return true;
}

/** What a work swing would do here, the nearest thing in front first. */
export type WorkTarget =
  | { kind: 'node'; node: ResourceNode; res: Resource; at: XZ }
  | { kind: 'build'; building: Building; at: XZ }
  | { kind: 'farm'; building: Building; at: XZ }
  | { kind: 'store'; building: Building; at: XZ };

export function workTarget(sim: KingdomSim, cfg: Cfg, body: HeroBody): WorkTarget | null {
  const reach = cfg.interactRange;
  const u = body.unit;
  // A load to put down comes first when a store is at hand.
  if (u?.carry && u.carry.n >= 1) {
    const s = nearestBuilding(sim, body, reach + 1.2, (b) => sim.bdef(b.type).dropOff.includes(u.carry!.res));
    if (s) return { kind: 'store', building: s, at: sim.center(s) };
  }
  let best: WorkTarget | null = null;
  let bd = Infinity;
  const ahead = (x: number, z: number) => inArc(body, { x, z }, reach, Math.PI * 1.2, 0.8);
  for (const n of sim.nodes.values()) {
    if (n.amount <= 0 || n.kind === 'fish') continue;
    const [x, z] = sim.nodePos(n);
    if (Math.abs(x - body.x) > reach + 1 || Math.abs(z - body.z) > reach + 1) continue;
    const d = Math.hypot(x - body.x, z - body.z);
    if (d < bd && ahead(x, z)) {
      bd = d;
      best = { kind: 'node', node: n, res: resourceOf(n.kind), at: [x, z] };
    }
  }
  const b = nearestBuilding(sim, body, reach + 1, (x) => x.progress < 1 || x.type === 'riceField');
  if (b) {
    const [x, z] = sim.center(b);
    const d = sim.distTo(b, body.x, body.z);
    if (d < bd)
      best =
        b.progress < 1
          ? { kind: 'build', building: b, at: [x, z] }
          : { kind: 'farm', building: b, at: [x, z] };
  }
  return best;
}

function nearestBuilding(
  sim: KingdomSim,
  body: HeroBody,
  reach: number,
  ok: (b: Building) => boolean,
): Building | null {
  let best: Building | null = null;
  let bd = reach;
  for (const b of sim.buildings.values()) {
    if (b.team !== PLAYER || !ok(b)) continue;
    const d = sim.distTo(b, body.x, body.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Do one work swing; returns what it gave (for the floating number) or null. */
export function doWork(
  sim: KingdomSim,
  cfg: Cfg,
  kit: HeroKit,
  body: HeroBody,
  target: WorkTarget,
  power = 1,
): { res?: Resource; n: number; label: 'got' | 'stored' | 'built' | 'farmed' } | null {
  const u = body.unit;
  if (target.kind === 'store') {
    if (!u?.carry) return null;
    const n = Math.floor(u.carry.n);
    const b = target.building;
    if (sim.bdef(b.type).stockpile) b.stock = (b.stock ?? 0) + n;
    else sim.res[PLAYER][u.carry.res] += n;
    sim.events.push({ kind: 'delivered', res: u.carry.res, n, at: [u.x, u.z], t: sim.time });
    const res = u.carry.res;
    u.carry = null;
    return { res, n, label: 'stored' };
  }
  if (target.kind === 'build') {
    const b = target.building;
    const before = b.progress;
    b.progress = Math.min(1, b.progress + cfg.buildPerSwing * power);
    b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * b.maxHp);
    if (b.progress >= 1) {
      b.hp = Math.max(b.hp, b.maxHp * 0.999);
      sim.events.push({ kind: 'built', building: b, t: sim.time });
      if (b.type === 'monument' && b.temple === sim.chapterData.temple) sim.monumentDoneAt = sim.time;
    }
    return { n: Math.round((b.progress - before) * 100), label: 'built' };
  }
  if (target.kind === 'farm') {
    const f = target.building;
    sim.growRice(f, cfg.chopPerSwing * 2 * power);
    const got = Math.min(cfg.chopPerSwing * power, f.food ?? 0);
    f.food = (f.food ?? 0) - got;
    return carry(sim, body, 'food', got) ? { res: 'food', n: got, label: 'farmed' } : null;
  }
  const n = target.node;
  const cap = u ? (sim.def(u.type).carry ?? 10) : Infinity;
  const room = u ? cap - (u.carry && u.carry.res === target.res ? u.carry.n : 0) : Infinity;
  const want = cfg.chopPerSwing * power * (kit.weapon === 'axe' ? 1.5 : 1);
  const got = Math.min(want, n.amount, room);
  if (got <= 0) return null;
  n.amount -= got;
  if (n.amount <= 0 && blocksTile(n.kind)) sim.removeNode(n);
  else if (n.amount <= 0) sim.nodes.delete(n.id);
  carry(sim, body, target.res, got);
  return { res: target.res, n: got, label: 'got' };
}

/** The load in the hero's hands; the king's servants take his straight to the stores. */
function carry(sim: KingdomSim, body: HeroBody, res: Resource, n: number): boolean {
  const u = body.unit;
  if (!u) {
    sim.res[PLAYER][res] += n;
    return true;
  }
  if (!u.carry || u.carry.res !== res) u.carry = { res, n: 0 };
  u.carry.n += n;
  return true;
}

/** Heal and hearten friends round the hero (war cry, supplies, the king's blessing). */
export function heal(sim: KingdomSim, body: HeroBody, radius: number, share: number): number {
  let n = 0;
  for (const u of sim.units.values()) {
    if (u.team !== PLAYER || Math.hypot(u.x - body.x, u.z - body.z) > radius) continue;
    const max = sim.def(u.type).hp;
    if (u.hp < max) {
      u.hp = Math.min(max, u.hp + max * share);
      n++;
    }
  }
  return n;
}

/** The nearest enemy or wild beast within reach (for arrows and the dog), or null. */
export function nearestFoe(
  sim: KingdomSim,
  body: HeroBody,
  reach: number,
  arc = Math.PI * 2,
): { x: number; z: number; unit?: Unit; animal?: Animal } | null {
  let best: { x: number; z: number; unit?: Unit; animal?: Animal } | null = null;
  let bd = reach;
  for (const u of sim.units.values()) {
    if (u.team !== RIVAL || !inArc(body, u, reach, arc)) continue;
    const d = Math.hypot(u.x - body.x, u.z - body.z);
    if (d < bd) {
      bd = d;
      best = { x: u.x, z: u.z, unit: u };
    }
  }
  for (const a of sim.animals.values()) {
    if (!inArc(body, a, reach, arc)) continue;
    const d = Math.hypot(a.x - body.x, a.z - body.z);
    if (d < bd * 0.8) {
      bd = d;
      best = { x: a.x, z: a.z, animal: a };
    }
  }
  return best;
}

/** One arrow (or the dog's bite) arriving at a foe. */
export function hitFoe(
  sim: KingdomSim,
  cfg: Cfg,
  body: HeroBody,
  foe: { unit?: Unit; animal?: Animal },
  mul: number,
): { dmg: number; kill: boolean } | null {
  const atk = heroAttack(sim, cfg, body) * mul;
  if (foe.unit && sim.units.has(foe.unit.id)) {
    const before = foe.unit.hp;
    const by = body.unit ?? foe.unit;
    sim.damageUnit(foe.unit, atk, by);
    return { dmg: Math.round(before - Math.max(0, foe.unit.hp)), kill: !sim.units.has(foe.unit.id) };
  }
  if (foe.animal && sim.animals.has(foe.animal.id)) {
    const dmg = Math.round(atk * 1.5);
    return { dmg, kill: hurtAnimal(sim, foe.animal, dmg, body) };
  }
  return null;
}

/** Words for what a work swing would do (the prompt under the hero). */
export function workLabel(t: WorkTarget | null): { km: string; en: string } | null {
  if (!t) return null;
  if (t.kind === 'store') return { km: 'ដាក់ចូលឃ្លាំង', en: 'Put in the store' };
  if (t.kind === 'build') return { km: 'សាងសង់', en: 'Build' };
  if (t.kind === 'farm') return { km: 'ធ្វើស្រែ', en: 'Tend the rice' };
  const k = t.node.kind;
  return k === 'tree'
    ? { km: 'កាប់ឈើ', en: 'Chop wood' }
    : k === 'stone'
      ? { km: 'វាយថ្ម', en: 'Break stone' }
      : k === 'gold'
        ? { km: 'ជីកមាស', en: 'Dig gold' }
        : k === 'gems'
          ? { km: 'ជីកត្បូង', en: 'Dig gems' }
          : k === 'meat'
            ? { km: 'យកសាច់', en: 'Take the meat' }
            : { km: 'បេះផ្លែឈើ', en: 'Pick fruit' };
}
