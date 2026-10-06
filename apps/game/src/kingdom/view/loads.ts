import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Resource } from '@temples/shared';
import { part, place } from '../../engine/figures';

/**
 * What a worker carries home (PK: real things, not a coloured box), drawn only while he
 * walks with it, as people carry in the Bayon's daily-life reliefs: a woven basket of rice
 * sheaves on the head, a bundle of logs on the shoulder, a sandstone block on a head pad, a
 * small lidded basket for gold and gems. Built round the carrier's head (y = 0 at the crown).
 */
export function loadGeometry(res: Resource): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);
  switch (res) {
    case 'food':
      p.push(part(place(cyl(0.12, 0.12, 0.04), [0, 0.02, 0]), 0xd8c08a)); // head pad
      p.push(part(place(cyl(0.3, 0.2, 0.26, 10), [0, 0.17, 0]), 0xa8834a)); // rattan basket
      p.push(
        part(place(new THREE.TorusGeometry(0.29, 0.025, 4, 12), [0, 0.3, 0], [Math.PI / 2, 0, 0]), 0x7a5a2e),
      );
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        p.push(
          part(
            place(
              cyl(0.035, 0.05, 0.36, 4),
              [Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12],
              [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4],
            ),
            0xd9b44c,
          ),
        ); // rice sheaves
      }
      break;
    case 'wood':
      for (const [x, y] of [
        [-0.08, 0],
        [0.08, 0],
        [0, 0.13],
      ] as const)
        p.push(part(place(cyl(0.07, 0.08, 1.3, 6), [0.28 + x, -0.32 + y, 0], [Math.PI / 2, 0, 0]), 0x7a5634)); // logs on the shoulder
      p.push(part(place(new THREE.TorusGeometry(0.15, 0.02, 4, 8), [0.28, -0.26, 0.3]), 0x5a4020)); // tie
      break;
    case 'stone':
      p.push(part(place(cyl(0.13, 0.13, 0.04), [0, 0.02, 0]), 0xd8c08a)); // head pad
      p.push(part(place(new THREE.BoxGeometry(0.42, 0.24, 0.32), [0, 0.16, 0]), 0xc2b48c)); // sandstone block
      break;
    default:
      p.push(part(place(cyl(0.12, 0.12, 0.04), [0, 0.02, 0]), 0xd8c08a));
      p.push(part(place(cyl(0.16, 0.13, 0.2, 8), [0, 0.12, 0]), 0x8a6a3a)); // small basket
      p.push(part(place(new THREE.ConeGeometry(0.17, 0.12, 8), [0, 0.28, 0]), 0x6a4a24)); // lid
      p.push(part(place(new THREE.OctahedronGeometry(0.05, 0), [0.1, 0.24, 0.1]), 0xf1c24a)); // a glint of gold
  }
  return mergeGeometries(p)!;
}
