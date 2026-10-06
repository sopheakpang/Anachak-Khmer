import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { stiltHouseGeometry } from './art';
import { keungHouseGeometry, rongHouseGeometry } from './houses';
import { chickenGeometry, cowGeometry, pigGeometry, scaleAnimal } from './livestock';
import { LIMB } from '../../engine/figures';

const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const bounds = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

/** Every model is a merged part list: the same vertex count in each attribute the crowd shader reads. */
function wellFormed(g: THREE.BufferGeometry): void {
  const n = g.getAttribute('position').count;
  for (const a of ['normal', 'color', 'limb', 'limbZ']) expect(g.getAttribute(a)?.count, a).toBe(n);
  expect(g.index).toBeNull();
}

const legs = (g: THREE.BufferGeometry) => {
  const limb = g.getAttribute('limb');
  let k = 0;
  for (let i = 0; i < limb.count; i++) if (limb.getZ(i) === LIMB.leg) k++;
  return k;
};

describe('Khmer houses from PK’s reference series', () => {
  it('Pteas Rong fits its 4 × 4 m plot, floor ~2.2 m, ~5.5 m high, under 6000 triangles', () => {
    const g = rongHouseGeometry();
    wellFormed(g);
    const b = bounds(g);
    expect(tri(g)).toBeLessThan(6000);
    for (const v of [b.min.x, b.min.z]) expect(v).toBeGreaterThanOrEqual(-2 - 0.6);
    for (const v of [b.max.x, b.max.z]) expect(v).toBeLessThanOrEqual(2 + 0.6);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(b.max.y).toBeGreaterThan(5.2);
    expect(b.max.y).toBeLessThan(5.9);
  });

  it('Pteas Keung fits its 6 × 6 m plot, ~7.5 m high, under 6000 triangles', () => {
    const g = keungHouseGeometry();
    wellFormed(g);
    const b = bounds(g);
    expect(tri(g)).toBeLessThan(6000);
    for (const v of [b.min.x, b.min.z]) expect(v).toBeGreaterThanOrEqual(-3 - 0.6);
    for (const v of [b.max.x, b.max.z]) expect(v).toBeLessThanOrEqual(3 + 0.6);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(b.max.y).toBeGreaterThan(7.0);
    expect(b.max.y).toBeLessThan(7.9);
  });

  it('the official’s Keung house stands well above the Rong and the old stilt house', () => {
    const k = bounds(keungHouseGeometry()).max.y;
    expect(k).toBeGreaterThan(bounds(rongHouseGeometry()).max.y + 1.5);
    expect(bounds(rongHouseGeometry()).max.y).toBeGreaterThan(bounds(stiltHouseGeometry()).max.y);
  });

  it('both houses carry a team-colour cloth', () => {
    for (const g of [rongHouseGeometry(), keungHouseGeometry()]) {
      const limb = g.getAttribute('limb');
      let cloth = 0;
      for (let i = 0; i < limb.count; i++) if (limb.getW(i) === 1) cloth++;
      expect(cloth).toBeGreaterThan(0);
    }
  });
});

describe('village livestock', () => {
  it('pig: ~0.9 m long, low, walking legs, ≤ 1200 triangles', () => {
    const g = pigGeometry();
    wellFormed(g);
    const b = bounds(g);
    expect(tri(g)).toBeLessThanOrEqual(1200);
    expect(b.max.z - b.min.z).toBeGreaterThan(0.8);
    expect(b.max.z - b.min.z).toBeLessThan(1.0);
    expect(b.max.y).toBeLessThan(0.65);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(legs(g)).toBeGreaterThan(0);
  });

  it('chicken: ~0.4 m, walking legs, ≤ 600 triangles', () => {
    const g = chickenGeometry();
    wellFormed(g);
    const b = bounds(g);
    expect(tri(g)).toBeLessThanOrEqual(600);
    expect(b.max.y).toBeGreaterThan(0.35);
    expect(b.max.y).toBeLessThan(0.48);
    expect(legs(g)).toBeGreaterThan(0);
  });

  it('cow: the white zebu, or a smaller brown one whose leg pivots scale with it', () => {
    const white = cowGeometry();
    const brown = cowGeometry({ brown: true });
    wellFormed(white);
    wellFormed(brown);
    expect(bounds(brown).max.y).toBeCloseTo(bounds(white).max.y * 0.9, 3);
    expect(legs(brown)).toBe(legs(white));
    const s = scaleAnimal(pigGeometry(), 2);
    const pig = pigGeometry();
    const i = pig.getAttribute('limb').count - 1; // the last part is a leg
    expect(s.getAttribute('limb').getY(i)).toBeCloseTo(pig.getAttribute('limb').getY(i) * 2);
    expect(s.getAttribute('limbZ').getX(i)).toBeCloseTo(pig.getAttribute('limbZ').getX(i) * 2);
  });
});
