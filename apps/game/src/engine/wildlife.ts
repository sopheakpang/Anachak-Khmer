import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIMB, part, place, taperedTube } from './figures';
import { seg as lpSeg } from './look';
import { elephantGeometry, loft, type Section } from './animals';

/**
 * Cambodia's forest wildlife (PK's list, D75), built in code in the same low-poly style as
 * engine/animals.ts: bodies lofted from elliptical sections, flat vertex colours, legs as
 * short tapered tubes that swing on the GPU (LIMB.leg), tails and heads that sway
 * (LIMB.sway), primate arms on LIMB.arm. Snakes and the crocodile have no swinging legs:
 * the body is still and the head/tail sway, so they glide instead of trotting.
 *
 * Each model stays near 600 triangles (the wild elephant reuses the Asian elephant without
 * its caparison). All face +Z, stand on y = 0, units are metres.
 */

type Limb = [sign: number, pivot: number, kind: number, cloth: number, pivotZ?: number];
type Leg = [x: number, z: number, top: number, sign: number];

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ball = (r: number) => new THREE.SphereGeometry(r, lpSeg(8, 4), lpSeg(6, 3));
const EYE = 0x140d0a;
const HORN = 0xd9ccb0;

/** A small flat patch on the coat (spots, blotches, chest marks): 8 triangles. */
function spot(
  pos: [number, number, number],
  size: [number, number, number],
  hex: number,
  limb?: Limb,
): THREE.BufferGeometry {
  return part(place(new THREE.OctahedronGeometry(1, 0), pos, [0, 0, 0], size), hex, limb);
}

function tube(points: THREE.Vector3[], r0: number, r1: number, hex: number, limb?: Limb, segs = 4) {
  return part(taperedTube(points, r0, r1, segs, 6), hex, limb);
}

/** Four swinging legs; `sock` paints the lower part (white stockings of wild cattle). */
function legs(
  list: Leg[],
  r: number,
  hex: number,
  sock?: { hex: number; height: number },
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const [x, z, top, s] of list) {
    const l: Limb = [s, top, LIMB.leg, 0, z];
    out.push(tube([v(x, top, z), v(x, top * 0.5, z + 0.02), v(x, 0.03, z)], r, r * 0.6, hex, l, 3));
    if (sock)
      out.push(tube([v(x, sock.height, z + 0.01), v(x, 0.02, z + 0.01)], r * 0.72, r * 0.66, sock.hex, l, 1));
  }
  return out;
}

const tail = (pts: THREE.Vector3[], r0: number, r1: number, hex: number, segs = 3) =>
  tube(pts, r0, r1, hex, [-1, pts[0]!.y, LIMB.sway, 0, pts[0]!.z], segs);

const eyes = (x: number, y: number, z: number, r = 0.025, hex = EYE) =>
  [-1, 1].map((s) => part(place(ball(r), [s * x, y, z]), hex));

// ---------------------------------------------------------------- large mammals and forest cattle

/** Asian elephant of the deep forest: the Bayon elephant without its caparison. */
export function wildElephantGeometry(): THREE.BufferGeometry {
  return elephantGeometry({ wild: true });
}

/** Wild cattle body shared by gaur and kouprey: deep chest, sloping back, long head. */
function wildCattle(o: {
  coat: number;
  sock: number;
  ridge: number;
  horns: THREE.Vector3[];
  hornR: number;
  dewlap?: number;
}): THREE.BufferGeometry[] {
  const C = o.coat;
  const parts: THREE.BufferGeometry[] = [
    part(
      loft(
        [
          { z: -0.9, y: 1.05, w: 0.18, h: 0.24 },
          { z: -0.76, y: 1.06, w: 0.36, h: 0.42 },
          { z: -0.25, y: 1.08, w: 0.42, h: 0.5 },
          { z: 0.3, y: 1.14, w: 0.44, h: 0.56 },
          { z: 0.66, y: 1.2, w: 0.34, h: 0.46 },
          { z: 0.86, y: 1.26, w: 0.2, h: 0.28 },
        ],
        12,
      ),
      C,
    ),
    // The shoulder ridge (the gaur's is huge).
    part(place(ball(0.3), [0, 1.62, 0.25], [0.15, 0, 0], [0.7, o.ridge, 1.6]), C),
    part(
      loft(
        [
          { z: 0.8, y: 1.28, w: 0.19, h: 0.24 },
          { z: 1.05, y: 1.22, w: 0.17, h: 0.2 },
          { z: 1.28, y: 1.04, w: 0.13, h: 0.15 },
          { z: 1.42, y: 0.92, w: 0.1, h: 0.1 },
        ],
        10,
      ),
      C,
    ),
    part(place(ball(0.1), [0, 0.9, 1.44], [0, 0, 0], [1.1, 0.8, 0.7]), 0x9a9086), // pale muzzle
    ...eyes(0.13, 1.18, 1.18),
    ...legs(
      [
        [-0.22, 0.5, 0.88, 1],
        [0.22, 0.5, 0.88, -1],
        [-0.22, -0.62, 0.92, -1],
        [0.22, -0.62, 0.92, 1],
      ],
      0.1,
      C,
      { hex: o.sock, height: 0.36 },
    ),
    tail([v(0, 1.2, -0.9), v(0, 0.85, -1.0), v(0, 0.5, -0.98)], 0.04, 0.03, C),
  ];
  if (o.dewlap !== undefined)
    parts.push(part(place(ball(0.3), [0, 0.78, 0.8], [0, 0, 0], [0.16, o.dewlap, 0.9]), C));
  for (const s of [-1, 1]) {
    parts.push(
      tube(
        o.horns.map((p) => v(p.x * s, p.y, p.z)),
        o.hornR,
        o.hornR * 0.3,
        HORN,
        undefined,
        4,
      ),
    );
    parts.push(part(place(ball(0.09), [s * 0.2, 1.24, 1.0], [0, 0, s * 0.9], [1.3, 0.35, 0.7]), C)); // ears
  }
  return parts;
}

/** Gaur: the largest wild cattle, almost black, white stockings, a huge shoulder hump. */
export function gaurGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    wildCattle({
      coat: 0x241812,
      sock: 0xeee6d2,
      ridge: 1.25,
      horns: [v(0.12, 1.4, 1.0), v(0.3, 1.5, 1.0), v(0.36, 1.68, 1.08), v(0.26, 1.8, 1.12)],
      hornR: 0.055,
    }),
  )!;
}

/** Kouprey: grey-black forest ox, long horns that sweep out and curl up, a deep dewlap. */
export function koupreyGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    wildCattle({
      coat: 0x3b3936,
      sock: 0xb7b0a2,
      ridge: 0.7,
      dewlap: 1.0,
      horns: [v(0.12, 1.4, 1.0), v(0.42, 1.42, 1.08), v(0.6, 1.62, 1.2), v(0.5, 1.86, 1.12)],
      hornR: 0.05,
    }),
  )!;
}

/** Serow: a dark goat-antelope with a pale shaggy mane, short horns and long ears. */
export function serowGeometry(): THREE.BufferGeometry {
  const C = 0x2a2420;
  const parts: THREE.BufferGeometry[] = [
    part(
      loft(
        [
          { z: -0.5, y: 0.66, w: 0.12, h: 0.14 },
          { z: -0.4, y: 0.68, w: 0.2, h: 0.24 },
          { z: 0.05, y: 0.72, w: 0.23, h: 0.28 },
          { z: 0.36, y: 0.78, w: 0.2, h: 0.26 },
          { z: 0.5, y: 0.9, w: 0.13, h: 0.18 },
        ],
        12,
      ),
      C,
    ),
    part(
      loft(
        [
          { z: 0.46, y: 1.06, w: 0.1, h: 0.12 },
          { z: 0.62, y: 1.08, w: 0.09, h: 0.1 },
          { z: 0.78, y: 0.98, w: 0.06, h: 0.07 },
        ],
        10,
      ),
      C,
    ),
    // Mane from the crown down the neck to the withers.
    part(place(new THREE.BoxGeometry(0.06, 0.2, 0.46), [0, 1.06, 0.28], [0.5, 0, 0]), 0xbdb5a6),
    ...eyes(0.07, 1.1, 0.66),
    ...legs(
      [
        [-0.12, 0.32, 0.6, 1],
        [0.12, 0.32, 0.6, -1],
        [-0.12, -0.36, 0.62, -1],
        [0.12, -0.36, 0.62, 1],
      ],
      0.05,
      C,
    ),
    tail([v(0, 0.72, -0.5), v(0, 0.58, -0.56)], 0.03, 0.02, C, 2),
  ];
  for (const s of [-1, 1]) {
    parts.push(
      tube([v(s * 0.05, 1.16, 0.58), v(s * 0.07, 1.3, 0.5), v(s * 0.07, 1.36, 0.4)], 0.025, 0.008, 0x1a1512),
    );
    parts.push(part(place(ball(0.06), [s * 0.13, 1.18, 0.54], [0, 0, s * 0.6], [0.5, 1.4, 0.35]), C)); // long ears
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- predators

/** A big cat: long low body, round head, long tail; coat marks are added by the caller. */
function cat(o: {
  coat: number;
  scale: number;
  tailLen: number;
  tailR: number;
  belly: number;
}): THREE.BufferGeometry[] {
  const k = o.scale;
  const C = o.coat;
  return [
    part(
      loft(
        [
          { z: -0.8 * k, y: 0.7 * k, w: 0.12 * k, h: 0.13 * k },
          { z: -0.66 * k, y: 0.72 * k, w: 0.22 * k, h: 0.24 * k },
          { z: -0.15 * k, y: 0.7 * k, w: 0.25 * k, h: 0.25 * k },
          { z: 0.35 * k, y: 0.76 * k, w: 0.25 * k, h: 0.27 * k },
          { z: 0.58 * k, y: 0.82 * k, w: 0.19 * k, h: 0.21 * k },
        ],
        12,
      ),
      C,
    ),
    part(
      loft(
        [
          { z: 0.56 * k, y: 0.9 * k, w: 0.16 * k, h: 0.16 * k },
          { z: 0.78 * k, y: 0.9 * k, w: 0.15 * k, h: 0.14 * k },
          { z: 0.94 * k, y: 0.83 * k, w: 0.08 * k, h: 0.07 * k },
        ],
        10,
      ),
      C,
    ),
    part(place(new THREE.BoxGeometry(0.3 * k, 0.06 * k, 1.0 * k), [0, 0.5 * k, -0.08 * k]), o.belly),
    ...[-1, 1].map((s) => part(place(ball(0.045 * k), [s * 0.11 * k, 1.04 * k, 0.66 * k]), C)), // ears
    ...eyes(0.07 * k, 0.94 * k, 0.9 * k, 0.022 * k),
    ...legs(
      [
        [-0.15 * k, 0.4 * k, 0.66 * k, 1],
        [0.15 * k, 0.4 * k, 0.66 * k, -1],
        [-0.15 * k, -0.56 * k, 0.68 * k, -1],
        [0.15 * k, -0.56 * k, 0.68 * k, 1],
      ],
      0.075 * k,
      C,
    ),
    tail(
      [
        v(0, 0.72 * k, -0.8 * k),
        v(0, 0.55 * k, -(0.8 + o.tailLen * 0.4) * k),
        v(0, 0.42 * k, -(0.8 + o.tailLen * 0.8) * k),
        v(0, 0.5 * k, -(0.8 + o.tailLen) * k),
      ],
      o.tailR * k,
      o.tailR * 0.8 * k,
      C,
      4,
    ),
  ];
}

/** Indochinese leopard: tawny with dark rosettes (a few spots read at RTS distance). */
export function leopardGeometry(): THREE.BufferGeometry {
  const parts = cat({ coat: 0xc8954a, scale: 0.92, tailLen: 0.8, tailR: 0.04, belly: 0xefe2c4 });
  const D = 0x2a1d14;
  const spots: Array<[number, number, number]> = [
    [0.18, 0.72, -0.5],
    [-0.2, 0.76, -0.25],
    [0.2, 0.74, 0.05],
    [-0.18, 0.7, 0.25],
    [0.17, 0.66, 0.42],
    [-0.12, 0.86, -0.6],
    [0.0, 0.9, 0.1],
    [0.1, 0.9, -0.35],
  ];
  for (const [x, y, z] of spots) parts.push(spot([x, y, z], [0.05, 0.05, 0.05], D));
  return mergeGeometries(parts)!;
}

/** Clouded leopard: grey-tan with big dark "cloud" blotches and a very long thick tail. */
export function cloudedLeopardGeometry(): THREE.BufferGeometry {
  const parts = cat({ coat: 0xa38c62, scale: 0.78, tailLen: 1.15, tailR: 0.06, belly: 0xd9cdb2 });
  const D = 0x3a2c1e;
  const blotches: Array<[number, number, number]> = [
    [0.16, 0.6, -0.42],
    [-0.16, 0.6, -0.2],
    [0.17, 0.6, 0.06],
    [-0.16, 0.62, 0.26],
    [0.0, 0.76, -0.3],
    [0.0, 0.78, 0.12],
  ];
  for (const [x, y, z] of blotches) parts.push(spot([x, y, z], [0.07, 0.07, 0.11], D));
  return mergeGeometries(parts)!;
}

/** A bear: heavy rounded body, short legs, small round ears; the chest mark is the caller's. */
function bear(coat: number, k: number, muzzle: number, earR: number): THREE.BufferGeometry[] {
  return [
    part(
      loft(
        [
          { z: -0.55 * k, y: 0.6 * k, w: 0.18 * k, h: 0.2 * k },
          { z: -0.42 * k, y: 0.64 * k, w: 0.32 * k, h: 0.36 * k },
          { z: 0.0, y: 0.68 * k, w: 0.36 * k, h: 0.4 * k },
          { z: 0.36 * k, y: 0.7 * k, w: 0.32 * k, h: 0.36 * k },
          { z: 0.56 * k, y: 0.76 * k, w: 0.2 * k, h: 0.24 * k },
        ],
        12,
      ),
      coat,
    ),
    part(
      loft(
        [
          { z: 0.5 * k, y: 0.84 * k, w: 0.18 * k, h: 0.18 * k },
          { z: 0.72 * k, y: 0.82 * k, w: 0.15 * k, h: 0.14 * k },
          { z: 0.88 * k, y: 0.76 * k, w: 0.07 * k, h: 0.07 * k },
        ],
        10,
      ),
      coat,
    ),
    part(place(ball(0.07 * k), [0, 0.76 * k, 0.86 * k], [0, 0, 0], [1, 0.8, 1]), muzzle),
    ...[-1, 1].map((s) => part(place(ball(earR * k), [s * 0.14 * k, 1.0 * k, 0.6 * k]), coat)),
    ...eyes(0.08 * k, 0.9 * k, 0.8 * k, 0.02 * k, 0x3a2a1c),
    ...legs(
      [
        [-0.2 * k, 0.32 * k, 0.5 * k, 1],
        [0.2 * k, 0.32 * k, 0.5 * k, -1],
        [-0.2 * k, -0.36 * k, 0.52 * k, -1],
        [0.2 * k, -0.36 * k, 0.52 * k, 1],
      ],
      0.1 * k,
      coat,
    ),
  ];
}

/** Sun bear: the smallest bear, black with a pale orange chest patch and a pale muzzle. */
export function sunBearGeometry(): THREE.BufferGeometry {
  const parts = bear(0x1c1816, 0.8, 0xc8a070, 0.045);
  parts.push(spot([0, 0.6, 0.6], [0.13, 0.1, 0.06], 0xe0b46a));
  return mergeGeometries(parts)!;
}

/** Asiatic black bear (moon bear): bigger, black, a white crescent on the chest, big ears. */
export function moonBearGeometry(): THREE.BufferGeometry {
  const parts = bear(0x141212, 1.05, 0x8a7a66, 0.075);
  // The crescent: two pale bars in a V across the chest.
  for (const s of [-1, 1])
    parts.push(
      part(place(new THREE.BoxGeometry(0.22, 0.05, 0.04), [s * 0.1, 0.76, 0.84], [0, 0, s * 0.45]), 0xf2ecdf),
    );
  return mergeGeometries(parts)!;
}

/** Dhole: a reddish wild dog, pale throat, dark bushy tail; hunts in packs. */
export function dholeGeometry(): THREE.BufferGeometry {
  const C = 0xb5562a;
  const parts: THREE.BufferGeometry[] = [
    part(
      loft(
        [
          { z: -0.45, y: 0.48, w: 0.09, h: 0.1 },
          { z: -0.38, y: 0.5, w: 0.14, h: 0.16 },
          { z: 0.0, y: 0.5, w: 0.15, h: 0.17 },
          { z: 0.28, y: 0.54, w: 0.14, h: 0.18 },
          { z: 0.4, y: 0.6, w: 0.1, h: 0.13 },
        ],
        12,
      ),
      C,
    ),
    part(
      loft(
        [
          { z: 0.38, y: 0.7, w: 0.09, h: 0.09 },
          { z: 0.52, y: 0.7, w: 0.08, h: 0.08 },
          { z: 0.66, y: 0.64, w: 0.04, h: 0.04 },
        ],
        10,
      ),
      C,
    ),
    part(place(ball(0.08), [0, 0.5, 0.36], [0, 0, 0], [0.9, 1, 0.8]), 0xead8bc), // pale throat
    ...[-1, 1].map((s) =>
      part(place(new THREE.ConeGeometry(0.035, 0.1, 4), [s * 0.06, 0.8, 0.44], [0, 0, s * 0.2]), C),
    ),
    ...eyes(0.05, 0.74, 0.58, 0.015),
    ...legs(
      [
        [-0.08, 0.28, 0.46, 1],
        [0.08, 0.28, 0.46, -1],
        [-0.08, -0.32, 0.46, -1],
        [0.08, -0.32, 0.46, 1],
      ],
      0.035,
      C,
    ),
    tail([v(0, 0.52, -0.45), v(0, 0.4, -0.62), v(0, 0.3, -0.74)], 0.05, 0.04, 0x2a1a12),
  ];
  return mergeGeometries(parts)!;
}

/** Binturong (bearcat): a shaggy black civet with a long thick prehensile tail and ear tufts. */
export function binturongGeometry(): THREE.BufferGeometry {
  const C = 0x1e1b1a;
  const parts: THREE.BufferGeometry[] = [
    part(
      loft(
        [
          { z: -0.4, y: 0.36, w: 0.1, h: 0.1 },
          { z: -0.3, y: 0.38, w: 0.16, h: 0.17 },
          { z: 0.05, y: 0.38, w: 0.17, h: 0.18 },
          { z: 0.3, y: 0.4, w: 0.13, h: 0.15 },
        ],
        12,
      ),
      C,
    ),
    part(
      loft(
        [
          { z: 0.28, y: 0.46, w: 0.1, h: 0.1 },
          { z: 0.42, y: 0.46, w: 0.08, h: 0.08 },
          { z: 0.54, y: 0.42, w: 0.03, h: 0.03 },
        ],
        10,
      ),
      0x6d6a64,
    ),
    ...[-1, 1].map((s) =>
      part(place(new THREE.ConeGeometry(0.03, 0.1, 4), [s * 0.07, 0.58, 0.32], [0, 0, s * 0.3]), C),
    ),
    ...eyes(0.05, 0.5, 0.46, 0.015, 0x8a5a2a),
    ...legs(
      [
        [-0.1, 0.2, 0.3, 1],
        [0.1, 0.2, 0.3, -1],
        [-0.1, -0.26, 0.3, -1],
        [0.1, -0.26, 0.3, 1],
      ],
      0.045,
      C,
    ),
    // The long prehensile tail, curled at the tip.
    tail(
      [v(0, 0.36, -0.4), v(0, 0.3, -0.7), v(0, 0.2, -0.95), v(0.05, 0.3, -1.08), v(0.02, 0.36, -1.0)],
      0.08,
      0.04,
      C,
      5,
    ),
  ];
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- primates

/** A monkey on all fours (macaques, langurs, doucs): colours by body part. */
function monkey(o: {
  coat: number;
  face: number;
  arms: number;
  legsHex: number;
  tail: number;
  tailLen: number;
  k: number;
}): THREE.BufferGeometry[] {
  const k = o.k;
  const parts: THREE.BufferGeometry[] = [
    part(
      loft(
        [
          { z: -0.28 * k, y: 0.42 * k, w: 0.1 * k, h: 0.1 * k },
          { z: -0.2 * k, y: 0.44 * k, w: 0.14 * k, h: 0.14 * k },
          { z: 0.1 * k, y: 0.5 * k, w: 0.15 * k, h: 0.15 * k },
          { z: 0.26 * k, y: 0.56 * k, w: 0.11 * k, h: 0.12 * k },
        ],
        12,
      ),
      o.coat,
    ),
    part(place(ball(0.11 * k), [0, 0.68 * k, 0.32 * k]), o.coat),
    part(place(ball(0.07 * k), [0, 0.66 * k, 0.4 * k], [0, 0, 0], [1, 1, 0.6]), o.face),
    ...eyes(0.035 * k, 0.7 * k, 0.43 * k, 0.014 * k),
    tail(
      [
        v(0, 0.46 * k, -0.28 * k),
        v(0, 0.6 * k, -(0.28 + o.tailLen * 0.4) * k),
        v(0, 0.3 * k, -(0.28 + o.tailLen) * k),
      ],
      0.03 * k,
      0.02 * k,
      o.tail,
    ),
  ];
  for (const [x, z, top, s, hex] of [
    [-0.09, 0.2, 0.5, 1, o.arms],
    [0.09, 0.2, 0.5, -1, o.arms],
    [-0.09, -0.2, 0.44, -1, o.legsHex],
    [0.09, -0.2, 0.44, 1, o.legsHex],
  ] as const)
    parts.push(
      tube(
        [v(x * k, top * k, z * k), v(x * k, top * 0.5 * k, (z + 0.02) * k), v(x * k, 0.02, z * k)],
        0.035 * k,
        0.025 * k,
        hex,
        [s, top * k, LIMB.leg, 0, z * k],
        3,
      ),
    );
  return parts;
}

/** Macaque (long-tailed / pig-tailed): brown-grey, pinkish face, long tail. */
export function macaqueGeometry(): THREE.BufferGeometry {
  return mergeGeometries(
    monkey({
      coat: 0x8a7558,
      face: 0xc9927a,
      arms: 0x8a7558,
      legsHex: 0x7a664c,
      tail: 0x7a664c,
      tailLen: 0.5,
      k: 1,
    }),
  )!;
}

/** Silvered langur: silver-grey leaf monkey with a dark face, a crest and a very long tail. */
export function langurGeometry(): THREE.BufferGeometry {
  const parts = monkey({
    coat: 0x9a9b98,
    face: 0x2a2826,
    arms: 0x8a8b88,
    legsHex: 0x8a8b88,
    tail: 0x8a8b88,
    tailLen: 0.8,
    k: 1.05,
  });
  parts.push(part(place(new THREE.ConeGeometry(0.05, 0.12, 4), [0, 0.86, 0.32]), 0xb4b5b2)); // crest
  return mergeGeometries(parts)!;
}

/** Red-shanked douc: grey body, red lower legs, white forearms and tail, golden face. */
export function doucGeometry(): THREE.BufferGeometry {
  const parts = monkey({
    coat: 0x6f6e6a,
    face: 0xd9a24a,
    arms: 0xeeeeea,
    legsHex: 0x9a2c22,
    tail: 0xeeeeea,
    tailLen: 0.75,
    k: 1.05,
  });
  parts.push(part(place(ball(0.06), [0, 0.6, 0.41], [0, 0, 0], [1.6, 0.6, 0.6]), 0xf2efe6)); // white throat
  return mergeGeometries(parts)!;
}

/** Gibbon: upright, very long arms (swinging), no tail; dark coat with a pale face ring. */
export function gibbonGeometry(): THREE.BufferGeometry {
  const C = 0x2a2420;
  const parts: THREE.BufferGeometry[] = [
    part(
      loft(
        [
          { z: 0, y: 0.38, w: 0.1, h: 0.08 },
          { z: 0, y: 0.5, w: 0.13, h: 0.1 },
          { z: 0, y: 0.7, w: 0.14, h: 0.11 },
          { z: 0, y: 0.84, w: 0.1, h: 0.08 },
        ].map((s) => ({ ...s, z: s.y, y: 0 })),
        12,
      )
        .rotateX(-Math.PI / 2)
        .rotateX(0.12),
      C,
    ),
    part(place(ball(0.1), [0, 0.96, 0.05]), C),
    part(place(ball(0.075), [0, 0.95, 0.1], [0, 0, 0], [1, 1, 0.6]), 0xd8c8a8), // pale face ring
    part(place(ball(0.05), [0, 0.94, 0.13], [0, 0, 0], [1, 1, 0.6]), 0x1a1412),
    ...eyes(0.03, 0.97, 0.15, 0.012, 0x6a4a2a),
  ];
  for (const s of [-1, 1]) {
    // Arms longer than the body, hanging forward; they swing as it moves.
    parts.push(
      tube([v(s * 0.15, 0.82, 0.02), v(s * 0.22, 0.5, 0.12), v(s * 0.2, 0.14, 0.16)], 0.035, 0.025, C, [
        s,
        0.82,
        LIMB.arm,
        0,
        0.02,
      ]),
    );
    parts.push(
      tube(
        [v(s * 0.07, 0.4, 0), v(s * 0.1, 0.2, 0.05), v(s * 0.08, 0.02, 0.04)],
        0.04,
        0.03,
        C,
        [s, 0.4, LIMB.leg, 0, 0],
        3,
      ),
    );
  }
  return mergeGeometries(parts)!;
}

/** Slow loris: small, round, woolly, with huge dark eyes ringed in white; no tail. */
export function slowLorisGeometry(): THREE.BufferGeometry {
  const C = 0xb08a62;
  const parts: THREE.BufferGeometry[] = [
    part(place(ball(0.12), [0, 0.2, 0], [0, 0, 0], [0.9, 0.85, 1.25]), C),
    part(place(new THREE.BoxGeometry(0.03, 0.02, 0.26), [0, 0.3, 0]), 0x5a3a22), // dark back stripe
    part(place(ball(0.08), [0, 0.28, 0.16]), C),
    ...eyes(0.04, 0.3, 0.22, 0.03, 0xf2ecdf),
    ...eyes(0.04, 0.3, 0.24, 0.022, 0x140d0a),
    ...legs(
      [
        [-0.06, 0.08, 0.14, 1],
        [0.06, 0.08, 0.14, -1],
        [-0.06, -0.08, 0.14, -1],
        [0.06, -0.08, 0.14, 1],
      ],
      0.025,
      C,
    ),
  ];
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- birds

/** Giant ibis: dark body with grey wings, bare grey head, long down-curved bill, red legs. */
export function giantIbisGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    part(place(ball(0.2), [0, 0.7, 0], [0.2, 0, 0], [0.85, 0.85, 1.4]), 0x3a3632),
    part(place(ball(0.18), [0, 0.74, -0.06], [0.2, 0, 0], [0.95, 0.6, 1.3]), 0x8a8780), // folded wings
    tube([v(0, 0.78, 0.2), v(0, 0.95, 0.28), v(0, 1.08, 0.3)], 0.05, 0.04, 0x3a3632, undefined, 3),
    part(place(ball(0.07), [0, 1.12, 0.32]), 0x7a7670),
    // The long down-curved bill; the head bobs (sway) as it feeds.
    tube(
      [v(0, 1.12, 0.38), v(0, 1.06, 0.52), v(0, 0.94, 0.6)],
      0.02,
      0.008,
      0x9a8f7a,
      [1, 1.12, LIMB.sway, 0, 0.32],
      3,
    ),
    ...eyes(0.04, 1.14, 0.36, 0.012, 0xc9603a),
    part(place(new THREE.BoxGeometry(0.16, 0.04, 0.22), [0, 0.66, -0.34], [0.3, 0, 0]), 0x2a2622), // tail
  ];
  for (const s of [-1, 1])
    parts.push(
      tube(
        [v(s * 0.06, 0.58, 0), v(s * 0.06, 0.3, 0.02), v(s * 0.06, 0.02, 0)],
        0.02,
        0.015,
        0xc9603a,
        [s, 0.58, LIMB.leg, 0, 0],
        2,
      ),
    );
  return mergeGeometries(parts)!;
}

/** Great hornbill: black and white, white tail with a black band, huge yellow bill and casque. */
export function hornbillGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    part(place(ball(0.2), [0, 0.5, 0], [0.3, 0, 0], [0.85, 0.85, 1.3]), 0x161616),
    part(place(ball(0.12), [0, 0.6, 0.18], [0, 0, 0], [0.9, 1.1, 0.9]), 0xefe9d9), // pale neck
    part(place(ball(0.1), [0, 0.76, 0.26]), 0x161616),
    part(place(new THREE.ConeGeometry(0.06, 0.4, 5), [0, 0.72, 0.52], [Math.PI / 2 + 0.25, 0, 0]), 0xe8c23a), // bill
    part(place(new THREE.BoxGeometry(0.08, 0.08, 0.24), [0, 0.86, 0.4], [0.15, 0, 0]), 0xe8b030), // casque
    ...eyes(0.07, 0.8, 0.3, 0.015, 0xb02020),
    part(place(new THREE.BoxGeometry(0.24, 0.04, 0.5), [0, 0.42, -0.42], [0.35, 0, 0]), 0xefe9d9), // tail
    part(place(new THREE.BoxGeometry(0.25, 0.045, 0.1), [0, 0.42, -0.38], [0.35, 0, 0]), 0x161616), // its band
    part(place(new THREE.BoxGeometry(0.42, 0.05, 0.16), [0, 0.52, -0.02], [0.25, 0, 0]), 0xefe9d9), // wing bar
  ];
  for (const s of [-1, 1])
    parts.push(
      tube(
        [v(s * 0.07, 0.36, 0.02), v(s * 0.07, 0.02, 0.04)],
        0.025,
        0.02,
        0x4a4a4a,
        [s, 0.36, LIMB.leg, 0, 0.02],
        2,
      ),
    );
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- reptiles (no swinging legs)

/** Siamese crocodile: long low armoured body and tail, splayed legs (still), tail sways. */
export function crocodileGeometry(): THREE.BufferGeometry {
  const C = 0x4f5a34;
  const body: Section[] = [
    { z: -0.6, y: 0.2, w: 0.12, h: 0.08 },
    { z: -0.2, y: 0.22, w: 0.3, h: 0.14 },
    { z: 0.4, y: 0.24, w: 0.34, h: 0.15 },
    { z: 0.9, y: 0.24, w: 0.22, h: 0.12 },
    { z: 1.25, y: 0.22, w: 0.16, h: 0.09 },
    { z: 1.75, y: 0.18, w: 0.08, h: 0.05 },
  ];
  const parts: THREE.BufferGeometry[] = [
    part(loft(body, 12), C),
    part(place(new THREE.BoxGeometry(0.4, 0.04, 1.1), [0, 0.1, 0.4]), 0xc9c08a), // pale belly
    // Tail: lofted, flattened at the sides, swaying from the hips.
    part(
      loft(
        [
          { z: -0.55, y: 0.2, w: 0.12, h: 0.1 },
          { z: -1.0, y: 0.16, w: 0.08, h: 0.1 },
          { z: -1.5, y: 0.12, w: 0.04, h: 0.07 },
          { z: -1.9, y: 0.1, w: 0.01, h: 0.03 },
        ],
        10,
      ),
      C,
      [1, 0.2, LIMB.sway, 0, -0.55],
    ),
    ...eyes(0.08, 0.36, 1.05, 0.03, 0xc9b030),
  ];
  // Scutes along the back.
  for (let i = 0; i < 5; i++) parts.push(spot([0, 0.36, -0.1 + i * 0.25], [0.12, 0.04, 0.08], 0x3a4226));
  for (const [x, z] of [
    [-0.36, 0.7],
    [0.36, 0.7],
    [-0.36, -0.15],
    [0.36, -0.15],
  ] as const)
    parts.push(
      tube(
        [v(x * 0.7, 0.2, z), v(x, 0.12, z + 0.05), v(x * 1.15, 0.02, z + 0.1)],
        0.06,
        0.04,
        C,
        undefined,
        2,
      ),
    );
  return mergeGeometries(parts)!;
}

/** A snake along a wavy line on the ground (z forward); the head part sways. */
function snake(o: { len: number; r: number; coat: number; waves: number; amp: number }): {
  body: THREE.BufferGeometry;
  head: [number, number, number];
} {
  const pts: THREE.Vector3[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(v(Math.sin(t * Math.PI * o.waves) * o.amp, o.r * 0.9, -o.len / 2 + t * o.len));
  }
  const end = pts[n]!;
  return {
    body: part(taperedTube(pts, o.r * 0.25, o.r, 14, 6), o.coat),
    head: [end.x, end.y, end.z],
  };
}

/** Reticulated python: long, thick, brown-gold with dark blotches; lies along the ground. */
export function pythonGeometry(): THREE.BufferGeometry {
  const C = 0x8a7444;
  const s = snake({ len: 3.2, r: 0.09, coat: C, waves: 2.2, amp: 0.3 });
  const [hx, hy, hz] = s.head;
  const parts: THREE.BufferGeometry[] = [
    s.body,
    part(place(ball(0.09), [hx, hy, hz + 0.06], [0, 0, 0], [0.9, 0.6, 1.4]), C, [
      1,
      hy,
      LIMB.sway,
      0,
      hz - 0.2,
    ]),
    ...[-1, 1].map((k) => part(place(ball(0.015), [hx + k * 0.06, hy + 0.04, hz + 0.1]), 0xd9a020)),
  ];
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const x = Math.sin(t * Math.PI * 2.2) * 0.3;
    parts.push(spot([x, 0.15, -1.6 + t * 3.2], [0.07, 0.025, 0.1], 0x2e2414));
  }
  return mergeGeometries(parts)!;
}

/** King cobra: an olive-brown snake whose front rises with the hood spread; the hood sways. */
export function kingCobraGeometry(): THREE.BufferGeometry {
  const C = 0x5a4a2a;
  const s = snake({ len: 2.2, r: 0.05, coat: C, waves: 1.6, amp: 0.25 });
  const [hx, , hz] = s.head;
  const rise: Limb = [1, 0.06, LIMB.sway, 0, hz];
  const parts: THREE.BufferGeometry[] = [
    s.body,
    // The raised neck and hood, swaying as it watches.
    tube([v(hx, 0.05, hz), v(hx, 0.3, hz + 0.1), v(hx, 0.55, hz + 0.12)], 0.05, 0.045, C, rise, 3),
    part(place(ball(0.1), [hx, 0.5, hz + 0.12], [0, 0, 0], [1.3, 1.5, 0.3]), 0x6a5a34, rise), // hood
    part(place(ball(0.05), [hx, 0.62, hz + 0.18], [0, 0, 0], [0.9, 0.7, 1.3]), C, rise),
    ...[-1, 1].map((k) => part(place(ball(0.012), [hx + k * 0.035, 0.65, hz + 0.22]), EYE, rise)),
    part(place(new THREE.BoxGeometry(0.1, 0.12, 0.02), [hx, 0.45, hz + 0.15]), 0xd9c27a, rise), // pale throat
  ];
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    parts.push(
      spot([Math.sin(t * Math.PI * 1.6) * 0.25, 0.09, -1.1 + t * 2.2], [0.05, 0.02, 0.03], 0xd9c27a),
    );
  }
  return mergeGeometries(parts)!;
}

/** Every Cambodian-wildlife model by animal kind id (the Kingdom view's crowds, D75). */
export const WILDLIFE_GEOMETRY: Record<string, () => THREE.BufferGeometry> = {
  elephant: wildElephantGeometry,
  gaur: gaurGeometry,
  kouprey: koupreyGeometry,
  serow: serowGeometry,
  leopard: leopardGeometry,
  cloudedLeopard: cloudedLeopardGeometry,
  sunBear: sunBearGeometry,
  moonBear: moonBearGeometry,
  dhole: dholeGeometry,
  binturong: binturongGeometry,
  gibbon: gibbonGeometry,
  langur: langurGeometry,
  douc: doucGeometry,
  slowLoris: slowLorisGeometry,
  macaque: macaqueGeometry,
  giantIbis: giantIbisGeometry,
  hornbill: hornbillGeometry,
  crocodile: crocodileGeometry,
  kingCobra: kingCobraGeometry,
  python: pythonGeometry,
};
