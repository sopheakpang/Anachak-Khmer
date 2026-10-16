import { frontierY, type TempleKit } from '@temples/shared';

/**
 * How the Kingdom's Preah Ko kit follows the monument's build progress (PK 1.9.0, D147).
 * Pure so it can be tested. Before 1.9.0 a small rise only set the target and never showed the
 * stones, so the temple stayed half-empty and the finished temple appeared only after a reload.
 */

/** What to do when the shown stone count changes from `prev` to `next`. */
export function growStep(prev: number, next: number, progress: number): 'snap' | 'fly' | 'none' {
  if (next === prev) return 'none';
  // The first frame, a loaded save, a big jump, a fall (damage) or the finished temple: at once.
  if (prev < 0 || progress >= 1 || next < prev || next - prev > 12) return 'snap';
  return 'fly';
}

/** Big pieces (crowns, lintels, Nandi…) whose support is built: indexes to show. */
export function bigsDue(kit: TempleKit, filled: number): number[] {
  const done = filled >= kit.slots.length;
  const top = frontierY(kit, filled);
  const out: number[] = [];
  kit.bigPieces.forEach((b, i) => {
    if (done || b.y < top - 1e-6) out.push(i);
  });
  return out;
}
