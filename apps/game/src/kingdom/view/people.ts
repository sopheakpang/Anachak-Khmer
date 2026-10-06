import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  COLORS,
  LIMB,
  part,
  place,
  taperedTube,
  workerGeometry,
  type WorkerOptions,
} from '../../engine/figures';
import { horseGeometry, zebuGeometry } from '../../engine/animals';
import { seg as lpSeg } from '../../engine/look';
import { archerGeometry, swordsmanGeometry } from './art';
import { buffaloGeometry, dogGeometry } from './beasts';

/**
 * The people of the Kingdom tab (villagers by job, soldiers by era, the commander, the
 * watchman and his dog, mounted units and the supply cart), built in code in the low-poly
 * style on top of the engine's worker figure. Figures face +Z, ~1.95 m tall, metres.
 *
 * Every part carries limb data for the crowd shader (engine/figures.ts): the tool or weapon
 * hand is the right forearm, the shield hand the left forearm, so thrusts, cuts and bow
 * draws still animate. Parts in the team colour use cloth mask 1 (sampot, krama, shields).
 *
 * Evidence notes are given per choice. Battle reliefs survive from Angkor Wat (12th c.,
 * south gallery, the army of Suryavarman II) and the Bayon (late 12th c., Jayavarman VII's
 * wars with Champa); for the 9th to 11th centuries there are almost no battle scenes, so the
 * 'early' and 'baphuon' looks are HISTORICALLY_UNCERTAIN extrapolations.
 */

export type EraLook = 'early' | 'baphuon' | 'angkorWat' | 'bayon';

/** Which dress an era's people wear (era ids from config/kingdom). */
export function eraLookOf(eraId: string): EraLook {
  switch (eraId) {
    case 'eleventh':
      return 'baphuon';
    case 'suryavarman2':
      return 'angkorWat';
    case 'jayavarman7':
      return 'bayon';
    default:
      return 'early'; // roluos, yasovarman, tenth
  }
}

export type Job =
  | 'idle'
  | 'builder'
  | 'farmer'
  | 'fisher'
  | 'woodcutter'
  | 'quarryman'
  | 'goldworker'
  | 'hunter'
  | 'forager'
  | 'porter';

export type SoldierType = 'spearman' | 'swordsman' | 'archer';

// ---------------------------------------------------------------- helpers

type Limb = [number, number, number, number, number?];
type V3 = [number, number, number];

const BODY: Limb = [0, 0, LIMB.body, 0];
const CLOTH: Limb = [0, 0, LIMB.body, 1];
/** Right hand: tool or weapon; bends and swings with the forearm. */
const FORE_R: Limb = [-1, 1.5, LIMB.forearm, 0];
/** Left hand: shield, bow, chisel. */
const FORE_L: Limb = [1, 1.5, LIMB.forearm, 0];
const FORE_L_CLOTH: Limb = [1, 1.5, LIMB.forearm, 1];

const HY = 1.8; // head centre of the worker figure

const P = {
  gold: COLORS.gold,
  wood: COLORS.wood,
  woodDark: COLORS.woodDark,
  bamboo: COLORS.bamboo,
  basket: 0xc49a55,
  basketDark: 0x8e6a36,
  rope: 0x9c7a4a,
  iron: 0x5f6468,
  steel: 0xd9dde0,
  stone: 0x8f8a80,
  horn: 0x3a3028,
  leather: 0x6b4b2e,
  scaleLight: 0x9a8150,
  scaleDark: 0x4e3d26,
  bronze: 0xa8783a,
  white: 0xf3ecd8,
  red: 0xc0282a,
  dark: 0x2a1a12,
  teeth: 0xf1e6cc,
  feather: 0xeee6d2,
  leaf: 0x5f8a3a,
};

const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, lpSeg(n, 3));
const ball = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, lpSeg(w, 4), lpSeg(h, 3));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cone = (r: number, h: number, n = 6) => new THREE.ConeGeometry(r, h, lpSeg(n, 3));

/** A round rod from a to b (radius r0 at a, r1 at b). */
function rod(a: V3, b: V3, r0: number, r1 = r0, n = 6): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(A);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, lpSeg(n, 3));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(A.x + (d.x * len) / 2, A.y + (d.y * len) / 2, A.z + (d.z * len) / 2);
}

/** A point (spear head, arrow fletching) of length len at b, pointing away from a. */
function tip(a: V3, b: V3, r: number, len: number, n = 4): THREE.BufferGeometry {
  const B = new THREE.Vector3(...b);
  const d = B.clone()
    .sub(new THREE.Vector3(...a))
    .normalize();
  const g = new THREE.ConeGeometry(r, len, lpSeg(n, 3));
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  return g.translate(B.x + (d.x * len) / 2, B.y + (d.y * len) / 2, B.z + (d.z * len) / 2);
}

/** A ring round the torso, tilted in the frontal plane (sashes and crossing straps). */
function band(r: number, depth: number, tube: number, y: number, tilt: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, 3, lpSeg(16, 8))
    .rotateX(Math.PI / 2)
    .scale(1, 1, depth)
    .rotateZ(tilt)
    .translate(0, y, 0);
}

/**
 * Move and scale a whole figure, keeping its joints: limb pivots (limb.y, limbZ) move with
 * the geometry so arms and legs still swing about the right place.
 */
function moveFigure(g: THREE.BufferGeometry, d: V3, k = 1): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const limb = g.getAttribute('limb') as THREE.BufferAttribute;
  const lz = g.getAttribute('limbZ') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * k + d[0], pos.getY(i) * k + d[1], pos.getZ(i) * k + d[2]);
    limb.setY(i, limb.getY(i) * k + d[1]);
    lz.setX(i, lz.getX(i) * k + d[2]);
  }
  return g;
}

/** Keep only the triangles for which keep(vertex index) is false for all three corners. */
function dropTriangles(g: THREE.BufferGeometry, drop: (i: number) => boolean): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const n = g.getAttribute('position').count;
  const kept: number[] = [];
  for (let t = 0; t < n; t += 3) if (!(drop(t) && drop(t + 1) && drop(t + 2))) kept.push(t);
  for (const name of ['position', 'normal', 'color', 'limb', 'limbZ']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute;
    const w = a.itemSize;
    const arr = new Float32Array(kept.length * 3 * w);
    kept.forEach((t, j) => arr.set((a.array as Float32Array).subarray(t * w, (t + 3) * w), j * 3 * w));
    out.setAttribute(name, new THREE.BufferAttribute(arr, w));
  }
  return out;
}

/** The worker without its legs (for riders and drivers, who get seated legs instead). */
function legless(opts: WorkerOptions): THREE.BufferGeometry {
  const g = workerGeometry('none', opts);
  const limb = g.getAttribute('limb');
  return dropTriangles(g, (i) => Math.round(limb.getZ(i)) === LIMB.leg);
}

/** Remove body parts hidden inside a cuirass (ellipsoid), to spend those triangles elsewhere. */
function hideUnderCuirass(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const limb = g.getAttribute('limb');
  return dropTriangles(g, (i) => {
    if (Math.round(limb.getZ(i)) !== LIMB.body || limb.getW(i) > 0.5) return false;
    const x = pos.getX(i) / 0.27;
    const y = (pos.getY(i) - 1.34) / 0.22;
    const z = (pos.getZ(i) + 0.005) / 0.17;
    return x * x + y * y + z * z < 1;
  });
}

// ---------------------------------------------------------------- dress

/** A cloth sash from the left shoulder to the right hip (Baphuon-era soldiers, UNCERTAIN). */
function chestSash(): THREE.BufferGeometry {
  return part(band(0.27, 0.7, 0.028, 1.3, 0.72), 0xffffff, CLOTH);
}

/**
 * Cuirass. Angkor Wat reliefs (SUPPORTED): soldiers wear a breastplate held by straps that
 * cross on the chest. Bayon reliefs (SUPPORTED): a close-fitting cuirass drawn as a scale
 * pattern; here the scales are the shell's own facets, coloured light and dark in staggered
 * rows (no extra triangles).
 */
function cuirass(scale: boolean, straps: 'cross' | 'shoulder' | 'none'): THREE.BufferGeometry[] {
  const w = scale ? 12 : lpSeg(14, 6);
  const h = scale ? 6 : lpSeg(8, 4);
  const shell = part(
    new THREE.SphereGeometry(0.2, w, h, 0, Math.PI * 2, 0.5, 2.2)
      .scale(1.45, 1.2, 0.95)
      .translate(0, 1.34, -0.005),
    scale ? P.scaleLight : P.leather,
  );
  if (scale) {
    // SphereGeometry emits two triangles per quad, row by row; darken one per quad,
    // alternating by row, for a staggered scale pattern.
    const col = shell.getAttribute('color') as THREE.BufferAttribute;
    const dark = new THREE.Color(P.scaleDark);
    for (let t = 0; t < col.count / 3; t++) {
      const q = Math.floor(t / 2);
      const row = Math.floor(q / w);
      if (t % 2 === row % 2) for (let k = 0; k < 3; k++) col.setXYZ(t * 3 + k, dark.r, dark.g, dark.b);
    }
  }
  const out = [shell];
  if (straps === 'cross')
    for (const s of [-1, 1]) out.push(part(band(0.29, 0.7, 0.02, 1.36, s * 0.62), P.gold));
  if (straps === 'shoulder')
    for (const s of [-1, 1])
      out.push(
        part(
          new THREE.TorusGeometry(0.2, 0.022, 3, lpSeg(14, 6))
            .rotateY(Math.PI / 2)
            .scale(1, 1, 0.9)
            .translate(s * 0.17, 1.38, -0.005),
          P.gold,
        ),
      );
  return out;
}

type Crest = 'deer' | 'bird' | 'horse';

/**
 * Helmet with an animal-head crest. On the Angkor Wat south gallery the regiments are told
 * apart by the beasts on their helmets (deer, birds/garuda, horses and others); which
 * animal goes with which arm is our assignment, not recorded.
 */
function helmet(crest: Crest): THREE.BufferGeometry[] {
  const G = P.gold;
  const out: THREE.BufferGeometry[] = [
    part(
      place(
        new THREE.SphereGeometry(0.145, lpSeg(12, 6), lpSeg(6, 3), 0, Math.PI * 2, 0, 1.35),
        [0, HY + 0.012, -0.008],
        [-0.25, 0, 0],
      ),
      P.bronze,
    ),
    part(place(cyl(0.02, 0.035, 0.05, 6), [0, HY + 0.165, -0.02]), G),
  ];
  const y = HY + 0.23;
  if (crest === 'deer') {
    out.push(part(place(ball(0.055, 6, 4), [0, y, 0.0], [0.35, 0, 0], [0.8, 0.85, 1.5]), G));
    for (const s of [-1, 1]) {
      out.push(part(place(cone(0.02, 0.06, 3), [s * 0.04, y + 0.05, -0.03], [0, 0, s * -1.0]), G));
      out.push(part(rod([s * 0.025, y + 0.04, -0.02], [s * 0.1, y + 0.2, -0.06], 0.013, 0.008, 3), G));
      out.push(part(rod([s * 0.06, y + 0.12, -0.04], [s * 0.05, y + 0.2, 0.02], 0.01, 0.006, 3), G));
    }
  } else if (crest === 'bird') {
    out.push(part(place(ball(0.06, 6, 4), [0, y, -0.01], [0, 0, 0], [0.85, 1, 1.1]), G));
    out.push(part(tip([0, y, 0], [0, y - 0.01, 0.05], 0.028, 0.12, 4), P.red)); // beak
    out.push(part(tip([0, y, 0], [0, y + 0.05, -0.05], 0.03, 0.12, 3), P.red)); // crest feathers
    for (const s of [-1, 1]) out.push(part(place(ball(0.014, 4, 3), [s * 0.045, y + 0.01, 0.03]), P.dark));
  } else {
    out.push(part(place(ball(0.05, 6, 4), [0, y, 0.04], [0.6, 0, 0], [0.7, 0.8, 1.9]), G));
    out.push(part(place(ball(0.045, 6, 4), [0, y - 0.04, -0.04], [-0.4, 0, 0], [0.7, 1.4, 0.9]), G)); // neck
    out.push(part(place(box(0.02, 0.1, 0.07), [0, y + 0.02, -0.06], [-0.4, 0, 0]), P.red)); // mane
    for (const s of [-1, 1]) out.push(part(place(cone(0.016, 0.05, 3), [s * 0.022, y + 0.07, 0.0]), G));
  }
  return out;
}

/**
 * Bayon reliefs (SUPPORTED): soldiers go bare-headed with short cropped hair and the long,
 * stretched earlobes of the period, with ear ornaments.
 */
function longEarlobes(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    out.push(
      part(place(ball(0.02, 5, 4), [s * 0.126, HY - 0.07, 0.0], [0, 0, 0], [0.55, 2.0, 0.8]), COLORS.skin),
    );
    out.push(
      part(
        place(new THREE.TorusGeometry(0.02, 0.006, 3, 6), [s * 0.128, HY - 0.12, 0], [0, Math.PI / 2, 0]),
        P.gold,
      ),
    );
  }
  return out;
}

/** Small gold diadem round the top-knot's base (commander without a helmet). */
function diadem(): THREE.BufferGeometry[] {
  const out = [
    part(
      place(
        new THREE.TorusGeometry(0.128, 0.014, 3, lpSeg(14, 7)),
        [0, HY + 0.06, -0.01],
        [Math.PI / 2 + 0.3, 0, 0],
      ),
      P.gold,
    ),
  ];
  for (const a of [-0.5, 0, 0.5])
    out.push(
      part(
        place(cone(0.022, 0.07, 3), [Math.sin(a) * 0.12, HY + 0.11, Math.cos(a) * 0.1], [0.3, 0, 0]),
        P.gold,
      ),
    );
  return out;
}

/**
 * Kala: the monster face without a lower jaw that guards Khmer doorways; the Angkor Wat
 * and Bayon reliefs show it on shields. Built in a local frame (face towards +z, size R):
 * round eyes, a brow ridge, a nose and a wide mouth with teeth, as small gold/dark bumps.
 */
function kalaFace(R: number, limb: Limb): THREE.BufferGeometry[] {
  const G = P.gold;
  const out: THREE.BufferGeometry[] = [
    part(place(box(1.1 * R, 0.16 * R, 0.1 * R), [0, 0.44 * R, 0.05 * R], [0, 0, 0]), G, limb), // brow
    part(place(ball(0.13 * R, 5, 4), [0, 0.0, 0.08 * R], [0, 0, 0], [1, 1, 0.8]), G, limb), // nose
    part(place(box(0.95 * R, 0.24 * R, 0.06 * R), [0, -0.38 * R, 0.03 * R]), P.dark, limb), // mouth
  ];
  for (const s of [-1, 1]) {
    out.push(
      part(place(ball(0.2 * R, 5, 4), [s * 0.32 * R, 0.2 * R, 0.05 * R], [0, 0, 0], [1, 1, 0.55]), G, limb),
    );
    out.push(part(place(ball(0.09 * R, 4, 3), [s * 0.32 * R, 0.2 * R, 0.14 * R]), P.dark, limb));
    // Fangs at the mouth corners.
    out.push(
      part(
        place(cone(0.07 * R, 0.24 * R, 3), [s * 0.4 * R, -0.3 * R, 0.08 * R], [0, 0, Math.PI]),
        P.teeth,
        limb,
      ),
    );
  }
  for (const x of [-0.18, 0, 0.18])
    out.push(
      part(place(cone(0.06 * R, 0.14 * R, 3), [x * R, -0.3 * R, 0.08 * R], [0, 0, Math.PI]), P.teeth, limb),
    );
  return out;
}

type ShieldShape = 'round' | 'oval' | 'tall';

/**
 * A shield on the left forearm, face turned outward (-x) like the existing units. The face
 * is in the team colour; kala shields carry the monster face, plain ones a gold boss.
 */
function shield(shape: ShieldShape, R: number, at: V3, kala: boolean): THREE.BufferGeometry[] {
  const sy = shape === 'round' ? 1 : shape === 'oval' ? 1.35 : 1.75;
  const local: THREE.BufferGeometry[] = [
    part(
      new THREE.CylinderGeometry(R, R, 0.05, lpSeg(14, 7)).rotateX(Math.PI / 2).scale(1, sy, 1),
      0xffffff,
      FORE_L_CLOTH,
    ),
  ];
  if (kala) {
    const face = kalaFace(R * 0.72, FORE_L);
    for (const f of face) f.translate(0, shape === 'tall' ? R * 0.35 : 0, 0.025);
    local.push(...face);
  } else local.push(part(place(ball(0.075, 6, 4), [0, 0, 0.03], [0, 0, 0], [1, 1, 0.6]), P.gold, FORE_L));
  return local.map((g) => g.rotateY(-Math.PI / 2).translate(...at));
}

/** Khmer dao in the right hand: grip, guard and a blade that curves forward (as art.ts). */
function dao(): THREE.BufferGeometry[] {
  return [
    part(place(cyl(0.025, 0.025, 0.2, 6), [0.355, 0.84, 0.08], [Math.PI / 2, 0, 0]), P.woodDark, FORE_R),
    part(place(box(0.1, 0.02, 0.05), [0.355, 0.84, 0.19]), P.gold, FORE_R),
    part(place(box(0.025, 0.05, 0.42), [0.355, 0.85, 0.41], [-0.04, 0, 0]), P.steel, FORE_R),
    part(place(box(0.022, 0.045, 0.2), [0.355, 0.88, 0.7], [-0.22, 0, 0]), P.steel, FORE_R),
  ];
}

/** Long bow in the left hand (as art.ts). */
function bow(): THREE.BufferGeometry {
  return part(
    place(
      new THREE.TorusGeometry(0.62, 0.022, 4, lpSeg(14, 7), Math.PI * 0.8),
      [-0.4, 1.05, 0.3],
      [0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.4],
    ),
    P.woodDark,
    FORE_L,
  );
}

/** A quiver slung across the back from a to b, with arrow ends showing at b. */
function quiver(a: V3, b: V3, r: number): THREE.BufferGeometry[] {
  const out = [part(rod(a, b, r * 0.85, r, 5), 0xffffff, CLOTH)];
  const d = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  for (const [ox, oz] of [
    [-0.025, 0.01],
    [0.025, 0.0],
    [0, -0.02],
  ] as const) {
    const s: V3 = [b[0] + ox, b[1], b[2] + oz];
    const e: V3 = [s[0] + d.x * 0.12, s[1] + d.y * 0.12, s[2] + d.z * 0.12];
    out.push(part(rod(s, e, 0.008, 0.008, 3), P.wood));
    out.push(part(tip(s, e, 0.022, 0.08, 3), P.feather));
  }
  return out;
}

/** A spear or javelin through the right hand: shaft from a to b, iron head at b. */
function spear(a: V3, b: V3, r = 0.022, head = 0.2, limb: Limb = FORE_R): THREE.BufferGeometry[] {
  return [part(rod(a, b, r, r * 0.85, 5), P.wood, limb), part(tip(a, b, r * 1.9, head, 4), P.iron, limb)];
}

/** Hair and ornaments per era for a soldier or rider, and what goes on the head. */
function soldierLook(era: EraLook, crest: Crest): { opts: WorkerOptions; head: THREE.BufferGeometry[] } {
  if (era === 'angkorWat') return { opts: { hair: 'short' }, head: helmet(crest) };
  if (era === 'bayon') return { opts: { hair: 'short' }, head: longEarlobes() };
  return { opts: {}, head: [] };
}

/** Body armour per era: none before Angkor Wat (UNCERTAIN), crossing straps, then scales. */
function soldierBody(era: EraLook): THREE.BufferGeometry[] {
  if (era === 'baphuon') return [chestSash()];
  if (era === 'angkorWat') return cuirass(false, 'cross');
  if (era === 'bayon') return cuirass(true, 'none');
  return [];
}

// ---------------------------------------------------------------- villagers

/** A basket (open-topped, tapered) in woven bamboo with a darker rim. */
function basket(r0: number, r1: number, h: number, at: V3, limb: Limb = BODY): THREE.BufferGeometry[] {
  return [
    part(place(cyl(r1, r0, h, 8), at), P.basket, limb),
    part(
      place(
        new THREE.TorusGeometry(r1, 0.015, 3, lpSeg(10, 5)),
        [at[0], at[1] + h / 2, at[2]],
        [Math.PI / 2, 0, 0],
      ),
      P.basketDark,
      limb,
    ),
  ];
}

/**
 * A villager by job, readable at RTS distance by the tool (Tool-to-Job rule). Commoners
 * wear no gold (armbands, necklace and earrings removed, plain belt): "avoid excessive
 * jewelry". Bayon-era commoners wear the hair in a low bun, as on the Bayon's scenes of
 * daily life; earlier ones the top-knot.
 */
export function villagerGeometry(job: Job, era: EraLook): THREE.BufferGeometry {
  const opts: WorkerOptions = { hair: era === 'bayon' ? 'bun' : 'topknot', jewelry: false };
  const p: THREE.BufferGeometry[] = [workerGeometry(job === 'builder' ? 'mallet' : 'none', opts)];
  switch (job) {
    case 'builder':
      // Wooden mallet (the worker's own) and a coil of rope at the left hip.
      for (const dz of [-0.02, 0.03])
        p.push(
          part(
            place(
              new THREE.TorusGeometry(0.1, 0.025, 3, lpSeg(10, 5)),
              [-0.27, 0.86, dz - 0.08],
              [0, Math.PI / 2, 0],
            ),
            P.rope,
          ),
        );
      break;
    case 'farmer':
      // Short-handled hoe: handle forward from the hand, iron blade hanging down at its end.
      p.push(part(rod([0.355, 0.84, -0.06], [0.355, 0.9, 0.55], 0.02, 0.018, 5), P.wood, FORE_R));
      p.push(part(place(box(0.16, 0.18, 0.025), [0.355, 0.82, 0.56], [0.25, 0, 0]), P.iron, FORE_R));
      p.push(...basket(0.1, 0.14, 0.2, [-0.2, 0.86, -0.22]));
      break;
    case 'fisher': {
      // Folded cast net over the left shoulder, hanging front and back, lead weights at the hem.
      const NET = 0xb9b08e;
      p.push(part(place(ball(0.16, 7, 5), [-0.2, 1.52, 0.0], [0, 0, 0.35], [0.45, 0.5, 1.1]), NET));
      for (const z of [0.15, -0.16]) {
        p.push(part(place(cone(0.12, 0.55, 6), [-0.21, 1.22, z], [Math.PI, 0, 0], [1, 1, 0.45]), NET));
        p.push(
          part(
            place(
              new THREE.TorusGeometry(0.1, 0.018, 3, lpSeg(8, 4)),
              [-0.21, 0.96, z],
              [Math.PI / 2, 0, 0],
              [1, 0.45, 1],
            ),
            P.iron,
          ),
        );
      }
      // Creel (fish basket) with a narrow neck, at the right hip behind the arm.
      p.push(part(place(ball(0.13, 8, 6), [0.22, 0.84, -0.2], [0, 0, 0], [1, 1.15, 0.9]), P.basket));
      p.push(part(place(cyl(0.06, 0.08, 0.1, 7), [0.22, 1.0, -0.2]), P.basketDark));
      break;
    }
    case 'woodcutter':
      // Hafted axe-adze: handle forward from the hand, blade set across at the head.
      p.push(part(rod([0.355, 0.86, -0.1], [0.355, 0.86, 0.62], 0.022, 0.02, 5), P.wood, FORE_R));
      p.push(part(place(box(0.05, 0.1, 0.1), [0.355, 0.9, 0.6]), P.woodDark, FORE_R));
      p.push(part(place(box(0.03, 0.2, 0.12), [0.355, 0.8, 0.66], [0.2, 0, 0]), P.iron, FORE_R));
      break;
    case 'quarryman':
      // Iron chisel in the left hand, stone hammer (a heavy stone head on a short haft) in the right.
      p.push(part(rod([-0.355, 0.86, -0.02], [-0.355, 0.86, 0.3], 0.018, 0.018, 5), P.iron, FORE_L));
      p.push(part(tip([-0.355, 0.86, 0], [-0.355, 0.86, 0.3], 0.02, 0.06, 4), P.steel, FORE_L));
      p.push(part(rod([0.355, 0.86, -0.08], [0.355, 0.86, 0.36], 0.02, 0.02, 5), P.wood, FORE_R));
      p.push(
        part(place(new RoundedBoxGeometry(0.16, 0.2, 0.14, 1, 0.04), [0.355, 0.86, 0.4]), P.stone, FORE_R),
      );
      break;
    case 'goldworker':
      // Wide, shallow woven pan for washing gold from river sand, held in the left hand.
      p.push(part(place(cyl(0.32, 0.12, 0.08, 12), [-0.36, 0.9, 0.34], [0.12, 0, 0.15]), P.basket, FORE_L));
      p.push(
        part(
          place(
            new THREE.TorusGeometry(0.32, 0.018, 3, lpSeg(14, 7)),
            [-0.36, 0.94, 0.34],
            [Math.PI / 2 + 0.12, 0, 0.15],
          ),
          P.basketDark,
          FORE_L,
        ),
      );
      p.push(part(place(ball(0.05, 5, 3), [-0.34, 0.93, 0.36], [0, 0, 0], [1.4, 0.3, 1.4]), P.gold, FORE_L));
      break;
    case 'hunter':
      // Hunting spear, shorter than a soldier's.
      p.push(...spear([0.355, 0.35, -0.2], [0.355, 2.25, 0.45], 0.02, 0.2));
      break;
    case 'forager':
      // Tall basket on the back, carried with a tump strap across the forehead; greens on top.
      p.push(...basket(0.13, 0.19, 0.5, [0, 1.25, -0.3]));
      p.push(part(place(ball(0.15, 6, 4), [0, 1.5, -0.3], [0, 0, 0], [1.1, 0.5, 1.1]), P.leaf));
      p.push(
        part(
          place(
            new THREE.TorusGeometry(0.13, 0.016, 3, lpSeg(12, 6)),
            [0, HY + 0.05, 0.0],
            [Math.PI / 2 - 0.2, 0, 0],
          ),
          P.rope,
        ),
      );
      for (const s of [-1, 1])
        p.push(part(rod([s * 0.12, HY + 0.02, -0.04], [s * 0.15, 1.5, -0.3], 0.012, 0.012, 3), P.rope));
      break;
    case 'porter':
      // Bamboo carrying pole on the right shoulder, a basket hanging from each end.
      p.push(part(rod([0.2, 1.6, -0.95], [0.2, 1.66, 0.95], 0.03, 0.03, 6), P.bamboo));
      for (const z of [-0.85, 0.85]) {
        for (const dx of [-0.08, 0.08])
          p.push(part(rod([0.2, 1.62, z], [0.2 + dx, 1.08, z], 0.007, 0.007, 3), P.rope));
        p.push(...basket(0.13, 0.19, 0.3, [0.2, 0.95, z]));
        p.push(part(place(ball(0.16, 6, 4), [0.2, 1.1, z], [0, 0, 0], [1, 0.45, 1]), 0x9fcf5a));
      }
      break;
    default:
      break;
  }
  return mergeGeometries(p)!;
}

// ---------------------------------------------------------------- soldiers

/**
 * Soldiers by arm and era.
 * - early (9th-10th c., HISTORICALLY_UNCERTAIN: hardly any battle reliefs): bare chest,
 *   sampot, top-knot; spearman with spear and small round rattan shield; swordsman the
 *   Bokator swordsman (dao, round shield, red sangvar cords, krama); archer bow and quiver.
 * - baphuon (11th c., UNCERTAIN): as early, with a cloth band across the chest; spearmen
 *   carry an oval shield.
 * - angkorWat (12th c., SUPPORTED by the south gallery): breastplate with straps crossing
 *   the chest, helmets crested with animal heads (spearman deer, swordsman bird/garuda,
 *   archer horse), kala-face shields (tall for spearmen, round for swordsmen), a long
 *   quiver on the archer's back.
 * - bayon (late 12th c., SUPPORTED by the Bayon reliefs): bare-headed with short hair and
 *   long earlobes, scale cuirass, javelins (spearman: one in hand, two spare on the back),
 *   round kala shields, archers with a quiver.
 */
export function soldierGeometry(type: SoldierType, era: EraLook): THREE.BufferGeometry {
  if (type === 'swordsman' && era === 'early') return swordsmanGeometry();
  if (type === 'archer' && era === 'early') return archerGeometry();
  if (era === 'baphuon' && type !== 'spearman') {
    const base = type === 'swordsman' ? swordsmanGeometry() : archerGeometry();
    return mergeGeometries([base, chestSash()])!;
  }
  const crest: Crest = type === 'spearman' ? 'deer' : type === 'swordsman' ? 'bird' : 'horse';
  const look = soldierLook(era, crest);
  const armoured = era === 'angkorWat' || era === 'bayon';
  let base = workerGeometry('none', look.opts);
  if (armoured) base = hideUnderCuirass(base);
  const p: THREE.BufferGeometry[] = [base, ...look.head, ...soldierBody(era)];
  const SH: V3 = [-0.47, 1.05, 0.12];
  if (type === 'spearman') {
    if (era === 'bayon') {
      p.push(...spear([0.355, 0.5, -0.25], [0.355, 2.05, 0.35], 0.018, 0.16)); // javelin
      for (const s of [-1, 1])
        p.push(...spear([s * 0.3, 0.75, -0.24], [-s * 0.2, 2.2, -0.26], 0.015, 0.14, BODY)); // spares on the back
      p.push(...shield('round', 0.3, SH, true));
    } else {
      p.push(...spear([0.355, 0.2, -0.3], [0.355, 2.9, 0.62], 0.022, 0.22));
      if (era === 'angkorWat') p.push(...shield('tall', 0.27, [-0.47, 1.0, 0.12], true));
      else if (era === 'baphuon') p.push(...shield('oval', 0.28, SH, false));
      else p.push(...shield('round', 0.3, SH, false)); // small round rattan shield
    }
  } else if (type === 'swordsman') {
    p.push(...dao(), ...shield('round', 0.26, [-0.44, 1.02, 0.1], true));
    // A krama round the waist keeps the team colour visible under the armour.
    p.push(
      part(
        place(new THREE.TorusGeometry(0.225, 0.03, 3, lpSeg(14, 7)), [0, 0.99, 0], [Math.PI / 2, 0, 0]),
        0xffffff,
        CLOTH,
      ),
    );
  } else {
    p.push(bow());
    if (era === 'angkorWat')
      p.push(...quiver([-0.14, 0.95, -0.25], [0.2, 1.85, -0.27], 0.065)); // long quiver
    else p.push(...quiver([-0.06, 1.1, -0.24], [0.16, 1.7, -0.26], 0.065));
  }
  return mergeGeometries(p)!;
}

// ---------------------------------------------------------------- commander

/**
 * Mahāsenāpati (army commander). After PK's reference photo of the statues of Angkor-era
 * generals at the Royal Palace, Phnom Penh (modern statues; the dress follows the reliefs):
 * scale cuirass with shoulder straps, two long quivers crossing on the back, a sampot with
 * a long hanging front panel, gold belt, armlets and collar, dao in the right hand, a large
 * round kala shield. Helmet with a crest in the Angkor Wat era, otherwise a top-knot with a
 * small gold diadem. On the Angkor Wat reliefs rank is shown by parasols held over the
 * commanders (SUPPORTED): the parasol here rises on a pole behind his back and stands for
 * the parasol bearer (GAMEPLAY_ABSTRACTION: one figure instead of two).
 * Slightly bigger build (x1.08).
 */
export function commanderGeometry(era: EraLook): THREE.BufferGeometry {
  const opts: WorkerOptions = era === 'angkorWat' ? { hair: 'short' } : {};
  const p: THREE.BufferGeometry[] = [hideUnderCuirass(workerGeometry('none', opts))];
  p.push(...(era === 'angkorWat' ? helmet('bird') : diadem()));
  p.push(...cuirass(true, 'shoulder'));
  for (const s of [-1, 1]) p.push(...quiver([s * 0.2, 0.95, -0.24], [-s * 0.18, 1.95, -0.28], 0.06));
  // Long front panel of the sampot, hanging almost to the knees.
  p.push(part(place(box(0.2, 0.7, 0.025), [0, 0.66, 0.235], [-0.06, 0, 0]), 0xffffff, CLOTH));
  p.push(
    part(
      place(
        new THREE.TorusGeometry(0.11, 0.03, 3, lpSeg(12, 6)),
        [0, 1.6, 0.02],
        [Math.PI / 2 - 0.3, 0, 0],
        [1.2, 1, 1],
      ),
      P.gold,
    ),
  ); // collar
  p.push(...dao(), ...shield('round', 0.36, [-0.5, 1.05, 0.12], true));
  const body = moveFigure(mergeGeometries(p)!, [0, 0, 0], 1.08);
  // Parasol: two tiers, white with gold, team-colour fringe; pole behind the back.
  const Z = -0.34;
  const par: THREE.BufferGeometry[] = [
    part(rod([0, 0.9, Z], [0, 3.05, Z], 0.025, 0.02, 5), P.woodDark),
    part(place(cone(0.8, 0.28, 10), [0, 2.78, Z]), P.white),
    part(
      place(new THREE.CylinderGeometry(0.8, 0.82, 0.12, lpSeg(10, 5), 1, true), [0, 2.58, Z]),
      0xffffff,
      CLOTH,
    ),
    part(place(cone(0.52, 0.24, 10), [0, 3.02, Z]), P.white),
    part(
      place(new THREE.CylinderGeometry(0.52, 0.54, 0.1, lpSeg(10, 5), 1, true), [0, 2.85, Z]),
      0xffffff,
      CLOTH,
    ),
    part(place(cone(0.05, 0.22, 5), [0, 3.24, Z]), P.gold),
  ];
  return mergeGeometries([body, ...par])!;
}

// ---------------------------------------------------------------- watchman

/**
 * Scout / watchman: light cloth, a headband, a long staff tipped with a spear point, a
 * buffalo-horn trumpet at the hip for the alarm, and a village dog trotting at his right.
 */
export function watchmanGeometry(era: EraLook): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    workerGeometry('none', { hair: era === 'bayon' ? 'bun' : 'topknot', jewelry: false }),
  ];
  p.push(
    part(
      place(
        new THREE.TorusGeometry(0.128, 0.02, 3, lpSeg(12, 6)),
        [0, HY + 0.05, 0],
        [Math.PI / 2 - 0.15, 0, 0],
      ),
      0xffffff,
      CLOTH,
    ),
  );
  p.push(...spear([0.355, 0.1, -0.12], [0.355, 2.55, 0.35], 0.02, 0.12));
  // Buffalo-horn trumpet hanging at the left hip on a cord.
  p.push(
    part(
      taperedTube(
        [
          new THREE.Vector3(-0.26, 0.95, 0.12),
          new THREE.Vector3(-0.3, 0.82, 0.02),
          new THREE.Vector3(-0.27, 0.76, -0.14),
        ],
        0.045,
        0.012,
        6,
        5,
      ),
      P.horn,
    ),
  );
  p.push(part(place(new THREE.TorusGeometry(0.046, 0.008, 3, 6), [-0.26, 0.95, 0.12], [0.6, 0, 0]), P.teeth));
  p.push(moveFigure(dogGeometry(), [0.75, 0, 0.25]));
  return mergeGeometries(p)!;
}

// ---------------------------------------------------------------- mounted

/**
 * A rider without walking legs, lifted by dy and moved back by dz, with seated legs:
 * 'astride' spreads the knees to `spread` round a mount's barrel; 'bench' sits on a seat
 * with the shins hanging.
 */
function seatedRider(
  opts: WorkerOptions,
  dy: number,
  dz: number,
  pose: 'astride' | 'bench',
  spread = 0.33,
): THREE.BufferGeometry[] {
  const S = COLORS.skin;
  const legs: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const hip: V3 = [s * 0.12, 0.92, 0];
    const knee: V3 = pose === 'astride' ? [s * spread, 0.8, 0.26] : [s * 0.15, 0.9, 0.42];
    const foot: V3 = pose === 'astride' ? [s * (spread + 0.03), 0.36, 0.16] : [s * 0.15, 0.46, 0.46];
    const mid: V3 = [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2, (hip[2] + knee[2]) / 2];
    legs.push(part(rod(hip, knee, 0.095, 0.075, 7), S));
    legs.push(part(rod(hip, mid, 0.125, 0.115, 7), 0xffffff, CLOTH)); // sampot over the thigh
    legs.push(part(rod(knee, foot, 0.065, 0.05, 6), S));
    legs.push(
      part(
        place(ball(0.06, 6, 4), [foot[0], foot[1] - 0.03, foot[2] + 0.05], [0, 0, 0], [0.8, 0.5, 1.5]),
        COLORS.skinDark,
      ),
    );
  }
  const g = mergeGeometries([legless(opts), ...legs])!;
  return [moveFigure(g, [0, dy, dz])];
}

/**
 * Horseman on a small South-East Asian horse, ridden bareback without stirrups as on the
 * Angkor Wat reliefs (a saddle cloth only), lance in the right hand and a small round
 * shield; the rider's arms keep their joints so the thrust act still animates.
 */
export function horsemanGeometry(era: EraLook): THREE.BufferGeometry {
  const look = soldierLook(era, 'horse');
  const DY = 0.74;
  const DZ = -0.05;
  const up = (gs: THREE.BufferGeometry[]) => gs.map((g) => moveFigure(g, [0, DY, DZ]));
  const p: THREE.BufferGeometry[] = [horseGeometry()];
  p.push(part(place(new RoundedBoxGeometry(0.8, 0.05, 0.7, 1, 0.02), [0, 1.63, -0.02]), 0xffffff, CLOTH));
  p.push(...seatedRider(look.opts, DY, DZ, 'astride', 0.36));
  const armour = era === 'angkorWat' ? cuirass(false, 'cross') : era === 'bayon' ? cuirass(true, 'none') : [];
  p.push(...up([...look.head, ...armour]));
  p.push(...up(spear([0.355, 0.62, -1.3], [0.355, 1.3, 2.0], 0.022, 0.22)));
  p.push(...up(shield('round', 0.22, [-0.44, 1.02, 0.1], false)));
  return mergeGeometries(p)!;
}

/**
 * Buffalo rider with a long staff-spear. GAMEPLAY_ABSTRACTION: water buffalo were draught
 * animals of the rice fields; there is no record of buffalo cavalry at Angkor. Included at
 * PK's request.
 */
export function buffaloRiderGeometry(era: EraLook): THREE.BufferGeometry {
  const look = soldierLook(era, 'deer');
  const DY = 0.62;
  const DZ = -0.2;
  const up = (gs: THREE.BufferGeometry[]) => gs.map((g) => moveFigure(g, [0, DY, DZ]));
  const p: THREE.BufferGeometry[] = [buffaloGeometry()];
  p.push(part(place(new RoundedBoxGeometry(0.9, 0.05, 0.7, 1, 0.02), [0, 1.55, DZ]), 0xffffff, CLOTH));
  p.push(...seatedRider(look.opts, DY, DZ, 'astride', 0.5));
  p.push(...up(look.head));
  p.push(...up(spear([0.355, -0.1, -0.6], [0.355, 2.6, 0.6], 0.024, 0.2)));
  return mergeGeometries(p)!;
}

// ---------------------------------------------------------------- supply cart

/**
 * Supply ox-cart as on the Bayon reliefs (SUPPORTED: carts with big wheels and an arched
 * woven roof follow the army): two humped zebu under one yoke, a central draught pole, a
 * two-wheeled cart under a woven hood over sacks and jars, the driver seated at the front
 * with a goad. The wheels turn (LIMB.wheel), the zebu walk. Axle at z = 0.
 */
export function oxCartUnitGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  for (const x of [-0.46, 0.46]) p.push(zebuGeometry().translate(x, 0, 2.45));
  // Yoke across both necks, and the pole back to the cart.
  p.push(part(rod([-0.95, 1.36, 3.3], [0.95, 1.36, 3.3], 0.055, 0.055, 6), P.woodDark));
  for (const x of [-0.7, -0.22, 0.22, 0.7])
    p.push(part(rod([x, 1.36, 3.3], [x, 1.08, 3.32], 0.02, 0.02, 3), P.woodDark));
  p.push(part(rod([0, 1.33, 3.3], [0, 1.02, 0.9], 0.06, 0.07, 6), P.wood));
  // Bed and side rails.
  p.push(part(place(new RoundedBoxGeometry(1.5, 0.18, 2.1, 1, 0.05), [0, 1.0, -0.05]), P.wood));
  // Woven hood: an arched half-cylinder along the cart, lined inside, with dark ribs.
  const hood = (r: number) =>
    new THREE.CylinderGeometry(r, r, 1.8, lpSeg(14, 7), 1, true, -Math.PI / 2, Math.PI)
      .rotateX(-Math.PI / 2)
      .scale(1, 0.95, 1)
      .translate(0, 1.09, -0.15);
  p.push(part(hood(0.74), P.basket));
  const inner = part(hood(0.72), P.basketDark);
  {
    // Flip the lining so it faces inward (seen through the open ends).
    const pos = inner.getAttribute('position') as THREE.BufferAttribute;
    const nor = inner.getAttribute('normal') as THREE.BufferAttribute;
    for (let t = 0; t < pos.count; t += 3) {
      for (const a of [pos, nor]) {
        const x = a.getX(t + 1);
        const y = a.getY(t + 1);
        const z = a.getZ(t + 1);
        a.setXYZ(t + 1, a.getX(t + 2), a.getY(t + 2), a.getZ(t + 2));
        a.setXYZ(t + 2, x, y, z);
      }
    }
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  }
  p.push(inner);
  for (const z of [-0.95, -0.35, 0.25, 0.72])
    p.push(
      part(
        place(
          new THREE.TorusGeometry(0.75, 0.025, 3, lpSeg(14, 7), Math.PI),
          [0, 1.09, z],
          [0, 0, 0],
          [1, 0.95, 1],
        ),
        P.woodDark,
      ),
    );
  // Provisions under the hood: rice sacks and a water jar, showing at the back.
  for (const [x, z] of [
    [-0.35, -0.85],
    [0.3, -0.8],
    [0, -0.4],
  ] as const)
    p.push(part(place(ball(0.26, 6, 5), [x, 1.3, z], [0, 0, 0], [1, 0.8, 1.1]), 0xd8c9a0));
  p.push(part(place(ball(0.2, 6, 5), [0.35, 1.32, -0.25], [0, 0, 0], [1, 1.2, 1]), 0x9a5a36));
  // Big spoked wheels.
  for (const s of [-1, 1]) {
    const w: Limb = [1, 0.7, LIMB.wheel, 0];
    p.push(
      part(
        place(
          new THREE.TorusGeometry(0.64, 0.07, lpSeg(6, 3), lpSeg(20, 8)),
          [s * 0.88, 0.7, 0],
          [0, Math.PI / 2, 0],
        ),
        P.woodDark,
        w,
      ),
    );
    p.push(part(place(cyl(0.13, 0.13, 0.22, 8), [s * 0.88, 0.7, 0], [0, 0, Math.PI / 2]), P.wood, w));
    for (let k = 0; k < 4; k++)
      p.push(part(place(cyl(0.03, 0.03, 1.24, 4), [s * 0.88, 0.7, 0], [(k / 4) * Math.PI, 0, 0]), P.wood, w));
  }
  // Driver on the front of the bed, a krama on his head, goad in the right hand.
  const DY = 0.24;
  const DZ = 0.92;
  p.push(...seatedRider({ jewelry: false }, DY, DZ, 'bench'));
  p.push(
    moveFigure(part(rod([0.355, 0.86, -0.1], [0.355, 1.35, 0.9], 0.015, 0.012, 4), P.bamboo, FORE_R), [
      0,
      DY,
      DZ,
    ]),
  );
  p.push(
    moveFigure(
      part(
        place(
          new THREE.TorusGeometry(0.128, 0.02, 3, lpSeg(12, 6)),
          [0, HY + 0.05, 0],
          [Math.PI / 2 - 0.15, 0, 0],
        ),
        0xffffff,
        CLOTH,
      ),
      [0, DY, DZ],
    ),
  );
  return mergeGeometries(p)!;
}

// ---------------------------------------------------------------- the royal court (D78)

/**
 * The royal court at the hall (PK: "the King standing at the Royal Hall with his assistants,
 * queens and Brahmins, the King changing with the period, pointing his finger to give
 * orders"). Zhou Daguan (1296) describes the king crowned in gold, wearing fine cloth and
 * pearls, with gold-handled parasols around him; the reliefs show royal Brahmin priests
 * (purohita) with tall coiled hair and white cloth, and queens in long sampot with jewellery.
 * Crowns follow the reliefs of each era: a conical mukuta (early, Baphuon), a taller tiered
 * crown (Angkor Wat); Jayavarman VII is shown bare-headed with a bun, as in his portraits.
 */
export type CourtRole = 'king' | 'queen' | 'brahmin' | 'parasol';

const SILK = { king: 0xa8322a, queen: 0x8c2f5c, sash: 0xd9a04a, white: 0xf3ecd8 };

/** Remove the right arm (it is replaced by a pointing one). */
function withoutRightArm(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const limb = g.getAttribute('limb');
  return dropTriangles(g, (i) => {
    const k = Math.round(limb.getZ(i));
    return (k === LIMB.arm || k === LIMB.forearm) && limb.getX(i) < 0;
  });
}

/** A crown by era: conical mukuta, tiered Angkor Wat crown, or none (Bayon: a bun). */
function crown(era: EraLook, queen = false): THREE.BufferGeometry[] {
  if (era === 'bayon') return queen ? diadem() : [...diadem(), ...longEarlobes()];
  const out = diadem();
  const k = queen ? 0.7 : 1;
  if (era === 'angkorWat') {
    for (let i = 0; i < 3; i++)
      out.push(
        part(
          place(cyl(0.12 * k - i * 0.03, 0.13 * k - i * 0.03, 0.1, 10), [0, HY + 0.14 + i * 0.1, -0.01]),
          P.gold,
        ),
      );
    out.push(part(place(cone(0.05 * k, 0.24 * k, 8), [0, HY + 0.5 * k, -0.01]), P.gold));
  } else {
    out.push(part(place(cone(0.13 * k, 0.34 * k, 10), [0, HY + 0.24 * k, -0.01]), P.gold));
  }
  return out;
}

/** The king: royal silk, gold collar and armbands, crown of his era, right arm pointing out. */
export function kingGeometry(era: EraLook): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [
    withoutRightArm(workerGeometry('none', { hair: era === 'bayon' ? 'bun' : 'topknot' })),
  ];
  p.push(...crown(era));
  const S = COLORS.skin;
  // Pointing arm: shoulder → elbow → hand → finger, toward the front and a little up. It swings
  // from the shoulder (limb data), so the king can gesture his orders and raise it in blessing.
  const ARM = [1, 1.46, LIMB.arm, 0, 0] as [number, number, number, number, number];
  p.push(part(rod([0.3, 1.46, 0], [0.37, 1.5, 0.28], 0.07, 0.06), S, ARM));
  p.push(part(rod([0.37, 1.5, 0.28], [0.4, 1.6, 0.56], 0.058, 0.045), S, ARM));
  p.push(part(place(ball(0.05), [0.41, 1.62, 0.61]), S, ARM));
  p.push(part(rod([0.41, 1.63, 0.63], [0.42, 1.66, 0.74], 0.014, 0.01, 4), S, ARM));
  p.push(
    part(
      place(new THREE.TorusGeometry(0.07, 0.015, 3, lpSeg(10, 4)), [0.35, 1.49, 0.2], [0, 0.25, 0]),
      P.gold,
      ARM,
    ),
  );
  // Royal sampot: silk with a long gold-edged front panel; gold collar with a pendant.
  p.push(part(place(cyl(0.22, 0.26, 0.42, 12), [0, 0.86, 0]), SILK.king));
  p.push(part(place(box(0.2, 0.62, 0.025), [0, 0.7, 0.26], [-0.08, 0, 0]), P.gold));
  p.push(
    part(
      place(
        new THREE.TorusGeometry(0.12, 0.035, 3, lpSeg(12, 6)),
        [0, 1.6, 0.02],
        [Math.PI / 2 - 0.3, 0, 0],
        [1.25, 1, 1],
      ),
      P.gold,
    ),
  );
  p.push(part(place(cone(0.04, 0.1, 4), [0, 1.48, 0.16], [Math.PI, 0, 0]), P.gold));
  return moveFigure(mergeGeometries(p)!, [0, 0, 0], 1.25); // a little taller than his court, easy to see
}

/** A queen: long silk sampot to the ankles, a shoulder cloth (sbai), jewellery, a small crown. */
export function queenGeometry(era: EraLook): THREE.BufferGeometry {
  const body = workerGeometry('none', { hair: 'bun' });
  body.scale(0.9, 0.97, 0.9);
  const p: THREE.BufferGeometry[] = [body, ...crown(era, true)];
  p.push(part(place(cyl(0.2, 0.25, 0.92, 12), [0, 0.5, 0]), SILK.queen)); // long skirt
  p.push(part(place(box(0.14, 0.8, 0.02), [0, 0.5, 0.235], [-0.04, 0, 0]), P.gold)); // front pleat
  p.push(part(band(0.25, 0.75, 0.05, 1.3, 0.62), SILK.sash)); // sbai over one shoulder
  p.push(
    part(
      place(new THREE.TorusGeometry(0.11, 0.02, 3, lpSeg(12, 6)), [0, 1.55, 0.02], [Math.PI / 2 - 0.3, 0, 0]),
      P.gold,
    ),
  );
  return mergeGeometries(p)!;
}

/** A royal Brahmin (purohita): white cloth to the ankles, sacred thread, tall coiled hair, a conch. */
export function brahminGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [workerGeometry('none', { jewelry: false, hair: 'short' })];
  p.push(part(place(cyl(0.21, 0.26, 0.95, 12), [0, 0.5, 0]), SILK.white)); // robe
  p.push(part(band(0.27, 0.72, 0.045, 1.28, 0.7), SILK.white)); // upper cloth
  p.push(part(band(0.26, 0.7, 0.008, 1.3, -0.7), 0xe8d9a0)); // sacred thread
  p.push(part(place(cyl(0.07, 0.09, 0.26, 8), [0, HY + 0.2, -0.03]), P.dark)); // coiled hair (jata)
  p.push(part(place(ball(0.08), [0, HY + 0.34, -0.03]), P.dark));
  p.push(part(place(ball(0.07), [0.12, 1.2, 0.2], [0, 0, 0], [1, 0.8, 1.4]), 0xf6f1e4)); // conch
  return mergeGeometries(p)!;
}

/** A court attendant holding a gold parasol over the king. */
export function parasolBearerGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [workerGeometry('none', { jewelry: false })];
  const Z = 0.25;
  p.push(part(rod([0.32, 1.0, Z], [0.32, 3.2, Z], 0.025, 0.02, 5), P.woodDark));
  p.push(part(place(cone(0.95, 0.3, 12), [0.32, 2.95, Z]), P.gold));
  p.push(
    part(
      place(new THREE.CylinderGeometry(0.95, 0.97, 0.14, lpSeg(12, 6), 1, true), [0.32, 2.75, Z]),
      SILK.king,
    ),
  );
  p.push(part(place(cone(0.06, 0.24, 5), [0.32, 3.2, Z]), P.gold));
  return mergeGeometries(p)!;
}

/** Where each member of the court stands, relative to the hall's centre (the hall faces +z). */
/** How one court figure moves this frame (PK: the king is active and blesses the growing city). */
export interface CourtPose {
  /** Turn about the vertical axis, radians (0 = facing out from the hall, +z). */
  heading: number;
  /** Small lift for a happy bounce, metres. */
  lift: number;
  /** Arm motion for the crowd shader. */
  arm: number;
  armSync: number;
  speed: number;
}

export interface CourtMood {
  /** Blessing until this time (seconds). */
  blessUntil: number;
  /** Facing the place of the last order until this time; the heading toward it. */
  lookUntil: number;
  lookHeading: number;
}

export const CALM_COURT: CourtMood = { blessUntil: -1, lookUntil: -1, lookHeading: 0 };

/**
 * The court's pose at time t. The king looks over his city and gestures his orders (the
 * pointing arm and the free arm move in turn), turns toward where the last order went, and
 * when the city grows raises his arms in blessing with a happy bounce; the Brahmins raise
 * theirs with him. Queens and parasol bearers turn a little with the king.
 */
export function courtPose(role: CourtRole, t: number, mood: CourtMood): CourtPose {
  const blessing = t < mood.blessUntil;
  const look = t < mood.lookUntil;
  const gaze = look ? mood.lookHeading : 0.55 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.67);
  if (role === 'king') {
    if (blessing)
      return {
        heading: gaze * 0.3,
        lift: 0.06 * Math.abs(Math.sin(t * 4.5)),
        arm: 1.35,
        armSync: 1,
        speed: 1.6,
      };
    return { heading: gaze, lift: 0, arm: look ? 0.45 : 0.22, armSync: 0, speed: look ? 2.2 : 1.1 };
  }
  if (role === 'brahmin' && blessing) return { heading: 0, lift: 0, arm: 1.1, armSync: 1, speed: 1.6 };
  return { heading: gaze * 0.25, lift: 0, arm: 0, armSync: 0, speed: 0 };
}

export const COURT_LAYOUT: Array<{ role: CourtRole; at: V3 }> = [
  // In front of the hall's stair (the hall faces +z), the king forward, pointing out.
  { role: 'king', at: [0, 0, 7.6] },
  { role: 'parasol', at: [-0.9, 0, 6.8] },
  { role: 'parasol', at: [0.9, 0, 6.8] },
  { role: 'queen', at: [-1.9, 0, 7.1] },
  { role: 'queen', at: [1.9, 0, 7.1] },
  { role: 'brahmin', at: [-3.2, 0, 7.3] },
  { role: 'brahmin', at: [3.2, 0, 7.3] },
];
