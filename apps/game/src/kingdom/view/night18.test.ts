import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import {
  ELEPHANT_GRASS_VERTEX,
  ElephantGrass,
  MAX_PUSH,
  elephantGrassGeometry,
  elephantGrassMaterials,
  elephantGrassUniforms,
  layElephantGrass,
  standNoise,
  windDir,
  windNoiseTexture,
} from './elephantGrass';
import { MAX_SEE, SEE_FRAGMENT, addSeeThrough, seeAmount, seeUniforms, setTargets } from './seeThrough';
import { TorchView, falloffTexture, flicker, torchSpots } from './torches';
import { NightSky, moonDir, moonLit, moonPhase, starField } from './nightSky';
import type { Patch } from './detail';
import { ACT, LIMB_VERTEX } from '../../engine/figures';

const data = loadKingdom();
const EG = data.diorama.elephantGrass;
const N = data.anachak.night;

/** Run a material's onBeforeCompile on stand-in shader text with the chunks three uses. */
function compile(m: THREE.Material) {
  const sh = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n#include <project_vertex>\n}',
    fragmentShader:
      '#include <common>\nvoid main(){\n#include <clipping_planes_fragment>\n#include <normal_fragment_begin>\n#include <color_fragment>\n}',
  };
  m.onBeforeCompile(sh as never, undefined as never);
  return sh;
}

describe('elephant grass (PK 1.8.0)', () => {
  it('config: tall (2–3 m), dense stands, and the PC presets plant it (not lite, not the phone)', async () => {
    expect(EG.height[0]).toBeGreaterThanOrEqual(1.8);
    expect(EG.height[1]).toBeLessThanOrEqual(3.5);
    expect(EG.count).toBeGreaterThan(200);
    const q = (await import('../../../../../config/quality.json')).default as unknown as Record<
      string,
      { kingdom: { elephantGrass?: boolean; grassShadows?: boolean } }
    >;
    for (const p of ['low', 'high', 'ultra']) expect(q[p]!.kingdom.elephantGrass).toBe(true);
    for (const p of ['lite', 'mobile']) expect(q[p]!.kingdom.elephantGrass).toBe(false);
    expect(q.low!.kingdom.grassShadows).toBe(false); // the stream laptop skips the extra pass
  });

  it('a clump is 1 m tall (the instance scales it), leaves and flowering culms, light triangles', () => {
    const g = elephantGrassGeometry(EG.blades);
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(g.boundingBox!.max.y).toBeGreaterThan(1);
    expect(g.boundingBox!.max.y).toBeLessThan(1.45);
    const kinds = g.getAttribute('aKind').array as Float32Array;
    expect(kinds.some((k) => k === 0) && kinds.some((k) => k === 1)).toBe(true);
    // Triangles per clump stay small: the stand budget is count × this.
    expect(g.getAttribute('position').count / 3).toBeLessThan(120);
  });

  it('the wind noise texture tiles and is not flat', () => {
    const t = windNoiseTexture(64);
    const d = t.image.data as Uint8Array;
    const min = Math.min(...d);
    const max = Math.max(...d);
    expect(max - min).toBeGreaterThan(60);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    // The wind direction is a unit vector.
    expect(windDir(EG.wind.dirDeg).length()).toBeCloseTo(1);
  });

  it('the shader: one noise fetch at the clump root, quadratic bend, trample, distance shrink', () => {
    const fetches = ELEPHANT_GRASS_VERTEX.match(/texture2D\(/g) ?? [];
    expect(fetches.length).toBe(1);
    expect(ELEPHANT_GRASS_VERTEX).toContain('eBend * eH * eH');
    expect(ELEPHANT_GRASS_VERTEX).toContain('uEgPush');
    expect(ELEPHANT_GRASS_VERTEX).toContain('uEgLod');
    const U = elephantGrassUniforms(EG, windNoiseTexture(16));
    expect(U.uEgPush.value.length).toBe(MAX_PUSH);
    const { material, depth } = elephantGrassMaterials(U);
    const sh = compile(material);
    expect(sh.vertexShader).toContain('uEgNoise');
    expect(sh.fragmentShader).toContain('uEgSheen');
    expect(sh.fragmentShader).toContain('viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)'); // no black backs
    // The shadow pass sways with the grass.
    expect(compile(depth).vertexShader).toContain('eDisp');
    expect(material.customProgramCacheKey()).not.toBe(depth.customProgramCacheKey());
  });

  it('grows in stands on wild grass and banks; never near buildings, on earth or on other land', () => {
    const grassEverywhere = (): Patch => 'grass';
    const all = layElephantGrass(0, 0, 60, 2, 0, grassEverywhere, () => true, { ...EG, count: 5000 });
    expect(all.length).toBeGreaterThan(50);
    // Stands, not a carpet: a good share of open land stays clear.
    let inStand = 0;
    let tiles = 0;
    for (let tz = -30; tz < 30; tz++)
      for (let tx = -30; tx < 30; tx++) {
        tiles++;
        if (standNoise(tx, tz, EG.standTiles) >= 1 - EG.cover) inStand++;
      }
    expect(inStand / tiles).toBeGreaterThan(0.05);
    expect(inStand / tiles).toBeLessThan(0.7);
    for (const c of all) {
      expect(c.s).toBeGreaterThanOrEqual(EG.height[0]);
      expect(c.s).toBeLessThanOrEqual(EG.height[1]);
    }
    // Forbidden: near buildings (clear says no), soil, forest, none.
    expect(layElephantGrass(0, 0, 60, 2, 0, grassEverywhere, () => false, EG)).toHaveLength(0);
    for (const p of ['soil', 'forest', 'none', 'water'] as Patch[])
      expect(layElephantGrass(0, 0, 60, 2, 0, () => p, () => true, EG)).toHaveLength(0);
    // Banks grow reeds of it too.
    expect(layElephantGrass(0, 0, 60, 2, 0, () => 'bank', () => true, EG).length).toBeGreaterThan(0);
    // Capped at count, nearest first.
    const capped = layElephantGrass(0, 0, 60, 2, 0, grassEverywhere, () => true, { ...EG, count: 10 });
    expect(capped).toHaveLength(10);
  });

  it('the field re-lays only when the view moves on, and takes the weather wind and walkers', () => {
    const g = new ElephantGrass(EG, false);
    const at = (): Patch => 'grass';
    expect(g.lay(0, 0, 60, 2, 0, at, () => true)).toBe(true);
    expect(g.planted).toBeGreaterThan(0);
    expect(g.lay(3, 0, 60, 2, 0, at, () => true)).toBe(false);
    expect(g.lay(40, 0, 60, 2, 0, at, () => true)).toBe(true);
    g.frame(10, 1, 0, 0, 60, [1, 2, 3, 4]);
    expect(g.uniforms.uEgPushN.value).toBe(2);
    expect(g.uniforms.uEgWind.value).toBeGreaterThan(EG.wind.strength);
    expect(g.mesh.userData.seeThrough).toBe(true);
  });
});

describe('see-through cover (PK 1.8.0)', () => {
  const C = data.diorama.seeThrough;

  it('opens only when zoomed in close', () => {
    expect(seeAmount(C.zoom[0] - 5, C.zoom, C.amount)).toBe(C.amount);
    expect(seeAmount(C.zoom[1] + 5, C.zoom, C.amount)).toBe(0);
    const mid = seeAmount((C.zoom[0] + C.zoom[1]) / 2, C.zoom, C.amount);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(C.amount);
    // The RTS zoom runs 28–150 m: the close end of it opens the cover.
    expect(C.zoom[0]).toBeGreaterThan(28);
  });

  it('projects people to windows on screen (centre, depth, size); behind the camera: none', () => {
    const cam = new THREE.PerspectiveCamera(18, 16 / 9, 1, 2000);
    cam.position.set(0, 50, 50);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const U = seeUniforms();
    const n = setTargets(U, cam, [0, 1, 0, 0, 1, 500, 2, 1, 0], C.radius, 0.8);
    expect(n).toBe(2); // the one at z = 500 is behind the camera
    const w = U.uSee.value[0]!;
    expect(Math.abs(w.x)).toBeLessThan(0.05);
    expect(Math.abs(w.y)).toBeLessThan(0.2);
    expect(w.z).toBeCloseTo(Math.hypot(50, 49), 0);
    expect(w.w).toBeGreaterThan(0);
    expect(U.uSeeAmount.value).toBe(0.8);
    expect(setTargets(U, cam, [0, 1, 0], C.radius, 0)).toBe(0);
    expect(U.uSee.value.length).toBe(MAX_SEE);
  });

  it('patches a cover material once, keeps its own patch, never shares a program with its twin', () => {
    const m = new THREE.MeshStandardMaterial();
    let own = 0;
    m.onBeforeCompile = () => {
      own++;
    };
    m.customProgramCacheKey = () => 'crowd';
    const U = seeUniforms();
    addSeeThrough(m, U);
    addSeeThrough(m, U);
    const sh = compile(m);
    expect(own).toBe(1);
    expect(sh.fragmentShader.split('uSeeAmount;').length).toBe(2);
    expect(sh.vertexShader).toContain('vSeeClip = gl_Position');
    expect(m.customProgramCacheKey()).toBe('crowd|see');
    // Only cover in front of a person is cut, in a dither (an opaque draw).
    expect(SEE_FRAGMENT).toContain('s.z - 0.8');
    expect(SEE_FRAGMENT).toContain('discard');
  });
});

describe('torches at night (PK 1.8.0)', () => {
  const T = N.torches;

  it('one by every house door, a ring round each work place', () => {
    const spots = torchSpots(
      [
        { type: 'house', cx: 0, cz: 0, w: 4, d: 4, facing: Math.PI / 2 },
        { type: 'storehouse', cx: 20, cz: 0, w: 6, d: 6, facing: 0 },
        { type: 'riceField', cx: 40, cz: 0, w: 10, d: 10, facing: 0 },
      ],
      T,
    );
    expect(spots.length / 2).toBe(1 + (T.work.storehouse ?? 0));
    // The house faces east: its torch stands east of it, by the door.
    expect(spots[0]).toBeGreaterThan(2);
    // The storehouse torches stand outside its walls.
    for (let i = 2; i < spots.length; i += 2) expect(Math.abs(spots[i]! - 20)).toBeGreaterThan(3);
    for (const [k, n] of Object.entries(T.work)) {
      expect(data.buildings[k]).toBeDefined();
      expect(n).toBeGreaterThan(0);
    }
    for (const h of T.houses) expect(data.buildings[h]).toBeDefined();
  });

  it('flames flicker, never in step; out by day, lit at night, the nearest give real light', () => {
    expect(flicker(1, 0)).not.toBeCloseTo(flicker(2, 0), 3);
    expect(flicker(1, 0)).not.toBeCloseTo(flicker(1, 0.3), 3);
    const tv = new TorchView(T, 2, new THREE.MeshStandardMaterial());
    tv.setSpots([0, 0, 5, 0, 400, 0]);
    const q = new THREE.Quaternion();
    tv.update(0, 1, q, 0, 0, 50, [], []);
    expect(tv.lit).toBe(0);
    expect(tv.lights.every((L) => L.intensity === 0)).toBe(true);
    tv.update(1, 1, q, 0, 0, 50, [10, 10], [2, 2, 2]);
    expect(tv.lit).toBe(4); // two posts near, one planted, one carried; the far one is not drawn
    expect(tv.lights.every((L) => L.intensity > 0)).toBe(true);
    const tex = falloffTexture(16);
    const d = tex.image.data as Uint8Array;
    expect(d[(8 * 16 + 8) * 4]).toBeGreaterThan(d[0]!);
  });

  it('people walking at night hold the torch up (a shader action of its own)', () => {
    expect(ACT.torch).toBe(19);
    expect(ACT.swim).toBe(18);
    expect(LIMB_VERTEX).toContain('act < 18.5');
    expect(T.carry).toBe(true);
  });
});

describe('the stars and the moon (PK 1.8.0)', () => {
  it('hundreds of stars, all above the horizon', () => {
    expect(N.heavens.stars).toBeGreaterThanOrEqual(300);
    const s = starField(N.heavens.stars);
    for (let i = 0; i < s.length; i += 3) {
      expect(s[i + 1]!).toBeGreaterThan(0);
      expect(Math.hypot(s[i]!, s[i + 1]!, s[i + 2]!)).toBeCloseTo(1, 4);
    }
  });

  it('the moon goes from new to full and back over cycleDays days', () => {
    const day = N.daySec;
    const C = N.heavens.cycleDays;
    expect(moonPhase(0, N)).toBe(0);
    expect(moonPhase((C / 2) * day, N)).toBeCloseTo(0.5);
    expect(moonLit(0)).toBeCloseTo(0);
    expect(moonLit(0.5)).toBeCloseTo(1);
    expect(moonLit(0.25)).toBeCloseTo(0.5);
  });

  it('a full moon is up all night; a new moon is not up at night', () => {
    const day = N.daySec;
    const C = N.heavens.cycleDays;
    // Deep night of the day before full moon (phase near 0.5) and of the day before new moon.
    for (const p of [0.68, 0.75, 0.82, 0.88]) {
      const full = (C / 2 - 1 + p) * day;
      expect(Math.abs(moonPhase(full, N) - 0.5)).toBeLessThan(0.13);
      expect(moonDir(full, N).up).toBe(true);
      const dark = (C - 1 + p) * day;
      expect(moonLit(moonPhase(dark, N))).toBeLessThan(0.15);
      expect(moonDir(dark, N).up).toBe(false);
    }
  });

  it('it rises in the east and sets in the west', () => {
    // Follow one night near full moon: x goes from + (east) to - (west), up through the sky.
    const day = N.daySec;
    const C = N.heavens.cycleDays;
    const xs: number[] = [];
    for (let p = 0.6; p <= 0.95; p += 0.05) {
      const { dir, up } = moonDir((C / 2 - 1 + p) * day, N);
      if (up) xs.push(dir.x);
    }
    expect(xs.length).toBeGreaterThan(3);
    expect(xs[0]!).toBeGreaterThan(xs[xs.length - 1]!);
  });

  it('the sky shows only at night, follows the camera, and the moonlight follows the phase', () => {
    const sky = new NightSky(N);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(10, 20, 30);
    sky.update(0, 0, 0, cam);
    expect(sky.group.visible).toBe(false);
    sky.update((N.heavens.cycleDays / 2 - 1 + 0.75) * N.daySec, 0, 1, cam);
    expect(sky.group.visible).toBe(true);
    expect(sky.group.position.toArray()).toEqual([10, 20, 30]);
    expect(sky.moonlight).toBeGreaterThan(0.8);
  });
});
