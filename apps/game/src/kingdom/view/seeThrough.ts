/**
 * See-through cover (PK 1.8.0): zoomed in close, whatever stands between the camera and the
 * people at work — buildings, trees, tall grass, temple walls — opens a window round each of
 * them, so the acting people and animals are always seen.
 *
 * How: each frame up to `targets` people (the selected first, then the nearest the middle of
 * the view) are projected to the screen: centre, depth and window size. Cover materials get a
 * few lines in their fragment shader: a fragment nearer the camera than a person and inside his
 * window is dropped in a screen-door dither (interleaved gradient noise). It stays an opaque
 * draw (no sorting, no extra pass), shadows are untouched, and with no window open the test is
 * skipped. Numbers: config/kingdom/diorama.json → seeThrough.
 */
import * as THREE from 'three';

export const MAX_SEE = 32;

export interface SeeUniforms {
  [k: string]: THREE.IUniform;
  /** Per window: ndc x, ndc y, depth (m from the camera), radius (in ndc y units). */
  uSee: THREE.IUniform<THREE.Vector4[]>;
  uSeeN: THREE.IUniform<number>;
  uSeeAspect: THREE.IUniform<number>;
  uSeeAmount: THREE.IUniform<number>;
}

export function seeUniforms(): SeeUniforms {
  return {
    uSee: { value: Array.from({ length: MAX_SEE }, () => new THREE.Vector4()) },
    uSeeN: { value: 0 },
    uSeeAspect: { value: 16 / 9 },
    uSeeAmount: { value: 0 },
  };
}

const VERTEX_HEAD = /* glsl */ `varying vec4 vSeeClip;`;
const VERTEX_BODY = /* glsl */ `vSeeClip = gl_Position;`;
const FRAGMENT_HEAD = /* glsl */ `
  varying vec4 vSeeClip;
  uniform vec4 uSee[${MAX_SEE}]; uniform int uSeeN; uniform float uSeeAspect; uniform float uSeeAmount;
`;
/** The window test (exported for the tests). The window is 1.6 times as tall as it is wide. */
export const SEE_FRAGMENT = /* glsl */ `
  if (uSeeN > 0) {
    vec2 sNdc = vSeeClip.xy / vSeeClip.w;
    float sDepth = vSeeClip.w;
    float sHole = 0.0;
    for (int i = 0; i < ${MAX_SEE}; i++) {
      if (i >= uSeeN) break;
      vec4 s = uSee[i];
      if (sDepth > s.z - 0.8) continue;                       // only cover in front of him
      vec2 d = sNdc - s.xy;
      d.x *= uSeeAspect;
      d.y /= 1.6;
      sHole = max(sHole, 1.0 - smoothstep(0.5, 1.0, length(d) / s.w));
    }
    float sIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (sIgn < sHole * uSeeAmount) discard;
  }
`;

/**
 * Give a cover material the window test (keeps whatever onBeforeCompile it had). Safe to call
 * twice. Its program cache key changes, so it never shares a program with an unpatched twin.
 */
export function addSeeThrough(m: THREE.Material, U: SeeUniforms): void {
  if (m.userData.seeThrough) return;
  m.userData.seeThrough = true;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${SEE_FRAGMENT}`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|see`;
  m.needsUpdate = true;
}

/** How strongly the cover opens at camera distance `dist` (1 near, 0 far: config zoom). */
export function seeAmount(dist: number, zoom: readonly [number, number], amount: number): number {
  const [near, far] = zoom;
  if (dist >= far) return 0;
  if (dist <= near) return amount;
  return amount * (1 - (dist - near) / (far - near));
}

/**
 * Project the people to keep in view into the uniforms: `points` are their chests in world
 * space (most important first), `radius` the window width in m. Behind the camera or off
 * screen: skipped. Returns how many windows are open.
 */
export function setTargets(
  U: SeeUniforms,
  camera: THREE.PerspectiveCamera,
  points: ArrayLike<number>,
  radius: number,
  amount: number,
  max = MAX_SEE,
): number {
  const v = new THREE.Vector3();
  const P = camera.projectionMatrix.elements[5]!; // cot(fov / 2)
  let n = 0;
  U.uSeeAspect.value = camera.aspect;
  U.uSeeAmount.value = amount;
  if (amount > 0)
    for (let i = 0; i + 2 < points.length && n < Math.min(max, MAX_SEE); i += 3) {
      v.set(points[i]!, points[i + 1]!, points[i + 2]!).applyMatrix4(camera.matrixWorldInverse);
      const depth = -v.z;
      if (depth <= camera.near) continue;
      v.applyMatrix4(camera.projectionMatrix);
      if (Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) continue;
      U.uSee.value[n++]!.set(v.x, v.y, depth, (radius * P) / depth);
    }
  U.uSeeN.value = n;
  return n;
}
