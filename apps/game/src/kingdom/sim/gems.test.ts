import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, blocksTile, resourceOf } from './sim';
import { generateMap } from './map';

/** PK: hunters find gold, diamonds and gems — Cambodia's gems are Pailin sapphires and rubies. */

const data = loadKingdom();

describe('gems', () => {
  it('lie in the Pailin gem fields and scattered on the plains', () => {
    const map = generateMap(data, data.campaign.map.seed);
    const gems = map.nodes.filter((n) => n.kind === 'gems');
    expect(gems.length).toBeGreaterThan(8);
    for (const [x, z] of data.world.resources.gemFields)
      expect(gems.some((n) => Math.hypot(n.tx - x, n.tz - z) < 8)).toBe(true);
  });

  it('come after every older node, so older saves keep their node ids', () => {
    const map = generateMap(data, data.campaign.map.seed);
    const first = map.nodes.findIndex((n) => n.kind === 'gems');
    expect(map.nodes.slice(first).every((n) => n.kind === 'gems')).toBe(true);
  });

  it('pay in gold, faster than a gold rock, and block their tile like rock', () => {
    expect(resourceOf('gems')).toBe('gold');
    expect(blocksTile('gems')).toBe(true);
    expect(data.rules.economy.gemValue).toBeGreaterThan(1);
  });

  it('a villager mining gems carries gold, faster than from a gold rock', () => {
    const rate = (kind: 'gold' | 'gems') => {
      const s = new KingdomSim(data, 'easy');
      s.ai.nextRaid = 1e9;
      s.autoWork = false;
      const n = [...s.nodes.values()].find((x) => x.kind === kind)!;
      const v = [...s.units.values()].find((u) => u.team === PLAYER && u.type === 'villager')!;
      const [x, z] = s.nodePos(n);
      [v.x, v.z] = [x + 1.5, z];
      s.cmdGather([v.id], n.id);
      s.update(3);
      return v.carry?.res === 'gold' ? v.carry.n : 0;
    };
    expect(rate('gems')).toBeGreaterThan(rate('gold') * 1.5);
  });
});
