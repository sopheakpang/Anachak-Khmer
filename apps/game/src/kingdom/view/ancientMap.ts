import type { MapData, Terrain } from '../sim/map';
import type { KingdomSim } from '../sim/sim';

/**
 * The ancient map (PK: "when I press the minimap an old ancient map style pops up, and I
 * can drag or scroll it"). A large parchment panel over the 1920×1080 stage with the empire
 * drawn in ink: water washes with shore ripples, rows of little mountains, tree glyphs,
 * temple towers, named places (Khmer + English), our buildings and armies, the camera
 * view. Unexplored ground stays blank parchment ("terra incognita").
 *
 * Drawing is split in two: the ink base (terrain wash + glyphs, 2 px per tile) is built
 * once per map and composited with the explored mask once per fog change; each frame only
 * blits that bitmap with the current pan/zoom and draws the small overlay on top.
 *
 * Every text is ≥ 26 stage px (canvas labels too: we scale glyphs, never fonts).
 */

// ------------------------------------------------------------------ data contract

/** What the map needs from the simulation (see mapViewOf for KingdomSim). */
export interface MapView {
  map: MapData;
  fog: { size: number; explored: Uint8Array; visible: Uint8Array };
  /** Bumped whenever the fog changes; the inked base is re-masked then. */
  fogVersion: number;
  units: Iterable<{ x: number; z: number; team: number; type: string }>;
  buildings: Iterable<{ tx: number; tz: number; w: number; d: number; team: number; type: string }>;
  discovered: Set<string>;
  places: Array<{ id: string; km: string; en: string; at: [number, number]; kind: string }>;
  /** Our team (default 0). Other teams are shown only where we see them. */
  player?: number;
  /** River centre lines in tiles (drawn as darker ink over the water wash). */
  rivers?: Array<{ points: Array<[number, number]>; width?: number }>;
  /** Neighbouring realms, lettered faintly near the map edges (always known). */
  neighbours?: Array<{ km: string; en: string; at: [number, number] }>;
  /** Named landscape (ranges, mountains, rivers), lettered once their tile is explored. */
  regions?: Array<{ km: string; en: string; at: [number, number] }>;
}

/** Adapter from the Kingdom simulation (cheap; call it each frame). */
export function mapViewOf(sim: KingdomSim, player = 0): MapView {
  const w = sim.data.world;
  return {
    map: sim.map,
    fog: sim.fog,
    fogVersion: sim.fogVersion,
    units: sim.units.values(),
    buildings: sim.buildings.values(),
    discovered: sim.discovered,
    places: sim.places,
    player,
    rivers: w.rivers,
    neighbours: w.neighbours,
    regions: regionsOf(w),
  };
}

type WorldLike = KingdomSim['data']['world'];
const regionCache = new WeakMap<WorldLike, NonNullable<MapView['regions']>>();
function regionsOf(w: WorldLike): NonNullable<MapView['regions']> {
  let r = regionCache.get(w);
  if (!r) {
    r = [
      ...w.ranges.map((g) => ({
        km: g.km,
        en: g.en,
        at: (g.axis === 'x' ? [(g.from + g.to) / 2, g.line] : [g.line, (g.from + g.to) / 2]) as [
          number,
          number,
        ],
      })),
      ...w.massifs.map((m) => ({ km: m.km, en: m.en, at: m.center })),
      ...w.rivers.map((v) => ({ km: v.km, en: v.en, at: v.points[Math.floor(v.points.length / 2)]! })),
    ];
    regionCache.set(w, r);
  }
  return r;
}

// ------------------------------------------------------------------ pure helpers

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;
/** A press that moves less than this (stage px) is a click, not a drag. */
export const DRAG_PX = 6;
/** Base bitmap resolution (px per tile). */
export const BASE_PX_PER_TILE = 2;

export interface Pan {
  x: number;
  y: number;
}
type MapSize = { size: number; tile: number };

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number.isFinite(z) ? z : ZOOM_MIN));
}

/**
 * Screen (stage px inside the map viewport) → world metres. `pan` is where the map's
 * top-left corner (tile 0,0 corner) is on screen; `fit` is px per tile at zoom 1.
 * World is centred: x = u·tile − size·tile/2 (u = tiles from the corner), as tileToWorld.
 */
export function screenToWorld(
  px: number,
  py: number,
  pan: Pan,
  zoom: number,
  map: MapSize,
  fit = 1,
): [number, number] {
  const k = fit * zoom;
  const half = (map.size * map.tile) / 2;
  return [((px - pan.x) / k) * map.tile - half, ((py - pan.y) / k) * map.tile - half];
}

export function worldToScreen(
  x: number,
  z: number,
  pan: Pan,
  zoom: number,
  map: MapSize,
  fit = 1,
): [number, number] {
  const k = fit * zoom;
  const half = (map.size * map.tile) / 2;
  return [pan.x + ((x + half) / map.tile) * k, pan.y + ((z + half) / map.tile) * k];
}

/** Zoom to `next` (clamped) keeping the point under (cx, cy) still. */
export function zoomAbout(
  pan: Pan,
  zoom: number,
  next: number,
  cx: number,
  cy: number,
): { pan: Pan; zoom: number } {
  const z = clampZoom(next);
  const k = z / zoom;
  return { zoom: z, pan: { x: cx - (cx - pan.x) * k, y: cy - (cy - pan.y) * k } };
}

/** Keep the map in view: an edge of the map may come at most to the viewport's middle. */
export function clampPan(pan: Pan, zoom: number, fit: number, size: number, vw: number, vh: number): Pan {
  const m = size * fit * zoom;
  const cl = (v: number, lo: number, hi: number) => Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));
  return { x: cl(pan.x, vw / 2 - m, vw / 2), y: cl(pan.y, vh / 2 - m, vh / 2) };
}

/** Pan that puts world point (x, z) at the viewport centre. */
export function centreOn(
  x: number,
  z: number,
  zoom: number,
  map: MapSize,
  fit: number,
  vw: number,
  vh: number,
): Pan {
  const [sx, sy] = worldToScreen(x, z, { x: 0, y: 0 }, zoom, map, fit);
  return { x: vw / 2 - sx, y: vh / 2 - sy };
}

/** Has a press moved far enough to be a drag? */
export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= DRAG_PX;
}

export type Glyph = 'waves' | 'mountain' | 'tree' | 'ford' | 'stones' | 'ruin';
export function glyphFor(t: Terrain): Glyph | null {
  switch (t) {
    case 'water':
      return 'waves';
    case 'hill':
      return 'mountain';
    case 'forest':
      return 'tree';
    case 'ford':
      return 'ford';
    case 'rock':
      return 'stones';
    case 'ruin':
      return 'ruin';
    default:
      return null;
  }
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
/** Greedy label placement: keep each box (in priority order) that overlaps none kept. */
export function placeLabels(boxes: Box[]): boolean[] {
  const kept: Box[] = [];
  return boxes.map((b) => {
    if (kept.some((k) => boxesOverlap(k, b))) return false;
    kept.push(b);
    return true;
  });
}

// ------------------------------------------------------------------ look

const INK = '#3b2414';
const INK_SOFT = 'rgba(59,36,20,0.75)';
const PAPER = '#e9d6a8';
const RED = '#a8241a';
const FONT_KM = "'Moulpali', 'Kantumruy Pro', sans-serif";
const FONT_EN = "'Kantumruy Pro', sans-serif";
const KM_PX = 28;
const EN_PX = 26;

/** Deterministic per-tile hash in [0, 1). */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d')!;
}

/** Aged paper: warm radial gradient, grain, stains, burnt edges. Drawn once per panel. */
function drawPaper(g: CanvasRenderingContext2D, w: number, h: number): void {
  const grad = g.createRadialGradient(w * 0.5, h * 0.45, h * 0.1, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.55);
  grad.addColorStop(0, '#f3e4bd');
  grad.addColorStop(0.55, '#e8d2a0');
  grad.addColorStop(1, '#c9a468');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Grain: a small noise tile as a pattern.
  const T = 192;
  const tile = canvas(T, T);
  const tg = ctx2d(tile);
  const img = tg.createImageData(T, T);
  for (let i = 0; i < T * T; i++) {
    const v = hash(i % T, Math.floor(i / T));
    const fibre = hash(Math.floor((i % T) / 7), Math.floor(i / T)) * 0.5;
    img.data[i * 4] = 90;
    img.data[i * 4 + 1] = 60;
    img.data[i * 4 + 2] = 25;
    img.data[i * 4 + 3] = Math.floor(v * v * 34 + fibre * 14);
  }
  tg.putImageData(img, 0, 0);
  g.fillStyle = g.createPattern(tile, 'repeat')!;
  g.fillRect(0, 0, w, h);
  // Stains and foxing.
  for (let i = 0; i < 26; i++) {
    const x = hash(i, 3) * w;
    const y = hash(i, 7) * h;
    const r = 20 + hash(i, 11) * (i < 8 ? 220 : 50);
    const s = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    const a = i < 8 ? 0.09 : 0.14;
    s.addColorStop(0, `rgba(140,95,40,${a * 0.4})`);
    s.addColorStop(0.8, `rgba(140,95,40,${a})`);
    s.addColorStop(1, 'rgba(140,95,40,0)');
    g.fillStyle = s;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Burnt, darkened edges.
  const v = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.42,
    w / 2,
    h / 2,
    Math.hypot(w, h) * 0.56,
  );
  v.addColorStop(0, 'rgba(70,35,10,0)');
  v.addColorStop(0.75, 'rgba(90,45,12,0.28)');
  v.addColorStop(1, 'rgba(45,20,5,0.8)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const e = 26;
  for (const [x0, y0, x1, y1] of [
    [0, 0, e, 0],
    [w, 0, w - e, 0],
    [0, 0, 0, e],
    [0, h, 0, h - e],
  ] as const) {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(50,22,6,0.65)');
    lg.addColorStop(1, 'rgba(50,22,6,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
  }
}

interface Ink {
  size: number;
  /** Inked terrain and glyphs (transparent where plain land). */
  ink: HTMLCanvasElement;
}
const inkCache = new WeakMap<Terrain[], Ink>();

/** The inked terrain at BASE_PX_PER_TILE, once per map (cached across opens). */
function buildInk(map: MapData, rivers: MapView['rivers']): Ink {
  const hit = inkCache.get(map.terrain);
  if (hit) return hit;
  const N = map.size;
  const B = N * BASE_PX_PER_TILE;
  const T = map.terrain;
  const water = (t: Terrain | undefined) => t === 'water';
  // Distance (tiles, ≤ 14) from each water tile to the shore: shore ripples, deep tint.
  const dist = new Uint8Array(N * N).fill(255);
  const q = new Int32Array(N * N);
  let qh = 0;
  let qt = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      if (!water(T[i])) continue;
      if (
        (x > 0 && !water(T[i - 1])) ||
        (x < N - 1 && !water(T[i + 1])) ||
        (z > 0 && !water(T[i - N])) ||
        (z < N - 1 && !water(T[i + N]))
      ) {
        dist[i] = 1;
        q[qt++] = i;
      }
    }
  while (qh < qt) {
    const i = q[qh++]!;
    const d = dist[i]!;
    if (d >= 14) continue;
    const x = i % N;
    for (let n = 0; n < 4; n++) {
      const j = n === 0 ? (x > 0 ? i - 1 : -1) : n === 1 ? (x < N - 1 ? i + 1 : -1) : n === 2 ? i - N : i + N;
      if (j < 0 || j >= N * N || dist[j] !== 255 || !water(T[j])) continue;
      dist[j] = d + 1;
      q[qt++] = j;
    }
  }
  // Wash (1 px per tile, scaled up smoothly).
  const wash = canvas(N, N);
  const wg = ctx2d(wash);
  const img = wg.createImageData(N, N);
  const px = img.data;
  const put = (i: number, r: number, g: number, b: number, a: number) => {
    px[i * 4] = r;
    px[i * 4 + 1] = g;
    px[i * 4 + 2] = b;
    px[i * 4 + 3] = a;
  };
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const t = T[i];
      if (t === 'water') {
        const d = dist[i]!;
        const wob = Math.round(Math.sin(x * 0.21 + z * 0.13) * 0.6);
        if (d === 1) put(i, 70, 88, 92, 200);
        else if (d + wob === 3 || d + wob === 6 || d + wob === 10) put(i, 96, 118, 122, 150);
        else put(i, 150, 172, 170, d > 13 ? 150 : 120);
      } else if (t === 'ford') put(i, 176, 160, 120, 150);
      else {
        // Coast ink: land beside water.
        const shore =
          (x > 0 && water(T[i - 1])) ||
          (x < N - 1 && water(T[i + 1])) ||
          (z > 0 && water(T[i - N])) ||
          (z < N - 1 && water(T[i + N]));
        if (shore) put(i, 58, 40, 24, 200);
        else if (t === 'forest') put(i, 110, 122, 70, 52);
        else if (t === 'hill') put(i, 150, 110, 60, 60);
        else if (t === 'rock') put(i, 120, 105, 85, 70);
        else if (t === 'ruin') put(i, 140, 95, 60, 80);
      }
    }
  wg.putImageData(img, 0, 0);
  const ink = canvas(B, B);
  const g = ctx2d(ink);
  g.imageSmoothingEnabled = true;
  // Softened so shores and moats read as drawn lines, not tile steps.
  g.filter = 'blur(1.2px)';
  g.drawImage(wash, 0, 0, B, B);
  g.filter = 'none';

  const P = BASE_PX_PER_TILE;
  // Rivers: a darker line down the middle.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const r of rivers ?? []) {
    g.strokeStyle = 'rgba(55,78,86,0.55)';
    g.lineWidth = Math.max(2, (r.width ?? 4) * P * 0.35);
    g.beginPath();
    r.points.forEach(([x, z], k) =>
      k ? g.lineTo((x + 0.5) * P, (z + 0.5) * P) : g.moveTo((x + 0.5) * P, (z + 0.5) * P),
    );
    g.stroke();
  }
  // The royal roads (Anachak Khmer, D92): a red-brown double line, bridges as bars.
  if (map.roads) {
    for (const rt of map.roads.routes) {
      const path = () => {
        g.beginPath();
        rt.line.forEach(([x, z], k) =>
          k ? g.lineTo((x + 0.5) * P, (z + 0.5) * P) : g.moveTo((x + 0.5) * P, (z + 0.5) * P),
        );
      };
      g.strokeStyle = 'rgba(120,50,24,0.85)';
      g.lineWidth = Math.max(3, P * 3.2);
      path();
      g.stroke();
      g.strokeStyle = 'rgba(232,196,140,0.95)';
      g.lineWidth = Math.max(1.5, P * 1.4);
      g.setLineDash([P * 6, P * 3]);
      path();
      g.stroke();
      g.setLineDash([]);
    }
    g.fillStyle = 'rgba(120,50,24,0.9)';
    for (const b of map.roads.bridges) {
      const mx = ((b.a[0] + b.b[0]) / 2 + 0.5) * P;
      const mz = ((b.a[1] + b.b[1]) / 2 + 0.5) * P;
      g.fillRect(mx - P * 3, mz - P * 3, P * 6, P * 6);
    }
  }
  const at = (x: number, z: number) => (x >= 0 && z >= 0 && x < N && z < N ? T[z * N + x] : undefined);
  // Glyphs, sampled on a jittered grid; row by row so lower glyphs overlap upper ones.
  const drawRows = (
    step: number,
    kind: Terrain,
    chance: number,
    shape: (fill: Path2D, line: Path2D, x: number, y: number, s: number) => void,
    fill: string,
    lw: number,
  ) => {
    for (let sz = 0; sz < N; sz += step) {
      const fillP = new Path2D();
      const lineP = new Path2D();
      let any = false;
      for (let sx = 0; sx < N; sx += step) {
        const row = Math.floor(sz / step);
        const ox = (row % 2) * step * 0.5;
        const jx = Math.floor(sx + ox + (hash(sx, sz) - 0.5) * step * 0.6);
        const jz = Math.floor(sz + (hash(sz, sx + 7) - 0.5) * step * 0.5);
        if (at(jx, jz) !== kind || hash(jx + 3, jz) > chance) continue;
        any = true;
        shape(fillP, lineP, (jx + 0.5) * P, (jz + 0.5) * P, 0.85 + hash(jx, jz + 9) * 0.4);
      }
      if (!any) continue;
      g.fillStyle = fill;
      g.fill(fillP);
      g.lineWidth = lw;
      g.strokeStyle = INK;
      g.stroke(lineP);
    }
  };
  // Mountains: a peak with shading strokes on the eastern slope.
  drawRows(
    6,
    'hill',
    0.95,
    (f, l, x, y, s) => {
      const w = 7 * s;
      const h = 9 * s;
      f.moveTo(x - w, y);
      f.lineTo(x - 0.8, y - h);
      f.lineTo(x + 0.8, y - h);
      f.lineTo(x + w, y);
      f.closePath();
      l.moveTo(x - w, y);
      l.quadraticCurveTo(x - w * 0.35, y - h * 0.55, x - 0.5, y - h);
      l.quadraticCurveTo(x + w * 0.4, y - h * 0.5, x + w, y);
      for (let k = 1; k <= 3; k++) {
        l.moveTo(x + k * w * 0.18, y - h * (1 - k * 0.18));
        l.lineTo(x + k * w * 0.26, y - h * 0.05);
      }
    },
    '#ecdcb0',
    1.3,
  );
  // Trees: round crowns on short trunks.
  drawRows(
    5,
    'forest',
    0.8,
    (f, l, x, y, s) => {
      const r = 3.2 * s;
      f.moveTo(x + r, y - r * 1.6);
      f.arc(x, y - r * 1.6, r, 0, Math.PI * 2);
      l.moveTo(x + r, y - r * 1.6);
      l.arc(x, y - r * 1.6, r, 0, Math.PI * 2);
      l.moveTo(x, y - r * 0.6);
      l.lineTo(x, y + r * 0.3);
    },
    '#8f9a5c',
    1,
  );
  // Stones: stipple.
  drawRows(
    4,
    'rock',
    0.9,
    (f, _l, x, y, s) => {
      for (let k = 0; k < 3; k++) {
        const dx = (hash(x + k, y) - 0.5) * 6;
        const dy = (hash(y, x + k) - 0.5) * 6;
        f.moveTo(x + dx + 1.2 * s, y + dy);
        f.arc(x + dx, y + dy, 1.2 * s, 0, Math.PI * 2);
      }
    },
    'rgba(59,36,20,0.7)',
    1,
  );
  // Ruins: two broken columns and a lintel.
  drawRows(
    5,
    'ruin',
    0.9,
    (_f, l, x, y, s) => {
      const h = 5 * s;
      l.moveTo(x - 3, y);
      l.lineTo(x - 3, y - h);
      l.moveTo(x + 3, y);
      l.lineTo(x + 3, y - h * 0.6);
      l.moveTo(x - 5, y - h);
      l.lineTo(x + 1, y - h - 1);
    },
    INK,
    1.2,
  );
  // Fords: little stepping stones across the river.
  drawRows(
    3,
    'ford',
    1,
    (f, _l, x, y) => {
      f.moveTo(x + 1.6, y);
      f.arc(x, y, 1.6, 0, Math.PI * 2);
    },
    'rgba(90,65,35,0.8)',
    1,
  );

  const out = { size: N, ink };
  inkCache.set(map.terrain, out);
  return out;
}

/** A prasat: stepped tower with a finial, `s` px tall, base centred at (x, y). */
function templeGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void {
  const w = s * 0.62;
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.lineTo(x + w / 2, y);
  g.lineTo(x + w / 2, y - s * 0.22);
  g.lineTo(x + w * 0.36, y - s * 0.22);
  g.lineTo(x + w * 0.36, y - s * 0.42);
  g.lineTo(x + w * 0.24, y - s * 0.42);
  g.quadraticCurveTo(x + w * 0.24, y - s * 0.8, x, y - s);
  g.quadraticCurveTo(x - w * 0.24, y - s * 0.8, x - w * 0.24, y - s * 0.42);
  g.lineTo(x - w * 0.36, y - s * 0.42);
  g.lineTo(x - w * 0.36, y - s * 0.22);
  g.lineTo(x - w / 2, y - s * 0.22);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.moveTo(x - w * 0.12, y);
  g.lineTo(x - w * 0.12, y - s * 0.14);
  g.lineTo(x + w * 0.12, y - s * 0.14);
  g.lineTo(x + w * 0.12, y);
  g.moveTo(x - w * 0.24, y - s * 0.56);
  g.lineTo(x + w * 0.24, y - s * 0.56);
  g.moveTo(x - w * 0.2, y - s * 0.7);
  g.lineTo(x + w * 0.2, y - s * 0.7);
  g.stroke();
}

// ------------------------------------------------------------------ the panel

const KBACH =
  // A corner kbach flourish: a lotus bud with two curling leaves (drawn for the top-left corner).
  '<path d="M6 6 L70 6 M6 6 L6 70" stroke="currentColor" stroke-width="3" fill="none"/>' +
  '<path d="M14 14 C38 14 46 22 46 34 C46 44 36 46 32 38 C28 30 36 26 40 30" stroke="currentColor" stroke-width="2.4" fill="none"/>' +
  '<path d="M14 14 C14 38 22 46 34 46 C44 46 46 36 38 32 C30 28 26 36 30 40" stroke="currentColor" stroke-width="2.4" fill="none"/>' +
  '<path d="M14 14 C22 18 26 24 24 30 C20 26 16 22 14 14 Z" fill="currentColor"/>' +
  '<circle cx="54" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="54" r="3" fill="currentColor"/>';

const COMPASS =
  '<svg viewBox="-100 -100 200 200" class="am-rose" aria-hidden="true">' +
  '<circle r="78" fill="none" stroke="#3b2414" stroke-width="2"/>' +
  '<circle r="70" fill="none" stroke="#3b2414" stroke-width="1" stroke-dasharray="2 5"/>' +
  '<circle r="22" fill="#e9d6a8" stroke="#3b2414" stroke-width="1.6"/>' +
  [45, 135, 225, 315]
    .map(
      (a) =>
        `<g transform="rotate(${a})"><path d="M0 -58 L9 -9 L0 0 Z" fill="#3b2414"/><path d="M0 -58 L-9 -9 L0 0 Z" fill="#e9d6a8" stroke="#3b2414" stroke-width="1.2"/></g>`,
    )
    .join('') +
  [0, 90, 180, 270]
    .map(
      (a) =>
        `<g transform="rotate(${a})"><path d="M0 -92 L14 -12 L0 0 Z" fill="${a === 0 ? '#a8241a' : '#3b2414'}"/><path d="M0 -92 L-14 -12 L0 0 Z" fill="#f1e2bb" stroke="#3b2414" stroke-width="1.4"/></g>`,
    )
    .join('') +
  '<circle r="5" fill="#a8241a" stroke="#3b2414" stroke-width="1.2"/>' +
  '</svg>';

const ICON = {
  hill: '<svg viewBox="0 0 40 28"><path d="M2 26 L14 6 L26 26 Z M16 26 L27 10 L38 26 Z" fill="#ecdcb0" stroke="#3b2414" stroke-width="2"/><path d="M17 12 L19 24 M20 16 L22 24 M30 16 L31 24" stroke="#3b2414" stroke-width="1.4"/></svg>',
  tree: '<svg viewBox="0 0 40 28"><g fill="#8f9a5c" stroke="#3b2414" stroke-width="1.8"><circle cx="12" cy="11" r="7"/><circle cx="27" cy="13" r="7"/></g><path d="M12 18 V26 M27 20 V26" stroke="#3b2414" stroke-width="2"/></svg>',
  water:
    '<svg viewBox="0 0 40 28"><rect x="1" y="3" width="38" height="22" rx="3" fill="#96aca9"/><path d="M4 10 q4 -4 8 0 t8 0 t8 0 t8 0 M4 18 q4 -4 8 0 t8 0 t8 0 t8 0" stroke="#3b4e56" stroke-width="1.8" fill="none"/></svg>',
  temple:
    '<svg viewBox="0 0 40 30"><path d="M11 29 H29 V23 H25 V17 H24 Q24 7 20 2 Q16 7 16 17 H15 V23 H11 Z" fill="#d8a94f" stroke="#3b2414" stroke-width="1.8"/></svg>',
  ours: '<svg viewBox="0 0 40 28"><rect x="5" y="7" width="13" height="13" fill="#a8241a" stroke="#3b2414" stroke-width="1.6"/><circle cx="28" cy="10" r="3.4" fill="#1f2a44"/><circle cx="33" cy="18" r="3.4" fill="#1f2a44"/></svg>',
  foe: '<svg viewBox="0 0 40 28"><rect x="5" y="7" width="13" height="13" fill="none" stroke="#3b2414" stroke-width="2"/><path d="M5 7 L18 20 M18 7 L5 20" stroke="#3b2414" stroke-width="1.4"/><circle cx="28" cy="10" r="3.4" fill="#c0301f"/><circle cx="33" cy="18" r="3.4" fill="#c0301f"/></svg>',
};

export interface AncientMapOptions {
  onGo(x: number, z: number): void;
  onSend(x: number, z: number): void;
  onClose(): void;
}

type View = { x: number; z: number; w: number; h: number } | null;

export class AncientMap {
  private readonly el: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly paper: HTMLCanvasElement;
  private readonly cv: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private paperDrawn = false;
  /** Viewport size (stage px) and backing resolution. */
  private vw = 1;
  private vh = 1;
  private res = 1;
  private fit = 1;
  private zoom = 1;
  private pan: Pan = { x: 0, y: 0 };
  private sim: MapView | null = null;
  private view: View = null;
  /** Explored-masked base (ink + terra incognita), rebuilt when the fog changes. */
  private base: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private tint: HTMLCanvasElement | null = null;
  private mip: HTMLCanvasElement | null = null;
  private baseKey = '';
  private baseFog = -1;
  private baseExplored = -1;
  private baseAt = 0;
  private press: { id: number; x: number; y: number; px: number; py: number; drag: boolean } | null = null;
  private mark: { x: number; z: number; t: number } | null = null;
  private readonly labelW = new Map<string, number>();
  private open_ = false;
  /** Last timings (ms) of the costly steps, for the dev page and budget checks. */
  readonly timings = { open: 0, layout: 0, paper: 0, ink: 0, fog: 0 };

  constructor(
    root: HTMLElement,
    private readonly opts: AncientMapOptions,
  ) {
    const el = document.createElement('div');
    el.className = 'am-backdrop';
    el.hidden = true;
    el.setAttribute('data-act-free', '');
    const corners = ['tl', 'tr', 'bl', 'br']
      .map((c) => `<svg class="am-corner am-${c}" viewBox="0 0 76 76" aria-hidden="true">${KBACH}</svg>`)
      .join('');
    const legend = (
      [
        ['hill', 'ភ្នំ', 'Hills'],
        ['tree', 'ព្រៃ', 'Forest'],
        ['water', 'ទឹក', 'Water'],
        ['temple', 'ប្រាសាទ', 'Temple'],
        ['ours', 'យើង', 'Ours'],
        ['foe', 'សត្រូវ', 'Enemy'],
      ] as const
    )
      .map(
        ([i, km, en]) =>
          `<div class="am-leg-row" data-ui>${ICON[i]}<span class="am-km">${km}</span><span class="am-en">${en}</span></div>`,
      )
      .join('');
    el.innerHTML =
      `<div class="am-panel" role="dialog" aria-label="Map of the Empire">` +
      `<canvas class="am-paper"></canvas>` +
      `<div class="am-frame"></div>${corners}` +
      `<div class="am-title" data-ui><span class="am-km">ផែនទីចក្រភព</span><span class="am-dot">·</span><span class="am-en">Map of the Empire</span></div>` +
      `<button class="am-close" type="button" data-act-free data-ui aria-label="Close">✕</button>` +
      `<div class="am-viewport"><canvas class="am-map"></canvas></div>` +
      `<div class="am-legend">${legend}</div>` +
      `<div class="am-compass">${COMPASS}` +
      `<span class="am-n" data-ui>ជើង</span><span class="am-s" data-ui>ត្បូង</span><span class="am-e" data-ui>កើត</span><span class="am-w" data-ui>លិច</span></div>` +
      `<div class="am-hint" data-ui><b>ចុច</b> Click: go · <b>ចុចស្ដាំ</b> Right-click: send army · <b>អូស</b> Drag · <b>កង់</b> Wheel: zoom</div>` +
      `</div>`;
    root.append(el);
    this.el = el;
    this.panel = el.querySelector<HTMLDivElement>('.am-panel')!;
    this.paper = el.querySelector<HTMLCanvasElement>('.am-paper')!;
    this.cv = el.querySelector<HTMLCanvasElement>('.am-map')!;
    this.g = ctx2d(this.cv);

    el.querySelector('.am-close')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });
    // Clicks on the dim backdrop (outside the parchment) close too.
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target === el) this.dismiss();
    });
    for (const t of ['click', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'dblclick'])
      el.addEventListener(t, (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.cv.addEventListener('pointerdown', (e) => this.onDown(e));
    this.cv.addEventListener('pointermove', (e) => this.onMove(e));
    this.cv.addEventListener('pointerup', (e) => this.onUp(e));
    this.cv.addEventListener('pointercancel', () => (this.press = null));
  }

  get isOpen(): boolean {
    return this.open_;
  }

  /** Show the map (whole empire; zoomed on `focus`, world metres, when given). */
  open(sim: MapView, focus?: { x: number; z: number }): void {
    this.sim = sim;
    this.el.hidden = false;
    this.open_ = true;
    window.addEventListener('keydown', this.onKey, true);
    const t0 = performance.now();
    this.measure();
    this.timings.layout = performance.now() - t0;
    if (!this.paperDrawn) {
      const pw = this.panel.offsetWidth;
      const ph = this.panel.offsetHeight;
      this.paper.width = Math.round(pw * this.res);
      this.paper.height = Math.round(ph * this.res);
      const pg = ctx2d(this.paper);
      pg.scale(this.res, this.res);
      const t = performance.now();
      drawPaper(pg, pw, ph);
      this.timings.paper = performance.now() - t;
      this.paperDrawn = true;
    }
    const m = sim.map;
    this.fit = Math.min(this.vw, this.vh) / m.size;
    if (focus) {
      this.zoom = 2;
      this.pan = centreOn(focus.x, focus.z, this.zoom, m, this.fit, this.vw, this.vh);
    } else {
      this.zoom = 1;
      this.pan = centreOn(0, 0, 1, m, this.fit, this.vw, this.vh);
    }
    this.pan = clampPan(this.pan, this.zoom, this.fit, m.size, this.vw, this.vh);
    this.baseAt = 0; // a changed fog is re-masked now, not after the 1 s throttle
    this.draw();
    this.timings.open = performance.now() - t0;
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.el.hidden = true;
    this.press = null;
    window.removeEventListener('keydown', this.onKey, true);
  }

  /** Per frame while open: refresh the data (fog, units, camera view) and redraw. */
  render(sim: MapView, view: View): void {
    if (!this.open_) return;
    this.sim = sim;
    this.view = view;
    this.draw();
  }

  /**
   * Build the costly layers ahead of time (ink once per map, fog mask) without showing
   * anything, e.g. when the Kingdom tab loads, so the first open is instant.
   */
  prepare(sim: MapView): void {
    this.sim = sim;
    this.ensureBase(sim);
  }

  /** Remove the panel from the DOM. */
  destroy(): void {
    this.close();
    this.el.remove();
  }

  // ---------------------------------------------------------------- input

  private dismiss(): void {
    this.close();
    this.opts.onClose();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.dismiss();
  };

  /** Pointer position in stage px inside the viewport (the stage may be CSS-scaled). */
  private local(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.cv.getBoundingClientRect();
    const sx = r.width ? this.vw / r.width : 1;
    const sy = r.height ? this.vh / r.height : 1;
    return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy];
  }

  private worldAt(px: number, py: number): [number, number] | null {
    if (!this.sim) return null;
    const m = this.sim.map;
    const [x, z] = screenToWorld(px, py, this.pan, this.zoom, m, this.fit);
    const half = (m.size * m.tile) / 2;
    if (x < -half || z < -half || x >= half || z >= half) return null;
    return [x, z];
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    const [x, y] = this.local(e);
    if (e.button === 2) {
      const w = this.worldAt(x, y);
      if (w) {
        this.mark = { x: w[0], z: w[1], t: performance.now() };
        this.opts.onSend(w[0], w[1]);
        this.draw();
      }
      return;
    }
    if (e.button !== 0) return;
    this.press = { id: e.pointerId, x, y, px: this.pan.x, py: this.pan.y, drag: false };
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    this.cv.classList.add('grabbing');
  }

  private onMove(e: PointerEvent): void {
    const p = this.press;
    if (!p || p.id !== e.pointerId || !this.sim) return;
    const [x, y] = this.local(e);
    if (!p.drag && isDrag(x - p.x, y - p.y)) p.drag = true;
    if (!p.drag) return;
    this.pan = clampPan(
      { x: p.px + x - p.x, y: p.py + y - p.y },
      this.zoom,
      this.fit,
      this.sim.map.size,
      this.vw,
      this.vh,
    );
    this.draw();
  }

  private onUp(e: PointerEvent): void {
    const p = this.press;
    this.cv.classList.remove('grabbing');
    if (!p || p.id !== e.pointerId) return;
    this.press = null;
    if (p.drag || e.button !== 0) return;
    const [x, y] = this.local(e);
    const w = this.worldAt(x, y);
    if (!w) return;
    this.opts.onGo(w[0], w[1]);
    this.dismiss();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (!this.sim) return;
    const [x, y] = this.local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const next = zoomAbout(this.pan, this.zoom, this.zoom * Math.exp(-dy * 0.0016), x, y);
    this.zoom = next.zoom;
    this.pan = clampPan(next.pan, this.zoom, this.fit, this.sim.map.size, this.vw, this.vh);
    this.draw();
  }

  // ---------------------------------------------------------------- drawing

  private measure(): void {
    const vp = this.cv.parentElement!;
    this.vw = vp.offsetWidth || 1;
    this.vh = vp.offsetHeight || 1;
    const r = vp.getBoundingClientRect();
    const css = r.width ? r.width / this.vw : 1;
    this.res = Math.max(1, Math.min(2, css * (window.devicePixelRatio || 1)));
    this.cv.width = Math.round(this.vw * this.res);
    this.cv.height = Math.round(this.vh * this.res);
  }

  /** Re-mask the ink with the explored fog (only when the fog changed, ≤ 1 per second). */
  private ensureBase(sim: MapView): void {
    const m = sim.map;
    const key = `${m.seed}|${m.size}`;
    const now = performance.now();
    if (this.base && key === this.baseKey && sim.fogVersion === this.baseFog) return;
    if (this.base && key === this.baseKey && now - this.baseAt < 1000) return;
    const t0 = performance.now();
    const ink = buildInk(m, sim.rivers);
    this.timings.ink = performance.now() - t0;
    const N = m.size;
    const B = N * BASE_PX_PER_TILE;
    const ex = sim.fog.explored;
    const F = sim.fog.size;
    let count = 0;
    for (let i = 0; i < ex.length; i++) count += ex[i]!;
    this.baseFog = sim.fogVersion;
    this.baseAt = now;
    if (this.base && key === this.baseKey && count === this.baseExplored) return;
    const t1 = performance.now();
    this.baseExplored = count;
    this.baseKey = key;
    // Explored mask and the terra-incognita tint, 1 px per fog cell (scaled up smoothly,
    // which also softens the edge of the known world).
    if (!this.mask || this.mask.width !== F) {
      this.mask = canvas(F, F);
      this.tint = canvas(F, F);
    }
    const mg = ctx2d(this.mask);
    const tg = ctx2d(this.tint!);
    const mi = mg.createImageData(F, F);
    const ti = tg.createImageData(F, F);
    const md = mi.data;
    const td = ti.data;
    for (let z = 0, i = 0; z < F; z++)
      for (let x = 0; x < F; x++, i++) {
        const o = i * 4;
        if (ex[i]) {
          md[o + 3] = 255;
          continue;
        }
        const hatch = (x + z) % 6 === 0;
        td[o] = hatch ? 150 : 214;
        td[o + 1] = hatch ? 115 : 190;
        td[o + 2] = hatch ? 70 : 140;
        td[o + 3] = hatch ? 95 : 120;
      }
    mg.putImageData(mi, 0, 0);
    tg.putImageData(ti, 0, 0);

    const base = this.base && this.base.width === B ? this.base : canvas(B, B);
    const g = ctx2d(base);
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'copy';
    g.drawImage(ink.ink, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.mask, 0, 0, B, B);
    // Rhumb lines (portolan style), faint, under everything.
    g.globalCompositeOperation = 'destination-over';
    g.strokeStyle = 'rgba(120,70,30,0.13)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      g.moveTo(B / 2, B / 2);
      g.lineTo(B / 2 + Math.cos(a) * B, B / 2 + Math.sin(a) * B);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.tint!, 0, 0, B, B);
    // Half-size copy for the zoomed-out views (a cheap blit instead of a 3× downscale).
    const H = B / 2;
    if (!this.mip || this.mip.width !== H) this.mip = canvas(H, H);
    const hg = ctx2d(this.mip);
    hg.imageSmoothingQuality = 'high';
    hg.globalCompositeOperation = 'copy';
    hg.drawImage(base, 0, 0, H, H);
    this.timings.fog = performance.now() - t1;
    this.base = base;
  }

  private draw(): void {
    const sim = this.sim;
    if (!sim || !this.open_) return;
    this.ensureBase(sim);
    const g = this.g;
    const m = sim.map;
    const N = m.size;
    const k = this.fit * this.zoom; // px per tile
    const S = N * k;
    const { x: ox, y: oy } = this.pan;
    g.setTransform(this.res, 0, 0, this.res, 0, 0);
    g.clearRect(0, 0, this.vw, this.vh);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'medium';
    const src = k <= BASE_PX_PER_TILE / 2 + 0.25 ? this.mip : this.base;
    if (src) g.drawImage(src, ox, oy, S, S);
    // Neat line: double ink frame around the map sheet.
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(ox - 6, oy - 6, S + 12, S + 12);
    g.lineWidth = 1;
    g.strokeRect(ox - 1, oy - 1, S + 2, S + 2);

    const T = (tx: number, tz: number): [number, number] => [ox + tx * k, oy + tz * k];
    const explored = (tx: number, tz: number) => {
      const f = sim.fog;
      const x = Math.floor(tx);
      const z = Math.floor(tz);
      return x >= 0 && z >= 0 && x < f.size && z < f.size && f.explored[z * f.size + x] === 1;
    };
    const onScreen = (x: number, y: number, pad: number) =>
      x > -pad && y > -pad && x < this.vw + pad && y < this.vh + pad;

    // Temple sites (campaign), sized with zoom but never tiny.
    for (const s of m.sites) {
      const cx = s.tx + s.w / 2;
      const cz = s.tz + s.d / 2;
      if (!explored(cx, cz)) continue;
      const [x, y] = T(cx, cz);
      const size = Math.max(16, Math.min(46, Math.max(s.w, s.d) * k * 1.1));
      if (onScreen(x, y, size)) templeGlyph(g, x, y + size * 0.4, size, '#d8a94f');
    }
    const player = sim.player ?? 0;
    // Buildings: ours red squares; others (where explored) hatched ink squares.
    const ours = new Path2D();
    const theirs = new Path2D();
    for (const b of sim.buildings) {
      const mine = b.team === player;
      if (!mine && !explored(b.tx, b.tz)) continue;
      const bw = Math.max(5, b.w * k);
      const bd = Math.max(5, b.d * k);
      const [x, y] = T(b.tx + b.w / 2, b.tz + b.d / 2);
      if (!onScreen(x, y, bw)) continue;
      (mine ? ours : theirs).rect(x - bw / 2, y - bd / 2, bw, bd);
    }
    g.lineWidth = 1.2;
    g.strokeStyle = INK;
    g.fillStyle = RED;
    g.fill(ours);
    g.stroke(ours);
    g.fillStyle = 'rgba(59,36,20,0.35)';
    g.fill(theirs);
    g.stroke(theirs);
    // Units: ours blue-black ink dots, enemies red (only where seen now).
    const half = (N * m.tile) / 2;
    const uOurs = new Path2D();
    const uFoe = new Path2D();
    const f = sim.fog;
    const ur = Math.max(2.2, Math.min(4.5, k * 1.2));
    for (const u of sim.units) {
      const tx = (u.x + half) / m.tile;
      const tz = (u.z + half) / m.tile;
      const mine = u.team === player;
      if (!mine) {
        const i = Math.floor(tz) * f.size + Math.floor(tx);
        if (!f.visible[i]) continue;
      }
      const [x, y] = T(tx, tz);
      if (!onScreen(x, y, 5)) continue;
      const p = mine ? uOurs : uFoe;
      p.moveTo(x + ur, y);
      p.arc(x, y, ur, 0, Math.PI * 2);
    }
    g.fillStyle = '#1f2a44';
    g.fill(uOurs);
    g.fillStyle = '#c0301f';
    g.fill(uFoe);

    // Labels: capital, then discovered places, then regions and realms, never overlapping.
    type Label = { km: string; en: string; x: number; y: number; kind: string; dot: boolean };
    const labels: Label[] = [];
    const [sx0, sz0] = m.start;
    if (explored(sx0, sz0)) {
      const [x, y] = T(sx0 + 0.5, sz0 + 0.5);
      labels.push({ km: 'អង្គរ', en: 'Angkor', x, y, kind: 'capital', dot: true });
    }
    const order: Record<string, number> = { temple: 0, town: 1, port: 1 };
    const places = sim.places
      .filter((p) => sim.discovered.has(p.id))
      .sort((a, b) => (order[a.kind] ?? 2) - (order[b.kind] ?? 2));
    for (const p of places) {
      const [x, y] = T(p.at[0] + 0.5, p.at[1] + 0.5);
      labels.push({ km: p.km, en: p.en, x, y, kind: p.kind, dot: true });
    }
    for (const r of sim.regions ?? []) {
      if (!explored(r.at[0], r.at[1])) continue;
      const [x, y] = T(r.at[0], r.at[1]);
      labels.push({ km: r.km, en: r.en, x, y, kind: 'region', dot: false });
    }
    for (const n of sim.neighbours ?? []) {
      const [x, y] = T(n.at[0], n.at[1]);
      labels.push({ km: n.km, en: n.en, x, y, kind: 'realm', dot: false });
    }
    const width = (text: string, font: string) => {
      const key = font + text;
      let w = this.labelW.get(key);
      if (w === undefined) {
        g.font = font;
        w = g.measureText(text).width;
        this.labelW.set(key, w);
      }
      return w;
    };
    const fKm = `${KM_PX}px ${FONT_KM}`;
    const fEn = `${EN_PX}px ${FONT_EN}`;
    const LH = KM_PX * 1.45;
    const boxes: Box[] = [];
    const pos: Array<{ tx: number; ty: number; align: CanvasTextAlign }> = [];
    for (const l of labels) {
      const w = Math.max(width(l.km, fKm), width(l.en, fEn)) + 8;
      const h = LH + EN_PX * 1.25;
      let tx: number;
      let align: CanvasTextAlign;
      if (!l.dot) {
        // Centred on the point, kept inside the map sheet.
        tx = Math.max(ox + w / 2 + 8, Math.min(ox + S - w / 2 - 8, l.x));
        align = 'center';
        const ty = Math.max(oy + 8, Math.min(oy + S - h - 8, l.y - h / 2));
        boxes.push({ x: tx - w / 2, y: ty, w, h });
        pos.push({ tx, ty, align });
        continue;
      }
      const right = l.x + 12 + w < Math.min(this.vw, ox + S);
      tx = right ? l.x + 12 : l.x - 12;
      align = right ? 'left' : 'right';
      const ty = l.y - h / 2;
      boxes.push({ x: right ? tx : tx - w, y: ty, w, h });
      pos.push({ tx, ty, align });
    }
    const keep = placeLabels(boxes);
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    labels.forEach((l, i) => {
      if (!keep[i]) return;
      const b = boxes[i]!;
      if (!onScreen(b.x + b.w / 2, b.y + b.h / 2, b.w)) return;
      const { tx, ty, align } = pos[i]!;
      if (l.dot) {
        g.beginPath();
        g.arc(l.x, l.y, l.kind === 'capital' ? 7 : 5, 0, Math.PI * 2);
        g.fillStyle = l.kind === 'capital' ? RED : INK;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = PAPER;
        g.stroke();
        if (l.kind === 'capital') {
          g.beginPath();
          g.arc(l.x, l.y, 11, 0, Math.PI * 2);
          g.lineWidth = 1.5;
          g.strokeStyle = INK;
          g.stroke();
        }
      }
      const faint = l.kind === 'realm' || l.kind === 'region';
      g.textAlign = align;
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(236,220,178,0.85)';
      g.font = fKm;
      g.fillStyle = l.kind === 'realm' ? 'rgba(110,50,25,0.75)' : faint ? INK_SOFT : INK;
      g.strokeText(l.km, tx, ty);
      g.fillText(l.km, tx, ty);
      g.font = fEn;
      g.fillStyle = faint ? 'rgba(90,58,28,0.7)' : '#5a3a1c';
      g.strokeText(l.en, tx, ty + LH);
      g.fillText(l.en, tx, ty + LH);
    });

    // The camera view.
    const v = this.view;
    if (v) {
      const [x0, y0] = worldToScreen(v.x - v.w / 2, v.z - v.h / 2, this.pan, this.zoom, m, this.fit);
      const [x1, y1] = worldToScreen(v.x + v.w / 2, v.z + v.h / 2, this.pan, this.zoom, m, this.fit);
      g.setLineDash([8, 6]);
      g.lineWidth = 2.5;
      g.strokeStyle = RED;
      g.strokeRect(x0, y0, Math.max(4, x1 - x0), Math.max(4, y1 - y0));
      g.setLineDash([]);
    }
    // Where the army was just sent: a red cross that fades.
    const mk = this.mark;
    if (mk) {
      const age = (performance.now() - mk.t) / 1200;
      if (age >= 1) this.mark = null;
      else {
        const [x, y] = worldToScreen(mk.x, mk.z, this.pan, this.zoom, m, this.fit);
        g.globalAlpha = 1 - age;
        g.strokeStyle = RED;
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(x - 10, y - 10);
        g.lineTo(x + 10, y + 10);
        g.moveTo(x + 10, y - 10);
        g.lineTo(x - 10, y + 10);
        g.stroke();
        g.beginPath();
        g.arc(x, y, 14 + age * 12, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
}
