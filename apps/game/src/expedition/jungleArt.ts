import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { COLORS, LIMB, part, place, taperedTube, workerGeometry } from '../engine/figures';
import { elephantGeometry } from '../engine/animals';
import { detail as lpDetail, seg as lpSeg } from '../engine/look';

/**
 * Rainforest and hero models for the Kulen Expedition (prompts E02–E03), built in code in
 * the same soft animated-film style as Build mode (D25/D26). All use `part()` so they share
 * vertex colours and the GPU limb animation.
 */

const blob = (r: number, detail = 1) => new THREE.IcosahedronGeometry(r, lpDetail(detail));

/** Tall dipterocarp: straight pale trunk with buttress roots, umbrella crown high up. ~11 m. */
export function rainTreeGeometry(): THREE.BufferGeometry {
  const bark = 0x9a8a74;
  const parts = [part(place(new THREE.CylinderGeometry(0.38, 0.6, 9, lpSeg(9, 3)), [0, 4.5, 0]), bark)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(
      part(
        place(
          new THREE.BoxGeometry(0.14, 1.6, 1.3),
          [Math.sin(a) * 0.55, 0.75, Math.cos(a) * 0.55],
          [0, a, 0],
        ),
        0x8a7a64,
      ),
    );
  }
  parts.push(
    part(place(new THREE.CylinderGeometry(0.12, 0.2, 2.6, lpSeg(6, 3)), [0.9, 8.6, 0], [0, 0, -0.9]), bark),
  );
  parts.push(
    part(
      place(new THREE.CylinderGeometry(0.12, 0.2, 2.4, lpSeg(6, 3)), [-0.8, 8.8, 0.3], [0.2, 0, 0.9]),
      bark,
    ),
  );
  for (const [x, y, z, r, c] of [
    [0, 10.2, 0, 3.4, 0x3f7a34],
    [2.2, 9.7, 0.6, 2.4, 0x4a8638],
    [-2.1, 9.9, -0.4, 2.5, 0x3b7230],
    [0.4, 10.9, -1.6, 2.2, 0x55923f],
    [-0.4, 11.2, 1.2, 2.0, 0x5d9c45],
  ] as const)
    parts.push(part(place(blob(r), [x, y, z], [0, 0, 0], [1, 0.42, 1]), c));
  return mergeGeometries(parts)!;
}

/** Strangler fig: many twisted trunks, hanging aerial roots, a dense dark dome. ~8 m. */
export function figGeometry(): THREE.BufferGeometry {
  const bark = 0x7d6a55;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      part(
        taperedTube(
          [
            new THREE.Vector3(Math.sin(a) * 1.3, 0, Math.cos(a) * 1.3),
            new THREE.Vector3(Math.sin(a + 0.6) * 0.7, 2, Math.cos(a + 0.6) * 0.7),
            new THREE.Vector3(Math.sin(a + 1.1) * 0.35, 4.5, Math.cos(a + 1.1) * 0.35),
            new THREE.Vector3(Math.sin(a + 1.4) * 0.6, 6.2, Math.cos(a + 1.4) * 0.6),
          ],
          0.26,
          0.14,
          8,
          5,
        ),
        bark,
      ),
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.03, 0.04, 3.2, lpSeg(4, 3)), [
          Math.sin(a) * 2.4,
          5,
          Math.cos(a) * 2.4,
        ]),
        0x8d7a60,
      ),
    );
  }
  for (const [x, y, z, r, c] of [
    [0, 7.2, 0, 3.2, 0x2f6a2c],
    [2.2, 6.8, 0.8, 2.4, 0x357330],
    [-2, 6.9, -0.6, 2.5, 0x2c6329],
    [0.6, 8.1, -1.2, 2.2, 0x3f7f36],
    [-0.8, 8.0, 1.4, 2.0, 0x468a3a],
  ] as const)
    parts.push(part(place(blob(r), [x, y, z], [0, 0, 0], [1, 0.62, 1]), c));
  return mergeGeometries(parts)!;
}

/** Fern: seven arching fronds (double-sided leaf material). */
export function fernGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const frond = new THREE.PlaneGeometry(0.34, 1.4, 1, 4);
    const p = frond.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) + 0.7; // 0..1.4 along the frond
      const taper = 1 - (y / 1.4) * 0.85;
      p.setX(k, p.getX(k) * taper);
      p.setZ(k, -0.18 * y * y); // arch
    }
    frond.computeVertexNormals();
    frond.rotateX(-0.9);
    frond.translate(0, 0.1, 0);
    frond.rotateY(a);
    parts.push(part(frond, i % 2 ? 0x4f8a36 : 0x5f9a40));
  }
  return mergeGeometries(parts)!;
}

/** Mossy boulder. */
export function rockGeometry(): THREE.BufferGeometry {
  const g = blob(0.8, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + 0.35 * Math.sin(p.getX(i) * 5.1 + p.getZ(i) * 3.7);
    p.setXYZ(i, p.getX(i) * k * 1.2, Math.max(-0.2, p.getY(i) * k * 0.7), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const top = blob(0.62, 1);
  top.scale(1.1, 0.3, 0.9);
  top.translate(0, 0.35, 0);
  return mergeGeometries([part(g, 0x8b877a), part(top, 0x5f8a3e)])!;
}

/** Small sandstone shrine where a fallen hero rises again: plinth, cella, stepped roof, lotus. */
export function shrineGeometry(): THREE.BufferGeometry {
  const s = 0xb89868;
  const parts = [
    part(place(new RoundedBoxGeometry(2.6, 0.4, 2.6, 1, 0.06), [0, 0.2, 0]), 0xb8a07a),
    part(place(new RoundedBoxGeometry(1.6, 1.5, 1.6, 1, 0.06), [0, 1.15, 0]), s),
    part(place(new RoundedBoxGeometry(0.6, 1.0, 0.08, 1, 0.02), [0, 1.0, 0.81]), 0x3a2616),
  ];
  let y = 1.9;
  for (const w of [1.8, 1.4, 1.0, 0.66]) {
    parts.push(part(place(new RoundedBoxGeometry(w, 0.3, w, 1, 0.05), [0, y + 0.15, 0]), s));
    y += 0.3;
  }
  parts.push(
    part(
      place(
        new THREE.SphereGeometry(0.26, lpSeg(10, 4), lpSeg(8, 3)),
        [0, y + 0.3, 0],
        [0, 0, 0],
        [1, 1.5, 1],
      ),
      COLORS.gold,
    ),
  );
  return mergeGeometries(parts)!;
}

/** Linga on a square yoni base, carved in the riverbed. */
export function lingaGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    part(place(new RoundedBoxGeometry(0.9, 0.18, 0.9, 1, 0.04), [0, 0.09, 0]), 0x9c9a86),
    part(place(new RoundedBoxGeometry(0.2, 0.08, 0.3, 1, 0.02), [0, 0.12, 0.5]), 0x9c9a86),
    part(place(new THREE.CapsuleGeometry(0.16, 0.24, 3, lpSeg(8, 4)), [0, 0.38, 0]), 0xa9a792),
  ])!;
}

/** Broken laterite wall piece for the hermitage ruins. */
export function ruinGeometry(): THREE.BufferGeometry {
  const L = 0xa45a3a;
  const parts: THREE.BufferGeometry[] = [];
  const heights = [3, 2, 3, 1, 2];
  heights.forEach((n, i) => {
    for (let k = 0; k < n; k++)
      parts.push(
        part(
          place(
            new RoundedBoxGeometry(0.95, 0.5, 0.7, 1, 0.07),
            [i * 1.0 - 2, 0.25 + k * 0.5, (k % 2) * 0.05],
            [0, (k * 0.13) % 0.2, 0],
          ),
          k % 2 ? L : 0x9a5236,
        ),
      );
  });
  parts.push(
    part(place(new RoundedBoxGeometry(0.9, 0.45, 0.65, 1, 0.07), [1.6, 0.2, 0.9], [0.3, 0.6, 0.2]), L),
  );
  parts.push(
    part(place(new RoundedBoxGeometry(0.9, 0.45, 0.65, 1, 0.07), [2.6, 0.2, 0.3], [0, 1.2, 0.3]), L),
  );
  return mergeGeometries(parts)!;
}

/** Stepped grey-green sandstone outcrop of the old quarry, with cut notches. */
export function outcropGeometry(): THREE.BufferGeometry {
  const S = 0x9ea283;
  const parts: THREE.BufferGeometry[] = [];
  [
    [0, 0, 0, 7, 3, 5],
    [0.5, 3, -0.6, 5.5, 2, 4],
    [-0.8, 5, -1, 3.6, 1.6, 3],
  ].forEach(([x, y, z, w, h, d]) =>
    parts.push(part(place(new RoundedBoxGeometry(w!, h!, d!, 1, 0.35), [x!, y! + h! / 2, z!]), S)),
  );
  // Blocks already cut and waiting, with drilled lifting holes shown as dark dots.
  for (const [x, z] of [
    [-3.5, 3.4],
    [-2, 3.8],
    [2.6, 3.5],
  ] as const) {
    parts.push(part(place(new RoundedBoxGeometry(1.4, 0.8, 1.0, 1, 0.08), [x, 0.4, z]), 0xa7ab8a));
    parts.push(
      part(place(new THREE.CylinderGeometry(0.06, 0.06, 0.02, lpSeg(6, 3)), [x, 0.81, z]), 0x3a3a30),
    );
  }
  return mergeGeometries(parts)!;
}

/** Wooden landing dock. */
export function dockGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++)
    parts.push(
      part(
        place(new RoundedBoxGeometry(0.42, 0.12, 3.2, 1, 0.03), [i * 0.46, 0.9, 0]),
        i % 2 ? COLORS.wood : 0x94643a,
      ),
    );
  for (const x of [0, 3.7])
    for (const z of [-1.4, 1.4])
      parts.push(
        part(place(new THREE.CylinderGeometry(0.1, 0.12, 2.2, lpSeg(6, 3)), [x, 0.2, z]), COLORS.woodDark),
      );
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- heroes

const ARM_R: [number, number, number, number, number] = [-1, 1.5, LIMB.forearm, 0, 0];
const ARM_L: [number, number, number, number, number] = [1, 1.5, LIMB.forearm, 0, 0];

/** Vireak, the warrior: cord armour, round shield, curved sword, gold headband. */
export function warriorGeometry(): THREE.BufferGeometry {
  const extra = [
    part(
      place(
        new THREE.TorusGeometry(0.24, 0.022, lpSeg(4, 3), lpSeg(16, 4)),
        [0, 1.36, 0],
        [Math.PI / 2 - 0.5, 0, 0.6],
        [1.35, 1, 0.9],
      ),
      0x5a2a18,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.24, 0.022, lpSeg(4, 3), lpSeg(16, 4)),
        [0, 1.36, 0],
        [Math.PI / 2 - 0.5, 0, -0.6],
        [1.35, 1, 0.9],
      ),
      0x5a2a18,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.128, 0.016, lpSeg(4, 3), lpSeg(16, 4)),
        [0, 1.87, 0.01],
        [Math.PI / 2 + 0.12, 0, 0],
      ),
      COLORS.gold,
    ),
    // Shield on the left forearm.
    part(
      place(
        new THREE.CylinderGeometry(0.3, 0.3, 0.05, lpSeg(16, 3)),
        [-0.42, 1.08, 0.08],
        [0, 0, Math.PI / 2],
      ),
      0x7a3a22,
      ARM_L,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.29, 0.025, lpSeg(4, 3), lpSeg(18, 4)),
        [-0.45, 1.08, 0.08],
        [0, Math.PI / 2, 0],
      ),
      COLORS.gold,
      ARM_L,
    ),
    part(
      place(new THREE.SphereGeometry(0.07, lpSeg(8, 4), lpSeg(6, 3)), [-0.47, 1.08, 0.08]),
      COLORS.gold,
      ARM_L,
    ),
    // Sword in the right hand, pointing forward and down.
    part(
      place(
        new THREE.CylinderGeometry(0.025, 0.025, 0.2, lpSeg(6, 3)),
        [0.355, 0.84, 0.08],
        [Math.PI / 2, 0, 0],
      ),
      COLORS.woodDark,
      ARM_R,
    ),
    part(place(new RoundedBoxGeometry(0.2, 0.04, 0.05, 1, 0.01), [0.355, 0.84, 0.18]), COLORS.gold, ARM_R),
    part(
      place(new RoundedBoxGeometry(0.05, 0.02, 0.75, 1, 0.008), [0.355, 0.8, 0.56], [0.25, 0, 0]),
      0xd9dde2,
      ARM_R,
    ),
  ];
  return mergeGeometries([workerGeometry(), ...extra])!;
}

/** Piseth, the Brahmin sage: long white robe, saffron shawl, sacred thread, beard, lotus staff. */
export function sageGeometry(): THREE.BufferGeometry {
  const extra = [
    part(place(new THREE.CylinderGeometry(0.24, 0.34, 0.92, lpSeg(16, 3), 1, true), [0, 0.5, 0]), 0xf1ead8),
    part(
      place(
        new THREE.TorusGeometry(0.22, 0.05, lpSeg(5, 3), lpSeg(16, 4)),
        [0, 1.3, 0],
        [Math.PI / 2 - 0.45, 0.2, -0.5],
        [1.3, 1, 0.9],
      ),
      0xe0892a,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.2, 0.008, 3, lpSeg(16, 4)),
        [0, 1.3, 0],
        [Math.PI / 2 - 0.5, 0, 0.55],
        [1.35, 1, 0.9],
      ),
      0xfaf6ec,
    ),
    part(
      place(
        new THREE.SphereGeometry(0.075, lpSeg(8, 4), lpSeg(6, 3)),
        [0, 1.7, 0.08],
        [0, 0, 0],
        [1, 1.5, 0.8],
      ),
      0xe8e4dc,
    ),
    part(place(new THREE.SphereGeometry(0.075, lpSeg(8, 4), lpSeg(6, 3)), [0, 1.98, -0.02]), 0xe8e4dc),
    // Tall staff with a golden lotus.
    part(
      place(new THREE.CylinderGeometry(0.028, 0.03, 2.1, lpSeg(6, 3)), [0.37, 1.2, 0.05]),
      COLORS.wood,
      ARM_R,
    ),
    part(
      place(
        new THREE.SphereGeometry(0.1, lpSeg(10, 4), lpSeg(8, 3)),
        [0.37, 2.28, 0.05],
        [0, 0, 0],
        [1, 1.5, 1],
      ),
      COLORS.gold,
      ARM_R,
    ),
  ];
  return mergeGeometries([workerGeometry(), ...extra])!;
}

/** Kiri, the elephant rider: a war elephant with a gold head plate and a mahout on its neck. */
export function riderGeometry(): THREE.BufferGeometry {
  const S = COLORS.skin;
  const extra = [
    part(place(new RoundedBoxGeometry(0.7, 0.9, 0.08, 1, 0.03), [0, 3.02, 2.0], [-0.5, 0, 0]), COLORS.gold),
    part(place(new THREE.SphereGeometry(0.1, lpSeg(8, 4), lpSeg(6, 3)), [0, 3.5, 1.9]), 0xb8412f),
    // Mahout sitting on the neck.
    part(
      place(
        new THREE.SphereGeometry(0.2, lpSeg(12, 4), lpSeg(10, 3)),
        [0, 3.35, 1.0],
        [0, 0, 0],
        [1.1, 0.8, 0.9],
      ),
      0xffffff,
      [0, 0, LIMB.body, 1, 0],
    ),
    part(
      place(
        new THREE.SphereGeometry(0.19, lpSeg(12, 4), lpSeg(10, 3)),
        [0, 3.7, 1.0],
        [0, 0, 0],
        [1.3, 1.1, 0.8],
      ),
      S,
    ),
    part(place(new THREE.SphereGeometry(0.12, lpSeg(12, 4), lpSeg(10, 3)), [0, 4.02, 1.05]), S),
    part(
      place(
        new THREE.SphereGeometry(0.125, lpSeg(10, 4), lpSeg(6, 3), 0, Math.PI * 2, 0, 1.3),
        [0, 4.03, 1.04],
        [-0.3, 0, 0],
      ),
      COLORS.hair,
    ),
    part(place(new THREE.SphereGeometry(0.055, lpSeg(8, 4), lpSeg(6, 3)), [0, 4.19, 1.0]), COLORS.hair),
    ...[-1, 1].map((s) =>
      part(
        place(
          new THREE.CapsuleGeometry(0.06, 0.45, 2, lpSeg(6, 4)),
          [s * 0.28, 3.15, 1.1],
          [0.5, 0, s * 0.5],
        ),
        S,
      ),
    ),
    ...[-1, 1].map((s) =>
      part(
        place(new THREE.CapsuleGeometry(0.05, 0.36, 2, lpSeg(6, 4)), [s * 0.25, 3.65, 1.2], [1.0, 0, 0]),
        S,
      ),
    ),
    // Ankus (elephant goad) in the right hand.
    part(
      place(new THREE.CylinderGeometry(0.02, 0.02, 0.9, lpSeg(5, 3)), [0.25, 3.75, 1.55], [1.2, 0, 0]),
      COLORS.wood,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.06, 0.012, 3, lpSeg(8, 4), Math.PI),
        [0.25, 3.9, 1.95],
        [0, Math.PI / 2, 0],
      ),
      COLORS.gold,
    ),
  ];
  return mergeGeometries([elephantGeometry(), ...extra])!;
}

export function heroGeometry(id: 'warrior' | 'sage' | 'rider'): THREE.BufferGeometry {
  return id === 'warrior' ? warriorGeometry() : id === 'sage' ? sageGeometry() : riderGeometry();
}

/** Sampot / cloth colour for each hero (instance colour of the cloth parts). */
export const HERO_CLOTH: Record<'warrior' | 'sage' | 'rider', number> = {
  warrior: 0x8c2f22,
  sage: 0xf1ead8,
  rider: 0xc9642b,
};

/** Khmer training post: a wooden post with a crossbar and a straw figure to strike. ~2 m. */
export function trainingPostGeometry(): THREE.BufferGeometry {
  const straw = 0xd8b86a;
  return mergeGeometries([
    part(place(new THREE.CylinderGeometry(0.12, 0.15, 2.0, lpSeg(8, 3)), [0, 1.0, 0]), COLORS.woodDark),
    part(
      place(new THREE.CylinderGeometry(0.07, 0.07, 1.4, lpSeg(6, 3)), [0, 1.45, 0], [0, 0, Math.PI / 2]),
      COLORS.wood,
    ),
    part(place(new THREE.CapsuleGeometry(0.3, 0.5, 3, lpSeg(10, 4)), [0, 1.2, 0.05]), straw),
    part(place(new THREE.SphereGeometry(0.22, lpSeg(12, 4), lpSeg(10, 3)), [0, 1.9, 0.05]), 0xe2c98a),
    part(
      place(
        new THREE.TorusGeometry(0.22, 0.04, lpSeg(5, 3), lpSeg(14, 4)),
        [0, 1.9, 0.05],
        [Math.PI / 2, 0, 0],
      ),
      0xb8412f,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.31, 0.03, lpSeg(4, 3), lpSeg(14, 4)),
        [0, 1.0, 0.05],
        [Math.PI / 2, 0, 0],
      ),
      0x8a6a3a,
    ),
    part(
      place(
        new THREE.TorusGeometry(0.31, 0.03, lpSeg(4, 3), lpSeg(14, 4)),
        [0, 1.4, 0.05],
        [Math.PI / 2, 0, 0],
      ),
      0x8a6a3a,
    ),
    part(place(new RoundedBoxGeometry(0.6, 0.12, 0.6, 1, 0.03), [0, 0.06, 0]), 0x8a7a64),
  ])!;
}
