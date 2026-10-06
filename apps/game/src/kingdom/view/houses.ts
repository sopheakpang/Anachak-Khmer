import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIMB, part, place, taperedTube } from '../../engine/figures';
import { seg as lpSeg } from '../../engine/look';

/**
 * Traditional Khmer wooden houses for the Kingdom tab, built in code in the low-poly style,
 * after PK's reference poster series of Khmer house types (dark vertical-plank walls on tall
 * round posts over stone footings, orange-red clay tile roofs with white lime ridge lines,
 * horn-like kbach finials at the ridge ends, a steep wooden stair, small shuttered windows).
 *
 * No wooden house of the Angkorian period survives: timber rots within a few generations in
 * this climate, and the reliefs of the Bayon and Angkor Wat only show roofs and posts in
 * outline. These models are therefore reconstructions from the later (17th–20th century)
 * vernacular tradition and PK's reference, not archaeology.
 *
 * Like art.ts: buildings are centred on their footprint (tiles × 2 m), stand on y = 0 and put
 * the door side at +z (the scene turns houses to face east). Parts marked CLOTH take the team
 * colour, so one model serves both sides.
 */

type Limb = [number, number, number, number, number?];
type V = [number, number, number];
const CLOTH: Limb = [0, 0, LIMB.body, 1];

const C = {
  tile: 0x9a4a32,
  tileLight: 0xb85a3a,
  lime: 0xf1ebdc,
  /** Roofs by rank (Zhou Daguan, 1296; PK's research): commoners thatch, officials yellow clay tiles. */
  thatch: 0xc4a058,
  thatchCourse: 0x9f7f3e,
  thatchRidge: 0x8a6c34,
  yellowTile: 0xd2a03c,
  yellowTileLight: 0xe2b452,
  yellowCourse: 0xb0822a,
  wall: 0x4a2e1e,
  batten: 0x6b4630,
  floor: 0x3a2618,
  post: 0x2e2018,
  footing: 0xb9ab8a,
  slab: 0xa4553c,
  opening: 0x1e140e,
  shutter: 0x7a5236,
  board: 0x6b4a30,
  ray: 0xd9b98a,
  stair: 0x5a3a24,
  gold: 0xd9a646,
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, lpSeg(n, 4));
const vec = (p: V) => new THREE.Vector3(...p);

/**
 * A convex solid from its corner points and faces (each a list of corner indices); faces are
 * wound outward automatically. Used for exact roof slabs, hip skirts and gable boards.
 */
function solid(corners: V[], faces: number[][]): THREE.BufferGeometry {
  const pts = corners.map(vec);
  const mid = pts.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).divideScalar(pts.length);
  const out: number[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const f of faces) {
    const fc = f.reduce((a, i) => a.add(pts[i]!), new THREE.Vector3()).divideScalar(f.length);
    const [a, b, c] = [pts[f[0]!]!, pts[f[1]!]!, pts[f[2]!]!];
    const n = e1.subVectors(b, a).cross(e2.subVectors(c, a));
    const order = n.dot(fc.sub(mid)) < 0 ? [...f].reverse() : f;
    for (let k = 1; k < order.length - 1; k++)
      for (const i of [order[0]!, order[k]!, order[k + 1]!]) out.push(...corners[i]!);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

const HEXA = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];

/** A square-section timber from a to b (battens, rails, verges, rays). */
function beam(a: V, b: V, w: number, h = w): THREE.BufferGeometry {
  const A = vec(a);
  const d = vec(b).sub(A);
  const g = box(w, h, d.length());
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().normalize()),
  );
  return g.translate(A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2);
}

interface Gable {
  /** Length along the ridge (x), eaves included. */
  len: number;
  /** Half-span at the eave (z). */
  half: number;
  ridge: number;
  eave: number;
  /** Top of the wall or skirt the gable boards stand on. */
  base: number;
  tile: number;
  /** Colour of the courses across the slope (default: the other tile shade). */
  course?: number;
  /** Ridge and verges (default: white lime; a thatched roof has a thatch ridge). */
  ridgeColor?: number;
  /** Which ends get a decorated gable board and horn finials (-1 = -x, 1 = +x). */
  ends?: number[];
  horn?: number;
  /** Upswept hooks at the eave corners of the decorated ends. */
  hooks?: boolean;
}

/**
 * A steep two-sided tile roof with its ridge along x, centred on the origin: two slabs with
 * darker tile courses, a white lime ridge and verges, decorated gable boards (a sunburst of
 * battens round a half-sun) and upswept kbach horn finials at the ridge ends.
 */
function gableRoof(p: THREE.BufferGeometry[], g: Gable): void {
  const { len, half, ridge: R, eave: E, base } = g;
  const ends = g.ends ?? [-1, 1];
  const horn = g.horn ?? 1;
  const t = 0.1;
  const L = len / 2;
  const rise = R - E;
  const slope = Math.hypot(half, rise);
  for (const s of [-1, 1]) {
    // Outward normal of this slope in (y, z).
    const ny = half / slope;
    const nz = (s * rise) / slope;
    const top: V[] = [
      [-L, R + 0.03, -s * 0.04],
      [L, R + 0.03, -s * 0.04],
      [L, E, s * half],
      [-L, E, s * half],
    ];
    const bottom = top.map(([x, y, z]) => [x, y - ny * t, z - nz * t] as V);
    p.push(part(solid([...top, ...bottom], HEXA), g.tile));
    // Tile courses: darker lines across the slope.
    for (const f of [0.3, 0.55, 0.8]) {
      const y = R - f * rise + ny * 0.02;
      const z = s * f * half + nz * 0.02;
      p.push(
        part(
          beam([-L + 0.05, y, z], [L - 0.05, y, z], 0.07, 0.03),
          g.course ?? (C.tile === g.tile ? C.tileLight : C.tile),
        ),
      );
    }
    // White verges along both gable edges.
    for (const x of [-L, L])
      p.push(
        part(
          beam([x, R + 0.07, 0], [x, E + ny * 0.05, s * (half + 0.02)], 0.1, 0.08),
          g.ridgeColor ?? C.lime,
        ),
      );
  }
  p.push(part(beam([-L - 0.02, R + 0.08, 0], [L + 0.02, R + 0.08, 0], 0.18, 0.14), g.ridgeColor ?? C.lime)); // ridge
  for (const sx of ends) {
    const x = sx * (L - 0.28);
    // Gable board filling the triangle above the wall.
    const bh = R - 0.14 - base;
    const bw = (half * (R - base)) / rise - 0.12;
    const tri: V[] = [
      [x - 0.03, base, -bw],
      [x - 0.03, base, bw],
      [x - 0.03, base + bh, 0],
      [x + 0.03, base, -bw],
      [x + 0.03, base, bw],
      [x + 0.03, base + bh, 0],
    ];
    p.push(
      part(
        solid(tri, [
          [0, 1, 2],
          [3, 4, 5],
          [0, 1, 4, 3],
          [1, 2, 5, 4],
          [2, 0, 3, 5],
        ]),
        C.board,
      ),
    );
    // Sunburst: rays fanning from a half-sun at the foot of the board.
    const fx = x + sx * 0.05;
    p.push(
      part(
        place(
          new THREE.CircleGeometry(bh * 0.22, lpSeg(8, 5), 0, Math.PI),
          [fx, base + 0.02, 0],
          [0, (sx * Math.PI) / 2, 0],
        ),
        C.gold,
      ),
    );
    for (const a of [-1.15, -0.7, -0.33, 0, 0.33, 0.7, 1.15]) {
      const d = 0.88 / (Math.abs(Math.sin(a)) / bw + Math.cos(a) / bh);
      const r0 = bh * 0.26;
      p.push(
        part(
          beam(
            [fx, base + Math.cos(a) * r0, Math.sin(a) * r0],
            [fx, base + Math.cos(a) * d, Math.sin(a) * d],
            0.03,
            0.05,
          ),
          C.ray,
        ),
      );
    }
    // Kbach horn finial at the ridge end, sweeping out and up.
    const hx = sx * (L + 0.02);
    const pts = [
      new THREE.Vector3(hx, R + 0.05, 0),
      new THREE.Vector3(hx + sx * 0.16 * horn, R + 0.22 * horn, 0),
      new THREE.Vector3(hx + sx * 0.2 * horn, R + 0.45 * horn, 0),
      new THREE.Vector3(hx + sx * 0.08 * horn, R + 0.58 * horn, 0),
    ];
    p.push(part(taperedTube(pts, 0.08 * horn, 0.02, 6, 5), C.lime));
    if (g.hooks !== false)
      for (const s of [-1, 1]) {
        const ez = s * (half + 0.02);
        const hook = [
          new THREE.Vector3(hx, E + 0.02, ez),
          new THREE.Vector3(hx + sx * 0.08, E + 0.1, ez + s * 0.08),
          new THREE.Vector3(hx + sx * 0.1, E + 0.3, ez + s * 0.1),
        ];
        p.push(part(taperedTube(hook, 0.05, 0.015, 4, 5), C.lime));
      }
  }
}

/** Tall round posts on stone footings (ssom), from the ground up to `top`. */
function posts(p: THREE.BufferGeometry[], xs: number[], zs: number[], top: number, r: number): void {
  for (const x of xs)
    for (const z of zs) {
      p.push(part(place(box(r * 3.4, 0.24, r * 3.4), [x, 0.12, z]), C.footing));
      p.push(part(place(cyl(r * 0.92, r, top - 0.24, 6), [x, 0.24 + (top - 0.24) / 2, z]), C.post));
    }
}

/**
 * Dark vertical-plank walls: a box body with lighter battens every ~0.4 m on every face.
 * Centred at (0, y0 + h/2, zc); w along x, d along z.
 */
function plankWalls(p: THREE.BufferGeometry[], w: number, d: number, y0: number, h: number, zc = 0): void {
  p.push(part(place(box(w, h, d), [0, y0 + h / 2, zc]), C.wall));
  const y1 = y0 + 0.04;
  const y2 = y0 + h - 0.04;
  for (let i = 1, n = Math.round(w / 0.42); i < n; i++) {
    const x = -w / 2 + (i * w) / n;
    for (const s of [-1, 1])
      p.push(
        part(
          beam([x, y1, zc + s * (d / 2 + 0.015)], [x, y2, zc + s * (d / 2 + 0.015)], 0.05, 0.03),
          C.batten,
        ),
      );
  }
  for (let i = 1, n = Math.round(d / 0.42); i < n; i++) {
    const z = zc - d / 2 + (i * d) / n;
    for (const s of [-1, 1])
      p.push(part(beam([s * (w / 2 + 0.015), y1, z], [s * (w / 2 + 0.015), y2, z], 0.03, 0.05), C.batten));
  }
  // Sill and head beams round the body.
  for (const y of [y0 + 0.06, y0 + h - 0.06]) {
    p.push(part(place(box(w + 0.08, 0.1, 0.06), [0, y, zc + d / 2 + 0.03]), C.floor));
    p.push(part(place(box(w + 0.08, 0.1, 0.06), [0, y, zc - d / 2 - 0.03]), C.floor));
    for (const s of [-1, 1])
      p.push(part(place(box(0.06, 0.1, d + 0.08), [s * (w / 2 + 0.03), y, zc]), C.floor));
  }
}

/**
 * A small window with its two shutters swung open flat against the wall. `face` is the
 * outward direction: 'z+' / 'z-' (front/back) or 'x+' / 'x-' (sides); (a, b) are the
 * position along the wall and the height, `at` the wall plane.
 */
function windowAt(
  p: THREE.BufferGeometry[],
  face: 'z+' | 'z-' | 'x+' | 'x-',
  along: number,
  y: number,
  at: number,
  cloth = false,
): void {
  const q: THREE.BufferGeometry[] = [];
  q.push(part(place(box(0.42, 0.46, 0.04), [0, y, 0.03]), C.opening));
  for (const s of [-1, 1]) q.push(part(place(box(0.22, 0.46, 0.03), [s * 0.34, y, 0.05]), C.shutter));
  q.push(part(place(box(0.56, 0.05, 0.08), [0, y - 0.25, 0.05]), C.floor)); // sill
  if (cloth) q.push(part(place(box(0.46, 0.34, 0.03), [0, y - 0.4, 0.1]), 0xffffff, CLOTH));
  const rot = { 'z+': 0, 'z-': Math.PI, 'x+': Math.PI / 2, 'x-': -Math.PI / 2 }[face];
  for (const g of q) {
    g.translate(along * (face === 'z-' || face === 'x+' ? -1 : 1), 0, at);
    g.rotateY(rot);
    p.push(g);
  }
}

/** A steep wooden stair from the ground at z1 up to the floor edge at (y, z0), with rails. */
function stair(
  p: THREE.BufferGeometry[],
  x: number,
  width: number,
  y: number,
  z0: number,
  z1: number,
  steps: number,
): void {
  const hw = width / 2;
  for (const s of [-1, 1]) {
    const sx = x + s * hw;
    p.push(part(beam([sx, 0.05, z1], [sx, y, z0], 0.07, 0.16), C.stair)); // stringer
    p.push(part(beam([sx + s * 0.03, 0.95, z1], [sx + s * 0.03, y + 0.85, z0], 0.06), C.floor)); // rail
    p.push(part(place(box(0.1, 1.05, 0.1), [sx + s * 0.03, 0.52, z1]), C.floor)); // newel post
    p.push(
      part(
        place(new THREE.SphereGeometry(0.08, lpSeg(6, 4), lpSeg(4, 3)), [sx + s * 0.03, 1.08, z1]),
        C.lime,
      ),
    );
    p.push(part(place(box(0.08, 0.9, 0.08), [sx + s * 0.03, y + 0.42, z0]), C.floor));
  }
  for (let k = 1; k <= steps; k++) {
    const f = k / (steps + 1);
    p.push(part(place(box(width - 0.04, 0.05, 0.24), [x, f * y, z1 + (z0 - z1) * f]), C.stair));
  }
}

/** Spirit house (Rean Tevoda) on its post, at a plot corner. */
function spiritHouse(p: THREE.BufferGeometry[], x: number, z: number, s = 1): void {
  p.push(part(place(cyl(0.05 * s, 0.06 * s, 1.25 * s, 5), [x, 0.62 * s, z]), C.post));
  p.push(part(place(box(0.5 * s, 0.05 * s, 0.46 * s), [x, 1.25 * s, z]), C.stair));
  p.push(part(place(box(0.34 * s, 0.28 * s, 0.3 * s), [x, 1.41 * s, z]), C.gold));
  p.push(
    part(
      place(new THREE.ConeGeometry(0.36 * s, 0.32 * s, 4), [x, 1.71 * s, z], [0, Math.PI / 4, 0]),
      C.tileLight,
    ),
  );
  p.push(part(place(new THREE.ConeGeometry(0.04 * s, 0.22 * s, 4), [x, 1.95 * s, z]), C.lime));
}

/**
 * Pteas Rong (ផ្ទះរោង), the common house: 2 × 2 tiles (4 × 4 m). PK's reference names it
 * the oldest type of the series, going back to Funan (Nokor Phnom). A rectangular body with
 * its long side to the front, raised on three rows of round posts over stone footings (floor
 * at ~2.2 m), under one steep two-sided gable roof of red tile (overall ~5.5 m) with big
 * decorated gable boards and horn finials at both ridge ends; a steep stair on the long side
 * up to the door, small shuttered windows (a team-colour cloth hangs from one), a
 * terracotta ground slab and a spirit house at the north-east corner of the plot.
 */
export function rongHouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const H = 2.2;
  const floorTop = H + 0.08;
  const wallTop = 3.62;
  p.push(part(place(box(3.8, 0.06, 3.3), [0, 0.03, 0]), C.slab));
  posts(p, [-1.45, 0, 1.45], [-1.05, 0, 1.05], H - 0.08, 0.1);
  p.push(part(place(box(3.5, 0.16, 2.7), [0, H, 0]), C.floor));
  plankWalls(p, 3.2, 2.4, floorTop, wallTop - floorTop);
  // Door on the long side, with a lighter frame.
  p.push(part(place(box(0.74, 1.3, 0.05), [-0.7, floorTop + 0.66, 1.22]), C.batten));
  p.push(part(place(box(0.6, 1.2, 0.06), [-0.7, floorTop + 0.6, 1.23]), C.opening));
  const wy = floorTop + 0.78;
  windowAt(p, 'z+', 0.35, wy, 1.2);
  windowAt(p, 'z+', 1.05, wy, 1.2, true);
  windowAt(p, 'z-', -0.75, wy, 1.2);
  windowAt(p, 'z-', 0.75, wy, 1.2);
  windowAt(p, 'x+', 0, wy, 1.6);
  windowAt(p, 'x-', 0, wy, 1.6);
  gableRoof(p, {
    len: 3.9,
    half: 1.7,
    ridge: 5.0,
    eave: 3.25,
    base: wallTop - 0.04,
    // Commoners were not allowed tiles: palm-leaf thatch (Zhou Daguan; PK's research, D78).
    tile: C.thatch,
    course: C.thatchCourse,
    ridgeColor: C.thatchRidge,
    horn: 0.8,
  });
  stair(p, -0.7, 0.66, floorTop, 1.36, 2.35, 6);
  spiritHouse(p, 2.15, 2.15);
  return mergeGeometries(p)!;
}

/**
 * Pteas Keung (ផ្ទះកឹង), the house of officials and dignitaries: 3 × 3 tiles (6 × 6 m), the
 * tallest and highest-ranked type in PK's reference. Raised on 4 × 5 round posts (floor at
 * ~2.6 m); a two-tier roof: a narrow, very steep main gable (ornate gable boards, horn
 * finials, overall ~7.5 m) rising out of a lower hipped tile skirt that runs all round the
 * body; a front veranda under its own small projecting gable, reached by a grand stair at
 * the front centre; more windows, team-colour cloths, and a spirit house at the north-east
 * corner of the plot.
 */
export function keungHouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const H = 2.6;
  const floorTop = H + 0.09;
  const zc = -0.6; // body centre (the veranda takes the front)
  p.push(part(place(box(5.6, 0.06, 5.4), [0, 0.03, -0.1]), C.slab));
  posts(p, [-2.3, -1.15, 0, 1.15, 2.3], [-2.45, -0.9, 0.65, 2.15], H - 0.09, 0.12);
  p.push(part(place(box(5.0, 0.18, 4.9), [0, H, -0.15]), C.floor));
  plankWalls(p, 4.2, 3.4, floorTop, 4.42 - floorTop, zc);
  // Front: double door between two windows, inside the veranda.
  p.push(part(place(box(1.12, 1.62, 0.05), [0, floorTop + 0.8, zc + 1.72]), C.batten));
  p.push(part(place(box(0.98, 1.52, 0.06), [0, floorTop + 0.76, zc + 1.73]), C.opening));
  const wy = floorTop + 0.9;
  windowAt(p, 'z+', -1.35, wy, zc + 1.7);
  windowAt(p, 'z+', 1.35, wy, zc + 1.7);
  for (const x of [-1.25, 0, 1.25]) windowAt(p, 'z-', x, wy, -zc + 1.7);
  for (const z of [-1.6, 0.2]) {
    windowAt(p, 'x+', z, wy, 2.1, z > 0);
    windowAt(p, 'x-', z, wy, 2.1);
  }
  // Veranda: posts carried up to the porch gable, a balustrade with a gap for the stair.
  for (const x of [-1.15, 1.15])
    p.push(part(place(cyl(0.1, 0.11, 1.3, 6), [x, floorTop + 0.65, 2.15]), C.post));
  for (const [x0, x1] of [
    [-2.45, -0.72],
    [0.72, 2.45],
  ] as const) {
    p.push(part(beam([x0, floorTop + 0.55, 2.25], [x1, floorTop + 0.55, 2.25], 0.08), C.floor));
    for (let k = 0; k <= 5; k++) {
      const x = x0 + ((x1 - x0) * k) / 5;
      p.push(part(beam([x, floorTop, 2.25], [x, floorTop + 0.55, 2.25], 0.05), C.batten));
    }
  }
  for (const s of [-1, 1])
    p.push(part(beam([s * 2.45, floorTop + 0.55, 1.1], [s * 2.45, floorTop + 0.55, 2.25], 0.08), C.floor));
  p.push(part(place(box(0.8, 0.5, 0.03), [1.55, floorTop + 0.35, 2.3]), 0xffffff, CLOTH)); // cloth over the rail
  // Lower tier: a hipped tile skirt all round the body, white hip lines at the corners.
  const [by, ty] = [4.0, 4.85];
  const [bx, bz0, bz1] = [2.9, -3.05, 1.65];
  const [tx, tz0, tz1] = [2.05, -2.15, 0.75];
  const skirt: V[] = [
    [-bx, by, bz0],
    [bx, by, bz0],
    [bx, by, bz1],
    [-bx, by, bz1],
    [-tx, ty, tz0],
    [tx, ty, tz0],
    [tx, ty, tz1],
    [-tx, ty, tz1],
  ];
  p.push(part(solid(skirt, HEXA), C.yellowTile)); // officials: yellow clay tiles (Zhou Daguan)
  for (let i = 0; i < 4; i++) {
    const [a, b] = [skirt[i]!, skirt[i + 4]!];
    p.push(part(beam([a[0], a[1] + 0.04, a[2]], [b[0], b[1] + 0.04, b[2]], 0.12, 0.1), C.lime));
    // A lighter tile course half-way up each face.
    const [c, d] = [skirt[(i + 1) % 4]!, skirt[((i + 1) % 4) + 4]!];
    const m = (u: V, w: V): V => [(u[0] + w[0]) / 2, (u[1] + w[1]) / 2 + 0.03, (u[2] + w[2]) / 2];
    p.push(part(beam(m(a, b), m(c, d), 0.08, 0.03), C.yellowCourse));
  }
  // Upper tier: the narrow, very steep main gable rising out of the skirt.
  const upper: THREE.BufferGeometry[] = [];
  gableRoof(upper, {
    len: 4.3,
    half: 1.55,
    ridge: 7.0,
    eave: 4.7,
    base: ty,
    tile: C.yellowTileLight,
    course: C.yellowCourse,
    hooks: false,
    horn: 1.0,
  });
  for (const g of upper) p.push(g.translate(0, 0, -0.7));
  // Veranda gable projecting to the front, its decorated board facing the stair.
  const porch: THREE.BufferGeometry[] = [];
  gableRoof(porch, {
    len: 2.3,
    half: 1.4,
    ridge: 5.05,
    eave: 3.9,
    base: 3.98,
    tile: C.yellowTileLight,
    course: C.yellowCourse,
    ends: [1],
    horn: 0.8,
  });
  for (const g of porch) p.push(g.rotateY(-Math.PI / 2).translate(0, 0, 1.45));
  p.push(part(beam([-1.25, 3.98, 2.15], [1.25, 3.98, 2.15], 0.12), C.floor)); // porch beam
  stair(p, 0, 1.3, floorTop, 2.3, 3.5, 8);
  spiritHouse(p, 2.75, 2.95, 1.1);
  return mergeGeometries(p)!;
}
