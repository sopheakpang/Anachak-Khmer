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

/**
 * A mossy laterite rock (PK 1.8.0 reference: a jungle clearing): a lumpy red-brown block,
 * pitted, with moss on its top. 1 m across; instance scale sizes it.
 */
export function mossyRockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  // A lumpy block: each corner pushed in or out by a hash of where it is (shared corners move together).
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.78 + 0.4 * hash(Math.round(x * 40), Math.round(z * 40), Math.round(y * 40) + 3);
    p.setXYZ(i, x * k * 1.25, Math.max(-0.12, y * k * 0.62) + 0.12, z * k);
  }
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col: number[] = [];
  const lat = new THREE.Color(0x8e4a2c);
  const pit = new THREE.Color(0x5e2e1c);
  const moss = new THREE.Color(0x4d6a26);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // One colour per face: laterite, darker pits, moss on the faces that look up.
    const up = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3;
    const h = hash(Math.round(p.getX(i) * 31), Math.round(p.getZ(i) * 31), 7);
    c.copy(lat).lerp(pit, h < 0.3 ? 0.6 : 0.1);
    if (up > 0.7 + 0.2 * h) c.lerp(moss, 0.7);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/**
 * A fallen palm frond lying on the ground (2.2 m): the midrib and its leaflets, dried to
 * straw and brown (the instance tint makes some still green).
 */
export function frondGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const rib = new THREE.Color(0x8a6a38);
  const leaf = new THREE.Color(0xb0904e);
  const tip = new THREE.Color(0x8e7440);
  const push = (a: number[], b: number[], d: number[], ca: THREE.Color, cd: THREE.Color) => {
    pos.push(...a, ...b, ...d);
    col.push(ca.r, ca.g, ca.b, ca.r, ca.g, ca.b, cd.r, cd.g, cd.b);
  };
  const L = 2.2;
  const lift = (z: number) => 0.03 + 0.06 * Math.sin((z / L) * Math.PI); // a gentle arch off the ground
  // Midrib: a thin strip along +z.
  push([-0.03, lift(0), 0], [0.03, lift(0), 0], [0, lift(L), L], rib, rib);
  // Leaflets: pairs along the rib, longest in the middle, angled toward the tip, drooping to the ground.
  const N = 14;
  for (let i = 1; i < N; i++) {
    const z = (i / N) * L;
    const len = 0.55 * Math.sin((i / N) * Math.PI) + 0.12;
    for (const side of [-1, 1]) {
      const ex = side * len;
      const ez = z + len * 0.55;
      const w = 0.035;
      push([0, lift(z), z - w], [0, lift(z), z + w], [ex, 0.015, ez], leaf, tip);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Lit from above (it lies flat), both faces alike.
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/** A creeping root, half sunk in the ground: a wavy tube 3 m long, thick at its tree end. */
export function rootGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector3(Math.sin(t * 7.0) * 0.22 + t * 0.3, 0.015 + 0.04 * Math.sin(t * 9.0) ** 2, t * 3));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 14, 0.09, 5, false);
  // Taper toward the far end.
  const p = tube.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getZ(i) / 3));
    const c = curve.getPointAt(t);
    const k = 1 - 0.65 * t;
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, p.getZ(i));
  }
  return mergeColoured([[tube, 0x6e5034]]);
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
  kind: 'clump' | 'flower' | 'pebble' | 'lotus' | 'rock' | 'frond' | 'root';
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
  caps: Pick<DetailCfg, 'tufts' | 'flowers' | 'pebbles' | 'lotus' | 'rocks' | 'fronds' | 'roots'>,
): Piece[] {
  const out: Piece[] = [];
  const n = { clump: 0, flower: 0, pebble: 0, lotus: 0, rock: 0, frond: 0, root: 0 };
  const cap = {
    clump: caps.tufts,
    flower: caps.flowers,
    pebble: caps.pebbles,
    lotus: caps.lotus,
    rock: caps.rocks,
    frond: caps.fronds,
    root: caps.roots,
  };
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
    // PK 1.8.0 (a jungle clearing): mossy laterite rocks, fallen palm fronds and creeping roots
    // on the forest floor and at its edge; a few rocks out on the open land and by the water.
    const edge =
      what === 'grass' && (at(tx + 1, tz) === 'forest' || at(tx - 1, tz) === 'forest' || at(tx, tz + 1) === 'forest' || at(tx, tz - 1) === 'forest');
    const rockP = what === 'forest' ? 0.045 : what === 'bank' ? 0.05 : edge ? 0.03 : what === 'soil' ? 0.012 : what === 'grass' ? 0.005 : 0;
    const frondP = what === 'forest' ? 0.1 : edge ? 0.07 : 0;
    const rootP = what === 'forest' ? 0.14 : 0;
    if (r(60) < rockP)
      put({ kind: 'rock', x: x0 + r(61) * tile, z: z0 + r(62) * tile, s: 0.4 + r(63) * r(63) * 0.9, rot: r(64) * 6.28 });
    if (r(65) < frondP)
      put({
        kind: 'frond',
        x: x0 + r(66) * tile,
        z: z0 + r(67) * tile,
        s: 0.7 + r(68) * 0.6,
        rot: r(69) * 6.28,
        tint: r(70) < 0.25 ? 0x9fb060 : 0xffffff,
      });
    if (r(71) < rootP)
      put({ kind: 'root', x: x0 + r(72) * tile, z: z0 + r(73) * tile, s: 0.7 + r(74) * 0.8, rot: r(75) * 6.28 });
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
      rock: new THREE.InstancedMesh(mossyRockGeometry(), lit, Math.max(1, cfg.rocks)),
      frond: new THREE.InstancedMesh(frondGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), Math.max(1, cfg.fronds)),
      root: new THREE.InstancedMesh(rootGeometry(), lit, Math.max(1, cfg.roots)),
    };
    for (const m of Object.values(this.meshes)) {
      m.count = 0;
      m.frustumCulled = false;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.meshes.pebble.castShadow = true;
    this.meshes.rock.castShadow = true;
    this.meshes.rock.userData.seeThrough = true;
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
    const count = { clump: 0, flower: 0, pebble: 0, lotus: 0, rock: 0, frond: 0, root: 0 };
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
