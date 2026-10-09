import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { fitTree, nearOrFar, pickWeighted, villageTrees, waysideTrees, type Lot, type TreeSpot } from './treeModels';

const P = loadKingdom().props;
const T = P.trees!;
const L = P.treePlacement!;
const ids = new Set(T.map((t) => t.id));

describe("PK 1.8.0: PK's trees", () => {
  it('every tree the rules name has a model and picture cards that ship with the game', () => {
    for (const f of L.forest) expect(ids.has(f.id)).toBe(true);
    expect(ids.has(L.village.coconut)).toBe(true);
    for (const b of L.village.banana) expect(ids.has(b)).toBe(true);
    for (const w of L.wayside.kinds) expect(ids.has(w.id)).toBe(true);
    const shipped = Object.keys(import.meta.glob('../../../public-mobile/models/trees/*'));
    for (const t of T) {
      expect(shipped.some((f) => f.endsWith(t.file))).toBe(true);
      expect(shipped.some((f) => f.endsWith(t.cards))).toBe(true);
      expect(t.height).toBeGreaterThan(0);
    }
    // The forest is all PK's models now (no built-in kinds left in the mix).
    expect(L.forest.every((f) => f.id !== 'bamboo')).toBe(true);
  });

  it('a model is fitted to its height, or smaller when its crown would be too wide', () => {
    const tall = fitTree(new THREE.BoxGeometry(1, 2, 1), 6, 10);
    tall.computeBoundingBox();
    expect(tall.boundingBox!.max.y - tall.boundingBox!.min.y).toBeCloseTo(6);
    expect(tall.boundingBox!.min.y).toBeCloseTo(0);
    const wide = fitTree(new THREE.BoxGeometry(4, 2, 4), 6, 4.4);
    wide.computeBoundingBox();
    expect(wide.boundingBox!.max.x - wide.boundingBox!.min.x).toBeCloseTo(4.4);
    expect(wide.boundingBox!.max.y - wide.boundingBox!.min.y).toBeLessThan(6);
  });

  it('the nearest trees get the detailed model while the triangle budget lasts, the rest picture cards', () => {
    const spots: TreeSpot[] = Array.from({ length: 20 }, (_, i) => ({ id: 'e', x: i * 3, y: 0, z: 0, rot: 0, scale: 1, shade: 1 }));
    const near = nearOrFar(spots, 0, 0, 25_000, () => 6000);
    expect(near.filter(Boolean).length).toBe(4);
    expect(near.slice(0, 4).every(Boolean)).toBe(true);
    expect(near.slice(4).some(Boolean)).toBe(false);
    expect(L.nearTris.hero).toBeGreaterThan(L.nearTris.rts);
  });

  it('weighted picks follow the weights', () => {
    const list = [
      { id: 'x', weight: 1 },
      { id: 'y', weight: 3 },
    ];
    expect(pickWeighted(list, 0.1).id).toBe('x');
    expect(pickWeighted(list, 0.5).id).toBe('y');
    expect(pickWeighted(list, 0.999).id).toBe('y');
  });

  it('every house of a hamlet of three or more has a coconut and a banana, never inside a building', () => {
    const house = (x: number, z: number): Lot => ({ type: 'house', x, z, w: 4, d: 4 });
    const lots: Lot[] = [house(0, 0), house(0, 8), house(9, 4), house(80, 0), house(88, 0), { type: 'storehouse', x: 6, z: -8, w: 6, d: 6 }];
    const trees = villageTrees(lots, L.village, () => true);
    const near = (h: Lot, id: string) => trees.some((t) => t.id === id && Math.hypot(t.x - h.x, t.z - h.z) < 6);
    for (const h of lots.slice(0, 3)) {
      expect(near(h, L.village.coconut)).toBe(true);
      expect(L.village.banana.some((b) => near(h, b))).toBe(true);
    }
    // Two houses on their own: no yard trees.
    for (const h of lots.slice(3, 5)) expect(trees.some((t) => Math.hypot(t.x - h.x, t.z - h.z) < 8)).toBe(false);
    for (const t of trees) for (const b of lots) expect(Math.abs(t.x - b.x) < b.w / 2 && Math.abs(t.z - b.z) < b.d / 2).toBe(false);
    // Same houses, same trees.
    expect(villageTrees(lots, L.village, () => true)).toEqual(trees);
  });

  it('palms and coconuts stand now and then beside the worn paths near a storehouse, not on them', () => {
    const tile = 2;
    const half = 100;
    // A worn path along tz = 50 from the storehouse eastward.
    const wear = (tx: number, tz: number) => (tz === 50 && tx >= 50 && tx <= 75 ? 0.8 : 0);
    const W = { ...L.wayside, share: 1 };
    const trees = waysideTrees([{ x: 1, z: 1 }], W, tile, half, wear, () => true);
    expect(trees.length).toBeGreaterThan(10);
    for (const t of trees) {
      const tx = Math.floor((t.x + half) / tile);
      const tz = Math.floor((t.z + half) / tile);
      expect(wear(tx, tz)).toBe(0); // never on the path itself
      const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => wear(tx + dx!, tz + dz!) > 0 || wear(tx + 2 * dx!, tz + 2 * dz!) > 0);
      expect(beside).toBe(true);
      expect(L.wayside.kinds.some((k) => k.id === t.id)).toBe(true);
      expect(Math.hypot(t.x - 1, t.z - 1)).toBeLessThanOrEqual(L.wayside.radius + tile);
    }
    // With the configured share only some of those places get one.
    const some = waysideTrees([{ x: 1, z: 1 }], L.wayside, tile, half, wear, () => true);
    expect(some.length).toBeLessThan(trees.length);
    // No path, no wayside trees.
    expect(waysideTrees([{ x: 1, z: 1 }], W, tile, half, () => 0, () => true)).toEqual([]);
  });
});
