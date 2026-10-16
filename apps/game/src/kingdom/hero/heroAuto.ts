import type { Anachak } from '@temples/shared';
import { RIVAL, resourceOf, type KingdomSim } from '../sim/sim';
import { nearestBuilding, workTarget, type HeroBody, type WorkTarget } from './heroSim';

/**
 * The 🤖 auto mode of the 3D hero (PK, decision k6 / D148): he plays by himself — he fights a
 * raider or a dangerous beast that comes within `fightRange`, else works what is at hand, else
 * walks to the nearest work within `searchRadius` (a store when he carries a load, a resource,
 * a building going up). Any move key or action takes control back. Pure: the hero mode applies
 * the order. Numbers in `anachak.json` hero `auto`.
 */

type Cfg = Anachak['hero'];

export type AutoOrder =
  | { kind: 'fight'; x: number; z: number; id: number; animal: boolean }
  | { kind: 'work'; target: WorkTarget }
  | { kind: 'goto'; x: number; z: number; why: 'store' | 'node' | 'build' }
  | { kind: 'idle' };

/** The nearest foe to fight: a raider, or an animal that would hurt people now. */
export function autoFoe(
  sim: KingdomSim,
  body: HeroBody,
  range: number,
): { x: number; z: number; id: number; animal: boolean } | null {
  let best: { x: number; z: number; id: number; animal: boolean } | null = null;
  let bd = range;
  for (const u of sim.units.values()) {
    if (u.team !== RIVAL) continue;
    const d = Math.hypot(u.x - body.x, u.z - body.z);
    if (d < bd) {
      bd = d;
      best = { x: u.x, z: u.z, id: u.id, animal: false };
    }
  }
  for (const a of sim.animals.values()) {
    if (!sim.dangerous(a)) continue;
    const d = Math.hypot(a.x - body.x, a.z - body.z);
    if (d < bd) {
      bd = d;
      best = { x: a.x, z: a.z, id: a.id, animal: true };
    }
  }
  return best;
}

/** Where the nearest work is, within `radius` m (or null). */
export function autoWorkSpot(
  sim: KingdomSim,
  body: HeroBody,
  radius: number,
): { x: number; z: number; why: 'store' | 'node' | 'build' } | null {
  const u = body.unit;
  if (u?.carry && u.carry.n >= 1) {
    const s = nearestBuilding(sim, body, radius, (b) => b.progress >= 1 && sim.bdef(b.type).dropOff.includes(u.carry!.res));
    if (s) {
      const [x, z] = sim.center(s);
      return { x, z, why: 'store' };
    }
  }
  let best: { x: number; z: number; why: 'store' | 'node' | 'build' } | null = null;
  let bd = radius;
  // A building going up comes before gathering, at the same distance.
  const b = nearestBuilding(sim, body, radius, (x) => x.progress < 1);
  if (b) {
    const [x, z] = sim.center(b);
    bd = sim.distTo(b, body.x, body.z) * 0.8;
    best = { x, z, why: 'build' };
  }
  for (const n of sim.nodes.values()) {
    if (n.amount <= 0 || n.kind === 'fish') continue;
    const [x, z] = sim.nodePos(n);
    if (Math.abs(x - body.x) > bd || Math.abs(z - body.z) > bd) continue;
    // A carried load of another resource would be dropped: keep to the same one.
    if (u?.carry && u.carry.n >= 1 && resourceOf(n.kind) !== u.carry.res) continue;
    const d = Math.hypot(x - body.x, z - body.z);
    if (d < bd) {
      bd = d;
      best = { x, z, why: 'node' };
    }
  }
  return best;
}

/** What he does next by himself. */
export function autoOrder(sim: KingdomSim, cfg: Cfg, body: HeroBody): AutoOrder {
  const A = cfg.auto;
  const foe = autoFoe(sim, body, A.fightRange);
  if (foe) return { kind: 'fight', ...foe };
  // Work at hand: face it (any direction counts here) and swing.
  const facing = (x: number, z: number): HeroBody => ({ ...body, heading: Math.atan2(x - body.x, z - body.z) });
  const spot = autoWorkSpot(sim, body, A.searchRadius);
  if (spot) {
    const t = workTarget(sim, cfg, facing(spot.x, spot.z));
    if (t) return { kind: 'work', target: t };
    return { kind: 'goto', x: spot.x, z: spot.z, why: spot.why };
  }
  const here = workTarget(sim, cfg, body);
  return here ? { kind: 'work', target: here } : { kind: 'idle' };
}
