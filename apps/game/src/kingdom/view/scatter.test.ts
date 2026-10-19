import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { generateMap } from '../sim/map';
import { inHabitat, nearestSpots, rng, scatterPlan, type Spot } from './scatter';
import library from '../../../../../scripts/models/library.json';

/** PK 1.9.0 (D153): PK's plants, rocks and small life over the land in natural patterns. */

const data = loadKingdom();
const SC = data.props.scatter!;

describe('scatter config', () => {
  it('every kind is one of PK’s models in the matching table, with a sane budget', () => {
    const outs = new Set(library.items.filter((i) => 'out' in i && i.out).map((i) => `models/real/${(i as { out: string }).out}`));
    for (const k of SC.kinds) {
      expect(outs.has(k.file), k.file).toBe(true);
      expect(k.scale[0]).toBeLessThanOrEqual(k.scale[1]);
      expect(k.clump[0]).toBeLessThanOrEqual(k.clump[1]);
    }
    const tris = new Map(library.items.filter((i) => 'out' in i && i.out).map((i) => [`models/real/${(i as { out: string }).out}`, (i as { tris: number }).tris]));
    const worst = SC.kinds.reduce((a, k) => a + (tris.get(k.file) ?? 0) * k.maxVisible, 0);
    // Even with every habitat in view at once, the scatter stays under 650k triangles (PC only).
    expect(worst).toBeLessThan(650_000);
  });

  it('PK’s fantasy finds are rare: one clump on the whole map', () => {
    for (const id of ['glowcap', 'crystalTree', 'nebulaBloom', 'amberMushrooms', 'sunflower'])
      expect(SC.kinds.find((k) => k.id === id)?.rare, id).toBe(true);
  });
});

describe('the scatter plan', () => {
  const map = generateMap(data, data.campaign.map.seed, data.anachak.roads);
  const spots = scatterPlan(map, SC.kinds, map.seed, SC.clearHall);
  const T = map.tile;
  const half = (map.size * T) / 2;
  const tileOf = (s: Spot) => [Math.floor((s.x + half) / T), Math.floor((s.z + half) / T)] as const;

  it('is the same land every time (the map’s seed)', () => {
    const again = scatterPlan(map, SC.kinds, map.seed, SC.clearHall);
    expect(again.length).toBe(spots.length);
    expect(again.slice(0, 50)).toEqual(spots.slice(0, 50));
  });

  it('puts each kind only in its habitat (no reed in the river, no lily on land, nothing on a road)', () => {
    expect(spots.length).toBeGreaterThan(500);
    let bad = 0;
    for (const s of spots) {
      const [tx, tz] = tileOf(s);
      if (!inHabitat(map, tx, tz, SC.kinds[s.kind]!.habitat) || map.road?.[tz * map.size + tx]) bad++;
    }
    expect(bad).toBe(0);
  });

  it('keeps the royal hall’s ground clear', () => {
    const [sx, sz] = map.start;
    const near = spots.filter((s) => {
      const [tx, tz] = tileOf(s);
      return Math.hypot(tx - sx, tz - sz) < SC.clearHall - 2;
    });
    expect(near).toHaveLength(0);
  });

  it('rare kinds stay a handful on the whole map', () => {
    SC.kinds.forEach((k, i) => {
      if (k.rare) expect(spots.filter((s) => s.kind === i).length).toBeLessThanOrEqual(k.clump[1]);
    });
  });

  it('grows in clumps, not on a grid', () => {
    const grass = SC.kinds.findIndex((k) => k.id === 'grassTuft');
    const all = spots.filter((s) => s.kind === grass);
    const g = all.slice(0, 300);
    // Most tufts have another within their clump's spread.
    const close = g.filter((a) => all.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < SC.kinds[grass]!.spread * 2));
    expect(close.length / g.length).toBeGreaterThan(0.8);
  });
});

describe('the nearest spots', () => {
  const spots: Spot[] = Array.from({ length: 100 }, (_, i) => ({ kind: 0, x: i, z: 0, rot: 0, scale: 1 }));

  it('nearest first, within the radius, capped', () => {
    const n = nearestSpots(spots, 50, 0, 10, 5, [], 0);
    expect(n.map((s) => s.x)).toEqual([50, 49, 51, 48, 52]);
    expect(nearestSpots(spots, 50, 0, 3.5, 99, [], 0)).toHaveLength(7);
  });

  it('never under a building', () => {
    const n = nearestSpots(spots, 50, 0, 20, 99, [[50, 0, 4]], 1);
    for (const s of n) expect(Math.abs(s.x - 50)).toBeGreaterThanOrEqual(5);
  });

  it('rng is repeatable', () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
