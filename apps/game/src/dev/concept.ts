/**
 * Concept render for the Anno-style graphics upgrade (docs: Kingdom Graphics Upgrade).
 * A dev page, not the game: one still scene of Bakong in its moat, a village on the
 * causeway, rice paddies and a river, drawn with the planned water shader, blended
 * ground, varied trees, village life and post-processing (ambient occlusion, glow,
 * tilt-shift, warm grade). Open /concept.html on the dev server; ?plain=1 = no post.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { loadKingdom } from '@temples/shared';
import { templeGeometry } from '../kingdom/view/temples';
import { keungHouseGeometry, rongHouseGeometry } from '../kingdom/view/houses';
import {
  bushGeometry,
  palmGeometry,
  raftGeometry,
  seeded,
  treeGeometry,
  workerGeometry,
} from '../engine/figures';
import { cowGeometry } from '../kingdom/view/livestock';

const W = 1920;
const H = 1080;
const q = new URLSearchParams(location.search);
const rnd = seeded(7);

// ---------------------------------------------------------------- the land
const SIZE = 420;
const MOAT_IN = 33;
const MOAT_OUT = 43;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const noise = (x: number, z: number) =>
  Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * 0.5 +
  Math.sin(z * 0.052 + x * 0.013) * 0.35 +
  Math.sin((x + z) * 0.11) * 0.15;
/** River: a sinuous band across the far side of the map. */
const riverD = (x: number, z: number) => Math.abs(z + 105 + Math.sin(x * 0.028) * 22 + x * 0.12);
const causeway = (x: number, z: number) => Math.abs(x) < 4 && z > 20 && z < 200;
const paddy = (x: number, z: number) => x > 52 && x < 175 && z > -80 && z < 40;
const moat = (x: number, z: number) => {
  const d = Math.max(Math.abs(x), Math.abs(z));
  return d > MOAT_IN && d < MOAT_OUT && !causeway(x, z);
};

function heightAt(x: number, z: number): number {
  let h = 0.75 + noise(x, z) * 0.4;
  h += smooth(120, 210, -x + z * 0.2) * 7 * (0.6 + 0.4 * noise(z, x)); // hills to the west
  if (paddy(x, z)) h = 0.15;
  const r = riverD(x, z);
  h = THREE.MathUtils.lerp(-2.6, h, smooth(6, 16, r));
  if (moat(x, z)) {
    const d = Math.max(Math.abs(x), Math.abs(z));
    const e = Math.min(d - MOAT_IN, MOAT_OUT - d);
    h = Math.min(h, THREE.MathUtils.lerp(0.3, -2.2, smooth(0, 3, e)));
  }
  if (causeway(x, z)) h = Math.max(h, 0.55);
  if (Math.max(Math.abs(x), Math.abs(z)) < MOAT_IN - 1) h = 0.45;
  return h;
}

const C = {
  grass: new THREE.Color(0x67903a),
  grassDry: new THREE.Color(0x958c4c),
  laterite: new THREE.Color(0xa0522d),
  mud: new THREE.Color(0x5b4632),
  sand: new THREE.Color(0xc8b07a),
  paddy: new THREE.Color(0x86b83e),
  paddyGold: new THREE.Color(0xc7b44a),
  dike: new THREE.Color(0x7f6a3e),
  rock: new THREE.Color(0x7d7262),
  forest: new THREE.Color(0x3f6a2a),
  paving: new THREE.Color(0xb8a68a),
};

function groundColor(x: number, z: number, h: number, out: THREE.Color): void {
  const n = noise(x * 2.3, z * 2.1);
  out.copy(C.grass).lerp(C.grassDry, smooth(-0.2, 0.9, n) * 0.55);
  out.lerp(C.forest, smooth(0.3, 1, noise(x * 0.7 + 40, z * 0.6)) * 0.45);
  if (h > 3) out.lerp(C.rock, smooth(3, 7, h) * 0.5);
  if (h < 0.25) out.lerp(C.sand, smooth(0.25, -0.4, h));
  if (h < -0.4) out.lerp(C.mud, smooth(-0.4, -1.5, h));
  if (paddy(x, z)) {
    const cx = ((x - 52) % 14) / 14;
    const cz = ((z + 80) % 12) / 12;
    const dike = cx < 0.06 || cz < 0.07;
    const field = Math.floor((x - 52) / 14) + Math.floor((z + 80) / 12);
    out.copy(field % 3 === 0 ? C.paddyGold : C.paddy).lerp(C.grass, 0.15 * Math.sin(x + z));
    if (dike) out.copy(C.dike);
  }
  if (causeway(x, z) || (Math.abs(z - 120) < 3.2 && Math.abs(x) < 90))
    out.copy(C.laterite).lerp(C.mud, 0.15 + 0.15 * n);
  if (Math.max(Math.abs(x), Math.abs(z)) < MOAT_IN - 1) out.copy(C.paving).lerp(C.laterite, 0.25 + 0.2 * n);
}

function terrain(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(SIZE, SIZE, 360, 360);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const h = heightAt(x, z);
    p.setY(i, h);
    groundColor(x, z, h, c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- water
function heightTexture(): THREE.DataTexture {
  const N = 512;
  const data = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++)
      data[j * N + i] = heightAt((i / (N - 1) - 0.5) * SIZE, (j / (N - 1) - 0.5) * SIZE);
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.FloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function water(sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uHeight: { value: heightTexture() },
      uSize: { value: SIZE },
      uTime: { value: 12.3 },
      uSun: { value: sunDir },
      uShallow: { value: new THREE.Color(0x4f9c8a) },
      uDeep: { value: new THREE.Color(0x163f4c) },
      uMud: { value: new THREE.Color(0x8a7349) },
      uSky: { value: new THREE.Color(0xbfd8e8) },
      uFog: { value: new THREE.Color(0xd9c9a8) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uHeight; uniform float uSize; uniform float uTime; uniform vec3 uSun;
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uMud; uniform vec3 uSky; uniform vec3 uFog;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float waves(vec2 p) {
        return vnoise(p * 0.35 + vec2(uTime * 0.3, uTime * 0.2)) * 0.6 + vnoise(p * 0.9 - vec2(uTime * 0.25, -uTime * 0.4)) * 0.3
             + vnoise(p * 2.3 + uTime * 0.6) * 0.1;
      }
      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        float ground = texture2D(uHeight, uv).r;
        float depth = max(0.0, vWorld.y - ground);
        if (depth < 0.005) discard;
        // Normal from the wave field.
        float e = 0.15, h0 = waves(vWorld.xz);
        vec3 n = normalize(vec3(h0 - waves(vWorld.xz + vec2(e, 0.0)), e * 2.2, h0 - waves(vWorld.xz + vec2(0.0, e))));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 2.0, depth));
        body = mix(body, uMud, 0.22);
        vec3 col = mix(body, uSky, 0.06 + fres * 0.45);
        vec3 h = normalize(uSun + v);
        col += vec3(1.0, 0.86, 0.6) * pow(max(dot(n, h), 0.0), 220.0) * 2.2;
        // Foam where the water meets the shore, broken up by the waves.
        float foam = smoothstep(0.32, 0.0, depth) * smoothstep(0.35, 0.65, vnoise(vWorld.xz * 1.6 + uTime));
        foam += smoothstep(0.08, 0.0, depth) * 0.6;
        col = mix(col, vec3(0.97, 0.96, 0.9), clamp(foam, 0.0, 0.85));
        float alpha = mix(0.55, 0.96, smoothstep(0.0, 1.2, depth));
        float d = length(cameraPosition - vWorld);
        col = mix(col, uFog, smoothstep(260.0, 520.0, d));
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  const g = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = -0.05;
  return m;
}

// ---------------------------------------------------------------- scatter helpers
function instanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  items: Array<{ x: number; z: number; s?: number; r?: number; y?: number; tint?: number }>,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const qn = new THREE.Quaternion();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    qn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r ?? rnd() * Math.PI * 2);
    m.compose(new THREE.Vector3(it.x, it.y ?? heightAt(it.x, it.z), it.z), qn, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
    c.setHSL(0.25, 0.1, 0.5 + (it.tint ?? rnd() - 0.5) * 0.25);
    mesh.setColorAt(i, c.setRGB(1 + (rnd() - 0.5) * 0.25, 1 + (rnd() - 0.5) * 0.2, 1 + (rnd() - 0.5) * 0.25));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const leafy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

/** A banyan-like broad tree and a bamboo clump: more tree kinds (plan, area 4). */
function banyanGeometry(): THREE.BufferGeometry {
  const g = treeGeometry(2).clone();
  g.scale(1.6, 1.15, 1.6);
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * 0.78, c.getY(i) * 0.86, c.getZ(i) * 0.7);
  return g;
}
function bambooGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, hex: number) => {
    const col = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g.toNonIndexed());
  };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const h = 6 + (i % 3) * 1.5;
    const s = new THREE.CylinderGeometry(0.07, 0.1, h, 5);
    s.translate(0, h / 2, 0);
    s.rotateZ(Math.cos(a) * 0.18);
    s.rotateX(Math.sin(a) * 0.18);
    s.translate(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
    add(s, 0x8a9a3c);
    const leaf = new THREE.IcosahedronGeometry(1.1, 0);
    leaf.scale(1, 1.6, 1);
    leaf.translate(Math.cos(a) * 1.6, h - 0.5, Math.sin(a) * 1.6);
    add(leaf, i % 2 ? 0x6d9a3a : 0x86ad48);
  }
  return mergeGeometries(
    parts.map((p) => {
      p.deleteAttribute('uv');
      return p;
    }),
  )!;
}

/** Lotus pads with pink flowers on the moat. */
function lotusGeometry(): THREE.BufferGeometry {
  const pad = new THREE.CylinderGeometry(0.55, 0.55, 0.04, 9);
  const flower = new THREE.ConeGeometry(0.18, 0.35, 6);
  flower.translate(0.2, 0.2, 0.1);
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const col = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    const ng = g.toNonIndexed();
    ng.deleteAttribute('uv');
    return ng;
  };
  return mergeGeometries([paint(pad, 0x4f8a3a), paint(flower, 0xe58fb0)])!;
}

/** Clay jars, firewood and a fence: props around homes (plan, area 5). */
function propsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const col = new THREE.Color(hex);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    parts.push(ng);
  };
  for (let i = 0; i < 3; i++) {
    const j = new THREE.SphereGeometry(0.42, 8, 6);
    j.scale(1, 1.15, 1);
    j.translate(3.2 + i * 0.9, 0.45, 2.6);
    paint(j, i === 1 ? 0x6b3b22 : 0x8a4b2a);
  }
  for (let i = 0; i < 5; i++) {
    const l = new THREE.CylinderGeometry(0.09, 0.09, 1.6, 5);
    l.rotateZ(Math.PI / 2);
    l.translate(-3.4, 0.12 + (i % 2) * 0.18, 2.3 + i * 0.2);
    paint(l, 0x7a5232);
  }
  for (let i = 0; i < 8; i++) {
    const post = new THREE.BoxGeometry(0.1, 1.0, 0.1);
    post.translate(-4.5 + i * 1.3, 0.5, 4.6);
    paint(post, 0xb39a5c);
  }
  const rail = new THREE.BoxGeometry(9.2, 0.07, 0.07);
  rail.translate(0.05, 0.75, 4.6);
  paint(rail, 0xb39a5c);
  return mergeGeometries(parts)!;
}

/** Cooking smoke: soft billboards rising and fading (plan, area 6). */
function smoke(x: number, z: number, y0: number): THREE.Group {
  const g = new THREE.Group();
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const k = c.getContext('2d')!;
    const gr = k.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    k.fillStyle = gr;
    k.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color: 0xeee6da,
        transparent: true,
        opacity: 0.42 - i * 0.05,
        depthWrite: false,
      }),
    );
    s.position.set(x + i * 0.55 + Math.sin(i) * 0.3, y0 + i * 1.3, z - i * 0.3);
    s.scale.setScalar(1.4 + i * 0.7);
    g.add(s);
  }
  return g;
}

/** Egrets flying over the paddies (plan, area 6). */
function birds(): THREE.InstancedMesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.9, 0.25, 0, 0, 0, 0.2, 0, 0, -0.2, 0.9, 0.25, 0, 0, 0, -0.2, 0, 0, 0.2],
      3,
    ),
  );
  g.computeVertexNormals();
  const items = Array.from({ length: 14 }, (_, i) => ({
    x: 95 + Math.cos(i * 1.7) * 22 + i * 1.5,
    z: -30 + Math.sin(i * 2.1) * 18,
    y: 16 + (i % 4) * 1.6,
    s: 1.1,
  }));
  return instanced(
    g,
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 }),
    items,
  );
}

// ---------------------------------------------------------------- post-processing
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFocus: { value: 0.55 },
    uBand: { value: 0.2 },
    uBlur: { value: 1.8 },
    uRes: { value: new THREE.Vector2(W, H) },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uFocus; uniform float uBand; uniform float uBlur; uniform vec2 uRes;
    varying vec2 vUv;
    void main() {
      // Tilt-shift: sharp band across the focus, blur growing above and below it.
      float k = smoothstep(uBand, uBand + 0.32, abs(vUv.y - uFocus)) * uBlur;
      vec3 c = vec3(0.0); float wsum = 0.0;
      for (int i = -4; i <= 4; i++) for (int j = -4; j <= 4; j++) {
        vec2 o = vec2(float(i), float(j)) * k / uRes;
        float w = exp(-float(i * i + j * j) / 10.0);
        c += texture2D(tDiffuse, vUv + o).rgb * w; wsum += w;
      }
      c /= wsum;
      // Warm golden-hour grade: lift shadows warm, a little more saturation and contrast.
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.08);
      c = (c - 0.5) * 1.06 + 0.5;
      c += vec3(0.035, 0.018, -0.012) * (1.0 - l);
      c *= vec3(1.03, 1.0, 0.95);
      // Light vignette.
      float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
      c *= mix(0.82, 1.0, v);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// ---------------------------------------------------------------- the scene
function build(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9c9a8);
  scene.fog = new THREE.Fog(0xdccdab, 230, 520);

  const sunDir = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();
  const sun = new THREE.DirectionalLight(0xffdcae, 3.3);
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -170;
  sc.right = 170;
  sc.top = 170;
  sc.bottom = -170;
  sc.near = 10;
  sc.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, new THREE.HemisphereLight(0xcfe3f2, 0x6b5a3a, 1.05));

  scene.add(terrain(), water(sunDir));

  // Bakong, the temple-mountain of Hariharalaya, in its moat.
  const data = loadKingdom();
  const ch = data.campaign.chapters.find((c) => c.temple === 'bakong')!;
  const temple = new THREE.Mesh(templeGeometry(ch, 2), solid);
  temple.position.y = 0.45;
  temple.castShadow = temple.receiveShadow = true;
  scene.add(temple);

  // Village along the causeway and the cross road: commoners' Rong houses, a noble's Keung house.
  const rong = rongHouseGeometry();
  const keung = keungHouseGeometry();
  const houses: Array<{ x: number; z: number; r: number; s?: number }> = [];
  for (let i = 0; i < 9; i++) {
    const z = 58 + i * 15 + (rnd() - 0.5) * 4;
    houses.push({ x: -13 - rnd() * 4, z, r: Math.PI / 2 + (rnd() - 0.5) * 0.3 });
    houses.push({ x: 13 + rnd() * 4, z: z + 6, r: -Math.PI / 2 + (rnd() - 0.5) * 0.3 });
  }
  for (let i = 0; i < 8; i++) {
    const x = -80 + i * 22 + (rnd() - 0.5) * 6;
    if (Math.abs(x) < 20) continue;
    houses.push({ x, z: 109 + (rnd() - 0.5) * 3, r: (rnd() - 0.5) * 0.3 });
  }
  scene.add(instanced(rong, solid, houses));
  scene.add(
    instanced(
      propsGeometry(),
      solid,
      houses.map((h) => ({ ...h })),
    ),
  );
  scene.add(
    instanced(keung, solid, [
      { x: -24, z: 55, r: Math.PI / 2, s: 1.1 },
      { x: 25, z: 64, r: -Math.PI / 2, s: 1.1 },
    ]),
  );
  const smokeScene = new THREE.Scene();
  for (const h of houses.filter((_, i) => i % 4 === 1))
    smokeScene.add(smoke(h.x + 1.5, h.z - 1, heightAt(h.x, h.z) + 6.5));

  // Trees: banyan, mango-like, sugar palms, bamboo, bushes; forests on the hills, palms on the dikes.
  const trees: Array<{ x: number; z: number; s: number }> = [];
  const banyans: typeof trees = [];
  const palms: typeof trees = [];
  const bamboo: typeof trees = [];
  const bushes: typeof trees = [];
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() - 0.5) * SIZE * 0.96;
    const z = (rnd() - 0.5) * SIZE * 0.96;
    const h = heightAt(x, z);
    if (h < 0.2 || paddy(x, z) || causeway(x, z) || (Math.abs(x) < 22 && z > 40 && z < 200)) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) < MOAT_OUT + 4) continue;
    if (Math.abs(z - 109) < 8 && Math.abs(x) < 95) continue;
    const dense = noise(x * 0.7 + 40, z * 0.6) + (h > 2 ? 0.6 : 0);
    const roll = rnd();
    if (dense > 0.25 || roll < 0.18) {
      if (roll < 0.12) banyans.push({ x, z, s: 0.9 + rnd() * 0.5 });
      else if (roll < 0.22) bamboo.push({ x, z, s: 0.8 + rnd() * 0.4 });
      else trees.push({ x, z, s: 0.85 + rnd() * 0.6 });
    } else if (roll < 0.3) palms.push({ x, z, s: 0.9 + rnd() * 0.35 });
    else if (roll < 0.42) bushes.push({ x, z, s: 0.8 + rnd() * 0.7 });
  }
  for (let i = 0; i < 26; i++)
    palms.push({ x: 54 + rnd() * 120, z: -80 + Math.floor(rnd() * 10) * 12, s: 1 + rnd() * 0.3 });
  for (let i = 0; i < 18; i++)
    palms.push({ x: (i % 2 ? 7 : -7) + (rnd() - 0.5), z: 50 + i * 8.5, s: 1.05 + rnd() * 0.2 });
  scene.add(instanced(treeGeometry(2), leafy, trees));
  scene.add(instanced(banyanGeometry(), leafy, banyans));
  scene.add(instanced(palmGeometry(), leafy, palms));
  scene.add(instanced(bambooGeometry(), leafy, bamboo));
  scene.add(instanced(bushGeometry(), leafy, bushes));

  // Lotus on the moat, boats on the moat and river.
  const lotus: Array<{ x: number; z: number; y: number; s: number }> = [];
  for (let i = 0; i < 420; i++) {
    const side = Math.floor(rnd() * 4);
    const along = (rnd() - 0.5) * 2 * (MOAT_OUT - 1);
    const across = MOAT_IN + 1.2 + rnd() * (MOAT_OUT - MOAT_IN - 2.4);
    const [x, z] =
      side === 0
        ? [along, -across]
        : side === 1
          ? [across, along]
          : side === 2
            ? [along, across]
            : [-across, along];
    if (causeway(x, z) || rnd() < 0.45 * Math.abs(Math.sin(along * 0.08))) continue;
    lotus.push({ x, z, y: -0.03, s: 0.8 + rnd() * 0.7 });
  }
  scene.add(instanced(lotusGeometry(), solid, lotus));
  const boats = [
    { x: 38, z: 12, y: -0.15, r: 0.1, s: 1.2 },
    { x: -38, z: -20, y: -0.15, r: 1.4, s: 1.2 },
    { x: 60, z: -112, y: -0.2, r: 0.4, s: 1.6 },
    { x: -40, z: -102, y: -0.2, r: 0.2, s: 1.6 },
    { x: 120, z: -131, y: -0.2, r: 0.5, s: 1.6 },
  ];
  scene.add(instanced(raftGeometry(), solid, boats));

  // People on the causeway and in the paddies; buffalo in the fields.
  const people: Array<{ x: number; z: number; r: number }> = [];
  for (let i = 0; i < 60; i++)
    people.push({ x: (rnd() - 0.5) * 6, z: 46 + rnd() * 140, r: rnd() < 0.5 ? 0 : Math.PI });
  for (let i = 0; i < 40; i++)
    people.push({
      x: (rnd() - 0.5) * 160,
      z: 109 + (rnd() - 0.5) * 5,
      r: rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2,
    });
  for (let i = 0; i < 26; i++) people.push({ x: 56 + rnd() * 115, z: -78 + rnd() * 115, r: rnd() * 6 });
  for (let i = 0; i < 20; i++) people.push({ x: (rnd() - 0.5) * 50, z: (rnd() - 0.5) * 50, r: rnd() * 6 });
  const workerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  scene.add(
    instanced(
      workerGeometry('none'),
      workerMat,
      people.filter((_, i) => i % 3),
    ),
  );
  scene.add(
    instanced(
      workerGeometry('load'),
      workerMat,
      people.filter((_, i) => i % 3 === 0),
    ),
  );
  const cows = Array.from({ length: 12 }, () => ({ x: 60 + rnd() * 110, z: -75 + rnd() * 110 }));
  scene.add(instanced(cowGeometry(), solid, cows));
  scene.add(birds());

  // The game's diagonal view, a little lower (plan, area 8), framed on the temple and village.
  const camera = new THREE.PerspectiveCamera(32, W / H, 1, 1200);
  const target = new THREE.Vector3(Number(q.get('tx') ?? 8), 0, Number(q.get('tz') ?? 22));
  const dist = Number(q.get('dist') ?? 205);
  const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 38));
  const pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 38));
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(target);
  sun.target.position.copy(target);
  scene.add(sun.target);

  // Sky gradient behind.
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 2.5, 0.0, 1.0); gl_FragColor = vec4(mix(vec3(0.95,0.84,0.66), vec3(0.55,0.72,0.88), t), 1.0); }`,
    }),
  );
  scene.add(sky);

  if (q.get('plain') === '1') {
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(smokeScene, camera);
  } else {
    const composer = new EffectComposer(renderer);
    composer.setSize(W, H);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, W, H);
    ao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.4, thickness: 2, scale: 1.2 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
    const smokePass = new RenderPass(smokeScene, camera);
    smokePass.clear = false;
    composer.addPass(smokePass);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.22, 0.6, 0.86));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    composer.render();
  }
  (window as unknown as { __conceptReady: boolean }).__conceptReady = true;
}

build();
