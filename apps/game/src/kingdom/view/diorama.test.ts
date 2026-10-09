import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { NprUnits, bandOf, outlineMaterial, pxScale, toonCrowdMaterial, toonRamp } from './npr';
import { blockAo, lateriteAt, splatTerrain } from './terrain';
import { makePrekWater, skyStep } from './water';
import { GroundDetailRts, layDetail, type Patch } from './detail';
import { FallenTrees, boatGeometry, fallAngle, paddleGeometry, paddleMatrix } from './actions';
import { lensStretch } from './scene';
import { GRADE_SHADER, NO_GFX, postChain } from './gfx';
import { ACT, LIMB_VERTEX, paddleSwing } from '../../engine/figures';

const data = loadKingdom();
const D = data.diorama;

/** Run a material's onBeforeCompile on stand-in shader text with the chunks it patches. */
function compile(m: THREE.Material) {
  const sh = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n#include <color_vertex>\n}',
    fragmentShader:
      '#include <common>\n#include <gradientmap_pars_fragment>\nvoid main(){\n#include <color_fragment>\n#include <opaque_fragment>\n}',
  };
  m.onBeforeCompile(sh as never, undefined as never);
  return sh;
}

describe('Angkor Cel-Diorama config (PK 1.7.0)', () => {
  it('loads with every knob, and the PC presets switch it on (not lite, not the phone)', async () => {
    expect(D.camera.fov).toBeLessThan(32);
    expect(D.units.ramp.length).toBeGreaterThanOrEqual(2);
    const q = (await import('../../../../../config/quality.json')).default as unknown as Record<
      string,
      { kingdom: { diorama?: boolean } }
    >;
    for (const p of ['low', 'high', 'ultra']) expect(q[p]!.kingdom.diorama).toBe(true);
    for (const p of ['lite', 'mobile']) expect(q[p]!.kingdom.diorama).toBe(false);
  });
});

describe('NPR units: toon LUT, inverted-hull outline, rim', () => {
  it('steps the light into flat bands, the dark band tinted cool', () => {
    const t = toonRamp(D.units);
    const px = t.image.data as Uint8Array;
    const at = (x: number) => Array.from(px.slice(Math.floor(x * 63) * 4, Math.floor(x * 63) * 4 + 3));
    // Flat inside a band, a jump between bands.
    expect(at(0.05)).toEqual(at(0.3));
    expect(at(0.9)[0]!).toBeGreaterThan(at(0.1)[0]! + 60);
    // Cool shadows: more blue than red in the darkest band.
    expect(at(0.05)[2]!).toBeGreaterThan(at(0.05)[0]!);
    expect(t.magFilter).toBe(THREE.NearestFilter);
    expect(bandOf(D.units, 0.1)).toBe(0);
    expect(bandOf(D.units, 0.99)).toBe(D.units.ramp.length - 1);
  });

  it('keeps the limb motion in both the toon pass and the outline, which is screen-constant', () => {
    const u = { uTime: { value: 3 } };
    const toon = compile(toonCrowdMaterial(u, toonRamp(D.units), D.units));
    expect(toon.vertexShader).toContain(LIMB_VERTEX.trim().slice(0, 40));
    expect(toon.fragmentShader).toContain('texture2D( gradientMap, coord ).rgb');
    expect(toon.uniforms.uTime).toBe(u.uTime);
    const px = { value: 0.002 };
    const ink = outlineMaterial(u, D.units, px);
    expect(ink.side).toBe(THREE.BackSide);
    const o = compile(ink);
    expect(o.vertexShader).toMatch(/transformed \+= normalize\(normal\) \* uOutlinePx \* uPxScale/);
    // The extrusion comes before the limbs swing, so the hull bends with the body.
    expect(o.vertexShader.indexOf('uOutlinePx * uPxScale')).toBeLessThan(o.vertexShader.indexOf('float ph = uTime'));
    const cam = new THREE.PerspectiveCamera(18, 16 / 9, 1, 100);
    expect(pxScale(cam, 1080)).toBeCloseTo((2 * Math.tan(THREE.MathUtils.degToRad(9))) / 1080, 8);
  });

  it('turns a figure mesh into toon + an outline that follows its count, once', () => {
    const scene = new THREE.Scene();
    const base = new THREE.MeshStandardMaterial();
    base.userData.uniforms = { uTime: { value: 0 } };
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), base, 8);
    mesh.count = 5;
    scene.add(mesh);
    const npr = new NprUnits(D.units);
    const hull = npr.apply(mesh, scene)!;
    expect(mesh.material).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(hull.instanceMatrix).toBe(mesh.instanceMatrix);
    expect(npr.apply(mesh, scene)).toBeNull();
    mesh.count = 3;
    npr.update(new THREE.PerspectiveCamera(18, 1.7, 1, 100), 1080);
    expect(hull.count).toBe(3);
    // The figures go: so does the ink.
    scene.remove(mesh);
    npr.update(new THREE.PerspectiveCamera(18, 1.7, 1, 100), 1080);
    expect(npr.outlines).toBe(0);
    expect(hull.parent).toBeNull();
  });
});

describe('HD-2D camera and post', () => {
  it('stands further back with the long lens so the framing is the same', () => {
    const k = lensStretch(32, D.camera.fov);
    const half = (fov: number, d: number) => Math.tan(THREE.MathUtils.degToRad(fov) / 2) * d;
    expect(half(D.camera.fov, 100 * k)).toBeCloseTo(half(32, 100), 6);
  });

  it('drops the noisy screen-space AO and always grades (tilt-shift + warm/cool split)', () => {
    const g = { ...NO_GFX, ao: true, diorama: true };
    expect(postChain(g)).not.toContain('ao');
    expect(postChain(g)).toContain('grade');
    expect(postChain({ ...NO_GFX, ao: true })).toContain('ao');
    expect(GRADE_SHADER.fragmentShader).toContain('uDiorama > 0.5');
  });
});

describe('Terrain splat and block AO', () => {
  it('puts laterite on slopes, none on the flat', () => {
    expect(lateriteAt(0, D.terrain)).toBe(0);
    expect(lateriteAt(0.6, D.terrain)).toBe(1);
    const mid = lateriteAt((D.terrain.slopeFrom + D.terrain.slopeTo) / 2, D.terrain);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });

  it('shades hollows in hard steps and leaves open ground and hilltops bright', () => {
    const n = 9;
    const h = new Float32Array(n * n);
    // A pit in the middle of flat ground, and a ridge on one side.
    h[4 * n + 4] = -1.2;
    for (let z = 0; z < n; z++) h[z * n + 8] = 3;
    const ao = blockAo(h, n, 3);
    expect(ao[4 * n + 4]).toBeGreaterThan(0);
    expect(ao[1 * n + 1]).toBe(0);
    expect(ao[4 * n + 8]).toBe(0); // on the ridge
    expect(ao[4 * n + 7]).toBeGreaterThan(0); // at its foot
    for (const v of ao) expect((v * 3) % 1).toBeCloseTo(0, 5); // only whole steps
  });

  it('patches the ground material with the splat (keeping its own patch)', () => {
    const m = new THREE.MeshStandardMaterial();
    let before = 0;
    m.onBeforeCompile = () => {
      before++;
    };
    splatTerrain(m, D.terrain);
    const sh = compile(m);
    expect(before).toBe(1);
    expect(sh.vertexShader).toContain('attribute float aoBlock');
    expect(sh.fragmentShader).toContain('uLaterite');
  });
});

describe('Prek canal water', () => {
  it('fakes the sky by Fresnel in stepped time-of-day colours, no reflection camera', () => {
    expect(skyStep(D.water, 0)).toBe(D.water.skyNoon);
    expect(skyStep(D.water, 0.5)).toBe(D.water.skyDusk);
    expect(skyStep(D.water, 0.5, true)).toBe(D.water.skyDawn);
    expect(skyStep(D.water, 1)).toBe(D.water.skyNight);
    const h = new THREE.DataTexture(new Float32Array(4), 2, 2, THREE.RedFormat, THREE.FloatType);
    const w = makePrekWater(h, 100, -0.1, new THREE.Vector3(0, 1, 0), D.water);
    const f = (w.mesh.material as THREE.ShaderMaterial).fragmentShader;
    expect(f).toContain('pow(1.0 - max(dot(n, v), 0.0), uFresnel)');
    expect(f).toMatch(/smoothstep\(uSpec\.x - uSpec\.y, uSpec\.x \+ uSpec\.y, sp\)/); // 2-step glint
    expect(f).toContain('step(depth, uFoamDepth)'); // crisp foam line
    w.setSky('#3a3f7a');
    expect(((w.mesh.material as THREE.ShaderMaterial).uniforms.uSky!.value as THREE.Color).getHexString()).toBe('3a3f7a');
  });
});

describe('Ground detail', () => {
  const at = (tx: number, tz: number): Patch => (tz < 0 ? 'water' : tz === 0 ? 'bank' : tx < 0 ? 'forest' : 'grass');

  it('lays grass, flowers and pebbles on land and lotus on the water, the same every time', () => {
    const a = layDetail(0, 0, 60, 2, 0, at, D.detail);
    const b = layDetail(0, 0, 60, 2, 0, at, D.detail);
    expect(a).toEqual(b);
    const kinds = new Set(a.map((p) => p.kind));
    for (const k of ['clump', 'lotus', 'pebble'] as const) expect(kinds.has(k)).toBe(true);
    for (const p of a) if (p.kind === 'lotus') expect(p.z).toBeLessThan(2);
    // No tufts on the open meadow: undergrowth in the forest (x < 0) and reeds at the bank only.
    for (const p of a) if (p.kind === 'clump') expect(p.x < 2 || p.z < 2).toBe(true);
    const soil = layDetail(0, 0, 60, 2, 0, () => 'soil', D.detail);
    // Worn earth: pebbles kicked up, and now and then a laterite rock (PK 1.8.0).
    expect(soil.every((p) => p.kind === 'pebble' || p.kind === 'rock')).toBe(true);
  });

  it('keeps within the caps, nearest first, and nothing on built ground', () => {
    const caps = { tufts: 10, flowers: 2, pebbles: 3, lotus: 1, rocks: 2, fronds: 2, roots: 2 };
    const a = layDetail(0, 0, 200, 2, 0, at, caps);
    expect(a.filter((p) => p.kind === 'clump').length).toBeLessThanOrEqual(10);
    expect(layDetail(0, 0, 60, 2, 0, () => 'none', D.detail)).toEqual([]);
    const g = new GroundDetailRts(D.detail);
    g.update(0, 0, 50, 1, 2, 0, at);
    expect(g.laid).toBeGreaterThan(0);
  });
});

describe('Work you can see: boats, paddles, felled trees (PK 1.7.0)', () => {
  it('has chop, fish and row actions in the figures, the paddle in time with the arms', () => {
    expect([ACT.chop, ACT.fish, ACT.row]).toEqual([15, 16, 17]);
    expect(LIMB_VERTEX).toContain('act < 15.5');
    expect(LIMB_VERTEX).toContain('act < 16.5');
    expect(LIMB_VERTEX).toContain('sin(uTime * 1.6)');
    expect(paddleSwing(Math.PI / 3.2)).toBeCloseTo(0.5 * Math.sin(Math.PI / 2));
  });

  it('builds a boat along its heading and a paddle held at the rower’s side', () => {
    const b = boatGeometry();
    b.computeBoundingBox();
    const s = b.boundingBox!.getSize(new THREE.Vector3());
    expect(s.z).toBeGreaterThan(3);
    expect(s.x).toBeLessThan(1);
    expect(b.getAttribute('color')).toBeDefined();
    paddleGeometry().computeBoundingBox();
    const m = paddleMatrix(new THREE.Matrix4(), 10, 0, 5, 0, 0);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.x).toBeCloseTo(10.34, 2);
    expect(p.y).toBeGreaterThan(0.9);
  });

  it('brings a tree down with the last cut, lets it lie, and leaves a stump', () => {
    expect(fallAngle(0)).toBe(0);
    expect(fallAngle(0.7)).toBeLessThan(Math.PI / 4);
    expect(fallAngle(2)).toBeCloseTo(Math.PI / 2);
    const f = new FallenTrees(new THREE.ConeGeometry(1, 5), new THREE.MeshBasicMaterial(), 2, 10);
    f.fell(3, 4, 0, 0);
    f.update(1);
    expect(f.falling).toBe(1);
    f.update(20);
    expect(f.falling).toBe(0);
  });
});

describe('The ground follows life (wear map, PK 1.7.0)', () => {
  it('keeps yards bare round buildings (not fields), wears paths under feet, grows back', async () => {
    const { WearMap } = await import('./wear');
    const G = { ...D.ground, yardTiles: 2, walkWear: 0.1, regrow: 0.05 };
    const w = new WearMap(40, G);
    w.setBuildings([
      { type: 'house', tx: 10, tz: 10, w: 2, d: 2, team: 0 },
      { type: 'riceField', tx: 30, tz: 30, w: 4, d: 3, team: 0 },
    ]);
    expect(w.at(10, 10)).toBe(1);
    expect(w.at(8, 10)).toBeGreaterThan(0); // the yard's ragged edge
    expect(w.at(31, 31)).toBe(0); // fields keep their own look
    expect(w.at(20, 20)).toBe(0);
    for (let i = 0; i < 10; i++) w.step([{ tx: 20, tz: 20, working: false }], 1);
    expect(w.at(20, 20)).toBeGreaterThan(0.9); // (the grass began to grow back at 10 s)
    expect(w.at(21, 20)).toBeGreaterThan(0.25); // the path is a band
    expect(w.upload()).toBe(true);
    expect((w.texture.image.data as Uint8Array)[20 * 40 + 20]).toBeGreaterThan(230);
    // Nobody comes any more: the grass grows back.
    for (let i = 0; i < 30; i++) w.step([], 10);
    expect(w.at(20, 20)).toBeLessThan(0.1);
    expect(w.at(10, 10)).toBe(1); // the house still stands
  });
});
