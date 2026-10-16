/**
 * PK 1.9.0 (D151): the line art of the heroes' skill effects, drawn by the game in the manner of
 * Khmer yantra (យ័ន្ត) — PK's reference pictures were looked at for the style only (spire fans,
 * round letter yantra, stepped grids, guardian creatures framed by unalom spires and an arc of
 * letters); nothing is copied from them. The letters are the Khmer consonants in alphabet order,
 * never an incantation. Everything is drawn white on clear and tinted by the effect's colour.
 *
 * Pure canvas drawing (no three.js): `drawArt(g, key, size)`.
 */

import { GUARDIANS, YANTRA_KINDS } from '@temples/shared';

export const CONSONANTS = 'កខគឃងចឆជឈញដឋឌឍណតថទធនបផពភមយរលវសហឡអ';
const FONT = `'Kantumruy Pro', 'Noto Sans Khmer', sans-serif`;

export { GUARDIANS, YANTRA_KINDS };
/** The guardian creatures of the heroes (one a kit, `anachak.json` `kits[].guardian`). */
export type Guardian = (typeof GUARDIANS)[number];
/** The yantra layouts (the first three since D106). */
export type YantraKind = (typeof YANTRA_KINDS)[number];
/** Spectral weapons for the rains and wheels. */
export const FX_WEAPONS = ['sword', 'spear', 'arrow'] as const;
export type FxWeapon = (typeof FX_WEAPONS)[number];

export type ArtKey =
  | `yantra:${YantraKind}`
  | `emblem:${Guardian}`
  | `weapon:${FxWeapon}`
  | 'crescent'
  | 'petal'
  | 'streak'
  | 'rows';

/** Tall art (width : height = 1 : 4): the script columns on the pillars of light. */
export const TALL: ReadonlySet<ArtKey> = new Set<ArtKey>(['rows', 'weapon:sword', 'weapon:spear', 'weapon:arrow']);

type G = CanvasRenderingContext2D;

// ── shared strokes ───────────────────────────────────────────────────────────────────────────

/** An unalom: a spiral at the foot, loops climbing, a straight line up to a point. */
export function unalom(g: G, x: number, y: number, h: number): void {
  const s = h / 10;
  g.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.15) {
    const r = s * (1.6 - (a / (Math.PI * 5)) * 1.4);
    const px = x + Math.cos(a) * r;
    const py = y - Math.sin(a) * r;
    if (a === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  let cy = y - s * 2;
  for (let i = 0; i < 3; i++) {
    g.lineTo(x + s * 1.2, cy - s * 0.6);
    g.lineTo(x - s * 1.2, cy - s * 1.2);
    cy -= s * 1.4;
  }
  g.lineTo(x, cy);
  g.lineTo(x, y - h);
  g.stroke();
}

/** A chedi spire (tiered bell, rings, a point) with an unalom loop at its foot. */
function spire(g: G, x: number, base: number, h: number): void {
  const w = h * 0.16;
  g.beginPath();
  // Bell.
  g.moveTo(x - w, base);
  g.quadraticCurveTo(x - w, base - h * 0.3, x, base - h * 0.36);
  g.quadraticCurveTo(x + w, base - h * 0.3, x + w, base);
  g.closePath();
  g.stroke();
  // Rings tapering up.
  let y = base - h * 0.38;
  for (let i = 0; i < 6; i++) {
    const rw = w * (0.7 - i * 0.1);
    g.beginPath();
    g.moveTo(x - rw, y);
    g.lineTo(x + rw, y);
    g.stroke();
    y -= h * 0.06;
  }
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, base - h);
  g.stroke();
  // A dot and loop at the foot.
  g.beginPath();
  g.arc(x, base + h * 0.06, h * 0.035, 0, Math.PI * 2);
  g.stroke();
}

function letter(g: G, ch: string, x: number, y: number, size: number, rot = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 0, 0);
  g.restore();
}

/** Letters round a circle (or an arc from a0 to a1), upright to the centre. */
export function letterArc(
  g: G,
  cx: number,
  cy: number,
  r: number,
  n: number,
  size: number,
  from = 0,
  a0 = -Math.PI / 2,
  a1 = a0 + Math.PI * 2,
): void {
  const full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / (full ? n : Math.max(1, n - 1))) * (a1 - a0);
    letter(g, CONSONANTS[(i + from) % CONSONANTS.length]!, cx + Math.cos(a) * r, cy + Math.sin(a) * r, size, a + Math.PI / 2);
  }
}

function ring(g: G, cx: number, cy: number, r: number): void {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
}

/** A square of letter cells, n × n, centred. */
function letterGrid(g: G, cx: number, cy: number, n: number, cell: number, from = 0): void {
  const x0 = cx - (n * cell) / 2;
  const y0 = cy - (n * cell) / 2;
  let k = from;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      g.strokeRect(x0 + c * cell, y0 + r * cell, cell, cell);
      letter(g, CONSONANTS[k++ % CONSONANTS.length]!, x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell, cell * 0.6);
    }
}

/**
 * The frame round a guardian: five spires over it and an arc of letters under it, as on the
 * creature yantra.
 */
function guardianFrame(g: G, S: number): void {
  const c = S / 2;
  for (let i = 0; i < 5; i++) {
    const x = S * (0.18 + i * 0.16);
    const h = S * (i === 2 ? 0.2 : i === 1 || i === 3 ? 0.16 : 0.13);
    spire(g, x, S * 0.17 + (i === 2 ? 0 : S * 0.02), h);
  }
  letterArc(g, c, S * 0.42, S * 0.47, 19, S * 0.04, 3, Math.PI * 0.16, Math.PI * 0.84);
  letterArc(g, c, S * 0.42, S * 0.54, 15, S * 0.034, 11, Math.PI * 0.24, Math.PI * 0.76);
}

// ── yantra layouts ───────────────────────────────────────────────────────────────────────────

function drawLotus(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 200;
  for (let i = 0; i < 8; i++) {
    g.save();
    g.translate(c, c);
    g.rotate((i / 8) * Math.PI * 2);
    g.beginPath();
    g.moveTo(-S * 0.11, -S * 0.2);
    g.quadraticCurveTo(-S * 0.12, -S * 0.36, 0, -S * 0.44);
    g.quadraticCurveTo(S * 0.12, -S * 0.36, S * 0.11, -S * 0.2);
    g.stroke();
    unalom(g, 0, -S * 0.235, S * 0.15);
    g.beginPath();
    g.arc(0, -S * 0.46, S * 0.012, 0, Math.PI * 2);
    g.moveTo(0, -S * 0.475);
    g.lineTo(0, -S * 0.495);
    g.stroke();
    g.restore();
  }
  ring(g, c, c, S * 0.2);
  ring(g, c, c, S * 0.15);
  letterArc(g, c, c, S * 0.175, 22, S * 0.032);
  g.beginPath();
  g.moveTo(c - S * 0.12, c);
  g.lineTo(c + S * 0.12, c);
  g.moveTo(c, c - S * 0.12);
  g.lineTo(c, c + S * 0.12);
  g.stroke();
  unalom(g, c, c + S * 0.1, S * 0.2);
}

function drawSpiral(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 220;
  let k = 0;
  for (let a = 0.6; a < Math.PI * 9; a += 0.32 - a * 0.006) {
    const r = S * 0.04 + a * S * 0.0115;
    if (r > S * 0.36) break;
    letter(g, CONSONANTS[k++ % CONSONANTS.length]!, c + Math.cos(a) * r, c + Math.sin(a) * r, S * 0.026, a + Math.PI / 2);
  }
  ring(g, c, c, S * 0.38);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * S * 0.39, c + Math.sin(a) * S * 0.39);
    g.lineTo(c + Math.cos(a) * S * 0.46, c + Math.sin(a) * S * 0.46);
    g.stroke();
    if (i % 2 === 0) ring(g, c + Math.cos(a) * S * 0.475, c + Math.sin(a) * S * 0.475, S * 0.009);
  }
  ring(g, c, c, S * 0.03);
}

function drawGrid(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 200;
  const cell = S * 0.07;
  let k = 0;
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4 - row; col++) {
        const x = sx > 0 ? S * 0.06 + col * cell : S * 0.94 - (col + 1) * cell;
        const y = sy > 0 ? S * 0.06 + row * cell : S * 0.94 - (row + 1) * cell;
        g.strokeRect(x, y, cell, cell);
        letter(g, CONSONANTS[k++ % CONSONANTS.length]!, x + cell / 2, y + cell / 2, cell * 0.62);
      }
  }
  ring(g, c, c, S * 0.2);
  ring(g, c, c, S * 0.25);
  letterArc(g, c, c, S * 0.225, 18, S * 0.03, 7);
  unalom(g, c, c + S * 0.14, S * 0.3);
}

/** A fan of nine spires over a cartouche, five arcs of letters under it. */
function drawSpires(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 210;
  for (let i = 0; i < 9; i++) {
    const t = (i - 4) / 4;
    const x = c + t * S * 0.42;
    const h = S * (0.24 - Math.abs(t) * 0.07);
    spire(g, x, S * 0.36 + Math.abs(t) * S * 0.05, h);
  }
  // The cartouche: a rounded box of letters with an unalom over it.
  g.beginPath();
  g.roundRect(c - S * 0.12, S * 0.38, S * 0.24, S * 0.12, S * 0.03);
  g.stroke();
  for (let i = 0; i < 4; i++) letter(g, CONSONANTS[(i * 5) % 33]!, c - S * 0.08 + i * S * 0.053, S * 0.44, S * 0.045);
  for (let r = 0; r < 5; r++)
    letterArc(g, c, S * 0.2, S * (0.36 + r * 0.055), 15 + r * 2, S * 0.032, r * 6, Math.PI * 0.12, Math.PI * 0.88);
}

/** A round yantra: a ring of teeth, a ring of letters, a stepped 5 × 5 grid in the middle. */
function drawMandala(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 220;
  ring(g, c, c, S * 0.48);
  ring(g, c, c, S * 0.41);
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * Math.PI * 2;
    const a1 = ((i + 1) / 36) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a0) * S * 0.41, c + Math.sin(a0) * S * 0.41);
    g.lineTo(c + Math.cos((a0 + a1) / 2) * S * 0.48, c + Math.sin((a0 + a1) / 2) * S * 0.48);
    g.lineTo(c + Math.cos(a1) * S * 0.41, c + Math.sin(a1) * S * 0.41);
    g.stroke();
  }
  ring(g, c, c, S * 0.33);
  letterArc(g, c, c, S * 0.37, 30, S * 0.034, 2);
  letterArc(g, c, c, S * 0.29, 24, S * 0.03, 15);
  ring(g, c, c, S * 0.25);
  letterGrid(g, c, c, 5, S * 0.068, 4);
  // Four small unalom at the grid's corners pointing out.
  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate(c, c);
    g.rotate(Math.PI / 4 + (i * Math.PI) / 2);
    unalom(g, 0, -S * 0.15, S * 0.08);
    g.restore();
  }
}

/** An eight-rayed star: spires with a guardian face near each point, a grid in the middle. */
function drawStar(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 210;
  for (let i = 0; i < 8; i++) {
    g.save();
    g.translate(c, c);
    g.rotate((i / 8) * Math.PI * 2);
    // The ray: a long spire from the grid's edge outward.
    g.beginPath();
    g.moveTo(-S * 0.05, -S * 0.17);
    g.lineTo(0, -S * 0.49);
    g.lineTo(S * 0.05, -S * 0.17);
    g.stroke();
    // A guardian face: a crowned round face with eyes and fangs.
    const fy = -S * 0.3;
    ring(g, 0, fy, S * 0.038);
    g.beginPath();
    g.arc(-S * 0.014, fy - S * 0.008, S * 0.007, 0, Math.PI * 2);
    g.arc(S * 0.014, fy - S * 0.008, S * 0.007, 0, Math.PI * 2);
    g.moveTo(-S * 0.016, fy + S * 0.016);
    g.lineTo(-S * 0.008, fy + S * 0.028);
    g.moveTo(S * 0.016, fy + S * 0.016);
    g.lineTo(S * 0.008, fy + S * 0.028);
    g.moveTo(-S * 0.03, fy - S * 0.03);
    g.lineTo(0, fy - S * 0.075);
    g.lineTo(S * 0.03, fy - S * 0.03);
    g.stroke();
    letter(g, CONSONANTS[(i * 4) % 33]!, 0, -S * 0.21, S * 0.03);
    g.restore();
  }
  g.strokeRect(c - S * 0.15, c - S * 0.15, S * 0.3, S * 0.3);
  letterGrid(g, c, c, 4, S * 0.066, 9);
}

/** The sun: rays and a ring of letter cartouches round a round of letters. */
function drawSun(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 220;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const l = i % 2 ? 0.44 : 0.49;
    g.beginPath();
    g.moveTo(c + Math.cos(a - 0.04) * S * 0.38, c + Math.sin(a - 0.04) * S * 0.38);
    g.lineTo(c + Math.cos(a) * S * l, c + Math.sin(a) * S * l);
    g.lineTo(c + Math.cos(a + 0.04) * S * 0.38, c + Math.sin(a + 0.04) * S * 0.38);
    g.stroke();
  }
  ring(g, c, c, S * 0.37);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(c + Math.cos(a) * S * 0.3, c + Math.sin(a) * S * 0.3);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    g.roundRect(-S * 0.045, -S * 0.025, S * 0.09, S * 0.05, S * 0.015);
    g.stroke();
    letter(g, CONSONANTS[(i * 3) % 33]!, -S * 0.018, 0, S * 0.03);
    letter(g, CONSONANTS[(i * 3 + 1) % 33]!, S * 0.018, 0, S * 0.03);
    g.restore();
  }
  ring(g, c, c, S * 0.23);
  letterArc(g, c, c, S * 0.19, 20, S * 0.032, 5);
  ring(g, c, c, S * 0.15);
  unalom(g, c, c + S * 0.09, S * 0.19);
}

// ── guardians ────────────────────────────────────────────────────────────────────────────────

/** The seven-headed naga (the kings descend from Soma, the naga king's daughter). */
function drawNaga(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 170;
  const hx = c;
  const hy = S * 0.5;
  // The hood: seven heads on an arc, the middle one highest.
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32;
    const r = S * (i === 3 ? 0.2 : 0.17);
    const x = hx + Math.cos(a) * r;
    const y = hy + Math.sin(a) * r;
    // The neck from the hood's root.
    g.beginPath();
    g.moveTo(hx + (i - 3) * S * 0.012, hy + S * 0.05);
    g.quadraticCurveTo(hx + Math.cos(a) * r * 0.5, hy + Math.sin(a) * r * 0.4, x, y + S * 0.03);
    g.stroke();
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2);
    // Head: a pointed oval with a flame crest and an eye.
    const w = S * 0.03;
    const h = S * 0.065;
    g.beginPath();
    g.moveTo(0, -h);
    g.quadraticCurveTo(w * 1.4, -h * 0.3, w * 0.6, h * 0.5);
    g.lineTo(-w * 0.6, h * 0.5);
    g.quadraticCurveTo(-w * 1.4, -h * 0.3, 0, -h);
    g.stroke();
    g.beginPath();
    g.arc(0, -h * 0.2, w * 0.25, 0, Math.PI * 2);
    g.moveTo(-w * 0.5, -h * 0.8);
    g.quadraticCurveTo(-w * 0.9, -h * 1.5, -w * 0.2, -h * 1.7);
    g.moveTo(w * 0.5, -h * 0.8);
    g.quadraticCurveTo(w * 0.9, -h * 1.5, w * 0.2, -h * 1.7);
    g.moveTo(0, -h);
    g.lineTo(0, -h * 1.9);
    g.stroke();
    g.restore();
  }
  // The body: down in an S, coiled at the foot, scales along it.
  g.beginPath();
  g.moveTo(hx - S * 0.04, hy + S * 0.05);
  g.bezierCurveTo(hx - S * 0.1, hy + S * 0.15, hx + S * 0.12, hy + S * 0.18, hx + S * 0.02, hy + S * 0.27);
  g.moveTo(hx + S * 0.04, hy + S * 0.05);
  g.bezierCurveTo(hx - S * 0.04, hy + S * 0.15, hx + S * 0.18, hy + S * 0.17, hx + S * 0.07, hy + S * 0.28);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const y = hy + S * (0.08 + i * 0.03);
    g.beginPath();
    g.arc(hx + S * (0.0 + Math.sin(i * 0.9) * 0.03), y, S * 0.015, 0, Math.PI);
    g.stroke();
  }
  g.beginPath();
  for (let a = 0; a < Math.PI * 4; a += 0.12) {
    const r = S * (0.09 - a * 0.006);
    const x = hx + S * 0.05 + Math.cos(a) * r * 1.6;
    const y = hy + S * 0.33 + Math.sin(a) * r * 0.45;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

/** Garuda: crowned, beaked, wings spread in rows of feathers, a fanned tail. */
function drawGaruda(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 170;
  const cy = S * 0.52;
  // Body and arms raised.
  g.beginPath();
  g.ellipse(c, cy + S * 0.04, S * 0.05, S * 0.09, 0, 0, Math.PI * 2);
  g.stroke();
  // Head with a hooked beak and round eyes.
  ring(g, c, cy - S * 0.1, S * 0.04);
  g.beginPath();
  g.moveTo(c - S * 0.018, cy - S * 0.085);
  g.quadraticCurveTo(c, cy - S * 0.02, c + S * 0.02, cy - S * 0.085);
  g.stroke();
  g.beginPath();
  g.arc(c - S * 0.016, cy - S * 0.11, S * 0.007, 0, Math.PI * 2);
  g.arc(c + S * 0.016, cy - S * 0.11, S * 0.007, 0, Math.PI * 2);
  g.stroke();
  // Crown: a tiered point.
  g.beginPath();
  g.moveTo(c - S * 0.035, cy - S * 0.14);
  g.lineTo(c, cy - S * 0.24);
  g.lineTo(c + S * 0.035, cy - S * 0.14);
  g.moveTo(c - S * 0.025, cy - S * 0.17);
  g.lineTo(c + S * 0.025, cy - S * 0.17);
  g.moveTo(c - S * 0.015, cy - S * 0.2);
  g.lineTo(c + S * 0.015, cy - S * 0.2);
  g.stroke();
  // Wings: three rows of feathers fanned up and out on each side.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      const n = 7 - row;
      const len = S * (0.2 - row * 0.04);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + side * (0.35 + (i / (n - 1)) * 1.3);
        const bx = c + side * S * (0.05 + row * 0.015);
        const by = cy - S * 0.02 + row * S * 0.02;
        const tx = bx + Math.cos(a) * len;
        const ty = by + Math.sin(a) * len;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo((bx + tx) / 2 + side * S * 0.015, (by + ty) / 2 - S * 0.01, tx, ty);
        g.stroke();
      }
    }
    // Arms raised to the crown.
    g.beginPath();
    g.moveTo(c + side * S * 0.045, cy);
    g.lineTo(c + side * S * 0.09, cy - S * 0.07);
    g.lineTo(c + side * S * 0.055, cy - S * 0.15);
    g.stroke();
    // Legs, the knees out.
    g.beginPath();
    g.moveTo(c + side * S * 0.03, cy + S * 0.12);
    g.lineTo(c + side * S * 0.09, cy + S * 0.17);
    g.lineTo(c + side * S * 0.06, cy + S * 0.22);
    g.stroke();
  }
  // Tail fan.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i - 3) * 0.2;
    g.beginPath();
    g.moveTo(c, cy + S * 0.12);
    g.lineTo(c + Math.cos(a) * S * 0.16, cy + S * 0.12 + Math.sin(a) * S * 0.14);
    g.stroke();
  }
}

/** The tiger's face with flame stripes, as on the tiger yantra. */
function drawTiger(g: G, S: number): void {
  const c = S / 2;
  const cy = S * 0.53;
  g.lineWidth = S / 170;
  // Face.
  g.beginPath();
  g.moveTo(c - S * 0.15, cy - S * 0.06);
  g.quadraticCurveTo(c - S * 0.17, cy + S * 0.12, c, cy + S * 0.17);
  g.quadraticCurveTo(c + S * 0.17, cy + S * 0.12, c + S * 0.15, cy - S * 0.06);
  g.quadraticCurveTo(c, cy - S * 0.2, c - S * 0.15, cy - S * 0.06);
  g.stroke();
  // Ears.
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(c + s * S * 0.08, cy - S * 0.13);
    g.lineTo(c + s * S * 0.15, cy - S * 0.21);
    g.lineTo(c + s * S * 0.16, cy - S * 0.08);
    g.stroke();
    // Almond eye.
    g.beginPath();
    g.moveTo(c + s * S * 0.025, cy - S * 0.03);
    g.quadraticCurveTo(c + s * S * 0.06, cy - S * 0.06, c + s * S * 0.095, cy - S * 0.035);
    g.quadraticCurveTo(c + s * S * 0.06, cy - S * 0.005, c + s * S * 0.025, cy - S * 0.03);
    g.stroke();
    ring(g, c + s * S * 0.06, cy - S * 0.033, S * 0.008);
    // Flame stripes on the cheek and brow.
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(c + s * S * 0.15, cy + S * (0.0 + k * 0.035));
      g.quadraticCurveTo(c + s * S * 0.1, cy + S * (0.01 + k * 0.035), c + s * S * 0.08, cy + S * (-0.01 + k * 0.04));
      g.stroke();
    }
    g.beginPath();
    g.moveTo(c + s * S * 0.02, cy - S * 0.15);
    g.quadraticCurveTo(c + s * S * 0.05, cy - S * 0.1, c + s * S * 0.03, cy - S * 0.07);
    g.stroke();
    // Whisker dots and a fang.
    g.beginPath();
    g.arc(c + s * S * 0.05, cy + S * 0.06, S * 0.004, 0, Math.PI * 2);
    g.arc(c + s * S * 0.07, cy + S * 0.075, S * 0.004, 0, Math.PI * 2);
    g.moveTo(c + s * S * 0.025, cy + S * 0.09);
    g.lineTo(c + s * S * 0.018, cy + S * 0.125);
    g.lineTo(c + s * S * 0.01, cy + S * 0.095);
    g.stroke();
  }
  // Nose and mouth.
  g.beginPath();
  g.moveTo(c - S * 0.02, cy + S * 0.03);
  g.lineTo(c + S * 0.02, cy + S * 0.03);
  g.lineTo(c, cy + S * 0.055);
  g.closePath();
  g.moveTo(c, cy + S * 0.055);
  g.lineTo(c, cy + S * 0.075);
  g.moveTo(c - S * 0.045, cy + S * 0.09);
  g.quadraticCurveTo(c, cy + S * 0.11, c + S * 0.045, cy + S * 0.09);
  g.stroke();
  // Flame tongues round the brow and cheeks, curling outward.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (1.0 + i * 0.125);
    const b0 = a - 0.1;
    const b1 = a + 0.1;
    const r0 = S * 0.19;
    const tip = S * (i % 2 ? 0.25 : 0.28);
    g.beginPath();
    g.moveTo(c + Math.cos(b0) * r0, cy + Math.sin(b0) * r0);
    g.quadraticCurveTo(
      c + Math.cos(a - 0.2) * tip * 0.95,
      cy + Math.sin(a - 0.2) * tip * 0.95,
      c + Math.cos(a + 0.12) * tip,
      cy + Math.sin(a + 0.12) * tip,
    );
    g.quadraticCurveTo(c + Math.cos(a + 0.05) * r0 * 1.12, cy + Math.sin(a + 0.05) * r0 * 1.12, c + Math.cos(b1) * r0, cy + Math.sin(b1) * r0);
    g.stroke();
  }
}

/** Three-headed Erawan, the war elephant's guardian: fan ears, curled trunks, tusks, crowns. */
function drawGaja(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 170;
  const head = (x: number, y: number, k: number): void => {
    // Ears.
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + s * S * 0.04 * k, y - S * 0.03 * k);
      g.quadraticCurveTo(x + s * S * 0.13 * k, y - S * 0.06 * k, x + s * S * 0.11 * k, y + S * 0.05 * k);
      g.quadraticCurveTo(x + s * S * 0.08 * k, y + S * 0.08 * k, x + s * S * 0.04 * k, y + S * 0.03 * k);
      g.stroke();
      // Tusk.
      g.beginPath();
      g.moveTo(x + s * S * 0.02 * k, y + S * 0.05 * k);
      g.quadraticCurveTo(x + s * S * 0.07 * k, y + S * 0.1 * k, x + s * S * 0.05 * k, y + S * 0.13 * k);
      g.stroke();
      ring(g, x + s * S * 0.022 * k, y - S * 0.01 * k, S * 0.006 * k);
    }
    // Head dome.
    g.beginPath();
    g.moveTo(x - S * 0.045 * k, y + S * 0.04 * k);
    g.quadraticCurveTo(x - S * 0.05 * k, y - S * 0.07 * k, x, y - S * 0.07 * k);
    g.quadraticCurveTo(x + S * 0.05 * k, y - S * 0.07 * k, x + S * 0.045 * k, y + S * 0.04 * k);
    g.stroke();
    // Trunk curling into a spiral.
    g.beginPath();
    g.moveTo(x - S * 0.012 * k, y + S * 0.04 * k);
    g.quadraticCurveTo(x - S * 0.015 * k, y + S * 0.14 * k, x + S * 0.01 * k, y + S * 0.17 * k);
    g.moveTo(x + S * 0.012 * k, y + S * 0.04 * k);
    g.quadraticCurveTo(x + S * 0.01 * k, y + S * 0.12 * k, x + S * 0.03 * k, y + S * 0.15 * k);
    g.stroke();
    ring(g, x + S * 0.025 * k, y + S * 0.17 * k, S * 0.012 * k);
    // Crown.
    g.beginPath();
    g.moveTo(x - S * 0.03 * k, y - S * 0.07 * k);
    g.lineTo(x, y - S * 0.15 * k);
    g.lineTo(x + S * 0.03 * k, y - S * 0.07 * k);
    g.stroke();
  };
  head(c - S * 0.17, S * 0.55, 0.75);
  head(c + S * 0.17, S * 0.55, 0.75);
  head(c, S * 0.5, 1);
  // Saddle cloth under the heads.
  g.beginPath();
  g.moveTo(c - S * 0.25, S * 0.68);
  g.quadraticCurveTo(c, S * 0.74, c + S * 0.25, S * 0.68);
  g.stroke();
  for (let i = 0; i < 9; i++) ring(g, c - S * 0.2 + i * S * 0.05, S * 0.7 + Math.sin((i / 8) * Math.PI) * S * 0.02, S * 0.008);
}

/** The singha (lion): a round face in a mane of spirals, as the singha yantra are drawn. */
function drawSingha(g: G, S: number): void {
  const c = S / 2;
  const cy = S * 0.52;
  g.lineWidth = S / 170;
  // Mane: two rings of spirals.
  for (const [n, r, s] of [
    [14, 0.19, 0.028],
    [10, 0.135, 0.022],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = c + Math.cos(a) * S * r;
      const y = cy + Math.sin(a) * S * r;
      g.beginPath();
      for (let t = 0; t < Math.PI * 3; t += 0.2) {
        const rr = S * s * (1 - t / (Math.PI * 3.3));
        const px = x + Math.cos(t + a) * rr;
        const py = y + Math.sin(t + a) * rr;
        if (t === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
  }
  // Face: bulging eyes, broad nose, an open mouth with fangs.
  ring(g, c, cy, S * 0.09);
  for (const s of [-1, 1]) {
    ring(g, c + s * S * 0.035, cy - S * 0.025, S * 0.017);
    ring(g, c + s * S * 0.035, cy - S * 0.025, S * 0.006);
    g.beginPath();
    g.moveTo(c + s * S * 0.06, cy - S * 0.055);
    g.quadraticCurveTo(c + s * S * 0.035, cy - S * 0.07, c + s * S * 0.012, cy - S * 0.05);
    g.moveTo(c + s * S * 0.02, cy + S * 0.04);
    g.lineTo(c + s * S * 0.012, cy + S * 0.068);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(c - S * 0.02, cy + S * 0.005);
  g.quadraticCurveTo(c, cy + S * 0.03, c + S * 0.02, cy + S * 0.005);
  g.moveTo(c - S * 0.045, cy + S * 0.035);
  g.quadraticCurveTo(c, cy + S * 0.085, c + S * 0.045, cy + S * 0.035);
  g.stroke();
  // Crown.
  g.beginPath();
  g.moveTo(c - S * 0.05, cy - S * 0.08);
  g.lineTo(c - S * 0.03, cy - S * 0.15);
  g.lineTo(c, cy - S * 0.1);
  g.lineTo(c + S * 0.03, cy - S * 0.15);
  g.lineTo(c + S * 0.05, cy - S * 0.08);
  g.stroke();
}

/** The hamsa (hongsa), the swan of the sky: an S neck, raised wing and flame-plumed tail. */
function drawHongsa(g: G, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 170;
  const bx = c + S * 0.02;
  const by = S * 0.6;
  // Body.
  g.beginPath();
  g.moveTo(bx - S * 0.12, by);
  g.quadraticCurveTo(bx - S * 0.02, by + S * 0.1, bx + S * 0.12, by + S * 0.01);
  g.quadraticCurveTo(bx, by - S * 0.04, bx - S * 0.12, by);
  g.stroke();
  // Neck in an S up to the head, a beak and an eye, a crest flowing back.
  g.beginPath();
  g.moveTo(bx - S * 0.1, by - S * 0.01);
  g.bezierCurveTo(bx - S * 0.2, by - S * 0.1, bx - S * 0.02, by - S * 0.16, bx - S * 0.1, by - S * 0.26);
  g.moveTo(bx - S * 0.07, by - S * 0.02);
  g.bezierCurveTo(bx - S * 0.17, by - S * 0.1, bx + S * 0.01, by - S * 0.16, bx - S * 0.07, by - S * 0.27);
  g.stroke();
  ring(g, bx - S * 0.085, by - S * 0.285, S * 0.025);
  ring(g, bx - S * 0.09, by - S * 0.29, S * 0.005);
  g.beginPath();
  g.moveTo(bx - S * 0.108, by - S * 0.28);
  g.lineTo(bx - S * 0.15, by - S * 0.27);
  g.lineTo(bx - S * 0.106, by - S * 0.268);
  g.moveTo(bx - S * 0.07, by - S * 0.3);
  g.quadraticCurveTo(bx - S * 0.02, by - S * 0.34, bx + S * 0.02, by - S * 0.3);
  g.quadraticCurveTo(bx - S * 0.01, by - S * 0.31, bx + S * 0.04, by - S * 0.26);
  g.stroke();
  // The raised wing: a fan of curved feathers.
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + 0.15 + i * 0.16;
    g.beginPath();
    g.moveTo(bx, by);
    g.quadraticCurveTo(
      bx + Math.cos(a - 0.2) * S * 0.12,
      by + Math.sin(a - 0.2) * S * 0.12,
      bx + Math.cos(a) * S * (0.22 - i * 0.012),
      by + Math.sin(a) * S * (0.22 - i * 0.012),
    );
    g.stroke();
  }
  // Tail plumes curling like flames.
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(bx + S * 0.11, by + S * 0.01);
    g.bezierCurveTo(
      bx + S * 0.2,
      by - S * (0.02 + i * 0.03),
      bx + S * 0.18,
      by + S * (0.06 - i * 0.03),
      bx + S * (0.24 + i * 0.01),
      by - S * (0.05 + i * 0.035),
    );
    g.stroke();
  }
  // Feet on a lotus.
  g.beginPath();
  g.moveTo(bx - S * 0.02, by + S * 0.06);
  g.lineTo(bx - S * 0.03, by + S * 0.12);
  g.moveTo(bx + S * 0.03, by + S * 0.06);
  g.lineTo(bx + S * 0.03, by + S * 0.12);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const x = bx + (i - 2) * S * 0.035;
    g.beginPath();
    g.moveTo(x - S * 0.018, by + S * 0.15);
    g.quadraticCurveTo(x, by + S * 0.1, x + S * 0.018, by + S * 0.15);
    g.stroke();
  }
}

// ── weapons, crescents, petals ───────────────────────────────────────────────────────────────

/** A spectral weapon, point down, on a tall canvas (W = S/4, H = S): filled, a hot core. */
function drawWeapon(g: G, S: number, w: FxWeapon): void {
  const W = S / 4;
  const c = W / 2;
  const glow = g.createLinearGradient(0, 0, W, 0);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.5, 'rgba(255,255,255,1)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.beginPath();
  if (w === 'sword') {
    // Hilt at the top, a straight blade widening a little toward the point (Preah Khan).
    g.rect(c - W * 0.06, S * 0.02, W * 0.12, S * 0.14);
    g.rect(c - W * 0.3, S * 0.16, W * 0.6, S * 0.025);
    g.moveTo(c - W * 0.1, S * 0.185);
    g.lineTo(c - W * 0.16, S * 0.85);
    g.lineTo(c, S * 0.98);
    g.lineTo(c + W * 0.16, S * 0.85);
    g.lineTo(c + W * 0.1, S * 0.185);
  } else if (w === 'spear') {
    // Shaft, a tassel ring and a leaf blade.
    g.rect(c - W * 0.035, S * 0.0, W * 0.07, S * 0.72);
    g.ellipse(c, S * 0.7, W * 0.12, S * 0.02, 0, 0, Math.PI * 2);
    g.moveTo(c, S * 0.72);
    g.quadraticCurveTo(c - W * 0.3, S * 0.82, c, S * 0.99);
    g.quadraticCurveTo(c + W * 0.3, S * 0.82, c, S * 0.72);
  } else {
    // Arrow: fletching at the top, a thin shaft, a barbed head.
    g.moveTo(c, S * 0.04);
    g.lineTo(c - W * 0.22, S * 0.0);
    g.lineTo(c - W * 0.06, S * 0.2);
    g.lineTo(c + W * 0.06, S * 0.2);
    g.lineTo(c + W * 0.22, S * 0.0);
    g.closePath();
    g.rect(c - W * 0.03, S * 0.04, W * 0.06, S * 0.82);
    g.moveTo(c - W * 0.16, S * 0.84);
    g.lineTo(c, S * 0.99);
    g.lineTo(c + W * 0.16, S * 0.84);
  }
  g.fill();
}

/** A crescent of light (a sword or spear wave), its back edge soft. */
function drawCrescent(g: G, S: number): void {
  const c = S / 2;
  const grad = g.createRadialGradient(c, c * 1.5, S * 0.2, c, c * 1.5, S * 0.62);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.92, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(c, c * 1.5, S * 0.62, Math.PI * 1.15, Math.PI * 1.85);
  g.arc(c, c * 1.7, S * 0.5, Math.PI * 1.82, Math.PI * 1.18, true);
  g.closePath();
  g.fill();
  // A line of letters along the edge (the wave carries the yantra's words).
  g.fillStyle = 'rgba(255,255,255,0.9)';
  letterArc(g, c, c * 1.5, S * 0.55, 9, S * 0.045, 4, Math.PI * 1.22, Math.PI * 1.78);
}

/** A lotus petal. */
function drawPetal(g: G, S: number): void {
  const c = S / 2;
  const grad = g.createLinearGradient(0, S, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(c, S * 0.04);
  g.quadraticCurveTo(S * 0.95, S * 0.45, c, S * 0.96);
  g.quadraticCurveTo(S * 0.05, S * 0.45, c, S * 0.04);
  g.fill();
}

/** A streak of light (dashes and the long shot), bright in the middle, soft at the ends. */
function drawStreak(g: G, S: number): void {
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  const side = g.createLinearGradient(0, 0, S, 0);
  side.addColorStop(0, 'rgba(255,255,255,0)');
  side.addColorStop(0.2, 'rgba(255,255,255,1)');
  side.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = side;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
}

/** Five columns of script, an unalom crowning each (the five-line yantra), on a tall canvas. */
function drawRows(g: G, S: number): void {
  const W = S / 4;
  g.lineWidth = W / 60;
  for (let col = 0; col < 3; col++) {
    const x = W * (0.22 + col * 0.28);
    unalom(g, x, S * 0.16, S * 0.14);
    for (let i = 0; i < 18; i++) letter(g, CONSONANTS[(col * 7 + i) % 33]!, x, S * (0.2 + i * 0.044), W * 0.16);
    g.beginPath();
    g.moveTo(x, S * 0.98);
    g.lineTo(x, S * 0.99);
    g.stroke();
  }
}

/** Draw one art onto a canvas of `size` (tall art takes `size` × `size/4` … see `artSize`). */
export function drawArt(g: G, key: ArtKey, size: number): void {
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const [kind, name] = key.split(':') as [string, string | undefined];
  if (kind === 'yantra')
    ({ lotus: drawLotus, spiral: drawSpiral, grid: drawGrid, spires: drawSpires, mandala: drawMandala, star: drawStar, sun: drawSun })[
      name as YantraKind
    ](g, size);
  else if (kind === 'emblem') {
    // The creature drawn large in the middle (its lines kept fine), then the frame round it.
    const k = 1.2;
    const [cx, cy] = [size / 2, size * 0.5];
    g.save();
    g.translate(cx, cy + size * 0.035);
    g.scale(k, k);
    g.translate(-cx, -cy);
    ({ naga: drawNaga, garuda: drawGaruda, tiger: drawTiger, gaja: drawGaja, singha: drawSingha, hongsa: drawHongsa })[
      name as Guardian
    ](g, size);
    g.restore();
    g.lineWidth = size / 170;
    guardianFrame(g, size);
  }
  else if (kind === 'weapon') drawWeapon(g, size, name as FxWeapon);
  else if (key === 'crescent') drawCrescent(g, size);
  else if (key === 'petal') drawPetal(g, size);
  else if (key === 'streak') drawStreak(g, size);
  else drawRows(g, size);
}

/** Canvas width and height for an art at `size`. */
export function artSize(key: ArtKey, size: number): [number, number] {
  return TALL.has(key) ? [size / 4, size] : [size, size];
}
