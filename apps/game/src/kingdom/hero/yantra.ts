import * as THREE from 'three';

/**
 * Yantra light for the heroes' skills (PK: special magic effects in the style of Khmer yantra,
 * យ័ន្ត). Drawn by the game in the yantra manner — fine line art, an eight-petal lotus round a
 * circle, unalom spirals, rings of Khmer letters, rays and corner grids — but original designs,
 * not copies of real yantra: the letters are the Khmer consonants in their alphabet order, not
 * an incantation. Out of respect a yantra is never put under the feet: it shines in the air,
 * as a halo behind the hero or a canopy over the place the skill touches.
 */

export type YantraKind = 'lotus' | 'spiral' | 'grid';

const CONSONANTS = 'កខគឃងចឆជឈញដឋឌឍណតថទធនបផពភមយរលវសហឡអ';

/** An unalom: a spiral at the foot, loops climbing, a straight line up to a point. */
function unalom(g: CanvasRenderingContext2D, x: number, y: number, h: number): void {
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

/** Letters round a circle, upright to the centre. */
function letterRing(
  g: CanvasRenderingContext2D,
  c: number,
  r: number,
  n: number,
  size: number,
  from = 0,
): void {
  g.font = `${size}px 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    g.rotate(a + Math.PI / 2);
    g.fillText(CONSONANTS[(i + from) % CONSONANTS.length]!, 0, 0);
    g.restore();
  }
}

function drawLotus(g: CanvasRenderingContext2D, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 200;
  // Eight petals (pointed arches) round the circle.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save();
    g.translate(c, c);
    g.rotate(a);
    g.beginPath();
    g.moveTo(-S * 0.11, -S * 0.2);
    g.quadraticCurveTo(-S * 0.12, -S * 0.36, 0, -S * 0.44);
    g.quadraticCurveTo(S * 0.12, -S * 0.36, S * 0.11, -S * 0.2);
    g.stroke();
    unalom(g, 0, -S * 0.235, S * 0.15);
    // A spiral and a stroke beyond each petal tip.
    g.beginPath();
    g.arc(0, -S * 0.46, S * 0.012, 0, Math.PI * 2);
    g.moveTo(0, -S * 0.475);
    g.lineTo(0, -S * 0.495);
    g.stroke();
    g.restore();
  }
  g.beginPath();
  g.arc(c, c, S * 0.2, 0, Math.PI * 2);
  g.arc(c, c, S * 0.15, 0, Math.PI * 2);
  g.stroke();
  letterRing(g, c, S * 0.175, 22, S * 0.032);
  // The cross in the middle with an unalom up its centre.
  g.beginPath();
  g.moveTo(c - S * 0.12, c);
  g.lineTo(c + S * 0.12, c);
  g.moveTo(c, c - S * 0.12);
  g.lineTo(c, c + S * 0.12);
  g.stroke();
  unalom(g, c, c + S * 0.1, S * 0.2);
}

function drawSpiral(g: CanvasRenderingContext2D, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 220;
  // Letters along a spiral, as on the round yantra.
  g.font = `${S * 0.026}px 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let k = 0;
  for (let a = 0.6; a < Math.PI * 9; a += 0.32 - a * 0.006) {
    const r = S * 0.04 + a * S * 0.0115;
    if (r > S * 0.36) break;
    g.save();
    g.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
    g.rotate(a + Math.PI / 2);
    g.fillText(CONSONANTS[k++ % CONSONANTS.length]!, 0, 0);
    g.restore();
  }
  g.beginPath();
  g.arc(c, c, S * 0.38, 0, Math.PI * 2);
  g.stroke();
  // Rays with a small loop at each end.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * S * 0.39, c + Math.sin(a) * S * 0.39);
    g.lineTo(c + Math.cos(a) * S * 0.46, c + Math.sin(a) * S * 0.46);
    g.stroke();
    if (i % 2 === 0) {
      g.beginPath();
      g.arc(c + Math.cos(a) * S * 0.475, c + Math.sin(a) * S * 0.475, S * 0.009, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.beginPath();
  g.arc(c, c, S * 0.03, 0, Math.PI * 2);
  g.stroke();
}

function drawGrid(g: CanvasRenderingContext2D, S: number): void {
  const c = S / 2;
  g.lineWidth = S / 200;
  // A stepped square of letter cells in each corner (as on the corner grids), a ring between.
  const cell = S * 0.07;
  g.font = `${cell * 0.62}px 'Kantumruy Pro', 'Noto Sans Khmer', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
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
        g.fillText(CONSONANTS[k++ % CONSONANTS.length]!, x + cell / 2, y + cell / 2);
      }
  }
  g.beginPath();
  g.arc(c, c, S * 0.2, 0, Math.PI * 2);
  g.arc(c, c, S * 0.25, 0, Math.PI * 2);
  g.stroke();
  letterRing(g, c, S * 0.225, 18, S * 0.03, 7);
  unalom(g, c, c + S * 0.14, S * 0.3);
}

const cache = new Map<YantraKind, THREE.CanvasTexture | null>();
/** The yantra drawn white on clear (tinted by the material), or null without a canvas. */
export function yantraTexture(kind: YantraKind, size = 512): THREE.Texture | null {
  if (cache.has(kind)) return cache.get(kind)!;
  if (typeof document === 'undefined') {
    cache.set(kind, null);
    return null;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  if (!g) {
    cache.set(kind, null);
    return null;
  }
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'lotus') drawLotus(g, size);
  else if (kind === 'spiral') drawSpiral(g, size);
  else drawGrid(g, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, t);
  return t;
}

/** Which yantra a skill shows. */
export function yantraFor(skill: string): YantraKind {
  return skill === 'heal' ? 'lotus' : skill === 'volley' || skill === 'dog' ? 'grid' : 'spiral';
}

interface Live {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  size: number;
  spin: number;
  rise: number;
  y0: number;
}

/**
 * Shining yantra: a halo that opens behind the hero (facing the camera) and, for skills that
 * touch an area, a canopy over it; both turn slowly, rise a little and fade.
 */
export class YantraFx {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly live: Live[] = [];

  /** How many yantra shine now (for the tests). */
  get shining(): number {
    return this.live.length;
  }

  /**
   * Open a yantra: `kind`, at (x, y, z); `size` its width (m); `flat` lies it over an area
   * (seen from below and above), else it stands as a halo; `color` its light.
   */
  spawn(kind: YantraKind, x: number, y: number, z: number, size: number, color: number, flat = false): void {
    const mat = new THREE.MeshBasicMaterial({
      map: yantraTexture(kind),
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, y, z);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.live.push({
      mesh,
      mat,
      t: 0,
      dur: flat ? 1.8 : 1.4,
      size,
      spin: flat ? 0.6 : 0.35,
      rise: flat ? 0.3 : 0.6,
      y0: y,
    });
  }

  /** Each frame: halos turn to face the camera; all open, turn, rise and fade. */
  update(dt: number, camera: THREE.Camera): void {
    for (const l of this.live) {
      l.t += dt;
      const k = l.t / l.dur;
      // Open fast, hold, fade.
      const open = Math.min(1, k / 0.18);
      l.mat.opacity = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) * 0.95;
      const s = l.size * (0.55 + 0.45 * (1 - Math.pow(1 - open, 3)));
      l.mesh.scale.set(s, s, s);
      l.mesh.position.y = l.y0 + l.rise * k;
      if (l.mesh.rotation.x !== 0) l.mesh.rotation.z += l.spin * dt;
      else {
        l.mesh.quaternion.copy(camera.quaternion);
        l.mesh.rotateZ(l.t * l.spin);
      }
    }
    for (const l of this.live.filter((x) => x.t >= x.dur)) {
      this.group.remove(l.mesh);
      l.mat.dispose();
    }
    for (let i = this.live.length - 1; i >= 0; i--)
      if (this.live[i]!.t >= this.live[i]!.dur) this.live.splice(i, 1);
  }

  clear(): void {
    for (const l of this.live) {
      this.group.remove(l.mesh);
      l.mat.dispose();
    }
    this.live.length = 0;
  }
}
