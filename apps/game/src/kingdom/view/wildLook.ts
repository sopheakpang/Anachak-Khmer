import type * as THREE from 'three';
import {
  bantengGeometry,
  boarGeometry,
  deerGeometry,
  fowlGeometry,
  tigerGeometry,
} from '../../engine/animals';
import { WILDLIFE_GEOMETRY } from '../../engine/wildlife';

/**
 * How each wild animal is drawn (D61, Cambodian wildlife D75): model, crowd scale, leg
 * (and arm) motion, hover-ring radius, and `perch`: the height a canopy animal sits at in
 * the trees while it rests (it climbs down to run). Snakes and the crocodile have no
 * swinging legs (leg 0): only their heads and tails sway.
 */
export interface AnimalLook {
  geo: () => THREE.BufferGeometry;
  scale: number;
  speed: number;
  leg: number;
  arm?: number;
  ring: number;
  perch?: number;
}
const W = WILDLIFE_GEOMETRY;
export const ANIMAL_LOOK: Record<string, AnimalLook> = {
  deer: { geo: deerGeometry, scale: 0.72, speed: 7, leg: 0.5, ring: 1.1 },
  boar: { geo: boarGeometry, scale: 1, speed: 9, leg: 0.5, ring: 1.1 },
  banteng: { geo: bantengGeometry, scale: 1.05, speed: 4, leg: 0.35, ring: 1.6 },
  junglefowl: { geo: () => fowlGeometry(false), scale: 1, speed: 12, leg: 0.6, ring: 0.7 },
  peafowl: { geo: () => fowlGeometry(true), scale: 1, speed: 10, leg: 0.5, ring: 0.9 },
  tiger: { geo: tigerGeometry, scale: 1.1, speed: 7, leg: 0.45, ring: 1.6 },
  elephant: { geo: W.elephant!, scale: 0.95, speed: 3, leg: 0.25, ring: 2.6 },
  gaur: { geo: W.gaur!, scale: 1.15, speed: 4, leg: 0.35, ring: 1.8 },
  kouprey: { geo: W.kouprey!, scale: 1.05, speed: 4, leg: 0.35, ring: 1.7 },
  serow: { geo: W.serow!, scale: 1, speed: 8, leg: 0.5, ring: 1 },
  leopard: { geo: W.leopard!, scale: 1, speed: 8, leg: 0.45, ring: 1.4 },
  cloudedLeopard: { geo: W.cloudedLeopard!, scale: 1, speed: 8, leg: 0.45, ring: 1.3, perch: 2.6 },
  sunBear: { geo: W.sunBear!, scale: 1, speed: 6, leg: 0.4, ring: 1.1 },
  moonBear: { geo: W.moonBear!, scale: 1, speed: 6, leg: 0.4, ring: 1.3 },
  dhole: { geo: W.dhole!, scale: 1, speed: 11, leg: 0.55, ring: 0.9 },
  binturong: { geo: W.binturong!, scale: 1, speed: 6, leg: 0.4, ring: 1, perch: 2.8 },
  gibbon: { geo: W.gibbon!, scale: 1, speed: 6, leg: 0.3, arm: 0.6, ring: 0.9, perch: 3.4 },
  langur: { geo: W.langur!, scale: 1, speed: 9, leg: 0.5, ring: 0.9, perch: 3 },
  douc: { geo: W.douc!, scale: 1, speed: 9, leg: 0.5, ring: 0.9, perch: 3.2 },
  slowLoris: { geo: W.slowLoris!, scale: 1.3, speed: 2, leg: 0.25, ring: 0.6, perch: 2.4 },
  macaque: { geo: W.macaque!, scale: 1, speed: 10, leg: 0.55, ring: 0.8 },
  giantIbis: { geo: W.giantIbis!, scale: 1.1, speed: 8, leg: 0.45, ring: 0.9 },
  hornbill: { geo: W.hornbill!, scale: 1.1, speed: 8, leg: 0.4, ring: 0.9, perch: 3.6 },
  crocodile: { geo: W.crocodile!, scale: 1.2, speed: 2, leg: 0, ring: 2 },
  kingCobra: { geo: W.kingCobra!, scale: 1.1, speed: 3, leg: 0, ring: 1.2 },
  python: { geo: W.python!, scale: 1.1, speed: 2, leg: 0, ring: 1.6 },
};
/** A canopy animal's height eases towards its perch (resting) or the ground (running). */
export const PERCH_RATE = 2.5;
