import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim } from '../sim/sim';
import {
  FAR,
  MID,
  NEAR,
  fitTree,
  inHallFront,
  nearCutout,
  nearOrFar,
  pickWeighted,
  treeLevels,
  villageTrees,
  waysideTrees,
  type Lot,
  type TreeSpot,
} from './treeModels';

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
    const spots: TreeSpot[] = Array.from({ length: 20 }, (_, i) => ({
      id: 'e',
      x: i * 3,
      y: 0,
      z: 0,
      rot: 0,
      scale: 1,
      shade: 1,
    }));
    const near = nearOrFar(spots, 0, 0, 25_000, () => 6000);
    expect(near.filter(Boolean).length).toBe(4);
    expect(near.slice(0, 4).every(Boolean)).toBe(true);
    expect(near.slice(4).some(Boolean)).toBe(false);
    expect(L.nearTris.hero).toBeGreaterThan(L.nearTris.rts);
  });

  it('1.8.0: three steps out from the camera: the model, its lighter copy, then picture cards', () => {
    const spots: TreeSpot[] = Array.from({ length: 30 }, (_, i) => ({
      id: i % 5 === 4 ? 'x' : 'e',
      x: i * 3,
      y: 0,
      z: 0,
      rot: 0,
      scale: 1,
      shade: 1,
    }));
    // 'x' has no lighter copy: it goes from the model straight to cards.
    const lv = treeLevels(
      spots,
      0,
      0,
      25_000,
      () => 6000,
      6_000,
      (id) => (id === 'x' ? Infinity : 1500),
    );
    expect([...lv.slice(0, 4)]).toEqual([NEAR, NEAR, NEAR, NEAR]);
    expect(lv.filter((l) => l === MID).length).toBe(4);
    const firstFar = lv.indexOf(FAR);
    expect(lv[4]).toBe(FAR); // spot 4 is an 'x'
    expect([...lv.slice(5, 9)]).toEqual([MID, MID, MID, MID]);
    expect([...lv.slice(9)].every((l) => l === FAR)).toBe(true);
    expect(firstFar).toBe(4);
    // No middle budget: the two-step rule, as before.
    expect([...treeLevels(spots, 0, 0, 25_000, () => 6000)].filter((l) => l === MID).length).toBe(0);
    // A lighter copy, where a tree has one, ships and is lighter than the model (D158: the
    // Blender forest trees a–f are ~4k triangles with leaf cards and go straight to picture
    // cards); the middle budget is set.
    const shipped = Object.keys(import.meta.glob('../../../public-mobile/models/trees/*'));
    for (const t of T) {
      if (!t.midFile) continue;
      expect(t.mid).toBeLessThan(t.hi / 2);
      expect(shipped.some((f) => f.endsWith(t.midFile!))).toBe(true);
    }
    expect(T.some((t) => t.midFile)).toBe(true);
    expect(L.midTris!.rts).toBeGreaterThan(0);
    expect(L.midTris!.hero).toBeGreaterThan(0);
  });

  it('D158: the Blender forest trees keep their leaf cut-out and stand at full height', () => {
    expect(nearCutout(new THREE.MeshStandardMaterial({ alphaTest: 0.5 }))).toBe(0.5);
    expect(nearCutout(new THREE.MeshStandardMaterial())).toBe(0);
    expect(nearCutout(null)).toBe(0);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const t = T.find((x) => x.id === id)!;
      expect(t.source).toContain('make_bigtree.py');
      expect(t.midFile).toBeUndefined();
      expect(t.height).toBeGreaterThanOrEqual(18);
      // The crown allowance is wide enough that fitTree keeps the full 18–21 m height.
      expect(t.width).toBeGreaterThanOrEqual(t.height * 0.8);
      expect(t.card).toBeGreaterThanOrEqual(1);
    }
  });

  it('D159: a leaf-card tree keeps its own normals (out of its clumps); others are worked out again', () => {
    const quad = new THREE.PlaneGeometry(2, 2); // faces +z
    const out = new Float32Array(quad.getAttribute('normal').count * 3);
    for (let i = 0; i < out.length; i += 3) out.set([0, 0.6, 0.8], i); // leaned up, as a clump's top
    quad.setAttribute('normal', new THREE.BufferAttribute(out, 3));
    const kept = fitTree(quad, 6, Infinity, true).getAttribute('normal');
    expect(kept.getY(0)).toBeCloseTo(0.6);
    expect(kept.getZ(0)).toBeCloseTo(0.8);
    const redone = fitTree(quad, 6).getAttribute('normal');
    expect(redone.getY(0)).toBeCloseTo(0);
    expect(Math.abs(redone.getZ(0))).toBeCloseTo(1);
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

  it('a hamlet of three or more houses has yard trees, never inside a building', () => {
    const house = (x: number, z: number): Lot => ({ type: 'house', x, z, w: 4, d: 4 });
    const lots: Lot[] = [
      house(0, 0),
      house(0, 8),
      house(9, 4),
      house(80, 0),
      house(88, 0),
      { type: 'storehouse', x: 6, z: -8, w: 6, d: 6 },
    ];
    const all = { ...L.village, share: 1 };
    const trees = villageTrees(lots, all, () => true);
    const near = (h: Lot, id: string) =>
      trees.some((t) => t.id === id && Math.hypot(t.x - h.x, t.z - h.z) < 6);
    for (const h of lots.slice(0, 3)) {
      expect(near(h, L.village.coconut)).toBe(true);
      expect(L.village.banana.some((b) => near(h, b))).toBe(true);
    }
    // Two houses on their own: no yard trees.
    for (const h of lots.slice(3, 5))
      expect(trees.some((t) => Math.hypot(t.x - h.x, t.z - h.z) < 8)).toBe(false);
    for (const t of trees)
      for (const b of lots)
        expect(Math.abs(t.x - b.x) < b.w / 2 && Math.abs(t.z - b.z) < b.d / 2).toBe(false);
    // Same houses, same trees.
    expect(villageTrees(lots, all, () => true)).toEqual(trees);
  });

  it('D160: fewer trees in the villages — only a share of the houses have yard trees', () => {
    expect(L.village.share).toBeGreaterThan(0);
    expect(L.village.share).toBeLessThan(1);
    const lots: Lot[] = [];
    for (let i = 0; i < 40; i++)
      lots.push({ type: 'house', x: (i % 8) * 9, z: Math.floor(i / 8) * 9, w: 4, d: 4 });
    const every = villageTrees(lots, { ...L.village, share: 1 }, () => true).length;
    const some = villageTrees(lots, L.village, () => true).length;
    expect(some).toBeLessThan(every * 0.75);
    expect(some).toBeGreaterThan(0);
  });

  it('D160: nothing grows in the royal hall’s open court', () => {
    const F = L.village.hallFront!;
    const hall = { type: 'townCentre', x: 0, z: 0 };
    expect(inHallFront([hall], 0, F.depth / 2, F)).toBe(true);
    expect(inHallFront([hall], F.halfWidth + 1, 5, F)).toBe(false);
    expect(inHallFront([hall], 0, -3, F)).toBe(false); // behind the hall
    expect(inHallFront([{ ...hall, type: 'house' }], 0, 5, F)).toBe(false);
    // Houses round the court: none of their yard trees lands in it.
    const lots: Lot[] = [
      { type: 'townCentre', x: 0, z: 0, w: 12, d: 12 },
      ...[-8, 0, 8].map((x) => ({ type: 'house', x, z: 14, w: 4, d: 4 })),
    ];
    for (const t of villageTrees(lots, { ...L.village, share: 1 }, () => true))
      expect(inHallFront(lots, t.x, t.z, F)).toBe(false);
    // In the game itself: no forest tree stands before the first hall.
    const s = new KingdomSim(loadKingdom(), 'easy');
    const h = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    const [cx, cz] = s.center(h);
    for (const n of s.nodes.values()) {
      if (n.kind !== 'tree') continue;
      const [x, z] = s.nodePos(n);
      expect(Math.abs(x - cx) <= F.halfWidth && z - cz >= 0 && z - cz <= F.depth).toBe(false);
    }
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
      const beside = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dz]) => wear(tx + dx!, tz + dz!) > 0 || wear(tx + 2 * dx!, tz + 2 * dz!) > 0);
      expect(beside).toBe(true);
      expect(L.wayside.kinds.some((k) => k.id === t.id)).toBe(true);
      expect(Math.hypot(t.x - 1, t.z - 1)).toBeLessThanOrEqual(L.wayside.radius + tile);
    }
    // With the configured share only some of those places get one.
    const some = waysideTrees([{ x: 1, z: 1 }], L.wayside, tile, half, wear, () => true);
    expect(some.length).toBeLessThan(trees.length);
    // No path, no wayside trees.
    expect(
      waysideTrees(
        [{ x: 1, z: 1 }],
        W,
        tile,
        half,
        () => 0,
        () => true,
      ),
    ).toEqual([]);
  });
});
