/**
 * Ground detail for the diorama (PK 1.7.0: "more details: floor ground, grass…"): clumps of
 * tall grass, wild flowers and pebbles on open land and under the forest, lotus pads on the
 * still water by the banks. Only near the camera, on a fixed world grid (so nothing slides
 * as the view moves), re-laid when the view moves on. Four draw calls; the counts are in
 * config/kingdom/diorama.json → detail.
 */
import * as THREE from 'three';
import type { Diorama } from '@temples/shared';
import { grassWindMaterial } from '../hero/ground';

export type DetailCfg = Diorama['detail'];

/** What lies on a tile, as the detail layer sees it. */
export type Patch = 'grass' | 'forest' | 'soil' | 'bank' | 'water' | 'none';

export function hash(x: number, z: number, k: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A clump of grass: nine bent blades, green at the root, sunlit at the tip (about 0.5 m). */
export function clumpGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const root = new THREE.Color(0x6aa846);
  const tip = new THREE.Color(0xe9f2a4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i * 0.9;
    const lean = 0.16 + (i % 3) * 0.08;
    const h = 0.42 + (i % 4) * 0.08;
    const w = 0.12;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const ox = cx * 0.12;
    const oz = cz * 0.12;
    pos.push(ox - cz * w, 0, oz + cx * w, ox + cz * w, 0, oz - cx * w, ox + cx * lean, h, oz + cz * lean);
    pos.push(ox + cz * w, 0, oz - cx * w, ox - cz * w, 0, oz + cx * w, ox + cx * lean, h, oz + cz * lean);
    for (let k = 0; k < 2; k++) col.push(root.r, root.g, root.b, root.r, root.g, root.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Lit from above like painted grass (not by the thin blades' faces).
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

/** A small flower: a stem and a cross of petals (white; the instance colour paints it). */
export function flowerGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.45, 3).translate(0, 0.225, 0);
  const petals = new THREE.OctahedronGeometry(0.11, 0).scale(1, 0.45, 1).translate(0, 0.47, 0);
  const g = mergeColoured([
    [stem, 0x4f8a34],
    [petals, 0xffffff],
  ]);
  return g;
}

/** A pebble: a squashed low-poly stone, sitting in the ground. */
export function pebbleGeometry(): THREE.BufferGeometry {
  return mergeColoured([[new THREE.IcosahedronGeometry(0.22, 0).scale(1.3, 0.55, 1).translate(0, 0.04, 0), 0x9e9a8c]]);
}

/** A lotus pad with its notch, and on some a pink bud (the bud is white; tint by instance). */
export function lotusGeometry(): THREE.BufferGeometry {
  const pad = new THREE.CircleGeometry(0.42, 10, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  const pad2 = new THREE.CircleGeometry(0.28, 9, 2.2, Math.PI * 2 - 0.35)
    .rotateX(-Math.PI / 2)
    .translate(0.55, 0.025, 0.25);
  const bud = new THREE.ConeGeometry(0.09, 0.26, 5).translate(-0.15, 0.2, 0.3);
  return mergeColoured([
    [pad, 0x3f8a3c],
    [pad2, 0x4c9a44],
    [bud, 0xf2a7c3],
  ]);
}

/** Merge geometries, each painted one vertex colour. */
function mergeColoured(parts: Array<[THREE.BufferGeometry, number]>): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    c.set(hex);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const FLOWER_TINTS = [0xffffff, 0xf6d24a, 0xe86a8a, 0xb88ee8, 0xf29a4a];

/** One piece of detail to lay: which mesh, where, how big, which way, what tint. */
export interface Piece {
  kind: 'clump' | 'flower' | 'pebble' | 'lotus';
  x: number;
  z: number;
  s: number;
  rot: number;
  tint?: number;
}

/**
 * Where the detail goes round (cx, cz) within `radius` m: a few pieces per tile, picked by a
 * hash of the tile so the same ground always grows the same grass. `at` tells what a tile is.
 */
export function layDetail(
  cx: number,
  cz: number,
  radius: number,
  tile: number,
  half: number,
  at: (tx: number, tz: number) => Patch,
  caps: Pick<DetailCfg, 'tufts' | 'flowers' | 'pebbles' | 'lotus'>,
): Piece[] {
  const out: Piece[] = [];
  const n = { clump: 0, flower: 0, pebble: 0, lotus: 0 };
  const cap = { clump: caps.tufts, flower: caps.flowers, pebble: caps.pebbles, lotus: caps.lotus };
  const t0x = Math.floor((cx - radius + half) / tile);
  const t1x = Math.ceil((cx + radius + half) / tile);
  const t0z = Math.floor((cz - radius + half) / tile);
  const t1z = Math.ceil((cz + radius + half) / tile);
  // Nearest tiles first, so the caps cut the far edge, not a random hole.
  const tiles: Array<[number, number, number]> = [];
  for (let tz = t0z; tz <= t1z; tz++)
    for (let tx = t0x; tx <= t1x; tx++) {
      const wx = (tx + 0.5) * tile - half;
      const wz = (tz + 0.5) * tile - half;
      const d = Math.hypot(wx - cx, wz - cz);
      if (d <= radius) tiles.push([d, tx, tz]);
    }
  tiles.sort((a, b) => a[0] - b[0]);
  const put = (p: Piece) => {
    if (n[p.kind] < cap[p.kind]) {
      n[p.kind]++;
      out.push(p);
    }
  };
  for (const [, tx, tz] of tiles) {
    const what = at(tx, tz);
    if (what === 'none') continue;
    const x0 = tx * tile - half;
    const z0 = tz * tile - half;
    const r = (k: number) => hash(tx, tz, k);
    if (what === 'water') {
      if (r(1) < 0.12) put({ kind: 'lotus', x: x0 + r(2) * tile, z: z0 + r(3) * tile, s: 0.8 + r(4) * 0.8, rot: r(5) * 6.28 });
      continue;
    }
    if (what === 'bank') {
      if (r(1) < 0.45)
        put({ kind: 'lotus', x: x0 + r(2) * tile, z: z0 + r(3) * tile, s: 0.7 + r(4) * 0.7, rot: r(5) * 6.28 });
      // Reeds along the water's edge.
      if (r(21) < 0.35) put({ kind: 'clump', x: x0 + r(22) * tile, z: z0 + r(23) * tile, s: 1.2 + r(24) * 0.6, rot: r(25) * 6.28 });
      continue;
    }
    if (what === 'soil') {
      // Bare earth: a few stones kicked up by feet and carts.
      if (r(14) < 0.18)
        put({ kind: 'pebble', x: x0 + r(15) * tile, z: z0 + r(16) * tile, s: 0.5 + r(17) * 1.0, rot: r(18) * 6.28 });
      continue;
    }
    // The open meadow is the ground's own lawn (PK 1.7.0: no scattered tufts). Undergrowth
    // grows only under the trees.
    if (what === 'forest') {
      const clumps = r(6) < 0.55 ? 1 + Math.floor(r(19) * 2) : 0;
      for (let i = 0; i < clumps; i++)
        put({
          kind: 'clump',
          x: x0 + r(10 + i) * tile,
          z: z0 + r(20 + i) * tile,
          s: 0.9 + r(30 + i) * 0.7,
          rot: r(40 + i) * 6.28,
        });
    }
    // A few wild flowers in the grass.
    if (what === 'grass' && r(7) < 0.05)
      put({
        kind: 'flower',
        x: x0 + r(8) * tile,
        z: z0 + r(9) * tile,
        s: 0.8 + r(11) * 0.5,
        rot: r(12) * 6.28,
        tint: FLOWER_TINTS[Math.floor(r(13) * FLOWER_TINTS.length)]!,
      });
    if (r(14) < (what === 'forest' ? 0.1 : 0.008))
      put({ kind: 'pebble', x: x0 + r(15) * tile, z: z0 + r(16) * tile, s: 0.6 + r(17) * 1.2, rot: r(18) * 6.28 });
  }
  return out;
}

/** The detail meshes in one scene, re-laid as the view moves. */
export class GroundDetailRts {
  readonly group = new THREE.Group();
  readonly wind = { uTime: { value: 0 }, uWind: { value: 1 } };
  private readonly meshes: Record<Piece['kind'], THREE.InstancedMesh>;
  private at: [number, number, number] = [NaN, NaN, 0];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly c = new THREE.Color();
  /** How many pieces are laid now (for the tests). */
  laid = 0;

  constructor(readonly cfg: DetailCfg) {
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = {
      clump: new THREE.InstancedMesh(clumpGeometry(), grassWindMaterial(this.wind), Math.max(1, cfg.tufts)),
      flower: new THREE.InstancedMesh(flowerGeometry(), lit, Math.max(1, cfg.flowers)),
      pebble: new THREE.InstancedMesh(pebbleGeometry(), lit, Math.max(1, cfg.pebbles)),
      lotus: new THREE.InstancedMesh(lotusGeometry(), lit, Math.max(1, cfg.lotus)),
    };
    for (const m of Object.values(this.meshes)) {
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.meshes.pebble.castShadow = true;
  }

  /**
   * Lay the detail round the view (cx, cz) for a view of `dist` m when it has moved on by a
   * quarter of the radius (or the land changed: `force`).
   */
  update(
    cx: number,
    cz: number,
    dist: number,
    t: number,
    tile: number,
    half: number,
    at: (tx: number, tz: number) => Patch,
    force = false,
  ): void {
    this.wind.uTime.value = t;
    const radius = Math.max(30, dist * this.cfg.reach);
    const [ax, az, ar] = this.at;
    if (!force && Math.hypot(cx - ax, cz - az) < radius * 0.25 && Math.abs(radius - ar) < ar * 0.3) return;
    this.at = [cx, cz, radius];
    const pieces = layDetail(cx, cz, radius, tile, half, at, this.cfg);
    const count = { clump: 0, flower: 0, pebble: 0, lotus: 0 };
    for (const p of pieces) {
      const mesh = this.meshes[p.kind];
      const i = count[p.kind]++;
      this.q.setFromEuler(this.e.set(0, p.rot, 0));
      this.m.compose(this.v.set(p.x, p.kind === 'lotus' ? -0.1 : 0, p.z), this.q, this.sc.setScalar(p.s));
      mesh.setMatrixAt(i, this.m);
      if (p.tint !== undefined) mesh.setColorAt(i, this.c.set(p.tint));
    }
    for (const k of Object.keys(this.meshes) as Array<Piece['kind']>) {
      const mesh = this.meshes[k];
      mesh.count = count[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.laid = pieces.length;
  }
}
