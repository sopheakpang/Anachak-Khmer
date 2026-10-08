/**
 * Elephant grass (PK 1.8.0): dense stands of tall tropical grass, 2–3 m high, that roll in the
 * wind. The three.js port of PK's Godot spatial shader (docs/TECH_ARCHITECTURE.md):
 *
 * - one instanced draw call (plus one in the shadow pass when the preset casts grass shadows);
 * - all motion is vertex displacement on the GPU: one noise-texture fetch per vertex, sampled
 *   at the clump's origin and scrolled downwind, makes gust waves roll across the field;
 *   a quadratic bend keeps roots anchored, the tip sinks as it bends (length kept), each clump
 *   sways in its own phase and the leaf tips flutter;
 * - leaves turn pale in a gust (the sheen shows the wave from the RTS camera); dense clumps are
 *   dark near the ground;
 * - people trample it: clumps near a walker lean away from him;
 * - far clumps shrink to their root (zero-area triangles), and only the land near the view
 *   is planted, on a fixed world grid, re-laid as the view moves.
 *
 * Where it grows: wild open land in broad stands (a low-frequency noise field), thicker along
 * river banks; never on worn earth, roads, fields, near buildings or in unexplored land.
 * Numbers: config/kingdom/diorama.json → elephantGrass.
 */
import * as THREE from 'three';
import type { Diorama } from '@temples/shared';
import { hash, type Patch } from './detail';

export type ElephantGrassCfg = Diorama['elephantGrass'];

/** People the grass bends away from (world x, z), at most this many per frame. */
export const MAX_PUSH = 16;

// ------------------------------------------------------------------ geometry

/**
 * One clump, 1 m tall (instance scale gives the real height): `blades` long tapering leaves
 * arching out from the root in three segments, and two flowering culms with silky plumes.
 * Normals point mostly up, so the clump is lit like a soft mass, not by thin faces.
 */
export function elephantGrassGeometry(blades = 9): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  /** 0 = a leaf, 1 = the flowering culm and its plume (only some clumps flower). */
  const kind: number[] = [];
  let k1 = 0;
  const root = new THREE.Color(0x203a16);
  const tip = new THREE.Color(0x6e9a3a);
  const plume = new THREE.Color(0xeee6c8);
  const stem = new THREE.Color(0x7f9a4a);
  const c = new THREE.Color();
  const tri = (a: number[], b: number[], d: number[], ca: THREE.Color, cb: THREE.Color, cd: THREE.Color) => {
    pos.push(...a, ...b, ...d);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cd.r, cd.g, cd.b);
    kind.push(k1, k1, k1);
  };
  const SEG = 3;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 2.39996;
    const h = 0.72 + 0.28 * hash(i, 3, 1);
    const lean = 0.25 + 0.45 * hash(i, 5, 2);
    const w = 0.07 + 0.04 * hash(i, 7, 3);
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    // Across the blade (horizontal, perpendicular to its lean).
    const sx = -oz;
    const sz = ox;
    const row = (t: number): { l: number[]; r: number[]; col: THREE.Color } => {
      const out = 0.05 + lean * t * t; // arches outward
      const y = h * t * (1 - 0.12 * t * t * lean); // droops a little at the tip
      const half = w * Math.pow(1 - t, 0.7) + 0.002;
      const cx = ox * out;
      const cz = oz * out;
      return {
        l: [cx - sx * half, y, cz - sz * half],
        r: [cx + sx * half, y, cz + sz * half],
        col: c.copy(root).lerp(tip, t).clone(),
      };
    };
    for (let s = 0; s < SEG; s++) {
      const p = row(s / SEG);
      const q = row((s + 1) / SEG);
      tri(p.l, p.r, q.r, p.col, p.col, q.col);
      tri(p.l, q.r, q.l, p.col, q.col, q.col);
    }
  }
  // Two culms with a silky plume (the tall grasses of the Tonle Sap plains flower white).
  k1 = 1;
  for (let k = 0; k < 2; k++) {
    const a = k * 2.6 + 0.7;
    const bx = Math.cos(a) * 0.06;
    const bz = Math.sin(a) * 0.06;
    const tx = bx + Math.cos(a) * 0.12;
    const tz = bz + Math.sin(a) * 0.12;
    const top = 1.08 - k * 0.08;
    const w = 0.012;
    tri([bx - w, 0, bz], [bx + w, 0, bz], [tx, top, tz], stem, stem, stem);
    tri([bx, 0, bz - w], [bx, 0, bz + w], [tx, top, tz], stem, stem, stem);
    // The plume: a narrow spindle above the culm, four faces.
    const ph = 0.24;
    const pw = 0.035;
    const mid = top + ph * 0.45;
    const end: number[] = [tx + Math.cos(a) * 0.05, top + ph, tz + Math.sin(a) * 0.05];
    const base: number[] = [tx, top - 0.02, tz];
    const ring: number[][] = [
      [tx + pw, mid, tz],
      [tx, mid, tz + pw],
      [tx - pw, mid, tz],
      [tx, mid, tz - pw],
    ];
    for (let j = 0; j < 4; j++) {
      const r0 = ring[j]!;
      const r1 = ring[(j + 1) % 4]!;
      tri(base, r0, r1, stem, plume, plume);
      tri(r0, end, r1, plume, plume, plume);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    // Mostly up, a little outward: soft, full-looking light on the mass of leaves.
    const x = pos[i]!;
    const z = pos[i + 2]!;
    const l = Math.hypot(x, z) || 1;
    const n = new THREE.Vector3((x / l) * 0.35, 1, (z / l) * 0.35).normalize();
    nor[i] = n.x;
    nor[i + 1] = n.y;
    nor[i + 2] = n.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ noise texture

/**
 * The wind noise texture: `size`² tileable value noise (3 octaves), one byte per texel.
 * Seeded, so the gusts are the same every run.
 */
export function windNoiseTexture(size = 128, seed = 7): THREE.DataTexture {
  const data = new Uint8Array(size * size);
  const lattice = (x: number, y: number, period: number) => hash(((x % period) + period) % period, ((y % period) + period) % period, seed);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amp = 0.55;
      let total = 0;
      for (const cells of [4, 8, 16]) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const ux = smooth(fx - ix);
        const uy = smooth(fy - iy);
        const a = lattice(ix, iy, cells);
        const b = lattice(ix + 1, iy, cells);
        const c = lattice(ix, iy + 1, cells);
        const d = lattice(ix + 1, iy + 1, cells);
        v += amp * (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy);
        total += amp;
        amp *= 0.5;
      }
      data[y * size + x] = Math.round((v / total) * 255);
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ shader

export interface ElephantGrassUniforms {
  [k: string]: THREE.IUniform;
  uEgTime: THREE.IUniform<number>;
  uEgNoise: THREE.IUniform<THREE.Texture>;
  uEgDir: THREE.IUniform<THREE.Vector2>;
  uEgWind: THREE.IUniform<number>;
  uEgSpeed: THREE.IUniform<number>;
  uEgScale: THREE.IUniform<number>;
  uEgSharp: THREE.IUniform<number>;
  uEgBase: THREE.IUniform<number>;
  uEgGust: THREE.IUniform<number>;
  uEgSway: THREE.IUniform<number>;
  uEgSwaySpeed: THREE.IUniform<number>;
  uEgFlutter: THREE.IUniform<number>;
  uEgFlutterSpeed: THREE.IUniform<number>;
  uEgCenter: THREE.IUniform<THREE.Vector2>;
  uEgLod: THREE.IUniform<THREE.Vector2>;
  uEgPush: THREE.IUniform<THREE.Vector3[]>;
  uEgPushN: THREE.IUniform<number>;
  uEgFlower: THREE.IUniform<number>;
  uEgSheen: THREE.IUniform<number>;
  uEgBaseDark: THREE.IUniform<number>;
}

/** The wind direction (unit XZ vector) for a compass angle in degrees (0 = +x, 90 = +z). */
export function windDir(deg: number): THREE.Vector2 {
  const a = THREE.MathUtils.degToRad(deg);
  return new THREE.Vector2(Math.cos(a), Math.sin(a));
}

export function elephantGrassUniforms(cfg: ElephantGrassCfg, noise: THREE.Texture): ElephantGrassUniforms {
  const W = cfg.wind;
  return {
    uEgTime: { value: 0 },
    uEgNoise: { value: noise },
    uEgDir: { value: windDir(W.dirDeg) },
    uEgWind: { value: W.strength },
    uEgSpeed: { value: W.speed },
    uEgScale: { value: W.waveScale },
    uEgSharp: { value: W.sharpness },
    uEgBase: { value: W.baseBend },
    uEgGust: { value: W.gustBend },
    uEgSway: { value: W.sway },
    uEgSwaySpeed: { value: W.swaySpeed },
    uEgFlutter: { value: W.flutter },
    uEgFlutterSpeed: { value: W.flutterSpeed },
    uEgCenter: { value: new THREE.Vector2() },
    uEgLod: { value: new THREE.Vector2(100, 140) },
    uEgPush: { value: Array.from({ length: MAX_PUSH }, () => new THREE.Vector3()) },
    uEgPushN: { value: 0 },
    uEgFlower: { value: cfg.flowering },
    uEgSheen: { value: cfg.gustSheen },
    uEgBaseDark: { value: cfg.baseDark },
  };
}

const VERTEX_HEAD = /* glsl */ `
  uniform float uEgTime; uniform sampler2D uEgNoise; uniform vec2 uEgDir; uniform float uEgWind;
  uniform float uEgSpeed; uniform float uEgScale; uniform float uEgSharp; uniform float uEgBase;
  uniform float uEgGust; uniform float uEgSway; uniform float uEgSwaySpeed; uniform float uEgFlutter;
  uniform float uEgFlutterSpeed; uniform vec2 uEgCenter; uniform vec2 uEgLod;
  uniform vec3 uEgPush[${MAX_PUSH}]; uniform int uEgPushN; uniform float uEgFlower;
  attribute float aKind;
  varying float vEgH; varying float vEgGust;
`;

/**
 * The wind (and trample) displacement, in the clump's own frame (the clump is 1 m tall, so
 * `transformed.y` is already its height share). Exported for the tests.
 */
export const ELEPHANT_GRASS_VERTEX = /* glsl */ `
  {
    vec3 eO = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float eH = clamp(transformed.y, 0.0, 1.0);
    float eRnd = fract(sin(dot(eO.xz, vec2(127.1, 311.7))) * 43758.5453);
    float ePh = uEgTime + eRnd * 6.2831;
    // Only some clumps flower: the others fold their culm away to nothing.
    if (aKind > 0.5 && fract(eRnd * 7.31) > uEgFlower) transformed = vec3(0.0);
    // Rolling gust waves: one fetch per vertex at the clump origin, scrolling downwind.
    vec2 eUv = (eO.xz - uEgDir * uEgTime * uEgSpeed) * uEgScale;
    float eG = smoothstep(uEgSharp, 1.0 - uEgSharp, texture2D(uEgNoise, eUv).r);
    vEgGust = eG;
    vEgH = eH;
    // World wind direction into the clump's frame (it is turned about y and scaled evenly).
    vec3 eW = vec3(uEgDir.x, 0.0, uEgDir.y);
    vec3 eWl = normalize(vec3(dot(instanceMatrix[0].xyz, eW), 0.0, dot(instanceMatrix[2].xyz, eW)) + vec3(1e-5, 0.0, 0.0));
    vec3 eSide = vec3(-eWl.z, 0.0, eWl.x);
    float eBend = clamp(uEgWind * (uEgBase + eG * uEgGust + sin(ePh * uEgSwaySpeed) * uEgSway), -0.2, 0.95);
    float eOff = eBend * eH * eH;
    float eFl = sin(ePh * uEgFlutterSpeed + transformed.y * 3.0 + transformed.x * 5.0) * uEgFlutter * eH * (0.4 + eG) * uEgWind;
    vec3 eDisp = eWl * eOff + eSide * eFl;
    // Trampled: the clump leans away from the nearest walker.
    float eFlat = 0.0;
    vec3 eAway = vec3(0.0);
    for (int i = 0; i < ${MAX_PUSH}; i++) {
      if (i >= uEgPushN) break;
      vec2 d = eO.xz - uEgPush[i].xy;
      float l = length(d);
      float k = 1.0 - smoothstep(uEgPush[i].z * 0.45, uEgPush[i].z, l);
      if (k > eFlat) {
        eFlat = k;
        vec3 dw = vec3(d.x, 0.0, d.y) / max(l, 0.01);
        eAway = normalize(vec3(dot(instanceMatrix[0].xyz, dw), 0.0, dot(instanceMatrix[2].xyz, dw)) + vec3(1e-5, 0.0, 0.0));
      }
    }
    eDisp = mix(eDisp, eAway * 0.85 * eH * eH, eFlat);
    transformed += eDisp;
    float eL = length(eDisp.xz);
    transformed.y -= eL * eL * 0.5;                       // the tip sinks as it bends over
    // Distance LOD: far clumps shrink to their root.
    transformed *= 1.0 - smoothstep(uEgLod.x, uEgLod.y, distance(eO.xz, uEgCenter));
  }
`;

const FRAGMENT_HEAD = /* glsl */ `
  uniform float uEgSheen; uniform float uEgBaseDark;
  varying float vEgH; varying float vEgGust;
`;

/**
 * Both faces of every blade take the sky's normal (straight up, in view space): the clump is
 * lit as one soft mass, with no black backs on thin leaves (and it works with flat shading).
 */
const FRAGMENT_NORMAL = /* glsl */ `
  normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
`;

const FRAGMENT_COLOUR = /* glsl */ `
  diffuseColor.rgb *= mix(1.0 - uEgBaseDark, 1.0, vEgH);  // dark inside the dense clump
  diffuseColor.rgb += uEgSheen * vEgGust * vEgH;          // pale leaves roll with the gust
`;

function patch(sh: THREE.WebGLProgramParametersWithUniforms, U: ElephantGrassUniforms, colour: boolean): void {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${ELEPHANT_GRASS_VERTEX}`);
  if (colour)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOUR}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${FRAGMENT_NORMAL}`);
  else sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`);
}

/** The grass material (Lambert: cheap, soft) and its shadow-pass twin with the same wind. */
export function elephantGrassMaterials(U: ElephantGrassUniforms): {
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
} {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (sh) => patch(sh, U, true);
  material.customProgramCacheKey = () => 'elephant-grass';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => patch(sh, U, false);
  depth.customProgramCacheKey = () => 'elephant-grass-depth';
  return { material, depth };
}

// ------------------------------------------------------------------ placement

/** One clump to plant: where, how tall (m), which way, and how dry (0 green … 1 straw). */
export interface Clump {
  x: number;
  z: number;
  s: number;
  rot: number;
  dry: number;
}

/** Smooth value noise of the tile grid, 0..1, in cells of `cell` tiles (the stands). */
export function standNoise(tx: number, tz: number, cell: number): number {
  const fx = tx / cell;
  const fz = tz / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const sm = (t: number) => t * t * (3 - 2 * t);
  const ux = sm(fx - ix);
  const uz = sm(fz - iz);
  const v = (x: number, z: number) => hash(x, z, 91);
  const a = v(ix, iz);
  const b = v(ix + 1, iz);
  const c = v(ix, iz + 1);
  const d = v(ix + 1, iz + 1);
  const big = a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  // A finer octave breaks the stand edges up.
  const small = hash(Math.floor(tx / 2), Math.floor(tz / 2), 92);
  return big * 0.85 + small * 0.15;
}

/**
 * Where elephant grass grows round (cx, cz) within `radius` m: on wild `grass` tiles inside
 * the stands (`cover` share of open land), thicker along `bank` tiles, nowhere `clear(tx, tz)`
 * forbids (near buildings). Nearest tiles first, at most `cfg.count` clumps.
 */
export function layElephantGrass(
  cx: number,
  cz: number,
  radius: number,
  tile: number,
  half: number,
  at: (tx: number, tz: number) => Patch,
  clear: (tx: number, tz: number) => boolean,
  cfg: Pick<ElephantGrassCfg, 'count' | 'standTiles' | 'cover' | 'perTile' | 'bank' | 'height' | 'dryShare'>,
): Clump[] {
  const out: Clump[] = [];
  const t0x = Math.floor((cx - radius + half) / tile);
  const t1x = Math.ceil((cx + radius + half) / tile);
  const t0z = Math.floor((cz - radius + half) / tile);
  const t1z = Math.ceil((cz + radius + half) / tile);
  const tiles: Array<[number, number, number]> = [];
  for (let tz = t0z; tz <= t1z; tz++)
    for (let tx = t0x; tx <= t1x; tx++) {
      const d = Math.hypot((tx + 0.5) * tile - half - cx, (tz + 0.5) * tile - half - cz);
      if (d <= radius) tiles.push([d, tx, tz]);
    }
  tiles.sort((a, b) => a[0] - b[0]);
  const [h0, h1] = cfg.height;
  for (const [, tx, tz] of tiles) {
    if (out.length >= cfg.count) break;
    const what = at(tx, tz);
    if (what !== 'grass' && what !== 'bank') continue;
    const r = (k: number) => hash(tx, tz, 200 + k);
    let n: number;
    if (what === 'bank') n = r(0) < cfg.bank ? 1 : 0;
    else {
      const v = standNoise(tx, tz, cfg.standTiles);
      const edge = 1 - cfg.cover;
      if (v < edge) continue;
      // Thin at the stand's edge, full inside.
      const k = Math.min(1, (v - edge) / 0.08);
      n = Math.floor(cfg.perTile * k + r(1));
    }
    if (!n || !clear(tx, tz)) continue;
    const x0 = tx * tile - half;
    const z0 = tz * tile - half;
    for (let i = 0; i < n && out.length < cfg.count; i++)
      out.push({
        x: x0 + r(10 + i) * tile,
        z: z0 + r(20 + i) * tile,
        s: h0 + (h1 - h0) * r(30 + i),
        rot: r(40 + i) * Math.PI * 2,
        dry: r(50 + i) < cfg.dryShare ? 0.5 + 0.5 * r(60 + i) : 0.15 * r(60 + i),
      });
  }
  return out;
}

// ------------------------------------------------------------------ the field

/** The elephant grass in one scene, re-laid as the view moves; wind and trample per frame. */
export class ElephantGrass {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms: ElephantGrassUniforms;
  /** How many clumps are planted now (for the tests). */
  planted = 0;
  private at: [number, number, number] = [NaN, NaN, 0];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly green = new THREE.Color(1, 1, 1);
  private readonly dry: THREE.Color;
  private readonly c = new THREE.Color();

  constructor(
    readonly cfg: ElephantGrassCfg,
    shadows: boolean,
  ) {
    this.uniforms = elephantGrassUniforms(cfg, windNoiseTexture());
    const { material, depth } = elephantGrassMaterials(this.uniforms);
    this.mesh = new THREE.InstancedMesh(elephantGrassGeometry(cfg.blades), material, Math.max(1, cfg.count));
    this.mesh.customDepthMaterial = depth;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = true;
    this.mesh.userData.seeThrough = true;
    this.group.add(this.mesh);
    // Dry clumps: the green leaves wash toward straw (instance colour multiplies the vertex colour).
    this.dry = new THREE.Color(cfg.dry).multiplyScalar(1.6);
  }

  /**
   * Per frame: time, wind (0..1 from the weather), the view (centre and how far the camera
   * stands), and up to MAX_PUSH walkers [x, z] the grass bends away from.
   */
  frame(t: number, wind: number, cx: number, cz: number, radius: number, walkers: ArrayLike<number>): void {
    const U = this.uniforms;
    U.uEgTime.value = t;
    U.uEgWind.value = this.cfg.wind.strength * (0.55 + 0.9 * wind);
    U.uEgCenter.value.set(cx, cz);
    U.uEgLod.value.set(radius * this.cfg.lod[0], radius * this.cfg.lod[1]);
    const n = Math.min(MAX_PUSH, Math.floor(walkers.length / 2));
    for (let i = 0; i < n; i++) U.uEgPush.value[i]!.set(walkers[i * 2]!, walkers[i * 2 + 1]!, this.cfg.trample);
    U.uEgPushN.value = n;
  }

  /** Plant round the view when it has moved on by a quarter of the radius (or `force`). */
  lay(
    cx: number,
    cz: number,
    radius: number,
    tile: number,
    half: number,
    at: (tx: number, tz: number) => Patch,
    clear: (tx: number, tz: number) => boolean,
    force = false,
  ): boolean {
    const [ax, az, ar] = this.at;
    if (!force && Math.hypot(cx - ax, cz - az) < radius * 0.25 && Math.abs(radius - ar) < ar * 0.3) return false;
    this.at = [cx, cz, radius];
    const clumps = layElephantGrass(cx, cz, radius, tile, half, at, clear, this.cfg);
    clumps.forEach((p, i) => {
      this.q.setFromAxisAngle(this.up, p.rot);
      this.m.compose(this.v.set(p.x, 0, p.z), this.q, this.sc.set(p.s, p.s, p.s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.copy(this.green).lerp(this.dry, p.dry));
    });
    this.mesh.count = clumps.length;
    this.planted = clumps.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return true;
  }
}
