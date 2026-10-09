import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { LightShafts, MistLayer, cellSpots, mistAmount, shaftAmount } from './atmosphere';
import { splatTerrain, wetness } from './terrain';
import { GroundDetailRts, frondGeometry, layDetail, mossyRockGeometry, rootGeometry, type Patch } from './detail';

const data = loadKingdom();
const D = data.diorama;

describe('the jungle clearing (PK 1.8.0 references)', () => {
  it('the earth is red laterite mud; puddles and wetness are configured', () => {
    const soil = new THREE.Color(D.ground.soil);
    expect(soil.r).toBeGreaterThan(soil.g * 1.4); // red, not brown-grey
    expect(D.wet.soak).toBeGreaterThan(D.wet.dry); // soaks fast, dries slowly
  });

  it('the ground soaks in rain, dries after, stays in 0..1', () => {
    let w = 0;
    for (let i = 0; i < 30; i++) w = wetness(w, true, 1, D.wet);
    expect(w).toBeGreaterThan(0.9);
    const after = wetness(w, false, 60, D.wet);
    expect(after).toBeLessThan(w);
    expect(after).toBeGreaterThan(0.5); // a minute later the paths are still wet
    expect(wetness(0, false, 100, D.wet)).toBe(0);
    expect(wetness(1, true, 100, D.wet)).toBe(1);
  });

  it('the ground shader: dead leaves only where the land is forest, puddles shine, uniforms to drive', () => {
    const m = new THREE.MeshStandardMaterial();
    const u = splatTerrain(m, D.terrain, D.ground, new THREE.Texture(), 100, D.wet);
    const sh = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <color_fragment>\n#include <roughnessmap_fragment>\n}',
    };
    m.onBeforeCompile(sh as never, undefined as never);
    expect(sh.vertexShader).toContain('attribute float aForest');
    expect(sh.fragmentShader).toContain('smoothstep(0.3, 0.9, vForest)');
    expect(sh.fragmentShader).toContain('sPuddle');
    expect(sh.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.3, sPuddle)');
    expect(u.uWet.value).toBe(0);
    expect(sh.uniforms.uWet).toBe(u.uWet);
  });

  it('mossy laterite rocks (moss on top), fallen palm fronds, creeping roots', () => {
    const rock = mossyRockGeometry();
    rock.computeBoundingBox();
    expect(rock.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.01);
    const col = rock.getAttribute('color').array as Float32Array;
    let mossy = 0;
    for (let i = 0; i < col.length; i += 3) if (col[i + 1]! > col[i]!) mossy++;
    expect(mossy).toBeGreaterThan(0); // some green faces
    expect(mossy).toBeLessThan(col.length / 3); // mostly laterite
    frondGeometry().computeBoundingBox();
    const f = frondGeometry();
    f.computeBoundingBox();
    expect(f.boundingBox!.max.y).toBeLessThan(0.2); // lies on the ground
    const r = rootGeometry();
    r.computeBoundingBox();
    expect(r.boundingBox!.max.z).toBeGreaterThan(2.5);
  });

  it('they lie on the forest floor and its edge; a few rocks on open land; none on built land', () => {
    const forest = layDetail(0, 0, 80, 2, 0, () => 'forest', { ...D.detail, rocks: 999, fronds: 999, roots: 999 });
    for (const k of ['rock', 'frond', 'root'] as const) expect(forest.some((p) => p.kind === k)).toBe(true);
    const open = layDetail(0, 0, 80, 2, 0, () => 'grass', { ...D.detail, rocks: 999, fronds: 999, roots: 999 });
    expect(open.some((p) => p.kind === 'frond' || p.kind === 'root')).toBe(false);
    const edge: (tx: number, tz: number) => Patch = (tx) => (tx < 0 ? 'forest' : 'grass');
    const e = layDetail(0, 0, 80, 2, 0, edge, { ...D.detail, rocks: 999, fronds: 999, roots: 999 });
    expect(e.some((p) => p.kind === 'frond' && p.x >= 0 && p.x < 4)).toBe(true);
    expect(layDetail(0, 0, 80, 2, 0, () => 'none', D.detail)).toEqual([]);
    const g = new GroundDetailRts(D.detail);
    g.update(0, 0, 50, 1, 2, 0, () => 'forest');
    expect(g.laid).toBeGreaterThan(0);
  });
});

describe('mist and light shafts (PK 1.8.0)', () => {
  const A = D.atmosphere;

  it('mist: thick in mist and rain, at dawn and after rain; thin on a clear noon', () => {
    expect(mistAmount('mist', 0, 0, A.mist)).toBeGreaterThan(mistAmount('clear', 0, 0, A.mist));
    expect(mistAmount('clear', 1, 0, A.mist)).toBeGreaterThan(mistAmount('clear', 0, 0, A.mist));
    expect(mistAmount('clear', 0, 1, A.mist)).toBeGreaterThan(mistAmount('clear', 0, 0, A.mist));
    expect(mistAmount('mist', 1, 1, A.mist)).toBeLessThanOrEqual(1);
  });

  it('shafts: strongest on a cloudy day or after rain, none in a storm or at night', () => {
    expect(shaftAmount('cloudy', 0, 0, A.shafts)).toBeGreaterThan(shaftAmount('clear', 0, 0, A.shafts));
    expect(shaftAmount('clear', 1, 0, A.shafts)).toBeGreaterThan(shaftAmount('clear', 0, 0, A.shafts));
    expect(shaftAmount('storm', 0, 0, A.shafts)).toBe(0);
    expect(shaftAmount('cloudy', 0, 1, A.shafts)).toBe(0);
  });

  it('spots: fixed to the world grid (the same place from a nearby view), nearest first, capped', () => {
    const a = cellSpots(0, 0, 200, 30, 50, 7);
    const b = cellSpots(5, 5, 200, 30, 50, 7);
    expect(a.length).toBeGreaterThan(5);
    const key = (p: [number, number, number]) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    const bs = new Set(b.map(key));
    expect(a.slice(0, 5).every((p) => bs.has(key(p)))).toBe(true);
    expect(cellSpots(0, 0, 200, 30, 3, 7)).toHaveLength(3);
  });

  it('the layers lay round the view, hide when not wanted, beams run toward the sun', () => {
    const mist = new MistLayer(A.mist);
    mist.update(1, 0, 0, 120, 0.5, 0, new THREE.Vector2(1, 0));
    expect(mist.laid).toBeGreaterThan(0);
    expect(mist.group.visible).toBe(true);
    mist.update(1, 0, 0, 120, 0, 0, new THREE.Vector2(1, 0));
    expect(mist.group.visible).toBe(false);
    const sh = new LightShafts(A.shafts);
    const sun = new THREE.Vector3(0.5, 0.6, 0.3).normalize();
    sh.update(1, 0, 0, 120, 1, sun, new THREE.Vector3(50, 80, 50));
    expect(sh.laid).toBeGreaterThan(0);
    expect(sh.uniforms.uSun.value.equals(sun)).toBe(true);
    expect((sh.mesh.material as THREE.ShaderMaterial).blending).toBe(THREE.AdditiveBlending);
  });
});
