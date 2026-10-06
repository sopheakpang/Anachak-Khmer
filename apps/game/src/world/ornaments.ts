import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TempleKit } from '@temples/shared';
import { seg as lpSeg } from '../engine/look';

/**
 * Architectural detail of a Khmer brick sanctuary (Preah Ko style), drawn on top of the
 * kit's blocks without changing them (saved slots and carved names stay valid):
 * moulded sandstone base, brick pilasters at the corners and beside the doors, a
 * stepped cornice on the body and on every roof tier, lotus-bud antefixes on the tier
 * corners, miniature false doors on the tiers, carved sandstone false doors on the three
 * blind sides, octagonal colonettes at the real door, guardian figures in niches beside
 * the door, stairs with seated lions at every tower and at the platform.
 *
 * Each ornament appears once the part of the tower under it is built; pilasters grow
 * with the walls. Every ornament kind is one instanced mesh (a handful of draw calls).
 */

export type OrnamentKind =
  | 'pilaster'
  | 'baseMould'
  | 'cornice'
  | 'antefix'
  | 'miniDoor'
  | 'falseDoor'
  | 'colonettes'
  | 'guardian'
  | 'lion'
  | 'steps';

export interface TowerInfo {
  index: number;
  x: number;
  z: number;
  /** Top of the plinth = bottom of the brick body. */
  y0: number;
  bodyTop: number;
  side: number;
  tiers: Array<{ y0: number; y1: number; side: number }>;
  /** Front edge (z) and bottom of the laterite plinth. */
  plinthFront: number;
  plinthY: number;
}

export interface OrnamentSpec {
  kind: OrnamentKind;
  /** Tower index, or -1 for the platform. */
  tower: number;
  /** Height the tower must reach before this shows (platform: -1 = platform finished). */
  need: number;
  pos: [number, number, number];
  rotY: number;
  scale: [number, number, number];
  /** Pilasters: grow from pos.y up to this height with the walls. */
  growTo?: number;
}

/** Read tower layout from the kit's slot parts (tower{n}-plinth / -body / -tier{k}). */
export function towersFromKit(kit: TempleKit): TowerInfo[] {
  const by = new Map<
    number,
    { plinth: typeof kit.slots; body: typeof kit.slots; tiers: Map<number, typeof kit.slots> }
  >();
  for (const s of kit.slots) {
    const m = /^tower(\d+)-(plinth|body|tier(\d+))$/.exec(s.part);
    if (!m) continue;
    const t = Number(m[1]);
    if (!by.has(t)) by.set(t, { plinth: [], body: [], tiers: new Map() });
    const e = by.get(t)!;
    if (m[2] === 'plinth') e.plinth.push(s);
    else if (m[2] === 'body') e.body.push(s);
    else {
      const k = Number(m[3]);
      if (!e.tiers.has(k)) e.tiers.set(k, []);
      e.tiers.get(k)!.push(s);
    }
  }
  const extent = (slots: typeof kit.slots) => {
    const minX = Math.min(...slots.map((s) => s.x - s.w / 2));
    const maxX = Math.max(...slots.map((s) => s.x + s.w / 2));
    const minZ = Math.min(...slots.map((s) => s.z - s.d / 2));
    const maxZ = Math.max(...slots.map((s) => s.z + s.d / 2));
    const minY = Math.min(...slots.map((s) => s.y));
    const maxY = Math.max(...slots.map((s) => s.y + s.h));
    return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, side: maxX - minX, minY, maxY, maxZ };
  };
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, e]) => e.body.length > 0)
    .map(([index, e]) => {
      const body = extent(e.body);
      const plinth = e.plinth.length ? extent(e.plinth) : body;
      return {
        index,
        x: body.cx,
        z: body.cz,
        y0: body.minY,
        bodyTop: body.maxY,
        side: body.side,
        plinthFront: plinth.maxZ,
        plinthY: plinth.minY,
        tiers: [...e.tiers.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, slots]) => {
            const t = extent(slots);
            return { y0: t.minY, y1: t.maxY, side: t.side };
          }),
      };
    });
}

const FACES: Array<{ name: 'front' | 'back' | 'left' | 'right'; rotY: number; dx: number; dz: number }> = [
  { name: 'front', rotY: 0, dx: 0, dz: 1 },
  { name: 'right', rotY: Math.PI / 2, dx: 1, dz: 0 },
  { name: 'back', rotY: Math.PI, dx: 0, dz: -1 },
  { name: 'left', rotY: -Math.PI / 2, dx: -1, dz: 0 },
];

/** Where every ornament goes (pure: unit-tested). */
export function ornamentLayout(kit: TempleKit): OrnamentSpec[] {
  const out: OrnamentSpec[] = [];
  const towers = towersFromKit(kit);
  const door = kit.bigPieces.find((b) => b.kind === 'doorFrame');
  const doorH = door?.h ?? 2.5;
  const doorHalf = (door?.w ?? 1.8) / 2;

  for (const t of towers) {
    const half = t.side / 2;
    const bodyH = t.bodyTop - t.y0;
    // Moulded base just above the plinth.
    out.push({
      kind: 'baseMould',
      tower: t.index,
      need: t.y0 + 0.5,
      pos: [t.x, t.y0, t.z],
      rotY: 0,
      scale: [t.side + 0.3, 1, t.side + 0.3],
    });
    // Corner pilasters (redented corners) and pilasters flanking each door.
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      out.push({
        kind: 'pilaster',
        tower: t.index,
        need: t.y0 + 0.2,
        pos: [t.x + sx * (half - 0.08), t.y0, t.z + sz * (half - 0.08)],
        rotY: 0,
        scale: [1.25, 1, 1.25],
        growTo: t.bodyTop,
      });
    }
    for (const f of FACES) {
      // Pilasters flank the false doors (the real door has colonettes and guardians instead).
      for (const s of f.name === 'front' ? [] : [-1, 1]) {
        const along = s * (doorHalf + 0.28);
        out.push({
          kind: 'pilaster',
          tower: t.index,
          need: t.y0 + 0.2,
          pos: [
            t.x + f.dx * (half + 0.04) + (f.dz !== 0 ? along : 0),
            t.y0,
            t.z + f.dz * (half + 0.04) + (f.dx !== 0 ? along : 0),
          ],
          rotY: f.rotY,
          scale: [1, 1, 1],
          growTo: t.bodyTop,
        });
      }
      const onFace = (offset: number, y: number): [number, number, number] => [
        t.x + f.dx * (half + offset),
        y,
        t.z + f.dz * (half + offset),
      ];
      if (f.name === 'front') {
        out.push({
          kind: 'colonettes',
          tower: t.index,
          need: t.y0 + doorH,
          pos: onFace(0.05, t.y0),
          rotY: f.rotY,
          scale: [1, doorH / 2.5, 1],
        });
        // Guardians (dvarapala / devata) in niches either side of the door.
        for (const s of [-1, 1]) {
          const g = onFace(0.03, t.y0 + 0.35);
          g[0] += s * (doorHalf + 0.38);
          out.push({
            kind: 'guardian',
            tower: t.index,
            need: t.y0 + 2.2,
            pos: g,
            rotY: f.rotY,
            scale: [0.8, 1, 1],
          });
        }
      } else if (bodyH > doorH + 0.8) {
        out.push({
          kind: 'falseDoor',
          tower: t.index,
          need: t.y0 + doorH + 0.7,
          pos: onFace(0.02, t.y0),
          rotY: f.rotY,
          scale: [1, doorH / 2.5, 1],
        });
      }
    }
    // Cornice on the body and on every tier; antefixes and miniature doors on the tiers.
    const levels = [{ top: t.bodyTop, side: t.side }, ...t.tiers.map((k) => ({ top: k.y1, side: k.side }))];
    levels.forEach((lv, li) => {
      out.push({
        kind: 'cornice',
        tower: t.index,
        need: lv.top - 0.01,
        pos: [t.x, lv.top - 0.12, t.z],
        rotY: 0,
        scale: [lv.side + 0.35, 1, lv.side + 0.35],
      });
      const k = Math.max(0.55, lv.side / 3.6);
      const h = lv.side / 2 + 0.05;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const corner = sx !== 0 && sz !== 0;
        out.push({
          kind: 'antefix',
          tower: t.index,
          need: lv.top - 0.01,
          pos: [t.x + sx * h, lv.top + 0.14, t.z + sz * h],
          rotY: 0,
          scale: corner ? [k * 1.15, k * 1.15, k * 1.15] : [k * 0.8, k * 0.8, k * 0.8],
        });
      }
      if (li > 0) {
        const tier = t.tiers[li - 1]!;
        const th = tier.y1 - tier.y0;
        for (const f of FACES) {
          const hs = tier.side / 2 + 0.03;
          out.push({
            kind: 'miniDoor',
            tower: t.index,
            need: tier.y1 - 0.01,
            pos: [t.x + f.dx * hs, tier.y0 + 0.05, t.z + f.dz * hs],
            rotY: f.rotY,
            scale: [k, th / 0.95, k],
          });
        }
      }
    });
    // Stairs up to the door, with a small lion on each side.
    const stairZ = t.plinthFront + 0.45;
    const base = t.plinthY;
    out.push({
      kind: 'steps',
      tower: t.index,
      need: t.y0 - 0.01,
      pos: [t.x, base, stairZ],
      rotY: 0,
      scale: [1, (t.y0 - base) / 0.8, 1],
    });
    for (const s of [-1, 1])
      out.push({
        kind: 'lion',
        tower: t.index,
        need: t.y0 - 0.01,
        pos: [t.x + s * 1.25, base, stairZ + 0.35],
        rotY: 0,
        scale: [0.6, 0.6, 0.6],
      });
  }

  // Platform stair lions (the famous seated guardians).
  const steps = kit.slots.filter((s) => s.part === 'steps');
  if (steps.length) {
    const front = Math.max(...steps.map((s) => s.z + s.d / 2));
    const w = Math.max(...steps.map((s) => s.w));
    for (const s of [-1, 1])
      out.push({
        kind: 'lion',
        tower: -1,
        need: -1,
        pos: [s * (w / 2 + 0.7), 0, front - 0.6],
        rotY: 0,
        scale: [1, 1, 1],
      });
  }
  return out;
}

// ---------------------------------------------------------------- geometry

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  return mergeGeometries(clean)!;
}

const rb = (w: number, h: number, d: number, r = 0.03) =>
  new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

function lotusBud(w: number, h: number, seg = 8): THREE.BufferGeometry {
  const r = w / 2;
  const pts = [
    [0, 0],
    [r * 0.9, 0],
    [r, h * 0.12],
    [r * 0.75, h * 0.22],
    [r * 0.95, h * 0.42],
    [r * 0.7, h * 0.66],
    [r * 0.3, h * 0.88],
    [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, seg);
}

/** Seated Khmer temple lion, facing +Z, about 1.1 m tall. */
export function lionGeometry(): THREE.BufferGeometry {
  return merge([
    rb(0.7, 0.2, 1.0, 0.05).translate(0, 0.1, 0), // pedestal
    new THREE.SphereGeometry(0.28, lpSeg(12, 4), lpSeg(8, 3)).scale(1, 0.85, 1.1).translate(0, 0.42, -0.18), // haunch
    new THREE.CapsuleGeometry(0.2, 0.3, 3, lpSeg(10, 4)).rotateX(-0.5).translate(0, 0.62, 0.02), // chest
    new THREE.CapsuleGeometry(0.07, 0.36, 2, lpSeg(6, 4)).translate(-0.14, 0.4, 0.2), // front legs
    new THREE.CapsuleGeometry(0.07, 0.36, 2, lpSeg(6, 4)).translate(0.14, 0.4, 0.2),
    new THREE.SphereGeometry(0.26, lpSeg(12, 4), lpSeg(10, 3)).scale(1.05, 1, 0.8).translate(0, 0.92, 0.12), // mane
    new THREE.SphereGeometry(0.17, lpSeg(12, 4), lpSeg(10, 3)).scale(1, 0.95, 1.05).translate(0, 0.92, 0.25), // face
    new THREE.SphereGeometry(0.08, lpSeg(8, 4), lpSeg(6, 3)).scale(1.3, 0.8, 1).translate(0, 0.84, 0.39), // muzzle
    new THREE.SphereGeometry(0.04, lpSeg(6, 4), lpSeg(4, 3)).translate(-0.07, 0.98, 0.39), // eyes
    new THREE.SphereGeometry(0.04, lpSeg(6, 4), lpSeg(4, 3)).translate(0.07, 0.98, 0.39),
    new THREE.TorusGeometry(0.1, 0.03, lpSeg(5, 3), lpSeg(10, 4), Math.PI * 1.4)
      .rotateY(Math.PI / 2)
      .translate(0, 0.6, -0.42), // tail curl
  ]);
}

function geometryFor(kind: OrnamentKind): THREE.BufferGeometry {
  switch (kind) {
    case 'pilaster':
      // Unit height (scaled with the wall), square with a small projecting capital band.
      return merge([
        rb(0.32, 1, 0.24, 0.03).translate(0, 0.5, 0),
        rb(0.4, 0.06, 0.3, 0.02).translate(0, 0.97, 0),
      ]);
    case 'baseMould':
      return merge([
        rb(1.04, 0.12, 1.04, 0.04).translate(0, 0.06, 0),
        rb(0.99, 0.1, 0.99, 0.04).translate(0, 0.17, 0),
        rb(1.02, 0.07, 1.02, 0.03).translate(0, 0.255, 0),
      ]);
    case 'cornice':
      return merge([
        rb(0.98, 0.07, 0.98, 0.03).translate(0, 0.035, 0),
        rb(1.01, 0.08, 1.01, 0.03).translate(0, 0.11, 0),
        rb(1.05, 0.1, 1.05, 0.04).translate(0, 0.2, 0),
      ]);
    case 'antefix':
      return merge([
        new THREE.BoxGeometry(0.24, 0.08, 0.24).translate(0, 0.04, 0),
        lotusBud(0.22, 0.5, 6).translate(0, 0.08, 0),
      ]);
    case 'miniDoor': {
      // Small false door with a pointed arch (the "flying palace" motif on each tier).
      const arch = new THREE.TorusGeometry(0.26, 0.045, lpSeg(4, 3), lpSeg(8, 4), Math.PI).translate(
        0,
        0.62,
        0.05,
      );
      return merge([
        new THREE.BoxGeometry(0.52, 0.62, 0.08).translate(0, 0.31, 0.04),
        new THREE.BoxGeometry(0.36, 0.5, 0.05).translate(0, 0.28, 0.1),
        arch,
      ]);
    }
    case 'falseDoor': {
      // Carved sandstone false door: frame, two panelled leaves with studs, colonettes, lintel.
      const parts: THREE.BufferGeometry[] = [rb(1.7, 2.45, 0.12, 0.03).translate(0, 1.22, 0.06)];
      for (const s of [-1, 1]) {
        parts.push(rb(0.62, 2.1, 0.06, 0.02).translate(s * 0.33, 1.1, 0.14));
        for (let r = 0; r < 4; r++)
          parts.push(
            new THREE.SphereGeometry(0.04, lpSeg(5, 4), 3).translate(s * 0.33, 0.45 + r * 0.45, 0.18),
          );
        parts.push(new THREE.CylinderGeometry(0.075, 0.075, 2.4, lpSeg(8, 3)).translate(s * 0.95, 1.2, 0.2));
        for (const y of [0.25, 1.2, 2.15])
          parts.push(
            new THREE.TorusGeometry(0.085, 0.025, lpSeg(4, 3), lpSeg(8, 4))
              .rotateX(Math.PI / 2)
              .translate(s * 0.95, y, 0.2),
          );
      }
      parts.push(rb(2.3, 0.5, 0.24, 0.04).translate(0, 2.62, 0.14));
      for (const x of [-0.7, 0, 0.7])
        parts.push(
          new THREE.SphereGeometry(0.12, lpSeg(10, 4), lpSeg(6, 3))
            .scale(1, 1, 0.45)
            .translate(x, 2.62, 0.27),
        );
      return merge(parts);
    }
    case 'colonettes': {
      const parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        parts.push(new THREE.CylinderGeometry(0.1, 0.1, 2.5, lpSeg(8, 3)).translate(s * 0.98, 1.25, 0.32));
        for (const y of [0.3, 0.9, 1.6, 2.2])
          parts.push(
            new THREE.TorusGeometry(0.11, 0.03, lpSeg(4, 3), lpSeg(8, 4))
              .rotateX(Math.PI / 2)
              .translate(s * 0.98, y, 0.32),
          );
        parts.push(rb(0.28, 0.12, 0.28, 0.02).translate(s * 0.98, 0.06, 0.32));
        parts.push(rb(0.28, 0.12, 0.28, 0.02).translate(s * 0.98, 2.44, 0.32));
      }
      return merge(parts);
    }
    case 'guardian': {
      // Niche with a pointed arch and a standing guardian relief holding a staff.
      const parts: THREE.BufferGeometry[] = [
        rb(0.62, 1.75, 0.06, 0.02).translate(0, 0.87, 0.03),
        new THREE.TorusGeometry(0.3, 0.04, lpSeg(5, 3), lpSeg(12, 4), Math.PI).translate(0, 1.75, 0.05),
        new THREE.ConeGeometry(0.08, 0.2, lpSeg(6, 3)).translate(0, 2.13, 0.05),
        rb(0.2, 0.55, 0.1, 0.03).translate(0, 0.35, 0.1), // legs
        rb(0.3, 0.22, 0.12, 0.04).translate(0, 0.72, 0.1), // sampot
        new THREE.CapsuleGeometry(0.1, 0.25, 2, lpSeg(8, 4)).scale(1.1, 1, 0.55).translate(0, 1.0, 0.1), // torso
        new THREE.SphereGeometry(0.085, lpSeg(8, 4), lpSeg(6, 3)).translate(0, 1.3, 0.1), // head
        new THREE.ConeGeometry(0.07, 0.2, lpSeg(8, 3)).translate(0, 1.47, 0.1), // crown
        new THREE.CapsuleGeometry(0.035, 0.32, 2, lpSeg(5, 4)).rotateZ(0.2).translate(-0.17, 0.95, 0.1),
        new THREE.CapsuleGeometry(0.035, 0.32, 2, lpSeg(5, 4)).rotateZ(-0.2).translate(0.17, 0.95, 0.1),
        new THREE.CylinderGeometry(0.025, 0.03, 0.9, lpSeg(5, 3)).translate(0.2, 0.5, 0.13), // staff
      ];
      return merge(parts);
    }
    case 'lion':
      return lionGeometry();
    case 'steps': {
      // Two sandstone steps with cheek walls, 0.8 m rise.
      return merge([
        rb(1.7, 0.4, 0.5, 0.03).translate(0, 0.2, 0.3),
        rb(1.7, 0.8, 0.45, 0.03).translate(0, 0.4, -0.18),
        rb(0.22, 0.85, 1.1, 0.03).translate(-0.96, 0.425, 0.1),
        rb(0.22, 0.85, 1.1, 0.03).translate(0.96, 0.425, 0.1),
      ]);
    }
  }
}

const BRICK_KINDS = new Set<OrnamentKind>(['pilaster', 'cornice']);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Instanced ornament meshes; call `update` when tower heights change. */
export class TempleOrnaments {
  readonly group = new THREE.Group();
  readonly specs: OrnamentSpec[];
  private readonly meshes = new Map<OrnamentKind, { mesh: THREE.InstancedMesh; specs: OrnamentSpec[] }>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(kit: TempleKit, sandstone: THREE.Material, brick: THREE.Material, castShadow: boolean) {
    this.specs = ornamentLayout(kit);
    const kinds = new Set(this.specs.map((s) => s.kind));
    for (const kind of kinds) {
      const specs = this.specs.filter((s) => s.kind === kind);
      const mesh = new THREE.InstancedMesh(
        geometryFor(kind),
        BRICK_KINDS.has(kind) ? brick : sandstone,
        specs.length,
      );
      mesh.castShadow = castShadow;
      mesh.receiveShadow = castShadow;
      mesh.frustumCulled = false;
      for (let i = 0; i < specs.length; i++) mesh.setMatrixAt(i, HIDDEN);
      this.meshes.set(kind, { mesh, specs });
      this.group.add(mesh);
    }
  }

  /** Show ornaments whose support is built. heights[t] = built height of tower t. */
  update(heights: number[], platformDone: boolean): void {
    for (const { mesh, specs } of this.meshes.values()) {
      specs.forEach((s, i) => {
        const shown = s.tower < 0 ? platformDone : (heights[s.tower] ?? 0) >= s.need;
        if (!shown) {
          mesh.setMatrixAt(i, HIDDEN);
          return;
        }
        let sy = s.scale[1];
        if (s.growTo !== undefined) sy = Math.max(0.01, Math.min(heights[s.tower] ?? 0, s.growTo) - s.pos[1]);
        this.q.setFromAxisAngle(this.up, s.rotY);
        this.m.compose(this.v.set(...s.pos), this.q, this.sc.set(s.scale[0], sy, s.scale[2]));
        mesh.setMatrixAt(i, this.m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** How many ornaments are visible (tests). */
  visibleCount(heights: number[], platformDone: boolean): number {
    return this.specs.filter((s) => (s.tower < 0 ? platformDone : (heights[s.tower] ?? 0) >= s.need)).length;
  }
}
