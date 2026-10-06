import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part, place } from '../../engine/figures';

/**
 * Anachak Khmer's royal hall (PK's reference image): a brick terrace with carved wooden
 * balustrades and a broad front stair; the hall raised on dark posts above it, with plank walls,
 * shuttered windows and a carved door; a stacked, steep gabled roof of dark tiles with carved
 * gable boards and curling chovea finials at every peak and eave end. The form follows later
 * Khmer wooden architecture (the Angkorian palace was also wood on a laterite terrace with
 * tiled roofs, Zhou Daguan; its exact form is lost: GAMEPLAY_ABSTRACTION). Same 9.4 m footprint.
 */

const BRICK = 0xa8483a;
const BRICK_TOP = 0xc06048;
const WOOD = 0x9a5a30;
const WOOD_DARK = 0x5a3220;
const POST = 0x2e2420;
const TILE = 0x4a3e3a;
const TRIM = 0xc8742e;
const GOLD = 0xe0b040;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n);

/** A curling chovea finial: a tapering horn that sweeps up and out. */
function chovea(p: THREE.BufferGeometry[], x: number, y: number, z: number, out: number, ry = 0): void {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(out * 0.25, 0.45, 0),
    new THREE.Vector3(out * 0.05, 0.95, 0),
  );
  const g = new THREE.TubeGeometry(curve, 6, 0.06, 5, false);
  // Taper toward the tip.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / 0.95));
    const k = 1 - t * 0.75;
    const cx = curve.getPoint(t).x;
    pos.setX(i, cx + (pos.getX(i) - cx) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  p.push(part(place(g, [x, y, z], [0, ry, 0]), TRIM));
}

/** A gabled roof along x: two tiled slopes, a ridge, carved gable boards and finials. */
function gable(
  p: THREE.BufferGeometry[],
  w: number,
  d: number,
  h: number,
  y: number,
  z: number,
  ry = 0,
): void {
  const slope = Math.hypot(d / 2, h);
  const a = Math.atan2(h, d / 2);
  const g: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    g.push(part(place(box(w, 0.12, slope + 0.5), [0, y + h / 2, z + (s * d) / 4], [s * a, 0, 0]), TILE));
    // Eave trim along the bottom edge.
    g.push(part(place(box(w + 0.1, 0.1, 0.12), [0, y - 0.05, z + s * (d / 2 + 0.2)]), TRIM));
  }
  g.push(part(place(box(w + 0.2, 0.14, 0.18), [0, y + h + 0.05, z]), TRIM)); // ridge
  // Gable ends: a carved triangular board with a gold sun-panel, and the finials.
  for (const e of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2, 0);
    tri.lineTo(d / 2, 0);
    tri.lineTo(0, h);
    tri.closePath();
    const board = new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false });
    board.rotateY(Math.PI / 2);
    g.push(part(place(board, [e * (w / 2) - 0.04, y, z]), WOOD));
    const sun = new THREE.CircleGeometry(h * 0.28, 10);
    sun.rotateY((e * Math.PI) / 2);
    g.push(part(place(sun, [e * (w / 2 + 0.06), y + h * 0.35, z]), GOLD));
    // Bargeboards (the naga edging up the gable), then the chovea at the peak and both eaves.
    for (const s of [-1, 1])
      g.push(
        part(
          place(
            box(0.12, 0.16, slope + 0.4),
            [e * (w / 2 + 0.08), y + h / 2, z + (s * d) / 4],
            [s * a, 0, 0],
          ),
          TRIM,
        ),
      );
    const tmp: THREE.BufferGeometry[] = [];
    chovea(tmp, e * (w / 2 + 0.08), y + h + 0.05, z, e * 0.6);
    for (const s of [-1, 1]) chovea(tmp, e * (w / 2 + 0.08), y - 0.05, z + s * (d / 2 + 0.15), e * 0.45);
    g.push(...tmp);
  }
  const merged = mergeGeometries(g)!;
  if (ry) merged.rotateY(ry);
  p.push(merged);
}

/** A run of carved balustrade: rail, balusters and capped posts. */
function balustrade(
  p: THREE.BufferGeometry[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  p.push(part(place(box(0.12, 0.08, len), [mx, y + 0.72, mz], [0, ry, 0]), WOOD_DARK));
  p.push(part(place(box(0.1, 0.06, len), [mx, y + 0.12, mz], [0, ry, 0]), WOOD_DARK));
  const n = Math.max(2, Math.round(len / 0.32));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    if (i % 4 === 0) {
      p.push(part(place(box(0.18, 0.95, 0.18), [x, y + 0.47, z]), WOOD));
      p.push(part(place(new THREE.ConeGeometry(0.11, 0.3, 4), [x, y + 1.08, z]), TRIM));
    } else p.push(part(place(cyl(0.035, 0.05, 0.58, 5), [x, y + 0.42, z]), WOOD));
  }
}

export function anachakHallGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const T = 1.1; // terrace height
  // The brick terrace, its coping and a carved band.
  p.push(part(place(box(9.4, T, 8.0), [0, T / 2, -0.7]), BRICK));
  p.push(part(place(box(9.6, 0.12, 8.2), [0, T + 0.06, -0.7]), BRICK_TOP));
  p.push(part(place(box(9.45, 0.18, 8.05), [0, T * 0.55, -0.7]), 0x8a3a2e));
  // The broad front stair down to the court (brick sides, wooden treads).
  for (let i = 0; i < 5; i++)
    p.push(
      part(
        place(box(3.2, T / 5, 0.32), [0, (T / 5) * (i + 0.5), 3.3 + (4 - i) * 0.3]),
        i % 2 ? 0x9a5434 : 0xa86040,
      ),
    );
  for (const s of [-1, 1]) {
    p.push(part(place(box(0.3, T + 0.3, 1.6), [s * 1.75, (T + 0.3) / 2, 4.1]), BRICK));
    p.push(part(place(new THREE.ConeGeometry(0.2, 0.5, 4), [s * 1.75, T + 0.55, 4.85]), TRIM));
  }
  // Balustrades round the terrace (open at the stair).
  const y = T + 0.12;
  balustrade(p, -4.6, 3.2, -1.9, 3.2, y);
  balustrade(p, 1.9, 3.2, 4.6, 3.2, y);
  balustrade(p, -4.6, 3.2, -4.6, -4.5, y);
  balustrade(p, 4.6, 3.2, 4.6, -4.5, y);
  // The hall on dark posts, set back on the terrace.
  const F = T + 1.5; // hall floor
  const hx = [-3.2, -1.1, 1.1, 3.2];
  const hz = [-4.0, -2.2, -0.4, 1.4];
  for (const x of hx)
    for (const z of hz) {
      p.push(part(place(box(0.26, F - T, 0.26), [x, T + (F - T) / 2, z]), POST));
      p.push(part(place(box(0.38, 0.12, 0.38), [x, T + 0.06, z]), 0x6a6058));
    }
  p.push(part(place(box(7.2, 0.22, 6.2), [0, F, -1.3]), WOOD_DARK)); // floor
  p.push(part(place(box(7.4, 0.12, 6.4), [0, F - 0.17, -1.3]), TRIM)); // carved skirt
  // Plank walls with a gold carved frieze, windows with turned bars and shutters, a door.
  const wallH = 2.1;
  p.push(part(place(box(6.4, wallH, 5.4), [0, F + 0.11 + wallH / 2, -1.3]), WOOD));
  p.push(part(place(box(6.5, 0.16, 5.5), [0, F + wallH - 0.05, -1.3]), GOLD));
  for (const x of [-2.2, 2.2]) {
    p.push(part(place(box(0.95, 0.95, 0.08), [x, F + 1.25, 1.42]), 0x3a2418));
    for (let i = -2; i <= 2; i++)
      p.push(part(place(cyl(0.025, 0.025, 0.9, 4), [x + i * 0.17, F + 1.25, 1.47]), TRIM));
    for (const s of [-1, 1])
      p.push(part(place(box(0.48, 0.95, 0.05), [x + s * 0.74, F + 1.25, 1.47]), 0x7a4426));
    p.push(part(place(box(1.3, 0.22, 0.1), [x, F + 1.86, 1.47]), GOLD));
  }
  p.push(part(place(box(1.1, 1.8, 0.08), [0, F + 1.0, 1.43]), 0x3a2418)); // door
  p.push(part(place(box(1.5, 0.35, 0.12), [0, F + 2.0, 1.45]), GOLD)); // carved lintel
  // Front porch on two carved dark pillars, its own stair down to the terrace.
  p.push(part(place(box(3.0, 0.2, 1.6), [0, F, 2.3]), WOOD_DARK));
  for (const s of [-1, 1]) {
    p.push(part(place(box(0.3, 2.6, 0.3), [s * 1.35, F + 1.3, 3.0]), POST));
    p.push(part(place(box(0.42, 0.2, 0.42), [s * 1.35, F + 2.55, 3.0]), GOLD));
    p.push(part(place(box(0.3, F - T, 0.3), [s * 1.35, T + (F - T) / 2, 3.0]), POST));
  }
  for (let i = 0; i < 4; i++)
    p.push(part(place(box(1.6, 0.12, 0.34), [0, T + 0.2 + i * 0.36, 3.15 + (3 - i) * 0.2 - 0.6]), 0x8a5030));
  // The stacked roofs: the long main gable, a cross gable over the porch, a high crowning gable.
  gable(p, 7.6, 6.4, 2.4, F + wallH + 0.15, -1.3);
  gable(p, 3.4, 4.6, 2.0, F + wallH + 0.55, 1.2, Math.PI / 2);
  gable(p, 4.2, 3.4, 1.7, F + wallH + 1.9, -1.3);
  return mergeGeometries(p.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}
