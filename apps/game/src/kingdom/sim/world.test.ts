import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { generateMap, tileToWorld, worldToTile } from './map';
import { KingdomSim, PLAYER, RIVAL, type Animal, type Unit } from './sim';

/**
 * The empire world (PK: 10× the map, laid out like the Khmer Empire map, D60), wild animals,
 * hunting and fishing (D61), automation, guards and the raid gate (D62), weather (D64).
 */

const data = loadKingdom();
const W = data.world;
const run = (sim: KingdomSim, sec: number) => sim.update(sec);
const villagers = (s: KingdomSim) =>
  [...s.units.values()].filter((u) => u.team === PLAYER && u.type === 'villager');
const tc = (s: KingdomSim) => [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
const calm = (seed?: number) => {
  const s = new KingdomSim(data, 'easy', true, seed);
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const put = (s: KingdomSim, kind: string, x: number, z: number): Animal => {
  const k = data.world.animals.kinds.find((a) => a.id === kind)!;
  const a: Animal = {
    id: 900000 + s.animals.size,
    kind,
    x,
    z,
    hp: k.hp,
    heading: 0,
    home: [x, z],
    target: null,
    fleeUntil: 0,
    fleeFrom: null,
    ready: 0,
    moving: false,
  };
  s.animals.set(a.id, a);
  return a;
};
const at = (m: ReturnType<typeof generateMap>, x: number, z: number) => m.terrain[z * m.size + x];

describe('the empire world (D60)', () => {
  const m = generateMap(data);

  it('is ten times the old map area and follows the Khmer Empire map', () => {
    expect(m.size).toBe(W.size);
    expect(m.size * m.size).toBeGreaterThanOrEqual(10 * 340 * 340);
    // The Great Lake and the sea in the south-west are water.
    expect(at(m, W.lake.center[0], W.lake.center[1])).toBe('water');
    expect(at(m, 20, m.size - 5)).toBe('water');
    // Every place of the empire stands on dry land, and they are all known to the map.
    // Hidden places (PK) keep their forest; the map clears ground only round the others.
    expect(m.places.map((p) => p.id)).toEqual(W.places.filter((p) => !p.hidden).map((p) => p.id));
    for (const p of W.places) expect(at(m, p.at[0], p.at[1]), p.id).not.toBe('water');
  });

  it('mountain ranges are walls with passes through them', () => {
    const dangrek = W.ranges.find((r) => r.id === 'dangrek')!;
    const hillsIn = (x: number) => {
      let n = 0;
      for (let z = dangrek.line - 30; z <= dangrek.line + 30; z++) if (at(m, x, z) === 'hill') n++;
      return n;
    };
    expect(hillsIn(420)).toBeGreaterThan(0);
    for (const [a, b] of dangrek.passes) expect(hillsIn(Math.round((a + b) / 2)), `pass ${a}`).toBe(0);
  });

  it('the same seed gives the same world; a new game seed moves trees, stone and gold', () => {
    const a = generateMap(data, 11);
    const b = generateMap(data, 11);
    const c = generateMap(data, 12);
    expect(a.nodes).toEqual(b.nodes);
    const spots = (x: typeof a, k: string) =>
      x.nodes
        .filter((n) => n.kind === k)
        .map((n) => `${n.tx},${n.tz}`)
        .join(' ');
    expect(spots(a, 'stone')).not.toBe(spots(c, 'stone'));
    expect(spots(a, 'gold')).not.toBe(spots(c, 'gold'));
    // Rivers, the lake and the temple sites stay where history put them.
    expect(a.sites).toEqual(c.sites);
    expect(at(a, W.lake.center[0], W.lake.center[1])).toBe(at(c, W.lake.center[0], W.lake.center[1]));
  });

  it('every new game has stone, gold and fruit within reach of the royal hall', () => {
    for (const seed of [1, 2, 3, 99]) {
      const g = generateMap(data, seed);
      const [sx, sz] = g.start;
      const near = (kind: string, r: number) =>
        g.nodes.some((n) => n.kind === kind && Math.hypot(n.tx - sx, n.tz - sz) <= r + 3);
      for (const [kind, r] of Object.entries(W.resources.nearStart))
        expect(near(kind, r.dist[1]), `${seed} ${kind}`).toBe(true);
    }
  });

  it('fish live on water tiles along the shores', () => {
    const fish = m.nodes.filter((n) => n.kind === 'fish');
    expect(fish.length).toBeGreaterThan(20);
    for (const f of fish.slice(0, 200)) expect(at(m, f.tx, f.tz)).toBe('water');
  });
});

describe('wild animals, hunting and fishing (D61)', () => {
  it('herds of every kind roam the forests and grasslands', () => {
    const s = calm();
    const kinds = new Set([...s.animals.values()].map((a) => a.kind));
    for (const k of W.animals.kinds) expect(kinds.has(k.id), k.id).toBe(true);
    expect(s.animals.size).toBeGreaterThan(100);
  });

  it('villagers hunt a deer, butcher it and carry the meat home as food', () => {
    const s = calm();
    const vs = villagers(s).slice(0, 3);
    const [cx, cz] = s.center(tc(s));
    const deer = put(s, 'deer', cx + 14, cz + 14);
    const food = s.res[PLAYER].food;
    s.cmdHunt(
      vs.map((v) => v.id),
      deer.id,
    );
    run(s, 90);
    expect(s.animals.has(deer.id)).toBe(false);
    expect(s.events.some((e) => e.kind === 'hunted')).toBe(true);
    expect(s.res[PLAYER].food).toBeGreaterThan(food);
  });

  it('a tiger attacks villagers who come near', () => {
    const s = calm();
    const vs = villagers(s);
    const v = vs[0]!;
    const hp = new Map(vs.map((u) => [u.id, u.hp]));
    put(s, 'tiger', v.x + 3, v.z + 3);
    run(s, 4);
    // It goes for the nearest person it can reach (D75), maybe not v itself.
    expect(vs.some((u) => !s.units.has(u.id) || s.units.get(u.id)!.hp < hp.get(u.id)!)).toBe(true);
  });

  it('fishing grounds are never used up: they grow back', () => {
    const s = calm();
    const f = s.fish[0]!;
    f.amount = 5;
    run(s, 60);
    expect(s.nodes.has(f.id)).toBe(true);
    expect(f.amount).toBeGreaterThan(5);
  });
});

describe('automation, guards and raids (D62)', () => {
  it('idle villagers find work by themselves, unless auto-work is off', () => {
    const on = calm();
    on.autoWork = true;
    for (const v of villagers(on)) v.task = { kind: 'idle' };
    run(on, data.rules.automation.idleSec + 2);
    expect(villagers(on).every((v) => v.task.kind !== 'idle')).toBe(true);
    expect(on.idleWorkers().length).toBe(0);

    const off = calm();
    for (const v of villagers(off)) v.task = { kind: 'idle' };
    run(off, data.rules.automation.idleSec + 2);
    expect(off.idleWorkers().length).toBe(villagers(off).length);
  });

  it('idle soldiers go out to meet raiders near the kingdom', () => {
    const s = calm();
    const guard = s.spawnNear(tc(s), 'spearman', PLAYER);
    guard.task = { kind: 'idle' };
    const foe = s.spawnNear(tc(s), 'spearman', RIVAL);
    foe.x += 20;
    foe.task = { kind: 'idle' };
    run(s, 1.5);
    expect(guard.task).toEqual({ kind: 'attack', unit: foe.id });
  });

  it('no raids come while the kingdom has no war camp; they start once it has one', () => {
    const s = new KingdomSim(data, 'normal');
    s.autoWork = false;
    const L = data.rules.ai.levels.normal;
    run(s, L.firstRaidSec + 20);
    expect(s.ai.wave).toBe(0);
    expect(s.ai.state).toBe('WAITING');
    s.addBuilding('barracks', PLAYER, s.map.start[0] + 6, s.map.start[1] - 8, 1);
    run(s, data.rules.raids.graceSec + 2);
    expect(s.ai.wave).toBe(1);
  });

  it('shift + right-click: a unit walks several spots in turn', () => {
    const s = calm();
    const v = villagers(s)[0]!;
    const a: [number, number] = [v.x + 16, v.z];
    const b: [number, number] = [v.x + 16, v.z + 16];
    s.cmdWaypoint([v.id], a);
    s.cmdWaypoint([v.id], b);
    let passedA = false;
    for (let i = 0; i < 40 && !(passedA && v.task.kind === 'idle'); i++) {
      run(s, 0.5);
      if (Math.hypot(v.x - a[0], v.z - a[1]) < 3) passedA = true;
    }
    expect(passedA).toBe(true);
    expect(Math.hypot(v.x - b[0], v.z - b[1])).toBeLessThan(3);
  });

  it('long walks across the world are planned leg by leg and arrive', () => {
    const s = calm();
    const v: Unit = villagers(s)[0]!;
    const [sx, sz] = worldToTile(s.map, v.x, v.z);
    // A dry spot about 150 tiles east.
    let goal: [number, number] | null = null;
    for (let dx = 150; dx < 220 && !goal; dx++) if (s.grid.ok(sx + dx, sz)) goal = [sx + dx, sz];
    const to = tileToWorld(s.map, goal![0], goal![1]);
    s.cmdMove([v.id], to);
    for (let i = 0; i < 160 && v.task.kind !== 'idle'; i++) run(s, 1);
    expect(Math.hypot(v.x - to[0], v.z - to[1])).toBeLessThan(4);
  });
});

describe('places, weather and Bokator swordsmen', () => {
  it('the first of your people to reach an empire place finds it and its gift', () => {
    const s = calm();
    const p = W.places[0]!;
    const [px, pz] = tileToWorld(s.map, p.at[0], p.at[1]);
    const v = villagers(s)[0]!;
    [v.x, v.z] = [px + 2, pz + 2];
    const gold = s.res[PLAYER].gold;
    run(s, 1.5);
    expect(s.discovered.has(p.id)).toBe(true);
    expect(s.res[PLAYER].gold).toBe(gold + (p.reward.gold ?? 0));
  });

  it('the weather changes every 30 minutes and slows work in a storm', () => {
    expect(data.rules.weather.cycleMin).toBe(30);
    const s = calm();
    expect(s.weather.next).toBeCloseTo(s.time + 30 * 60, 0);
    s.weather.next = s.time + 1;
    run(s, 2);
    expect(s.events.some((e) => e.kind === 'weather')).toBe(true);
    expect(s.weather.next).toBeGreaterThan(s.time + 29 * 60);
    const storm = data.rules.weather.kinds.find((k) => k.id === 'storm')!;
    expect(storm.gather).toBeLessThan(1);
    expect(storm.speed).toBeLessThan(1);
  });

  it('the war camp trains Bokator swordsmen', () => {
    const s = calm();
    s.addResources({ food: 500, gold: 500, wood: 500 });
    const b = s.addBuilding('barracks', PLAYER, s.map.start[0] + 6, s.map.start[1] - 8, 1);
    expect(s.train(b.id, 'swordsman').ok).toBe(true);
    run(s, data.units.swordsman!.trainSec + 1);
    expect([...s.units.values()].some((u) => u.team === PLAYER && u.type === 'swordsman')).toBe(true);
  });
});
