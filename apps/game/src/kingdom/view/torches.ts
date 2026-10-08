/**
 * Torches at night (PK 1.8.0: ពេលយប់ដុតគប់ភ្លើង ដើម្បីបំភ្លឺ): a torch burns by the door of every
 * house, torches stand round the work places (the hall, storehouses, camps, the landing, the
 * market, the barracks, the temple site), people out after dark carry one, and a torch is
 * planted by people still at work in the open. Each torch is a flame, a glow and a pool of
 * warm light on the ground; the nearest few also give real light (config/quality.json
 * kingdom.torchLights) so walls and people nearby are lit. Numbers: anachak.json → night.torches.
 */
import * as THREE from 'three';
import type { KingdomData } from '@temples/shared';
import { hash } from './detail';

export type TorchCfg = KingdomData['anachak']['night']['torches'];

/** A building as the torches see it: centre, size (m), which way its door faces. */
export interface TorchSite {
  type: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
  /** Rotation about y (radians): 0 = door to +z, π/2 = door to +x (east). */
  facing: number;
}

/** Where the standing torches go (x, z pairs): one by each house door, a ring round work places. */
export function torchSpots(sites: Iterable<TorchSite>, cfg: Pick<TorchCfg, 'houses' | 'work'>): number[] {
  const out: number[] = [];
  for (const b of sites) {
    if (cfg.houses.includes(b.type)) {
      // Beside the door, a step out (the door is on the side the house faces).
      const f = b.d / 2 + 0.9;
      const s = 0.9;
      const fx = Math.sin(b.facing);
      const fz = Math.cos(b.facing);
      out.push(b.cx + fx * f + fz * s, b.cz + fz * f - fx * s);
      continue;
    }
    const n = cfg.work[b.type] ?? 0;
    if (!n) continue;
    // Round the footprint, a little outside it: corners first, then the middles of the sides.
    const hw = b.w / 2 + 0.8;
    const hd = b.d / 2 + 0.8;
    const ring: Array<[number, number]> = [
      [hw, hd],
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, 0],
      [-hw, 0],
      [0, hd],
      [0, -hd],
    ];
    for (let i = 0; i < Math.min(n, ring.length); i++) out.push(b.cx + ring[i]![0], b.cz + ring[i]![1]);
  }
  return out;
}

/** The flame's flicker (scale) for torch i at time t: never still, never in step. */
export function flicker(i: number, t: number): number {
  const p = hash(i, 3, 9) * 20;
  return 0.85 + 0.1 * Math.sin(t * 9.1 + p) + 0.06 * Math.sin(t * 23.7 + p * 1.7);
}

/** A torch post: a bamboo pole, a wrapped head soaked in resin. 2 m; the flame sits on top. */
export function torchPostGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.035, 0.045, 1.9, 5).translate(0, 0.95, 0).toNonIndexed();
  const head = new THREE.CylinderGeometry(0.075, 0.06, 0.24, 6).translate(0, 1.98, 0).toNonIndexed();
  const col: number[] = [];
  const c1 = new THREE.Color(0x8a6a3c);
  const c2 = new THREE.Color(0x3a2a1c);
  for (let i = 0; i < pole.getAttribute('position').count; i++) col.push(c1.r, c1.g, c1.b);
  for (let i = 0; i < head.getAttribute('position').count; i++) col.push(c2.r, c2.g, c2.b);
  const g = new THREE.BufferGeometry();
  const P = [...(pole.getAttribute('position').array as Float32Array), ...(head.getAttribute('position').array as Float32Array)];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A soft round falloff (white middle → clear edge): the glow and the pool of light. */
export function falloffTexture(size = 64): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = Math.max(0, 1 - r);
      const v = Math.round(255 * a * a * (0.6 + 0.4 * a));
      d.set([v, v, v, 255], (y * size + x) * 4);
    }
  const tex = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Height of a post's flame (m). */
export const POST_FLAME = 2.12;

export class TorchView {
  readonly group = new THREE.Group();
  readonly lights: THREE.PointLight[] = [];
  private readonly posts: THREE.InstancedMesh;
  private readonly flames: THREE.InstancedMesh;
  private readonly glows: THREE.InstancedMesh;
  private readonly pools: THREE.InstancedMesh;
  private spots: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  /** Flames drawn this frame (for the tests). */
  lit = 0;

  constructor(
    readonly cfg: TorchCfg,
    lights: number,
    postMaterial: THREE.Material,
  ) {
    const cap = cfg.max;
    this.posts = new THREE.InstancedMesh(torchPostGeometry(), postMaterial, cap);
    this.posts.castShadow = true;
    const add = (geo: THREE.BufferGeometry, color: string, opacity: number, additive: boolean, map?: THREE.Texture) => {
      const m = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          map: map ?? null,
          transparent: additive,
          opacity,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: !additive,
          toneMapped: false,
          fog: false,
        }),
        cap,
      );
      return m;
    };
    this.flames = add(new THREE.ConeGeometry(0.11, 0.42, 6).translate(0, 0.21, 0), this.cfg.flame, 1, false);
    const soft = falloffTexture();
    this.glows = add(new THREE.PlaneGeometry(2, 2), this.cfg.glow, 0.3, true, soft);
    const pool = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.pools = add(pool, this.cfg.glow, 0.3, true, soft);
    for (const m of [this.posts, this.flames, this.glows, this.pools]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.pools.renderOrder = 4;
    for (let i = 0; i < lights; i++) {
      const L = new THREE.PointLight(new THREE.Color(cfg.light), 0, cfg.lightRange, 2);
      L.castShadow = false;
      this.lights.push(L);
      this.group.add(L);
    }
  }

  /** The standing torches (x, z pairs) from `torchSpots`. */
  setSpots(spots: number[]): void {
    this.spots = spots;
    const n = Math.min(this.cfg.max, spots.length / 2);
    for (let i = 0; i < n; i++) {
      this.m.makeRotationY(hash(i, 1, 4) * 6.28);
      this.m.setPosition(spots[i * 2]!, 0, spots[i * 2 + 1]!);
      this.posts.setMatrixAt(i, this.m);
    }
    this.posts.count = n;
    this.posts.instanceMatrix.needsUpdate = true;
  }

  /**
   * Per frame. `glow` 0 (day: out) .. 1 (night). The view centre and radius (m) pick the torches
   * to light. `planted` are extra posts by people at work (x, z pairs, drawn with a post), and
   * `carried` the flames in people's hands (x, y, z triples).
   */
  update(
    glow: number,
    t: number,
    camQ: THREE.Quaternion,
    cx: number,
    cz: number,
    radius: number,
    planted: ArrayLike<number>,
    carried: ArrayLike<number>,
  ): void {
    const fixed = Math.min(this.cfg.max, this.spots.length / 2);
    // The planted posts are drawn after the fixed ones.
    let np = fixed;
    for (let i = 0; i + 1 < planted.length && np < this.cfg.max; i += 2) {
      this.m.makeRotationY(hash(i, 2, 4) * 6.28);
      this.m.setPosition(planted[i]!, 0, planted[i + 1]!);
      this.posts.setMatrixAt(np++, this.m);
    }
    this.posts.count = glow > 0.05 ? np : fixed;
    this.posts.instanceMatrix.needsUpdate = true;
    let n = 0;
    const near: Array<[number, number, number, number]> = [];
    const flame = (x: number, y: number, z: number, i: number) => {
      if (n >= this.cfg.max) return;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz > radius * radius) return;
      const f = flicker(i, t);
      this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(f, f * (0.9 + 0.25 * f), f));
      this.flames.setMatrixAt(n, this.m);
      const g = this.cfg.glowSize * f;
      this.m.compose(this.v.set(x, y + 0.15, z), camQ, this.s.set(g, g, g));
      this.glows.setMatrixAt(n, this.m);
      const p = this.cfg.pool * (0.95 + 0.05 * f);
      this.m.compose(this.v.set(x, 0.06, z), this.q, this.s.set(p, 1, p));
      this.pools.setMatrixAt(n, this.m);
      near.push([dx * dx + dz * dz, x, y, z]);
      n++;
    };
    if (glow > 0.05) {
      for (let i = 0; i < np; i++) {
        this.posts.getMatrixAt(i, this.m);
        this.v.setFromMatrixPosition(this.m);
        flame(this.v.x, POST_FLAME, this.v.z, i);
      }
      for (let i = 0; i + 2 < carried.length; i += 3) flame(carried[i]!, carried[i + 1]!, carried[i + 2]!, 1000 + i);
    }
    this.lit = n;
    for (const m of [this.flames, this.glows, this.pools]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    (this.glows.material as THREE.MeshBasicMaterial).opacity = 0.55 * glow;
    (this.pools.material as THREE.MeshBasicMaterial).opacity = 0.5 * glow;
    // The real lights go to the torches nearest the middle of the view.
    near.sort((a, b) => a[0] - b[0]);
    this.lights.forEach((L, i) => {
      const s = near[i];
      L.intensity = s ? this.cfg.lightIntensity * glow * flicker(i + 50, t) : 0;
      if (s) L.position.set(s[1], s[2] + 0.4, s[3]);
    });
  }
}
