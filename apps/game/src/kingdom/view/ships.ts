import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, place } from '../../engine/figures';

/**
 * Ships and the landing (PK: when the Chinese merchants come by big ship, build a port, and
 * show the ships the Chinese used in these years). The junk follows what is known of Song
 * and Yuan sea-going junks (12th–13th century; the Quanzhou wreck, Song paintings): a flat,
 * broad hull with a bluff bow and a high square transom stern, a stern rudder, a deck house
 * aft, and two masts with brown matting sails stiffened by bamboo battens. All face +z (bow).
 */

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);

/** The hull from its side profile (z along, y up), extruded across the beam. */
function hull(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Bow at +z, stern at -z; the stern rises high and square.
  s.moveTo(7.2, 2.2);
  s.lineTo(6.4, 0.4);
  s.lineTo(5.2, -0.4);
  s.lineTo(-5.4, -0.4);
  s.lineTo(-6.8, 0.6);
  s.lineTo(-7.2, 3.4);
  s.lineTo(-6.0, 3.4);
  s.lineTo(-5.6, 2.2);
  s.lineTo(6.6, 2.0);
  s.lineTo(7.2, 2.2);
  const g = new THREE.ExtrudeGeometry(s, { depth: 4.2, bevelEnabled: false });
  // The shape is in (x = along, y = up); turn so "along" is +z and centre the beam on x = 0.
  g.rotateY(-Math.PI / 2);
  g.translate(2.1, 0, 0);
  g.deleteAttribute('uv');
  return g.toNonIndexed();
}

/** A battened lug sail: matting with bamboo battens across it. */
function sail(w: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const out = [part(place(box(0.06, h, w), [x, y, z]), 0xa0552c)];
  for (let i = 0; i <= 6; i++)
    out.push(part(place(box(0.1, 0.07, w + 0.2), [x + 0.05, y - h / 2 + (i * h) / 6, z]), 0x4a3420));
  return out;
}

export function junkGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [part(hull(), 0x5c3c24)];
  p.push(part(place(box(4.0, 0.12, 12.4), [0, 2.05, -0.2]), 0x8a6a44)); // deck
  p.push(part(place(box(3.4, 1.6, 2.8), [0, 2.9, -4.6]), 0x6a4a2c)); // deck house aft
  p.push(part(place(box(3.8, 0.2, 3.2), [0, 3.75, -4.6]), 0x3a2a1a));
  p.push(part(place(box(0.25, 2.4, 1.2), [0, 0.9, -7.3]), 0x3a2a1a)); // stern rudder
  p.push(part(place(box(4.3, 0.18, 0.18), [0, 2.25, 6.8]), 0xa8322a)); // red bow rail
  // Masts and sails: the main mast amidships, the foremast forward.
  p.push(part(place(cyl(0.16, 0.22, 11, 6), [0, 7.4, 0.6]), 0x6e4a2c));
  p.push(part(place(cyl(0.12, 0.16, 8, 6), [0, 5.9, 4.6]), 0x6e4a2c));
  p.push(...sail(4.4, 7.2, 0.2, 8.2, 0.4));
  p.push(...sail(3.2, 5.0, 0.18, 6.6, 4.5));
  p.push(part(place(box(0.04, 0.8, 1.2), [0, 13.3, 0.6]), 0xd23a2a)); // pennant
  return mergeGeometries(p)!;
}

/**
 * The river landing (កំពង់ផែ), 8 × 8 m: a store shed at the back, a plank landing stage on
 * posts running out over the water (+z), mooring posts, jars and bales of goods.
 */
export function portGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // Store shed.
  for (const x of [-2.6, 2.6])
    for (const z of [-3.4, -1.0]) p.push(part(place(cyl(0.12, 0.14, 2.4, 6), [x, 1.2, z]), 0x6e4a2c));
  p.push(part(place(box(5.8, 0.25, 3.0), [0, 2.5, -2.2], [0.12, 0, 0]), 0xb8954f)); // thatch
  p.push(part(place(box(5.6, 0.1, 2.6), [0, 0.35, -2.2]), 0x8a6a44));
  // Landing stage on posts, out over the water.
  p.push(part(place(box(2.4, 0.16, 11), [0, 0.7, 3.0]), 0x9a7650));
  for (let i = 0; i < 6; i++)
    for (const x of [-1.1, 1.1])
      p.push(part(place(cyl(0.1, 0.1, 1.9, 5), [x, -0.2, -1.6 + i * 1.9]), 0x5a3a22));
  for (const z of [4.6, 8.0]) p.push(part(place(cyl(0.14, 0.16, 1.4, 6), [1.6, 0.6, z]), 0x4a3420)); // mooring posts
  // Goods waiting: clay jars and bales.
  for (const [x, z] of [
    [-1.6, 0.4],
    [-2.2, 1.0],
    [-1.0, 1.1],
  ] as const)
    p.push(part(place(new THREE.SphereGeometry(0.36, 8, 6), [x, 0.4, z], [0, 0, 0], [1, 1.25, 1]), 0x9a5a34));
  for (const [x, z] of [
    [1.8, 0.2],
    [2.4, 0.9],
  ] as const)
    p.push(part(place(box(0.8, 0.6, 0.6), [x, 0.3, z]), 0xc8b07a));
  p.push(part(place(box(7.6, 0.05, 7.6), [0, 0.025, -0.2]), 0xa8916a)); // trodden ground
  return mergeGeometries(p)!;
}
