import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom, PROP_SLOTS } from '@temples/shared';
import { applyProp, fitGeometry } from './props';

const data = loadKingdom();
describe("PK's 3D props (1.6.0)", () => {
  it('every slot names a known spot and a small budget', () => {
    const slots = Object.entries(data.props.slots);
    expect(slots.length).toBeGreaterThan(0);
    for (const [id, s] of slots) {
      expect(PROP_SLOTS).toContain(id);
      expect(s!.file).toMatch(/^models\/props\/[a-z0-9-]+\.glb$/);
      expect(s!.tris).toBeLessThanOrEqual(3000);
    }
  });

  it('fits a model to the height of the shape it replaces, standing on the ground', () => {
    const like = new THREE.CylinderGeometry(0.5, 0.5, 6).translate(0, 3, 0); // 6 m, base at 0
    const model = new THREE.BoxGeometry(2, 1, 2).translate(5, 10, -3); // 1 m, off-centre, floating
    const g = fitGeometry(model, like, { fit: 'height' });
    const b = g.boundingBox!;
    expect(b.max.y - b.min.y).toBeCloseTo(6);
    expect(b.min.y).toBeCloseTo(0);
    expect((b.min.x + b.max.x) / 2).toBeCloseTo(0);
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0);
    expect(g.getAttribute('normal')).toBeDefined();
    // Smooth (mid-poly look) keeps shared vertices; faceted splits every triangle.
    expect(fitGeometry(model, like, { fit: 'height' }, false).index).not.toBeNull();
    expect(fitGeometry(model, like, { fit: 'height' }, true).index).toBeNull();
  });

  it('fits rocks by their widest side and sets them a little into the ground', () => {
    const like = new THREE.BoxGeometry(3, 1, 2).translate(0, 0.5, 0);
    const model = new THREE.BoxGeometry(1, 0.5, 0.5);
    const g = fitGeometry(model, like, { fit: 'width', sink: 0.1 });
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(3);
    expect(b.min.y).toBeCloseTo(-0.1 * 1.5);
  });

  it('puts a vertex-coloured plant on an instanced mesh and clears the old instance tint', () => {
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 4).translate(0, 2, 0),
      new THREE.MeshStandardMaterial({ vertexColors: true }),
      3,
    );
    mesh.setColorAt(0, new THREE.Color(0xd9a04a));
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.attributes.position!.count * 3).fill(0.5), 3));
    const root = new THREE.Group().add(new THREE.Mesh(geo));
    const slot = data.props.slots['tree.palm']!;
    expect(applyProp(mesh, root, slot)).toBe(true);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(4);
    expect(mesh.userData.prop).toBe(slot.file);
    const c = new THREE.Color();
    mesh.getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
  });
});

describe('prop colour grade', () => {
  it('brightens and saturates baked colours, clamped to 1', async () => {
    const { gradeColours } = await import('./props');
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.2, 0.3, 0.1, 0.9, 0.9, 0.9], 3));
    gradeColours(g, 1.5, 1.3);
    const c = g.getAttribute('color');
    expect(c.getY(0)).toBeGreaterThan(0.3);
    // More saturated: green pulls further away from red and blue.
    expect(c.getY(0) - c.getZ(0)).toBeGreaterThan(0.2 * 1.5);
    expect(c.getX(1)).toBe(1);
  });
});

describe('PK 1.9.0 (D146 ខ៣): six buildings drawn from PK’s Meshy models', () => {
  it('the hall, the house (PK: the Herbalist Hut), barracks, lumber camp, market, noble house, landing and storehouse have a model', async () => {
    const { loadKingdom } = await import('@temples/shared');
    const k = loadKingdom();
    const b = k.props.buildings ?? {};
    for (const id of ['townCentre', 'house', 'barracks', 'lumberCamp', 'market', 'nobleHouse', 'port', 'storehouse']) {
      const slot = b[id]!;
      expect(slot, id).toBeTruthy();
      expect(k.buildings[id], id).toBeTruthy();
      const json = await glbJson(slot.file);
      expect(json, slot.file).not.toBeNull();
      // One mesh; its PBR maps at most (colour, normal, roughness/metal: the semi-realistic look, D152).
      expect(json!.meshes).toHaveLength(1);
      expect(json!.textures?.length ?? 0).toBeLessThanOrEqual(3);
      expect(slot.tris).toBeLessThanOrEqual(15000);
      // PK's Meshy buildings are for the PC presets (D149); the royal hall shows on Low too.
      expect(!!slot.pc).toBe(id !== 'townCentre');
    }
  });
});

/** The JSON chunk of a .glb under public-mobile/ (null when the file is not there). */
async function glbJson(file: string): Promise<{ meshes?: unknown[]; textures?: unknown[]; skins?: unknown[]; animations?: unknown[] } | null> {
  const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
    existsSync(p: URL): boolean;
    readFileSync(p: URL): Uint8Array;
  };
  const url = new URL(`../../../public-mobile/${file}`, import.meta.url);
  if (!fs.existsSync(url)) return null;
  const b = fs.readFileSync(url);
  const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
}

describe('PK’s look notes of 2026-10-19', () => {
  it('the forest trees are three times taller (18 m and up), the Khmer house a little taller, boats sit in the water', async () => {
    const { loadKingdom } = await import('@temples/shared');
    const p = loadKingdom().props;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(p.trees!.find((t) => t.id === id)!.height, id).toBeGreaterThanOrEqual(18);
    expect(p.buildings!.house!.scaleY).toBeGreaterThan(1);
    for (const b of Object.values(p.boats!).filter((x) => typeof x === 'object')) expect((b as { sink: number }).sink).toBeGreaterThanOrEqual(0.3);
  });
});

describe('every scattered plant, rock and animal has its model (D154)', () => {
  it('each scatter kind’s file is in the game: one mesh of one part (one instanced draw), full PBR maps at most', async () => {
    const { loadKingdom } = await import('@temples/shared');
    const kinds = loadKingdom().props.scatter!.kinds;
    // The PC-only folder may be missing on a phone-only checkout: then there is nothing to check.
    const first = await glbJson(kinds[0]!.file);
    if (!first) return;
    const missing: string[] = [];
    for (const k of kinds) {
      const json = await glbJson(k.file);
      if (!json) {
        missing.push(k.file);
        continue;
      }
      const m = json.meshes as Array<{ primitives: unknown[] }>;
      expect(m.length, k.id).toBe(1);
      expect(m[0]!.primitives.length, k.id).toBe(1);
      // Colour, metal/roughness, normal and emissive (Meshy's PBR set).
      expect(json.textures?.length ?? 0, k.id).toBeLessThanOrEqual(4);
    }
    expect(missing).toEqual([]);
  });
});
