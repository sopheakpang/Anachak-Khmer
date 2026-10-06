import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { generateMap, worldToTile, type MapData } from './map';
import { KingdomSim, PLAYER, type Animal, type Unit } from './sim';

/**
 * Cambodia's forest wildlife (PK's list, D75): behaviours from config (predators attack,
 * defensive animals strike back, shy ones bolt), protected kinds are never hunted, and
 * herds live in their habitats (shores, hills, regions).
 */

const data = loadKingdom();
const kinds = data.world.animals.kinds;
const kind = (id: string) => kinds.find((k) => k.id === id)!;

/** A quiet game with a single villager left, so tests see one person and one animal. */
function alone(seed?: number): { s: KingdomSim; v: Unit } {
  const s = new KingdomSim(data, 'easy', true, seed);
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  const v = [...s.units.values()].find((u) => u.team === PLAYER && u.type === 'villager')!;
  for (const u of [...s.units.values()]) if (u.id !== v.id) s.units.delete(u.id);
  return { s, v };
}

/** A point `r` metres from (x, z) with open ground all the way (so the animal can run). */
function openSpot(s: KingdomSim, x: number, z: number, r: number): [number, number] {
  for (let k = 0; k < 32; k++) {
    const ang = (k / 32) * Math.PI * 2;
    const px = x + Math.cos(ang) * r;
    const pz = z + Math.sin(ang) * r;
    let ok = true;
    for (let d = 0.5; d <= r + 3 && ok; d += 0.5) {
      const [tx, tz] = worldToTile(s.map, x + Math.cos(ang) * d, z + Math.sin(ang) * d);
      if (!s.grid.ok(tx, tz)) ok = false;
    }
    if (ok) return [px, pz];
  }
  throw new Error('no open ground near the villager');
}

function put(s: KingdomSim, id: string, x: number, z: number): Animal {
  const a: Animal = {
    id: 950000 + s.animals.size,
    kind: id,
    x,
    z,
    hp: kind(id).hp,
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
}

const near = (m: MapData, x: number, z: number, t: string, r = 3) => {
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) if (m.terrain[(z + dz) * m.size + (x + dx)] === t) return true;
  return false;
};

describe("Cambodia's forest wildlife: the config (D75)", () => {
  it("has every animal on PK's list, with Khmer and English names", () => {
    const ids = kinds.map((k) => k.id);
    for (const id of [
      'deer',
      'boar',
      'junglefowl',
      'elephant',
      'gaur',
      'banteng',
      'kouprey',
      'serow',
      'tiger',
      'cloudedLeopard',
      'leopard',
      'sunBear',
      'moonBear',
      'dhole',
      'binturong',
      'gibbon',
      'langur',
      'douc',
      'slowLoris',
      'macaque',
      'giantIbis',
      'hornbill',
      'peafowl',
      'crocodile',
      'kingCobra',
      'python',
    ])
      expect(ids, id).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of kinds) {
      expect(k.km.trim(), k.id).not.toBe('');
      expect(k.en.trim(), k.id).not.toBe('');
    }
    // Merged pairs name both species.
    expect(kind('gibbon').en + kind('gibbon').notes).toMatch(/pileated.*yellow-cheeked/is);
    expect(kind('macaque').en).toMatch(/long-tailed.*pig-tailed/i);
    expect(kind('slowLoris').en).toMatch(/pygmy.*bengal/i);
  });

  it('keeps the herds affordable (Low preset) and the rare ones rare', () => {
    const total = kinds.reduce((n, k) => n + k.count, 0);
    expect(total).toBeGreaterThan(220);
    expect(total).toBeLessThanOrEqual(450);
    for (const k of kinds) expect(k.count, k.id).toBeLessThanOrEqual(60);
    expect(kind('kouprey').count).toBeLessThanOrEqual(2);
    expect(kind('tiger').count).toBeLessThanOrEqual(kind('deer').count / 4);
  });

  it('behaviours, protection and habitats follow the species', () => {
    for (const id of ['tiger', 'leopard', 'cloudedLeopard', 'dhole', 'crocodile', 'kingCobra'])
      expect(kind(id).behaviour, id).toBe('predator');
    for (const id of ['boar', 'banteng', 'gaur', 'elephant', 'sunBear', 'moonBear'])
      expect(kind(id).behaviour, id).toBe('defensive');
    for (const id of [
      'elephant',
      'kouprey',
      'gibbon',
      'langur',
      'douc',
      'slowLoris',
      'giantIbis',
      'hornbill',
    ])
      expect(kind(id).huntable, id).toBe(false);
    expect(kind('slowLoris').nocturnal).toBe(true);
    expect(kind('crocodile').habitat).toBe('water');
    expect(kind('giantIbis').habitat).toBe('water');
    expect(kind('serow').habitat).toBe('hill');
    expect(kind('gibbon').habitat).toBe('canopy');
    // Every uncertain Khmer name or fact is explained for PK.
    for (const k of kinds.filter((x) => x.confidence && x.confidence !== 'HISTORICALLY_CONFIRMED'))
      expect(k.notes?.trim(), k.id).toBeTruthy();
  });
});

describe('wild animal behaviour in the simulation (D75)', () => {
  it('a predator attacks a villager who comes within its range', () => {
    const { s, v } = alone();
    const hp = v.hp;
    const [x, z] = openSpot(s, v.x, v.z, 4);
    const leopard = put(s, 'leopard', x, z);
    s.update(4);
    expect(leopard.prey).toBe(v.id);
    expect(!s.units.has(v.id) || v.hp < hp).toBe(true);
  });

  it('a king cobra only strikes people very close (short range)', () => {
    const { s, v } = alone();
    const hp = v.hp;
    const [x, z] = openSpot(s, v.x, v.z, 6);
    const cobra = put(s, 'kingCobra', x, z);
    s.update(3);
    expect(cobra.prey).toBeUndefined();
    expect(v.hp).toBe(hp);
  });

  it('a defensive animal strikes back at the villager hunting it', () => {
    const { s, v } = alone();
    const hp = v.hp;
    const [x, z] = openSpot(s, v.x, v.z, 5);
    const boar = put(s, 'boar', x, z);
    s.cmdHunt([v.id], boar.id);
    s.update(6);
    expect(boar.prey === v.id || !s.animals.has(boar.id)).toBe(true);
    expect(!s.units.has(v.id) || v.hp < hp).toBe(true);
  });

  it('a defensive animal left alone does not attack people', () => {
    const { s, v } = alone();
    const hp = v.hp;
    const [x, z] = openSpot(s, v.x, v.z, 2.5);
    const gaur = put(s, 'gaur', x, z);
    s.update(4);
    expect(gaur.prey).toBeUndefined();
    expect(v.hp).toBe(hp);
  });

  it('a shy animal runs from people who come near', () => {
    const { s, v } = alone();
    const [x, z] = openSpot(s, v.x, v.z, 4);
    const deer = put(s, 'deer', x, z);
    s.update(1);
    expect(deer.fleeUntil).toBeGreaterThan(0);
    expect(Math.hypot(deer.x - v.x, deer.z - v.z)).toBeGreaterThan(4.5);
  });

  it('villagers are never sent to hunt a protected animal', () => {
    const { s, v } = alone();
    const [x, z] = openSpot(s, v.x, v.z, 5);
    for (const id of ['elephant', 'gibbon', 'giantIbis']) {
      const a = put(s, id, x, z);
      s.cmdHunt([v.id], a.id);
      expect(v.task.kind, id).not.toBe('hunt');
      s.cmdSmart([v.id], [x, z], { animal: a.id });
      expect(v.task.kind, id).not.toBe('hunt');
      s.animals.delete(a.id);
    }
    // A huntable one still works.
    const deer = put(s, 'deer', x, z);
    s.cmdHunt([v.id], deer.id);
    expect(v.task.kind).toBe('hunt');
  });
});

describe('herds live in their habitats (D75)', () => {
  const s = new KingdomSim(data, 'easy', true, 7);
  const m = generateMap(data, 7);
  const homes = (id: string) =>
    [...s.animals.values()].filter((a) => a.kind === id).map((a) => worldToTile(s.map, a.home[0], a.home[1]));

  it('every kind is on the map at the start', () => {
    const present = new Set([...s.animals.values()].map((a) => a.kind));
    for (const k of kinds) expect(present.has(k.id), k.id).toBe(true);
  });

  it('crocodiles, giant ibises and pythons live by the water', () => {
    for (const id of ['crocodile', 'giantIbis', 'python']) {
      const hs = homes(id);
      expect(hs.length, id).toBeGreaterThan(0);
      for (const [x, z] of hs) expect(near(m, x, z, 'water'), `${id} at ${x},${z}`).toBe(true);
    }
  });

  it('serows live next to hills', () => {
    const hs = homes('serow');
    expect(hs.length).toBeGreaterThan(0);
    for (const [x, z] of hs) expect(near(m, x, z, 'hill'), `${x},${z}`).toBe(true);
  });

  it('canopy and forest animals live by the forest; doucs in the east', () => {
    for (const id of ['gibbon', 'hornbill', 'elephant', 'gaur'])
      for (const [x, z] of homes(id)) expect(near(m, x, z, 'forest'), id).toBe(true);
    const r = kind('douc').region!;
    const east = homes('douc').filter(([x, z]) => x >= r.x[0] && x <= r.x[1] && z >= r.z[0] && z <= r.z[1]);
    expect(east.length).toBe(homes('douc').length);
  });
});
