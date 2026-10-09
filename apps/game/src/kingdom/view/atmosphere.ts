/**
 * The air of a humid jungle (PK 1.8.0 references: "high humidity atmospheric fog", "dramatic
 * volumetric light rays breaking through the clouds"):
 *
 * - `MistLayer`: soft banks of ground mist drifting low over the land round the view; thick
 *   in mist and rain, after rain and at dawn, thin on a clear noon.
 * - `LightShafts`: long beams of sunlight slanting down from the sun through gaps in the
 *   clouds, strongest on a cloudy day or just after rain, gone at night and in a storm.
 *
 * Both are a handful of transparent quads with their noise in the shader (no extra render
 * pass, no depth texture), re-placed on a fixed world grid as the view moves.
 * Numbers: config/kingdom/diorama.json → atmosphere.
 */
import * as THREE from 'three';
import type { Diorama } from '@temples/shared';
import { hash } from './detail';

export type AtmosphereCfg = Diorama['atmosphere'];

/** How much the weather allows (0..1) for a weather id, from a per-weather table. */
function byWeather(table: Record<string, number>, id: string): number {
  return table[id] ?? table.clear ?? 0;
}

/**
 * How thick the ground mist is now (0..1): the weather's share, more at dawn (`dawn` 0..1)
 * and while the ground is wet after rain (`wet` 0..1), thinner by `night`.
 */
export function mistAmount(id: string, dawn: number, wet: number, cfg: AtmosphereCfg['mist']): number {
  const w = byWeather(cfg.weather, id);
  return Math.min(1, w + cfg.dawn * dawn + cfg.wet * wet);
}

/** How bright the light shafts are now (0..1): the weather's share, more just after rain, none at night. */
export function shaftAmount(id: string, wet: number, night: number, cfg: AtmosphereCfg['shafts']): number {
  const w = byWeather(cfg.weather, id) + (id === 'clear' || id === 'cloudy' ? cfg.afterRain * wet : 0);
  return Math.min(1, w) * (1 - Math.min(1, night * 1.5));
}

/** Spots for `n` items round (cx, cz) within `radius`, one per world cell of `cell` m, nearest first. */
export function cellSpots(cx: number, cz: number, radius: number, cell: number, n: number, seed: number): Array<[number, number, number]> {
  const out: Array<[number, number, number, number]> = [];
  const c0x = Math.floor((cx - radius) / cell);
  const c1x = Math.floor((cx + radius) / cell);
  const c0z = Math.floor((cz - radius) / cell);
  const c1z = Math.floor((cz + radius) / cell);
  for (let z = c0z; z <= c1z; z++)
    for (let x = c0x; x <= c1x; x++) {
      if (hash(x, z, seed) > 0.55) continue; // not every cell has one
      const px = (x + 0.15 + 0.7 * hash(x, z, seed + 1)) * cell;
      const pz = (z + 0.15 + 0.7 * hash(x, z, seed + 2)) * cell;
      const d = Math.hypot(px - cx, pz - cz);
      if (d <= radius) out.push([d, px, pz, hash(x, z, seed + 3)]);
    }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, n).map(([, x, z, r]) => [x, z, r]);
}

const NOISE = /* glsl */ `
  float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float aNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), f.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float aFbm(vec2 p) { return aNoise(p) * 0.5 + aNoise(p * 2.1 + 5.2) * 0.3 + aNoise(p * 4.3 + 1.7) * 0.2; }
`;

/** Soft banks of mist lying low over the land. */
export class MistLayer {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color() },
    uWind: { value: new THREE.Vector2(1, 0.3) },
  };
  private at: [number, number, number] = [NaN, NaN, 0];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly day = new THREE.Color();
  private readonly night = new THREE.Color();
  /** Mist banks laid now (for the tests). */
  laid = 0;

  constructor(readonly cfg: AtmosphereCfg['mist']) {
    this.day.set(cfg.color);
    this.night.set(cfg.nightColor);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec2 vW; varying float vSeed;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xz;
          vSeed = fract(instanceMatrix[3][0] * 0.013 + instanceMatrix[3][2] * 0.007);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAmount; uniform vec3 uColor; uniform vec2 uWind;
        varying vec2 vUv; varying vec2 vW; varying float vSeed;
        ${NOISE}
        void main() {
          // Soft edges all round, a drifting billowing body inside.
          vec2 c = vUv - 0.5;
          float edge = smoothstep(0.5, 0.12, length(c));
          float body = aFbm(vW * 0.045 - uWind * uTime * 0.05 + vSeed * 20.0);
          float a = edge * smoothstep(0.22, 0.68, body) * uAmount;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cfg.count));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);
  }

  /** Per frame: lay the banks round the view, drift, thickness 0..1, how dark the night is. */
  update(t: number, cx: number, cz: number, radius: number, amount: number, night: number, wind: THREE.Vector2): void {
    const U = this.uniforms;
    U.uTime.value = t;
    U.uAmount.value = amount * this.cfg.opacity;
    U.uColor.value.copy(this.day).lerp(this.night, night);
    U.uWind.value.copy(wind);
    this.group.visible = amount > 0.01;
    const [ax, az, ar] = this.at;
    if (Math.hypot(cx - ax, cz - az) < radius * 0.2 && Math.abs(radius - ar) < ar * 0.25) return;
    this.at = [cx, cz, radius];
    const spots = cellSpots(cx, cz, radius, this.cfg.cell, this.cfg.count, 31);
    spots.forEach(([x, z, r], i) => {
      const size = this.cfg.size[0] + (this.cfg.size[1] - this.cfg.size[0]) * r;
      const y = this.cfg.height[0] + (this.cfg.height[1] - this.cfg.height[0]) * ((r * 7.3) % 1);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), r * 6.28);
      this.m.compose(this.v.set(x, y, z), this.q, this.s.set(size, 1, size * 0.7));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = spots.length;
    this.laid = spots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Beams of sunlight slanting down through gaps in the clouds. */
export class LightShafts {
  readonly group = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uCam: { value: new THREE.Vector3() },
  };
  private at: [number, number, number] = [NaN, NaN, 0];
  private readonly m = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  /** Beams laid now (for the tests). */
  laid = 0;

  constructor(readonly cfg: AtmosphereCfg['shafts']) {
    this.uniforms.uColor.value.set(cfg.color);
    // A unit strip: x across (-0.5..0.5), y along the beam (0 at the ground … 1 at the clouds).
    const geo = new THREE.PlaneGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform vec3 uSun; uniform vec3 uCam;
        varying vec2 vUv; varying float vSeed;
        void main() {
          vUv = uv;
          // Each beam: its foot (instance position), width (scale x) and length (scale y),
          // running up toward the sun and turned about its own axis to face the camera.
          vec3 foot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float w = length(instanceMatrix[0].xyz);
          float len = length(instanceMatrix[1].xyz);
          vec3 axis = normalize(uSun);
          vec3 toCam = normalize(uCam - foot);
          vec3 side = normalize(cross(axis, toCam));
          vec3 p = foot + axis * (position.y * len) + side * (position.x * w);
          vSeed = fract(foot.x * 0.0131 + foot.z * 0.0071);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAmount; uniform vec3 uColor;
        varying vec2 vUv; varying float vSeed;
        ${NOISE}
        void main() {
          // Soft sides, bright high up where it breaks through, fading to the ground; slow
          // flicker as the cloud gaps drift; dust streaks along the beam.
          float sides = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float along = smoothstep(0.0, 0.35, vUv.y) * (0.55 + 0.45 * vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float streak = 0.7 + 0.3 * aNoise(vec2(vUv.x * 9.0 + vSeed * 30.0, vUv.y * 1.5 - uTime * 0.05));
          float pulse = 0.65 + 0.35 * sin(uTime * 0.17 + vSeed * 40.0);
          float a = sides * along * streak * pulse * uAmount;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor * a, a);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, cfg.count));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.group.add(this.mesh);
  }

  /** Per frame: lay the beams round the view, the sun's direction, the camera, brightness 0..1. */
  update(t: number, cx: number, cz: number, radius: number, amount: number, sun: THREE.Vector3, cam: THREE.Vector3): void {
    const U = this.uniforms;
    U.uTime.value = t;
    U.uAmount.value = amount * this.cfg.strength;
    U.uSun.value.copy(sun);
    U.uCam.value.copy(cam);
    this.group.visible = amount > 0.01;
    const [ax, az, ar] = this.at;
    if (Math.hypot(cx - ax, cz - az) < radius * 0.2 && Math.abs(radius - ar) < ar * 0.25) return;
    this.at = [cx, cz, radius];
    const spots = cellSpots(cx, cz, radius, this.cfg.cell, this.cfg.count, 57);
    spots.forEach(([x, z, r], i) => {
      const w = this.cfg.width[0] + (this.cfg.width[1] - this.cfg.width[0]) * r;
      this.m.makeScale(w, this.cfg.length, 1).setPosition(x, 0, z);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.count = spots.length;
    this.laid = spots.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
