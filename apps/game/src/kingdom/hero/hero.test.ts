import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { HeroCore, NO_INPUT, inArc, kitFor, type HeroInput } from './heroCore';
import { HeroModel, lookFor } from './heroModel';
import {
  doWork,
  heal,
  heroOpen,
  hitFoe,
  nearestFoe,
  strike,
  workLabel,
  workTarget,
  type HeroBody,
} from './heroSim';
import { compass, groundAt, pullCamera } from './heroMode';
import { GroundDetail, grassWindMaterial } from './ground';
import { SLASH_FRAG, Slashes, crescentGeometry } from './slash';
import { YantraFx, yantraFor } from './yantra';
import { RoadView } from '../view/roads';
import { WeatherFx } from '../view/weather';
import { Backdrop } from './backdrop';
import { anachakHallGeometry } from '../view/royalHall';
import { greatBanyanGeometry, lushTreeGeometry } from '../view/flora';
import { CEL_SHADER } from './celPass';
import { KingdomSim, PLAYER, RIVAL } from '../sim/sim';
import { tileToWorld } from '../sim/map';

/** PK: every character can be played in 3D, anime-style — move, jump, fight, skills, work. */

const data = loadKingdom();
const H = data.anachak.hero;
const open = { open: () => true };
const step = (c: HeroCore, input: Partial<HeroInput>, sec: number, dt = 1 / 30) => {
  const acts = [];
  for (let t = 0; t < sec - 1e-9; t += dt) acts.push(...c.step(dt, { ...NO_INPUT, ...input }, open));
  return acts;
};
const core = (kit = 'villager') => new HeroCore(H, kitFor(H, kit), 0, 0, 0);

describe('the hero moves like an action game', () => {
  it('walks where the stick points, seen from the camera', () => {
    const c = core();
    c.camYaw = Math.PI; // camera behind (to the north): forward is +z
    step(c, { move: { x: 0, y: 1 } }, 1);
    expect(c.z).toBeGreaterThan(H.move.walk * 0.8);
    expect(Math.abs(c.x)).toBeLessThan(0.2);
    const d = core();
    d.camYaw = Math.PI;
    step(d, { move: { x: 1, y: 0 } }, 1);
    // Stick right goes to the camera's right (−x when the camera looks toward +z).
    expect(d.x).toBeLessThan(-H.move.walk * 0.5);
  });

  it('runs faster on stamina, which comes back when he walks', () => {
    const c = core();
    step(c, { move: { x: 0, y: 1 }, run: true }, 1);
    expect(c.speed).toBeCloseTo(H.move.run, 5);
    expect(c.stamina).toBeLessThan(H.move.staminaMax);
    const low = c.stamina;
    step(c, {}, 1);
    expect(c.stamina).toBeGreaterThan(low);
  });

  it('jumps and lands', () => {
    const c = core();
    const acts = [...step(c, { jump: true }, 1 / 30), ...step(c, {}, 0.2)];
    expect(acts.some((a) => a.kind === 'jump')).toBe(true);
    expect(c.y).toBeGreaterThan(0.5);
    expect(c.state).toBe('jump');
    const land = step(c, {}, 1.5);
    expect(land.some((a) => a.kind === 'land')).toBe(true);
    expect(c.y).toBe(0);
  });

  it('dashes for stamina, with a cooldown, and takes no hit while dashing', () => {
    const c = core();
    const acts = step(c, { dash: true }, 1 / 30);
    expect(acts.some((a) => a.kind === 'dash')).toBe(true);
    expect(c.state).toBe('dash');
    expect(c.hurt()).toBe(false);
    expect(c.stamina).toBeCloseTo(H.move.staminaMax - H.move.staminaDash, 0);
    expect(step(c, { dash: true }, 1 / 30).some((a) => a.kind === 'dash')).toBe(false);
  });

  it('slides along walls instead of stopping', () => {
    const c = new HeroCore(H, kitFor(H, 'villager'), 0, 0, Math.PI / 4);
    c.camYaw = Math.PI + Math.PI / 4;
    const wall = { open: (x: number) => x < 1 };
    for (let i = 0; i < 30; i++) c.step(1 / 30, { ...NO_INPUT, move: { x: 0, y: 1 } }, wall);
    expect(c.x).toBeLessThan(1);
    expect(c.z).toBeGreaterThan(1.5);
  });
});

describe('the three-blow combo and the skill', () => {
  it('chains strikes when pressed again in time, each blow stronger', () => {
    const c = core('swordsman');
    const blows = [];
    for (let i = 0; i < 3; i++) {
      blows.push(...step(c, { attack: true }, 1 / 30));
      blows.push(...step(c, {}, H.combo.sec[i]! * 0.9));
    }
    blows.push(...step(c, {}, 0.6));
    const strikes = blows.filter((a) => a.kind === 'strike');
    expect(strikes.map((a) => (a.kind === 'strike' ? a.step : -1))).toEqual([0, 1, 2]);
    expect(strikes.map((a) => (a.kind === 'strike' ? a.mul : 0))).toEqual(H.combo.mul.slice(0, 3));
  });

  it('starts over after a pause', () => {
    const c = core('swordsman');
    step(c, { attack: true }, 1 / 30);
    step(c, {}, 1.5);
    const a = step(c, { attack: true }, 0.5).find((x) => x.kind === 'strike');
    expect(a && a.kind === 'strike' && a.step).toBe(0);
  });

  it('the skill fires once, then waits its cooldown', () => {
    const c = core('spearman');
    const acts = step(c, { skill: true }, 1);
    expect(acts.filter((a) => a.kind === 'skill')).toHaveLength(1);
    expect(c.skillLeft()).toBeGreaterThan(0);
    expect(step(c, { skill: true }, 0.5).some((a) => a.kind === 'skill')).toBe(false);
    step(c, {}, kitFor(H, 'spearman').skill.cd);
    expect(step(c, { skill: true }, 1).some((a) => a.kind === 'skill')).toBe(true);
  });

  it('a work swing gives one work act', () => {
    const c = core();
    expect(step(c, { work: true }, 1).filter((a) => a.kind === 'work')).toHaveLength(1);
  });
});

describe('kits and the camera', () => {
  it('every unit type and the king has a kit', () => {
    for (const u of Object.keys(data.units)) expect(kitFor(H, u).units).toContain(u);
    expect(kitFor(H, 'king').id).toBe('king');
    expect(kitFor(H, 'king').weapon).toBe('preahKhan');
  });

  it('the camera orbits behind and stays within its limits', () => {
    const c = core();
    c.camYaw = Math.PI;
    const { eye, look } = c.cameraPose();
    expect(eye[2]).toBeLessThan(look[2]); // behind a hero facing +z
    c.orbit(0, 99, 99);
    expect(c.camPitch).toBe(H.camera.pitchMax);
    expect(c.camDist).toBe(H.camera.maxDist);
  });

  it('swings reach what is in front, not behind', () => {
    const me = { x: 0, z: 0, heading: 0 };
    expect(inArc(me, { x: 0, z: 2 }, 2.5, 1.6)).toBe(true);
    expect(inArc(me, { x: 0, z: -2 }, 2.5, 1.6)).toBe(false);
    expect(inArc(me, { x: 0, z: 4 }, 2.5, 1.6)).toBe(false);
    expect(inArc(me, { x: 0, z: -2 }, 2.5, Math.PI * 2)).toBe(true);
  });

  it('compass words follow the map (z grows to the south)', () => {
    expect(compass(0).en).toBe('south');
    expect(compass(Math.PI / 2).en).toBe('east');
    expect(compass(Math.PI).en).toBe('north');
    expect(compass(-Math.PI / 2).en).toBe('west');
  });
});

// ---------------------------------------------------------------- in the live kingdom

const quiet = () => {
  const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const hall = (s: KingdomSim) => [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
const hero = (s: KingdomSim, type = 'villager'): HeroBody => {
  const u = s.spawnNear(hall(s), type);
  u.manual = true;
  return { x: u.x, z: u.z, heading: 0, unit: u };
};

describe('the hero in the live kingdom', () => {
  it('strikes hurt raiders in front and count the kill', () => {
    const s = quiet();
    const me = hero(s, 'swordsman');
    const foe = s.spawnNear(hall(s), 'spearman', RIVAL);
    foe.x = me.x;
    foe.z = me.z + 1.5;
    const behind = s.spawnNear(hall(s), 'spearman', RIVAL);
    behind.x = me.x;
    behind.z = me.z - 1.5;
    const hp = foe.hp;
    const r = strike(s, H, me, 2.2, 1.7, 1);
    expect(foe.hp).toBeLessThan(hp);
    expect(behind.hp).toBe(data.units.spearman!.hp);
    expect(r.hits).toHaveLength(1);
    for (let i = 0; i < 20 && s.units.has(foe.id); i++) strike(s, H, me, 2.2, 1.7, 1.7);
    expect(s.units.has(foe.id)).toBe(false);
  });

  it('a beast he kills becomes meat, as in a hunt', () => {
    const s = quiet();
    const me = hero(s, 'watchman');
    const a = [...s.animals.values()][0]!;
    a.x = me.x;
    a.z = me.z + 1;
    a.hp = 1;
    strike(s, H, me, 2, 1.5, 1);
    expect(s.animals.has(a.id)).toBe(false);
    expect(s.events.some((e) => e.kind === 'hunted')).toBe(true);
    expect(me.unit!.hides).toBeGreaterThan(0);
  });

  it('works: cuts a tree into his load, then puts the load in a store', () => {
    const s = quiet();
    const me = hero(s);
    const tree = [...s.nodes.values()].find((n) => n.kind === 'tree')!;
    const [tx, tz] = s.nodePos(tree);
    me.x = tx;
    me.z = tz - 1.6;
    me.heading = 0;
    const t = workTarget(s, H, me);
    expect(t?.kind).toBe('node');
    expect(workLabel(t)?.en).toBe('Chop wood');
    const before = tree.amount;
    const got = doWork(s, H, kitFor(H, 'villager'), me, t!);
    expect(got?.res).toBe('wood');
    expect(tree.amount).toBeLessThan(before);
    expect(me.unit!.carry?.res).toBe('wood');
    const [hx, hz] = s.center(hall(s));
    me.x = hx;
    me.z = hz + (hall(s).d * s.map.tile) / 2 + 0.8;
    const store = workTarget(s, H, me);
    expect(store?.kind).toBe('store');
    const wood = s.res[PLAYER].wood;
    doWork(s, H, kitFor(H, 'villager'), me, store!);
    expect(s.res[PLAYER].wood).toBeGreaterThan(wood);
    expect(me.unit!.carry).toBeNull();
  });

  it('raises a building with each swing', () => {
    const s = quiet();
    const me = hero(s);
    const [tx, tz] = s.map.start;
    const b = s.addBuilding('house', PLAYER, tx - 9, tz + 9, 0);
    const [cx, cz] = s.center(b);
    me.x = cx;
    me.z = cz + (b.d * s.map.tile) / 2 + 0.6;
    me.heading = Math.PI;
    const t = workTarget(s, H, me);
    expect(t?.kind).toBe('build');
    doWork(s, H, kitFor(H, 'villager'), me, t!);
    expect(b.progress).toBeCloseTo(H.buildPerSwing, 6);
  });

  it('heals the people round him; arrows and the dog find the nearest foe', () => {
    const s = quiet();
    const me = hero(s, 'commander');
    const v = [...s.units.values()].find((u) => u.type === 'villager')!;
    v.x = me.x + 1;
    v.z = me.z;
    v.hp = 5;
    expect(heal(s, me, 5, 0.25)).toBeGreaterThan(0);
    expect(v.hp).toBeGreaterThan(5);
    const foe = s.spawnNear(hall(s), 'spearman', RIVAL);
    foe.x = me.x + 6;
    foe.z = me.z;
    const f = nearestFoe(s, me, 20);
    expect(f?.unit?.id).toBe(foe.id);
    const r = hitFoe(s, H, me, f!, 1);
    expect(r!.dmg).toBeGreaterThan(0);
  });

  it('cannot walk into water, trees or buildings', () => {
    const s = quiet();
    const [hx, hz] = s.center(hall(s));
    expect(heroOpen(s, hx, hz)).toBe(false);
    const tree = [...s.nodes.values()].find((n) => n.kind === 'tree')!;
    expect(heroOpen(s, ...s.nodePos(tree))).toBe(false);
    const [sx, sz] = tileToWorld(s.map, s.map.start[0], s.map.start[1] + 9);
    expect(heroOpen(s, sx, sz)).toBe(true);
  });

  it('the camera comes in front of a wall between it and the hero', () => {
    const s = quiet();
    const b = hall(s);
    const [cx, cz] = s.center(b);
    const look: [number, number, number] = [cx, 1.4, cz + (b.d * s.map.tile) / 2 + 2];
    const eye: [number, number, number] = [cx, 1.6, cz - 4];
    pullCamera(s, look, eye);
    expect(eye[2]).toBeGreaterThan(cz + (b.d * s.map.tile) / 2);
  });

  it('the camera comes in front of a tree between it and the hero (PK 1.7.0)', () => {
    const s = quiet();
    const tree = [...s.nodes.values()].find((n) => n.kind === 'tree')!;
    const [tx, tz] = s.nodePos(tree);
    const look: [number, number, number] = [tx, 1.4, tz + 4];
    const eye: [number, number, number] = [tx, 2.6, tz - 4];
    pullCamera(s, look, eye);
    expect(eye[2]).toBeGreaterThan(tz + 1);
  });
});

describe('the anime model', () => {
  it('builds for every kit, with mounts, the dog and the king’s crown, in few draw calls', () => {
    for (const k of H.kits) {
      const type = k.units[0] ?? 'king';
      const m = new HeroModel(k, lookFor(k, type));
      let meshes = 0;
      let verts = 0;
      m.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          meshes++;
          verts += o.geometry.getAttribute('position').count;
        }
      });
      expect(meshes, k.id).toBeGreaterThan(8);
      expect(meshes, k.id).toBeLessThan(70); // merged per joint (the Low budget)
      expect(verts, k.id).toBeGreaterThan(2000);
      expect(!!m.dog, k.id).toBe(k.id === 'hunter');
      expect(m.lift > 0, k.id).toBe(k.id === 'rider' || k.id === 'elephant');
      m.dispose();
    }
  });

  it('stands upright in every pose (the hips never tip over)', () => {
    for (const id of ['king', 'villager', 'archer', 'spearman'])
      for (const state of ['idle', 'run', 'jump', 'attack', 'skill', 'dash', 'work', 'hurt'] as const)
        for (const p of [0, 0.2, 0.5]) {
          const k = kitFor(H, id);
          const m = new HeroModel(k, lookFor(k, id));
          m.pose({
            state,
            stateT: p,
            combo: 1,
            stride: 1,
            speed: 4,
            y: 0,
            t: 1,
            strikeSec: 0.4,
            skillKind: k.skill.kind,
          });
          expect(m.headWorld().y, `${id} ${state} ${p}`).toBeGreaterThan(1.25);
          m.dispose();
        }
  });

  it('the cel pass bands the light and inks the edges', () => {
    expect(CEL_SHADER.fragmentShader).toContain('perspectiveDepthToViewZ');
    expect(CEL_SHADER.fragmentShader).toContain('uInk');
    expect(CEL_SHADER.fragmentShader).toContain('band');
  });
});

describe('the Anachak world (PK reference images: the royal hall, the forest)', () => {
  const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  const finite = (g: THREE.BufferGeometry) =>
    Array.from(g.getAttribute('position').array as Float32Array).every(Number.isFinite);

  it('the royal hall: terrace, stair, posts and stacked roofs on the same footprint', () => {
    const g = anachakHallGeometry();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(finite(g)).toBe(true);
    expect(b.max.x - b.min.x).toBeLessThan(11);
    expect(b.max.y).toBeGreaterThan(8); // the crowning gable and its finials
    expect(tris(g)).toBeLessThan(6000);
    expect(g.getAttribute('color')).toBeTruthy();
  });

  it('the banyan and lush trees stay light enough for thousands of instances', () => {
    for (const g of [greatBanyanGeometry(), lushTreeGeometry()]) {
      expect(finite(g)).toBe(true);
      expect(tris(g)).toBeLessThan(1000);
    }
  });

  it('the far mountains have no broken (NaN) colours', () => {
    const b = new Backdrop();
    const hills = b.group.children[0] as THREE.Mesh;
    const col = Array.from(hills.geometry.getAttribute('color').array as Float32Array);
    expect(col.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    b.dispose();
  });

  it('grass grows round the hero on open land, thicker in the forest, never on water', () => {
    const g = new GroundDetail();
    g.update(0, 0, 0, () => 'grass');
    const open = g.tufts;
    expect(open).toBeGreaterThan(1500);
    g.reset();
    g.update(0, 0, 0, () => 'none');
    expect(g.tufts).toBe(0);
    g.reset();
    g.update(0, 0, 0, (x) => (x < 0 ? 'none' : 'forest'));
    expect(g.tufts).toBeGreaterThan(open * 0.35);
    expect(g.tufts).toBeLessThan(open * 0.65);
    // Laid on a fixed grid: a step inside the cell lays nothing new.
    const before = g.tufts;
    g.update(0.2, 0.2, 1, () => 'none');
    expect(g.tufts).toBe(before);
    g.dispose();
  });

  it('reads the live map: water and built tiles stay bare', () => {
    const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
    const m = s.map;
    const half = (m.size * m.tile) / 2;
    const at = (i: number): [number, number] => [
      ((i % m.size) + 0.5) * m.tile - half,
      (Math.floor(i / m.size) + 0.5) * m.tile - half,
    ];
    const water = m.terrain.indexOf('water');
    const forest = m.terrain.indexOf('forest');
    expect(groundAt(s, ...at(water))).toBe('none');
    expect(groundAt(s, ...at(forest))).toBe('forest');
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === PLAYER)!;
    expect(groundAt(s, ...tileToWorld(m, hall.tx + 1, hall.tz + 1))).toBe('none');
    expect(groundAt(s, half + 5, 0)).toBe('none');
  });
});

describe('watching in 3D (PK: let the story’s life flow)', () => {
  it('the body follows the unit the AI moves, and its pose follows what it does', () => {
    const c = core();
    c.follow(1, 0, Math.PI / 2, 'walk', 0.25);
    expect(c.x).toBe(1);
    expect(c.speed).toBeGreaterThan(0.5);
    expect(c.state).toBe('run');
    c.follow(1, 0, Math.PI / 2, 'attack', 0.1);
    expect(c.state).toBe('attack');
    for (let i = 0; i < 12; i++) c.follow(1, 0, Math.PI / 2, 'attack', 0.1);
    expect(c.stateT).toBeLessThan(1); // the swing loops
    for (let i = 0; i < 20; i++) c.follow(1, 0, Math.PI / 2, 'gather', 0.1);
    expect(c.state).toBe('work');
    for (let i = 0; i < 30; i++) c.follow(1, 0, Math.PI / 2, 'idle', 0.1);
    expect(c.state).toBe('idle');
  });
});

describe('the sword slash (PK: the tiger fight)', () => {
  it('a crescent sweeps and fades, and the pool is reused', () => {
    const g = crescentGeometry();
    expect(Array.from(g.getAttribute('position').array as Float32Array).every(Number.isFinite)).toBe(true);
    expect(g.getAttribute('aK')).toBeTruthy();
    const sl = new Slashes(3);
    sl.spawn(0, 1, 0, 0, 0);
    sl.spawn(0, 1, 0, 0, 1, 1.3, 0xffd27a);
    sl.spawn(0, 1, 0, 0, 2);
    expect(sl.live).toBe(3);
    sl.spawn(0, 1, 0, 0, 0); // a fourth reuses a mesh
    expect(sl.live).toBe(3);
    for (let i = 0; i < 20; i++) sl.update(0.05);
    expect(sl.live).toBe(0);
    sl.dispose();
  });
});

describe('night and the rest houses’ fires (PK)', () => {
  it('the fires light up at night and go out with no rest houses shown', () => {
    const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
    const rv = new RoadView(s.map, data.anachak.roads.width);
    const explored = new Uint8Array(s.map.size * s.map.size).fill(1);
    rv.sync(explored, true);
    rv.fire(1, 3, 0);
    const pools = rv.group.children.at(-1) as THREE.InstancedMesh;
    expect(pools.count).toBe(s.map.roads!.rests.length);
    expect((pools.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0.3);
    rv.sync(explored, false);
    rv.fire(1, 3, 0);
    expect(pools.count).toBe(0);
  });

  it('the night dims the sun and the sky and darkens the sky dome', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1),
      new THREE.ShaderMaterial({
        uniforms: {
          zenith: { value: new THREE.Color(0.3, 0.5, 0.9) },
          horizon: { value: new THREE.Color(0.8, 0.85, 0.9) },
        },
      }),
    );
    dome.renderOrder = -10;
    scene.add(sun, hemi, dome);
    const fx = new WeatherFx(scene);
    fx.setNight(data.anachak.night);
    fx.update('clear', 0, 0, 0, 1);
    const day = sun.intensity;
    fx.night = 1;
    fx.update('clear', 1, 0, 0, 1);
    expect(sun.intensity).toBeLessThan(day * 0.4);
    const z = (dome.material as THREE.ShaderMaterial).uniforms.zenith!.value as THREE.Color;
    expect(z.r + z.g + z.b).toBeLessThan(0.6);
  });
});

describe('dress by rank (costume review, Zhou Daguan)', () => {
  const look = (t: string, tall = true) => lookFor(kitFor(H, t), t, tall);
  it('dense flowers for the king, sparse for the commander, plain cloth for everyone else', () => {
    expect(look('king').weave).toBe('dense');
    expect(look('commander').weave).toBe('sparse');
    for (const t of [
      'villager',
      'spearman',
      'swordsman',
      'archer',
      'horseman',
      'warElephant',
      'watchman',
      'oxCart',
    ])
      expect(look(t).weave).toBe('plain');
  });
  it('no gold on commoners; soldiers wear the crested helmet only from the Angkor Wat era', () => {
    for (const t of ['villager', 'watchman', 'oxCart']) expect(look(t).jewels).toBe('none');
    expect(look('swordsman').crown).toBe('helmet');
    expect(look('swordsman', false).crown).toBeUndefined();
    expect(look('swordsman').shield).toBe(true);
    expect(look('warElephant').crown).toBeUndefined();
  });
});

describe('yantra light (PK: Khmer yantra magic for the skills)', () => {
  it('each skill has its yantra: the lotus for blessings', () => {
    expect(yantraFor('heal')).toBe('lotus');
    expect(yantraFor('volley')).toBe('grid');
    expect(yantraFor('spin')).toBe('spiral');
  });
  it('opens, shines and fades; a canopy is never under the feet', () => {
    const fx = new YantraFx();
    const cam = new THREE.PerspectiveCamera();
    fx.spawn('lotus', 0, 1.4, 0, 3, 0xffcf6a);
    fx.spawn('lotus', 0, 3.4, 0, 6, 0xffcf6a, true);
    expect(fx.shining).toBe(2);
    fx.update(0.3, cam);
    for (const m of fx.group.children) expect(m.position.y).toBeGreaterThan(1);
    for (let i = 0; i < 30; i++) fx.update(0.1, cam);
    expect(fx.shining).toBe(0);
    expect(fx.group.children.length).toBe(0);
  });
});

describe('stylised shader touches (PK 1.6.0)', () => {
  it('the grass sways in the wind: roots fixed, tips bend, time comes from the ground', () => {
    const g = new GroundDetail();
    const mat = (g.group.children[0] as THREE.InstancedMesh).material as THREE.MeshLambertMaterial;
    const sh = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '',
    };
    mat.onBeforeCompile(sh as never, undefined as never);
    expect(sh.vertexShader).toContain('uniform float uTime');
    expect(sh.vertexShader).toContain('position.y * position.y');
    g.update(0, 0, 12.5, () => 'grass');
    expect(sh.uniforms.uTime!.value).toBe(12.5);
    expect(grassWindMaterial({ uTime: { value: 0 }, uWind: { value: 1 } }).customProgramCacheKey()).toBe('grass-wind');
  });

  it('a slash dissolves in hard steps as it fades', () => {
    expect(SLASH_FRAG).toMatch(/floor\(\(1\.0 - uOpacity\) \* 4\.0/);
    expect(SLASH_FRAG).toContain('discard');
  });
});
