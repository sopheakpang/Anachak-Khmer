import * as THREE from 'three';

/**
 * PK 2026-10-21 (D167, "tree that disappeared and appeared, just make it fixed like reality"):
 * trees and plants never pop. Whatever is drawn near or far is decided by its distance from the
 * view's centre on the ground (the hero, or where the RTS camera looks), and every switch — the
 * 3D model giving way to its picture cards, the last plants at the edge of what is drawn — is a
 * soft dithered fade over `band` metres instead of a jump. The near and the far copy of a tree
 * use the same dither pattern, so between them every pixel is drawn exactly once.
 *
 * - `near` side: shown nearer than `uLodS` (± band).
 * - `far` side: shown beyond `uLodS` (± band) and nearer than `uLodOut` (± `uLodOutBand`).
 */
export interface LodEye {
  uLodEye: { value: THREE.Vector2 };
}

export interface LodRange {
  uLodS: { value: number };
  uLodBand: { value: number };
  uLodOut: { value: number };
  uLodOutBand: { value: number };
}

export function lodEye(): LodEye {
  return { uLodEye: { value: new THREE.Vector2() } };
}

/** A switch at `s` m (± `band`), and an outer edge at `out` m (± `outBand`; Infinity = none). */
export function lodRange(s = 1e9, band = 0, out = 1e9, outBand = 0): LodRange {
  return {
    uLodS: { value: s },
    uLodBand: { value: band },
    uLodOut: { value: out },
    uLodOutBand: { value: outBand },
  };
}

/** The dither threshold (exported for the tests): the same number the shader uses, 0..1. */
export function lodNoise(x: number, y: number): number {
  const f = (v: number) => v - Math.floor(v);
  return f(52.9829189 * f(x * 0.06711056 + y * 0.00583715));
}

/** Is a pixel of a thing `d` m away drawn? (the shader's rule, for the tests) */
export function lodShown(side: 'near' | 'far', d: number, r: { s: number; band: number; out: number; outBand: number }, noise: number): boolean {
  const t = r.s + r.band * (noise * 2 - 1);
  if (side === 'near') return d <= t;
  const o = r.out + r.outBand * (noise * 2 - 1);
  return d > t && d <= o;
}

const VERTEX_HEAD = /* glsl */ `uniform vec2 uLodEye; varying float vLodD;`;
const VERTEX_BODY = /* glsl */ `
  #ifdef USE_INSTANCING
    vec4 lodO = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #else
    vec4 lodO = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif
  vLodD = distance(lodO.xz, uLodEye);
`;
const FRAGMENT_HEAD = /* glsl */ `varying float vLodD; uniform float uLodS; uniform float uLodBand; uniform float uLodOut; uniform float uLodOutBand;`;
function fragmentBody(side: 'near' | 'far'): string {
  return /* glsl */ `
  {
    float lodN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float lodT = uLodS + uLodBand * (lodN * 2.0 - 1.0);
    ${
      side === 'near'
        ? 'if (vLodD > lodT) discard;'
        : 'if (vLodD <= lodT || vLodD > uLodOut + uLodOutBand * (lodN * 2.0 - 1.0)) discard;'
    }
  }
`;
}

/**
 * Give a material the distance fade (keeps whatever onBeforeCompile it had: sway, cards,
 * see-through). Safe to call twice. Its program cache key changes with the side.
 */
export function addLodFade(m: THREE.Material, eye: LodEye, range: LodRange, side: 'near' | 'far'): void {
  if (m.userData.lodFade) return;
  m.userData.lodFade = side;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, eye, range);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${fragmentBody(side)}`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|lod-${side}`;
  m.needsUpdate = true;
}

/**
 * Which of `dists` (sorted or not) to hand to the GPU for a fade at `s` ± `band`, allowing the
 * view to move `margin` m before the next refresh: near copies within s + band + margin, far
 * copies beyond s − band − margin. Both inside the overlap: the shader picks per pixel.
 */
export function lodSides(d: number, s: number, band: number, margin: number): { near: boolean; far: boolean } {
  return { near: d < s + band + margin, far: d > s - band - margin };
}
