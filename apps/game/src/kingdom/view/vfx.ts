import * as THREE from 'three';

/**
 * Small particle bursts in the Kingdom tab: wood chips, stone dust, sparks, splashes, smoke,
 * a pale dust ring for hits (kept non-graphic for the stream), leaves and gold glints.
 * One THREE.Points draw call; the CPU ages a fixed ring buffer (the oldest particle is reused
 * when full), the shader draws soft round sprites sized by distance.
 */

export type BurstKind = 'chips' | 'dust' | 'sparks' | 'splash' | 'smoke' | 'hit' | 'leaves' | 'gold';

export const BURST_KINDS: readonly BurstKind[] = [
  'chips',
  'dust',
  'sparks',
  'splash',
  'smoke',
  'hit',
  'leaves',
  'gold',
];

interface Recipe {
  n: number;
  colors: number[];
  /** Upward speed range (m/s). */
  up: [number, number];
  /** Sideways speed range (m/s). */
  out: [number, number];
  /** Start spread radius (m). */
  spread: number;
  /** Vertical acceleration (m/s², negative falls). */
  gravity: number;
  /** Velocity damping per second. */
  drag: number;
  life: [number, number];
  /** Size in metres at birth and death. */
  size: [number, number];
  alpha: number;
  /** 0 soft puff, 1 solid disc, 2 star glint. */
  shape: number;
  /** Sideways flutter (m/s) for leaves. */
  flutter?: number;
  /** Launch flat in a ring (hit) instead of a cone. */
  ring?: boolean;
}

const RECIPES: Record<BurstKind, Recipe> = {
  chips: {
    n: 10,
    colors: [0x8a5a2b, 0xa8733d, 0xc9955a, 0x6e4a2c],
    up: [2.5, 4.5],
    out: [1, 2.6],
    spread: 0.2,
    gravity: -13,
    drag: 0.5,
    life: [0.6, 0.9],
    size: [0.36, 0.28],
    alpha: 1,
    shape: 1,
  },
  dust: {
    n: 12,
    colors: [0xc9bda2, 0xb3a78c, 0xd8ccb2],
    up: [0.8, 1.8],
    out: [0.6, 1.4],
    spread: 0.4,
    gravity: 0.4,
    drag: 2.2,
    life: [0.9, 1.4],
    size: [0.9, 2.4],
    alpha: 0.5,
    shape: 0,
  },
  sparks: {
    n: 12,
    colors: [0xfff4c2, 0xffe08a, 0xffffff],
    up: [2.5, 5],
    out: [3, 6],
    spread: 0.05,
    gravity: -12,
    drag: 1.5,
    life: [0.2, 0.4],
    size: [0.26, 0.1],
    alpha: 1,
    shape: 1,
  },
  splash: {
    n: 12,
    colors: [0xb8def5, 0x9cc9e8, 0xe6f4ff],
    up: [2.8, 4.6],
    out: [0.8, 1.8],
    spread: 0.3,
    gravity: -14,
    drag: 0.4,
    life: [0.5, 0.75],
    size: [0.34, 0.2],
    alpha: 0.9,
    shape: 1,
  },
  smoke: {
    n: 16,
    colors: [0xa39d92, 0x8f8a80, 0xbab3a6],
    up: [0.7, 1.4],
    out: [0.3, 0.9],
    spread: 1.4,
    gravity: 0.25,
    drag: 0.9,
    life: [1.8, 2.8],
    size: [1.6, 4.2],
    alpha: 0.42,
    shape: 0,
  },
  hit: {
    n: 12,
    colors: [0xeee2c6, 0xdcd0b4],
    up: [0.2, 0.5],
    out: [2.4, 3],
    spread: 0.1,
    gravity: 0,
    drag: 3.5,
    life: [0.45, 0.6],
    size: [0.6, 1.5],
    alpha: 0.6,
    shape: 0,
    ring: true,
  },
  leaves: {
    n: 10,
    colors: [0x5f8f3a, 0x7aa347, 0xa7a04a, 0x4c7a30],
    up: [1.5, 2.8],
    out: [0.8, 1.8],
    spread: 0.8,
    gravity: -2.2,
    drag: 1.6,
    life: [1.5, 2.2],
    size: [0.5, 0.42],
    alpha: 1,
    shape: 1,
    flutter: 2.2,
  },
  gold: {
    n: 10,
    colors: [0xffd54a, 0xfff0a0, 0xffc21a],
    up: [1.5, 3.2],
    out: [0.6, 1.4],
    spread: 0.3,
    gravity: -6,
    drag: 0.8,
    life: [0.7, 1.1],
    size: [0.6, 0.22],
    alpha: 1,
    shape: 2,
  },
};

const VERTEX = /* glsl */ `
  uniform float uScale;
  attribute vec3 color;
  attribute float size;
  attribute float alpha;
  attribute float shape;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vShape = shape;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = alpha > 0.0 ? size * uScale / max(1.0, -mv.z) : 0.0;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float a;
    vec3 col = vColor;
    if (vShape < 0.5) {
      a = smoothstep(0.5, 0.1, r);                 // soft puff
    } else if (vShape < 1.5) {
      a = smoothstep(0.5, 0.38, r);                // solid disc
      col *= 1.0 - 0.25 * smoothstep(0.1, 0.45, length(c - vec2(-0.1, -0.1)));
    } else {
      float star = max(smoothstep(0.1, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)),
                       smoothstep(0.1, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x)));
      a = max(star, smoothstep(0.22, 0.05, r));    // four-point glint
      col = mix(col, vec3(1.0), smoothstep(0.15, 0.0, r));
    }
    if (a * vAlpha < 0.01) discard;
    gl_FragColor = vec4(col, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

export class Particles {
  readonly mesh: THREE.Points;
  readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly shape: Float32Array;
  private readonly vel: Float32Array;
  /** Per particle: age, life, size0, size1, alpha0, gravity, drag, flutter, seed. */
  private readonly prop: Float32Array;
  private static readonly P = 9;
  private head = 0;
  private live = 0;
  private readonly uniforms = { uScale: { value: 1500 } };
  private readonly tmp = new THREE.Color();

  constructor(capacity = 600) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.shape = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.prop = new Float32Array(capacity * Particles.P);
    const g = new THREE.BufferGeometry();
    const attr = (name: string, a: Float32Array, n: number) => {
      const b = new THREE.BufferAttribute(a, n);
      b.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, b);
    };
    attr('position', this.pos, 3);
    attr('color', this.col, 3);
    attr('size', this.size, 1);
    attr('alpha', this.alpha, 1);
    attr('shape', this.shape, 1);
    this.mesh = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  /** Particles alive now. */
  get alive(): number {
    return this.live;
  }

  /** Match sprite sizes to the view: viewport height in pixels and vertical fov in degrees. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.uniforms.uScale.value = heightPx / 2 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  }

  /** Throw a burst of `kind` at (x, y, z); n overrides the recipe's count. */
  burst(kind: BurstKind, x: number, y: number, z: number, n?: number): void {
    const r = RECIPES[kind];
    const count = Math.min(this.capacity, Math.max(0, Math.floor(n ?? r.n)));
    const P = Particles.P;
    for (let k = 0; k < count; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.capacity;
      if (this.alpha[i]! <= 0) this.live++;
      const ang = r.ring ? (k / count) * Math.PI * 2 + Math.random() * 0.3 : Math.random() * Math.PI * 2;
      const sp = rand(r.out);
      const off = r.ring ? 0 : Math.random() * r.spread;
      this.pos[i * 3] = x + Math.cos(ang) * (r.ring ? r.spread : off);
      this.pos[i * 3 + 1] = y + (r.ring ? 0.1 : Math.random() * r.spread * 0.3);
      this.pos[i * 3 + 2] = z + Math.sin(ang) * (r.ring ? r.spread : off);
      this.vel[i * 3] = Math.cos(ang) * sp;
      this.vel[i * 3 + 1] = rand(r.up);
      this.vel[i * 3 + 2] = Math.sin(ang) * sp;
      this.tmp.setHex(r.colors[Math.floor(Math.random() * r.colors.length)]!);
      this.col[i * 3] = this.tmp.r;
      this.col[i * 3 + 1] = this.tmp.g;
      this.col[i * 3 + 2] = this.tmp.b;
      const p = i * P;
      this.prop[p] = 0;
      this.prop[p + 1] = rand(r.life);
      this.prop[p + 2] = r.size[0] * (0.8 + Math.random() * 0.4);
      this.prop[p + 3] = r.size[1] * (0.8 + Math.random() * 0.4);
      this.prop[p + 4] = r.alpha;
      this.prop[p + 5] = r.gravity;
      this.prop[p + 6] = r.drag;
      this.prop[p + 7] = r.flutter ?? 0;
      this.prop[p + 8] = Math.random() * 100;
      this.size[i] = this.prop[p + 2]!;
      this.alpha[i] = r.alpha;
      this.shape[i] = r.shape;
    }
    if (count > 0) {
      this.mesh.visible = true;
      this.markDirty();
    }
  }

  /** Move and age every particle by dt seconds; dead ones become invisible and free. */
  update(dt: number): void {
    if (this.live === 0) {
      this.mesh.visible = false;
      return;
    }
    const P = Particles.P;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.alpha[i]! <= 0) continue;
      const p = i * P;
      const age = (this.prop[p] = this.prop[p]! + dt);
      const life = this.prop[p + 1]!;
      if (age >= life) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      live++;
      const k = age / life;
      const damp = Math.max(0, 1 - this.prop[p + 6]! * dt);
      const v = i * 3;
      this.vel[v] = this.vel[v]! * damp;
      this.vel[v + 1] = this.vel[v + 1]! * damp + this.prop[p + 5]! * dt;
      this.vel[v + 2] = this.vel[v + 2]! * damp;
      const fl = this.prop[p + 7]!;
      const wob = fl > 0 ? Math.sin(age * 7 + this.prop[p + 8]!) * fl : 0;
      this.pos[v] = this.pos[v]! + (this.vel[v]! + wob) * dt;
      this.pos[v + 1] = Math.max(0.03, this.pos[v + 1]! + this.vel[v + 1]! * dt);
      this.pos[v + 2] = this.pos[v + 2]! + (this.vel[v + 2]! + wob * 0.5) * dt;
      this.size[i] = this.prop[p + 2]! + (this.prop[p + 3]! - this.prop[p + 2]!) * k;
      // Quick fade in, fade out over the last 40 %.
      const fade = Math.min(1, age / 0.05) * Math.min(1, (1 - k) / 0.4);
      this.alpha[i] = Math.max(1e-4, this.prop[p + 4]! * fade);
    }
    this.live = live;
    this.markDirty();
  }

  private markDirty(): void {
    const g = this.mesh.geometry;
    for (const n of ['position', 'color', 'size', 'alpha', 'shape'])
      (g.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }
}

function rand([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}
