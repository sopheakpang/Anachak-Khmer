import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { FishSchools, fishGeometry, fishModelGeometry } from './fishSchool';

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

  it('D160: PK’s Blender fish — several kinds in each school, by their weights', () => {
    const F = loadKingdom().props.fish!;
    expect(F.kinds.map((k) => k.id)).toEqual(['treyRiel', 'treyRos', 'treyPra']);
    const shipped = Object.keys(import.meta.glob('../../../public-mobile/models/real/fish/*'));
    for (const k of F.kinds) expect(shipped.some((f) => f.endsWith(k.file))).toBe(true);
    const f = new FishSchools();
    f.setKinds(F.kinds.map((k) => ({ geometry: fishGeometry(), weight: k.weight })));
    expect(f.group.children.length).toBe(3);
    const spots = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, z: 0, full: 1 }));
    f.update(spots, 0);
    const counts = f.group.children.map((m) => (m as THREE.InstancedMesh).count);
    expect(counts.every((c) => c > 0)).toBe(true);
    // Trey riel is the most of a school.
    expect(counts[0]).toBeGreaterThan(counts[1]!);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(f.swimming);
  });

  it('D160: a model is turned nose to +z like the built-in fish, and sized', () => {
    // A 1 m "fish" along −z (glTF from Blender): its nose (the narrow end) at z = −0.5.
    const src = new THREE.ConeGeometry(0.1, 1, 6).rotateX(-Math.PI / 2);
    const g = fishModelGeometry(src, 0.5);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z - g.boundingBox!.min.z).toBeCloseTo(0.5);
    // The cone's tip went from −z to +z.
    const pos = g.getAttribute('position');
    let tip = -Infinity;
    for (let i = 0; i < pos.count; i++) tip = Math.max(tip, pos.getZ(i));
    expect(tip).toBeCloseTo(0.25);
    expect(g.getAttribute('color')).toBeTruthy();
  });
});
