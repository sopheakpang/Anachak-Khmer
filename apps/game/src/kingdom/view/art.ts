import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, LIMB, part, place, workerGeometry } from '../../engine/figures';
import { seg as lpSeg } from '../../engine/look';

/**
 * Models for the Kingdom tab, built in code in the low-poly style (no model files).
 * Buildings are centred on their footprint (tiles × 2 m) and stand on y = 0. Parts marked
 * CLOTH take the team colour (banners, cloths), so one model serves both sides.
 * Historical notes are in config/kingdom/buildings.json; all 9th-century wooden buildings
 * are reconstructions (none survive).
 */

type Limb = [number, number, number, number, number?];
const CLOTH: Limb = [0, 0, LIMB.body, 1];
const ARM_L: Limb = [1, 1.5, LIMB.forearm, 0];

const C = {
  laterite: 0xa8583a,
  lateriteDark: 0x8a4630,
  wood: COLORS.wood,
  woodDark: COLORS.woodDark,
  thatch: 0xc9a25a,
  thatchDark: 0xa98444,
  tile: 0x9a4a32,
  bamboo: COLORS.bamboo,
  gold: COLORS.gold,
  stone: 0xb9ab8a,
  water: 0x7fb0a8,
  rice: 0x7fb23e,
  earth: 0x8a6a44,
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, lpSeg(n, 4));

/** A hipped roof: a four-sided pyramid frustum. */
function roof(w: number, d: number, h: number, top = 0.15): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(top, Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, 1, d);
  return g;
}

/** A gable roof: a triangular prism along x. */
function gable(w: number, d: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / 6 + Math.PI);
  g.scale(w, h * 1.33, d);
  return g;
}

/** A pole with a cloth banner in the team colour that sways. */
function banner(x: number, z: number, h: number, size = 1): THREE.BufferGeometry[] {
  return [
    part(place(cyl(0.05, 0.06, h, 6), [x, h / 2, z]), C.woodDark),
    part(place(box(0.04, 0.9 * size, 0.7 * size), [x, h - 0.5 * size, z + 0.36 * size]), 0xffffff, [
      1,
      h,
      LIMB.sway,
      1,
      z,
    ]),
    part(place(new THREE.SphereGeometry(0.1, lpSeg(6, 4), lpSeg(4, 3)), [x, h + 0.08, z]), C.gold),
  ];
}

/** Royal hall (10 × 10 m): laterite terrace, timber hall on posts, two-tier roof, banners. */
export function royalHallGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(place(new RoundedBoxGeometry(9.4, 0.9, 9.4, 1, 0.08), [0, 0.45, 0]), C.laterite));
  p.push(part(place(box(3, 0.45, 1.4), [0, 0.22, 5.2]), C.lateriteDark)); // stair
  p.push(part(place(box(7.6, 0.2, 7.6), [0, 1.0, 0]), C.woodDark)); // floor
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      if (i > 0 && i < 3 && j > 0 && j < 3) continue;
      p.push(part(place(cyl(0.16, 0.18, 2.6, 8), [-3.3 + i * 2.2, 2.3, -3.3 + j * 2.2]), C.wood));
    }
  p.push(part(place(box(5.4, 2.2, 5.4), [0, 2.2, 0]), 0xd9b98a)); // screened inner hall
  p.push(part(place(box(1.2, 1.7, 0.1), [0, 1.95, 2.72]), C.woodDark)); // door
  // The palace: the main roof of lead tiles, the lower roof of yellow clay tiles (Zhou Daguan, D78).
  p.push(part(place(roof(9.6, 9.6, 1.9, 0.35), [0, 4.55, 0]), 0xd2a03c));
  p.push(part(place(roof(4.8, 4.8, 1.7, 0.08), [0, 6.2, 0]), 0x8d9396));
  p.push(part(place(cyl(0.06, 0.14, 1.1, 6), [0, 7.5, 0]), C.gold));
  for (const [x, z] of [
    [-4.4, 4.4],
    [4.4, 4.4],
  ] as const)
    p.push(...banner(x, z, 5.2, 1.3));
  return mergeGeometries(p)!;
}

/** Ssom: a stone footing under each post (keeps the timber off the damp ground). */
function stilts(p: THREE.BufferGeometry[], xs: number[], zs: number[], h: number, r = 0.1): void {
  for (const x of xs)
    for (const z of zs) {
      p.push(part(place(box(0.34, 0.22, 0.34), [x, 0.11, z]), C.stone));
      p.push(part(place(cyl(r * 0.9, r, h - 0.22, 6), [x, 0.22 + (h - 0.22) / 2, z]), C.woodDark));
    }
}

/** Woven bamboo wall panel: a light infill with darker horizontal lath strips. */
function bambooWall(
  p: THREE.BufferGeometry[],
  w: number,
  h: number,
  d: number,
  at: [number, number, number],
): void {
  p.push(part(place(box(w, h, d), at), 0xd2b27a));
  const n = Math.max(2, Math.round(h / 0.3));
  for (let i = 1; i < n; i++) {
    const y = at[1] - h / 2 + (i * h) / n;
    p.push(part(place(box(w + 0.02, 0.04, d + 0.02), [at[0], y, at[2]]), C.bamboo));
  }
}

/** Prom ridge (lime stucco) with a Kompul Metre lotus spire and Kveay finials at the ends. */
function promRidge(p: THREE.BufferGeometry[], len: number, y: number, spire = true): void {
  p.push(part(place(box(len, 0.14, 0.18), [0, y, 0]), 0xf1ebdc));
  if (spire) p.push(part(place(new THREE.ConeGeometry(0.12, 0.6, lpSeg(6, 4)), [0, y + 0.35, 0]), 0xf1ebdc));
  for (const sx of [-1, 1]) {
    // Kveay / kantuy hong: a curved "rooster tail" hook at each gable end.
    p.push(part(place(box(0.08, 0.5, 0.1), [sx * (len / 2), y + 0.22, 0], [0, 0, sx * -0.5]), 0xf1ebdc));
    p.push(part(place(box(0.2, 0.08, 0.1), [sx * (len / 2 + 0.16), y + 0.46, 0]), 0xf1ebdc));
  }
}

/**
 * Pteas Kantaang stilt house (4 × 4 m, PK's reference file): three rows of posts on ssom
 * stone footings about 2.5 m high, woven bamboo walls, a straight two-sided gable roof and
 * a banok "bird wing" lean-to off the back wall against the rain; a ladder to the door.
 * The model's door side is +z; the scene turns houses to face east. A small spirit house
 * (Rean Tevoda) stands at the plot's north-east corner.
 */
export function stiltHouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const H = 2.2;
  stilts(p, [-1.3, 0, 1.3], [-1.1, 0.1, 1.2], H);
  p.push(part(place(box(3.0, 0.14, 2.8), [0, H, 0.05]), C.woodDark)); // floor
  bambooWall(p, 2.7, 1.25, 2.3, [0, H + 0.7, 0.1]);
  p.push(part(place(box(0.6, 1.0, 0.05), [0, H + 0.58, 1.27]), C.woodDark)); // door
  p.push(part(place(box(0.7, 0.45, 0.03), [0.75, H + 0.95, 1.27]), 0xffffff, CLOTH)); // cloth at the window
  p.push(part(place(gable(3.5, 3.0, 1.5), [0, H + 2.05, 0.1]), C.thatch)); // straight gable
  p.push(part(place(box(3.4, 0.06, 0.1), [0, H + 2.85, 0.1]), C.thatchDark)); // ridge
  // Banok: a lower lean-to roof off the back wall.
  p.push(part(place(box(3.2, 0.08, 1.1), [0, H + 1.35, -1.55], [-0.45, 0, 0]), C.thatchDark));
  for (const x of [-1.3, 1.3])
    p.push(part(place(cyl(0.06, 0.07, H + 0.9, 6), [x, (H + 0.9) / 2, -2.0]), C.wood));
  p.push(part(place(box(0.08, 2.3, 0.45), [0, H / 2 + 0.08, 1.75], [0.45, 0, 0]), C.woodDark)); // ladder
  // Spirit house on its post at the north-east corner of the plot.
  p.push(part(place(cyl(0.05, 0.05, 1.2, 5), [1.75, 0.6, 1.75]), C.wood));
  p.push(part(place(box(0.34, 0.26, 0.3), [1.75, 1.33, 1.75]), 0xd9a646));
  p.push(part(place(roof(0.5, 0.46, 0.3, 0.02), [1.75, 1.6, 1.75]), 0x9a4a32));
  return mergeGeometries(p)!;
}

/**
 * Pteas Rongdeung noble house (6 × 6 m, PK's reference file; the type is recorded much
 * later than Angkor, so HISTORICALLY_UNCERTAIN for the 12th century): raised high on a
 * grid of hardwood posts on ssom footings, a steep main gable with lower four-sided gallery
 * roofs all round, a grand central stair, a white prom ridge with a Kompul Metre lotus spire
 * and Kveay finials; tiled roofs; a spirit house at the north-east corner.
 */
export function nobleHouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const H = 2.6;
  stilts(p, [-2.2, -1.1, 0, 1.1, 2.2], [-2.0, -0.7, 0.6, 1.9], H, 0.13);
  p.push(part(place(box(5.2, 0.18, 4.6), [0, H, 0]), C.woodDark));
  p.push(part(place(box(4.9, 0.5, 0.06), [0, H + 0.3, 2.28]), C.wood)); // balustrade
  p.push(part(place(box(3.4, 1.9, 2.8), [0, H + 1.05, -0.1]), 0xb07a48)); // plank walls
  for (const x of [-1.2, 0, 1.2]) p.push(part(place(box(0.5, 1.1, 0.05), [x, H + 0.8, 1.32]), C.woodDark)); // doors
  // Lower gallery roof all round, then the steep main gable above it.
  p.push(part(place(roof(6.0, 5.4, 0.9, 0.62), [0, H + 2.15, 0]), C.tile));
  p.push(part(place(gable(3.9, 3.2, 2.2), [0, H + 3.55, -0.1]), C.tile));
  promRidge(p, 3.8, H + 4.73);
  for (const sx of [-1, 1])
    p.push(
      part(
        place(
          new THREE.CircleGeometry(0.5, 3),
          [sx * 1.96, H + 3.3, -0.1],
          [0, (sx * Math.PI) / 2, Math.PI / 2],
        ),
        0xd9b98a,
      ),
    ); // gable boards
  // Grand central stair.
  for (let k = 0; k < 6; k++)
    p.push(part(place(box(1.4, 0.2, 0.36), [0, H - 0.2 - k * 0.44, 2.45 + k * 0.1]), C.wood));
  for (const x of [-0.75, 0.75])
    p.push(part(place(box(0.1, 2.4, 0.12), [x, H / 2 + 0.2, 2.75], [0.25, 0, 0]), C.woodDark));
  // Spirit house (Rean Tevoda).
  p.push(part(place(cyl(0.06, 0.06, 1.3, 5), [2.6, 0.65, 2.6]), C.wood));
  p.push(part(place(box(0.42, 0.3, 0.36), [2.6, 1.45, 2.6]), 0xd9a646));
  p.push(part(place(roof(0.6, 0.54, 0.34, 0.02), [2.6, 1.75, 2.6]), 0x9a4a32));
  p.push(part(place(box(0.7, 0.4, 0.03), [1.6, H + 1.4, 1.34]), 0xffffff, CLOTH));
  return mergeGeometries(p)!;
}

/** Storehouse (6 × 6 m): raised granary, baskets, a stack of logs and cut blocks. */
export function storehouseGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-1.8, 0, 1.8])
    for (const z of [-1.5, 1.5]) p.push(part(place(cyl(0.12, 0.13, 1.4, 6), [x, 0.7, z]), C.wood));
  p.push(part(place(box(4.4, 0.18, 3.8), [0, 1.45, 0]), C.woodDark));
  p.push(part(place(box(4.0, 1.8, 3.4), [0, 2.45, 0]), 0xb58f5c));
  p.push(part(place(roof(5.2, 4.6, 1.8, 0.1), [0, 4.2, 0]), C.thatch));
  for (let k = 0; k < 4; k++)
    p.push(
      part(place(cyl(0.32, 0.25, 0.5, 8), [-2.4 + k * 0.7, 0.25, 2.55]), k % 2 ? C.bamboo : C.thatchDark),
    );
  for (let k = 0; k < 5; k++)
    p.push(
      part(
        place(cyl(0.16, 0.16, 2.2, 6), [2.55, 0.18 + (k % 2) * 0.28, -1.6 + k * 0.32], [0, 0, Math.PI / 2]),
        C.wood,
      ),
    );
  for (let k = 0; k < 3; k++)
    p.push(
      part(place(box(0.8, 0.45, 0.55), [-2.3, 0.23 + (k === 2 ? 0.45 : 0), -1.6 + (k % 2) * 0.7]), C.stone),
    );
  p.push(part(place(box(0.9, 0.6, 0.03), [0, 2.8, 1.72]), 0xffffff, CLOTH));
  return mergeGeometries(p)!;
}

/**
 * Lumber camp (6 × 6 m, PK: timber goes to the store by ox-cart): an open thatched shed on
 * four posts over a stack of logs, more logs stacked in the yard, a chopping block with an
 * axe, and a cart track. Ox-carts load here.
 */
export function lumberCampGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-1.6, 1.6])
    for (const z of [-1.2, 1.2]) p.push(part(place(cyl(0.12, 0.14, 2.4, 6), [x - 0.8, 1.2, z]), C.wood));
  p.push(part(place(roof(4.2, 3.4, 1.2, 0.1), [-0.8, 2.9, 0]), C.thatch));
  // Log stacks: under the shed, and two in the yard (crossed layers).
  const stack = (x: number, z: number, rows: number, along: boolean) => {
    for (let r = 0; r < rows; r++)
      for (let k = 0; k < 4 - (r % 2); k++) {
        const off = -0.6 + k * 0.4 + (r % 2) * 0.2;
        p.push(
          part(
            place(
              cyl(0.18, 0.18, 2.4, 7),
              along ? [x, 0.2 + r * 0.33, z + off] : [x + off, 0.2 + r * 0.33, z],
              along ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0],
            ),
            r % 2 ? C.wood : C.woodDark,
          ),
        );
      }
  };
  stack(-0.8, 0, 3, true);
  stack(1.9, -1.6, 2, false);
  stack(1.9, 1.4, 3, false);
  // Chopping block and axe.
  p.push(part(place(cyl(0.35, 0.4, 0.6, 8), [0.9, 0.3, 2.4]), C.woodDark));
  p.push(part(place(box(0.06, 0.06, 0.8), [0.9, 0.85, 2.4], [0.7, 0, 0]), C.wood));
  p.push(part(place(box(0.05, 0.25, 0.2), [0.9, 1.1, 2.65], [0.7, 0, 0]), 0x8a8a8a));
  // Bark and chips on the ground.
  p.push(part(place(box(5.6, 0.05, 5.2), [0, 0.025, 0]), C.earth));
  p.push(part(place(box(0.9, 0.6, 0.03), [-0.8, 2.2, 1.25]), 0xffffff, CLOTH));
  return mergeGeometries(p)!;
}

/** Rice field (8 × 6 m): earth bunds and shallow water; the rice plants are drawn apart. */
export function riceFieldGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(place(box(7.8, 0.06, 5.8), [0, 0.03, 0]), 0x7f9a78)); // muddy paddy water
  for (const [w, d, x, z] of [
    [8, 0.4, 0, 2.8],
    [8, 0.4, 0, -2.8],
    [0.4, 6, 3.8, 0],
    [0.4, 6, -3.8, 0],
  ] as const)
    p.push(part(place(box(w, 0.28, d), [x, 0.14, z]), C.earth));
  // The rice itself is drawn plant by plant as it grows (scene: syncRice, PK).
  return mergeGeometries(p)!;
}

/** War camp (8 × 8 m): palisade, a long hall, spear rack, practice post, a big banner. */
export function warCampGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const posts = 11;
  for (let side = 0; side < 4; side++)
    for (let i = 0; i < posts; i++) {
      const t = -3.8 + (i / (posts - 1)) * 7.6;
      if (side === 0 && Math.abs(t) < 1.2) continue; // gate
      const [x, z] = side === 0 ? [t, 3.8] : side === 1 ? [t, -3.8] : side === 2 ? [3.8, t] : [-3.8, t];
      p.push(part(place(new THREE.ConeGeometry(0.16, 2.0, lpSeg(6, 4)), [x, 1.0, z]), C.wood));
    }
  p.push(part(place(box(5.2, 0.2, 2.8), [0, 0.8, -1.4]), C.woodDark));
  for (const x of [-2.4, 2.4])
    for (const z of [-2.7, -0.1]) p.push(part(place(cyl(0.1, 0.1, 1.6, 6), [x, 1.6, z]), C.wood));
  p.push(part(place(gable(5.8, 3.4, 1.4), [0, 3.0, -1.4]), C.thatch));
  for (let k = 0; k < 5; k++)
    p.push(part(place(cyl(0.025, 0.025, 2.4, 4), [1.6 + k * 0.22, 1.2, 1.6], [0.15, 0, 0]), C.woodDark)); // spears
  p.push(part(place(cyl(0.12, 0.12, 1.6, 6), [-1.8, 0.8, 1.6]), C.thatchDark)); // practice post
  p.push(...banner(-3.2, 3.2, 5.0, 1.5));
  return mergeGeometries(p)!;
}

/** The rival chiefdom's stockade (10 × 10 m, gameplay fiction): round palisade, huts, fire. */
export function rivalCampGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.25) continue;
    p.push(
      part(
        place(new THREE.ConeGeometry(0.2, 2.4, lpSeg(6, 4)), [Math.cos(a) * 4.6, 1.2, Math.sin(a) * 4.6]),
        C.woodDark,
      ),
    );
  }
  for (const [x, z] of [
    [-1.8, -1.6],
    [1.9, -1.2],
    [0, 1.8],
  ] as const) {
    p.push(part(place(cyl(1.1, 1.2, 1.2, 8), [x, 0.6, z]), 0x9a7a54));
    p.push(part(place(new THREE.ConeGeometry(1.5, 1.6, lpSeg(8, 5)), [x, 2.0, z]), C.thatchDark));
  }
  p.push(part(place(cyl(0.5, 0.6, 0.2, 8), [0.2, 0.1, -0.1]), 0x3a2a20));
  p.push(...banner(-3.5, 2.5, 4.6, 1.3), ...banner(3.5, 2.5, 4.6, 1.3));
  return mergeGeometries(p)!;
}

/** Scaffolding and a heap of materials shown while a building is under construction. */
export function scaffoldGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-0.5, 0.5])
    for (const z of [-0.5, 0.5]) p.push(part(place(cyl(0.02, 0.02, 1, 4), [x, 0.5, z]), C.bamboo));
  for (const y of [0.35, 0.7])
    for (const [w, d, x, z] of [
      [1, 0.02, 0, 0.5],
      [1, 0.02, 0, -0.5],
      [0.02, 1, 0.5, 0],
      [0.02, 1, -0.5, 0],
    ] as const)
      p.push(part(place(box(w, 0.02, d), [x, y, z]), C.bamboo));
  return mergeGeometries(p)!;
}

// ---------------------------------------------------------------- units

/** Spearman: spear (the worker's pole) and a round rattan shield on the left arm. */
export function spearmanGeometry(): THREE.BufferGeometry {
  const shield = part(
    place(
      new THREE.CylinderGeometry(0.34, 0.34, 0.05, lpSeg(12, 6)),
      [-0.46, 1.05, 0.12],
      [0, 0, Math.PI / 2],
    ),
    0xffffff,
    [ARM_L[0], ARM_L[1], ARM_L[2], 1],
  );
  const boss = part(place(new THREE.SphereGeometry(0.08, 6, 4), [-0.5, 1.05, 0.12]), C.gold, ARM_L);
  return mergeGeometries([workerGeometry('pole'), shield, boss])!;
}

/**
 * Swordsman (Bokator, D63): a Khmer dao, a slightly curved single-edged blade, in the right
 * hand; a small round shield on the left forearm; red sangvar cords round the upper arms and
 * a krama (in the team colour) round the waist and as a headband.
 */
export function swordsmanGeometry(): THREE.BufferGeometry {
  const FORE_R: Limb = [-1, 1.5, LIMB.forearm, 0];
  const FORE_L: Limb = [1, 1.5, LIMB.forearm, 0];
  const p: THREE.BufferGeometry[] = [workerGeometry()];
  // Dao: grip, guard and a two-part blade that curves forward.
  p.push(
    part(place(cyl(0.025, 0.025, 0.2, 6), [0.355, 0.84, 0.08], [Math.PI / 2, 0, 0]), C.woodDark, FORE_R),
  );
  p.push(part(place(box(0.1, 0.02, 0.05), [0.355, 0.84, 0.19]), C.gold, FORE_R));
  p.push(part(place(box(0.025, 0.05, 0.42), [0.355, 0.85, 0.41], [-0.04, 0, 0]), 0xd9dde0, FORE_R));
  p.push(part(place(box(0.022, 0.045, 0.2), [0.355, 0.88, 0.7], [-0.22, 0, 0]), 0xd9dde0, FORE_R));
  // Round shield on the left forearm.
  p.push(
    part(
      place(
        new THREE.CylinderGeometry(0.22, 0.22, 0.04, lpSeg(12, 6)),
        [-0.42, 1.02, 0.1],
        [0, 0, Math.PI / 2],
      ),
      0xffffff,
      [FORE_L[0], FORE_L[1], FORE_L[2], 1],
    ),
  );
  p.push(part(place(new THREE.SphereGeometry(0.05, 6, 4), [-0.45, 1.02, 0.1]), C.gold, FORE_L));
  // Sangvar cords (red) on both upper arms, krama round the waist and head.
  for (const s of [-1, 1])
    p.push(
      part(
        place(
          new THREE.TorusGeometry(0.082, 0.016, 3, lpSeg(10, 4)),
          [s * 0.33, 1.22, 0],
          [Math.PI / 2, 0, 0],
        ),
        0xc0282a,
        [-s, 1.5, LIMB.arm, 0],
      ),
    );
  p.push(
    part(
      place(new THREE.TorusGeometry(0.225, 0.03, 4, lpSeg(14, 6)), [0, 0.99, 0], [Math.PI / 2, 0, 0]),
      0xffffff,
      CLOTH,
    ),
  );
  p.push(
    part(
      place(new THREE.TorusGeometry(0.128, 0.018, 3, lpSeg(12, 5)), [0, 1.86, 0], [Math.PI / 2 - 0.15, 0, 0]),
      0xffffff,
      CLOTH,
    ),
  );
  return mergeGeometries(p)!;
}

/** Archer: a long bow held in the left hand and a quiver on the back. */
export function archerGeometry(): THREE.BufferGeometry {
  const bow = part(
    place(
      new THREE.TorusGeometry(0.62, 0.022, 4, lpSeg(14, 7), Math.PI * 0.8),
      [-0.4, 1.05, 0.3],
      [0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.4],
    ),
    C.woodDark,
    ARM_L,
  );
  const quiver = part(place(cyl(0.07, 0.06, 0.6, 6), [0.12, 1.35, -0.2], [0.3, 0, 0.2]), 0xffffff, CLOTH);
  return mergeGeometries([workerGeometry(), bow, quiver])!;
}

/** A low-poly boulder for stone and gold sources. */
export function boulderGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.9, 0);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setY(i, y < 0 ? y * 0.3 : y * 0.8);
    pos.setX(i, pos.getX(i) * (1 + Math.sin(i * 1.7) * 0.12));
  }
  g.computeVertexNormals();
  g.translate(0, 0.3, 0);
  return g;
}

/**
 * What an opponent's soldiers wear on the head (campaign.json `look`). Cham: the lotus-like
 * petal headdress carved on the Bayon reliefs. Đại Việt: a broad conical hat (an
 * abstraction; 12th-century Viet dress is poorly documented). Khmer rivals and the
 * fictional chiefdom: none (only their colour differs).
 */
export function headwear(look: string, top: number, z = 0): THREE.BufferGeometry[] {
  if (look === 'cham') {
    const p: THREE.BufferGeometry[] = [];
    p.push(part(place(cyl(0.13, 0.1, 0.08, 8), [0, top - 0.02, z]), C.gold));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      p.push(
        part(
          place(
            new THREE.ConeGeometry(0.05, 0.24, 4),
            [Math.sin(a) * 0.1, top + 0.1, z + Math.cos(a) * 0.1],
            [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35],
          ),
          0xe6d3b0,
        ),
      );
    }
    return p;
  }
  if (look === 'daiviet')
    return [part(place(new THREE.ConeGeometry(0.3, 0.16, lpSeg(10, 6)), [0, top + 0.02, z]), 0xd8c08a)];
  return [];
}

/** A palm-leaf manuscript (satra) between wooden covers, tied with a cord: the icon for learning. */
export function manuscriptGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(place(box(1.6, 0.08, 0.34), [0, 0.04, 0]), C.woodDark));
  for (let i = 0; i < 6; i++)
    p.push(part(place(box(1.52, 0.035, 0.3), [0, 0.1 + i * 0.04, 0]), i % 2 ? 0xe8d8a8 : 0xd9c48e));
  p.push(part(place(box(1.6, 0.08, 0.34), [0, 0.37, 0]), C.woodDark));
  p.push(part(place(cyl(0.02, 0.02, 0.5, 5), [0, 0.2, 0], [0, 0, 0]), 0xc0282a));
  p.push(part(place(new THREE.TorusGeometry(0.2, 0.02, 3, 10), [0, 0.2, 0.18], [0, 0, 0]), 0xc0282a));
  return mergeGeometries(p)!.translate(0, 0.2, 0).rotateX(-0.3);
}
