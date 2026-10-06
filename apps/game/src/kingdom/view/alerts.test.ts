import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from '../sim/sim';
import { ALERT_COLOR, beaconGeometry, beacons } from './alerts';

/** PK: light alerts for work in progress, finished, a full store; the bar shows what runs out. */

const data = loadKingdom();
const fresh = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  for (const b of s.buildings.values()) b.queue.length = 0;
  return s;
};
const spot = (s: KingdomSim, type: string, progress: number) => {
  const h = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
  for (let r = 8; r < 40; r++)
    if (!s.canPlace(type, h.tx + r, h.tz)) return s.addBuilding(type, PLAYER, h.tx + r, h.tz, progress);
  throw new Error('no room');
};

describe('light alerts', () => {
  it('a soft blue light over a building going up, none when it is done', () => {
    const s = fresh();
    const site = spot(s, 'house', 0.3);
    const at = (b: ReturnType<typeof spot>) => beacons(s, 1, []).filter((x) => x.x === s.center(b)[0]);
    expect(at(site).map((x) => x.kind)).toEqual(['progress']);
    site.progress = 1;
    expect(at(site)).toEqual([]);
  });

  it('an amber light over a full lumber camp waiting for a cart', () => {
    const s = fresh();
    const camp = spot(s, 'lumberCamp', 1);
    camp.stock = data.rules.alerts.campFull;
    expect(beacons(s, 1, []).some((b) => b.kind === 'full')).toBe(true);
    camp.stock = 10;
    expect(beacons(s, 1, []).some((b) => b.kind === 'full')).toBe(false);
  });

  it('a gold flash when finished, fading out by its end', () => {
    const s = fresh();
    const f = { x: 1, z: 2, r: 3, until: 10, sec: 2.5 };
    const early = beacons(s, 7.6, [f]).find((b) => b.kind === 'done')!;
    const late = beacons(s, 9.9, [f]).find((b) => b.kind === 'done')!;
    expect(early.glow).toBeGreaterThan(late.glow);
    expect(beacons(s, 10.1, [f]).some((b) => b.kind === 'done')).toBe(false);
  });

  it('colours tell the alerts apart; the light is a ring and a fading column', () => {
    expect(new Set(Object.values(ALERT_COLOR)).size).toBe(3);
    const g = beaconGeometry();
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    expect(data.rules.alerts.lowRes).toBeGreaterThan(0);
  });
});
