import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL } from './sim';

const data = loadKingdom();

const calm = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  s.addResources({ food: 5000, wood: 5000, stone: 5000, gold: 5000 });
  return s;
};

/** The first spot near (x0, z0) where `ok` says yes. */
function spotNear(x0: number, z0: number, ok: (x: number, z: number) => boolean): [number, number] {
  for (let r = 4; r < 60; r++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (ok(x0 + dx, z0 + dz)) return [x0 + dx, z0 + dz];
  throw new Error('no spot');
}

describe('moving buildings (PK 1.6.0)', () => {
  it('sets a house down elsewhere: the old ground opens, the new ground is taken', () => {
    const s = calm();
    const [sx, sz] = s.map.start;
    const [hx, hz] = spotNear(sx, sz, (x, z) => s.canPlace('house', x, z) === null);
    const r = s.place('house', hx, hz);
    expect(r.ok).toBe(true);
    const id = (r as { id: number }).id;
    const b = s.buildings.get(id)!;
    expect(s.movable(id)).toBe(true);
    const [mx, mz] = spotNear(hx + 8, hz + 8, (x, z) => Math.abs(x - hx) > 3 && s.canMove(id, x, z) === null);
    const before = s.events.length;
    expect(s.moveBuilding(id, mx, mz)).toEqual({ ok: true, id });
    expect([b.tx, b.tz]).toEqual([mx, mz]);
    expect(s.grid.ok(hx, hz)).toBe(true);
    expect(s.grid.ok(mx, mz)).toBe(false);
    expect(s.events.slice(before).some((e) => e.kind === 'moved')).toBe(true);
    // A new house fits on the old ground again.
    expect(s.canPlace('house', hx, hz)).toBeNull();
  });

  it('cannot go onto another building, and its own old spot does not block a short shift', () => {
    const s = calm();
    const [sx, sz] = s.map.start;
    const [hx, hz] = spotNear(sx, sz, (x, z) => s.canPlace('house', x, z) === null);
    const id = (s.place('house', hx, hz) as { id: number }).id;
    const town = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === PLAYER)!;
    expect(s.canMove(id, town.tx, town.tz)).toBe('blocked');
    // One tile over overlaps the house's own old footprint, which is fine when that tile is open.
    const shift = [1, 0, -1].flatMap((dx) => [1, 0, -1].map((dz) => [hx + dx, hz + dz] as const));
    expect(shift.some(([x, z]) => (x !== hx || z !== hz) && s.canMove(id, x, z) === null)).toBe(true);
  });

  it('keeps the historical temples, rival buildings and switched-off moving where they are', () => {
    const s = calm();
    const [mx, mz] = s.monumentSpot();
    const tid = s.addBuilding('monument', PLAYER, mx, mz, 0.5, s.chapterData.temple).id;
    expect(s.movable(tid)).toBe(false);
    expect(s.moveBuilding(tid, mx + 20, mz + 20)).toEqual({ ok: false, reason: 'fixed' });
    const rival = [...s.buildings.values()].find((b) => b.team === RIVAL)!;
    expect(s.movable(rival.id)).toBe(false);
    const town = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === PLAYER)!;
    expect(s.movable(town.id)).toBe(true);
    s.data.rules.moveBuilding.enabled = false;
    expect(s.movable(town.id)).toBe(false);
    s.data.rules.moveBuilding.enabled = true;
  });

  it('charges the configured share of the price per move', () => {
    const s = calm();
    const [sx, sz] = s.map.start;
    const [hx, hz] = spotNear(sx, sz, (x, z) => s.canPlace('house', x, z) === null);
    const id = (s.place('house', hx, hz) as { id: number }).id;
    const share = s.data.rules.moveBuilding.costShare;
    s.data.rules.moveBuilding.costShare = 0.5;
    try {
      const cost = s.moveCost('house');
      const wood = data.buildings.house!.cost.wood ?? 0;
      if (wood) expect(cost.wood).toBe(Math.ceil(wood * 0.5));
      const have = s.res[PLAYER].wood;
      const [mx, mz] = spotNear(hx + 8, hz, (x, z) => Math.abs(x - hx) > 3 && s.canMove(id, x, z) === null);
      expect(s.moveBuilding(id, mx, mz).ok).toBe(true);
      expect(s.res[PLAYER].wood).toBe(have - (cost.wood ?? 0));
    } finally {
      s.data.rules.moveBuilding.costShare = share;
    }
  });
});

describe('PK 2026-10-20 (D160): stuck in traffic, find a new route', () => {
  it('a walker held up by people standing in the lane plans round them and gets there', () => {
    const s = calm();
    const T = data.rules.traffic;
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === PLAYER)!;
    // An open run of 14 tiles with open rows either side.
    const [x0, z0] = spotNear(hall.tx + 6, hall.tz + 6, (x, z) => {
      for (let i = 0; i < 14; i++)
        for (let dz = -2; dz <= 2; dz++) if (!s.grid.ok(x + i, z + dz)) return false;
      return true;
    });
    const at = (x: number, z: number): [number, number] => [
      (x + 0.5) * s.map.tile - (s.map.size * s.map.tile) / 2,
      (z + 0.5) * s.map.tile - (s.map.size * s.map.tile) / 2,
    ];
    const walker = s.spawnNear(hall, 'villager');
    [walker.x, walker.z] = at(x0, z0);
    const goal = at(x0 + 13, z0);
    // A knot of people standing still across the lane at its middle.
    for (const dz of [0, 0, 0, 0]) {
      const p = s.spawnNear(hall, 'villager');
      [p.x, p.z] = at(x0 + 6, z0 + dz);
      p.task = { kind: 'idle' };
    }
    walker.task = { kind: 'move', to: goal };
    let detoured = false;
    for (let i = 0; i < 600; i++) {
      s.update(0.05);
      if ((walker.detourUntil ?? -1) > s.time) detoured = true;
      // The knot stands its ground (as people at work would).
      for (const u of s.units.values()) if (u !== walker && u.task.kind === 'idle') u.anim = 'idle';
      if (Math.hypot(walker.x - goal[0], walker.z - goal[1]) < 1.5) break;
    }
    expect(Math.hypot(walker.x - goal[0], walker.z - goal[1])).toBeLessThan(1.5);
    expect(T.checkSec).toBeGreaterThan(0);
    expect(detoured).toBe(true);
  });

  it('the walls are only for planning: the grid is open again afterwards', () => {
    const s = calm();
    const before = Uint8Array.from(s.grid.open);
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === PLAYER)!;
    for (let i = 0; i < 6; i++) s.spawnNear(hall, 'villager');
    const w = s.spawnNear(hall, 'villager');
    w.detourUntil = 1e9;
    w.task = { kind: 'move', to: [w.x + 20, w.z + 4] };
    for (let i = 0; i < 40; i++) s.update(0.05);
    // Buildings may not change in 2 s of a calm game; every tile is as it was.
    expect(s.grid.open.every((v, i) => v === before[i])).toBe(true);
  });
});
