import * as THREE from 'three';

/**
 * The ground round the hero (PK's reference image 2: an anime forest floor). Tufts of grass
 * with dark roots and sunlit tips, bare earth patches, and leaves drifting down from the
 * canopy in the forest. Only near the hero, laid on a fixed world grid (so nothing slides as
 * he walks), re-laid when he crosses a cell. Three draw calls, about 40,000 triangles.
 */

export type GroundKind = 'grass' | 'forest' | 'bare' | 'none';
export type GroundAt = (x: number, z: number) => GroundKind;

const CELL = 1.0;
const SPAN = 26; // cells either side of the hero (about 26 m)
const LEAVES = 70;

function hash(x: number, z: number, k: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** One tuft: seven bent blades fanned round, dark at the root, light at the tip. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const root = new THREE.Color(0x4a8a30);
  const tip = new THREE.Color(0xc8ec7a);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i * 0.7;
    const lean = 0.12 + (i % 3) * 0.06;
    const h = 0.26 + (i % 3) * 0.08;
    const w = 0.07;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // A blade: two root corners and a tip leaning outward.
    // Both windings (seen from either side, both lit from above).
    pos.push(-cz * w, 0, cx * w, cz * w, 0, -cx * w, cx * lean, h, cz * lean);
    pos.push(cz * w, 0, -cx * w, -cz * w, 0, cx * w, cx * lean, h, cz * lean);
    for (let k = 0; k < 2; k++) col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Blades light from above, like grass in cel art (not by their thin faces).
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/**
 * Wind over the grass (PK 1.6.0, after his stylised-grass shader): gust bands roll across the
 * field as a sine wave in world space; a blade bends by the square of its height, so the
 * roots stay put and the sunlit tips sway.
 */
export const GRASS_WIND_GLSL = `
  #ifdef USE_INSTANCING
    vec3 wp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    vec3 wp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float gust = sin(dot(wp.xz, vec2(0.31, 0.22)) - uTime * 2.1) * 0.5 + 0.5;
  float flutter = sin(uTime * 7.0 + wp.x * 3.1 + wp.z * 2.3) * 0.25;
  float bend = position.y * position.y * 4.0 * uWind;
  transformed.x += (gust * 0.55 + flutter) * bend * 0.18;
  transformed.z += (gust * 0.35 + flutter * 0.6) * bend * 0.12;`;

export function grassWindMaterial(u: { uTime: { value: number }; uWind: { value: number } }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>${GRASS_WIND_GLSL}`);
  };
  m.customProgramCacheKey = () => 'grass-wind';
  return m;
}

export class GroundDetail {
  readonly group = new THREE.Group();
  private readonly grass: THREE.InstancedMesh;
  private readonly dirt: THREE.InstancedMesh;
  private readonly leaves: THREE.InstancedMesh;
  private readonly leafSeed: Float32Array;
  private cell = [NaN, NaN];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  /** How many tufts are laid now (for the tests). */
  tufts = 0;
  /** The wind on the grass (PK 1.6.0): time and strength, read by the shader. */
  readonly wind = { uTime: { value: 0 }, uWind: { value: 1 } };

  constructor() {
    const n = (SPAN * 2 + 1) ** 2;
    this.grass = new THREE.InstancedMesh(tuftGeometry(), grassWindMaterial(this.wind), n);
    const disc = new THREE.CircleGeometry(1, 9);
    disc.rotateX(-Math.PI / 2);
    this.dirt = new THREE.InstancedMesh(
      disc,
      new THREE.MeshLambertMaterial({
        color: 0x9c8058,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      Math.ceil(n * 0.07),
    );
    const leaf = new THREE.PlaneGeometry(0.16, 0.1);
    this.leaves = new THREE.InstancedMesh(
      leaf,
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      LEAVES,
    );
    const r = (i: number, k: number) => hash(i, k, 9);
    this.leafSeed = new Float32Array(LEAVES * 4);
    const tints = [0x9cc84a, 0xd8b440, 0x6fa63a, 0xc88a3a];
    for (let i = 0; i < LEAVES; i++) {
      this.leafSeed.set([r(i, 1) * 24 - 12, r(i, 2) * 24 - 12, r(i, 3) * 7, r(i, 4)], i * 4);
      this.leaves.setColorAt(i, new THREE.Color(tints[i % tints.length]!));
    }
    for (const o of [this.grass, this.dirt, this.leaves]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.grass.count = 0;
    this.dirt.count = 0;
    this.leaves.count = 0;
  }

  /** Lay the tufts and patches round (hx, hz) when the hero enters a new cell. */
  private lay(hx: number, hz: number, at: GroundAt): void {
    const cx = Math.round(hx / CELL);
    const cz = Math.round(hz / CELL);
    if (cx === this.cell[0] && cz === this.cell[1]) return;
    this.cell = [cx, cz];
    let g = 0;
    let d = 0;
    for (let i = -SPAN; i <= SPAN; i++)
      for (let j = -SPAN; j <= SPAN; j++) {
        const gx = cx + i;
        const gz = cz + j;
        const x = (gx + hash(gx, gz, 1) - 0.5) * CELL;
        const z = (gz + hash(gx, gz, 2) - 0.5) * CELL;
        const kind = at(x, z);
        if (kind === 'none') continue;
        const edge = Math.hypot(i, j) / SPAN;
        if (edge > 1) continue;
        const bare = kind === 'bare' || hash(gx, gz, 3) < (kind === 'forest' ? 0.06 : 0.012);
        if (bare && d < this.dirt.instanceMatrix.count) {
          const r = 0.6 + hash(gx, gz, 4) * 1.1;
          this.s.set(r * (1 + hash(gx, gz, 6) * 0.6), 1, r);
          this.q.setFromEuler(this.e.set(0, hash(gx, gz, 5) * 6.28, 0));
          this.m.compose(this.v.set(x, 0.03, z), this.q, this.s);
          this.dirt.setMatrixAt(d++, this.m);
          if (kind === 'bare') continue;
        }
        // Thinner toward the edge of the patch, so it never ends in a hard line.
        const k = (kind === 'forest' ? 1.25 : 1) * (0.55 + hash(gx, gz, 7) * 0.7) * (1 - edge * edge * 0.8);
        this.s.set(k, k * (0.8 + hash(gx, gz, 8) * 0.6), k);
        this.q.setFromEuler(this.e.set(0, hash(gx, gz, 9) * 6.28, 0));
        this.m.compose(this.v.set(x, 0, z), this.q, this.s);
        this.grass.setMatrixAt(g++, this.m);
      }
    this.grass.count = g;
    this.dirt.count = d;
    this.tufts = g;
    this.grass.instanceMatrix.needsUpdate = true;
    this.dirt.instanceMatrix.needsUpdate = true;
  }

  /** Each frame: lay the ground if needed; leaves fall and spin where there are trees. */
  update(hx: number, hz: number, t: number, at: GroundAt): void {
    this.lay(hx, hz, at);
    this.wind.uTime.value = t;
    const inForest = at(hx, hz) === 'forest' || at(hx + 6, hz) === 'forest' || at(hx, hz + 6) === 'forest';
    this.leaves.count = inForest ? LEAVES : Math.floor(LEAVES / 5);
    for (let i = 0; i < this.leaves.count; i++) {
      const o = i * 4;
      const fall = 7 - ((this.leafSeed[o + 2]! + t * (0.5 + this.leafSeed[o + 3]! * 0.4)) % 7);
      const sway = Math.sin(t * 1.7 + i) * 0.6;
      const wx = Math.floor((hx - this.leafSeed[o]!) / 24 + 0.5) * 24 + this.leafSeed[o]!;
      const wz = Math.floor((hz - this.leafSeed[o + 1]!) / 24 + 0.5) * 24 + this.leafSeed[o + 1]!;
      this.q.setFromEuler(this.e.set(t * 2 + i, t * 1.3 + i * 2, Math.sin(t + i)));
      this.m.compose(
        this.v.set(wx + sway, Math.max(0.05, fall), wz + sway * 0.5),
        this.q,
        this.s.set(1, 1, 1),
      );
      this.leaves.setMatrixAt(i, this.m);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  /** Forget the laid cell (a new world, or back into hero mode). */
  reset(): void {
    this.cell = [NaN, NaN];
  }

  dispose(): void {
    for (const o of [this.grass, this.dirt, this.leaves]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
