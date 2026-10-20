import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from '../sim/sim';
import { hasRoofBar, roofBars } from './roofBars';

/** PK 2026-10-20 (D160): a progress bar over the roof, with what waits after the work in hand. */

const data = loadKingdom();
const fresh = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  for (const b of s.buildings.values()) b.queue.length = 0;
  return s;
};

describe('roof bars', () => {
  it('a training building: how far the first one is, then what waits, same kinds counted together', () => {
    const s = fresh();
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    const q = (id: string, left: number) => ({ kind: 'unit' as const, id, left, total: 20 });
    const [a, b] = Object.keys(data.units).slice(0, 2) as [string, string];
    hall.queue.push(q(a, 5), q(a, 20), q(a, 20), q(b, 20));
    const bar = roofBars(s, () => 6).find((r) => r.id === hall.id)!;
    expect(bar.frac).toBeCloseTo(0.75);
    expect(bar.en).toBe(data.units[a]!.en);
    expect(bar.pending).toEqual([
      { km: data.units[a]!.km, en: data.units[a]!.en, n: 2 },
      { km: data.units[b]!.km, en: data.units[b]!.en, n: 1 },
    ]);
    // Above the drawn roof.
    expect(bar.y).toBeGreaterThan(6);
    hall.queue.length = 0;
    expect(roofBars(s, () => 6).some((r) => r.id === hall.id)).toBe(false);
  });

  it('a building going up counts the builders on it', () => {
    const s = fresh();
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    let site;
    for (let r = 8; r < 40 && !site; r++)
      if (!s.canPlace('house', hall.tx + r, hall.tz))
        site = s.addBuilding('house', PLAYER, hall.tx + r, hall.tz, 0.4);
    const bar = roofBars(s, () => 4).find((r) => r.id === site!.id)!;
    expect(bar.frac).toBeCloseTo(0.4);
    expect(bar.builders).toBe(0);
    expect(hasRoofBar(site!)).toBe(true);
  });

  it('no bar over rice fields or the rival’s buildings; the rules keep it near the camera', () => {
    const s = fresh();
    for (const b of s.buildings.values()) {
      if (b.type === 'riceField' || b.team !== PLAYER) expect(hasRoofBar(b)).toBe(false);
    }
    const A = data.rules.alerts;
    expect(A.roofBars).toBeGreaterThan(0);
    expect(A.roofBarDist).toBeGreaterThan(0);
  });
});
