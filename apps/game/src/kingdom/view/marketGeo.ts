import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, place } from '../../engine/figures';

/**
 * The market (Zhou Daguan, 1296–97): no shops, the women lay mats on the ground, each at her
 * own place, under light shades. A packed-earth ground, rows of woven mats with baskets of rice,
 * fish, fruit and cloth, clay jars, and four thatched shades on posts. 8 × 8 m (4 × 4 tiles).
 */

const EARTH = 0xb89668;
const MAT = [0xd8b46a, 0xc89a52, 0xe0c27a];
const POST = 0x6a4a2a;
const THATCH = 0xb0904a;
const BASKET = 0xa8783a;
const GOODS = [0xf2ead0, 0x8aa0a8, 0xe08a2a, 0x7a2a3a, 0x3a7a3a]; // rice, fish, fruit, cloth, greens

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);

/** A woven mat with two baskets of goods and a jar. */
function stall(p: THREE.BufferGeometry[], x: number, z: number, i: number): void {
  p.push(part(place(box(1.5, 0.03, 1.1), [x, 0.07, z]), MAT[i % MAT.length]!));
  for (const [dx, dz, g] of [
    [-0.4, -0.2, i],
    [0.35, 0.15, i + 2],
  ] as const) {
    p.push(part(place(cyl(0.26, 0.2, 0.26, 10), [x + dx, 0.2, z + dz]), BASKET));
    p.push(
      part(
        place(new THREE.SphereGeometry(0.23, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), [x + dx, 0.32, z + dz]),
        GOODS[g % GOODS.length]!,
      ),
    );
  }
  p.push(
    part(
      place(new THREE.SphereGeometry(0.17, 8, 6), [x + 0.5, 0.24, z - 0.35], [0, 0, 0], [1, 1.25, 1]),
      0x9a4a2a,
    ),
  );
}

/** A light shade: four posts and a sloping thatch. */
function shade(p: THREE.BufferGeometry[], x: number, z: number, ry: number): void {
  const g: THREE.BufferGeometry[] = [];
  for (const [dx, dz] of [
    [-0.9, -0.8],
    [0.9, -0.8],
    [-0.9, 0.8],
    [0.9, 0.8],
  ] as const)
    g.push(part(place(cyl(0.05, 0.06, dz < 0 ? 2.1 : 1.8, 6), [dx, dz < 0 ? 1.05 : 0.9, dz]), POST));
  g.push(part(place(box(2.2, 0.12, 2.0), [0, 1.98, 0], [0.15, 0, 0]), THATCH));
  const m = mergeGeometries(g)!;
  m.rotateY(ry);
  m.translate(x, 0, z);
  p.push(m);
}

export function marketGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(part(place(box(7.6, 0.06, 7.6), [0, 0.03, 0]), EARTH));
  let i = 0;
  for (const z of [-2.6, 0, 2.6])
    for (const x of [-2.6, 0, 2.6]) {
      if (x === 0 && z === 0) continue; // the open middle, where people walk
      stall(p, x, z, i++);
    }
  shade(p, -2.6, -2.6, 0.2);
  shade(p, 2.6, -2.6, -0.2);
  shade(p, -2.6, 2.6, Math.PI - 0.15);
  shade(p, 2.6, 2.6, Math.PI + 0.15);
  // A tall pole with a cloth banner in the middle: the market is open.
  p.push(part(place(cyl(0.05, 0.06, 3.6, 6), [0, 1.8, 0]), POST));
  p.push(part(place(box(0.03, 0.9, 0.6), [0, 3.1, 0.32]), 0xc8462a));
  return mergeGeometries(p.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}
