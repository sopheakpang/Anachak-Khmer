import { describe, expect, it } from 'vitest';
import { kitFor } from '@temples/shared';
import { bigsDue, growStep } from './templeGrow';

/** PK 1.9.0 (D147): the Kingdom's Preah Ko rises stone by stone and shows whole the moment it is done. */
describe('the monument kit follows the build', () => {
  const kit = kitFor('preah-ko')!;
  const n = kit.slots.length;

  it('a small rise flies the new stones in (before 1.9.0 they were never shown)', () => {
    expect(growStep(100, 103, 0.3)).toBe('fly');
  });

  it('the finished temple, the first frame, a loaded save and a big jump appear at once', () => {
    expect(growStep(n - 2, n, 1)).toBe('snap');
    expect(growStep(-1, 0, 0)).toBe('snap');
    expect(growStep(10, 400, 0.4)).toBe('snap');
    expect(growStep(400, 380, 0.38)).toBe('snap');
    expect(growStep(50, 50, 0.2)).toBe('none');
  });

  it('every stone shows over a slow build that ends in a snap', () => {
    let shown = -1;
    let filled = 0;
    for (let p = 0; p <= 1.0001; p += 0.0005) {
      const next = Math.round(Math.min(1, p) * n);
      const step = growStep(shown, next, Math.min(1, p));
      if (step !== 'none') {
        shown = next;
        filled = next; // 'fly' shows them a moment later; 'snap' at once
      }
    }
    expect(filled).toBe(n);
  });

  it('big pieces wait for their support and all show when the temple is done', () => {
    expect(kit.bigPieces.length).toBeGreaterThan(0);
    expect(bigsDue(kit, 0).length).toBeLessThan(kit.bigPieces.length);
    expect(bigsDue(kit, n)).toHaveLength(kit.bigPieces.length);
    const half = bigsDue(kit, Math.floor(n / 2)).length;
    expect(half).toBeLessThanOrEqual(bigsDue(kit, n).length);
  });
});
