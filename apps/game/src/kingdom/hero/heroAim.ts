import type { Anachak } from '@temples/shared';
import type { Animal, KingdomSim, Unit } from '../sim/sim';
import { RIVAL } from '../sim/sim';

/**
 * The mouse in the 3D hero mode and the dust when he lands (PK 1.9.0, Sprint 1), free of
 * three.js and the DOM so they can be tested. Numbers come from `anachak.json` hero.mouse / fx.
 */

type Cfg = Anachak['hero'];

/** A press of the right button, from down to up. */
export interface Press {
  x: number;
  y: number;
  /** ms when it went down. */
  t: number;
  /** Farthest it moved from where it went down (stage px). */
  moved: number;
}

/** A short right click (not a camera drag): walk there. */
export function isClick(p: Press, upAt: number, cfg: Cfg): boolean {
  return p.moved < cfg.mouse.clickPx && upAt - p.t <= cfg.mouse.clickMs;
}

export interface Foe {
  x: number;
  z: number;
  unit?: Unit;
  animal?: Animal;
}

/** The foe (a raider or a wild animal) nearest a ground point, within `pick` m of it. */
export function foeAt(sim: KingdomSim, x: number, z: number, pick: number): Foe | null {
  let best: Foe | null = null;
  let bd = pick;
  for (const u of sim.units.values()) {
    if (u.team !== RIVAL) continue;
    const d = Math.hypot(u.x - x, u.z - z);
    if (d < bd) {
      bd = d;
      best = { x: u.x, z: u.z, unit: u };
    }
  }
  for (const a of sim.animals.values()) {
    const d = Math.hypot(a.x - x, a.z - z);
    if (d < bd) {
      bd = d;
      best = { x: a.x, z: a.z, animal: a };
    }
  }
  return best;
}

/** The ring under a foe: gold when his weapon reaches it from where he stands, red when not. */
export function aimRing(hero: { x: number; z: number }, foe: { x: number; z: number }, reach: number): 'gold' | 'red' {
  return Math.hypot(foe.x - hero.x, foe.z - hero.z) <= reach ? 'gold' : 'red';
}

/** What a left click on a foe does: strike now (in reach) or walk up to it and strike there. */
export function clickFoe(
  hero: { x: number; z: number },
  foe: { x: number; z: number },
  reach: number,
): { kind: 'strike' } | { kind: 'approach'; stop: number } {
  return aimRing(hero, foe, reach) === 'gold' ? { kind: 'strike' } : { kind: 'approach', stop: reach * 0.8 };
}

/** The ground under his feet, for the colour of the dust. */
export type DustGround = 'earth' | 'grass' | 'water';

/** Red-ochre laterite earth (roads, bare hills, rock) and a pale green over grass. */
export const DUST_EARTH = [0xa8643a, 0xb9774a, 0x9a5634, 0xc48a5c] as const;
export const DUST_GRASS = [0xb7c48a, 0xa9b878, 0xcfd6a0, 0xc2bf8f] as const;

/** Which ground is under (x, z): water (a ford or the shallows), grass (meadow, forest) or earth. */
export function dustGround(sim: KingdomSim, x: number, z: number): DustGround {
  const t = sim.map.terrain[sim.tileIndex(x, z)];
  if (t === 'water' || t === 'ford') return 'water';
  if (sim.onRoad(x, z)) return 'earth';
  return t === 'grass' || t === 'forest' ? 'grass' : 'earth';
}

/** The landing burst: dust tinted by the ground (a splash on water), bigger after a hard fall. */
export function landDust(
  ground: DustGround,
  impact: number,
  cfg: Cfg,
): { kind: 'dust' | 'splash'; n: number; lift: number; colors?: readonly number[]; ring: boolean } {
  const F = cfg.fx;
  const n = impact >= F.heavyFall ? F.landDustHeavy : F.landDust;
  if (ground === 'water') return { kind: 'splash', n, lift: 0.05, ring: false };
  return { kind: 'dust', n, lift: F.lift, colors: ground === 'grass' ? DUST_GRASS : DUST_EARTH, ring: true };
}
