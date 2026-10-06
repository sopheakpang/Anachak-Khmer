import { describe, expect, it } from 'vitest';
import { loadConfigs } from '@temples/shared';
import { Quarry } from './quarry';
import { CAMP, findPath, isWalkable, nearestOpen, walkGrid, ZONES } from './kulenMap';

const cfg = loadConfigs().expedition.quarry;
const grid = walkGrid();

describe('Old Quarry: cut a block, carry it to the camp pile', () => {
  it('rock faces are at the Old Quarry, reachable on foot; the pile is walkable ground at camp', () => {
    const qz = ZONES.find((z) => z.id === 'quarry')!;
    for (const [x, z] of cfg.faces) {
      expect(Math.hypot(x - qz.center[0], z - qz.center[1])).toBeLessThan(qz.radius);
      const stand = nearestOpen(grid, x, z, cfg.reach - 0.3);
      expect(stand, `${x},${z}`).not.toBeNull();
      expect(findPath(grid, CAMP, stand!), `path to ${x},${z}`).not.toBeNull();
    }
    const [px, pz] = cfg.pile;
    expect(isWalkable(grid, px, pz)).toBe(true);
    expect(Math.hypot(px - CAMP[0], pz - CAMP[1])).toBeLessThan(15);
  });

  it('cutting takes cutSec at a face in reach; then the block is carried (slower) and laid at the pile', () => {
    const q = new Quarry(cfg);
    const [fx, fz] = cfg.faces[0]!;
    expect(q.cut([fx + cfg.reach + 2, fz], 0)).toEqual({ ok: false, reason: 'far' });
    expect(q.cut([fx + 2, fz], 0)).toEqual({ ok: true, face: 0 });
    expect(q.cut([fx + 2, fz], 10)).toEqual({ ok: false, reason: 'busy' });
    expect(q.progress(cfg.cutSec * 500)).toBeCloseTo(0.5, 2);
    expect(q.update([fx + 2, fz], false, cfg.cutSec * 1000 - 1)).toBeNull();
    expect(q.update([fx + 2, fz], false, cfg.cutSec * 1000)).toBe('cut');
    expect(q.carrying).toBe(true);
    expect(q.speedFactor).toBe(cfg.carrySpeed);
    expect(q.cut([fx + 2, fz], 5000)).toEqual({ ok: false, reason: 'carrying' });
    // Walking home: nothing until the pile.
    expect(q.update([0, 0], true, 6000)).toBeNull();
    expect(q.update(cfg.pile, true, 7000)).toBe('delivered');
    expect(q.delivered).toBe(1);
    expect(q.carrying).toBe(false);
    expect(q.speedFactor).toBe(1);
  });

  it('walking away stops a cut; a fallen hero drops the block', () => {
    const q = new Quarry(cfg);
    const [fx, fz] = cfg.faces[1]!;
    q.cut([fx, fz + 2], 0);
    expect(q.update([fx, fz + 3], true, 500)).toBe('stopped');
    expect(q.state.kind).toBe('idle');
    q.cut([fx, fz + 2], 1000);
    q.update([fx, fz + 2], false, 1000 + cfg.cutSec * 1000);
    q.drop();
    expect(q.carrying).toBe(false);
    expect(q.delivered).toBe(0);
  });
});
