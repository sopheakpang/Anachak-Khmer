import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL, type Unit } from './sim';
import { lineSlots, lootOf, pairUp, rowOf, wieldsAxe } from './battle';

/** PK 2026-10-20 (D160): the raid on the village — the design PK chose. */

const data = loadKingdom();
const B = data.rules.battle;

/** A calm game with a war camp and a finished storehouse; the next raid waits. */
function setUp(): { s: KingdomSim; store: [number, number] } {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  const [sx, sz] = s.map.start;
  // Free ground of the building's size (the era may not allow it to be built by hand yet).
  const place = (type: string, x0: number, z0: number) => {
    const [w, d] = s.bdef(type).size;
    const free = (x: number, z: number) => {
      for (let j = -1; j <= d; j++) for (let i = -1; i <= w; i++) if (!s.grid.ok(x + i, z + j)) return false;
      return true;
    };
    for (let r = 4; r < 60; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          if (free(x0 + dx, z0 + dz)) return s.addBuilding(type, PLAYER, x0 + dx, z0 + dz, 1);
    throw new Error('no room');
  };
  place('barracks', sx + 6, sz - 8);
  const st = place('storehouse', sx - 8, sz + 6);
  return { s, store: s.center(st) };
}

const soldiers = (s: KingdomSim, n: number, type: string) => {
  const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === PLAYER)!;
  return Array.from({ length: n }, () => s.spawnNear(hall, type));
};

describe('the line of battle', () => {
  it('shields in front, spears behind, bows further back, riders on the flanks', () => {
    expect(rowOf('infantry', 'swordsman', B)).toBe('front');
    expect(rowOf('infantry', 'spearman', B)).toBe('second');
    expect(rowOf('ranged', 'archer', B)).toBe('back');
    expect(rowOf('cavalry', 'horseman', B)).toBe('flank');
    expect(rowOf('worker', 'villager', B)).toBeNull();
    const slots = lineSlots(
      [0, 0],
      [0, 1], // the raiders come from +z
      [
        { id: 1, row: 'front' },
        { id: 2, row: 'front' },
        { id: 3, row: 'second' },
        { id: 4, row: 'back' },
        { id: 5, row: 'flank' },
      ],
      B,
    );
    expect(slots.get(1)![1]).toBeCloseTo(0);
    expect(slots.get(3)![1]).toBeCloseTo(-B.rowGap);
    expect(slots.get(4)![1]).toBeCloseTo(-B.archerBack);
    // Across the way, spaced.
    expect(Math.abs(slots.get(1)![0] - slots.get(2)![0])).toBeCloseTo(B.spacing);
    expect(Math.abs(slots.get(5)![0])).toBeGreaterThan(Math.abs(slots.get(1)![0]));
  });

  it('when the lines meet, every raider is met before any is met twice', () => {
    const s = [1, 2, 3, 4].map((id) => ({ id, x: id, z: 0 }));
    const r = [10, 11].map((id) => ({ id, x: 2, z: 3 + id }));
    const pairs = pairUp(s, r);
    const count = (rid: number) => [...pairs.values()].filter((v) => v === rid).length;
    expect(count(10)).toBe(2);
    expect(count(11)).toBe(2);
    expect(pairUp(s, []).size).toBe(0);
  });

  it('a raider takes what he can carry, never more than the store has; one in a few has an axe', () => {
    expect(lootOf({ food: 1000, wood: 0, stone: 0, gold: 5 }, B)).toEqual({ food: B.steal.food, gold: 5 });
    expect(lootOf({ food: 0, wood: 0, stone: 0, gold: 0 }, B)).toEqual({});
    expect(wieldsAxe({ id: B.axeEvery * 4, type: 'spearman' }, B)).toBe(true);
    expect(wieldsAxe({ id: B.axeEvery * 4 + 1, type: 'spearman' }, B)).toBe(false);
    expect(wieldsAxe({ id: B.axeEvery * 4, type: 'archer' }, B)).toBe(false);
  });
});

describe('a raid on the village', () => {
  it('raiders make for the storehouse; the soldiers form the line between it and the camp', () => {
    const { s, store } = setUp();
    const mine = [...soldiers(s, 3, 'swordsman'), ...soldiers(s, 3, 'spearman'), ...soldiers(s, 2, 'archer')];
    s.ai.nextRaid = s.time;
    s.update(0.05);
    const raiders = [...s.units.values()].filter((u) => u.team === RIVAL && u.raid);
    expect(raiders.length).toBeGreaterThan(0);
    for (const r of raiders) {
      expect(r.task.kind).toBe('move');
      const to = (r.task as { to: [number, number] }).to;
      expect(Math.hypot(to[0] - store[0], to[1] - store[1])).toBeLessThan(5);
    }
    const bt = [...s.battles.values()][0]!;
    expect(Math.hypot(bt.line[0] - store[0], bt.line[1] - store[1])).toBeCloseTo(B.musterDist, 0);
    for (const u of mine) expect(u.battle?.wave).toBe(bt.wave);
    expect(s.events.some((e) => e.kind === 'muster' && e.n === mine.length)).toBe(true);
    // The archers stand behind the shields (nearer the store).
    const d = (u: Unit) => Math.hypot(u.battle!.slot[0] - store[0], u.battle!.slot[1] - store[1]);
    expect(d(mine[6]!)).toBeLessThan(d(mine[0]!));
  });

  it('a raider at the store takes goods; struck down, he drops them back; beaten, the soldiers cheer', () => {
    const { s, store } = setUp();
    const mine = soldiers(s, 2, 'swordsman');
    s.res[PLAYER].gold = 100;
    s.res[PLAYER].food = 100;
    s.ai.nextRaid = s.time;
    s.update(0.05);
    const raiders = [...s.units.values()].filter((u) => u.team === RIVAL && u.raid);
    const thief = raiders[0]!;
    [thief.x, thief.z] = store;
    s.update(0.05);
    expect(thief.raid?.loot).toBeTruthy();
    expect(s.res[PLAYER].gold).toBe(100 - Math.min(100, B.steal.gold ?? 0));
    expect(s.events.some((e) => e.kind === 'stolen')).toBe(true);
    // Struck down: the goods go back to the store.
    s.damageUnit(thief, 1e6, mine[0]!);
    expect(s.res[PLAYER].gold).toBe(100);
    expect(s.events.some((e) => e.kind === 'recovered')).toBe(true);
    for (const r of raiders) if (s.units.has(r.id)) s.damageUnit(r, 1e6, mine[0]!);
    s.update(0.05);
    expect(s.battles.size).toBe(0);
    expect(s.events.some((e) => e.kind === 'cheer')).toBe(true);
    for (const u of mine) {
      expect(u.battle).toBeUndefined();
      expect(u.cheerUntil).toBeGreaterThan(s.time);
    }
  });

  it('a shield-bearer blocks some close blows; every close blow pushes back', () => {
    const { s } = setUp();
    const [a] = soldiers(s, 1, 'swordsman');
    const raider = s.spawnNear(
      [...s.buildings.values()].find((b) => b.type === 'townCentre')!,
      'spearman',
      RIVAL,
    );
    let blocks = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      a!.hp = 1e6;
      a!.x = raider.x + 1;
      a!.z = raider.z;
      const before = s.events.length;
      s.damageUnit(a!, 10, raider);
      if (s.events.slice(before).some((e) => e.kind === 'block')) blocks++;
    }
    expect(blocks / n).toBeGreaterThan(B.blockChance - 0.1);
    expect(blocks / n).toBeLessThan(B.blockChance + 0.1);
    // Pushed away from the raider (when the ground lets him).
    a!.x = raider.x + 1;
    a!.z = raider.z;
    s.damageUnit(a!, 10, raider);
    expect(a!.x).toBeGreaterThanOrEqual(raider.x + 1);
  });

  it('a Royal Order can call a raid now, once', () => {
    const { s } = setUp();
    expect(s.startRaid()).toBe(true);
    s.update(0.05);
    expect([...s.units.values()].some((u) => u.team === RIVAL && u.raid)).toBe(true);
    expect(s.startRaid()).toBe(false); // one is out already
  });

  it('the hurt kneel and heal when no raider is near', () => {
    const { s } = setUp();
    const [u] = soldiers(s, 1, 'spearman');
    const max = s.def('spearman').hp;
    u!.hp = max * 0.2;
    u!.fought = true; // back from the line of battle
    for (let i = 0; i < 20; i++) s.update(0.1);
    expect(u!.resting).toBe(true);
    expect(u!.hp).toBeGreaterThan(max * 0.2);
    // Someone hurt who did not fight in the line does not (the rest houses are for them).
    const [v] = soldiers(s, 1, 'spearman');
    v!.hp = max * 0.2;
    for (let i = 0; i < 5; i++) s.update(0.1);
    expect(v!.resting).toBeFalsy();
  });
});
