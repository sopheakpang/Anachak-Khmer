import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { kitFor } from '@temples/shared';
import { lionGeometry, ornamentLayout, TempleOrnaments, towersFromKit } from './ornaments';

const kit = kitFor('preah-ko')!;
const specs = ornamentLayout(kit);
const count = (kind: string, tower?: number) =>
  specs.filter((s) => s.kind === kind && (tower === undefined || s.tower === tower)).length;

describe('Preah Ko architectural detail', () => {
  it('reads six towers with body, plinth and four roof tiers from the kit', () => {
    const towers = towersFromKit(kit);
    expect(towers).toHaveLength(6);
    for (const t of towers) {
      expect(t.side).toBeCloseTo(3.6, 5);
      expect(t.y0).toBeCloseTo(1.8, 5);
      expect(t.tiers).toHaveLength(4);
      expect(t.tiers.map((k) => k.side)).toEqual([...t.tiers.map((k) => k.side)].sort((a, b) => b - a));
      expect(t.bodyTop).toBeGreaterThan(t.y0 + 5);
    }
    // Front row taller than the back row (as at Preah Ko).
    expect(towers[1]!.bodyTop).toBeGreaterThan(towers[4]!.bodyTop);
  });

  it('gives every tower one real door and three carved false doors', () => {
    for (let t = 0; t < 6; t++) {
      expect(count('colonettes', t)).toBe(1);
      expect(count('falseDoor', t)).toBe(3);
      expect(count('guardian', t)).toBe(2);
      expect(count('pilaster', t)).toBe(4 + 6);
      expect(count('cornice', t)).toBe(5); // body + 4 tiers
      expect(count('antefix', t)).toBe(5 * 8);
      expect(count('miniDoor', t)).toBe(4 * 4);
      expect(count('steps', t)).toBe(1);
      expect(count('lion', t)).toBe(2);
    }
    expect(count('lion', -1)).toBe(2); // platform stair guardians
  });

  it('false doors face back, left and right; the real door faces the front', () => {
    const t0 = towersFromKit(kit)[0]!;
    const doors = specs.filter((s) => s.kind === 'falseDoor' && s.tower === 0);
    for (const d of doors) {
      const dx = d.pos[0] - t0.x;
      const dz = d.pos[2] - t0.z;
      expect(dz).toBeLessThan(t0.side / 2); // never on the front face
      expect(Math.hypot(dx, dz)).toBeGreaterThan(t0.side / 2 - 0.01);
    }
    const cols = specs.find((s) => s.kind === 'colonettes' && s.tower === 0)!;
    expect(cols.pos[2]).toBeGreaterThan(t0.z + t0.side / 2);
  });

  it('guardian niches sit between the door colonettes and the corner pilasters', () => {
    const t0 = towersFromKit(kit)[0]!;
    for (const g of specs.filter((s) => s.kind === 'guardian' && s.tower === 0)) {
      const off = Math.abs(g.pos[0] - t0.x);
      const halfW = 0.31 * g.scale[0];
      expect(off - halfW).toBeGreaterThan(0.98);
      expect(off + halfW).toBeLessThan(t0.side / 2 - 0.2 + 0.05);
    }
  });

  it('everything stays on the platform', () => {
    for (const s of specs) {
      expect(Math.abs(s.pos[0])).toBeLessThan(15.5);
      expect(Math.abs(s.pos[2])).toBeLessThan(13);
    }
  });

  it('ornaments appear as the tower rises, pilasters grow with the walls', () => {
    const mat = new THREE.MeshBasicMaterial();
    const o = new TempleOrnaments(kit, mat, mat, false);
    const none = [0, 0, 0, 0, 0, 0];
    expect(o.visibleCount(none, false)).toBe(0);
    expect(o.visibleCount(none, true)).toBe(2); // platform lions only
    const all = [99, 99, 99, 99, 99, 99];
    expect(o.visibleCount(all, true)).toBe(specs.length);
    // Walls at 3 m: base mould, pilasters, colonettes, steps, lions, guardians; no false doors or roof yet.
    const mid = [1.8 + 3, 0, 0, 0, 0, 0];
    const shown = specs.filter((s) => s.tower === 0 && mid[0]! >= s.need).map((s) => s.kind);
    expect(shown).toContain('pilaster');
    expect(shown).toContain('guardian');
    expect(shown).not.toContain('falseDoor');
    expect(shown).not.toContain('antefix');
    o.update(mid, true);
    const pil = o.group.children.find(
      (c) => (c as THREE.InstancedMesh).count === count('pilaster'),
    ) as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    pil.getMatrixAt(0, m);
    const scale = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.y).toBeCloseTo(3, 5);
  });

  it('lions sit on the ground facing forward', () => {
    const g = lionGeometry();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(g.boundingBox!.max.y).toBeGreaterThan(1);
    expect(g.boundingBox!.max.z).toBeGreaterThan(-g.boundingBox!.min.z - 0.1);
  });
});
