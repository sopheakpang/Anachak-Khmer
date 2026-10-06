import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FishSchools, fishGeometry } from './fishSchool';

/** PK: fish swim round the fishing spots, now and then leaping out. */
describe('fish in the water', () => {
  it('a school swims round each spot, fewer where it is fished out', () => {
    const f = new FishSchools();
    f.update([{ x: 0, z: 0, full: 1 }], 0);
    const full = f.swimming;
    expect(full).toBeGreaterThanOrEqual(5);
    f.update([{ x: 0, z: 0, full: 0.1 }], 0);
    expect(f.swimming).toBeLessThan(full);
    expect(f.swimming).toBeGreaterThan(0);
    f.update([], 0);
    expect(f.swimming).toBe(0);
  });

  it('they stay round the spot, at the surface or leaping a little above it', () => {
    const f = new FishSchools();
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let leapt = false;
    for (let t = 0; t < 40; t += 0.25) {
      f.update([{ x: 10, z: -5, full: 1 }], t);
      for (let i = 0; i < f.swimming; i++) {
        f.mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        expect(Math.hypot(p.x - 10, p.z + 5)).toBeLessThan(4.5);
        expect(p.y).toBeLessThan(0.9);
        if (p.y > 0) leapt = true;
      }
    }
    expect(leapt).toBe(true);
  });

  it('the fish model is small and light', () => {
    const g = fishGeometry();
    expect(g.getAttribute('position').count / 3).toBeLessThan(200);
  });
});
