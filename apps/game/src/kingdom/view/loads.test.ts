import { describe, expect, it } from 'vitest';
import { loadGeometry } from './loads';

/** PK: workers carry real things home (no coloured box), light enough for many carriers. */
describe('carried loads', () => {
  it('each resource has its own model, with colours and limb data, under 600 triangles', () => {
    const sizes = new Set<number>();
    for (const r of ['food', 'wood', 'stone', 'gold'] as const) {
      const g = loadGeometry(r);
      const n = g.getAttribute('position').count;
      expect(g.getAttribute('color').count).toBe(n);
      expect(n / 3).toBeLessThan(600);
      sizes.add(n);
    }
    expect(sizes.size).toBe(4);
  });

  it('the logs ride on the shoulder (below the crown), baskets and blocks on the head', () => {
    const top = (r: 'food' | 'wood') => {
      const g = loadGeometry(r);
      g.computeBoundingBox();
      return g.boundingBox!;
    };
    expect(top('wood').max.y).toBeLessThan(0);
    expect(top('food').min.y).toBeGreaterThanOrEqual(-0.01);
  });
});
