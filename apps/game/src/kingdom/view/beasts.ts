import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIMB, part, place, taperedTube } from '../../engine/figures';
import { loft } from '../../engine/animals';
import { seg as lpSeg } from '../../engine/look';

/**
 * Village and draught animals for the Kingdom tab, built in code in the low-poly style
 * (like engine/animals.ts: bodies lofted from elliptical sections, legs are jointed tubes
 * that swing on the GPU through their limb data, so a herd is one draw call).
 * All animals face +Z, stand on y = 0, units are metres.
 */

type Limb = [sign: number, pivot: number, kind: number, cloth: number, pivotZ?: number];

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ball = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, lpSeg(w, 4), lpSeg(h, 3));

/** A jointed leg from the hip/shoulder down to the foot, swinging from its top. */
function leg(
  points: THREE.Vector3[],
  r0: number,
  r1: number,
  hex: number,
  sign: number,
): THREE.BufferGeometry {
  const top = points[0]!;
  return part(taperedTube(points, r0, r1, 6, 6), hex, [sign, top.y, LIMB.leg, 0, top.z]);
}

// ---------------------------------------------------------------- village dog

/**
 * A lean pariah-type village dog (~0.5 m at the shoulder), the kind that still follows
 * people round Cambodian villages: tan short coat, deep chest and tucked belly, pricked
 * ears, a tail curled over the back. Walks with the crowd shader (LIMB.leg pivots).
 */
export function dogGeometry(): THREE.BufferGeometry {
  const C = 0xc4904f;
  const D = 0x8a5f34;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(
    part(
      loft(
        [
          { z: -0.36, y: 0.52, w: 0.06, h: 0.07 },
          { z: -0.3, y: 0.52, w: 0.1, h: 0.1 },
          { z: -0.08, y: 0.5, w: 0.1, h: 0.09 }, // tucked belly
          { z: 0.14, y: 0.5, w: 0.12, h: 0.14 }, // deep chest
          { z: 0.26, y: 0.54, w: 0.1, h: 0.12 },
        ],
        10,
      ),
      C,
    ),
  );
  // Neck up to the head, then a pointed muzzle.
  parts.push(
    part(
      loft(
        [
          { z: 0.2, y: 0.58, w: 0.07, h: 0.09 },
          { z: 0.34, y: 0.7, w: 0.065, h: 0.075 },
          { z: 0.42, y: 0.76, w: 0.075, h: 0.075 },
          { z: 0.52, y: 0.74, w: 0.055, h: 0.05 },
          { z: 0.62, y: 0.7, w: 0.028, h: 0.03 },
        ],
        10,
      ),
      C,
    ),
  );
  parts.push(part(place(ball(0.022, 6, 4), [0, 0.705, 0.63]), 0x1d130e)); // nose
  for (const s of [-1, 1]) {
    // Pricked, triangular ears.
    parts.push(
      part(
        place(
          new THREE.ConeGeometry(0.035, 0.1, 4),
          [s * 0.045, 0.86, 0.4],
          [-0.15, 0, s * -0.25],
          [1, 1, 0.5],
        ),
        D,
      ),
    );
    parts.push(part(place(ball(0.013, 5, 3), [s * 0.04, 0.78, 0.5]), 0x1d130e)); // eyes
  }
  // Tail curled up over the back; it wags.
  parts.push(
    part(
      taperedTube(
        [v(0, 0.56, -0.34), v(0, 0.68, -0.42), v(0.02, 0.8, -0.38), v(0.05, 0.78, -0.26)],
        0.028,
        0.015,
        8,
        5,
      ),
      C,
      [1, 0.56, LIMB.sway, 0, -0.34],
    ),
  );
  // Slim legs: straight forelegs, hind legs with the backward hock.
  for (const [x, z, s, front] of [
    [-0.07, 0.18, 1, true],
    [0.07, 0.18, -1, true],
    [-0.07, -0.28, -1, false],
    [0.07, -0.28, 1, false],
  ] as const) {
    const pts = front
      ? [v(x, 0.5, z), v(x, 0.26, z + 0.01), v(x, 0.04, z + 0.02)]
      : [v(x, 0.52, z), v(x, 0.3, z - 0.06), v(x, 0.14, z - 0.03), v(x, 0.04, z)];
    parts.push(leg(pts, 0.035, 0.02, front ? C : D, s));
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- water buffalo

/**
 * Swamp water buffalo (~1.45 m at the shoulder): dark slate grey, a broad flat back,
 * massive crescent horns swept back and up from a head carried low. The everyday draught
 * animal of the rice fields.
 */
export function buffaloGeometry(): THREE.BufferGeometry {
  const C = 0x4d5358;
  const HORN = 0x2f2b27;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(
    part(
      loft(
        [
          { z: -1.12, y: 1.08, w: 0.2, h: 0.25 },
          { z: -1.02, y: 1.08, w: 0.4, h: 0.42 },
          { z: -0.6, y: 1.04, w: 0.5, h: 0.48 },
          { z: 0.0, y: 1.02, w: 0.52, h: 0.52 },
          { z: 0.5, y: 1.06, w: 0.5, h: 0.52 },
          { z: 0.8, y: 1.1, w: 0.38, h: 0.44 },
          { z: 0.92, y: 1.12, w: 0.24, h: 0.3 },
        ],
        14,
      ),
      C,
    ),
  );
  // Short thick neck reaching forward and down to a long, low head.
  parts.push(
    part(
      loft(
        [
          { z: 0.7, y: 1.14, w: 0.28, h: 0.34 },
          { z: 1.0, y: 1.06, w: 0.22, h: 0.26 },
          { z: 1.22, y: 0.98, w: 0.19, h: 0.2 },
          { z: 1.42, y: 0.84, w: 0.15, h: 0.15 },
          { z: 1.56, y: 0.74, w: 0.12, h: 0.1 },
        ],
        12,
      ),
      C,
    ),
  );
  parts.push(part(place(ball(0.1, 8, 6), [0, 0.72, 1.58], [0, 0, 0], [1.2, 0.8, 0.7]), 0x2c3034)); // muzzle
  for (const s of [-1, 1]) {
    // Massive crescent horns: out to the side, swept back, tips turning up and in.
    parts.push(
      part(
        taperedTube(
          [
            v(s * 0.1, 1.12, 1.2),
            v(s * 0.4, 1.18, 1.14),
            v(s * 0.66, 1.2, 0.94),
            v(s * 0.72, 1.3, 0.66),
            v(s * 0.56, 1.42, 0.48),
          ],
          0.085,
          0.018,
          10,
          6,
        ),
        HORN,
      ),
    );
    parts.push(part(place(ball(0.09, 6, 4), [s * 0.22, 1.02, 1.12], [0, 0, s * 0.3], [1.3, 0.35, 0.7]), C)); // ears, held level under the horns
    parts.push(part(place(ball(0.025, 5, 3), [s * 0.15, 0.98, 1.3]), 0x1d130e));
  }
  const tail: Limb = [-1, 1.25, LIMB.sway, 0, -1.1];
  parts.push(
    part(taperedTube([v(0, 1.25, -1.1), v(0, 0.9, -1.2), v(0, 0.5, -1.18)], 0.045, 0.03, 6, 5), C, tail),
  );
  parts.push(part(place(ball(0.05, 6, 4), [0, 0.47, -1.18], [0, 0, 0], [0.8, 1.6, 0.8]), 0x1f1c1a, tail));
  for (const [x, z, s, front] of [
    [-0.28, 0.55, 1, true],
    [0.28, 0.55, -1, true],
    [-0.3, -0.75, -1, false],
    [0.3, -0.75, 1, false],
  ] as const) {
    const pts = front
      ? [v(x, 0.8, z), v(x, 0.42, z + 0.02), v(x, 0.16, z), v(x, 0.05, z + 0.02)]
      : [v(x, 0.86, z), v(x, 0.5, z - 0.1), v(x, 0.2, z - 0.02), v(x, 0.05, z)];
    parts.push(leg(pts, front ? 0.13 : 0.14, 0.06, C, s));
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.06, 0.075, 0.08, lpSeg(8, 5)), [x, 0.04, z + (front ? 0.02 : 0)]),
        0x24272a,
        [s, front ? 0.8 : 0.86, LIMB.leg, 0, z],
      ),
    );
  }
  return mergeGeometries(parts)!;
}
