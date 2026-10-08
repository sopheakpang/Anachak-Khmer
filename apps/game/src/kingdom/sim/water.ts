/**
 * Crossing water (PK 1.8.0): wade, swim, or ride a boat or a bamboo raft. Pure and unit-tested;
 * the numbers are `rules.json` → `water`.
 */
import type { KingdomData } from '@temples/shared';

export type WaterRules = KingdomData['rules']['water'];

/** How a unit is crossing the tile it stands on. */
export type WaterWay = 'land' | 'wade' | 'swim' | 'boat' | 'raft';

/**
 * Distance of every water tile from the nearest land tile, in tiles (land = 0, a water tile
 * next to land = 1, capped at 255). Two-pass chamfer distance: diagonal steps count 1.5.
 */
export function shoreDistance(water: Uint8Array, n: number): Uint8Array {
  const d = new Float32Array(n * n);
  const INF = 1e6;
  for (let i = 0; i < n * n; i++) d[i] = water[i] ? INF : 0;
  const relax = (i: number, j: number, w: number) => {
    const v = d[j]! + w;
    if (v < d[i]!) d[i] = v;
  };
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      if (!d[i]) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (z > 0) {
        relax(i, i - n, 1);
        if (x > 0) relax(i, i - n - 1, 1.5);
        if (x < n - 1) relax(i, i - n + 1, 1.5);
      }
    }
  for (let z = n - 1; z >= 0; z--)
    for (let x = n - 1; x >= 0; x--) {
      const i = z * n + x;
      if (!d[i]) continue;
      if (x < n - 1) relax(i, i + 1, 1);
      if (z < n - 1) {
        relax(i, i + n, 1);
        if (x < n - 1) relax(i, i + n + 1, 1.5);
        if (x > 0) relax(i, i + n - 1, 1.5);
      }
    }
  const out = new Uint8Array(n * n);
  // A map edge with no land in reach stays at the cap.
  for (let i = 0; i < n * n; i++) out[i] = d[i]! >= INF ? 255 : Math.min(255, Math.round(d[i]!));
  return out;
}

/** Water depth (m) at a tile `dist` tiles from the shore (0 = land). */
export function waterDepth(dist: number, tile: number, W: Pick<WaterRules, 'shoreSlope' | 'maxDepth'>): number {
  if (dist <= 0) return 0;
  // The middle of the first water tile is half a tile from the bank.
  return Math.min(W.maxDepth, (dist - 0.5) * tile * W.shoreSlope);
}

/**
 * How a unit crosses water `depth` m deep: units in `wadeRoles` always wade; below chest height
 * everyone wades; deeper, people with boats ride a dugout (a raft with a heavy load), the rest swim.
 */
export function waterWay(
  depth: number,
  role: string,
  hasBoats: boolean,
  load: string | null,
  W: Pick<WaterRules, 'chestDepth' | 'wadeRoles' | 'raftLoads'>,
): WaterWay {
  if (depth <= 0) return 'land';
  if (W.wadeRoles.includes(role) || depth < W.chestDepth) return 'wade';
  if (!hasBoats) return 'swim';
  return load && (W.raftLoads as string[]).includes(load) ? 'raft' : 'boat';
}

/** Share of the walking pace on water (boats and rafts at `boatSpeed`). */
export function waterSpeed(way: WaterWay, W: Pick<WaterRules, 'wadeSpeed' | 'swimSpeed'>, boatSpeed: number): number {
  return way === 'land' ? 1 : way === 'wade' ? W.wadeSpeed : way === 'swim' ? W.swimSpeed : boatSpeed;
}
