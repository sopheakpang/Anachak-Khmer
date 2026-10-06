import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';
import { rahatSpot, riceLook, riceStage } from './rice';
import { ACT } from '../../engine/figures';

/** PK: the farmers sow, water with the rahat, transplant and reap; the rice grows to harvest. */

const data = loadKingdom();
const R = data.rules.rice;

function farm() {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
  let f = null;
  for (let r = 6; r < 40 && !f; r++)
    if (!s.canPlace('riceField', hall.tx + r, hall.tz + 2))
      f = s.addBuilding('riceField', PLAYER, hall.tx + r, hall.tz + 2, 1);
  const v = [...s.units.values()].find((u) => u.team === PLAYER && u.type === 'villager')!;
  return { s, f: f!, v };
}

describe('the rice year', () => {
  it('has the five stages in order: sow, water with the rahat, transplant, grow, reap', () => {
    expect(R.stages.map((x) => x.id)).toEqual(['sow', 'water', 'transplant', 'grow', 'harvest']);
    for (let i = 1; i < R.stages.length; i++)
      expect(R.stages[i]!.until).toBeGreaterThan(R.stages[i - 1]!.until);
    expect(R.stages.at(-1)!.until).toBe(1);
  });

  it('moves on while a farmer works the field, and the harvest brings food in', () => {
    const { s, f, v } = farm();
    s.cmdFarm([v.id], f.id);
    const seen = new Set<string>();
    let harvests = 0;
    for (let i = 0; i < (R.cycleSec + 120) * 4; i++) {
      s.update(0.25);
      seen.add(riceStage(s, f).id);
      harvests = s.events.filter((e) => e.kind === 'delivered' && e.n === R.harvestFood).length;
      if (harvests) break;
    }
    expect([...seen]).toEqual(['sow', 'water', 'transplant', 'grow', 'harvest']);
    expect(harvests).toBe(1);
    expect(f.grow).toBeLessThan(0.2);
  });

  it('stands still with nobody working it', () => {
    const { s, f } = farm();
    s.update(60);
    expect(f.grow ?? 0).toBe(0);
  });

  it('looks right at each stage: a seedling bed, then rows that grow tall, turn gold and are reaped', () => {
    const { s, f } = farm();
    const at = (g: number) => {
      f.grow = g;
      return riceLook(s, f);
    };
    expect(at(0.05).rows).toBe(false);
    expect(at(0.3).rows).toBe(true);
    expect(at(0.8).height).toBeGreaterThan(at(0.5).height);
    expect(at(0.5).ripe).toBe(0);
    expect(at(0.95).ripe).toBeGreaterThan(0.5);
    expect(at(0.99).cut).toBeGreaterThan(at(0.9).cut);
  });

  it('the rahat stands on the west bund; the farmer treads it while watering', () => {
    const { s, f } = farm();
    const [x, z] = rahatSpot(s, f);
    const [cx, cz] = s.center(f);
    expect(x).toBeLessThan(cx - (f.w * s.map.tile) / 2 + 0.01);
    expect(z).toBe(cz);
    expect(ACT.sow).not.toBe(ACT.pedal);
    expect(ACT.reap).toBeGreaterThan(ACT.plant);
  });
});
