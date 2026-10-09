import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import {
  ELEPHANT_GRASS_VERTEX,
  ElephantGrass,
  TOP_CARD,
  elephantGrassMaterials,
  elephantGrassUniforms,
  grassCardGeometry,
  grassReach,
  layElephantGrass,
  windNoiseTexture,
} from './elephantGrass';
import { makePrekWater } from './water';
import type { Patch } from './detail';
import { GroundDetail } from '../hero/ground';

const D = loadKingdom().diorama;

describe('PK 1.8.0: crystal-clear turquoise water', () => {
  it('is turquoise, see-through where shallow (clarity) with light caustics on the bed', () => {
    const W = D.water;
    const hue = (h: string) => new THREE.Color(h).getHSL({ h: 0, s: 0, l: 0 }).h * 360;
    expect(hue(W.shallow)).toBeGreaterThan(160);
    expect(hue(W.shallow)).toBeLessThan(195);
    expect(W.clarity![0]).toBeLessThan(W.clarity![1]);
    expect(W.clarity![0]).toBeLessThanOrEqual(0.4);
    expect(W.caustics).toBeGreaterThan(0);
    const h = new THREE.DataTexture(new Float32Array(4), 2, 2, THREE.RedFormat, THREE.FloatType);
    const w = makePrekWater(h, 100, -0.1, new THREE.Vector3(0, 1, 0), W);
    const m = w.mesh.material as THREE.ShaderMaterial;
    const c = m.uniforms.uClarity!.value as THREE.Vector3;
    expect([c.x, c.y, c.z]).toEqual([W.clarity![0], W.clarity![1], W.caustics]);
    expect(m.fragmentShader).toContain('mix(uClarity.x, uClarity.y, k)');
    expect(m.transparent).toBe(true);
  });
});

describe("PK 1.8.0: PK's Meshy grass as cards", () => {
  it('cards: 3 crossed side cards (atlas columns), a flat top card for the RTS camera', () => {
    const g = grassCardGeometry(1.2, 4, true);
    const kind = g.getAttribute('aKind').array as Float32Array;
    const uv = g.getAttribute('uv').array as Float32Array;
    const pos = g.getAttribute('position').array as Float32Array;
    expect(g.index!.count / 3).toBe(3 * 4 * 2 + 2);
    // The top card: 4 corners at TOP_CARD, its own kind, the 4th atlas column.
    const tops = [...kind.keys()].filter((i) => kind[i] === 2);
    expect(tops.length).toBe(4);
    for (const i of tops) {
      expect(pos[i * 3 + 1]).toBeCloseTo(TOP_CARD);
      expect(uv[i * 2]).toBeGreaterThanOrEqual(0.75 - 1e-6);
    }
    // Without a top: 3 columns, one row a card = 6 triangles (the short meadow grass).
    const s = grassCardGeometry(1.2, 1);
    expect(s.index!.count / 3).toBe(6);
    expect(Math.max(...(s.getAttribute('uv').array as Float32Array).filter((_, i) => i % 2 === 0))).toBeCloseTo(1);
    // The shader folds the top card away for a low (hero) eye, and keeps the culm rule apart.
    expect(ELEPHANT_GRASS_VERTEX).toContain('aKind > 1.5');
    expect(ELEPHANT_GRASS_VERTEX).toContain('aKind > 0.5 && aKind < 1.5');
  });

  it('the card material cuts the atlas out (alpha test) and picks the row per clump', () => {
    const U = elephantGrassUniforms(D.sward, windNoiseTexture(16));
    const map = new THREE.Texture();
    const { material, depth } = elephantGrassMaterials(U, map);
    expect(material.map).toBe(map);
    expect(material.alphaTest).toBeGreaterThan(0);
    expect(depth.alphaTest).toBe(material.alphaTest);
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <uv_vertex>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_begin>' };
    material.onBeforeCompile(sh as never, undefined as never);
    expect(sh.vertexShader).toContain('vMapUv.y = vMapUv.y * 0.5 + aVariant * 0.5');
    expect(material.customProgramCacheKey()).toContain('cards');
  });

  it('the meadow grass (sward) is 30 cm: above the foot, below the knee, on every open grass tile', () => {
    const S = D.sward;
    expect(S.height[0]).toBeGreaterThanOrEqual(0.25);
    expect(S.height[1]).toBeLessThanOrEqual(0.35);
    expect(S.cover).toBe(1);
    expect(S.cards?.file).toBe('models/grass/sward.webp');
    expect(S.cards?.top).toBe(true);
    // The tall grass stays under 1 m (PK) and keeps its own atlas.
    expect(D.elephantGrass.height[1]).toBeLessThan(1);
    expect(D.elephantGrass.cards?.file).not.toBe(S.cards?.file);
    // Every grass tile far from water and buildings gets clumps; soil, forest and water none.
    const at = (tx: number, tz: number): Patch => (tz < -6 ? 'water' : tx > 8 ? 'soil' : tx < -8 ? 'forest' : 'grass');
    const tiles = new Set<string>();
    const c = layElephantGrass(0, 0, 24, 2, 0, at, () => true, { ...S, count: 100000 });
    for (const p of c) {
      const tx = Math.floor(p.x / 2);
      const tz = Math.floor(p.z / 2);
      expect(at(tx, tz)).toBe('grass');
      expect(p.s).toBeGreaterThanOrEqual(S.height[0] - 1e-9);
      expect(p.s).toBeLessThanOrEqual(S.height[1] + 1e-9);
      tiles.add(`${tx},${tz}`);
    }
    let grass = 0;
    for (let tz = -12; tz <= 12; tz++)
      for (let tx = -8; tx <= 8; tx++) if (at(tx, tz) === 'grass' && tz > -4 && Math.hypot(tx * 2 + 1, tz * 2 + 1) < 22) grass++;
    let hit = 0;
    for (let tz = -3; tz <= 12; tz++)
      for (let tx = -8; tx <= 8; tx++) if (Math.hypot(tx * 2 + 1, tz * 2 + 1) < 22 && tiles.has(`${tx},${tz}`)) hit++;
    expect(hit / grass).toBeGreaterThan(0.9);
    // The carpet reaches as far as its clumps last (the distance fade ends it, not a hard edge).
    const r = grassReach(S, 2);
    expect(r).toBeGreaterThan(25);
    expect(Math.PI * (r / 2) ** 2 * S.perTile).toBeLessThanOrEqual(S.count);
  });

  it('the sward is one instanced draw within the Low budget, tinted to the ground green', () => {
    const g = new ElephantGrass(D.sward, false);
    expect(g.cards).toBe(true);
    const tris = g.mesh.geometry.index!.count / 3;
    expect(tris).toBe(8);
    expect(tris * D.sward.count).toBeLessThanOrEqual(150_000);
    const at = (): Patch => 'grass';
    g.lay(0, 0, 20, 2, 0, at, () => true, true);
    expect(g.planted).toBeGreaterThan(1000);
    const c = new THREE.Color();
    g.mesh.getColorAt(0, c);
    expect(c.g).toBeGreaterThan(c.r);
    expect(c.g).toBeGreaterThan(c.b);
  });

  it('in the hero mode the old tufts leave the meadows to the sward (the forest floor keeps them)', () => {
    const at = (x: number): 'grass' | 'forest' => (x < 0 ? 'forest' : 'grass');
    const old = new GroundDetail();
    old.update(0, 0, 0, at);
    const now = new GroundDetail(false);
    now.update(0, 0, 0, at);
    expect(now.tufts).toBeGreaterThan(0);
    expect(now.tufts).toBeLessThan(old.tufts * 0.7);
  });
});
