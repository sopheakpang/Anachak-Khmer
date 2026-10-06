import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';

const data = loadKingdom();

describe('woodcutting (PK 1.7.0)', () => {
  it('the last cut fells the tree: a felled event at the tree, away from the woodcutter', () => {
    const s = new KingdomSim(data, 'easy');
    s.ai.nextRaid = 1e9;
    s.autoWork = false;
    const v = [...s.units.values()].find((u) => u.team === PLAYER && u.type === 'villager')!;
    const tree = [...s.nodes.values()]
      .filter((n) => n.kind === 'tree')
      .sort((a, b) => {
        const [ax, az] = s.nodePos(a);
        const [bx, bz] = s.nodePos(b);
        return Math.hypot(ax - v.x, az - v.z) - Math.hypot(bx - v.x, bz - v.z);
      })[0]!;
    tree.amount = 2; // nearly cut through
    s.cmdGather([v.id], tree.id);
    for (let i = 0; i < 600 && s.nodes.has(tree.id); i++) s.update(0.25);
    expect(s.nodes.has(tree.id)).toBe(false);
    const e = s.events.find((x) => x.kind === 'felled');
    expect(e).toBeDefined();
    if (e?.kind === 'felled') {
      expect(e.at).toEqual(s.nodePos(tree));
      expect(Number.isFinite(e.dir)).toBe(true);
    }
  });
});
