import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The "animated film" look (decision D25): filmic tone mapping, one warm key light with
 * soft shadows, sky light from an environment map, a gradient sky with a sun glow,
 * puffy clouds and hazy hills on the horizon. All of it is set up once; per frame it
 * costs one shadow pass and the normal scene render.
 */

export type LookStyle = 'lowpoly' | 'film';

export interface LookSettings {
  /** lowpoly = faceted shapes and flat colours (D41); film = the soft animated-film look (D25). */
  style: LookStyle;
  /** Low-poly only: true = plain flat colours; false = keep painted detail on the facets. */
  flatColors: boolean;
  shadows: boolean;
  shadowMapSize: number;
  exposure: number;
  envIntensity: number;
  clouds: number;
}

let look: LookSettings = {
  style: 'lowpoly',
  flatColors: false,
  shadows: true,
  shadowMapSize: 1024,
  exposure: 1.05,
  envIntensity: 0.55,
  clouds: 8,
};

/** Called once before scenes are built (settings come from config/quality.json). */
export function setLook(settings: Partial<Omit<LookSettings, 'style'>> & { style?: string }): void {
  const style: LookStyle =
    settings.style === 'film' ? 'film' : settings.style === 'lowpoly' ? 'lowpoly' : look.style;
  look = { ...look, ...settings, style };
}

/** True when the low-poly style is on. */
export function lowPoly(): boolean {
  return look.style === 'lowpoly';
}

/**
 * Segment count for round shapes: the low-poly style keeps about half, so spheres,
 * cylinders and canopies read as clean facets (and cost fewer triangles).
 */
export function seg(n: number, min = 3): number {
  return lowPoly() ? Math.max(min, Math.round(n * 0.5)) : n;
}

/** Icosahedron detail level: one step less in the low-poly style. */
export function detail(n: number): number {
  return lowPoly() ? Math.max(0, n - 1) : n;
}

export function currentLook(): LookSettings {
  return look;
}

/** Low golden sun from the front-left of most camera shots, so faces are lit. */
export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();

export const PALETTE = {
  zenith: '#6fa8dc',
  horizon: '#fbe3bd',
  ground: '#c9a46b',
  fog: 0xf0dcb8,
  sun: 0xffe2b0,
  skyLight: 0xcfe2ff,
  groundLight: 0x9a7448,
  hills: '#8fae8a',
};

export function setupRenderer(r: THREE.WebGLRenderer): void {
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = look.exposure;
  r.shadowMap.enabled = look.shadows;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.localClippingEnabled = true; // Kingdom temples rise behind a clipping plane (D54)
}

// ---------------------------------------------------------------- sky

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunDisc;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0 ? mix(horizon, zenith, pow(h, 0.55)) : mix(horizon, ground, min(1.0, -h * 6.0));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    c += sunColor * (pow(s, 6.0) * 0.25 + pow(s, 64.0) * 0.4);
    // The sun itself (PK 1.8.0, Anachak Khmer's moving sun): a bright disc, soft at its rim.
    c += sunColor * sunDisc * (smoothstep(0.99955, 0.99975, s) * 2.2 + pow(s, 900.0) * 0.6);
    // Warm glow along the whole horizon, like late afternoon.
    c += vec3(1.0, 0.78, 0.5) * 0.12 * exp(-abs(h) * 9.0);
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Gradient sky sphere that follows the camera. Colours are written as display colours. */
export function skyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(PALETTE.zenith).convertLinearToSRGB() },
      horizon: { value: new THREE.Color(PALETTE.horizon).convertLinearToSRGB() },
      ground: { value: new THREE.Color(PALETTE.ground).convertLinearToSRGB() },
      sunDir: { value: SUN_DIR.clone() },
      sunColor: { value: new THREE.Color(1, 0.93, 0.8) },
      sunDisc: { value: 0 },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.onBeforeRender = (_r, _s, cam) => dome.position.copy(cam.position);
  return dome;
}

function rnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Puffy cumulus clouds: clusters of soft spheres with flat-ish bottoms. */
export function cloudGeometry(seed: number): THREE.BufferGeometry {
  const r = rnd(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const rad = 7 + r() * 9;
    const g = new THREE.IcosahedronGeometry(rad, lowPoly() ? 0 : 2);
    const x = (i - n / 2) * 8 + r() * 4;
    const y = rad * 0.35 + r() * 5 - (Math.abs(x) / (n * 4)) * 6;
    g.scale(1, 0.72, 0.85);
    g.translate(x, y, r() * 6 - 3);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  // Flatten the underside.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.25);
  g.computeVertexNormals();
  return g;
}

/** Clouds and horizon hills; they follow the camera sideways so they always frame the shot. */
export function horizonDressing(seed = 1): THREE.Group {
  const group = new THREE.Group();
  const r = rnd(seed * 101 + 7);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xffe6c8),
    emissiveIntensity: 0.55,
    roughness: 1,
    fog: false,
  });
  for (let i = 0; i < look.clouds; i++) {
    const a = r() * Math.PI * 2;
    const d = 300 + r() * 120;
    const c = new THREE.Mesh(cloudGeometry(seed * 17 + i), cloudMat);
    c.position.set(Math.cos(a) * d, 70 + r() * 70, Math.sin(a) * d);
    c.lookAt(0, c.position.y, 0);
    c.scale.setScalar(1.2 + r() * 1.3);
    group.add(c);
  }
  // Two rings of soft hills: the far one bluer (aerial perspective).
  for (const [dist, height, color] of [
    [360, 34, 0xa9c2c8],
    [300, 22, 0x93b089],
  ] as const) {
    const seg = 96;
    const geo = new THREE.CylinderGeometry(dist, dist, 1, seg, 1, true);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        const ang = Math.atan2(pos.getZ(i), pos.getX(i));
        const hh =
          height *
          (0.45 +
            0.3 * Math.sin(ang * 3 + dist) +
            0.18 * Math.sin(ang * 7 + dist * 0.3) +
            0.07 * Math.sin(ang * 17));
        pos.setY(i, Math.max(2, hh));
      } else pos.setY(i, -2);
    }
    geo.computeVertexNormals();
    const hills = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false }),
    );
    group.add(hills);
  }
  group.userData.followCamera = true;
  return group;
}

// ---------------------------------------------------------------- lights

export interface SunOptions {
  /** Centre of the area that gets shadows. */
  center: [number, number, number];
  /** Half-size of the shadowed area in metres. */
  extent: number;
}

export function addLights(scene: THREE.Scene, opts: SunOptions): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 0.9));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.1);
  const [cx, cy, cz] = opts.center;
  sun.position.set(cx + SUN_DIR.x * 120, cy + SUN_DIR.y * 120, cz + SUN_DIR.z * 120);
  sun.target.position.set(cx, cy, cz);
  scene.add(sun, sun.target);
  if (look.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(look.shadowMapSize, look.shadowMapSize);
    const c = sun.shadow.camera;
    c.left = -opts.extent;
    c.right = opts.extent;
    c.top = opts.extent;
    c.bottom = -opts.extent;
    c.near = 10;
    c.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
  }
  return sun;
}

/** Soft sky reflections for every material, made once from the sky itself. */
export function environmentFrom(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  s.add(skyDome());
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.04);
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- ground

/**
 * A ground plane with slow, non-repeating colour variation painted into vertex colours,
 * so the repeating texture never shows as tiles.
 */
export function groundPlane(
  w: number,
  d: number,
  material: THREE.MeshStandardMaterial,
  seed = 1,
  strength = 0.18,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 0.05 + seed;
    const z = p.getZ(i) * 0.05 - seed;
    const n =
      0.5 * Math.sin(x * 1.3 + Math.cos(z * 0.7)) +
      0.3 * Math.sin(z * 2.1 + x * 0.4) +
      0.2 * Math.sin((x + z) * 3.7);
    const k = 1 + n * strength;
    col.set([k * (1 + n * 0.03), k, k * (1 - n * 0.05)], i * 3);
    // Low-poly: a gentle random lift per vertex so the flat ground catches light in facets.
    if (lowPoly()) {
      const h = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
      p.setY(i, (h - Math.floor(h) - 0.5) * 0.16);
    }
  }
  if (lowPoly()) geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  material.vertexColors = true;
  return shadows(new THREE.Mesh(geo, material), false, true);
}

// ---------------------------------------------------------------- materials

/**
 * A soft rim of warm light on silhouettes — the classic animated-film edge glow that
 * separates characters from the background. Works on any MeshStandardMaterial.
 */
export function addRim(
  m: THREE.MeshStandardMaterial,
  strength = 0.28,
  power = 2.6,
  extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: new THREE.Color(0xffe6c0) };
    sh.uniforms.rimStrength = { value: strength };
    sh.uniforms.rimPower = { value: power };
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;\nuniform float rimPower;',
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float rim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), rimPower);
          outgoingLight += rimColor * rim * rimStrength * (0.6 + 0.4 * saturate(normal.y + 0.5));
        }
        #include <opaque_fragment>`,
      );
    extra?.(sh);
  };
  const key = `rim-${strength}-${power}-${extra ? 'x' : ''}`;
  m.customProgramCacheKey = () => key;
  return m;
}

/** Standard soft material: matte, lit by sky and sun, with the edge glow. */
export function soft(
  params: THREE.MeshStandardMaterialParameters = {},
  rim = 0.22,
): THREE.MeshStandardMaterial {
  return addRim(
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...params }),
    lowPoly() ? rim * 0.5 : rim,
  );
}

// ---------------------------------------------------------------- low-poly style (D41)

const styled = new WeakSet<THREE.Material>();
const averages = new WeakMap<object, THREE.Color>();

/** Average colour of a painted texture (linear), cached per image. */
function averageColor(t: THREE.Texture): THREE.Color | null {
  const img = t.image as HTMLCanvasElement | undefined;
  if (!img || typeof (img as HTMLCanvasElement).getContext !== 'function') return null;
  const hit = averages.get(img);
  if (hit) return hit;
  const g = img.getContext('2d');
  if (!g) return null;
  const d = g.getImageData(0, 0, img.width, img.height).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 16) {
    r += d[i]!;
    gg += d[i + 1]!;
    b += d[i + 2]!;
    n++;
  }
  const c = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  averages.set(img, c);
  return c;
}

/** Flat-shade one lit material and swap detail textures for their average colour. */
export function flatten(m: THREE.Material): void {
  if (styled.has(m)) return;
  styled.add(m);
  if (!(
    m instanceof THREE.MeshStandardMaterial ||
    m instanceof THREE.MeshLambertMaterial ||
    m instanceof THREE.MeshPhongMaterial
  ))
    return;
  m.flatShading = true;
  const map = m.map;
  if (look.flatColors && map?.userData.detail && !m.transparent && !m.alphaTest) {
    const avg = averageColor(map);
    if (avg) m.color.multiply(avg);
    m.map = null;
  }
  if (m instanceof THREE.MeshStandardMaterial) m.roughness = Math.max(m.roughness, 0.9);
  m.needsUpdate = true;
}

/**
 * Apply the low-poly style to everything in a scene. Called before each render; only
 * materials not seen before are changed, so the cost after the first frame is a walk.
 */
export function styleScene(root: THREE.Object3D): void {
  if (!lowPoly()) return;
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach(flatten);
    else flatten(mat);
  });
}

/** Mark meshes for shadows (only when the preset allows them). */
export function shadows<T extends THREE.Object3D>(o: T, cast: boolean, receive: boolean): T {
  o.castShadow = cast && look.shadows;
  o.receiveShadow = receive && look.shadows;
  return o;
}
