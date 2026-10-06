/**
 * The Kulen plateau as pure data and functions (prompt E02): height, river, zones, trails,
 * shrines and where every tree stands. No 3D library here, so pathfinding, picking and
 * placement are unit-tested and the 3D scene draws exactly what the rules use.
 *
 * Units are metres. x = west→east, z = north→south (the camera looks north), y = up.
 * The plateau (y ≈ 8) covers the north; a cliff with the waterfall drops to the southern
 * basin (y ≈ 0) where the river landing is. A gentle stone ramp crosses the cliff in the west.
 */

export type XZ = [number, number];

export const HALF = 90; // the map spans -90..90 on both axes
export const PLATEAU_Y = 8;

export interface Zone {
  id: 'lingas' | 'waterfall' | 'hermitage' | 'quarry' | 'landing';
  km: string;
  en: string;
  center: XZ;
  radius: number;
}

export const ZONES: Zone[] = [
  {
    id: 'lingas',
    km: 'ទន្លេលិង្គមួយពាន់',
    en: 'Riverbed of a Thousand Lingas',
    center: [-20, -54],
    radius: 20,
  },
  { id: 'waterfall', km: 'ទឹកធ្លាក់គូលែន', en: 'Kulen Waterfall', center: [8, 58], radius: 14 },
  { id: 'hermitage', km: 'អាស្រមឥសី', en: 'Hermitage Ruins', center: [-50, -4], radius: 16 },
  { id: 'quarry', km: 'កន្លែងយកថ្មចាស់', en: 'Old Quarry', center: [48, -32], radius: 18 },
  { id: 'landing', km: 'កំពង់ក្បូន', en: 'River Landing', center: [18, 82], radius: 10 },
];

/** Camp where every expedition starts, and shrines where a fallen hero rises again. */
export const CAMP: XZ = [-4, 24];
export const SHRINES: XZ[] = [CAMP, [-30, -40], [40, 2], [-42, 64]];

/** The river: from the northern springs across the plateau, over the waterfall, to the landing. */
export const RIVER: XZ[] = [
  [-32, -92],
  [-24, -70],
  [-12, -50],
  [-18, -26],
  [-6, 2],
  [4, 24],
  [6, 42],
  [7, 50],
  [8, 60],
  [12, 72],
  [16, 92],
];
export const RIVER_HALF_WIDTH = 3.2;
export const POOL: { center: XZ; radius: number } = { center: [8, 60], radius: 7 };
/** Shallow fords with stepping stones: the only places to cross the river on foot. */
export const FORDS: XZ[] = [
  [-15.5, -36],
  [0.5, 16],
  [12.8, 76],
];
export const FORD_RADIUS = 3.2;

/** Trails keep the jungle open between camp and each zone. TRAILS[3] is the cliff path. */
export const CLIFF_TRAIL = 3;
export const TRAILS: XZ[][] = [
  [CAMP, [-12, 10], [-22, -10], [-26, -30], [-22, -48], [-20, -54]], // west bank to the lingas riverbed
  [CAMP, [-20, 14], [-38, 4], [-50, -4]], // to the hermitage
  [CAMP, [0.5, 16], [12, 8], [30, -4], [40, 2], [48, -32]], // across the ford to the old quarry
  // Down the cliff to the landing: switchbacks with stone steps across the western ramp.
  [
    CAMP,
    [-22, 34],
    [-38, 40],
    [-49, 45],
    [-37, 51],
    [-49, 57],
    [-41, 64],
    [-20, 72],
    [4, 72],
    [12.8, 76],
    [18, 82],
  ],
  [
    [-30, -40],
    [-26, -30],
  ],
];
export const TRAIL_HALF_WIDTH = 2.4;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from a point to a polyline, and the parameter of the nearest point (0..1). */
export function distToPolyline(x: number, z: number, pts: XZ[]): { d: number; t: number; p: XZ } {
  let best = Infinity;
  let bestT = 0;
  let bestP: XZ = pts[0]!;
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    lens.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + u * dx), z - (az + u * dz));
    if (d < best) {
      best = d;
      bestT = total > 0 ? (acc + u * lens[i - 1]!) / total : 0;
      bestP = [ax + u * dx, az + u * dz];
    }
    acc += lens[i - 1]!;
  }
  return { d: best, t: bestT, p: bestP };
}

/** Width of the cliff band at x: narrow (a real cliff) except the gentle ramp in the west. */
function cliffWidth(x: number): number {
  return 6 + 30 * Math.exp(-(((x + 43) / 7) ** 2));
}

/** Ground height before the river is carved. */
function landHeight(x: number, z: number): number {
  const plateau = PLATEAU_Y * (1 - smoothstep(40, 40 + cliffWidth(x), z));
  const hills =
    1.6 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06) +
    0.8 * Math.sin(x * 0.17 + z * 0.11) +
    0.35 * Math.sin(x * 0.41 - z * 0.37);
  // Flatter near camp, trails and zone centres so walking reads clearly.
  const flat = Math.min(1, Math.hypot(x - CAMP[0], z - CAMP[1]) / 18);
  // Hills rise toward the map edge (the plateau's rim).
  const rim = 5 * smoothstep(70, 90, Math.max(Math.abs(x), Math.abs(z)));
  return plateau + hills * (0.35 + 0.65 * flat) + rim;
}

/** Terrain height at (x, z) including the carved river channel and the waterfall pool. */
export function heightAt(x: number, z: number): number {
  let h = landHeight(x, z);
  const r = distToPolyline(x, z, RIVER);
  if (r.d < RIVER_HALF_WIDTH * 2) {
    const k = 1 - smoothstep(0, RIVER_HALF_WIDTH * 2, r.d);
    h -= 1.6 * k;
  }
  const pd = Math.hypot(x - POOL.center[0], z - POOL.center[1]);
  if (pd < POOL.radius * 1.6) h -= 1.4 * (1 - smoothstep(0, POOL.radius * 1.6, pd));
  return h;
}

/** Water surface height: follows the riverbed along the centre line (so the waterfall pours down the cliff). */
export function waterLevelAt(x: number, z: number): number {
  const pd = Math.hypot(x - POOL.center[0], z - POOL.center[1]);
  if (pd < POOL.radius * 1.2) return heightAt(POOL.center[0], POOL.center[1]) + 1.1;
  const { p } = distToPolyline(x, z, RIVER);
  return heightAt(p[0], p[1]) + 1.15;
}

export function isRiver(x: number, z: number): boolean {
  return (
    distToPolyline(x, z, RIVER).d < RIVER_HALF_WIDTH ||
    Math.hypot(x - POOL.center[0], z - POOL.center[1]) < POOL.radius
  );
}

export function nearFord(x: number, z: number): boolean {
  return FORDS.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < FORD_RADIUS);
}

export function onTrail(x: number, z: number, margin = TRAIL_HALF_WIDTH): boolean {
  return TRAILS.some((t) => distToPolyline(x, z, t).d < margin);
}

export function zoneAt(x: number, z: number): Zone | null {
  return ZONES.find((zn) => Math.hypot(x - zn.center[0], z - zn.center[1]) < zn.radius) ?? null;
}

/** Steepness (metres of rise per metre) from the height field. */
export function slopeAt(x: number, z: number): number {
  const e = 0.5;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

// ---------------------------------------------------------------- jungle placement

export type Species = 'rainTree' | 'fig' | 'palm' | 'fern' | 'bush' | 'rock';

export interface Plant {
  species: Species;
  x: number;
  z: number;
  scale: number;
  rot: number;
  /** Trunk radius that blocks walking (0 = walk through). */
  block: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Open ground: trails, clearings at camp/shrines/zones, the river and the cliff face. */
export function isOpenGround(x: number, z: number, margin = 0): boolean {
  if (onTrail(x, z, TRAIL_HALF_WIDTH + margin)) return true;
  if (SHRINES.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 7 + margin)) return true;
  if (ZONES.some((zn) => Math.hypot(x - zn.center[0], z - zn.center[1]) < zn.radius * 0.45 + margin))
    return true;
  if (distToPolyline(x, z, RIVER).d < RIVER_HALF_WIDTH + 1.5 + margin) return true;
  if (Math.hypot(x - POOL.center[0], z - POOL.center[1]) < POOL.radius + 2 + margin) return true;
  return false;
}

let plantsCache: Plant[] | null = null;

/** Every tree, fern, bush and rock of the jungle (deterministic). */
export function junglePlants(): Plant[] {
  if (plantsCache) return plantsCache;
  const out: Plant[] = [];
  const r = rng(802); // the year of Mahendraparvata
  // Big trees on a jittered 7 m grid.
  for (let gx = -HALF + 3; gx < HALF - 3; gx += 7) {
    for (let gz = -HALF + 3; gz < HALF - 3; gz += 7) {
      const x = gx + (r() - 0.5) * 5;
      const z = gz + (r() - 0.5) * 5;
      const pick = r();
      if (isOpenGround(x, z, 1.5) || slopeAt(x, z) > 0.8) continue;
      const species: Species = pick < 0.5 ? 'rainTree' : pick < 0.78 ? 'fig' : 'palm';
      const scale = species === 'palm' ? 0.8 + r() * 0.4 : 0.85 + r() * 0.5;
      out.push({
        species,
        x,
        z,
        scale,
        rot: r() * Math.PI * 2,
        block: species === 'palm' ? 0.5 : species === 'fig' ? 1.4 * scale : 0.9 * scale,
      });
    }
  }
  // Undergrowth on a jittered 3.2 m grid; ferns may line the trails.
  for (let gx = -HALF + 1; gx < HALF - 1; gx += 3.2) {
    for (let gz = -HALF + 1; gz < HALF - 1; gz += 3.2) {
      const x = gx + (r() - 0.5) * 2.6;
      const z = gz + (r() - 0.5) * 2.6;
      const pick = r();
      if (onTrail(x, z, TRAIL_HALF_WIDTH - 0.6) || isRiver(x, z) || slopeAt(x, z) > 1.2) continue;
      if (SHRINES.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 5)) continue;
      if (pick < 0.55) out.push({ species: 'fern', x, z, scale: 0.7 + r() * 0.7, rot: r() * 6.28, block: 0 });
      else if (pick < 0.72)
        out.push({ species: 'bush', x, z, scale: 0.6 + r() * 0.8, rot: r() * 6.28, block: 0 });
      else if (pick < 0.76 && !isOpenGround(x, z))
        out.push({ species: 'rock', x, z, scale: 0.6 + r() * 1.2, rot: r() * 6.28, block: 0.7 });
    }
  }
  plantsCache = out;
  return out;
}

// ---------------------------------------------------------------- walking grid + A*

export const CELL = 1; // metres per grid cell
export const GRID = (HALF * 2) / CELL; // 180 × 180 cells

export interface WalkGrid {
  size: number;
  /** 0 = blocked, 1 = open. */
  open: Uint8Array;
}

export const toCell = (v: number) => Math.min(GRID - 1, Math.max(0, Math.floor((v + HALF) / CELL)));
export const cellCenter = (c: number) => -HALF + (c + 0.5) * CELL;

let gridCache: WalkGrid | null = null;

/** Where heroes and convoys can walk: not in deep water (except fords), not up cliffs, not into trunks. */
export function walkGrid(): WalkGrid {
  if (gridCache) return gridCache;
  const open = new Uint8Array(GRID * GRID);
  for (let cz = 0; cz < GRID; cz++) {
    for (let cx = 0; cx < GRID; cx++) {
      const x = cellCenter(cx);
      const z = cellCenter(cz);
      let ok = Math.abs(x) < HALF - 2 && Math.abs(z) < HALF - 2;
      if (ok && isRiver(x, z) && !nearFord(x, z)) ok = false;
      if (ok && slopeAt(x, z) > 0.75 && !onTrail(x, z)) ok = false;
      open[cz * GRID + cx] = ok ? 1 : 0;
    }
  }
  for (const p of junglePlants()) {
    if (p.block <= 0) continue;
    const rad = p.block;
    for (let cz = toCell(p.z - rad); cz <= toCell(p.z + rad); cz++)
      for (let cx = toCell(p.x - rad); cx <= toCell(p.x + rad); cx++)
        if (Math.hypot(cellCenter(cx) - p.x, cellCenter(cz) - p.z) <= rad) open[cz * GRID + cx] = 0;
  }
  gridCache = { size: GRID, open };
  return gridCache;
}

export function isWalkable(g: WalkGrid, x: number, z: number): boolean {
  if (Math.abs(x) >= HALF || Math.abs(z) >= HALF) return false;
  return g.open[toCell(z) * g.size + toCell(x)] === 1;
}

/** Nearest open cell to a point (for clicks on trees, water or cliffs). */
export function nearestOpen(g: WalkGrid, x: number, z: number, maxR = 12): XZ | null {
  const cx0 = toCell(x);
  const cz0 = toCell(z);
  for (let r = 0; r <= maxR; r++) {
    let best: XZ | null = null;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = cx0 + dx;
        const cz = cz0 + dz;
        if (cx < 0 || cz < 0 || cx >= g.size || cz >= g.size || !g.open[cz * g.size + cx]) continue;
        const d = Math.hypot(cellCenter(cx) - x, cellCenter(cz) - z);
        if (d < bestD) {
          bestD = d;
          best = [cellCenter(cx), cellCenter(cz)];
        }
      }
    if (best) return best;
  }
  return null;
}

/**
 * A* on the walking grid with 8 directions (no corner cutting past blocked cells),
 * then string-pulled so the hero walks straight lines where it can.
 * Returns world points from start to goal, or null when the goal can't be reached.
 */
export function findPath(g: WalkGrid, from: XZ, to: XZ, maxNodes = 40_000): XZ[] | null {
  const start = nearestOpen(g, from[0], from[1], 3);
  const goal = nearestOpen(g, to[0], to[1]);
  if (!start || !goal) return null;
  const n = g.size;
  const sx = toCell(start[0]);
  const sz = toCell(start[1]);
  const gx = toCell(goal[0]);
  const gz = toCell(goal[1]);
  const startI = sz * n + sx;
  const goalI = gz * n + gx;
  if (startI === goalI) return [from, goal];
  const gScore = new Float32Array(n * n).fill(Infinity);
  const came = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const heap = new MinHeap();
  const h = (i: number) => {
    const dx = Math.abs((i % n) - gx);
    const dz = Math.abs(Math.floor(i / n) - gz);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  gScore[startI] = 0;
  heap.push(startI, h(startI));
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % n;
    const cz = Math.floor(cur / n);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx;
        if (!g.open[ni] || closed[ni]) continue;
        if (dx && dz && (!g.open[cz * n + nx] || !g.open[nz * n + cx])) continue; // no corner cutting
        const cost = gScore[cur]! + (dx && dz ? Math.SQRT2 : 1);
        if (cost < gScore[ni]!) {
          gScore[ni] = cost;
          came[ni] = cur;
          heap.push(ni, cost + h(ni));
        }
      }
  }
  if (came[goalI] === -1) return null;
  const cells: number[] = [];
  for (let i = goalI; i !== -1; i = came[i]!) cells.push(i);
  cells.reverse();
  const pts: XZ[] = cells.map((i) => [cellCenter(i % n), cellCenter(Math.floor(i / n))]);
  pts[0] = [from[0], from[1]];
  pts[pts.length - 1] = goal;
  return smoothPath(g, pts);
}

/** Line of sight on the grid: every cell along the segment is open. */
export function clearLine(g: WalkGrid, a: XZ, b: XZ): boolean {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len / (CELL * 0.35)));
  for (let i = 0; i <= steps; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / steps;
    const z = a[1] + ((b[1] - a[1]) * i) / steps;
    if (!isWalkable(g, x, z)) return false;
  }
  return true;
}

function smoothPath(g: WalkGrid, pts: XZ[]): XZ[] {
  const out: XZ[] = [pts[0]!];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(g, pts[i]!, pts[j]!)) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}

class MinHeap {
  private idx: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.idx.length;
  }
  push(i: number, p: number): void {
    this.idx.push(i);
    this.pri.push(p);
    let c = this.idx.length - 1;
    while (c > 0) {
      const par = (c - 1) >> 1;
      if (this.pri[par]! <= this.pri[c]!) break;
      this.swap(c, par);
      c = par;
    }
  }
  pop(): number {
    const top = this.idx[0]!;
    const li = this.idx.pop()!;
    const lp = this.pri.pop()!;
    if (this.idx.length > 0) {
      this.idx[0] = li;
      this.pri[0] = lp;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < this.idx.length && this.pri[l]! < this.pri[m]!) m = l;
        if (r < this.idx.length && this.pri[r]! < this.pri[m]!) m = r;
        if (m === c) break;
        this.swap(c, m);
        c = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.idx[a], this.idx[b]] = [this.idx[b]!, this.idx[a]!];
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
  }
}

// ---------------------------------------------------------------- picking

/**
 * Where a camera ray meets the ground (ray-march the height field, then refine).
 * origin/dir are world vectors; returns null when the ray misses the map.
 */
export function rayToGround(
  origin: [number, number, number],
  dir: [number, number, number],
  maxDist = 400,
): XZ | null {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  let prevT = 0;
  const step = 0.5;
  for (let t = step; t < maxDist; t += step) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    if (Math.abs(x) > HALF + 20 || Math.abs(z) > HALF + 20) {
      if (dy >= 0) return null;
    }
    if (y <= heightAt(x, z)) {
      let a = prevT;
      let b = t;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2;
        if (oy + dy * m <= heightAt(ox + dx * m, oz + dz * m)) b = m;
        else a = m;
      }
      const hx = ox + dx * b;
      const hz = oz + dz * b;
      if (Math.abs(hx) > HALF || Math.abs(hz) > HALF) return null;
      return [hx, hz];
    }
    prevT = t;
  }
  return null;
}
