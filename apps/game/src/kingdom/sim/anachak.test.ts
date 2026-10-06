import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL, type Unit } from './sim';
import {
  battle,
  canLevy,
  fireGlow,
  nightness,
  tigerEncounter,
  levy,
  levyChoices,
  overview,
  rallyPoint,
  recruits,
  restsActive,
  soldiers,
} from './anachak';
import { findPath, generateMap, tileToWorld } from './map';
import { restore, serialize } from './save';

/**
 * Anachak Khmer (PK, D92): the king calls villagers to arms at each soldier's price, sends the
 * army to battle, sees his whole kingdom at a glance; the royal roads with their bridges, rest
 * houses and caravans.
 */

const data = loadKingdom();
const A = data.anachak;
const quiet = (variant: 'kingdom' | 'anachak' = 'anachak') => {
  const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, variant);
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const villagers = (s: KingdomSim) =>
  [...s.units.values()].filter((u) => u.team === PLAYER && u.type === 'villager');
const hall = (s: KingdomSim) => [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
const rich = (s: KingdomSim) =>
  Object.assign(s.res[PLAYER], { food: 5000, wood: 5000, stone: 5000, gold: 5000 });

describe('the levy: villagers become soldiers at the soldier’s price', () => {
  it('pays exactly the army type’s price for each recruit', () => {
    const s = quiet();
    rich(s);
    const before = { ...s.res[PLAYER] };
    const n = villagers(s).length;
    const r = levy(s, 'spearman', 3);
    expect(r).toEqual({ ok: true, id: 3 });
    const cost = data.units.spearman!.cost;
    for (const [k, v] of Object.entries(cost))
      expect(s.res[PLAYER][k as 'food']).toBe(before[k as 'food'] - (v ?? 0) * 3);
    expect(villagers(s)).toHaveLength(n - 3);
    expect(soldiers(s).filter((u) => u.type === 'spearman').length).toBeGreaterThanOrEqual(3);
    expect(s.events.some((e) => e.kind === 'levy' && e.unit === 'spearman' && e.n === 3)).toBe(true);
    expect(s.levied).toBe(3);
  });

  it('calls the idle first and leaves farmers in their fields', () => {
    const s = quiet();
    rich(s);
    const vs = villagers(s);
    const field = [...s.buildings.values()].find((b) => b.type === 'riceField');
    for (const u of vs)
      u.task = { kind: 'gather', node: null, field: null, res: 'wood', phase: 'go', near: [u.x, u.z] };
    vs[1]!.task = { kind: 'idle' };
    if (field) s.cmdFarm([vs[2]!.id], field.id);
    const first = recruits(s)[0]!;
    expect(first.id).toBe(vs[1]!.id);
    if (field) expect(recruits(s).some((u) => u.id === vs[2]!.id)).toBe(A.levy.keepFarmers ? false : true);
    levy(s, 'archer', 1);
    expect(s.units.get(vs[1]!.id)!.type).toBe('archer');
  });

  it('brings home what the recruit carried and sends him to the rally point', () => {
    const s = quiet();
    rich(s);
    const v = villagers(s)[0]!;
    for (const u of villagers(s)) u.task = { kind: 'build', building: hall(s).id };
    v.task = { kind: 'idle' };
    v.carry = { res: 'wood', n: 9 };
    const wood = s.res[PLAYER].wood;
    levy(s, 'spearman', 1);
    expect(s.res[PLAYER].wood).toBe(wood + 9 - (data.units.spearman!.cost.wood ?? 0));
    expect(v.carry).toBeNull();
    const task = v.task as Unit['task'];
    expect(task.kind).toBe('move');
    const [rx, rz] = rallyPoint(s);
    if (task.kind === 'move') expect(Math.hypot(task.to[0] - rx, task.to[1] - rz)).toBeLessThan(3);
    // Health keeps its share: a full villager is a full spearman.
    expect(v.hp).toBe(data.units.spearman!.hp);
  });

  it('cannot call without the price, past the houses, or before the era and the training', () => {
    const s = quiet();
    Object.assign(s.res[PLAYER], { food: 0, wood: 0, stone: 0, gold: 0 });
    expect(canLevy(s, 'spearman', 1)).toBe('cost');
    expect(levy(s, 'spearman', 1)).toEqual({ ok: false, reason: 'cost' });
    rich(s);
    expect(canLevy(s, 'warElephant', 1)).toBe('requires'); // elephant training first
    expect(canLevy(s, 'horseman', 1)).toBe('era'); // horsemen come with the Angkor Wat era
    expect(canLevy(s, 'villager', 1)).toBe('unknown'); // not an army type
    // Elephants take three places in the houses: past the room, no.
    s.techs.add('elephantTraining');
    expect(canLevy(s, 'warElephant', villagers(s).length)).toBe('pop');
  });

  it('only one commander, named from the era’s generals', () => {
    const s = quiet();
    rich(s);
    expect(levy(s, 'commander', 1).ok).toBe(true);
    const c = [...s.units.values()].find((u) => u.type === 'commander')!;
    expect(c.name).toBeDefined();
    expect(canLevy(s, 'commander', 1)).toBe('limit');
  });

  it('offers the army types of the era', () => {
    const s = quiet();
    const types = levyChoices(s).map((c) => c.type);
    expect(types).toContain('spearman');
    expect(types).toContain('archer');
    expect(types).not.toContain('villager');
    expect(types).not.toContain('horseman');
  });
});

describe('the king’s order to fight', () => {
  it('sends every soldier against the nearest raider he knows of', () => {
    const s = quiet();
    rich(s);
    levy(s, 'spearman', 3);
    const h = hall(s);
    const foe = s.spawnNear(h, 'spearman', RIVAL);
    foe.x += 30;
    s.updateFog();
    const b = battle(s);
    expect(b.n).toBe(soldiers(s).length);
    expect(b.to).toEqual([foe.x, foe.z]);
    for (const u of soldiers(s)) expect(u.task.kind === 'move' && u.task.attackMove).toBe(true);
    expect(s.events.some((e) => e.kind === 'battle' && e.to !== null)).toBe(true);
  });

  it('with no enemy in sight, the army gathers at the hall', () => {
    const s = quiet();
    rich(s);
    levy(s, 'archer', 2);
    const b = battle(s);
    expect(b.to).toBeNull();
    expect(s.events.some((e) => e.kind === 'battle' && e.to === null)).toBe(true);
  });
});

describe('the king’s overview', () => {
  it('counts resources, people by work, soldiers, houses, stores and what is being built', () => {
    const s = quiet();
    rich(s);
    const vs = villagers(s);
    vs[0]!.task = { kind: 'idle' };
    vs[1]!.task = { kind: 'gather', node: null, field: null, res: 'stone', phase: 'go', near: [0, 0] };
    levy(s, 'spearman', 1);
    const [tx, tz] = s.map.start;
    s.addBuilding('house', PLAYER, tx - 8, tz + 8, 0.4);
    const o = overview(s);
    expect(o.res.food).toBe(s.res[PLAYER].food);
    expect(o.people.total).toBe(villagers(s).length);
    expect(o.soldiers.spearman).toBeGreaterThanOrEqual(1);
    expect(o.rising.some((r) => r.type === 'house' && Math.abs(r.progress - 0.4) < 1e-9)).toBe(true);
    expect(o.stores.townCentre).toBe(1);
    expect(o.pop.cap).toBe(s.popCap());
    expect(o.temple.id).toBe(s.chapterData.temple);
    expect(o.levied).toBe(1);
    expect(o.roads.total).toBe(A.roads.routes.length);
  });
});

describe('the royal roads (Hendrickson 2010)', () => {
  it('are laid only in Anachak Khmer; the Kingdom world is unchanged', () => {
    const k = generateMap(data);
    const a = generateMap(data, data.campaign.map.seed, A.roads);
    expect(k.road).toBeUndefined();
    expect(a.road).toBeDefined();
    expect(a.roads!.routes.map((r) => r.id).sort()).toEqual(A.roads.routes.map((r) => r.id).sort());
    expect(quiet('kingdom').map.road).toBeUndefined();
  });

  it('run unbroken from the capital to each road’s end (bridges where they cross water)', () => {
    const s = quiet();
    const N = s.map.size;
    for (const r of s.map.roads!.routes)
      for (const [x, z] of r.line) expect(s.grid.ok(Math.round(x), Math.round(z))).toBe(true);
    // Water under a bridge is still a river for the drawing, walkable for people.
    const bridged = s.map.bridge!.reduce((a, b) => a + b, 0);
    expect(bridged).toBeGreaterThan(0);
    for (let i = 0; i < N * N; i++) if (s.map.bridge![i]) expect(s.map.terrain[i]).toBe('ford');
    // Spean Praptos is on the south-east road.
    expect(s.map.roads!.bridges.some((b) => b.id === 'speanPraptos' && b.route === 'southeast')).toBe(true);
    for (const rt of A.roads.routes) {
      const [ax, az] = rt.points[0]!;
      const [bx, bz] = rt.points[rt.points.length - 1]!;
      const p = findPath(s.grid, [ax, az], { x0: bx, z0: bz, x1: bx, z1: bz }, 300000);
      expect(p, rt.id).not.toBeNull();
      const end = p![p!.length - 1] ?? [ax, az];
      expect(Math.hypot(end[0] - bx, end[1] - bz), rt.id).toBeLessThan(3);
    }
  });

  it('are faster to walk, and paths prefer them', () => {
    const s = quiet();
    const line = s.map.roads!.routes.find((r) => r.id === 'west')!.line;
    const on = line[Math.floor(line.length / 2)]!;
    const [x, z] = tileToWorld(s.map, Math.round(on[0]), Math.round(on[1]));
    expect(s.onRoad(x, z)).toBe(true);
    const walk = (onRoad: boolean) => {
      const u = s.spawnNear(hall(s), 'villager');
      u.x = x;
      u.z = onRoad ? z : z + 40;
      u.task = { kind: 'move', to: [u.x + 6, u.z] };
      const x0 = u.x;
      s.update(0.5);
      s.units.delete(u.id);
      return u.x - x0;
    };
    expect(walk(true)).toBeGreaterThan(walk(false) * (A.roads.speed - 0.05));
    expect(s.grid.roadCost).toBe(A.roads.cost);
  });

  it('rest houses heal people near them from Jayavarman VII’s era only', () => {
    const s = quiet();
    expect(restsActive(s)).toBe(false);
    const h = s.map.roads!.rests[0]!;
    const [rx, rz] = tileToWorld(s.map, h.tx, h.tz);
    const u = s.spawnNear(hall(s), 'villager');
    u.x = rx + 3;
    u.z = rz;
    u.hp = 10;
    s.update(1.2);
    expect(u.hp).toBe(10);
    const j7 = data.campaign.chapters.findIndex((c) => c.era === A.roads.restEra);
    s.setChapter(j7);
    expect(restsActive(s)).toBe(true);
    u.x = rx + 3;
    u.z = rz;
    s.update(2.2);
    expect(u.hp).toBeGreaterThan(10);
    expect(s.map.roads!.rests.length).toBeGreaterThan(10);
  });

  it('a found place at a road’s end sends caravans to the hall', () => {
    const s = quiet();
    const rt = A.roads.routes[0]!;
    s.discovered.add(rt.dest);
    s.update(1.2);
    const due = s.caravanAt[rt.id]!;
    expect(due).toBeCloseTo(s.time + A.roads.caravanSec, -1);
    const before = { ...s.res[PLAYER] };
    s.update(A.roads.caravanSec + 1.5);
    for (const [k, v] of Object.entries(rt.caravan))
      expect(s.res[PLAYER][k as 'gold']).toBeGreaterThanOrEqual(before[k as 'gold'] + (v ?? 0));
    expect(s.events.some((e) => e.kind === 'caravan' && e.route === rt.id)).toBe(true);
  });

  it('the roads’ own places can be found (Sdok Kok Thom, Preah Khan of Kompong Svay)', () => {
    const s = quiet();
    expect(s.places.map((p) => p.id)).toEqual(expect.arrayContaining(['sdokKokThom', 'preahKhanKS']));
    expect(quiet('kingdom').places.map((p) => p.id)).not.toContain('sdokKokThom');
  });
});

describe('Anachak saves', () => {
  it('keep the road world, the caravans’ clocks and the levy count; a hero goes back to the AI', () => {
    const s = quiet();
    rich(s);
    levy(s, 'spearman', 2);
    s.discovered.add('phimai');
    s.update(1.2);
    const u = villagers(s)[0] as Unit;
    u.manual = true;
    const back = restore(data, JSON.parse(JSON.stringify(serialize(s))));
    expect(back.variant).toBe('anachak');
    expect(back.map.roads).toBeDefined();
    expect(back.caravanAt).toEqual(s.caravanAt);
    expect(back.levied).toBe(2);
    expect(back.units.get(u.id)!.manual).toBeUndefined();
    // A Kingdom save stays a Kingdom world.
    expect(restore(data, JSON.parse(JSON.stringify(serialize(quiet('kingdom'))))).map.road).toBeUndefined();
  });
});

describe('a unit played by hand (3D hero mode)', () => {
  it('is left alone by the AI: no jobs, no decree, no guard duty', () => {
    const s = quiet();
    s.autoWork = true;
    const v = villagers(s)[0]!;
    v.manual = true;
    v.task = { kind: 'idle' };
    const [x, z] = [v.x, v.z];
    s.setDecree(true);
    s.update(12);
    expect(v.task.kind).toBe('idle');
    expect([v.x, v.z]).toEqual([x, z]);
    expect(s.idleWorkers()).not.toContain(v);
    expect(recruits(s)).not.toContain(v);
  });

  it('sees far round him while he is played', () => {
    const s = quiet();
    const v = villagers(s)[0]!;
    const far: [number, number] = [v.x + 60, v.z];
    s.updateFog();
    expect(s.isVisible(...far)).toBe(false);
    s.heroEye = [v.x, v.z];
    s.updateFog();
    expect(s.isVisible(...far)).toBe(true);
  });
});

describe('day and night (PK: the rest houses’ fires glow at night)', () => {
  const N = A.night;
  it('is day at dawn of the game, full night after dusk, day again at dawn', () => {
    expect(nightness(0, N)).toBe(0);
    expect(nightness(N.daySec * 0.3, N)).toBe(0);
    expect(nightness(N.daySec * ((N.dusk[1] + N.dawn[0]) / 2), N)).toBe(1);
    expect(nightness(N.daySec * 1.3, N)).toBe(0);
  });
  it('dusk falls gradually', () => {
    const mid = nightness(N.daySec * ((N.dusk[0] + N.dusk[1]) / 2), N);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });
  it('the fires glow a little by day and fully at night', () => {
    expect(fireGlow(0, N)).toBeCloseTo(N.fire.day);
    expect(fireGlow(1, N)).toBeCloseTo(N.fire.night);
    expect(fireGlow(1, N)).toBeGreaterThan(fireGlow(0, N) * 4);
  });
});

describe('the tiger encounter (PK: a tiger in the forest, hero mode)', () => {
  const forestNear = (s: KingdomSim): [number, number] => {
    const m = s.map;
    const half = (m.size * m.tile) / 2;
    const i = m.terrain.findIndex(
      (t, k) => t === 'forest' && m.terrain[k + 30] === 'forest' && m.terrain[k - 30] === 'forest',
    );
    return [((i % m.size) + 0.5) * m.tile - half, (Math.floor(i / m.size) + 0.5) * m.tile - half];
  };

  it('comes out of the forest within the encounter distance, stalking the hero', () => {
    const s = quiet();
    const [fx, fz] = forestNear(s);
    for (const a of [...s.animals.values()]) if (a.kind === 'tiger') s.animals.delete(a.id);
    const v = villagers(s)[0]!;
    const a = tigerEncounter(s, fx, fz, v.id, () => 0.3)!;
    expect(a).toBeTruthy();
    expect(a.kind).toBe('tiger');
    const d = Math.hypot(a.x - fx, a.z - fz);
    expect(d).toBeGreaterThanOrEqual(A.tiger.dist[0] - 1e-6);
    expect(d).toBeLessThanOrEqual(A.tiger.dist[1] + 1e-6);
    expect(s.map.terrain[s.tileIndex(a.x, a.z)]).toBe('forest');
    expect(a.prey).toBe(v.id);
    // One tiger at a time.
    expect(tigerEncounter(s, fx, fz, v.id)).toBeNull();
  });

  it('does not come where there is no forest', () => {
    const s = quiet();
    const h = hall(s);
    const [x, z] = s.center(h);
    for (const a of [...s.animals.values()]) if (a.kind === 'tiger') s.animals.delete(a.id);
    let forest = false;
    for (let r = A.tiger.dist[0]; r <= A.tiger.dist[1]; r += 2)
      for (let i = 0; i < 16; i++) {
        const t = s.map.terrain[s.tileIndex(x + Math.sin(i) * r, z + Math.cos(i) * r)];
        if (t === 'forest') forest = true;
      }
    if (!forest) expect(tigerEncounter(s, x, z, null)).toBeNull();
  });
});

describe('the danger call (PK: fly to the person in danger)', () => {
  it('the alarm names who is in most danger and what threatens them', () => {
    const s = quiet();
    const [v, w] = villagers(s);
    // Away from the others, so the two of them are the only people near.
    v!.task = { kind: 'idle' };
    w!.task = { kind: 'idle' };
    v!.x += 60;
    w!.x = v!.x + 6;
    w!.z = v!.z;
    const kind = data.world.animals.kinds.find((k) => k.id === 'tiger')!;
    const tiger = {
      id: 990001,
      kind: 'tiger',
      x: v!.x - 2,
      z: v!.z,
      hp: kind.hp,
      heading: 0,
      home: [v!.x, v!.z] as [number, number],
      target: null,
      fleeUntil: 0,
      fleeFrom: null,
      ready: 1e9,
      moving: false,
    };
    s.animals.set(tiger.id, tiger);
    s.update(0.6);
    const e = s.events.find((x) => x.kind === 'alarm');
    expect(e && e.kind === 'alarm' && e.who).toBe(v!.id);
    expect(e && e.kind === 'alarm' && e.foe?.animal).toBe(tiger.id);
  });
});
