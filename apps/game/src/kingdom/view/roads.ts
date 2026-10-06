import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, place } from '../../engine/figures';
import { soft } from '../../engine/look';
import { tileToWorld, type MapData, type XZ } from '../sim/map';

/**
 * The royal roads drawn (Anachak Khmer, D92): a raised laterite causeway with darker
 * shoulders along each route, corbelled laterite bridges with naga balustrades where a road
 * crosses water (Spean Praptos is the model), and Jayavarman VII's rest houses with fire —
 * small laterite halls with a tower — beside the road (shown from his era, once explored).
 */

const LATERITE = 0xa8643c;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** One ribbon for every road (one draw call), skipping the bridge spans. */
export function roadGeometry(map: MapData, width: number): THREE.BufferGeometry {
  const lay = map.roads!;
  const T = map.tile;
  const half = (width * T) / 2 + 0.5;
  const pos: number[] = [];
  const col: number[] = [];
  const c0 = new THREE.Color(0xc08a58);
  const c1 = new THREE.Color(0x8c5a34);
  const onBridge = (x: number, z: number) => {
    const tx = Math.round(x);
    const tz = Math.round(z);
    return !!map.bridge?.[tz * map.size + tx];
  };
  for (const r of lay.routes) {
    const pts = r.line.filter((_, i) => i % 3 === 0 || i === r.line.length - 1);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (onBridge(a[0], a[1]) && onBridge(b[0], b[1])) continue;
      const [ax, az] = tileToWorld(map, a[0], a[1]);
      const [bx, bz] = tileToWorld(map, b[0], b[1]);
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const px = (-(bz - az) / len) * half;
      const pz = ((bx - ax) / len) * half;
      // Three strips: shoulder, crown, shoulder (darker edges, a paler worn middle).
      const lanes: Array<[number, number, THREE.Color, THREE.Color]> = [
        [-1, -0.45, c1, c0],
        [-0.45, 0.45, c0, c0],
        [0.45, 1, c0, c1],
      ];
      for (const [u0, u1, k0, k1] of lanes) {
        const y0 = 0.14 - Math.abs(u0) * 0.05;
        const y1 = 0.14 - Math.abs(u1) * 0.05;
        const q = [
          [ax + px * u0, y0, az + pz * u0, k0],
          [bx + px * u0, y0, bz + pz * u0, k0],
          [bx + px * u1, y1, bz + pz * u1, k1],
          [ax + px * u1, y1, az + pz * u1, k1],
        ] as const;
        for (const k of [0, 1, 2, 0, 2, 3]) {
          const v = q[k]!;
          pos.push(v[0], v[1], v[2]);
          col.push(v[3].r, v[3].g, v[3].b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A corbelled laterite bridge from a to b (tiles), deck at 0.9 m, naga rails, piers. */
export function bridgeGeometry(map: MapData, a: XZ, b: XZ, width: number): THREE.BufferGeometry {
  const T = map.tile;
  const [ax, az] = tileToWorld(map, a[0], a[1]);
  const [bx, bz] = tileToWorld(map, b[0], b[1]);
  const len = Math.hypot(bx - ax, bz - az) + T * 3;
  const w = width * T + 1;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(place(box(w, 0.5, len), [0, 0.75, 0]), LATERITE));
  // Piers with the narrow corbelled openings between them.
  const n = Math.max(2, Math.round(len / 1.8));
  for (let i = 0; i <= n; i++) {
    const z = -len / 2 + (i * len) / n;
    parts.push(part(place(box(w + 0.3, 1.6, 0.7), [0, -0.3, z]), 0x8e5232));
  }
  // Naga balustrades along both sides, a raised naga head at each end.
  for (const s of [-1, 1]) {
    parts.push(part(place(box(0.25, 0.3, len), [(s * w) / 2, 1.15, 0]), 0x9a6a46));
    for (const e of [-1, 1]) {
      parts.push(
        part(
          place(new THREE.ConeGeometry(0.35, 1.3, 7), [(s * w) / 2, 1.6, (e * len) / 2], [e * 0.35, 0, 0]),
          0x9a6a46,
        ),
      );
      parts.push(
        part(place(new THREE.SphereGeometry(0.3, 7, 5), [(s * w) / 2, 1.3, (e * len) / 2]), 0x9a6a46),
      );
    }
  }
  const g = mergeGeometries(parts)!;
  g.rotateY(Math.atan2(bx - ax, bz - az));
  g.translate((ax + bx) / 2, 0, (az + bz) / 2);
  return g;
}

/** A rest house with fire (vahnigṛha): a laterite hall, a tower at the east end, windows. */
export function restHouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(place(box(3.4, 0.4, 6.0), [0, 0.2, 0]), 0x8e5232)); // platform
  p.push(part(place(box(2.8, 2.0, 4.0), [0, 1.4, -0.6]), LATERITE)); // the long hall
  for (let i = 0; i < 3; i++) p.push(part(place(box(0.05, 0.6, 0.5), [1.42, 1.6, -1.8 + i * 1.2]), 0x2a1a12)); // windows
  // The tower over the shrine room, stepped.
  p.push(part(place(box(2.4, 2.6, 2.0), [0, 1.7, 2.0]), LATERITE));
  for (let i = 0; i < 4; i++) {
    const s = 2.2 - i * 0.45;
    p.push(part(place(box(s, 0.5, s * 0.85), [0, 3.25 + i * 0.5, 2.0]), 0x9c5c38));
  }
  p.push(part(place(new THREE.ConeGeometry(0.3, 0.7, 6), [0, 5.4, 2.0]), 0xb8784a));
  p.push(part(place(box(2.9, 0.25, 4.2), [0, 2.5, -0.6]), 0x7a4a2c)); // roof edge (the wooden roof is lost)
  // The fire: a small glow at the door.
  p.push(part(place(new THREE.ConeGeometry(0.22, 0.5, 6), [0.9, 0.65, -2.9]), 0xffa040));
  return mergeGeometries(p)!;
}

/** Where the fire burns in a rest house (its door, in the house's own frame). */
export const REST_FIRE: [number, number, number] = [0.9, 0.65, -2.9];

export class RoadView {
  readonly group = new THREE.Group();
  private readonly rests: THREE.InstancedMesh;
  /** The fires (PK): a flame, a glow round it and a pool of light on the ground, brighter at night. */
  private readonly flames: THREE.InstancedMesh;
  private readonly glows: THREE.InstancedMesh;
  private readonly pools: THREE.InstancedMesh;
  private readonly fireAt: XZ[] = [];
  /** The fires' brightness now (0..1+), for the tests. */
  glow = 0;
  private readonly bridges: Array<{ mesh: THREE.Mesh; tiles: XZ[] }> = [];
  private readonly m = new THREE.Matrix4();

  constructor(
    private readonly map: MapData,
    width: number,
  ) {
    const ribbon = new THREE.Mesh(roadGeometry(map, width), soft({ vertexColors: true, roughness: 1 }, 0));
    ribbon.receiveShadow = true;
    this.group.add(ribbon);
    const mat = soft({ vertexColors: true, roughness: 0.95 }, 0.05);
    for (const b of map.roads!.bridges.slice(0, 16)) {
      const mesh = new THREE.Mesh(bridgeGeometry(map, b.a, b.b, width), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      this.bridges.push({ mesh, tiles: [b.a, b.b] });
    }
    this.rests = new THREE.InstancedMesh(restHouseGeometry(), mat, Math.max(1, map.roads!.rests.length));
    this.rests.count = 0;
    this.rests.castShadow = true;
    this.rests.frustumCulled = false;
    this.group.add(this.rests);
    const n = Math.max(1, map.roads!.rests.length);
    const add = (geo: THREE.BufferGeometry, color: number, opacity: number, additive: boolean) => {
      const m = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: additive,
          opacity,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: !additive,
        }),
        n,
      );
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    };
    this.flames = add(new THREE.ConeGeometry(0.2, 0.7, 6).translate(0, 0.35, 0), 0xffb347, 1, false);
    this.glows = add(new THREE.SphereGeometry(1, 10, 8), 0xff8a30, 0.3, true);
    const pool = new THREE.CircleGeometry(1, 20);
    pool.rotateX(-Math.PI / 2);
    this.pools = add(pool, 0xff7a28, 0.3, true);
  }

  /**
   * The fires' light for this frame: `glow` 0 (out) .. 1 (full night); `radius` the pool of
   * light on the ground (m); t seconds (they flicker).
   */
  fire(glow: number, radius: number, t: number): void {
    this.glow = glow;
    const n = this.fireAt.length;
    for (const m of [this.flames, this.glows, this.pools]) m.count = glow > 0.01 ? n : 0;
    if (!n || glow <= 0.01) return;
    (this.glows.material as THREE.MeshBasicMaterial).opacity = 0.32 * glow;
    (this.pools.material as THREE.MeshBasicMaterial).opacity = 0.42 * glow;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const [x, z] = this.fireAt[i]!;
      const f = 1 + Math.sin(t * 9 + i * 1.7) * 0.12 + Math.sin(t * 23 + i) * 0.06;
      this.m.compose(p.set(x, REST_FIRE[1] - 0.2, z), q.identity(), s.set(f, f * (0.9 + glow * 0.3), f));
      this.flames.setMatrixAt(i, this.m);
      const g = (0.9 + glow * 0.9) * f;
      this.m.compose(p.set(x, REST_FIRE[1] + 0.4, z), q, s.set(g, g, g));
      this.glows.setMatrixAt(i, this.m);
      const r = radius * (0.92 + (f - 1) * 0.5);
      this.m.compose(p.set(x, 0.06, z), q, s.set(r, 1, r));
      this.pools.setMatrixAt(i, this.m);
    }
    for (const m of [this.flames, this.glows, this.pools]) m.instanceMatrix.needsUpdate = true;
  }

  /** Show what has been explored: bridges always, rest houses from their era. */
  sync(explored: Uint8Array, restsOn: boolean): void {
    const N = this.map.size;
    const seen = ([x, z]: XZ) => explored[Math.round(z) * N + Math.round(x)] === 1;
    for (const b of this.bridges) b.mesh.visible = b.tiles.some(seen);
    let n = 0;
    this.fireAt.length = 0;
    if (restsOn)
      for (const h of this.map.roads!.rests) {
        if (!seen([h.tx, h.tz])) continue;
        const [x, z] = tileToWorld(this.map, h.tx, h.tz);
        this.m.makeRotationY(h.heading).setPosition(x, 0, z);
        this.rests.setMatrixAt(n++, this.m);
        const c = Math.cos(h.heading);
        const sn = Math.sin(h.heading);
        this.fireAt.push([
          x + REST_FIRE[0] * c + REST_FIRE[2] * sn,
          z - REST_FIRE[0] * sn + REST_FIRE[2] * c,
        ]);
      }
    this.rests.count = n;
    this.rests.instanceMatrix.needsUpdate = true;
  }
}
