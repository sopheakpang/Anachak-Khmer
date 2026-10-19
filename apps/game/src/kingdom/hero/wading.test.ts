import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { Ripples, smoothDepth, wadeDrop, wakeDue } from './wading';

/** PK 2026-10-20 (D156): the 3D hero stands in the water, and the water answers. */

const W = loadKingdom().anachak.hero.fx.water;

describe('wading', () => {
  it('stands in the water by its depth, never deeper than the chest, dry on land', () => {
    expect(wadeDrop(0, -0.12, 1.3, W.sink)).toBe(0);
    const knee = wadeDrop(0.5, -0.12, 1.3, W.sink);
    const chest = wadeDrop(1.3, -0.12, 1.3, W.sink);
    expect(knee).toBeLessThan(-0.5);
    expect(chest).toBeLessThan(knee);
    expect(wadeDrop(4, -0.12, 1.3, W.sink)).toBe(chest); // no deeper than the chest
    // From the bank he eases in: a few cm of water barely lowers him.
    expect(wadeDrop(0.05, -0.12, 1.3, W.sink)).toBeGreaterThan(-0.1);
  });

  it('the depth eases between tiles instead of stepping at each edge', () => {
    // Tiles of 2 m: dry west of x = 0, 1 m deep east of it.
    const depthAt = (x: number) => (x >= 0 ? 1 : 0);
    const xs = Array.from({ length: 41 }, (_, i) => -2 + i * 0.1);
    const d = xs.map((x) => smoothDepth(depthAt, x, 0, 2));
    for (let i = 1; i < d.length; i++) {
      expect(d[i]!).toBeGreaterThanOrEqual(d[i - 1]! - 1e-9);
      expect(d[i]! - d[i - 1]!).toBeLessThan(0.11); // no jump
    }
    expect(d[0]).toBe(0);
    expect(d[d.length - 1]).toBeCloseTo(1, 6);
  });

  it('rings spread faster walking than standing; only running splashes', () => {
    expect(wakeDue(W, true, false).ring).toBeLessThan(wakeDue(W, false, false).ring);
    expect(wakeDue(W, true, false).splash).toBe(Infinity);
    expect(wakeDue(W, true, true).splash).toBe(W.splashSec);
  });

  it('a ring grows, fades and goes', () => {
    const r = new Ripples(4);
    r.spawn(0, -0.12, 0, 2.4, 1);
    expect(r.live).toBe(1);
    r.update(0.5);
    const ring = r.group.children.find((c) => c.visible)!;
    expect(ring.scale.x).toBeGreaterThan(1);
    r.update(0.6);
    expect(r.live).toBe(0);
    // The pool is reused round and round.
    for (let i = 0; i < 9; i++) r.spawn(i, 0, 0, 1);
    expect(r.live).toBe(4);
    r.dispose();
  });
});
