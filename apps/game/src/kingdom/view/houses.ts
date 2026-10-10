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

/** PK 1.8.0 (889 CE brief): the commoner's stilt house materials. */
const R89 = {
  bamboo: 0x9e8a62,
  bambooLight: 0xc2ad80,
  bambooDark: 0x76623f,
  /** Weathered thatch: grey-brown, the fresh courses lighter (PK's reference). */
  thatchOld: 0x8f7d5c,
  thatchShade: 0x5e5038,
  hardwood: 0x4a3020,
  hardwoodLight: 0x6a4630,
  stone: 0xa49474,
  stoneDark: 0x80725a,
  earth: 0x8a6a48,
  clay: 0x9a5434,
  basket: 0xb08a4e,
  straw: 0xd8bc6a,
  log: 0x5e4028,
};

/**
 * A carved stone pedestal (ssom) for a stilt: a square plinth, a chamfered block with a
 * carved band, and a cap; the post stands on top, out of the damp (not buried in the earth).
 * Returns the height of its top.
 */
function pedestal(p: THREE.BufferGeometry[], x: number, z: number): number {
  p.push(part(place(box(0.42, 0.1, 0.42), [x, 0.05, z]), R89.stoneDark));
  p.push(part(place(cyl(0.15, 0.2, 0.24, 4), [x, 0.22, z], [0, Math.PI / 4, 0]), R89.stone));
  p.push(part(place(box(0.27, 0.05, 0.27), [x, 0.25, z]), R89.stoneDark)); // the carved band
  p.push(part(place(box(0.25, 0.06, 0.25), [x, 0.37, z]), R89.stone)); // cap
  return 0.4;
}

/**
 * A woven bamboo wall panel (thnob), `w` wide and `h` high, centred at `c` along the wall, its
 * face at `at` along the outward axis: a split-bamboo base with a two-tone twill weave in a
 * hardwood frame (top, middle and bottom rails). `side`: 'z' = front/back (panel along x),
 * 'x' = the ends (panel along z).
 */
function wovenPanel(
  p: THREE.BufferGeometry[],
  side: 'z' | 'x',
  sign: number,
  at: number,
  w: number,
  y0: number,
  h: number,
  c = 0,
): void {
  const along = (u: number, y: number, d: number, sw: number, sh: number, col: number) => {
    const g = side === 'z' ? box(sw, sh, d) : box(d, sh, sw);
    const pos: V = side === 'z' ? [c + u, y, sign * at] : [sign * at, y, c + u];
    p.push(part(place(g, pos), col));
  };
  along(0, y0 + h / 2, 0.06, w, h, R89.bamboo);
  const cols = Math.max(2, Math.round(w / 0.34));
  const rows = Math.max(2, Math.round(h / 0.3));
  const cw = w / cols;
  const ch = h / rows;
  for (let r = 0; r < rows; r++)
    for (let k = r % 2; k < cols; k += 2)
      along(-w / 2 + (k + 0.5) * cw, y0 + (r + 0.5) * ch, 0.08, cw * 0.92, ch * 0.5, r % 2 ? R89.bambooLight : R89.bambooDark);
  for (const y of [y0 + 0.04, y0 + h * 0.45, y0 + h - 0.04]) along(0, y, 0.11, w + 0.06, 0.08, R89.hardwood);
}

/**
 * A steep, deep thatch roof with its ridge along x, centred on the origin: two thick shaggy
 * slabs with layered courses, bamboo battens laid down the slope over the thatch, a ragged
 * fringe at the low eaves, a bound ridge roll, woven bamboo gable triangles and, at both ridge
 * ends, carved horn finials curling up (with smaller hooks at the eave corners), as in PK's
 * reference.
 */
function thatchRoof(
  p: THREE.BufferGeometry[],
  g: { len: number; half: number; ridge: number; eave: number; base: number; wallHalf: number },
): void {
  const { len, half, ridge: R, eave: E, base } = g;
  const L = len / 2;
  const rise = R - E;
  const slope = Math.hypot(half, rise);
  const t = 0.22;
  const ny = half / slope;
  for (const s of [-1, 1]) {
    const nz = (s * rise) / slope;
    const top: V[] = [
      [-L, R + 0.04, -s * 0.05],
      [L, R + 0.04, -s * 0.05],
      [L, E, s * half],
      [-L, E, s * half],
    ];
    const bottom = top.map(([x, y, z]) => [x, y - ny * t, z - nz * t] as V);
    p.push(part(solid([...top, ...bottom], HEXA), R89.thatchOld));
    // Layered courses, each lapping over the one below, its lower edge in shadow.
    for (const f of [0.16, 0.32, 0.48, 0.64, 0.8, 0.94]) {
      const y = R - f * rise + ny * 0.035;
      const z = s * f * half + nz * 0.035;
      p.push(part(beam([-L + 0.02, y, z], [L - 0.02, y, z], 0.12, 0.05), f < 0.5 ? C.thatch : C.thatchCourse));
      p.push(part(beam([-L + 0.02, y - ny * 0.02, z - s * 0.07], [L - 0.02, y - ny * 0.02, z - s * 0.07], 0.05, 0.03), R89.thatchShade));
    }
    // Bamboo battens laid down the slope over the thatch, holding it against the wind.
    const n = Math.max(3, Math.round(len / 0.75));
    for (let i = 0; i < n; i++) {
      const x = -L + 0.3 + (i * (len - 0.6)) / (n - 1);
      const a0: V = [x, R - 0.04 * rise + ny * 0.07, s * 0.04 * half + nz * 0.07];
      const a1: V = [x, R - 0.97 * rise + ny * 0.07, s * 0.97 * half + nz * 0.07];
      p.push(part(beam(a0, a1, 0.06, 0.05), R89.log));
    }
    // One long batten across, tying them.
    const yc = R - 0.55 * rise + ny * 0.09;
    p.push(part(beam([-L + 0.1, yc, s * 0.55 * half + nz * 0.09], [L - 0.1, yc, s * 0.55 * half + nz * 0.09], 0.05, 0.05), R89.log));
    // The ragged eave fringe.
    for (let i = 0; i < 9; i++) {
      const x = -L + (i + 0.5) * (len / 9);
      const drop = 0.12 + ((i * 37) % 5) * 0.03;
      p.push(part(place(box(len / 9 + 0.02, drop, 0.14), [x, E - drop / 2 + 0.02, s * (half - 0.02)]), i % 2 ? R89.thatchShade : C.thatchCourse));
    }
  }
  p.push(part(place(cyl(0.16, 0.16, len + 0.1, 6), [0, R + 0.1, 0], [0, 0, Math.PI / 2]), C.thatchRidge));
  for (const x of [-L * 0.66, -L * 0.22, L * 0.22, L * 0.66])
    p.push(part(place(cyl(0.18, 0.18, 0.06, 6), [x, R + 0.1, 0], [0, 0, Math.PI / 2]), R89.hardwood));
  for (const sx of [-1, 1]) {
    const x = sx * (L - 0.3);
    const bh = R - 0.1 - base;
    const bw = Math.min(g.wallHalf + 0.1, (half * (R - base)) / rise - 0.08);
    const tri: V[] = [
      [x - 0.03, base, -bw],
      [x - 0.03, base, bw],
      [x - 0.03, base + bh, 0],
      [x + 0.03, base, -bw],
      [x + 0.03, base, bw],
      [x + 0.03, base + bh, 0],
    ];
    p.push(part(solid(tri, [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]]), R89.bamboo));
    for (const f of [0.3, 0.62]) {
      const hw = bw * (1 - f) - 0.05;
      p.push(part(place(box(0.08, 0.1, hw * 2), [x + sx * 0.01, base + f * bh, 0]), R89.bambooLight));
    }
    // Barge boards along both verges, dark hardwood.
    const ex = sx * (L + 0.02);
    for (const s of [-1, 1]) p.push(part(beam([ex, R + 0.12, 0], [ex, E + 0.05, s * (half + 0.03)], 0.1, 0.08), R89.hardwood));
    // Horn finial at the apex: rising, then curling outward (the reference's naga horn).
    const horn = [
      new THREE.Vector3(ex, R + 0.1, 0),
      new THREE.Vector3(ex + sx * 0.08, R + 0.32, 0),
      new THREE.Vector3(ex + sx * 0.05, R + 0.55, 0),
      new THREE.Vector3(ex + sx * 0.2, R + 0.68, 0),
    ];
    p.push(part(taperedTube(horn, 0.08, 0.02, 6, 6), R89.hardwood));
    // Small hooks curling up at the eave corners.
    for (const s of [-1, 1]) {
      const ez = s * (half + 0.03);
      const hook = [
        new THREE.Vector3(ex, E + 0.05, ez),
        new THREE.Vector3(ex + sx * 0.06, E + 0.18, ez + s * 0.06),
        new THREE.Vector3(ex + sx * 0.02, E + 0.36, ez + s * 0.08),
      ];
      p.push(part(taperedTube(hook, 0.05, 0.015, 4, 5), R89.hardwood));
    }
  }
}

/** A thatch roof as above, turned so its ridge runs along z (gable ends to the front and back). */
function thatchGableZ(
  p: THREE.BufferGeometry[],
  x: number,
  z: number,
  g: { len: number; half: number; ridge: number; eave: number; base: number; wallHalf: number },
): void {
  const q: THREE.BufferGeometry[] = [];
  thatchRoof(q, g);
  for (const m of q) p.push(m.rotateY(Math.PI / 2).translate(x, 0, z));
}

/** A window with a woven awning shutter propped open on a stick (PK's reference). */
function awningWindow(p: THREE.BufferGeometry[], side: 'z' | 'x', sign: number, at: number, u: number, y: number): void {
  const q: THREE.BufferGeometry[] = [];
  q.push(part(place(box(0.55, 0.42, 0.05), [0, 0, 0.02]), C.opening));
  q.push(part(place(box(0.65, 0.06, 0.08), [0, -0.24, 0.05]), R89.hardwood)); // sill
  q.push(part(place(box(0.64, 0.05, 0.46), [0, 0.32, 0.2], [0.55, 0, 0]), R89.bamboo)); // awning
  q.push(part(beam([0.28, -0.22, 0.06], [0.28, 0.2, 0.4], 0.025, 0.025), R89.log)); // prop stick
  for (const g of q) {
    g.translate(0, y, 0);
    if (side === 'z') {
      if (sign < 0) g.rotateY(Math.PI);
      g.translate(u, 0, sign * at);
    } else {
      g.rotateY((sign * Math.PI) / 2);
      g.translate(sign * at, 0, u);
    }
    p.push(g);
  }
}

/**
 * Pteas Rong (ផ្ទះរោង), the commoner's house: 2 × 2 tiles (4 × 4 m), PK 1.8.0 after his 889 CE
 * brief and reference picture (late Chenla, early Angkor): two steep, deep thatch gables side by
 * side with a valley between, their gable ends to the front, bamboo battens over the thatch and
 * horn finials curling up at the apexes; woven bamboo walls in a hardwood frame with propped
 * awning windows; a veranda with a railing before the door under the right gable, reached by a
 * wooden stair with handrails; square hardwood stilts on carved stone pedestals (not buried in
 * the earth, out of the damp); under the house the farm's daily life: stacked firewood, baskets,
 * an ox cart, clay water jars, straw, a fish trap. A team-colour cloth hangs at a window. No
 * wooden house of the period survives: a reconstruction.
 */
export function rongHouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const H = 1.85; // floor
  const floorTop = H + 0.1;
  const wallTop = 3.55;
  const wh = wallTop - floorTop;
  const XL = -1.6; // left wall
  const XR = 1.6; // right wall
  const XM = 0.1; // between the two rooms (under the valley)
  const ZB = -1.35; // back wall
  const ZF = 1.45; // front of the left room and of the veranda
  const ZV = 0.45; // the right room's front wall (the back of the veranda)
  // Packed earth and straw under the house.
  p.push(part(place(box(3.8, 0.04, 3.4), [0, 0.02, 0.05]), R89.earth));
  p.push(part(place(box(1.1, 0.06, 0.8), [0.8, 0.05, 0.9]), R89.straw));
  // Square hardwood stilts on carved stone pedestals; the veranda's front posts run on up to
  // the eave.
  const stilts: Array<[number, number, number]> = [];
  for (const x of [XL, XM, XR]) for (const z of [ZB, -0.45, ZV]) stilts.push([x, z, H]);
  stilts.push([XL, ZF, H], [XM, ZF, 3.25], [XR, ZF, 3.25]);
  for (const [x, z, top] of stilts) {
    const base = pedestal(p, x, z);
    p.push(part(place(box(0.16, top - base, 0.16), [x, base + (top - base) / 2, z]), R89.hardwood));
  }
  // Bearers and joists.
  for (const z of [ZB, -0.45, ZV, ZF]) p.push(part(place(box(3.4, 0.14, 0.14), [0, H - 0.12, z]), R89.hardwood));
  for (const x of [XL, XM, XR]) p.push(part(place(box(0.12, 0.1, ZF - ZB + 0.2), [x, H - 0.02, (ZF + ZB) / 2]), R89.hardwoodLight));
  // Floors: the rooms and the veranda (split bamboo).
  p.push(part(place(box(XR - XL + 0.2, 0.08, ZF - ZB + 0.2), [0, H + 0.06, (ZF + ZB) / 2]), R89.bambooDark));
  // Corner posts of the rooms.
  for (const [x, z] of [
    [XL, ZB], [XR, ZB], [XL, ZF], [XM, ZF], [XM, ZV], [XR, ZV], [XM, ZB],
  ] as const)
    p.push(part(place(box(0.14, wh + 0.1, 0.14), [x, floorTop + wh / 2, z]), R89.hardwood));
  // Woven walls. Left room: front, left side, its right side along the veranda.
  wovenPanel(p, 'z', 1, ZF, XM - XL, floorTop, wh, (XL + XM) / 2);
  wovenPanel(p, 'x', -1, -XL, ZF - ZB, floorTop, wh, (ZF + ZB) / 2);
  wovenPanel(p, 'x', 1, XM, ZF - ZV, floorTop, wh, (ZF + ZV) / 2);
  // Back wall and the right room's side.
  wovenPanel(p, 'z', -1, -ZB, XR - XL, floorTop, wh);
  wovenPanel(p, 'x', 1, XR, ZV - ZB, floorTop, wh, (ZV + ZB) / 2);
  // The right room's front, onto the veranda, with the door.
  const doorX = 0.75;
  const doorW = 0.7;
  const lw = doorX - doorW / 2 - XM;
  const rw = XR - (doorX + doorW / 2);
  wovenPanel(p, 'z', 1, ZV, lw, floorTop, wh, XM + lw / 2);
  wovenPanel(p, 'z', 1, ZV, rw, floorTop, wh, XR - rw / 2);
  p.push(part(place(box(doorW, 1.3, 0.05), [doorX, floorTop + 0.65, ZV + 0.01]), C.opening));
  p.push(part(place(box(doorW + 0.14, 0.08, 0.1), [doorX, floorTop + 1.34, ZV + 0.03]), R89.hardwood));
  // Awning windows, the team cloth under one.
  awningWindow(p, 'z', 1, ZF + 0.02, (XL + XM) / 2 - 0.35, floorTop + 0.9);
  awningWindow(p, 'z', 1, ZF + 0.02, (XL + XM) / 2 + 0.45, floorTop + 0.9);
  awningWindow(p, 'x', -1, -XL + 0.02, -0.6, floorTop + 0.9);
  p.push(part(place(box(0.46, 0.34, 0.03), [(XL + XM) / 2 - 0.35, floorTop + 0.42, ZF + 0.07]), 0xffffff, CLOTH));
  // Veranda railing: top rail and balusters, open at the stair (on the left).
  const railY = floorTop + 0.6;
  p.push(part(beam([XM + 0.62, railY, ZF], [XR, railY, ZF], 0.07, 0.07), R89.hardwood));
  p.push(part(beam([XR, railY, ZF], [XR, railY, ZV], 0.07, 0.07), R89.hardwood));
  for (let i = 0; i <= 6; i++) p.push(part(place(box(0.04, 0.6, 0.04), [XM + 0.62 + (i * (XR - XM - 0.62)) / 6, floorTop + 0.3, ZF]), R89.hardwoodLight));
  for (let i = 1; i < 4; i++) p.push(part(place(box(0.04, 0.6, 0.04), [XR, floorTop + 0.3, ZV + (i * (ZF - ZV)) / 4]), R89.hardwoodLight));
  // A rolled bamboo blind under the veranda eave.
  p.push(part(place(cyl(0.07, 0.07, XR - XM - 0.2, 6), [(XM + XR) / 2, 3.1, ZF + 0.05], [0, 0, Math.PI / 2]), R89.bambooLight));
  // Two thatch gables side by side, gable ends front and back, a valley between.
  const roof = { ridge: 5.1, eave: 3.2, base: wallTop - 0.04, len: ZF - ZB + 0.95 };
  const zc = (ZF + ZB) / 2 + 0.05;
  thatchGableZ(p, (XL + XM) / 2 - 0.05, zc, { ...roof, half: 1.32, wallHalf: (XM - XL) / 2 });
  thatchGableZ(p, (XM + XR) / 2 + 0.05, zc, { ...roof, half: 1.32, wallHalf: (XR - XM) / 2 });
  // Wooden stair with handrails, from the ground in front up to the veranda's open side.
  const sx = XM + 0.32;
  const sz0 = ZF;
  const sz1 = ZF + 1.05;
  for (const s of [-1, 1]) {
    const x = sx + s * 0.28;
    p.push(part(beam([x, 0.05, sz1], [x, floorTop, sz0], 0.06, 0.16), R89.hardwoodLight));
    p.push(part(beam([x, 0.85, sz1], [x, floorTop + 0.72, sz0], 0.05, 0.05), R89.hardwood));
    p.push(part(place(box(0.07, 0.9, 0.07), [x, 0.45, sz1]), R89.hardwood));
  }
  for (let k = 1; k <= 7; k++) {
    const f = k / 8;
    p.push(part(place(box(0.56, 0.05, 0.2), [sx, f * floorTop, sz1 + (sz0 - sz1) * f]), R89.hardwoodLight));
  }
  // Under the house: stacked firewood, baskets, an ox cart, clay jars, a fish trap.
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 4 - r; i++)
      p.push(part(place(cyl(0.06, 0.06, 1.1, 5), [XL + 0.35, 0.1 + r * 0.11, -0.9 + i * 0.13 + r * 0.06], [0, 0, Math.PI / 2]), R89.log));
  p.push(part(place(cyl(0.2, 0.15, 0.32, 7), [-0.75, 0.2, 0.05]), R89.basket));
  p.push(part(place(cyl(0.17, 0.13, 0.28, 7), [-0.4, 0.18, 0.3]), R89.basket));
  // Ox cart: two spoked wheels (rims), axle, bed and the long shafts resting on the ground.
  const cx = 1.0;
  const cz = -0.75;
  for (const s of [-1, 1]) {
    p.push(part(place(new THREE.TorusGeometry(0.42, 0.04, 4, lpSeg(14, 8)), [cx + s * 0.45, 0.46, cz], [0, Math.PI / 2, 0]), R89.hardwoodLight));
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3])
      p.push(part(place(box(0.03, 0.82, 0.03), [cx + s * 0.45, 0.46, cz], [a, 0, 0]), R89.hardwood));
  }
  p.push(part(place(box(0.95, 0.05, 0.05), [cx, 0.46, cz]), R89.hardwood));
  p.push(part(place(box(0.75, 0.06, 0.9), [cx, 0.56, cz + 0.05]), R89.hardwoodLight));
  for (const s of [-1, 1]) p.push(part(beam([cx + s * 0.18, 0.56, cz + 0.45], [cx + s * 0.1, 0.06, cz + 1.4], 0.05, 0.05), R89.hardwood));
  for (const [x, z, r] of [
    [1.25, 0.95, 0.24],
    [1.35, 0.4, 0.2],
  ] as const) {
    p.push(part(place(new THREE.SphereGeometry(r, lpSeg(8, 5), lpSeg(6, 4)), [x, r * 1.15, z], [0, 0, 0], [1, 1.15, 1]), R89.clay));
    p.push(part(place(cyl(r * 0.42, r * 0.5, 0.08, 8), [x, r * 2.3 + 0.02, z]), R89.clay));
  }
  // A fish trap and a sieve hanging from the joists.
  p.push(part(place(cyl(0.1, 0.18, 0.45, 6), [0.35, 1.45, -0.1]), R89.bambooLight));
  p.push(part(place(cyl(0.2, 0.2, 0.04, 8), [-0.2, 1.6, -0.6], [Math.PI / 2, 0, 0]), R89.bamboo));
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
