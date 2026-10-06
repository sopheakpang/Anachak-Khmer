/**
 * Temple kits as pure data (prompt 09). No 3D library here, so the bridge can assign
 * slots to named stones and the game can draw the same slots.
 *
 * Units are metres. x = left/right, y = up, z = toward the viewer (the temple's front).
 */

export type SlotMaterial = 'brick' | 'laterite' | 'sandstone';

export interface Slot {
  /** Index in the build order. */
  i: number;
  part: string;
  x: number;
  y: number; // bottom of the block
  z: number;
  w: number;
  h: number;
  d: number;
  material: SlotMaterial;
}

export interface BigPiece extends Slot {
  kind: 'doorFrame' | 'lintel' | 'finial' | 'nandi';
  /** Which tower (0–5) or statue this belongs to. */
  owner: number;
}

export interface TempleKit {
  templeId: string;
  /** Ordinary blocks, sorted bottom-up: a block is never placed above an empty course. */
  slots: Slot[];
  /** Carved pieces for Large/Huge gifts, each unlocked once the courses below it are built. */
  bigPieces: BigPiece[];
  /** Bounding box for cameras. */
  size: { w: number; h: number; d: number };
}

const EPS = 1e-6;
const round = (n: number) => Math.round(n * 1000) / 1000;

interface TowerSpec {
  x: number;
  z: number;
  bodyH: number;
}

/**
 * Preah Ko (879): six brick towers on one laterite platform, two rows of three,
 * the front row taller; sandstone door frames and carved lintels; three Nandi statues in front.
 */
function preahKo(): TempleKit {
  const normal: Omit<Slot, 'i'>[] = [];
  const big: Omit<BigPiece, 'i'>[] = [];
  const COURSE = 0.5;

  // Platform: one layer of laterite blocks, 30 x 22 m, 1 m high.
  const PW = 30;
  const PD = 22;
  const BLOCK = 2;
  for (let x = -PW / 2; x < PW / 2 - EPS; x += BLOCK) {
    for (let z = -PD / 2; z < PD / 2 - EPS; z += BLOCK) {
      normal.push({
        part: 'platform',
        x: x + BLOCK / 2,
        y: 0,
        z: z + BLOCK / 2,
        w: BLOCK,
        h: 1,
        d: BLOCK,
        material: 'laterite',
      });
    }
  }
  // Front steps (laterite), centre of the front edge.
  for (let s = 0; s < 2; s++) {
    normal.push({
      part: 'steps',
      x: 0,
      y: s * 0.5,
      z: PD / 2 + 1.5 - s,
      w: 6,
      h: 0.5,
      d: 1,
      material: 'laterite',
    });
  }

  const towers: TowerSpec[] = [
    { x: -8, z: 4, bodyH: 7 },
    { x: 0, z: 4, bodyH: 7.5 },
    { x: 8, z: 4, bodyH: 7 },
    { x: -8, z: -5, bodyH: 5.5 },
    { x: 0, z: -5, bodyH: 6 },
    { x: 8, z: -5, bodyH: 5.5 },
  ];
  const BASE_Y = 1; // top of platform
  const PLINTH_H = 0.8;
  const BODY = 3.6;
  const DOOR_W = 1.2;
  const DOOR_H = 2.5;

  towers.forEach((t, ti) => {
    // Plinth: laterite ring of 4 slabs.
    const P = 5;
    normal.push(
      {
        part: `tower${ti}-plinth`,
        x: t.x,
        y: BASE_Y,
        z: t.z + P / 2 - 0.5,
        w: P,
        h: PLINTH_H,
        d: 1,
        material: 'laterite',
      },
      {
        part: `tower${ti}-plinth`,
        x: t.x,
        y: BASE_Y,
        z: t.z - P / 2 + 0.5,
        w: P,
        h: PLINTH_H,
        d: 1,
        material: 'laterite',
      },
      {
        part: `tower${ti}-plinth`,
        x: t.x - P / 2 + 0.5,
        y: BASE_Y,
        z: t.z,
        w: 1,
        h: PLINTH_H,
        d: P - 2,
        material: 'laterite',
      },
      {
        part: `tower${ti}-plinth`,
        x: t.x + P / 2 - 0.5,
        y: BASE_Y,
        z: t.z,
        w: 1,
        h: PLINTH_H,
        d: P - 2,
        material: 'laterite',
      },
    );
    const y0 = BASE_Y + PLINTH_H;

    // Body: brick courses around a square, with a doorway on the front face.
    const courses = Math.round(t.bodyH / COURSE);
    for (let c = 0; c < courses; c++) {
      const y = y0 + c * COURSE;
      ring(normal, `tower${ti}-body`, t.x, t.z, BODY, y, COURSE, 0.45, (side, cx) => {
        const inDoor = side === 'front' && Math.abs(cx - t.x) < DOOR_W / 2 + 0.3 && y < y0 + DOOR_H - EPS;
        return !inDoor;
      });
    }
    // Door frame and lintel (sandstone, carved) on the front face.
    big.push({
      kind: 'doorFrame',
      owner: ti,
      part: `tower${ti}-door`,
      x: t.x,
      y: y0,
      z: t.z + BODY / 2,
      w: DOOR_W + 0.6,
      h: DOOR_H,
      d: 0.5,
      material: 'sandstone',
    });
    big.push({
      kind: 'lintel',
      owner: ti,
      part: `tower${ti}-lintel`,
      x: t.x,
      y: y0 + DOOR_H,
      z: t.z + BODY / 2 + 0.1,
      w: DOOR_W + 1.4,
      h: 0.7,
      d: 0.6,
      material: 'sandstone',
    });

    // Roof: four receding tiers of two courses each.
    let y = y0 + courses * COURSE;
    [3.1, 2.6, 2.1, 1.6].forEach((side, k) => {
      for (let c = 0; c < 2; c++) {
        ring(normal, `tower${ti}-tier${k}`, t.x, t.z, side, y, COURSE, 0.4, () => true);
        y += COURSE;
      }
    });
    big.push({
      kind: 'finial',
      owner: ti,
      part: `tower${ti}-finial`,
      x: t.x,
      y,
      z: t.z,
      w: 1.2,
      h: 1.6,
      d: 1.2,
      material: 'sandstone',
    });
  });

  // Three Nandi (sacred bull) statues in front of the platform.
  [-8, 0, 8].forEach((x, k) => {
    big.push({
      kind: 'nandi',
      owner: k,
      part: `nandi${k}`,
      x,
      y: 0,
      z: PD / 2 + 5,
      w: 1.6,
      h: 1.4,
      d: 2.6,
      material: 'sandstone',
    });
  });

  // Build order: bottom-up by course; within a course, tower by tower, then around.
  const sorted = normal
    .map((s, k) => ({ s, k }))
    .sort((a, b) => a.s.y - b.s.y || a.k - b.k)
    .map(({ s }, i) => ({ ...s, x: round(s.x), y: round(s.y), z: round(s.z), i }));
  const bigSorted = big
    .map((b, k) => ({ b, k }))
    .sort((a, b) => a.b.y - b.b.y || a.k - b.k)
    .map(({ b }, i) => ({ ...b, i }));

  const top = Math.max(...bigSorted.map((b) => b.y + b.h), ...sorted.map((s) => s.y + s.h));
  return { templeId: 'preah-ko', slots: sorted, bigPieces: bigSorted, size: { w: PW, h: top, d: PD + 8 } };
}

/** One course of blocks around a square of side `side` centred on (cx, cz). */
function ring(
  out: Omit<Slot, 'i'>[],
  part: string,
  cx: number,
  cz: number,
  side: number,
  y: number,
  h: number,
  thick: number,
  keep: (side: 'front' | 'back' | 'left' | 'right', x: number) => boolean,
): void {
  const n = Math.max(2, Math.round(side / 0.9));
  const len = side / n;
  for (let k = 0; k < n; k++) {
    const x = cx - side / 2 + len * (k + 0.5);
    if (keep('front', x))
      out.push({ part, x, y, z: cz + side / 2 - thick / 2, w: len, h, d: thick, material: 'brick' });
    if (keep('back', x))
      out.push({ part, x, y, z: cz - side / 2 + thick / 2, w: len, h, d: thick, material: 'brick' });
  }
  const inner = side - 2 * thick;
  const m = Math.max(1, Math.round(inner / 0.9));
  const len2 = inner / m;
  for (let k = 0; k < m; k++) {
    const z = cz - inner / 2 + len2 * (k + 0.5);
    if (keep('left', cx))
      out.push({ part, x: cx - side / 2 + thick / 2, y, z, w: thick, h, d: len2, material: 'brick' });
    if (keep('right', cx))
      out.push({ part, x: cx + side / 2 - thick / 2, y, z, w: thick, h, d: len2, material: 'brick' });
  }
}

const KITS: Record<string, () => TempleKit> = { 'preah-ko': preahKo };
const cache = new Map<string, TempleKit>();

/** The kit for a temple, or null when its 3D kit isn't built yet (see temples.json kitReady). */
export function kitFor(templeId: string): TempleKit | null {
  const make = KITS[templeId];
  if (!make) return null;
  let k = cache.get(templeId);
  if (!k) {
    k = make();
    cache.set(templeId, k);
  }
  return k;
}

/** Progress units per ordinary slot, so the last slot fills exactly at 100%. */
export function unitsPerSlot(kit: TempleKit, target: number): number {
  return Math.max(1, Math.ceil(target / kit.slots.length));
}

/** How many ordinary slots are filled at a given progress. */
export function filledSlots(kit: TempleKit, target: number, progress: number): number {
  if (progress >= target) return kit.slots.length;
  return Math.min(kit.slots.length, Math.floor(progress / unitsPerSlot(kit, target)));
}

/** Height of the lowest unfilled course (everything below it is built). */
export function frontierY(kit: TempleKit, filled: number): number {
  return filled >= kit.slots.length ? Infinity : kit.slots[filled]!.y;
}

export type SlotRef = { kind: 'normal' | 'big'; index: number };

/**
 * Which slot carries a named stone's carving (prompt 10).
 * Large/Huge stones take the next big piece whose support is built; otherwise the
 * top-most block this stone filled. Returns null when the stone only went to the stockpile.
 */
export function assignSlot(
  kit: TempleKit,
  target: number,
  progressBefore: number,
  progressAfter: number,
  tier: 'small' | 'medium' | 'large' | 'huge',
  bigUsed: number,
): SlotRef | null {
  const before = filledSlots(kit, target, progressBefore);
  const after = filledSlots(kit, target, progressAfter);
  if (tier === 'large' || tier === 'huge') {
    const next = kit.bigPieces[bigUsed];
    if (next && next.y <= frontierY(kit, after) + EPS) return { kind: 'big', index: bigUsed };
  }
  if (after > before) return { kind: 'normal', index: after - 1 };
  return null;
}
