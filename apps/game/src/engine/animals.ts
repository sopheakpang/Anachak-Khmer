import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, LIMB, part, place, taperedTube } from './figures';
import { seg as lpSeg } from './look';

/**
 * Animals with real proportions (PK: "look more like real elephant, horse, cow"), built in
 * code like the people: no model files. Bodies are lofted from elliptical cross-sections
 * measured along the spine, so backs slope, bellies hang and necks taper the way the real
 * animal does, instead of the earlier round "balloon" shapes. Legs are jointed tubes that
 * swing on the GPU (limb data), so a herd is still one draw call.
 *
 * All animals face +Z and stand on y = 0. Units are metres.
 */

type Limb = [sign: number, pivot: number, kind: number, cloth: number, pivotZ?: number];
const CLOTH: Limb = [0, 0, LIMB.body, 1];

/** One cross-section of a lofted body: centre (x, y) at depth z, half-width w, half-height h. */
export interface Section {
  z: number;
  y: number;
  w: number;
  h: number;
  x?: number;
}

/**
 * A closed body through elliptical sections ordered by z (tail → head), capped at both
 * ends. Low-poly style keeps half the sides, so bodies read as clean facets.
 */
export function loft(sections: Section[], sides = 16): THREE.BufferGeometry {
  const n = lpSeg(sides, 6);
  const pos: number[] = [];
  const idx: number[] = [];
  for (const s of sections)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      pos.push((s.x ?? 0) + Math.cos(a) * s.w, s.y + Math.sin(a) * s.h, s.z);
    }
  for (let i = 0; i < sections.length - 1; i++)
    for (let k = 0; k < n; k++) {
      const a = i * n + k;
      const b = i * n + ((k + 1) % n);
      const c = (i + 1) * n + k;
      const d = (i + 1) * n + ((k + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  // Caps: fan from the centre of the first and last section.
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  const c0 = pos.length / 3;
  pos.push(first.x ?? 0, first.y, first.z);
  const c1 = pos.length / 3;
  pos.push(last.x ?? 0, last.y, last.z);
  const lastRing = (sections.length - 1) * n;
  for (let k = 0; k < n; k++) {
    idx.push(c0, (k + 1) % n, k);
    idx.push(c1, lastRing + k, lastRing + ((k + 1) % n));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const ball = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, lpSeg(w, 5), lpSeg(h, 3));
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A jointed leg from hip/shoulder down to the hoof or foot, swinging from the top. */
export function leg(
  points: THREE.Vector3[],
  r0: number,
  r1: number,
  hex: number,
  sign: number,
): THREE.BufferGeometry {
  const top = points[0]!;
  return part(taperedTube(points, r0, r1, 8, 8), hex, [sign, top.y, LIMB.leg, 0, top.z]);
}

// ---------------------------------------------------------------- Asian elephant

/**
 * Asian elephant (~2.9 m at the back): the back is highest in the middle, the head
 * carries the twin domes of the Asian species, ears are smaller than an African's and
 * the trunk hangs almost to the ground. A red caparison with gold hems, as on the Bayon
 * reliefs.
 */
export function elephantGeometry(opts: { wild?: boolean } = {}): THREE.BufferGeometry {
  const G = COLORS.elephant;
  const wild = opts.wild ?? false;
  const parts: THREE.BufferGeometry[] = [];
  const torso: Section[] = [
    { z: -1.6, y: 2.05, w: 0.3, h: 0.4 },
    { z: -1.45, y: 2.02, w: 0.78, h: 0.92 },
    { z: -1.05, y: 1.98, w: 0.98, h: 1.08 },
    { z: -0.4, y: 1.98, w: 1.05, h: 1.14 },
    { z: 0.3, y: 2.02, w: 1.02, h: 1.12 },
    { z: 0.85, y: 2.1, w: 0.9, h: 1.04 },
    { z: 1.2, y: 2.28, w: 0.7, h: 0.88 },
    { z: 1.35, y: 2.4, w: 0.5, h: 0.62 },
  ];
  parts.push(part(loft(torso, 18), G));
  // Head with the twin domes and a sloping forehead.
  parts.push(
    part(
      loft(
        [
          { z: 1.1, y: 2.6, w: 0.52, h: 0.7 },
          { z: 1.45, y: 2.8, w: 0.66, h: 0.84 },
          { z: 1.8, y: 2.78, w: 0.6, h: 0.76 },
          { z: 2.08, y: 2.55, w: 0.44, h: 0.56 },
          { z: 2.22, y: 2.35, w: 0.3, h: 0.36 },
        ],
        16,
      ),
      G,
    ),
  );
  for (const s of [-1, 1]) parts.push(part(place(ball(0.36, 10, 8), [s * 0.24, 3.42, 1.58]), G));
  // Trunk: thick at the face, fine at the tip, curling forward; it sways.
  parts.push(
    part(
      taperedTube(
        [v(0, 2.4, 2.15), v(0, 1.85, 2.45), v(0, 1.15, 2.55), v(0, 0.6, 2.5), v(0, 0.38, 2.68)],
        0.3,
        0.08,
        16,
        10,
      ),
      G,
      [1, 2.4, LIMB.sway, 0, 2.15],
    ),
  );
  for (const s of [-1, 1]) {
    // Ears lie back against the neck, shaped like a leaf.
    parts.push(
      part(place(ball(0.72, 12, 10), [s * 0.68, 2.55, 1.42], [0, s * 0.35, s * 0.08], [0.09, 0.95, 0.72]), G),
    );
    parts.push(part(place(ball(0.05, 6, 4), [s * 0.5, 2.88, 1.98]), 0x1d130e)); // eyes
    // Short tusks (a tusker).
    parts.push(
      part(
        taperedTube(
          [v(s * 0.26, 2.2, 2.05), v(s * 0.3, 1.95, 2.4), v(s * 0.26, 2.0, 2.7)],
          0.07,
          0.025,
          6,
          6,
        ),
        COLORS.ivory,
      ),
    );
  }
  // Pillar legs, slightly thicker at the top, with round feet and toenails.
  for (const [x, z, s] of [
    [-0.56, 0.72, 1],
    [0.56, 0.72, -1],
    [-0.6, -1.05, -1],
    [0.6, -1.05, 1],
  ] as const) {
    const l: Limb = [s, 1.6, LIMB.leg, 0, z];
    const front = z > 0;
    parts.push(
      part(
        place(new THREE.CylinderGeometry(front ? 0.38 : 0.36, 0.31, 1.62, lpSeg(12, 6)), [x, 0.85, z]),
        G,
        l,
      ),
    );
    if (wild) continue; // the wild elephant (D75): plain feet, fewer triangles
    parts.push(part(place(new THREE.CylinderGeometry(0.33, 0.36, 0.14, lpSeg(12, 6)), [x, 0.07, z]), G, l));
    for (const k of [-1, 0, 1])
      parts.push(
        part(
          place(ball(0.07, 6, 4), [x + k * 0.14, 0.08, z + 0.3], [0, 0, 0], [1, 0.8, 0.7]),
          COLORS.ivory,
          l,
        ),
      );
  }
  // Tail with a dark tuft.
  const tail: Limb = [-1, 2.45, LIMB.sway, 0, -1.6];
  parts.push(
    part(taperedTube([v(0, 2.45, -1.6), v(0, 1.9, -1.75), v(0.04, 1.35, -1.72)], 0.06, 0.03, 8, 6), G, tail),
  );
  parts.push(part(place(ball(0.07, 6, 4), [0.04, 1.3, -1.72], [0, 0, 0], [0.8, 1.6, 0.8]), 0x2a1c16, tail));
  // A wild elephant (D75) has no caparison.
  if (wild) return mergeGeometries(parts)!;
  // Caparison over the back (cloth takes the crowd's colour) with gold hems.
  const drape = (r: number, t0: number, len: number) =>
    place(
      new THREE.CylinderGeometry(r, r, 1.5, lpSeg(18, 8), 1, true, t0, len),
      [0, 1.98, -0.3],
      [Math.PI / 2, 0, 0],
      [1.0, 1.0, 1],
    );
  parts.push(part(drape(1.1, Math.PI - 1.05, 2.1).scale(1, 1.02, 1), 0xffffff, CLOTH));
  for (const t0 of [Math.PI - 1.08, Math.PI + 0.95]) parts.push(part(drape(1.12, t0, 0.14), COLORS.gold));
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- horse

export interface HorseOptions {
  /** Pack saddle with two baskets (for the stone roads). */
  pack?: boolean;
  coat?: number;
}

/** A small, sturdy South-East Asian horse (~1.4 m at the withers), bay with a dark mane. */
export function horseGeometry(opts: HorseOptions = {}): THREE.BufferGeometry {
  const C = opts.coat ?? 0x7a4a2c;
  const DARK = 0x2a1c16;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(
    part(
      loft(
        [
          { z: -0.86, y: 1.2, w: 0.18, h: 0.22 },
          { z: -0.76, y: 1.22, w: 0.33, h: 0.37 },
          { z: -0.42, y: 1.2, w: 0.39, h: 0.41 },
          { z: 0.1, y: 1.18, w: 0.38, h: 0.43 },
          { z: 0.5, y: 1.24, w: 0.36, h: 0.43 },
          { z: 0.72, y: 1.34, w: 0.28, h: 0.38 },
          { z: 0.83, y: 1.46, w: 0.18, h: 0.26 },
        ],
        14,
      ),
      C,
    ),
  );
  // Neck rising forward, then the long head angled down.
  parts.push(
    part(
      loft(
        [
          { z: 0.6, y: 1.5, w: 0.17, h: 0.3 },
          { z: 0.84, y: 1.78, w: 0.14, h: 0.23 },
          { z: 1.0, y: 2.0, w: 0.11, h: 0.17 },
          { z: 1.07, y: 2.1, w: 0.1, h: 0.13 },
        ],
        12,
      ),
      C,
    ),
  );
  parts.push(
    part(
      loft(
        [
          { z: 1.0, y: 2.12, w: 0.11, h: 0.13 },
          { z: 1.14, y: 2.06, w: 0.1, h: 0.13 },
          { z: 1.32, y: 1.9, w: 0.08, h: 0.1 },
          { z: 1.44, y: 1.8, w: 0.065, h: 0.075 },
        ],
        10,
      ),
      C,
    ),
  );
  for (const s of [-1, 1]) {
    parts.push(
      part(
        place(new THREE.ConeGeometry(0.04, 0.14, lpSeg(6, 4)), [s * 0.06, 2.27, 1.04], [-0.2, 0, s * 0.2]),
        C,
      ),
    );
    parts.push(part(place(ball(0.03, 6, 4), [s * 0.1, 2.08, 1.16]), 0x1d130e));
  }
  // Mane along the neck and forelock.
  parts.push(
    part(
      loft(
        [
          { z: 0.58, y: 1.78, w: 0.03, h: 0.06 },
          { z: 0.84, y: 2.02, w: 0.035, h: 0.08 },
          { z: 1.04, y: 2.24, w: 0.03, h: 0.06 },
        ],
        6,
      ),
      DARK,
    ),
  );
  const tail: Limb = [-1, 1.38, LIMB.sway, 0, -0.82];
  parts.push(
    part(taperedTube([v(0, 1.38, -0.82), v(0, 1.05, -1.0), v(0, 0.6, -0.98)], 0.07, 0.05, 8, 6), DARK, tail),
  );
  // Legs: forearm, knee, cannon, fetlock; hind legs with the backward hock.
  for (const [x, z, s, front] of [
    [-0.17, 0.52, 1, true],
    [0.17, 0.52, -1, true],
    [-0.18, -0.6, -1, false],
    [0.18, -0.6, 1, false],
  ] as const) {
    const pts = front
      ? [v(x, 1.12, z), v(x, 0.62, z + 0.03), v(x, 0.22, z), v(x, 0.08, z + 0.03)]
      : [v(x, 1.18, z), v(x, 0.74, z - 0.12), v(x, 0.3, z - 0.02), v(x, 0.08, z)];
    parts.push(leg(pts, front ? 0.13 : 0.15, 0.06, C, s));
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.065, 0.08, 0.09, lpSeg(8, 5)), [x, 0.045, z + (front ? 0.03 : 0)]),
        DARK,
        [s, front ? 1.12 : 1.18, LIMB.leg, 0, z],
      ),
    );
  }
  if (opts.pack) {
    // Saddle cloth, pack frame and two baskets of tools.
    parts.push(
      part(place(new RoundedBoxGeometry(0.72, 0.06, 0.62, 1, 0.02), [0, 1.62, 0.05]), 0xffffff, CLOTH),
    );
    for (const s of [-1, 1]) {
      parts.push(
        part(
          place(new THREE.CylinderGeometry(0.19, 0.15, 0.36, lpSeg(10, 6)), [s * 0.44, 1.38, 0.05]),
          COLORS.bamboo,
        ),
      );
      parts.push(
        part(
          place(new RoundedBoxGeometry(0.26, 0.14, 0.2, 1, 0.03), [s * 0.44, 1.58, 0.05]),
          COLORS.sandstone,
        ),
      );
    }
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- Khmer zebu

export interface ZebuOptions {
  /** Lying down with legs folded (the Nandi statues at Preah Ko). */
  kneeling?: boolean;
  coat?: number;
  /** Horn/hoof/muzzle colour; statues are all one stone. */
  dark?: number;
}

/**
 * Khmer white zebu (~1.3 m): a hump over the shoulders, a deep dewlap, short curved horns
 * and drooping ears. Kneeling, it is Nandi, Shiva's bull, who gives Preah Ko ("sacred
 * bull") its name.
 */
export function zebuGeometry(opts: ZebuOptions = {}): THREE.BufferGeometry {
  const C = opts.coat ?? COLORS.zebu;
  const D = opts.dark ?? COLORS.muzzle;
  const H = opts.dark ?? COLORS.ivory;
  const drop = opts.kneeling ? 0.6 : 0;
  const parts: THREE.BufferGeometry[] = [];
  const body = (g: THREE.BufferGeometry) => g.translate(0, -drop, 0);
  parts.push(
    part(
      body(
        loft(
          [
            { z: -0.86, y: 1.04, w: 0.2, h: 0.26 },
            { z: -0.74, y: 1.04, w: 0.32, h: 0.4 },
            { z: -0.3, y: 1.0, w: 0.37, h: 0.45 },
            { z: 0.2, y: 1.0, w: 0.37, h: 0.47 },
            { z: 0.56, y: 1.06, w: 0.33, h: 0.44 },
            { z: 0.76, y: 1.12, w: 0.23, h: 0.32 },
          ],
          14,
        ),
      ),
      C,
    ),
  );
  parts.push(part(body(place(ball(0.23, 10, 8), [0, 1.5, 0.5], [0.2, 0, 0], [0.85, 1, 1.25])), C)); // hump
  parts.push(part(body(place(ball(0.3, 10, 8), [0, 0.78, 0.78], [0, 0, 0], [0.16, 0.8, 0.9])), C)); // dewlap
  parts.push(
    part(
      body(
        loft(
          [
            { z: 0.7, y: 1.16, w: 0.2, h: 0.27 },
            { z: 0.9, y: 1.24, w: 0.16, h: 0.21 },
            { z: 1.02, y: 1.26, w: 0.15, h: 0.18 },
            { z: 1.2, y: 1.1, w: 0.13, h: 0.14 },
            { z: 1.34, y: 0.98, w: 0.1, h: 0.1 },
          ],
          12,
        ),
      ),
      C,
    ),
  );
  parts.push(part(body(place(ball(0.1, 8, 6), [0, 0.96, 1.36], [0, 0, 0], [1.1, 0.8, 0.7])), D)); // muzzle
  for (const s of [-1, 1]) {
    parts.push(
      part(
        body(
          taperedTube(
            [v(s * 0.1, 1.38, 0.98), v(s * 0.2, 1.46, 0.96), v(s * 0.23, 1.6, 0.93)],
            0.045,
            0.015,
            6,
            6,
          ),
        ),
        H,
      ),
    );
    parts.push(
      part(body(place(ball(0.12, 8, 6), [s * 0.2, 1.24, 0.98], [0, 0, s * 0.9], [1.3, 0.35, 0.7])), C),
    ); // ears
    parts.push(part(body(place(ball(0.025, 6, 4), [s * 0.12, 1.24, 1.12])), 0x1d130e));
  }
  const tail: Limb = [-1, 1.22 - drop, LIMB.sway, 0, -0.86];
  parts.push(
    part(
      body(taperedTube([v(0, 1.22, -0.86), v(0, 0.85, -0.95), v(0, 0.45, -0.93)], 0.04, 0.03, 8, 6)),
      C,
      tail,
    ),
  );
  parts.push(part(body(place(ball(0.05, 6, 4), [0, 0.42, -0.93], [0, 0, 0], [0.8, 1.6, 0.8])), D, tail));
  if (opts.kneeling) {
    // Legs folded under the body: forelegs tucked forward, hind legs to the side.
    for (const s of [-1, 1]) {
      parts.push(
        part(
          place(
            new THREE.CapsuleGeometry(0.08, 0.34, 1, lpSeg(8, 5)),
            [s * 0.2, 0.1, 0.62],
            [Math.PI / 2, 0, 0],
          ),
          C,
        ),
      );
      parts.push(
        part(
          place(
            new THREE.CapsuleGeometry(0.1, 0.4, 1, lpSeg(8, 5)),
            [s * 0.33, 0.13, -0.45],
            [Math.PI / 2, 0, s * 0.2],
          ),
          C,
        ),
      );
    }
  } else {
    for (const [x, z, s, front] of [
      [-0.19, 0.48, 1, true],
      [0.19, 0.48, -1, true],
      [-0.2, -0.62, -1, false],
      [0.2, -0.62, 1, false],
    ] as const) {
      const pts = front
        ? [v(x, 0.82, z), v(x, 0.44, z + 0.02), v(x, 0.16, z), v(x, 0.06, z + 0.02)]
        : [v(x, 0.88, z), v(x, 0.52, z - 0.1), v(x, 0.2, z - 0.02), v(x, 0.06, z)];
      parts.push(leg(pts, front ? 0.085 : 0.1, 0.045, C, s));
      parts.push(
        part(
          place(new THREE.CylinderGeometry(0.045, 0.055, 0.07, lpSeg(8, 5)), [
            x,
            0.035,
            z + (front ? 0.02 : 0),
          ]),
          D,
          [s, front ? 0.82 : 0.88, LIMB.leg, 0, z],
        ),
      );
    }
  }
  return mergeGeometries(parts)!;
}

/** Nandi on a sandstone plinth, facing the sanctuary (three stand before Preah Ko). */
export function nandiGeometry(): THREE.BufferGeometry {
  const stone = 0xc9b48a;
  const plinth = part(place(new RoundedBoxGeometry(1.0, 0.35, 1.9, 1, 0.04), [0, 0.175, 0.2]), 0xb39c74);
  const bull = zebuGeometry({ kneeling: true, coat: stone, dark: 0xa8946c }).translate(0, 0.35, 0);
  return mergeGeometries([plinth, bull])!;
}

// ---------------------------------------------------------------- ox cart

/** Khmer zebu pulling a two-wheeled cart with a stone. Axle at z = 0. */
/** The elephant with a sandstone block roped on its back (Build tab: it helps the crew). */
export function elephantWithBlockGeometry(): THREE.BufferGeometry {
  const block = part(place(new THREE.BoxGeometry(1.3, 0.75, 1.0), [0, 3.25, -0.45]), 0xc8b68e);
  const ropes = [-0.25, 0.25].map((dz) =>
    part(place(new THREE.BoxGeometry(1.36, 0.05, 0.06), [0, 3.3, -0.45 + dz]), 0x6a4a2a),
  );
  const girth = part(
    place(new THREE.TorusGeometry(0.92, 0.035, 4, lpSeg(14, 7)), [0, 2.45, -0.45], [0, Math.PI / 2, 0]),
    0x6a4a2a,
  );
  return mergeGeometries([elephantGeometry(), block, ...ropes, girth])!;
}

export function oxCartGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [zebuGeometry().translate(0, 0, 2.35)];
  // Yoke on the neck in front of the hump, and the shafts back to the cart.
  parts.push(
    part(
      place(new THREE.CylinderGeometry(0.06, 0.06, 1.0, lpSeg(8, 3)), [0, 1.33, 3.2], [0, 0, Math.PI / 2]),
      COLORS.woodDark,
    ),
  );
  for (const s of [-1, 1])
    parts.push(
      part(
        place(
          new THREE.CylinderGeometry(0.05, 0.05, 3.3, lpSeg(6, 3)),
          [s * 0.45, 1.12, 1.5],
          [Math.PI / 2 - 0.07, 0, 0],
        ),
        COLORS.wood,
      ),
    );
  parts.push(part(place(new RoundedBoxGeometry(1.5, 0.22, 2.0, 1, 0.06), [0, 1.0, -0.1]), COLORS.wood));
  for (const s of [-1, 1])
    parts.push(
      part(place(new RoundedBoxGeometry(0.1, 0.35, 2.0, 1, 0.04), [s * 0.72, 1.25, -0.1]), COLORS.woodDark),
    );
  parts.push(
    part(place(new RoundedBoxGeometry(1.05, 0.62, 1.2, 1, 0.1), [0, 1.42, -0.15]), COLORS.sandstone),
  );
  for (const s of [-1, 1]) {
    const w: Limb = [1, 0.66, LIMB.wheel, 0];
    parts.push(
      part(
        place(
          new THREE.TorusGeometry(0.6, 0.075, lpSeg(8, 3), lpSeg(24, 4)),
          [s * 0.88, 0.66, 0],
          [0, Math.PI / 2, 0],
        ),
        COLORS.woodDark,
        w,
      ),
    );
    parts.push(
      part(
        place(
          new THREE.CylinderGeometry(0.13, 0.13, 0.2, lpSeg(10, 3)),
          [s * 0.88, 0.66, 0],
          [0, 0, Math.PI / 2],
        ),
        COLORS.wood,
        w,
      ),
    );
    for (let k = 0; k < 6; k++)
      parts.push(
        part(
          place(
            new THREE.CylinderGeometry(0.035, 0.035, 1.18, lpSeg(5, 3)),
            [s * 0.88, 0.66, 0],
            [(k / 6) * Math.PI, 0, 0],
          ),
          COLORS.wood,
          w,
        ),
      );
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- wild animals (Kingdom hunting, D61)

/** Red muntjac / sambar-like deer: a light horse body in brown with antlers (use at ~0.72 scale). */
export function deerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [horseGeometry({ coat: 0x9a6a3c })];
  for (const s of [-1, 1]) {
    // Antlers: a beam with two tines.
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 5), [s * 0.12, 2.45, 1.02], [-0.3, 0, s * 0.35]),
        0xd8c7a0,
      ),
    );
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.018, 0.025, 0.28, 5), [s * 0.2, 2.6, 1.12], [0.5, 0, s * 0.2]),
        0xd8c7a0,
      ),
    );
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.018, 0.025, 0.26, 5), [s * 0.24, 2.72, 0.95], [-0.7, 0, s * 0.5]),
        0xd8c7a0,
      ),
    );
  }
  parts.push(part(place(ball(0.09, 6, 4), [0, 1.3, -0.9]), 0xf2eadb)); // white rump flash
  return mergeGeometries(parts)!;
}

/** A four-legged wild animal lofted from sections, with swinging legs. */
export function beast(
  body: Section[],
  head: Section[],
  legs: Array<[x: number, z: number, top: number, sign: number]>,
  coat: number,
  legR: number,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [part(loft(body, 12), coat), part(loft(head, 10), coat)];
  for (const [x, z, top, s] of legs)
    parts.push(leg([v(x, top, z), v(x, top * 0.5, z + 0.02), v(x, 0.05, z)], legR, legR * 0.6, coat, s));
  return parts;
}

/** Wild boar: dark, bristly, high shoulders, long snout and small tusks. */
export function boarGeometry(): THREE.BufferGeometry {
  const C = 0x3a2e28;
  const parts = beast(
    [
      { z: -0.55, y: 0.52, w: 0.12, h: 0.14 },
      { z: -0.45, y: 0.56, w: 0.24, h: 0.26 },
      { z: -0.1, y: 0.6, w: 0.28, h: 0.3 },
      { z: 0.25, y: 0.64, w: 0.27, h: 0.33 },
      { z: 0.45, y: 0.62, w: 0.2, h: 0.26 },
    ],
    [
      { z: 0.42, y: 0.62, w: 0.17, h: 0.2 },
      { z: 0.62, y: 0.5, w: 0.11, h: 0.13 },
      { z: 0.82, y: 0.4, w: 0.07, h: 0.07 },
    ],
    [
      [-0.14, 0.28, 0.5, 1],
      [0.14, 0.28, 0.5, -1],
      [-0.14, -0.35, 0.48, -1],
      [0.14, -0.35, 0.48, 1],
    ],
    C,
    0.07,
  );
  for (const s of [-1, 1])
    parts.push(
      part(place(new THREE.ConeGeometry(0.02, 0.1, 4), [s * 0.07, 0.42, 0.78], [-1.2, 0, 0]), 0xf1e6cc),
    );
  parts.push(part(place(new THREE.BoxGeometry(0.05, 0.12, 0.6), [0, 0.92, 0.05]), 0x1e1712)); // bristly crest
  return mergeGeometries(parts)!;
}

/** Indochinese tiger: long low body, orange with dark stripes and a white belly. */
export function tigerGeometry(): THREE.BufferGeometry {
  const C = 0xd9822b;
  const parts = beast(
    [
      { z: -0.85, y: 0.78, w: 0.14, h: 0.15 },
      { z: -0.7, y: 0.8, w: 0.26, h: 0.28 },
      { z: -0.2, y: 0.8, w: 0.3, h: 0.3 },
      { z: 0.35, y: 0.84, w: 0.3, h: 0.32 },
      { z: 0.6, y: 0.88, w: 0.24, h: 0.26 },
    ],
    [
      { z: 0.6, y: 0.95, w: 0.2, h: 0.2 },
      { z: 0.85, y: 0.95, w: 0.18, h: 0.17 },
      { z: 1.02, y: 0.88, w: 0.1, h: 0.09 },
    ],
    [
      [-0.18, 0.42, 0.75, 1],
      [0.18, 0.42, 0.75, -1],
      [-0.18, -0.6, 0.75, -1],
      [0.18, -0.6, 0.75, 1],
    ],
    C,
    0.09,
  );
  for (let i = 0; i < 6; i++)
    parts.push(
      part(place(new THREE.BoxGeometry(0.64, 0.05, 0.06), [0, 0.9, -0.55 + i * 0.2], [0, 0, 0]), 0x241a14),
    );
  parts.push(part(place(new THREE.BoxGeometry(0.42, 0.08, 1.2), [0, 0.52, -0.1]), 0xf2eadb)); // belly
  for (const s of [-1, 1]) {
    parts.push(part(place(ball(0.05, 6, 4), [s * 0.14, 1.13, 0.68]), C)); // ears
    parts.push(part(place(ball(0.025, 6, 4), [s * 0.08, 1.0, 0.98]), 0x1d130e)); // eyes
  }
  const tail: Limb = [-1, 0.8, LIMB.sway, 0, -0.85];
  parts.push(
    part(taperedTube([v(0, 0.8, -0.85), v(0, 0.6, -1.2), v(0, 0.45, -1.5)], 0.05, 0.04, 6, 6), C, tail),
  );
  return mergeGeometries(parts)!;
}

/** Banteng: a wild ox, dark brown, white stockings and rump (no big hump like the zebu). */
export function bantengGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    zebuGeometry({ coat: 0x4a2e1c }),
    part(place(ball(0.14, 8, 6), [0, 1.0, -0.72]), 0xf2eadb),
  ])!;
}

/** Red junglefowl or green peafowl (with its long train). */
export function fowlGeometry(peafowl = false): THREE.BufferGeometry {
  const C = peafowl ? 0x2f7a5a : 0xa8452a;
  const parts: THREE.BufferGeometry[] = [
    part(
      place(ball(peafowl ? 0.2 : 0.14, 8, 6), [0, peafowl ? 0.55 : 0.4, 0], [0, 0, 0], [0.9, 0.9, 1.3]),
      C,
    ),
    part(
      place(ball(peafowl ? 0.08 : 0.07, 6, 5), [0, peafowl ? 0.9 : 0.6, 0.18]),
      peafowl ? 0x2a6aa0 : 0xc0282a,
    ),
    part(
      place(new THREE.ConeGeometry(0.025, 0.08, 4), [0, peafowl ? 0.9 : 0.6, 0.28], [Math.PI / 2, 0, 0]),
      0xd9a646,
    ),
  ];
  // Train / tail feathers.
  if (peafowl)
    parts.push(part(place(new THREE.BoxGeometry(0.3, 0.06, 1.0), [0, 0.45, -0.6], [0.15, 0, 0]), 0x3f8a4a));
  else
    parts.push(part(place(new THREE.ConeGeometry(0.1, 0.35, 5), [0, 0.55, -0.22], [-0.9, 0, 0]), 0x1f3a2a));
  for (const s of [-1, 1])
    parts.push(
      leg([v(s * 0.05, peafowl ? 0.4 : 0.28, 0), v(s * 0.05, 0.02, 0.02)], 0.02, 0.015, 0xb08a4a, s),
    );
  return mergeGeometries(parts)!;
}
