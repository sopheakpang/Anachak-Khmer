import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, place, treeGeometry } from '../../engine/figures';

/**
 * More of the Khmer countryside for the Anno-style upgrade (D79, PK's plan): tree kinds
 * (banyan, bamboo, mango beside the common tree and the sugar palm), the kitchen garden and
 * household things by every house, and a swaying-leaves material for windy days.
 */

const cyl = (r0: number, r1: number, h: number, n = 6) => new THREE.CylinderGeometry(r0, r1, h, n);
const ico = (r: number) => new THREE.IcosahedronGeometry(r, 0);

/** Banyan / strangler fig: a broad, low crown on a thick trunk with hanging roots. */
export function banyanGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [part(place(cyl(0.45, 0.65, 3.2, 8), [0, 1.6, 0]), 0x6a5a48)];
  for (const [x, z] of [
    [0.9, 0.4],
    [-0.8, 0.6],
    [0.3, -0.9],
    [-0.5, -0.6],
  ] as const)
    p.push(part(place(cyl(0.05, 0.08, 3.4, 4), [x * 1.6, 1.7, z * 1.6]), 0x7a6650)); // aerial roots
  for (const [x, y, z, r, c] of [
    [0, 4.2, 0, 2.4, 0x3f6a2a],
    [1.9, 3.8, 0.6, 1.7, 0x4a7a30],
    [-1.8, 3.9, -0.4, 1.8, 0x456f2c],
    [0.4, 3.7, -1.9, 1.6, 0x4f7f33],
    [-0.6, 3.8, 1.8, 1.6, 0x416c2c],
    [0.2, 5.0, 0.2, 1.6, 0x55853a],
  ] as const)
    p.push(part(place(ico(r), [x, y, z], [0, 0, 0], [1, 0.62, 1]), c));
  return mergeGeometries(p)!;
}

/**
 * Anachak Khmer's anime forest (PK's reference image): a great banyan — a buttressed trunk of
 * twisting stems, a curtain of aerial roots, branches reaching out under a broad, layered
 * crown of soft rounded leaf masses in two greens.
 */
export function greatBanyanGeometry(): THREE.BufferGeometry {
  const bark = [0x6a5a44, 0x7a6850, 0x5e5040];
  const p: THREE.BufferGeometry[] = [];
  // The trunk: several stems twisting together, flaring into buttress roots.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.push(
      part(
        place(
          cyl(0.22, 0.42, 4.6, 6),
          [Math.cos(a) * 0.32, 2.3, Math.sin(a) * 0.32],
          [Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08],
        ),
        bark[i % 3]!,
      ),
    );
    p.push(
      part(
        place(
          cyl(0.05, 0.3, 1.4, 5),
          [Math.cos(a) * 0.95, 0.5, Math.sin(a) * 0.95],
          [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9],
        ),
        bark[(i + 1) % 3]!,
      ),
    );
  }
  // Branches.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    p.push(
      part(
        place(
          cyl(0.1, 0.2, 3.4, 6),
          [Math.cos(a) * 1.4, 4.6, Math.sin(a) * 1.4],
          [Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05],
        ),
        0x6a5a44,
      ),
    );
  }
  // A curtain of aerial roots from the branches.
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4;
    const r = 1.6 + (i % 4) * 0.55;
    const h = 3.2 + (i % 3) * 0.6;
    p.push(part(place(cyl(0.03, 0.06, h, 4), [Math.cos(a) * r, h / 2 + 0.6, Math.sin(a) * r]), 0x8a7558));
  }
  // The crown: rounded masses, darker below, light on top (a painted, two-tone canopy).
  const masses: Array<[number, number, number, number, number]> = [
    [0, 6.4, 0, 2.6, 0x3d6b2a],
    [2.4, 5.9, 0.8, 2.0, 0x47792f],
    [-2.3, 6.0, -0.6, 2.1, 0x42722c],
    [0.6, 5.8, -2.4, 1.9, 0x4c7e33],
    [-0.8, 5.9, 2.3, 1.9, 0x3f6e2b],
    [1.6, 7.4, -0.6, 1.7, 0x5a923c],
    [-1.2, 7.5, 0.8, 1.6, 0x63a043],
    [0.2, 8.2, 0.1, 1.4, 0x6fae4a],
  ];
  // The high, small masses are simpler (seen against the sky, the ink draws their shape).
  masses.forEach(([x, y, z, r, c], i) =>
    p.push(
      part(place(new THREE.IcosahedronGeometry(r, i < 5 ? 1 : 0), [x, y, z], [0, 0, 0], [1.1, 0.68, 1.1]), c),
    ),
  );
  return mergeGeometries(p)!;
}

/** A lush broadleaf tree: a gently curved trunk under a cloud of rounded leaf masses. */
export function lushTreeGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(place(cyl(0.16, 0.28, 3.4, 7), [0, 1.7, 0], [0.06, 0, 0.05]), 0x6e5a42));
  p.push(part(place(cyl(0.07, 0.12, 1.6, 5), [0.5, 3.0, 0.1], [0, 0, -0.7]), 0x6e5a42));
  const masses: Array<[number, number, number, number, number]> = [
    [0, 4.3, 0, 1.7, 0x4a7f30],
    [1.0, 4.0, 0.4, 1.2, 0x55893a],
    [-0.9, 4.1, -0.3, 1.25, 0x447a2c],
    [0.2, 5.1, 0.1, 1.15, 0x67a346],
  ];
  for (const [x, y, z, r, c] of masses)
    p.push(part(place(new THREE.IcosahedronGeometry(r, 1), [x, y, z], [0, 0, 0], [1, 0.8, 1]), c));
  return mergeGeometries(p)!;
}

/** A clump of bamboo: tall green culms leaning out, feathery leaf tufts. */
export function bambooGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 6 + (i % 3) * 1.4;
    p.push(
      part(
        place(
          cyl(0.07, 0.1, h, 5),
          [Math.cos(a) * 0.45, h / 2, Math.sin(a) * 0.45],
          [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18],
        ),
        0x8a9a3c,
      ),
    );
    p.push(
      part(
        place(ico(1.0), [Math.cos(a) * 1.5, h - 0.4, Math.sin(a) * 1.5], [0, 0, 0], [0.9, 1.6, 0.9]),
        i % 2 ? 0x6d9a3a : 0x86ad48,
      ),
    );
  }
  return mergeGeometries(p)!;
}

/**
 * Sugar palm (thnot) for the forest sets: the same silhouette as the field palms but about
 * half the triangles, since up to 1 600 trees are drawn twice (view and shadows).
 */
export function forestPalmGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    part(place(cyl(0.15, 0.24, 7, 5), [0.25, 3.5, 0], [0, 0, -0.07]), 0x6f5a45),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = place(ico(1), [0, 0, 0], [0, 0, 0], [0.9, 0.06, 0.9]);
    leaf.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationY(a)
        .multiply(new THREE.Matrix4().makeRotationX(0.75 + (i % 2 ? 0.25 : -0.3)))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.15)),
    );
    leaf.translate(0.5, 7.1, 0);
    p.push(part(leaf, i % 3 ? 0x5f8a3a : 0x6f9a46));
  }
  return mergeGeometries(p)!;
}

/** Mango: a dense, dark, rounded crown (village and temple groves). */
export function mangoGeometry(): THREE.BufferGeometry {
  const g = treeGeometry(1).clone();
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++)
    if (c.getY(i) > c.getX(i)) c.setXYZ(i, c.getX(i) * 0.7, c.getY(i) * 0.8, c.getZ(i) * 0.65);
  return g.scale(1.15, 1.05, 1.15);
}

/**
 * Beside a house (PK: "plant vegetables near the house"; jars, firewood and fences): a
 * kitchen garden of raised beds, three clay water jars, a stack of firewood and a bamboo
 * fence. Built round the origin, to stand to one side of a house.
 */
export function homeYardGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 3; r++) {
    p.push(part(place(new THREE.BoxGeometry(2.6, 0.18, 0.6), [0, 0.09, -0.9 + r * 0.9]), 0x5b4130)); // bed
    for (let k = 0; k < 6; k++)
      p.push(
        part(
          place(ico(0.17), [-1.1 + k * 0.44, 0.3, -0.9 + r * 0.9], [0, k, 0], [1, 0.7, 1]),
          r === 1 ? 0x8fbf3c : 0x5f9a35,
        ),
      );
  }
  for (let k = 0; k < 3; k++)
    p.push(
      part(
        place(new THREE.SphereGeometry(0.34, 7, 5), [2.0, 0.36, -0.8 + k * 0.7], [0, 0, 0], [1, 1.15, 1]),
        k === 1 ? 0x6b3b22 : 0x8a4b2a,
      ),
    );
  for (let k = 0; k < 6; k++)
    p.push(
      part(
        place(
          cyl(0.08, 0.08, 1.4, 5),
          [-2.1, 0.1 + (k % 3) * 0.16, -0.7 + Math.floor(k / 3) * 0.2],
          [Math.PI / 2, 0, 0],
        ),
        0x7a5232,
      ),
    );
  for (let k = 0; k < 7; k++)
    p.push(part(place(new THREE.BoxGeometry(0.08, 0.9, 0.08), [-1.8 + k * 0.6, 0.45, 1.5]), 0xb39a5c));
  p.push(part(place(new THREE.BoxGeometry(3.7, 0.06, 0.06), [0, 0.7, 1.5]), 0xb39a5c));
  return mergeGeometries(p)!;
}

/** A flying egret (white, wings in a shallow V). */
export function egretGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    part(place(new THREE.SphereGeometry(0.16, 6, 4), [0, 0, 0], [0, 0, 0], [0.7, 0.6, 1.8]), 0xffffff),
    part(place(cyl(0.02, 0.03, 0.5, 4), [0, 0.04, 0.45], [Math.PI / 2.4, 0, 0]), 0xffffff),
    part(place(new THREE.ConeGeometry(0.03, 0.18, 4), [0, 0.1, 0.72], [Math.PI / 2, 0, 0]), 0xe0b030),
  ];
  for (const s of [-1, 1])
    p.push(
      part(place(new THREE.BoxGeometry(0.75, 0.02, 0.28), [s * 0.4, 0.08, 0], [0, 0, s * 0.3]), 0xf8f8f4),
    );
  return mergeGeometries(p)!;
}

/**
 * Leaves that sway in the wind (D79): crowns move with height above the trunk, each tree out
 * of step with its neighbours; `strength` follows the weather (calm 0.25, windy 1, storm 1.4).
 */
export function swayMaterial(): {
  material: THREE.MeshStandardMaterial;
  uniforms: { uTime: { value: number }; uWind: { value: number } };
} {
  const uniforms = { uTime: { value: 0 }, uWind: { value: 0.25 } };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  addSway(m, uniforms, 'sway');
  return { material: m, uniforms };
}

/**
 * The crowns sway (above 1.6 m, more the higher), each tree at its own phase: patched into any
 * material, so PK's textured tree models sway with the built-in ones (same uniforms).
 */
export function addSway(
  m: THREE.Material,
  uniforms: { uTime: { value: number }; uWind: { value: number } },
  key: string,
): void {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float ph = 0.0;
        #endif
        float bend = max(0.0, position.y - 1.6) * 0.045 * uWind;
        transformed.x += sin(uTime * 1.7 + ph) * bend;
        transformed.z += cos(uTime * 1.3 + ph * 1.3) * bend * 0.7;`,
      );
  };
  m.customProgramCacheKey = () => key;
}

/**
 * One rice plant (a hill of 5 blades and a seed head), 1 m tall at full height, white so the
 * instance colour paints it (green as it grows, gold when ripe, straw when reaped).
 */
export function riceTuftGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // A full hill of blades: an inner upright ring and an outer ring arching out.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.4;
    const outer = i % 2 === 1;
    const lean = outer ? 0.38 : 0.14;
    const h = outer ? 0.8 : 1;
    p.push(
      part(
        place(
          new THREE.ConeGeometry(0.055, h, 3, 1),
          [Math.sin(a) * 0.09, h / 2, Math.cos(a) * 0.09],
          [Math.cos(a) * lean, 0, -Math.sin(a) * lean],
        ),
        0xffffff,
      ),
    );
  }
  // The seed head bows over (drawn in every stage; the colour shows it only when ripe).
  p.push(part(place(new THREE.ConeGeometry(0.05, 0.36, 3, 1), [0.12, 0.9, 0.04], [0, 0, -1.1]), 0xfff1c4));
  return mergeGeometries(p)!;
}

/**
 * The rahat (រហាត់ទឹក): a wooden water wheel trodden by foot to lift water into the field,
 * on a frame over a trough at the bund. The wheel turns about the x axis (scene).
 */
export function rahatFrameGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-0.6, 0.6])
    for (const z of [-0.5, 0.5]) p.push(part(place(cyl(0.05, 0.06, 1.6, 5), [x, 0.8, z]), 0x6e4a2c));
  p.push(part(place(cyl(0.035, 0.035, 1.4, 5), [0, 1.55, 0.5], [0, 0, Math.PI / 2]), 0x7a5634)); // hand bar
  p.push(part(place(new THREE.BoxGeometry(0.5, 0.12, 1.6), [0, 0.12, 0]), 0x8a6a44)); // trough
  return mergeGeometries(p)!;
}

export function rahatWheelGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    part(place(cyl(0.06, 0.06, 1.3, 6), [0, 0, 0], [0, 0, Math.PI / 2]), 0x5a3a20),
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.push(
      part(
        place(new THREE.BoxGeometry(0.5, 0.05, 0.42), [0, Math.sin(a) * 0.42, Math.cos(a) * 0.42], [a, 0, 0]),
        0x8a6a44,
      ),
    );
  }
  return mergeGeometries(p)!;
}

/** A bamboo raft (ក្បូនឬស្សី) for one person crossing water, poled along (PK). Faces +z. */
export function bambooRaftGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++)
    p.push(
      part(
        place(cyl(0.075, 0.075, 2.4, 6), [-0.45 + i * 0.15, 0.07, 0], [Math.PI / 2, 0, 0]),
        i % 2 ? 0xc9b06a : 0xb39a52,
      ),
    );
  for (const z of [-0.85, 0.85])
    p.push(part(place(cyl(0.035, 0.035, 1.15, 5), [0, 0.16, z], [0, 0, Math.PI / 2]), 0x7a6038)); // ties
  // The punting pole held by the rafter, leaning back into the water.
  p.push(part(place(cyl(0.025, 0.025, 3.4, 5), [0.35, 1.0, -0.4], [-0.45, 0, 0.2]), 0x8a7040));
  return mergeGeometries(p)!;
}

/** A gem patch (PK): a grey rock with blue sapphire and red ruby crystals breaking through. */
export function gemRockGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    part(place(new THREE.DodecahedronGeometry(0.9, 0), [0, 0.45, 0], [0, 0, 0], [1.2, 0.6, 1]), 0x8e8a82),
  ];
  const crystals: Array<[number, number, number, number, number]> = [
    [0.35, 0.8, 0.1, 0.28, 0x2f5fd8],
    [-0.3, 0.75, 0.3, 0.22, 0xc8203a],
    [0.05, 0.9, -0.35, 0.25, 0x3a7af0],
    [-0.45, 0.6, -0.2, 0.18, 0xe0304a],
    [0.55, 0.55, -0.3, 0.16, 0x7a4ad8],
  ];
  for (const [x, y, z, r, c] of crystals)
    p.push(part(place(new THREE.OctahedronGeometry(r, 0), [x, y, z], [0.3, x, 0.2], [0.7, 1.5, 0.7]), c));
  return mergeGeometries(p)!;
}
