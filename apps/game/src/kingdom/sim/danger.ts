import { PLAYER, RIVAL, type KingdomSim } from './sim';

/**
 * PK 1.9.0 (D146 ខ៦ A + C): where people can get hurt — red rings on the ground and the
 * minimap, and in the 3D hero mode an arrow at the screen's edge toward the nearest one.
 * Pure (no three.js, no DOM); numbers in `anachak.json` `dangerZones`.
 */

export type DangerKind = 'beast' | 'raid' | 'camp';

export interface DangerZone {
  kind: DangerKind;
  x: number;
  z: number;
  /** Radius (m) of the ring. */
  r: number;
  /** The animal, unit or building it stands for. */
  id: number;
}

/** Every danger the player can know of: seen raiders, dangerous beasts on explored land, known rival camps. */
export function dangerZones(sim: KingdomSim): DangerZone[] {
  const D = sim.data.anachak.dangerZones;
  const out: DangerZone[] = [];
  for (const a of sim.animals.values()) {
    if (!sim.dangerous(a) || !sim.isExplored(a.x, a.z)) continue;
    out.push({ kind: 'beast', x: a.x, z: a.z, r: Math.max(D.beastMin, sim.kindOf(a).range), id: a.id });
  }
  for (const u of sim.units.values()) {
    if (u.team !== RIVAL || !sim.isVisible(u.x, u.z)) continue;
    out.push({ kind: 'raid', x: u.x, z: u.z, r: D.raidRadius, id: u.id });
  }
  for (const b of sim.buildings.values()) {
    if (b.team === PLAYER) continue;
    const [x, z] = sim.center(b);
    if (!sim.isExplored(x, z)) continue;
    out.push({ kind: 'camp', x, z, r: D.campRadius, id: b.id });
  }
  return out;
}

/** The zones whose ring comes within `d` m of a point, nearest edge first, at most `max`. */
export function dangersNear(zones: DangerZone[], x: number, z: number, d: number, max = Infinity): DangerZone[] {
  return zones
    .map((zn) => ({ zn, gap: Math.hypot(zn.x - x, zn.z - z) - zn.r }))
    .filter((e) => e.gap <= d)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, max)
    .map((e) => e.zn);
}

/** Is the point inside any zone's ring? */
export function insideDanger(zones: DangerZone[], x: number, z: number): DangerZone | null {
  for (const zn of zones) if (Math.hypot(zn.x - x, zn.z - z) <= zn.r) return zn;
  return null;
}

/**
 * Where on the screen's edge the arrow points, for a third-person camera at `camYaw` (the
 * camera looks along yaw + π): radians clockwise from straight up (0 = ahead, π/2 = right).
 */
export function edgeArrowAngle(camYaw: number, fromX: number, fromZ: number, toX: number, toZ: number): number {
  const heading = Math.atan2(toX - fromX, toZ - fromZ);
  const rel = heading - (camYaw + Math.PI);
  // A heading to the camera's left is a larger angle (see HeroCore.wantHeading), so negate.
  const a = -rel;
  return Math.atan2(Math.sin(a), Math.cos(a));
}
