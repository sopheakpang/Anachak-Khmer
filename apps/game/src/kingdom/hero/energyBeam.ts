import * as THREE from 'three';

/**
 * PK 2026-10-21 (D169): the spearman's (ពលលំពែង) energy beam — the five layers of the Blender
 * design (scripts/models/blender/make_energy_beam.py, PK's brief) in the game's own shaders:
 *   1 energy core   — a sphere lit by its fresnel (facing → ramp → glow)
 *   2 core beam     — a thin cylinder along the thrust, same fresnel, its thickness flickering
 *   3 outer flames  — a wider cylinder twisted along its length, Manhattan Voronoi flames racing
 *                     along it, faded softly at both ends
 *   4 impact wave   — rings running outward on a disc at the far end (wave bands, noise-ragged,
 *                     faded at the inner and outer edges)
 *   5 particles     — two layers of Voronoi streaks racing back along a tube (screen-blended,
 *                     the second larger and slower), faded at its ends
 * The meshes are the Blender ones (models/real/vfx/spear-beam.glb) when loaded, otherwise the
 * same shapes built here. Everything is additive light (no depth write), so it glows with the
 * PC presets' bloom and reads on the phone without it. Local +X = the thrust; length 8 m.
 */

export interface BeamLook {
  core: THREE.Color;
  flame: THREE.Color;
  wave: THREE.Color;
  spark: THREE.Color;
  /** Brightness of the light (the Blender emission strength, scaled for the game). */
  strength: number;
  flameSpeed: number;
  waveSpeed: number;
  sparkSpeed: number;
  /** Radians of twist along the beam. */
  twist: number;
  /** How much the core beam's thickness flickers. */
  flicker: number;
}

/** The look from a skill colour: the Blender defaults, tinted by it. */
export function beamLook(color: number): BeamLook {
  const c = new THREE.Color(color);
  const deep = c.clone().lerp(new THREE.Color(0x1f5cff), 0.35);
  return {
    core: c.clone().lerp(new THREE.Color(0xffffff), 0.25),
    flame: deep,
    wave: c.clone(),
    spark: c.clone().lerp(new THREE.Color(0xffffff), 0.5),
    strength: 1.6,
    flameSpeed: 1,
    waveSpeed: 1,
    sparkSpeed: 1,
    twist: 1.2,
    flicker: 0.25,
  };
}

export const BEAM_LENGTH = 8;
/** The energy core's size in the game (× the Blender sphere): a point of light at the spear. */
export const CORE_SCALE = 0.5;

/**
 * How much of the beam is shown at time t (s) of a cast lasting `dur`: it shoots out over the
 * first `shoot` s (0 → 1 of its length), holds, and its light fades over the last 35 %.
 */
export function beamPhase(t: number, dur: number, shoot = 0.14): { reach: number; light: number } {
  const reach = Math.min(1, Math.max(0, t / shoot));
  const k = t / dur;
  const light = k < 0 ? 0 : k > 1 ? 0 : Math.min(1, t / 0.06) * (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35);
  return { reach: 1 - Math.pow(1 - reach, 3), light };
}

// --- shaders ------------------------------------------------------------------------------------

const NOISE = /* glsl */ `
  vec2 h2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  // Voronoi distance to the nearest point; manhattan = 1 for the brief's Manhattan metric.
  float voronoi(vec2 x, float manhattan) {
    vec2 n = floor(x); vec2 f = fract(x); float md = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)); vec2 o = h2(n + g); vec2 r = g + o - f;
      float d = manhattan > 0.5 ? abs(r.x) + abs(r.y) : length(r);
      md = min(md, d);
    }
    return md;
  }
  float vnoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = h2(i).x, b = h2(i + vec2(1, 0)).x, c = h2(i + vec2(0, 1)).x, d = h2(i + vec2(1, 1)).x;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
  // black-white-black along t (soft cut at both ends; e = the share that fades)
  float ends(float t, float e) { return smoothstep(0.0, e, t) * (1.0 - smoothstep(1.0 - e, 1.0, t)); }
`;

const FRESNEL_V = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  uniform float uTime; uniform float uFlicker; uniform float uThin;
  void main() {
    vec3 p = position;
    // The core beam's thickness flickers (the Blender noise modifier on its Z scale).
    float fl = 1.0 + uFlicker * (sin(uTime * 37.0) * 0.5 + sin(uTime * 23.0 + 1.7) * 0.5) * uThin;
    p.yz *= fl;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRESNEL_F = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  uniform vec3 uColor; uniform float uLight; uniform float uStrength;
  void main() {
    float facing = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    // The ramp: white heart, the beam's colour, a deep rim (Layer Weight → Color Ramp).
    vec3 c = mix(vec3(1.0), uColor, smoothstep(0.0, 0.55, facing));
    c = mix(c, uColor * vec3(0.35, 0.55, 1.2), smoothstep(0.55, 1.0, facing));
    float a = (1.0 - smoothstep(0.75, 1.0, facing) * 0.6) * uLight;
    gl_FragColor = vec4(c * uStrength * a, 1.0);
  }
`;

const FLAME_V = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime; uniform float uTwist; uniform float uSpeed;
  ${NOISE}
  void main() {
    vUv = uv;
    vec3 p = position;
    // Twist about the beam's axis along its length (Simple Deform: Twist, X).
    float a = uTwist * uv.y;
    float cs = cos(a), sn = sin(a);
    p.yz = mat2(cs, -sn, sn, cs) * p.yz;
    // Ragged flames: pushed out by noise moving along the beam (Displace by a moving Voronoi).
    float d = vnoise(vec2(uv.y * 14.0 - uTime * uSpeed * 2.4, uv.x * 6.0)) - 0.5;
    p.yz *= 1.0 + d * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FLAME_F = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime; uniform float uSpeed; uniform vec3 uColor; uniform float uLight; uniform float uStrength;
  ${NOISE}
  void main() {
    // Manhattan Voronoi in UV, moving forward (Mapping: Y location animated).
    float v = voronoi(vec2(vUv.x * 4.0 * 3.0, (vUv.y - uTime * uSpeed * 2.4) * 4.0), 1.0);
    float f = 1.0 - smoothstep(0.0, 1.0, v);           // ramp: white near the cells' hearts
    f *= ends(vUv.y, 0.15);                            // the soft cut-off at both ends
    gl_FragColor = vec4(uColor * f * uStrength * uLight, 1.0);
  }
`;

const WAVE_F = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime; uniform float uSpeed; uniform vec3 uColor; uniform float uLight; uniform float uStrength;
  ${NOISE}
  void main() {
    // u round the disc, v from its middle out (the square UV of the Blender disc).
    float n = vnoise(vUv * vec2(24.0, 4.0) + uTime);
    float bands = 0.5 + 0.5 * sin((vUv.y * 3.0 * (1.0 + (n - 0.5) * 0.3) - uTime * uSpeed * 4.0) * 6.2832);
    float f = smoothstep(0.7, 0.92, bands);           // clear between the rings
    f *= ends(vUv.y, 0.5);                             // faded at the inner and outer edges
    gl_FragColor = vec4(uColor * f * uStrength * uLight, 1.0);
  }
`;

const SPARK_F = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime; uniform float uSpeed; uniform vec3 uColor; uniform float uLight; uniform float uStrength;
  ${NOISE}
  float streak(vec2 uv, vec2 sc, float speed) {
    float v = voronoi(vec2(uv.x * sc.x, (uv.y + uTime * speed) * sc.y), 0.0);
    return 1.0 - smoothstep(0.0, 0.16, v);            // a tight white slider
  }
  void main() {
    float a = streak(vUv, vec2(12.0, 1.2), uSpeed * 2.5);
    float b = streak(vUv, vec2(7.0, 0.7), uSpeed * 1.25);  // larger, slower: depth
    float f = 1.0 - (1.0 - a) * (1.0 - b);            // screen
    f *= ends(vUv.y, 0.2);
    gl_FragColor = vec4(uColor * f * uStrength * uLight, 1.0);
  }
`;
const UV_V = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function mat(vertexShader: string, fragmentShader: string, u: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

// --- the shapes (the Blender ones, or the same built here) --------------------------------------

/** A cylinder along +X from 0 to `len`, UVs: u round it, v along it (as the Blender meshes). */
export function beamCylinder(r: number, len: number, segs: number, rings: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, segs, rings, true);
  // three's cylinder runs along Y, v rising with it: turned onto +X (from 0), v rises along +X.
  return g.rotateZ(-Math.PI / 2).translate(len / 2, 0, 0);
}

/** A flat disc across the beam at x = 0 (in the YZ plane), u round it, v from r0 out to r1. */
export function waveDisc(r0: number, r1: number, segs: number, rings: number): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(r0, r1, segs, rings);
  // RingGeometry's uv is a planar map: give it the square (u round, v out) of the Blender disc.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setXY(i, (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1, (Math.hypot(x, y) - r0) / (r1 - r0));
  }
  g.rotateY(Math.PI / 2);
  return g;
}

export interface BeamShapes {
  core: THREE.BufferGeometry;
  beam: THREE.BufferGeometry;
  flames: THREE.BufferGeometry;
  wave: THREE.BufferGeometry;
  sparks: THREE.BufferGeometry;
}

let built: BeamShapes | null = null;
/** The shapes built here (shared by every beam). */
export function builtShapes(): BeamShapes {
  if (!built) {
    const L = BEAM_LENGTH;
    const sparks = beamCylinder(0.75, L, 32, 8).translate(-L, 0, 0); // a tube behind the impact
    built = {
      core: new THREE.SphereGeometry(0.45, 24, 12),
      beam: beamCylinder(0.16, L, 24, 1),
      flames: beamCylinder(0.42, L, 32, 40),
      wave: waveDisc(0.05, 2.2, 48, 6),
      sparks,
    };
    for (const g of Object.values(built)) g.userData.shared = true;
  }
  return built;
}

/** The Blender meshes from spear-beam.glb, by their object names (BeamFX_*), or null. */
export function shapesFromModel(root: THREE.Object3D | null): BeamShapes | null {
  if (!root) return null;
  const get = (name: string): THREE.BufferGeometry | null => {
    let out: THREE.BufferGeometry | null = null;
    root.traverse((o) => {
      if (!out && (o as THREE.Mesh).isMesh && o.name.startsWith(name)) {
        o.updateWorldMatrix(true, false);
        out = (o as THREE.Mesh).geometry.clone().applyMatrix4(o.matrixWorld);
      }
    });
    return out;
  };
  const core = get('BeamFX_EnergyCore');
  const beam = get('BeamFX_CoreBeam');
  const flames = get('BeamFX_OuterFlames');
  const wave = get('BeamFX_ImpactWave');
  const sparks = get('BeamFX_Particles');
  if (!core || !beam || !flames || !wave || !sparks) return null;
  // In the Blender file the disc and the tube stand at the far end (x = L): the game puts them there itself.
  wave.translate(-BEAM_LENGTH, 0, 0);
  const shapes = { core, beam, flames, wave, sparks: sparks.translate(-BEAM_LENGTH, 0, 0) };
  for (const g of Object.values(shapes)) g.userData.shared = true;
  return shapes;
}

/** One cast of the beam: a group in the scene, played by `update`. */
export class EnergyBeam {
  readonly group = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly far: THREE.Group;
  private readonly body: THREE.Group;
  private readonly time = { value: 0 };
  private readonly light = { value: 0 };
  /** The core at the spear's point: a flash as the beam leaves it, gone before the beam is. */
  private readonly coreLight = { value: 0 };

  constructor(
    shapes: BeamShapes,
    look: BeamLook,
    readonly length: number,
  ) {
    this.group.name = 'energyBeam';
    const S = { value: look.strength };
    const common = (c: THREE.Color) => ({ uTime: this.time, uLight: this.light, uStrength: S, uColor: { value: c } });
    const fresnelCore = mat(FRESNEL_V, FRESNEL_F, {
      ...common(look.core),
      uLight: this.coreLight,
      uFlicker: { value: 0 },
      uThin: { value: 0 },
    });
    const fresnelBeam = mat(FRESNEL_V, FRESNEL_F, { ...common(look.core), uFlicker: { value: look.flicker }, uThin: { value: 1 } });
    const flame = mat(FLAME_V, FLAME_F, { ...common(look.flame), uTwist: { value: look.twist }, uSpeed: { value: look.flameSpeed } });
    const wave = mat(UV_V, WAVE_F, { ...common(look.wave), uSpeed: { value: look.waveSpeed } });
    const spark = mat(UV_V, SPARK_F, { ...common(look.spark), uSpeed: { value: look.sparkSpeed } });
    this.mats.push(fresnelCore, fresnelBeam, flame, wave, spark);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, order: number) => {
      const o = new THREE.Mesh(g, m);
      o.frustumCulled = false;
      o.renderOrder = order;
      return o;
    };
    // The body stretches out along the thrust; the far end (wave, sparks) rides its tip.
    this.body = new THREE.Group();
    this.body.add(mesh(shapes.beam, fresnelBeam, 8), mesh(shapes.flames, flame, 9));
    this.far = new THREE.Group();
    this.far.add(mesh(shapes.wave, wave, 10), mesh(shapes.sparks, spark, 9));
    // The core small at the spear's point (the chase camera stands right behind it).
    const core = mesh(shapes.core, fresnelCore, 8);
    core.scale.setScalar(CORE_SCALE);
    this.group.add(core, this.body, this.far);
    const k = length / BEAM_LENGTH;
    this.body.scale.set(k, 1, 1);
    this.far.position.x = length;
    this.far.scale.set(k, 1, 1);
  }

  /** Point it: from (x, y, z) along the game's heading (sin h, cos h on the ground). */
  aim(x: number, y: number, z: number, heading: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, heading - Math.PI / 2, 0);
  }

  /** t = seconds since the cast began, dur = how long it lasts. */
  update(t: number, dur: number): void {
    const ph = beamPhase(t, dur);
    this.time.value = t;
    this.light.value = ph.light;
    this.coreLight.value = ph.light * (1 - Math.min(1, Math.max(0, (t / dur - 0.25) / 0.3)));
    const k = (this.length / BEAM_LENGTH) * Math.max(0.001, ph.reach);
    this.body.scale.x = k;
    this.far.position.x = this.length * ph.reach;
    this.far.visible = ph.reach > 0.95;
    this.group.visible = ph.light > 0;
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.group.clear();
  }
}
