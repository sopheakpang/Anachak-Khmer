import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FOREARM,
  SHIN,
  THIGH,
  UPPER_ARM,
  footGeometry,
  handGeometries,
  headGeometry,
  limbGeometry,
  torsoGeometry,
} from './anatomy';

/** PK: the figures must look human — a sculpted torso, shaped limbs, hands, a jaw. */

const finite = (g: THREE.BufferGeometry) =>
  Array.from(g.getAttribute('position').array as Float32Array).every(Number.isFinite);
const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('anatomy', () => {
  it('the torso is a V: the chest broader than the waist, the chest deeper in front', () => {
    const g = torsoGeometry();
    expect(finite(g)).toBe(true);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const widthAt = (y: number) => {
      let w = 0;
      for (let i = 0; i < p.count; i++)
        if (Math.abs(p.getY(i) - y) < 0.001) w = Math.max(w, Math.abs(p.getX(i)));
      return w;
    };
    expect(widthAt(0.42)).toBeGreaterThan(widthAt(0.12) * 1.35);
    // Faces look outward: the normal at the front of the chest points forward.
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    let front = -1;
    let best = -Infinity;
    for (let i = 0; i < p.count; i++)
      if (p.getZ(i) > best && Math.abs(p.getY(i) - 0.36) < 0.001) {
        best = p.getZ(i);
        front = i;
      }
    expect(n.getZ(front)).toBeGreaterThan(0.5);
  });

  it('limbs follow their profiles and hang below the joint', () => {
    for (const [len, prof] of [
      [0.28, UPPER_ARM],
      [0.26, FOREARM],
      [0.44, THIGH],
      [0.42, SHIN],
    ] as const) {
      const g = limbGeometry(len, [...prof]);
      expect(finite(g)).toBe(true);
      const b = box(g);
      expect(b.min.y).toBeLessThan(-len);
      expect(b.max.x).toBeGreaterThan(Math.max(...prof.map((q) => q[1])) * 0.95);
    }
  });

  it('hands have a palm, four fingers and a thumb; feet point forward', () => {
    const h = handGeometries(-1);
    expect(finite(h.palm) && finite(h.fingers)).toBe(true);
    expect(h.fingers.getAttribute('position').count).toBeGreaterThan(5 * 20);
    const f = box(footGeometry());
    expect(f.max.z).toBeGreaterThan(0.1);
  });

  it('the head narrows to the jaw and chin', () => {
    const g = headGeometry(0.105);
    expect(finite(g)).toBe(true);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    let top = 0;
    let jaw = 0;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (Math.abs(y) < 0.01) top = Math.max(top, Math.abs(p.getX(i)));
      if (y < -0.075 && y > -0.085) jaw = Math.max(jaw, Math.abs(p.getX(i)));
    }
    expect(jaw).toBeLessThan(top * 0.7);
  });
});
