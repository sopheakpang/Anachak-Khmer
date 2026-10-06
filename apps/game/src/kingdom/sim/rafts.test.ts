import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { findPath, Grid } from './map';

/** PK: people cross water on boats or bamboo rafts (ក្បូនឬស្សី). */

/** 20 × 20 tiles of land with a river across the middle (rows 9–10); no ford. */
function river(): Grid {
  const g = new Grid(20, 2);
  g.open.fill(1);
  for (let x = 0; x < 20; x++)
    for (const z of [9, 10]) {
      g.open[z * 20 + x] = 0;
      g.water[z * 20 + x] = 1;
    }
  return g;
}
const goal = { x0: 10, z0: 18, x1: 10, z1: 18 };

describe('crossing water on rafts', () => {
  it('without rafts the far bank cannot be reached', () => {
    const p = findPath(river(), [10, 1], goal, 60000, 0, false)!;
    const end = p.at(-1)!;
    expect(end[1]).toBeLessThan(9); // stopped on the near bank
  });

  it('with rafts the path crosses the river', () => {
    const p = findPath(river(), [10, 1], goal, 60000, 0, true)!;
    expect(p.at(-1)).toEqual([10, 18]);
  });

  it('prefers a ford (land) over a long raft trip when one is near', () => {
    const g = river();
    for (const z of [9, 10]) g.open[z * 20 + 12] = 1; // a ford at x = 12
    for (const z of [9, 10]) g.water[z * 20 + 12] = 0;
    const p = findPath(g, [12, 1], { x0: 12, z0: 18, x1: 12, z1: 18 }, 60000, 0, true)!;
    expect(p.at(-1)).toEqual([12, 18]);
  });

  it('water is never open for building', () => {
    const g = river();
    expect(g.ok(5, 9)).toBe(false);
    expect(g.pass(5, 9, true)).toBe(true);
    expect(g.pass(5, 9, false)).toBe(false);
  });

  it('the rules: rafts on, slower than walking, dearer to plan', () => {
    const r = loadKingdom().rules.rafts;
    expect(r.enabled).toBe(true);
    expect(r.speed).toBeLessThan(1);
    expect(r.cost).toBeGreaterThan(1);
  });
});
