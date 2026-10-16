import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { HeroCore, NO_INPUT, kitFor, type HeroAct, type HeroInput } from './heroCore';
import {
  DUST_EARTH,
  DUST_GRASS,
  aimRing,
  clickFoe,
  dustGround,
  foeAt,
  isClick,
  landDust,
} from './heroAim';
import { Particles } from '../view/vfx';
import { KingdomSim, PLAYER, RIVAL } from '../sim/sim';
import { tileToWorld } from '../sim/map';

/**
 * PK 1.9.0, Sprint 1: the 3D hero's controls. A/D step sideways and S steps back while he keeps
 * facing ahead (the camera no longer chases him round); a right click walks him to a point; a
 * left click strikes the foe under the cursor; landing throws dust that shows above the lawn.
 */

const data = loadKingdom();
const H = data.anachak.hero;
const open = { open: () => true };
const run = (c: HeroCore, input: Partial<HeroInput>, sec: number, dt = 1 / 30): HeroAct[] => {
  const acts: HeroAct[] = [];
  for (let t = 0; t < sec - 1e-9; t += dt) acts.push(...c.step(dt, { ...NO_INPUT, ...input }, open));
  return acts;
};
/** Camera behind him to the north (yaw π): his forward is +z, the camera's right is −x. */
const core = () => {
  const c = new HeroCore(H, kitFor(H, 'villager'), 0, 0, 0);
  c.camYaw = Math.PI;
  return c;
};

describe('keys: A / D strafe and S steps back, facing ahead (decision k2)', () => {
  it('A steps to the camera’s left and he keeps facing forward', () => {
    const c = core();
    run(c, { move: { x: -1, y: 0 }, keys: true }, 1);
    expect(c.x).toBeGreaterThan(H.move.walk * H.move.strafe * 0.8);
    expect(Math.abs(c.z)).toBeLessThan(0.2);
    expect(Math.abs(c.heading)).toBeLessThan(0.05);
    expect(c.moveMode).toBe('side');
  });

  it('S steps back at the back speed, still facing forward, legs running backward', () => {
    const c = core();
    run(c, { move: { x: 0, y: -1 }, keys: true }, 1);
    expect(c.z).toBeLessThan(-H.move.walk * H.move.back * 0.8);
    expect(c.speed).toBeCloseTo(H.move.walk * H.move.back, 5);
    expect(Math.abs(c.heading)).toBeLessThan(0.05);
    expect(c.moveMode).toBe('back');
    expect(c.stride).toBeLessThan(0);
  });

  it('W walks ahead and is the only key the camera follows', () => {
    const c = core();
    run(c, { move: { x: 0, y: 1 }, keys: true }, 0.5);
    expect(c.moveMode).toBe('forward');
    expect(c.z).toBeGreaterThan(1);
  });

  it('holding A with the camera following never spins him round (the old bug)', () => {
    const c = core();
    // The game's rule: the camera drifts behind him only on a forward walk or a walk to a point.
    for (let i = 0; i < 300; i++) {
      c.step(1 / 30, { ...NO_INPUT, move: { x: -1, y: 0 }, keys: true }, open);
      if (c.moveMode === 'forward' || c.moveMode === 'goal') {
        let d = c.heading + Math.PI - c.camYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        c.camYaw += d * (1.2 / 30);
      }
    }
    // Ten seconds of A: a straight line to the left, camera untouched.
    expect(c.camYaw).toBeCloseTo(Math.PI, 5);
    expect(c.x).toBeGreaterThan(H.move.walk * H.move.strafe * 9);
    expect(Math.abs(c.z)).toBeLessThan(0.5);
  });

  it('the touch stick still turns him toward where it points', () => {
    const c = core();
    run(c, { move: { x: -1, y: 0 } }, 1);
    expect(Math.abs(c.heading)).toBeGreaterThan(1);
    expect(c.moveMode).toBe('forward');
  });
});

describe('mouse: right click walks there, left click strikes a foe', () => {
  it('a short right press is a click; a long or moving one turns the camera', () => {
    const p = { x: 100, y: 100, t: 0, moved: 2 };
    expect(isClick(p, H.mouse.clickMs - 1, H)).toBe(true);
    expect(isClick(p, H.mouse.clickMs + 50, H)).toBe(false);
    expect(isClick({ ...p, moved: H.mouse.clickPx + 1 }, 10, H)).toBe(false);
  });

  it('walks to the clicked point and stops there', () => {
    const c = core();
    c.setGoal(3, 4, H.mouse.arrive);
    const acts = run(c, {}, 3);
    expect(Math.hypot(c.x - 3, c.z - 4)).toBeLessThanOrEqual(H.mouse.arrive + 0.2);
    expect(acts.some((a) => a.kind === 'arrive' && !a.blocked)).toBe(true);
    expect(c.goal).toBeNull();
    expect(c.speed).toBe(0);
  });

  it('a move key takes over from the walk', () => {
    const c = core();
    c.setGoal(20, 0, H.mouse.arrive);
    run(c, {}, 0.3);
    expect(c.moveMode).toBe('goal');
    run(c, { move: { x: 0, y: 1 }, keys: true }, 1 / 30);
    expect(c.goal).toBeNull();
  });

  it('gives up when a wall stops him', () => {
    const c = core();
    c.setGoal(0, 10, H.mouse.arrive);
    const wall = { open: (_x: number, z: number) => z < 2 };
    const acts: HeroAct[] = [];
    for (let i = 0; i < 120; i++) acts.push(...c.step(1 / 30, NO_INPUT, wall));
    expect(acts.some((a) => a.kind === 'arrive' && a.blocked)).toBe(true);
    expect(c.goal).toBeNull();
  });

  it('walking up to a foe ends in a strike', () => {
    const c = core();
    c.setGoal(0, 6, 1.5, true);
    const acts = run(c, {}, 2);
    expect(acts.some((a) => a.kind === 'strike')).toBe(true);
    expect(c.z).toBeGreaterThan(6 - 1.5 - 0.2);
    expect(c.heading).toBeCloseTo(0, 1);
  });

  it('the ring is gold within his reach and red beyond; a click strikes or walks up', () => {
    const me = { x: 0, z: 0 };
    expect(aimRing(me, { x: 0, z: 1.5 }, 2)).toBe('gold');
    expect(aimRing(me, { x: 0, z: 5 }, 2)).toBe('red');
    expect(clickFoe(me, { x: 0, z: 1.5 }, 2)).toEqual({ kind: 'strike' });
    expect(clickFoe(me, { x: 0, z: 5 }, 2)).toEqual({ kind: 'approach', stop: 1.6 });
  });

  it('picks the raider under the cursor, never a friend', () => {
    const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
    s.ai.nextRaid = 1e9;
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    const friend = s.spawnNear(hall, 'spearman', PLAYER);
    const foe = s.spawnNear(hall, 'spearman', RIVAL);
    for (const a of s.animals.values()) a.x = 1e6;
    foe.x = friend.x + 20;
    foe.z = friend.z;
    expect(foeAt(s, friend.x, friend.z, H.mouse.pick)).toBeNull();
    expect(foeAt(s, foe.x + 0.5, foe.z, H.mouse.pick)?.unit?.id).toBe(foe.id);
  });
});

describe('landing dust you can see (PK: no smoke after a jump)', () => {
  it('lands with the fall speed, harder from higher', () => {
    const c = core();
    const acts = run(c, { jump: true }, 1 / 30).concat(run(c, {}, 2));
    const land = acts.find((a) => a.kind === 'land');
    expect(land && land.kind === 'land' && land.impact).toBeGreaterThan(H.move.jump * 0.8);
  });

  it('a ring of puffs above the lawn, ochre on earth, green on grass, more after a hard fall', () => {
    const earth = landDust('earth', 2, H);
    expect(earth.kind).toBe('dust');
    expect(earth.n).toBe(H.fx.landDust);
    expect(earth.n).toBeGreaterThanOrEqual(18);
    expect(earth.lift).toBeGreaterThan(0.1); // the old dust hid inside the 10 cm lawn
    expect(earth.colors).toBe(DUST_EARTH);
    expect(earth.ring).toBe(true);
    expect(landDust('grass', 2, H).colors).toBe(DUST_GRASS);
    expect(landDust('earth', H.fx.heavyFall, H).n).toBe(H.fx.landDustHeavy);
    expect(landDust('water', 2, H).kind).toBe('splash');
  });

  it('reads the ground: grass, road earth, water', () => {
    const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
    const N = s.map.size;
    const pick = (want: string) => {
      for (let i = 0; i < N * N; i += 7) if (s.map.terrain[i] === want) return i;
      return -1;
    };
    const at = (i: number) => tileToWorld(s.map, i % N, Math.floor(i / N));
    const w = pick('water');
    expect(w).toBeGreaterThanOrEqual(0);
    expect(dustGround(s, ...at(w))).toBe('water');
    const h = pick('hill');
    if (h >= 0 && !s.onRoad(...at(h))) expect(dustGround(s, ...at(h))).toBe('earth');
  });

  it('the particles take the ground’s colours and spread in a ring', () => {
    const p = new Particles(64);
    p.burst('dust', 0, 0.35, 0, 20, { colors: [0xff0000], ring: true });
    const pos = p.mesh.geometry.getAttribute('position').array as Float32Array;
    const col = p.mesh.geometry.getAttribute('color').array as Float32Array;
    expect(col[0]).toBeCloseTo(1, 3);
    expect(col[1]).toBeCloseTo(0, 3);
    for (let i = 0; i < 20; i++) expect(pos[i * 3 + 1]!).toBeGreaterThan(0.3);
    const r0 = Math.hypot(pos[0]!, pos[2]!);
    expect(r0).toBeGreaterThan(0.2);
  });
});
