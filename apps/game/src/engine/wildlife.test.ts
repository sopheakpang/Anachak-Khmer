import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { LIMB } from './figures';
import { WILDLIFE_GEOMETRY } from './wildlife';
import { ANIMAL_LOOK } from '../kingdom/view/wildLook';
import { animalTraits } from '../kingdom/wildlife';

/** Cambodia's forest wildlife models (D75): one low-poly model per kind, GPU-animated. */

const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;
const limbKinds = (g: THREE.BufferGeometry) => {
  const a = g.getAttribute('limb');
  const out = new Set<number>();
  for (let i = 0; i < a.count; i++) out.add(Math.round(a.getZ(i)));
  return out;
};
const models = Object.fromEntries(Object.entries(WILDLIFE_GEOMETRY).map(([id, f]) => [id, f()]));
const kinds = loadKingdom().world.animals.kinds;

describe("Cambodia's wildlife models (D75)", () => {
  it('every model builds with colours, normals and limb data on every vertex', () => {
    for (const [id, g] of Object.entries(models)) {
      const n = g.getAttribute('position').count;
      expect(n, id).toBeGreaterThan(0);
      for (const attr of ['normal', 'color', 'limb', 'limbZ'])
        expect(g.getAttribute(attr)?.count, `${id}.${attr}`).toBe(n);
      // More than one colour: markings, eyes, horns or bills read at RTS distance.
      const c = g.getAttribute('color');
      const colours = new Set<string>();
      for (let i = 0; i < c.count; i += 3)
        colours.add(`${c.getX(i).toFixed(2)},${c.getY(i).toFixed(2)},${c.getZ(i).toFixed(2)}`);
      expect(colours.size, id).toBeGreaterThan(1);
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y, id).toBeGreaterThan(-0.05); // stands on the ground
    }
  });

  it('stays under the triangle cap (Low preset): 600 each, the reused elephant 1000', () => {
    for (const [id, g] of Object.entries(models))
      expect(tris(g), id).toBeLessThanOrEqual(id === 'elephant' ? 1000 : 600);
  });

  it('snakes and the crocodile glide (no swinging legs); legged animals walk; gibbons swing their arms', () => {
    for (const id of ['crocodile', 'kingCobra', 'python']) {
      expect(limbKinds(models[id]!).has(LIMB.leg), id).toBe(false);
      expect(limbKinds(models[id]!).has(LIMB.sway), id).toBe(true);
      expect(ANIMAL_LOOK[id]!.leg, id).toBe(0);
    }
    for (const id of ['gaur', 'leopard', 'dhole', 'moonBear', 'macaque', 'giantIbis'])
      expect(limbKinds(models[id]!).has(LIMB.leg), id).toBe(true);
    expect(limbKinds(models.gibbon!).has(LIMB.arm)).toBe(true);
  });

  it('the Kingdom view knows how to draw every animal kind in the config', () => {
    for (const k of kinds) {
      const look = ANIMAL_LOOK[k.id];
      expect(look, k.id).toBeDefined();
      expect(look!.scale, k.id).toBeGreaterThan(0);
      expect(look!.ring, k.id).toBeGreaterThan(0);
      if (k.habitat === 'canopy') expect(look!.perch, k.id).toBeGreaterThan(1);
    }
  });

  it('hover tips name the behaviour: dangerous, fights back, shy, nocturnal', () => {
    const k = (id: string) => kinds.find((x) => x.id === id)!;
    expect(animalTraits(k('tiger'))).toMatch(/Dangerous/);
    expect(animalTraits(k('gaur'))).toMatch(/Fights back/);
    expect(animalTraits(k('deer'))).toMatch(/Shy/);
    expect(animalTraits(k('slowLoris'))).toMatch(/Nocturnal/);
    expect(animalTraits(k('slowLoris'))).not.toMatch(/Dangerous/);
  });
});
