import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { addRim, currentLook, lowPoly, seg as lowPolySeg, seg as lpSeg, detail as lpDetail } from './look';

/**
 * Stylised animated-film characters (decision D25), built from soft rounded shapes in
 * code: no model files, nothing to license. Every crowd is one instanced draw call.
 * Walking, hauling and hammering are done on the GPU: each vertex carries a `limb`
 * attribute that says which joint it swings around, so 100 workers still cost one draw
 * call and no CPU skinning. Real animated models can replace these later (docs/ASSETS.md).
 *
 * Figures face +Z. Units are metres.
 */

/** limb = (swing sign, pivot height, kind, cloth mask); limbZ = pivot depth. */
/** Limb kinds read by the crowd shader. forearm: bends at the elbow, then swings with the arm (D63). */
export const LIMB = { body: 0, leg: 1, arm: 2, sway: 3, wheel: 4, forearm: 5 } as const;
type Limb = [sign: number, pivot: number, kind: number, cloth: number, pivotZ?: number];
const BODY: Limb = [0, 0, LIMB.body, 0];
const CLOTH: Limb = [0, 0, LIMB.body, 1];

/** Prepare one part: non-indexed, smooth normals kept, flat colour, limb data. */
export function part(geo: THREE.BufferGeometry, hex: number, limb: Limb = BODY): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n * 3);
  const lb = new Float32Array(n * 4);
  const lz = new Float32Array(n).fill(limb[4] ?? 0);
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b], i * 3);
    lb.set([limb[0], limb[1], limb[2], limb[3]], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('limb', new THREE.BufferAttribute(lb, 4));
  g.setAttribute('limbZ', new THREE.BufferAttribute(lz, 1));
  return g;
}

/** Move/rotate/scale a geometry in place and return it (for readable part lists). */
export function place(
  geo: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  return geo.applyMatrix4(m);
}

const sphere = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, lowPolySeg(w, 5), lowPolySeg(h, 3));
const capsule = (r: number, len: number, n = 7) =>
  new THREE.CapsuleGeometry(r, len, lowPoly() ? 1 : 2, lowPolySeg(n, 5));

/** A tube that tapers from r0 to r1 along a curve (trunks, tails, horns). */
export function taperedTube(
  points: THREE.Vector3[],
  r0: number,
  r1: number,
  seg = 16,
  radial = 8,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const sides = lowPolySeg(radial, 5);
  const g = new THREE.TubeGeometry(curve, seg, 1, sides, false);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (sides + 1));
    const u = ring / seg;
    curve.getPointAt(u, c);
    p.fromBufferAttribute(pos, i).sub(c);
    p.multiplyScalar(THREE.MathUtils.lerp(r0, r1, u));
    pos.setXYZ(i, c.x + p.x, c.y + p.y, c.z + p.z);
  }
  g.computeVertexNormals();
  return g;
}

// Palette: warm, slightly saturated, like an animated film.
export const COLORS = {
  skin: 0xa8653e,
  skinDark: 0x94593a,
  hair: 0x2a1c16,
  eyeWhite: 0xfbf6ee,
  pupil: 0x1d130e,
  belt: 0x7a4a24,
  gold: 0xd9a646,
  elephant: 0x847a75,
  elephantInner: 0xc49a90,
  ivory: 0xf1e6cc,
  zebu: 0xeee4d4,
  muzzle: 0x6b5a55,
  wood: 0x8a5a32,
  woodDark: 0x5e3b1f,
  bamboo: 0xd7bf7f,
  sandstone: 0xa7ab8a,
};

/** Sampot / krama colours a crowd picks from (per worker, via instance colour). */
export const CLOTH_COLORS = [0xb8412f, 0x2f4f8c, 0xd08a2c, 0x5f7f3a, 0x8c2f52, 0xc9642b, 0x3c6f73];

function eyes(
  x: number,
  y: number,
  z: number,
  r: number,
  spread: number,
  side = false,
  seg = 10,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const ex = side ? s * spread : s * spread;
    const rotY = side ? s * 0.9 : 0;
    const white = place(sphere(r, seg, Math.max(4, seg - 2)), [x + ex, y, z], [0, rotY, 0], [1, 1.12, 0.62]);
    const fwd = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)).multiplyScalar(r * 0.45);
    const pupil = place(
      sphere(r * 0.58, Math.max(5, seg - 2), Math.max(4, seg - 4)),
      [x + ex + fwd.x, y + r * 0.05, z + fwd.z],
      [0, rotY, 0],
      [1, 1.1, 0.6],
    );
    const shine = place(
      sphere(r * 0.2, 5, 3),
      [x + ex + fwd.x * 1.25 + r * 0.18, y + r * 0.3, z + fwd.z * 1.25],
      [0, 0, 0],
    );
    out.push(part(white, COLORS.eyeWhite), part(pupil, COLORS.pupil), part(shine, 0xffffff));
  }
  return out;
}

export type WorkerTool = 'none' | 'mallet' | 'pole' | 'load';

/** Optional variations of the worker (Kingdom people, D63): hair style and gold ornaments. */
export interface WorkerOptions {
  /** topknot (default): the Angkor Wat-era chignon; bun: a low bun at the nape (Bayon reliefs); short: cropped. */
  hair?: 'topknot' | 'bun' | 'short';
  /** false = a labourer without gold armbands, bracelets, necklace or earrings, and a plain belt. */
  jewelry?: boolean;
}

/**
 * Angkor-era Khmer labourer with a heroic, muscular build (D25, PK's reference): broad
 * shoulders, V-taper, strong arms and calves. Bare chest, sampot chang kben (wrapped
 * between the legs, front panel) in the crowd's colours, gold belt, armbands, bracelets
 * and earrings, hair in a top-knot. ~1.95 m, faces +Z.
 */
export function workerGeometry(tool: WorkerTool = 'none', opts: WorkerOptions = {}): THREE.BufferGeometry {
  const S = COLORS.skin;
  const G = COLORS.gold;
  const hair = opts.hair ?? 'topknot';
  const jewel = opts.jewelry ?? true;
  const parts: THREE.BufferGeometry[] = [];
  const HIP = 0.92;
  const SHOULDER = 1.5;
  const rightArm: Limb = [-1, SHOULDER, LIMB.forearm, 0];

  for (const s of [-1, 1]) {
    const leg: Limb = [s, HIP, LIMB.leg, 0];
    const lx = s * 0.12;
    parts.push(
      part(place(sphere(0.07, 7, 5), [lx, 0.04, 0.05], [0, 0, 0], [0.85, 0.45, 1.6]), COLORS.skinDark, leg),
    );
    parts.push(part(place(capsule(0.064, 0.3, 7), [lx, 0.31, 0]), S, leg));
    parts.push(part(place(sphere(0.07, 7, 6), [lx, 0.37, -0.025], [0, 0, 0], [1, 1.45, 1]), S, leg)); // calf
    parts.push(part(place(capsule(0.098, 0.26, 8), [lx, 0.68, 0]), S, leg)); // thigh
    // Sampot legs (chang kben: the cloth is drawn between the legs like short trousers).
    parts.push(
      part(place(new THREE.CylinderGeometry(0.128, 0.118, 0.3, lpSeg(10, 3)), [lx, 0.77, 0]), 0xffffff, [
        s,
        HIP,
        LIMB.leg,
        1,
      ]),
    );

    const arm: Limb = [-s, SHOULDER, LIMB.arm, 0];
    const fore: Limb = [-s, SHOULDER, LIMB.forearm, 0];
    const ax = s * 0.33;
    parts.push(
      part(place(sphere(0.094, 8, 6), [s * 0.28, 1.465, 0], [0, 0, s * 0.3], [1.15, 0.95, 1.05]), S),
    ); // deltoid
    parts.push(part(place(capsule(0.072, 0.24, 7), [ax, 1.3, 0], [0, 0, s * 0.06]), S, arm)); // upper arm
    parts.push(part(place(sphere(0.058, 7, 5), [ax, 1.3, 0.025], [0, 0, 0], [1, 1.7, 1]), S, arm)); // biceps
    if (jewel)
      parts.push(
        part(
          place(new THREE.TorusGeometry(0.076, 0.014, 3, lpSeg(10, 4)), [ax, 1.41, 0], [Math.PI / 2, 0, 0]),
          G,
          arm,
        ),
      );
    parts.push(part(place(capsule(0.06, 0.22, 7), [s * 0.35, 1.04, 0.01]), S, fore)); // forearm
    if (jewel)
      parts.push(
        part(
          place(
            new THREE.TorusGeometry(0.062, 0.013, 3, lpSeg(10, 4)),
            [s * 0.352, 0.93, 0.01],
            [Math.PI / 2, 0, 0],
          ),
          G,
          fore,
        ),
      );
    parts.push(
      part(place(sphere(0.058, 7, 5), [s * 0.355, 0.86, 0.01], [0, 0, 0], [0.9, 1.2, 0.8]), S, fore),
    ); // hand
  }

  // Hip wrap, front panel and gold belt.
  parts.push(
    part(place(new THREE.CylinderGeometry(0.215, 0.245, 0.2, lpSeg(14, 3)), [0, 0.94, 0]), 0xffffff, CLOTH),
  );
  parts.push(
    part(
      place(new RoundedBoxGeometry(0.17, 0.42, 0.03, 1, 0.012), [0, 0.74, 0.215], [-0.08, 0, 0]),
      0xffffff,
      CLOTH,
    ),
  );
  parts.push(
    part(
      place(
        new THREE.TorusGeometry(0.212, 0.026, lpSeg(4, 3), lpSeg(16, 4)),
        [0, 1.04, 0],
        [Math.PI / 2, 0, 0],
      ),
      jewel ? G : COLORS.belt,
    ),
  );
  if (jewel) parts.push(part(place(sphere(0.035, 6, 5), [0, 1.04, 0.225], [0, 0, 0], [1, 1, 0.5]), G));

  // Torso: V-taper from a broad chest to a narrow waist.
  parts.push(part(place(sphere(0.16, 10, 8), [0, 1.15, 0], [0, 0, 0], [1.02, 1.25, 0.8]), S)); // abdomen
  parts.push(part(place(sphere(0.2, 12, 10), [0, 1.4, -0.01], [0, 0, 0], [1.38, 0.95, 0.85]), S)); // ribcage
  for (const s of [-1, 1]) {
    parts.push(
      part(place(sphere(0.11, 8, 6), [s * 0.095, 1.44, 0.1], [0, 0, s * -0.2], [1.3, 0.62, 0.42]), S),
    ); // pectoral
  }
  parts.push(part(place(sphere(0.12, 8, 6), [0, 1.56, -0.03], [0, 0, 0], [1.65, 0.6, 0.8]), S)); // trapezius
  parts.push(part(place(new THREE.CylinderGeometry(0.064, 0.074, 0.14, lpSeg(8, 3)), [0, 1.63, 0]), S)); // neck
  if (jewel)
    parts.push(
      part(
        place(
          new THREE.TorusGeometry(0.075, 0.012, 3, lpSeg(10, 4)),
          [0, 1.59, 0.01],
          [Math.PI / 2 - 0.25, 0, 0],
        ),
        G,
      ),
    ); // necklace

  // Head: smaller than before (heroic proportions), strong jaw, calm stern face.
  const HY = 1.8;
  parts.push(part(place(sphere(0.125, 14, 10), [0, HY, 0.01], [0, 0, 0], [0.95, 1.1, 1]), S));
  parts.push(part(place(sphere(0.1, 10, 8), [0, HY - 0.075, 0.03], [0, 0, 0], [1, 0.75, 1]), S)); // jaw
  for (const s of [-1, 1]) {
    parts.push(part(place(sphere(0.035, 6, 5), [s * 0.12, HY, 0], [0, 0, 0], [0.5, 1, 0.8]), S)); // ear
    if (jewel) parts.push(part(place(sphere(0.022, 6, 5), [s * 0.125, HY - 0.06, 0.005]), G)); // earring
    parts.push(
      part(
        place(capsule(0.009, 0.045, 4), [s * 0.047, HY + 0.045, 0.118], [0, 0, Math.PI / 2 - s * 0.22]),
        COLORS.hair,
      ),
    ); // brow
  }
  parts.push(part(place(sphere(0.03, 6, 5), [0, HY - 0.02, 0.13], [0, 0, 0], [0.9, 1, 1]), COLORS.skinDark)); // nose
  parts.push(...eyes(0, HY + 0.012, 0.106, 0.027, 0.046, false, 7));
  parts.push(part(place(capsule(0.008, 0.035, 4), [0, HY - 0.068, 0.122], [0, 0, Math.PI / 2]), 0x6e3526)); // mouth
  // Hair cap and top-knot tied with gold.
  parts.push(
    part(
      place(
        new THREE.SphereGeometry(0.133, lpSeg(12, 4), lpSeg(6, 3), 0, Math.PI * 2, 0, 1.3),
        [0, HY + 0.01, -0.005],
        [-0.3, 0, 0],
      ),
      COLORS.hair,
    ),
  );
  if (hair === 'topknot') {
    parts.push(part(place(sphere(0.062, 8, 6), [0, HY + 0.17, -0.035]), COLORS.hair));
    parts.push(
      part(
        place(
          new THREE.TorusGeometry(0.035, 0.01, 3, lpSeg(10, 4)),
          [0, HY + 0.125, -0.03],
          [Math.PI / 2, 0, 0],
        ),
        jewel ? G : COLORS.belt,
      ),
    );
  } else if (hair === 'bun') {
    // Low bun at the nape, as worn by commoners on the Bayon reliefs.
    parts.push(
      part(place(sphere(0.06, 8, 6), [0, HY - 0.02, -0.14], [0, 0, 0], [1.1, 0.9, 0.9]), COLORS.hair),
    );
  }

  if (tool === 'mallet') {
    parts.push(
      part(
        place(
          new THREE.CylinderGeometry(0.022, 0.022, 0.42, lpSeg(6, 3)),
          [0.355, 0.86, 0.2],
          [Math.PI / 2, 0, 0],
        ),
        COLORS.wood,
        rightArm,
      ),
    );
    parts.push(
      part(
        place(new RoundedBoxGeometry(0.14, 0.14, 0.24, 1, 0.03), [0.355, 0.86, 0.42], [0, Math.PI / 2, 0]),
        COLORS.woodDark,
        rightArm,
      ),
    );
  } else if (tool === 'load') {
    // A cut stone carried on the shoulder.
    parts.push(
      part(place(new RoundedBoxGeometry(0.46, 0.28, 0.34, 1, 0.05), [0.2, 1.72, -0.02]), COLORS.sandstone),
    );
  } else if (tool === 'pole') {
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.035, 0.035, 3.4, lpSeg(6, 3)), [0.36, 1.0, 0.35], [0.35, 0, 0]),
        COLORS.bamboo,
        rightArm,
      ),
    );
  }
  return mergeGeometries(parts)!;
}

/** Bamboo raft carrying a big block. */
export function raftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const tone = i % 2 ? COLORS.bamboo : 0xc8ad6b;
    parts.push(
      part(
        place(
          new THREE.CylinderGeometry(0.16, 0.16, 7, lpSeg(10, 3)),
          [-1.3 + i * 0.32, 0.15, 0],
          [Math.PI / 2, 0, 0],
        ),
        tone,
      ),
    );
  }
  for (const z of [-2.8, 0, 2.8])
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.08, 0.08, 3.1, lpSeg(6, 3)), [0, 0.32, z], [0, 0, Math.PI / 2]),
        COLORS.woodDark,
      ),
    );
  parts.push(part(place(new RoundedBoxGeometry(1.8, 1.4, 2.6, 3, 0.14), [0, 1.05, 0]), COLORS.sandstone));
  // Rope lashing.
  for (const z of [-0.7, 0.7])
    parts.push(
      part(
        place(
          new THREE.TorusGeometry(1.15, 0.04, lpSeg(6, 3), lpSeg(20, 4)),
          [0, 1.0, z],
          [0, 0, 0],
          [0.82, 0.66, 1],
        ),
        0x9c7a4a,
      ),
    );
  return mergeGeometries(parts)!;
}

/** Fluffy broadleaf tree: soft canopy blobs, lighter on top. */
export function treeGeometry(detail = 2): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    part(place(new THREE.CylinderGeometry(0.2, 0.34, 3.2, lpSeg(10, 3)), [0, 1.6, 0]), 0x6e4a2c),
    part(
      place(new THREE.CylinderGeometry(0.1, 0.15, 1.4, lpSeg(6, 3)), [0.45, 2.9, 0.1], [0, 0, -0.7]),
      0x6e4a2c,
    ),
  ];
  const blobs: Array<[number, number, number, number, number]> = [
    [0, 3.9, 0, 1.55, 0x5d8a3c],
    [1.05, 3.6, 0.35, 1.15, 0x588436],
    [-0.95, 3.7, -0.3, 1.2, 0x5a8638],
    [0.2, 4.2, -0.9, 1.1, 0x5f8b3d],
    [0.3, 4.85, 0.25, 1.1, 0x78a24a],
    [-0.4, 4.6, 0.7, 0.9, 0x6f9a44],
  ];
  for (const [x, y, z, r, c] of blobs)
    parts.push(
      part(place(new THREE.IcosahedronGeometry(r, lpDetail(detail)), [x, y, z], [0, 0, 0], [1, 0.88, 1]), c),
    );
  return mergeGeometries(parts)!;
}

/** Sugar palm (the Khmer countryside tree): tall trunk, round crown of fronds. */
export function palmGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 7, lpSeg(10, 3), lpSeg(12, 1));
  const p = trunk.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 3.5;
    p.setX(i, p.getX(i) + 0.012 * y * y);
    p.setY(i, y);
  }
  trunk.computeVertexNormals();
  const parts = [part(trunk, 0x6f5a45)];
  const top = new THREE.Vector3(0.012 * 49, 7, 0);
  parts.push(part(place(sphere(0.55, 12, 10), [top.x, top.y, 0], [0, 0, 0], [1, 0.8, 1]), 0x4f5f2a));
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const up = i % 2 ? 0.25 : -0.35;
    // Fan-shaped leaf: a round flattened disc, tilted outward.
    const leaf = place(sphere(1, 9, 4), [0, 0, 0], [0, 0, 0], [0.95, 0.05, 0.95]);
    const m = new THREE.Matrix4()
      .makeRotationY(a)
      .multiply(new THREE.Matrix4().makeRotationX(0.9 + up))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.25));
    leaf.applyMatrix4(m);
    leaf.translate(top.x, top.y + 0.1, 0);
    parts.push(part(leaf, i % 3 ? 0x5f8a3a : 0x6f9a46));
  }
  return mergeGeometries(parts)!;
}

/** Round bush for ground cover. */
export function bushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r, c] of [
    [0, 0.45, 0, 0.75, 0x5c8a3a],
    [0.6, 0.35, 0.2, 0.55, 0x6a9642],
    [-0.55, 0.35, -0.1, 0.6, 0x557f35],
    [0.1, 0.7, -0.3, 0.5, 0x74a04a],
  ] as const)
    parts.push(
      part(place(new THREE.IcosahedronGeometry(r, lpDetail(1)), [x, y, z], [0, 0, 0], [1, 0.8, 1]), c),
    );
  return mergeGeometries(parts)!;
}

/**
 * Pteas Kantaang stilt house (PK's reference file, D57): three rows of posts standing on
 * stone ssom footings, a raised plank floor, woven bamboo walls, a straight two-sided
 * thatched gable, the banok "bird wing" lean-to off the back wall, a ladder to the door
 * (+z; villages turn it to face east) and a small spirit house on its post at the corner.
 */
export function hutGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const H = 1.9;
  const box = (
    w: number,
    h: number,
    d: number,
    at: [number, number, number],
    c: number,
    rot?: [number, number, number],
  ) => parts.push(part(place(new THREE.BoxGeometry(w, h, d), at, rot), c));
  for (const x of [-1.4, 0, 1.4])
    for (const z of [-1.2, 0, 1.2]) {
      box(0.32, 0.2, 0.32, [x, 0.1, z], 0xb9ab8a); // ssom footing
      parts.push(
        part(
          place(new THREE.CylinderGeometry(0.09, 0.11, H - 0.2, lpSeg(8, 3)), [x, 0.2 + (H - 0.2) / 2, z]),
          COLORS.woodDark,
        ),
      );
    }
  parts.push(part(place(new RoundedBoxGeometry(3.4, 0.18, 3.0, 2, 0.04), [0, H, 0]), COLORS.wood));
  // Woven bamboo walls: light infill with darker lath strips.
  parts.push(part(place(new RoundedBoxGeometry(3.0, 1.4, 2.6, 2, 0.05), [0, H + 0.79, 0]), 0xd2b27a));
  for (let i = 1; i < 5; i++) box(3.04, 0.05, 2.64, [0, H + 0.09 + i * 0.28, 0], COLORS.bamboo);
  box(0.7, 1.1, 0.08, [0.5, H + 0.64, 1.31], 0x4a2e18); // door
  // Ladder: two rails and rungs, leaning against the door.
  for (const dx of [-0.22, 0.22])
    box(0.07, H + 0.4, 0.07, [0.5 + dx, (H + 0.2) / 2, 1.85], COLORS.woodDark, [0.45, 0, 0]);
  for (let k = 0; k < 5; k++) {
    const t = (k + 0.5) / 5;
    box(0.48, 0.05, 0.06, [0.5, 0.1 + t * (H - 0.1), 2.3 - t * 0.9], COLORS.wood);
  }
  // Straight two-sided gable (thatch) and its ridge.
  const shape = new THREE.Shape();
  shape.moveTo(-2.1, 0);
  shape.lineTo(0, 1.8);
  shape.lineTo(2.1, 0);
  shape.lineTo(-2.1, 0);
  const roof = new THREE.ExtrudeGeometry(shape, {
    depth: 3.6,
    bevelEnabled: true,
    bevelSize: 0.1,
    bevelThickness: 0.1,
    bevelSegments: 1,
  });
  roof.translate(0, H + 1.45, -1.8);
  roof.computeVertexNormals();
  parts.push(part(roof, 0xc9a766));
  box(0.16, 0.14, 3.9, [0, H + 3.3, 0], 0x9a7a44);
  // Banok: a lower lean-to roof off the back wall, on two posts.
  box(3.3, 0.1, 1.2, [0, H + 1.2, -1.75], 0xb08e52, [0.42, 0, 0]);
  for (const x of [-1.4, 1.4])
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.06, 0.07, H + 0.9, lpSeg(6, 3)), [x, (H + 0.9) / 2, -2.25]),
        COLORS.wood,
      ),
    );
  // Spirit house (Rean Tevoda) at the front corner.
  parts.push(
    part(place(new THREE.CylinderGeometry(0.05, 0.05, 1.2, lpSeg(6, 3)), [1.9, 0.6, 1.9]), COLORS.wood),
  );
  box(0.34, 0.26, 0.3, [1.9, 1.33, 1.9], COLORS.gold);
  parts.push(
    part(place(new THREE.ConeGeometry(0.32, 0.3, 4), [1.9, 1.61, 1.9], [0, Math.PI / 4, 0]), 0x9a4a32),
  );
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- materials

/** Uniforms shared by a crowd's material: time, stride speed and swing amounts. */
export interface Motion {
  speed: number;
  leg: number;
  arm: number;
  /** 1 = both arms together (hammering, poling); 0 = arms swing opposite (walking). */
  armSync: number;
}

export const WALK: Motion = { speed: 6, leg: 0.45, arm: 0.35, armSync: 0 };

/**
 * Vertex shader addition: swing limbs around their joint, roll wheels, sway trunks.
 * Each instance gets its own phase from gl_InstanceID so a crowd never marches in step.
 */
export const LIMB_VERTEX = /* glsl */ `
  float ph = uTime * uSpeed + float(gl_InstanceID) * 1.618;
  float ang = 0.0;
  float bend = 0.0;                       // elbow bend (forearms only), radians forward
  bool fore = limb.z > 4.5;
  bool armK = (limb.z > 1.5 && limb.z < 2.5) || fore;
  if (limb.z > 3.5 && limb.z < 4.5) ang = -uTime * uSpeed * 0.45;          // wheel
  else if (limb.z > 2.5 && limb.z < 3.5) ang = limb.x * 0.12 * sin(ph * 0.5); // trunk / tail
  else if (armK) {
    ang = uArmSync > 0.5 ? -uArm * (0.5 + 0.5 * sin(ph)) : limb.x * uArm * sin(ph);
    bend = 0.25 + 0.3 * uArm * (0.5 + 0.5 * sin(ph + 1.2));                 // relaxed elbows swing
  }
  else if (limb.z > 0.5 && limb.z < 1.5) ang = limb.x * uLeg * sin(ph);    // legs
  // Per-figure action (instanced attribute act, see ACT): 0 = the crowd's own motion.
  if (act > 0.5 && limb.z > 0.5 && (limb.z < 3.5 || fore)) {
    float w = uTime * 5.0 + float(gl_InstanceID) * 2.3;
    bool arm = armK;
    bool legs = limb.z < 1.5;
    bool tool = limb.x < 0.0;             // the hand holding the tool or weapon
    if (act < 1.5) { ang = arm ? 0.06 * sin(w * 0.2) : 0.0; bend = arm ? 0.2 : 0.0; }   // stand
    else if (act < 2.5) {                                                    // hammer: raise slowly, strike fast
      float k = fract(w * 0.18);
      float up = k < 0.75 ? smoothstep(0.0, 0.75, k) : 1.0 - smoothstep(0.75, 0.86, k);
      ang = arm ? -(0.35 + 2.1 * up) : 0.0;
      bend = arm ? 0.3 + 0.9 * up : 0.0;
    }
    else if (act < 3.5) { ang = arm ? -1.2 + 0.12 * sin(w * 0.5) : 0.0; bend = arm ? 0.5 : 0.0; } // lift a stone
    else if (act < 4.5) { ang = arm ? -1.0 + 0.4 * limb.x * sin(w * 0.55) : limb.x * 0.22; bend = arm ? 0.6 : 0.0; } // haul a rope
    else if (act < 5.5) { ang = arm ? -0.8 - 0.45 * (0.5 + 0.5 * sin(w * 0.35)) : limb.x * 0.12; bend = arm ? 0.4 : 0.0; } // lever
    else if (act < 6.5) { ang = arm ? -2.5 + 0.06 * sin(ph) : ang; bend = arm ? 0.9 : 0.0; } // carry on the head, legs walk
    else if (act < 7.5) {                                                    // spear thrust: draw back, lunge, drive
      float k = fract(w * 0.2);
      float hit = smoothstep(0.55, 0.66, k) * (1.0 - smoothstep(0.78, 0.95, k));
      if (arm) {
        ang = tool ? mix(-0.55, -1.5, hit) : -0.95;
        bend = tool ? mix(1.6, 0.05, hit) : 1.35;                              // shield arm up
      } else ang = limb.x * (0.12 + 0.28 * hit);                                // lunge
    }
    else if (act < 8.5) {                                                    // Bokator sword: raise, cut; every other: elbow + knee
      float k = fract(w * 0.19);
      float n = mod(floor(w * 0.19), 2.0);
      float raise = smoothstep(0.0, 0.5, k) * (1.0 - smoothstep(0.55, 0.62, k));
      float cut = smoothstep(0.55, 0.64, k) * (1.0 - smoothstep(0.8, 0.98, k));
      if (n < 0.5) {
        if (arm) {
          ang = tool ? -0.3 - 2.3 * raise - 0.2 * cut : -1.1;
          bend = tool ? 0.2 + 0.8 * raise : 1.8;                               // guard hand by the face
        } else ang = limb.x * 0.2 * (raise + cut);
      } else {
        // Kbach: elbow strike forward, rear knee drives up.
        if (arm) {
          ang = tool ? -1.1 : -1.2 - 0.6 * cut;
          bend = tool ? 1.9 : 1.9 + 0.5 * cut;
        } else ang = limb.x > 0.0 ? -1.3 * cut : 0.15 * cut;
      }
    }
    else if (act < 9.5) {                                                    // bow: hold out, draw to the ear, loose
      float k = fract(w * 0.16);
      float draw = smoothstep(0.1, 0.6, k) * (1.0 - smoothstep(0.82, 0.86, k));
      if (arm) {
        ang = tool ? -1.45 : -1.55;
        bend = tool ? 0.2 + 1.9 * draw : 0.05;
      } else ang = limb.x * 0.1;
    }
    else if (act < 10.5) {                                                   // Bokator guard stance, light bounce
      if (arm) { ang = -1.05 + 0.06 * sin(w * 0.8); bend = 1.85 + 0.1 * sin(w * 0.8 + limb.x); }
      else ang = limb.x * (0.22 + 0.04 * sin(w * 0.8));
    }
    else if (act < 11.5) {                                                   // planting rice: arms reach down in turn
      if (arm) { ang = -0.45 - 0.35 * (0.5 + 0.5 * sin(w * 0.6 + limb.x * 1.6)); bend = 0.35; }
      else ang = limb.x * 0.18;
    }
    else if (act < 12.5) {                                                   // sowing: the hand throws seed in a wide arc
      float k = fract(w * 0.17);
      float fling = smoothstep(0.0, 0.35, k) * (1.0 - smoothstep(0.45, 0.9, k));
      if (arm) {
        ang = tool ? -0.3 - 1.4 * fling : -0.6;                                  // basket held at the hip
        bend = tool ? 0.9 - 0.8 * fling : 1.4;
      } else ang = limb.x * 0.15 * sin(w * 0.17 * 6.2832);
    }
    else if (act < 13.5) {                                                   // treading the rahat water wheel
      if (arm) { ang = -1.25; bend = 0.9; }                                    // hands on the bar
      else ang = limb.x * 0.55 * sin(w * 0.9);
    }
    else if (act < 14.5) {                                                   // reaping: sickle sweeps low, the other hand gathers
      float k = fract(w * 0.2);
      float cut = smoothstep(0.1, 0.45, k) * (1.0 - smoothstep(0.55, 0.95, k));
      if (arm) {
        ang = tool ? -0.5 - 0.9 * cut : -0.7 + 0.2 * cut;
        bend = tool ? 0.4 + 0.6 * (1.0 - cut) : 0.8;
      } else ang = limb.x * 0.2;
    }
    else if (act < 15.5) {                                                   // chopping (PK 1.7.0): both hands on the axe, wind up slowly, drive into the trunk
      float k = fract(w * 0.21);
      float wind = smoothstep(0.0, 0.6, k) * (1.0 - smoothstep(0.6, 0.68, k));
      float bite = smoothstep(0.62, 0.68, k) * (1.0 - smoothstep(0.74, 0.98, k));
      if (arm) {
        ang = -0.55 - 1.85 * wind + 0.25 * bite;
        bend = 0.25 + 0.75 * wind;
      } else ang = limb.x * (0.2 + 0.06 * bite);                               // feet apart, braced
    }
    else if (act < 16.5) {                                                   // fishing (PK 1.7.0): the Khmer cast net (samnanh), gather, fling, haul in hand over hand
      float k = fract(w * 0.11);
      float gather = 1.0 - smoothstep(0.3, 0.38, k);
      float fling = smoothstep(0.33, 0.4, k) * (1.0 - smoothstep(0.52, 0.62, k));
      float haul = smoothstep(0.55, 0.65, k);
      if (arm) {
        ang = 0.35 * gather - 1.75 * fling + haul * (-0.85 + 0.4 * limb.x * sin(w * 1.3));
        bend = 1.25 * gather + 0.1 * fling + haul * (0.9 + 0.3 * limb.x * cos(w * 1.3));
      } else ang = limb.x * (0.22 + 0.1 * fling);
    }
    else {                                                                   // rowing (PK 1.7.0): the paddle stroke, every boat in time (the paddle prop follows uTime)
      float stroke = sin(uTime * 1.6);
      if (arm) {
        ang = -1.0 + (tool ? 0.5 : 0.35) * stroke;
        bend = 0.55 - 0.3 * stroke;
      } else ang = limb.x * 0.25;
    }
  }
  if (fore && bend != 0.0) {
    // Elbow first (0.34 m below the shoulder), then the whole arm swings from the shoulder.
    float c = cos(-bend);
    float s = sin(-bend);
    float ey = limb.y - 0.34;
    float yy = transformed.y - ey;
    float zz = transformed.z - limbZ;
    transformed.y = ey + yy * c - zz * s;
    transformed.z = limbZ + yy * s + zz * c;
  }
  if (ang != 0.0) {
    float c = cos(ang);
    float s = sin(ang);
    float yy = transformed.y - limb.y;
    float zz = transformed.z - limbZ;
    transformed.y = limb.y + yy * c - zz * s;
    transformed.z = limbZ + yy * s + zz * c;
  }
`;

/** Material for an animated crowd. */
export function crowdMaterial(motion: Motion): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const uniforms = {
    uTime: { value: 0 },
    uSpeed: { value: motion.speed },
    uLeg: { value: motion.leg },
    uArm: { value: motion.arm },
    uArmSync: { value: motion.armSync },
  };
  addRim(m, 0.32, 2.4, (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 limb;
        attribute float limbZ;
        attribute float act;
        uniform float uTime; uniform float uSpeed; uniform float uLeg; uniform float uArm; uniform float uArmSync;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LIMB_VERTEX}`)
      .replace(
        '#include <color_vertex>',
        `vColor = color;
        #ifdef USE_INSTANCING_COLOR
          vColor = mix(vColor * (0.92 + 0.16 * fract(float(gl_InstanceID) * 0.618)), instanceColor, limb.w);
        #endif`,
      );
  });
  m.userData.uniforms = uniforms;
  m.customProgramCacheKey = () => 'crowd';
  return m;
}

/** Static scatter material (trees, huts): per-instance tint for variety. */
export const figureMaterial = addRim(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
  0.2,
);
export const leafMaterial = addRim(
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  }),
  0.2,
);

/** Per-worker actions drawn by the crowd shader (instanced attribute `act`). */
export const ACT = {
  crowd: 0,
  stand: 1,
  hammer: 2,
  lift: 3,
  pull: 4,
  lever: 5,
  carry: 6,
  /** Fighting (D63): spear thrust, Bokator sword (cut, elbow and knee), bow draw, guard stance. */
  thrust: 7,
  sword: 8,
  draw: 9,
  guard: 10,
  /** Farmers bend and plant rice seedlings. */
  plant: 11,
  /** The rice year (PK): broadcast the seed, tread the rahat water wheel, reap with a sickle. */
  sow: 12,
  pedal: 13,
  reap: 14,
  /** PK 1.7.0: a two-handed axe into the trunk, the Khmer cast net, the paddle stroke. */
  chop: 15,
  fish: 16,
  row: 17,
} as const;

/** The paddle's swing (radians) at time t, in step with the rowing arms (ACT.row). */
export function paddleSwing(t: number): number {
  return 0.5 * Math.sin(t * 1.6);
}
export type Act = (typeof ACT)[keyof typeof ACT];

export interface Agent {
  /** Position and heading for time t (seconds). */
  place: (t: number) => {
    x: number;
    y: number;
    z: number;
    heading: number;
    bob?: number;
    lean?: number;
    act?: Act;
  };
}

/** A crowd of identical figures, one draw call, animated by agent functions and the GPU. */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.MeshStandardMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  agents: Agent[] = [];
  /** Per-instance action (ACT) read by the shader. */
  readonly acts: THREE.InstancedBufferAttribute;

  constructor(
    geometry: THREE.BufferGeometry,
    capacity: number,
    scale = 1,
    motion: Motion = WALK,
    private readonly palette: number[] = CLOTH_COLORS,
  ) {
    this.material = crowdMaterial(motion);
    this.acts = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
    this.acts.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('act', this.acts);
    this.mesh = new THREE.InstancedMesh(geometry, this.material, Math.max(1, capacity));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = currentLook().shadows;
    this.s.setScalar(scale);
    const c = new THREE.Color();
    for (let i = 0; i < this.mesh.instanceMatrix.count; i++) {
      this.mesh.setColorAt(i, c.set(this.palette[(i * 5 + 3) % this.palette.length]!));
    }
  }

  setAgents(agents: Agent[]): void {
    this.agents = agents.slice(0, this.mesh.instanceMatrix.count);
    this.mesh.count = this.agents.length;
  }

  update(t: number): void {
    (this.material.userData.uniforms as { uTime: { value: number } }).uTime.value = t;
    this.agents.forEach((a, i) => {
      const o = a.place(t);
      this.q.setFromEuler(this.e.set(o.lean ?? 0, o.heading, 0, 'YXZ'));
      this.p.set(o.x, o.y + (o.bob ?? 0), o.z);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      if (this.acts.getX(i) !== (o.act ?? 0)) {
        this.acts.setX(i, o.act ?? 0);
        this.acts.needsUpdate = true;
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Static scatter (trees, palms, huts) as one instanced mesh with gentle colour variety. */
export function scatter(
  geometry: THREE.BufferGeometry,
  points: Array<[number, number, number, number?, number?]>,
  material: THREE.Material = figureMaterial,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length));
  mesh.count = points.length;
  mesh.castShadow = currentLook().shadows;
  mesh.receiveShadow = currentLook().shadows;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  points.forEach(([x, y, z, s = 1, heading], i) => {
    m.makeRotationY(heading ?? (x * 13 + z * 7) % 6.28);
    m.scale(new THREE.Vector3(s, s, s));
    m.setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
    const k = 0.88 + ((((x * 31 + z * 17) % 1) + 1) % 1) * 0.24;
    mesh.setColorAt(i, c.setRGB(k, k * (0.96 + (0.08 * (i % 3)) / 2), k * 0.95));
  });
  return mesh;
}

/** Deterministic pseudo-random numbers for layouts. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
