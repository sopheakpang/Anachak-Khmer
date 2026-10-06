import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL } from './sim';

/** Commander, supply cart, watchman and the new mounted units (D69). */

const data = loadKingdom();
const run = (s: KingdomSim, sec: number) => s.update(sec);
const calm = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  s.addResources({ food: 5000, wood: 5000, stone: 5000, gold: 5000 });
  return s;
};
const tc = (s: KingdomSim) => [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
const camp = (s: KingdomSim) => s.addBuilding('barracks', PLAYER, s.map.start[0] + 6, s.map.start[1] - 8, 1);

describe('the army of Angkor (D69)', () => {
  it('one commander at a time, named after the era; horsemen wait for the Angkor Wat era', () => {
    const s = calm();
    const b = camp(s);
    expect(s.train(b.id, 'commander').ok).toBe(true);
    expect(s.train(b.id, 'commander')).toEqual({ ok: false, reason: 'limit' });
    expect(s.train(b.id, 'horseman')).toEqual({ ok: false, reason: 'era' });
    expect(s.train(b.id, 'buffaloRider').ok).toBe(true);
    run(s, data.units.commander!.trainSec + 1);
    const c = [...s.units.values()].find((u) => u.type === 'commander')!;
    expect(c.name?.en).toBe('Mahāsenāpati (high commander)'); // no named general known in 879
    // In the Baphuon chapter the commander is Saṅgrāma, recorded on the Baphuon stele.
    const baphuon = data.campaign.chapters.findIndex((ch) => ch.era === 'eleventh');
    s.setChapter(baphuon);
    expect(s.commanderRank.names[0]!.en).toBe('Saṅgrāma');
    const late = data.campaign.chapters.findIndex((ch) => ch.era === 'suryavarman2');
    s.setChapter(late);
    expect(s.allows('units', 'horseman')).toBe(true);
  });

  it('soldiers near their commander hit harder and take less', () => {
    const s = calm();
    const sp = s.spawnNear(tc(s), 'spearman', PLAYER);
    const foe = s.spawnNear(tc(s), 'spearman', RIVAL);
    const alone = s.attackOf(sp, foe);
    const c = s.spawnNear(tc(s), 'commander', PLAYER);
    [c.x, c.z] = [sp.x + 1, sp.z];
    expect(s.attackOf(sp, foe)).toBeCloseTo(alone * data.rules.army.commander.attack, 5);
  });

  it('the supply cart heals soldiers round it and never fights', () => {
    const s = calm();
    const sp = s.spawnNear(tc(s), 'spearman', PLAYER);
    sp.hp = 20;
    const cart = s.spawnNear(tc(s), 'oxCart', PLAYER);
    [cart.x, cart.z] = [sp.x + 2, sp.z];
    run(s, 4);
    expect(sp.hp).toBeGreaterThan(20);
    const foe = s.spawnNear(tc(s), 'spearman', RIVAL);
    s.cmdAttack([cart.id], { unit: foe.id });
    run(s, 0.5);
    // It never fights: it stops, or runs from the danger (the alarm, D77).
    expect(cart.task.kind).not.toBe('attack');
  });

  it('a hunter-scout walks to unexplored land by himself and tells the king of a find once', () => {
    const s = calm();
    s.animals.clear(); // no game to chase in this test
    const w = s.spawnNear(tc(s), 'watchman', PLAYER);
    w.task = { kind: 'idle' };
    run(s, 4.5); // (a find right by the hall is told at once)
    expect(w.task.kind).toBe('move');
    // Next to a stone patch: he has news, and goes back to the king with it.
    const stone = [...s.nodes.values()].find((n) => n.kind === 'stone')!;
    const [x, z] = s.nodePos(stone);
    [w.x, w.z] = [x + 3, z + 3];
    run(s, 2.5);
    expect(w.report?.what).toBe('stone');
    expect(s.events.filter((e) => e.kind === 'found' && e.what === 'stone').length).toBe(0); // not told yet
    const [hx, hz] = s.center(tc(s));
    [w.x, w.z] = [hx, hz + 10];
    run(s, 1.5);
    const found = s.events.filter((e) => e.kind === 'found' && e.what === 'stone');
    expect(found.length).toBe(1);
    expect(w.report).toBeUndefined();
    run(s, 2);
    expect(s.events.filter((e) => e.kind === 'found' && e.what === 'stone').length).toBe(1);
  });

  it('the hunter-scout and his dog hunt the game they meet', () => {
    const s = calm();
    s.animals.clear();
    const w = s.spawnNear(tc(s), 'watchman', PLAYER);
    w.task = { kind: 'idle' };
    const k = s.data.world.animals.kinds.find((a) => a.id === 'deer')!;
    s.animals.set(9999, {
      id: 9999,
      kind: 'deer',
      x: w.x + 6,
      z: w.z,
      hp: k.hp,
      heading: 0,
      home: [w.x + 6, w.z],
      target: null,
      fleeUntil: 0,
      fleeFrom: null,
      ready: 0,
      moving: false,
    });
    for (const n of s.nodes.values()) s.reported.add(n.id); // nothing new to tell the king
    run(s, 1.5);
    expect(w.task).toEqual({ kind: 'hunt', animal: 9999 });
  });
});

describe('hunter-scout: hides and hidden places (PK)', () => {
  it('keeps the hide of his kill and sells it at a store for gold', () => {
    const s = calm();
    s.animals.clear();
    for (const n of s.nodes.values()) s.reported.add(n.id);
    for (const p of s.data.world.places) s.discovered.add(p.id);
    const w = s.spawnNear(tc(s), 'watchman', PLAYER);
    const k = s.data.world.animals.kinds.find((a) => a.id === 'deer')!;
    s.animals.set(9998, {
      id: 9998,
      kind: 'deer',
      x: w.x + 2,
      z: w.z,
      hp: 1,
      heading: 0,
      home: [w.x + 2, w.z],
      target: null,
      fleeUntil: 0,
      fleeFrom: null,
      ready: 0,
      moving: false,
    });
    w.task = { kind: 'hunt', animal: 9998 };
    run(s, 3);
    expect(w.hides).toBe(Math.round(k.meat * s.data.rules.army.watchman.hideShare));
    w.hides = s.data.rules.army.watchman.hidesCap;
    const gold = s.res[PLAYER].gold;
    for (let i = 0; i < 120 && (w.hides ?? 0) > 0; i++) run(s, 1);
    expect(w.hides).toBe(0);
    expect(s.res[PLAYER].gold).toBeGreaterThanOrEqual(gold + s.data.rules.army.watchman.hidesCap);
  });

  it('heads for a hidden place not yet found; hidden places are not marked until found', () => {
    const s = calm();
    s.animals.clear();
    for (const n of s.nodes.values()) s.reported.add(n.id);
    const hidden = s.data.world.places.filter((p) => p.hidden);
    expect(hidden.map((p) => p.id)).toEqual(['kbalSpean', 'mahendraparvata', 'bengMealea', 'banteayChhmar']);
    const w = s.spawnNear(tc(s), 'watchman', PLAYER);
    w.task = { kind: 'idle' };
    run(s, 4.5);
    expect(w.task.kind).toBe('move');
    expect(s.map.places.some((p) => hidden.some((h) => h.id === p.id))).toBe(false);
  });
});
