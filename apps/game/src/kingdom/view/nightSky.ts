/**
 * The night sky (PK 1.8.0): hundreds of stars that twinkle, and a moon that keeps time — it
 * rises in the east and sets in the west, later each night, and goes from new to full and
 * back over `moon.cycleDays` game days (a full moon is up all night, a new moon not at all).
 * The moon also lights the night: the scene's sun turns into moonlight from where the moon
 * stands, brighter at full moon. Numbers: config/kingdom/anachak.json → night.sky.
 */
import * as THREE from 'three';
import type { KingdomData } from '@temples/shared';

export type NightCfg = KingdomData['anachak']['night'];
export type SkyCfg = NightCfg['heavens'];

/** Moon phase at game time t: 0 new, 0.5 full, back to 1 (= 0). */
export function moonPhase(t: number, N: Pick<NightCfg, 'daySec'> & { heavens: Pick<SkyCfg, 'cycleDays'> }): number {
  const days = t / N.daySec;
  return (((days / N.heavens.cycleDays) % 1) + 1) % 1;
}

/** How much of the moon's face is lit, 0 (new) .. 1 (full). */
export function moonLit(phase: number): number {
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

/**
 * The sun's day in this game: it sets at the middle of dusk and rises at the middle of dawn.
 * The moon keeps the same path, `phase` of a day behind the sun (so a full moon rises at
 * sunset). Returns the direction to the moon (y up; east = +x) and whether it is up.
 */
export function moonDir(t: number, N: NightCfg, out = new THREE.Vector3()): { dir: THREE.Vector3; up: boolean } {
  const p = (((t / N.daySec) % 1) + 1) % 1;
  const set = (N.dusk[0] + N.dusk[1]) / 2;
  const rise = (N.dawn[0] + N.dawn[1]) / 2 - 1; // the sun rose just before the day started
  const phase = moonPhase(t, N);
  let pm = p - phase;
  pm = ((((pm - rise) % 1) + 1) % 1) + rise; // into [rise, rise + 1)
  const a = (pm - rise) / (set - rise); // 0 rising … 1 setting; above 1 = below the horizon
  const up = a >= 0 && a <= 1;
  const k = Math.min(1, Math.max(0, a));
  const el = Math.sin(Math.PI * k) * THREE.MathUtils.degToRad(N.heavens.moonHigh);
  const az = Math.PI * k; // east (+x) through the south (+z) to the west (-x)
  out.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.6).normalize();
  if (!up) out.y = -Math.abs(out.y) - 0.05;
  return { dir: out, up };
}

/** Star positions on the upper sky: `n` unit vectors, seeded, denser toward the horizon band. */
export function starField(n: number, seed = 11): Float32Array {
  const out = new Float32Array(n * 3);
  let s = seed >>> 0 || 1;
  const r = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const az = r() * Math.PI * 2;
    const y = 0.04 + 0.96 * Math.pow(r(), 0.8); // above the horizon
    const h = Math.sqrt(1 - y * y);
    out.set([Math.cos(az) * h, y, Math.sin(az) * h], i * 3);
  }
  return out;
}

const STAR_VERTEX = /* glsl */ `
  attribute float aSize; attribute float aSeed;
  uniform float uTime; uniform float uNight; uniform float uScale;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.65 + 0.35 * sin(uTime * (1.3 + aSeed * 2.7) + aSeed * 40.0);
    vA = uNight * tw * smoothstep(0.0, 0.12, position.y / 900.0);
    gl_PointSize = aSize * uScale * (0.8 + 0.4 * tw);
  }`;
const STAR_FRAGMENT = /* glsl */ `
  uniform vec3 uColor; varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = vA * (smoothstep(0.5, 0.0, d) + 0.6 * smoothstep(0.12, 0.0, abs(c.x) * abs(c.y) * 40.0) * smoothstep(0.5, 0.2, d));
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }`;

const MOON_FRAGMENT = /* glsl */ `
  uniform float uPhase; uniform float uNight; uniform vec3 uColor; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    // The halo round the disc.
    float halo = smoothstep(1.0, 0.3, r) * 0.25;
    float disc = smoothstep(0.42, 0.40, r);
    // The lit part: the terminator is an ellipse that sweeps across the disc with the phase.
    float x = p.x / 0.41;
    float y = p.y / 0.41;
    float w = sqrt(max(0.0, 1.0 - y * y));
    float term = cos(uPhase * 6.2832) * w;                    // the terminator's x at this height
    float lit = uPhase < 0.5 ? step(term, x) : step(x, -term);
    // Maria (dark seas) for a face, faint.
    float mare = 0.82 + 0.18 * smoothstep(0.1, 0.3, length(p - vec2(-0.12, 0.08))) * smoothstep(0.06, 0.22, length(p - vec2(0.13, -0.1)));
    vec3 c = uColor * (disc * mix(0.05, 1.0, lit) * mare) + uColor * halo * (0.35 + 0.65 * (0.5 - 0.5 * cos(uPhase * 6.2832)));
    float a = max(disc, halo) * uNight;
    if (a < 0.01) discard;
    gl_FragColor = vec4(c * uNight, a);
  }`;

/** Stars and the moon on a dome that follows the camera (shown only by night). */
export class NightSky {
  readonly group = new THREE.Group();
  readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly starU = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uScale: { value: 1 },
    uColor: { value: new THREE.Color(1, 1, 1) },
  };
  private readonly moonU = { uPhase: { value: 0.5 }, uNight: { value: 0 }, uColor: { value: new THREE.Color() } };
  /** Where the moon is now (for the moonlight), its phase and whether it is up. */
  readonly moonNow = new THREE.Vector3(0, 1, 0);
  phase = 0;
  moonUp = false;

  constructor(readonly N: NightCfg) {
    const S = N.heavens;
    const R = 900;
    const dirs = starField(S.stars);
    const pos = new Float32Array(dirs.length);
    for (let i = 0; i < dirs.length; i++) pos[i] = dirs[i]! * R;
    const size = new Float32Array(S.stars);
    const seed = new Float32Array(S.stars);
    for (let i = 0; i < S.stars; i++) {
      const k = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      // Most stars are faint; a few are bright.
      size[i] = S.starSize[0] + (S.starSize[1] - S.starSize[0]) * Math.pow(k, 3);
      seed[i] = (k * 7.13) % 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starU.uColor.value.set(S.starColor);
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.starU,
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.moonU.uColor.value.set(S.moonColor);
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.moonU,
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: MOON_FRAGMENT,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    this.moon.frustumCulled = false;
    this.moon.renderOrder = -8;
    this.group.add(this.stars, this.moon);
    this.group.visible = false;
  }

  /** Per frame: game time, how dark it is (0..1), the camera (the moon faces it). */
  update(time: number, t: number, night: number, camera: THREE.Camera, pxScale = 1): void {
    this.phase = moonPhase(time, this.N);
    const { up } = moonDir(time, this.N, this.moonNow);
    this.moonUp = up;
    this.group.visible = night > 0.01;
    if (!this.group.visible) return;
    this.group.position.copy(camera.position);
    this.starU.uTime.value = t;
    this.starU.uNight.value = night;
    this.starU.uScale.value = pxScale;
    this.moonU.uNight.value = up ? night : 0;
    this.moonU.uPhase.value = this.phase;
    const R = 850;
    this.moon.position.copy(this.moonNow).multiplyScalar(R);
    this.moon.scale.setScalar(R * this.N.heavens.moonSize * 2.6);
    this.moon.quaternion.copy(camera.quaternion);
  }

  /** The moonlight's strength now, 0..1: the lit share of the moon, and only while it is up. */
  get moonlight(): number {
    return this.moonUp ? 0.25 + 0.75 * moonLit(this.phase) : 0.12;
  }
}
