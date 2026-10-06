import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIMB, part, place, taperedTube } from '../../engine/figures';
import { loft, zebuGeometry } from '../../engine/animals';
import { seg as lpSeg } from '../../engine/look';

/**
 * Village livestock for the Kingdom tab: the small black pig, the village chicken and the
 * cattle kept under and around the stilt houses. Built in code like the animals in
 * engine/animals.ts; legs carry LIMB.leg pivots so a herd walks on the GPU as one crowd.
 * All face +Z and stand on y = 0. Units are metres.
 */

type Limb = [sign: number, pivot: number, kind: number, cloth: number, pivotZ?: number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ball = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, lpSeg(w, 5), lpSeg(h, 3));

/** A leg swinging from its top point (hip or shoulder). */
function leg(
  points: THREE.Vector3[],
  r0: number,
  r1: number,
  hex: number,
  sign: number,
): THREE.BufferGeometry {
  const top = points[0]!;
  return part(taperedTube(points, r0, r1, 4, 6), hex, [sign, top.y, LIMB.leg, 0, top.z]);
}

/**
 * Scale an animal uniformly, limb pivots included (a plain geometry.scale() would leave the
 * joint heights where they were and the legs would swing about the wrong point).
 */
export function scaleAnimal(g: THREE.BufferGeometry, s: number): THREE.BufferGeometry {
  g.scale(s, s, s);
  const limb = g.getAttribute('limb') as THREE.BufferAttribute | undefined;
  const limbZ = g.getAttribute('limbZ') as THREE.BufferAttribute | undefined;
  if (limb) for (let i = 0; i < limb.count; i++) limb.setY(i, limb.getY(i) * s);
  if (limbZ) for (let i = 0; i < limbZ.count; i++) limbZ.setX(i, limbZ.getX(i) * s);
  return g;
}

/**
 * Small black Khmer village pig (~0.9 m long, ~0.5 m high): sway-backed with a pot belly
 * that nearly drags, short legs, a long snout with a pale disc, small pricked ears and a thin
 * tail that swings.
 */
export function pigGeometry(): THREE.BufferGeometry {
  const B = 0x262224;
  const SNOUT = 0x6a5552;
  const parts: THREE.BufferGeometry[] = [];
  // Sway back: the top line dips between rump and shoulder while the belly hangs low.
  parts.push(
    part(
      loft(
        [
          { z: -0.4, y: 0.4, w: 0.07, h: 0.08 },
          { z: -0.36, y: 0.39, w: 0.15, h: 0.15 },
          { z: -0.24, y: 0.36, w: 0.19, h: 0.19 },
          { z: -0.06, y: 0.31, w: 0.21, h: 0.21 },
          { z: 0.1, y: 0.32, w: 0.2, h: 0.2 },
          { z: 0.24, y: 0.37, w: 0.16, h: 0.17 },
          { z: 0.3, y: 0.39, w: 0.11, h: 0.12 },
        ],
        12,
      ),
      B,
    ),
  );
  // Head sloping down to the snout.
  parts.push(
    part(
      loft(
        [
          { z: 0.22, y: 0.42, w: 0.11, h: 0.12 },
          { z: 0.34, y: 0.4, w: 0.1, h: 0.1 },
          { z: 0.44, y: 0.35, w: 0.065, h: 0.065 },
          { z: 0.5, y: 0.33, w: 0.05, h: 0.045 },
        ],
        10,
      ),
      B,
    ),
  );
  parts.push(
    part(
      place(new THREE.CylinderGeometry(0.048, 0.05, 0.03, lpSeg(8, 5)), [0, 0.33, 0.51], [Math.PI / 2, 0, 0]),
      SNOUT,
    ),
  );
  for (const s of [-1, 1]) {
    parts.push(
      part(
        place(
          new THREE.ConeGeometry(0.045, 0.1, 4),
          [s * 0.07, 0.52, 0.29],
          [0.5, 0, s * 0.35],
          [1, 1, 0.45],
        ),
        B,
      ),
    ); // ears
    parts.push(part(place(ball(0.014, 5, 4), [s * 0.065, 0.44, 0.39]), 0x0c0808)); // eyes
  }
  const tail: Limb = [-1, 0.44, LIMB.sway, 0, -0.4];
  parts.push(
    part(
      taperedTube([v(0, 0.44, -0.39), v(0.02, 0.38, -0.43), v(0.01, 0.29, -0.43)], 0.014, 0.008, 4, 4),
      B,
      tail,
    ),
  );
  for (const [x, z, s] of [
    [-0.1, 0.18, 1],
    [0.1, 0.18, -1],
    [-0.11, -0.25, -1],
    [0.11, -0.25, 1],
  ] as const)
    parts.push(leg([v(x, 0.3, z), v(x, 0.14, z + 0.01), v(x, 0.02, z)], 0.045, 0.028, B, s));
  return mergeGeometries(parts)!;
}

/**
 * Village chicken (~0.4 m to the comb): a red-brown bird with golden hackles, a red comb and
 * wattle, a dark sickle tail and yellow legs; a dedicated model (engine fowlGeometry is the
 * wild junglefowl, rounder and larger).
 */
export function chickenGeometry(): THREE.BufferGeometry {
  const RED = 0xa8552a;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(part(place(ball(0.11, 8, 6), [0, 0.22, -0.01], [-0.25, 0, 0], [0.85, 0.9, 1.3]), RED)); // body
  parts.push(part(place(ball(0.06, 6, 5), [0, 0.3, 0.09], [0.3, 0, 0], [1, 1.2, 1]), 0xd08a3a)); // hackles
  parts.push(part(place(ball(0.045, 6, 5), [0, 0.35, 0.12]), 0xd08a3a)); // head
  parts.push(part(place(new THREE.BoxGeometry(0.015, 0.05, 0.07), [0, 0.4, 0.12]), 0xc0282a)); // comb
  parts.push(part(place(ball(0.018, 5, 4), [0, 0.31, 0.15], [0, 0, 0], [0.6, 1.3, 0.8]), 0xc0282a)); // wattle
  parts.push(
    part(place(new THREE.ConeGeometry(0.016, 0.05, 4), [0, 0.345, 0.18], [Math.PI / 2, 0, 0]), 0xd9a646),
  );
  for (const s of [-1, 1]) {
    parts.push(part(place(ball(0.07, 6, 4), [s * 0.075, 0.23, -0.02], [0, 0, 0], [0.3, 0.7, 1.1]), 0x7a3a1e)); // wings
    parts.push(part(place(ball(0.008, 4, 3), [s * 0.035, 0.36, 0.15]), 0x0c0808));
  }
  const tail: Limb = [-1, 0.26, LIMB.sway, 0, -0.1];
  for (const [x, lift] of [
    [-0.02, 0],
    [0.02, 0.04],
  ] as const)
    parts.push(
      part(
        taperedTube(
          [v(x, 0.25, -0.1), v(x, 0.36 + lift, -0.16), v(x, 0.37 + lift, -0.24), v(x, 0.3, -0.28)],
          0.03,
          0.01,
          5,
          4,
        ),
        0x1f3a2a,
        tail,
      ),
    );
  for (const s of [-1, 1]) {
    const x = s * 0.035;
    parts.push(
      part(taperedTube([v(x, 0.16, 0), v(x, 0.08, 0.01), v(x, 0.01, 0.02)], 0.012, 0.009, 3, 4), 0xd9a646, [
        s,
        0.16,
        LIMB.leg,
        0,
        0,
      ]),
    );
    parts.push(
      part(place(new THREE.BoxGeometry(0.04, 0.012, 0.06), [x, 0.006, 0.035]), 0xd9a646, [
        s,
        0.16,
        LIMB.leg,
        0,
        0,
      ]),
    );
  }
  return mergeGeometries(parts)!;
}

export interface CowOptions {
  /** A brown village cow (the common Khmer red-brown cattle), slightly smaller than the white zebu. */
  brown?: boolean;
}

/**
 * Khmer village cattle: the white zebu of engine/animals.ts (hump, dewlap, short horns,
 * ~1.3 m at the back, walking legs), or with `brown` a red-brown cow at 0.9 scale.
 */
export function cowGeometry(opts: CowOptions = {}): THREE.BufferGeometry {
  if (!opts.brown) return zebuGeometry();
  return scaleAnimal(zebuGeometry({ coat: 0x9a5a34, dark: 0x3a2a24 }), 0.9);
}
