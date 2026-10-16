import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL } from './sim';
import { dangerZones, dangersNear, edgeArrowAngle, insideDanger } from './danger';

/** PK 1.9.0 (D146 ខ៦ A + C): red rings round dangers, an edge arrow, a key to hide them. */

const data = loadKingdom();
const D = data.anachak.dangerZones;
const quiet = () => {
  const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const reveal = (s: KingdomSim) => {
  s.fog.explored.fill(1);
  s.fog.visible.fill(1);
};

describe('danger zones', () => {
  it('config: on at the start, an arrow within 60 m, a key in both key groups', () => {
    expect(D.on).toBe(true);
    expect(D.near).toBe(60);
    expect(data.controls.map.some((a) => a.id === 'dangers')).toBe(true);
    expect(data.controls.hero.some((a) => a.id === 'dangers')).toBe(true);
  });

  it('a predator on explored land is a ring of its sense range; shy animals are not', () => {
    const s = quiet();
    reveal(s);
    const zones = dangerZones(s);
    const beasts = zones.filter((z) => z.kind === 'beast');
    expect(beasts.length).toBeGreaterThan(0);
    for (const z of beasts) {
      const a = s.animals.get(z.id)!;
      expect(s.dangerous(a)).toBe(true);
      expect(z.r).toBeGreaterThanOrEqual(D.beastMin);
      expect(z.r).toBeGreaterThanOrEqual(s.kindOf(a).range);
    }
    const shy = [...s.animals.values()].filter((a) => s.kindOf(a).behaviour === 'shy');
    for (const a of shy) expect(beasts.some((z) => z.id === a.id)).toBe(false);
  });

  it('nothing on land the player has never seen', () => {
    const s = quiet();
    s.fog.explored.fill(0);
    s.fog.visible.fill(0);
    expect(dangerZones(s)).toHaveLength(0);
  });

  it('a seen raider gets the raid ring; a hidden one none; a known rival camp the camp ring', () => {
    const s = quiet();
    reveal(s);
    const h = [...s.buildings.values()].find((b) => b.team === PLAYER && b.type === 'townCentre')!;
    const r = s.spawnNear(h, 'spearman', RIVAL);
    let zones = dangerZones(s);
    const raid = zones.find((z) => z.kind === 'raid' && z.id === r.id)!;
    expect(raid.r).toBe(D.raidRadius);
    s.fog.visible.fill(0);
    zones = dangerZones(s);
    expect(zones.some((z) => z.kind === 'raid')).toBe(false);
    expect(zones.filter((z) => z.kind === 'camp').every((z) => z.r === D.campRadius)).toBe(true);
  });

  it('near: by the gap to the ring’s edge, nearest first, capped', () => {
    const zones = [
      { kind: 'beast' as const, x: 50, z: 0, r: 8, id: 1 },
      { kind: 'raid' as const, x: 20, z: 0, r: 10, id: 2 },
      { kind: 'camp' as const, x: 200, z: 0, r: 24, id: 3 },
    ];
    const near = dangersNear(zones, 0, 0, 60);
    expect(near.map((z) => z.id)).toEqual([2, 1]);
    expect(dangersNear(zones, 0, 0, 60, 1)).toHaveLength(1);
    expect(insideDanger(zones, 25, 0)?.id).toBe(2);
    expect(insideDanger(zones, 0, 100)).toBeNull();
  });

  it('the edge arrow: ahead is up, the camera’s right is right, behind is down', () => {
    // Camera at yaw π looks along +z (HeroCore: forward = yaw + π); its right is −x.
    expect(edgeArrowAngle(Math.PI, 0, 0, 0, 10)).toBeCloseTo(0, 5);
    expect(edgeArrowAngle(Math.PI, 0, 0, -10, 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(edgeArrowAngle(Math.PI, 0, 0, 10, 0)).toBeCloseTo(-Math.PI / 2, 5);
    expect(Math.abs(edgeArrowAngle(Math.PI, 0, 0, 0, -10))).toBeCloseTo(Math.PI, 5);
  });
});
