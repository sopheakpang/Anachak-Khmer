import type { KingdomData, Resource } from '@temples/shared';
import type { XZ } from './map';
import type { Building, KingdomSim, Unit } from './sim';

/**
 * PK 2026-10-20 (D160): ការលុកលុយភូមិ · the raid on the village, as PK chose it:
 * - raiders come in waves from the rival camp, or when a Royal Order says "Defeat raiders";
 * - they make for the storehouse: whoever reaches it carries goods away (gold, food) unless he
 *   is stopped — a raider struck down drops what he carried and it goes back to the store;
 * - the king's soldiers form a line at the village edge facing them: shield-bearers (swordsmen,
 *   commanders) in front, spearmen right behind, archers a few steps back, riders and elephants
 *   on the flanks; when the raiders come within `engage` m, the line breaks into one-to-one
 *   fights (each raider met by the nearest soldiers), archers loosing from where they stand;
 * - a shield-bearer blocks some blows (less harm, sparks and a wooden "thock"); every hit pushes
 *   the one hit back a little (and a small red flash in the view); one raider spearman in
 *   `axeEvery` wields an axe, whose blows are heavy (the camera shakes near them);
 * - when the wave breaks (the rival's retreat rule), the soldiers cheer, and the hurt kneel
 *   and rest until they have their strength back.
 * Numbers: rules.json `battle`. Everything here is the game's (gameplay fiction); the dress,
 * weapons and line of battle follow the Bayon and Angkor Wat reliefs (see D160).
 */

export type BattleRules = KingdomData['rules']['battle'];

/** One raid being met: where the line stands and which way it faces. */
export interface Battle {
  wave: number;
  /** What the raiders go for (a storehouse, a temple site or a hall). */
  target: XZ;
  /** The middle of the front row. */
  line: XZ;
  /** Unit vector from the line toward the raiders' camp. */
  dir: XZ;
  /** The line has met the raiders (the fight is on). */
  engaged: boolean;
}

/** Where each soldier stands in the line: front (shields), second (spears), back (bows), flanks. */
export type Row = 'front' | 'second' | 'back' | 'flank';

export function rowOf(role: string, type: string, B: Pick<BattleRules, 'shields'>): Row | null {
  if (role === 'ranged') return 'back';
  if (role === 'cavalry' || role === 'elephant') return 'flank';
  if (B.shields.includes(type)) return 'front';
  if (role === 'infantry' || role === 'commander') return 'second';
  return null;
}

/**
 * The line of battle: a slot for every soldier, rows across the raiders' way (perpendicular to
 * `dir`), each row centred, `spacing` m apart; the second row `rowGap` m behind the front, the
 * archers `archerBack` m behind; riders and elephants at both ends of the front row.
 */
export function lineSlots(
  line: XZ,
  dir: XZ,
  soldiers: ReadonlyArray<{ id: number; row: Row }>,
  B: Pick<BattleRules, 'spacing' | 'rowGap' | 'archerBack'>,
): Map<number, XZ> {
  const out = new Map<number, XZ>();
  const px = -dir[1];
  const pz = dir[0];
  const rows: Record<Row, number[]> = { front: [], second: [], back: [], flank: [] };
  for (const s of soldiers) rows[s.row].push(s.id);
  // An empty front row: the spearmen stand in front.
  if (!rows.front.length && rows.second.length) [rows.front, rows.second] = [rows.second, rows.front];
  const put = (ids: number[], back: number, from = 0) =>
    ids.forEach((id, i) => {
      const k = i - (ids.length - 1) / 2 + from;
      out.set(id, [
        line[0] - dir[0] * back + px * k * B.spacing,
        line[1] - dir[1] * back + pz * k * B.spacing,
      ]);
    });
  put(rows.front, 0);
  put(rows.second, B.rowGap);
  put(rows.back, B.archerBack);
  // Flanks: alternately right and left of the front row's ends.
  const half = (rows.front.length - 1) / 2 + 1.5;
  rows.flank.forEach((id, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const k = side * (half + Math.floor(i / 2) * 1.5);
    out.set(id, [line[0] + px * k * B.spacing, line[1] + pz * k * B.spacing]);
  });
  return out;
}

/**
 * One-to-one fights when the lines meet: each soldier takes the nearest raider that has the
 * fewest soldiers on him so far (so every raider is met before any is met twice).
 */
export function pairUp(
  soldiers: ReadonlyArray<{ id: number; x: number; z: number }>,
  raiders: ReadonlyArray<{ id: number; x: number; z: number }>,
): Map<number, number> {
  const out = new Map<number, number>();
  if (!raiders.length) return out;
  const load = new Map<number, number>(raiders.map((r) => [r.id, 0]));
  for (const s of soldiers) {
    let best: number | null = null;
    let bestKey = Infinity;
    for (const r of raiders) {
      const key = load.get(r.id)! * 1e6 + Math.hypot(r.x - s.x, r.z - s.z);
      if (key < bestKey) {
        bestKey = key;
        best = r.id;
      }
    }
    out.set(s.id, best!);
    load.set(best!, load.get(best!)! + 1);
  }
  return out;
}

/** What one raider can carry away from the store (no more than the store has). */
export function lootOf(
  store: Record<Resource, number>,
  B: Pick<BattleRules, 'steal'>,
): Partial<Record<Resource, number>> {
  const out: Partial<Record<Resource, number>> = {};
  for (const [res, n] of Object.entries(B.steal) as Array<[Resource, number]>) {
    const take = Math.min(n, Math.floor(store[res] ?? 0));
    if (take > 0) out[res] = take;
  }
  return out;
}

/** Does this raider wield an axe (heavy blows)? One spearman in `axeEvery`, by his number. */
export function wieldsAxe(u: Pick<Unit, 'id' | 'type'>, B: Pick<BattleRules, 'axeEvery'>): boolean {
  return u.type === 'spearman' && B.axeEvery > 0 && u.id % B.axeEvery === 0;
}

/** The fighting units of the player that answer the muster. */
function fighters(sim: KingdomSim): Unit[] {
  const out: Unit[] = [];
  for (const u of sim.units.values()) {
    if (u.team !== 0 || u.manual) continue;
    const role = sim.def(u.type).role;
    if (!['infantry', 'ranged', 'cavalry', 'elephant', 'commander'].includes(role)) continue;
    out.push(u);
  }
  return out;
}

/** Where a raid goes: the player's storehouse nearest the camp (PK), else `fallback`. */
export function raidTarget(sim: KingdomSim, camp: Building, fallback: XZ): XZ {
  if (!sim.data.rules.battle.store) return fallback;
  const [cx, cz] = sim.center(camp);
  let best: XZ | null = null;
  let bd = Infinity;
  for (const b of sim.buildings.values()) {
    if (b.team !== 0 || b.type !== 'storehouse' || b.progress < 1) continue;
    const [x, z] = sim.center(b);
    const d = Math.hypot(x - cx, z - cz);
    if (d < bd) {
      bd = d;
      best = [x, z];
    }
  }
  return best ?? fallback;
}

/** A wave is called: the soldiers near the target form the line facing the raiders' camp. */
export function muster(sim: KingdomSim, wave: number, target: XZ, from: XZ): Battle {
  const B = sim.data.rules.battle;
  let dx = from[0] - target[0];
  let dz = from[1] - target[1];
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  const line: XZ = [target[0] + dx * B.musterDist, target[1] + dz * B.musterDist];
  const battle: Battle = { wave, target, line, dir: [dx, dz], engaged: false };
  const answer = fighters(sim).filter(
    (u) =>
      (u.task.kind === 'idle' || (u.task.kind === 'move' && !u.waypoints?.length)) &&
      Math.hypot(u.x - target[0], u.z - target[1]) < B.musterRadius,
  );
  const rows = answer
    .map((u) => ({ id: u.id, row: rowOf(sim.def(u.type).role, u.type, B) }))
    .filter((s): s is { id: number; row: Row } => s.row !== null);
  const slots = lineSlots(line, battle.dir, rows, B);
  for (const u of answer) {
    const at = slots.get(u.id);
    if (!at) continue;
    u.battle = { wave, slot: at };
    u.task = { kind: 'move', to: at };
    u.path = null;
  }
  sim.events.push({ kind: 'muster', at: line, n: slots.size, t: sim.time });
  return battle;
}

/**
 * Every tick of a raid: the line faces the raiders and holds; when they come near it breaks into
 * pairs; raiders at the store steal; a raider who gets home with goods keeps them.
 */
export function updateBattles(sim: KingdomSim, battles: Map<number, Battle>, camp: Building | null): void {
  const B = sim.data.rules.battle;
  for (const [wave, bt] of battles) {
    const raiders = [...sim.units.values()].filter((u) => u.team === 1 && u.raid?.wave === wave);
    const mine = [...sim.units.values()].filter((u) => u.team === 0 && u.battle?.wave === wave);
    if (!raiders.length) {
      // The wave is beaten or gone: the soldiers cheer, then go back to what they did.
      for (const u of mine) {
        u.battle = undefined;
        u.cheerUntil = sim.time + B.cheerSec;
        u.fought = true; // the hurt among them rest (restHurt)
        if (u.task.kind === 'move' || u.task.kind === 'attack') u.task = { kind: 'idle' };
      }
      if (mine.length) sim.events.push({ kind: 'cheer', at: bt.line, n: mine.length, t: sim.time });
      battles.delete(wave);
      continue;
    }
    // Hold the line, facing the raiders.
    const face = Math.atan2(bt.dir[0], bt.dir[1]);
    if (!bt.engaged) {
      for (const u of mine) if (u.task.kind === 'idle') u.heading = face;
      const near = raiders.some((r) => Math.hypot(r.x - bt.line[0], r.z - bt.line[1]) < B.engage);
      if (near) {
        bt.engaged = true;
        const melee = mine.filter((u) => sim.def(u.type).role !== 'ranged');
        const pairs = pairUp(melee, raiders);
        for (const u of melee) {
          const r = pairs.get(u.id);
          if (r === undefined) continue;
          u.task = { kind: 'attack', unit: r };
          u.path = null;
        }
        for (const u of mine)
          if (sim.def(u.type).role === 'ranged') {
            const r = nearest(raiders, u.x, u.z);
            if (r) {
              u.task = { kind: 'attack', unit: r.id };
              u.path = null;
            }
          }
      }
    } else {
      // A soldier whose raider fell takes the next one.
      for (const u of mine)
        if (u.task.kind === 'idle' || (u.task.kind === 'attack' && !sim.units.has(u.task.unit ?? -1))) {
          const r = nearest(raiders, u.x, u.z);
          if (r) {
            u.task = { kind: 'attack', unit: r.id };
            u.path = null;
          }
        }
    }
    // The store: a raider who reaches it takes goods and makes for home.
    for (const r of raiders) {
      if (!r.raid) continue;
      if (!r.raid.loot && Math.hypot(r.x - bt.target[0], r.z - bt.target[1]) < B.stealReach) {
        const loot = lootOf(sim.res[0], B);
        for (const [res, n] of Object.entries(loot) as Array<[Resource, number]>) sim.res[0][res] -= n;
        r.raid.loot = loot;
        if (camp) {
          const [hx, hz] = sim.center(camp);
          r.task = { kind: 'move', to: [hx, hz + 6] };
          r.path = null;
        }
        if (Object.keys(loot).length) sim.events.push({ kind: 'stolen', loot, at: [r.x, r.z], t: sim.time });
      } else if (r.raid.loot && camp && sim.distTo(camp, r.x, r.z) < B.homeReach) {
        // Home with the goods: they are gone.
        r.raid = undefined;
        r.wave = undefined;
      }
    }
  }
}

/** A raider struck down drops what he carried: it goes back to the store. */
export function dropLoot(sim: KingdomSim, u: Unit): void {
  const loot = u.raid?.loot;
  if (!loot) return;
  for (const [res, n] of Object.entries(loot) as Array<[Resource, number]>) sim.res[0][res] += n;
  if (Object.keys(loot).length) sim.events.push({ kind: 'recovered', loot, at: [u.x, u.z], t: sim.time });
  u.raid!.loot = undefined;
}

/** The hurt rest after the fight: kneel and slowly heal while no enemy is near. */
export function restHurt(sim: KingdomSim, dt: number): void {
  const B = sim.data.rules.battle;
  for (const u of sim.units.values()) {
    // Only the soldiers who stood in the line of battle (the rest houses heal everyone else).
    if (u.team !== 0 || u.battle || u.manual || !u.fought) continue;
    const max = sim.def(u.type).hp;
    const hurt = u.hp < max * B.kneelBelow;
    if (!hurt) {
      u.resting = false;
      u.fought = undefined;
      continue;
    }
    if (u.task.kind !== 'idle') {
      u.resting = false;
      continue;
    }
    let near = false;
    for (const o of sim.units.values())
      if (o.team === 1 && Math.hypot(o.x - u.x, o.z - u.z) < B.restClear) {
        near = true;
        break;
      }
    u.resting = !near;
    if (u.resting) u.hp = Math.min(max, u.hp + B.restHeal * dt);
  }
}

function nearest<T extends { x: number; z: number }>(list: readonly T[], x: number, z: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const r of list) {
    const d = Math.hypot(r.x - x, r.z - z);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}
