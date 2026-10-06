import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Chapter, TempleForm } from '@temples/shared';
import { part, place } from '../../engine/figures';
import { seg as lpSeg } from '../../engine/look';

/**
 * Campaign temples (D54): one low-poly model per chapter, built in code from its `form` in
 * config/kingdom/campaign.json (tiered pyramid, tower group, galleried, enclosed complex,
 * face towers). Proportions are simplified; the silhouette and the arrangement follow the
 * real monument (Bakong's five tiers and eight brick towers, Bakheng's quincunx on its
 * hill, Angkor Wat's three galleried levels, the Bayon's face towers). Preah Ko is not built
 * here: it keeps the stone-by-stone kit (TempleView). Centred on the footprint, y = 0.
 */

export const TEMPLE_STONE: Record<NonNullable<TempleForm['material']>, number> = {
  brick: 0xa5553a,
  sandstone: 0xbfae88,
  laterite: 0x9a5236,
  pink: 0xc98a78,
};
const LATERITE = 0x8a5a40;
const PAVING = 0x9a8c6c;
const CORNICE = 0x9c8a66;
const FACE = 0xd8c7a0;
const DARK = 0x6f5d48;

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** A Khmer tower (prasat): plinth, sanctuary with a door each side, stepped tiers, lotus top. */
function prasat(
  p: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  s: number,
  h: number,
  color: number,
  faces = false,
): void {
  const c = new THREE.Color(color);
  const light = c.clone().offsetHSL(0, 0, 0.06).getHex();
  p.push(part(place(box(s, h * 0.12, s), [x, y + h * 0.06, z]), color));
  p.push(part(place(box(s * 0.72, h * 0.34, s * 0.72), [x, y + h * 0.29, z]), light));
  for (const [dx, dz, w, d] of [
    [0, s * 0.37, s * 0.26, s * 0.08],
    [0, -s * 0.37, s * 0.26, s * 0.08],
    [s * 0.37, 0, s * 0.08, s * 0.26],
    [-s * 0.37, 0, s * 0.08, s * 0.26],
  ] as const)
    p.push(part(place(box(w, h * 0.26, d), [x + dx, y + h * 0.25, z + dz]), DARK)); // doors
  // Receding tiers (the stacked miniature storeys of the tower).
  let yy = y + h * 0.46;
  let k = s * 0.68;
  for (let i = 0; i < 4; i++) {
    const th = h * 0.1;
    p.push(part(place(box(k, th, k), [x, yy + th / 2, z]), i % 2 ? color : light));
    if (faces && i === 0)
      for (const [dx, dz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const)
        p.push(
          part(
            place(box(dx ? 0.1 : k * 0.5, th * 0.9, dz ? 0.1 : k * 0.5), [
              x + (dx * k) / 2,
              yy + th / 2,
              z + (dz * k) / 2,
            ]),
            FACE,
          ),
        );
    yy += th;
    k *= 0.8;
  }
  const lotus = new THREE.ConeGeometry(k * 0.62, h * 0.16, lpSeg(8, 6));
  p.push(part(place(lotus, [x, yy + h * 0.08, z]), light));
}

/** A moulded cornice round the top edge of a tier (a ring, so the terrace stays stone). */
function cornice(p: THREE.BufferGeometry[], s: number, y: number): void {
  const t = 0.5;
  for (const [w, d, x, z] of [
    [s + 0.3, t, 0, s / 2],
    [s + 0.3, t, 0, -s / 2],
    [t, s + 0.3, s / 2, 0],
    [t, s + 0.3, -s / 2, 0],
  ] as const)
    p.push(part(place(box(w, 0.22, d), [x, y, z]), CORNICE));
}

/** A stair up the middle of each side of a tier. */
function stairs(p: THREE.BufferGeometry[], s: number, y: number, h: number, color: number): void {
  const w = Math.max(1.2, s * 0.12);
  for (const [dx, dz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const)
    p.push(
      part(
        place(box(dx ? 1.6 : w, h, dz ? 1.6 : w), [dx * (s / 2 + 0.5), y + h / 2, dz * (s / 2 + 0.5)]),
        color,
      ),
    );
}

/** A long roofed gallery (walls and a ridge) along a rectangle. */
function gallery(p: THREE.BufferGeometry[], w: number, d: number, y: number, h: number, color: number): void {
  const t = 1.1;
  const roof = new THREE.Color(color).offsetHSL(0, 0, -0.08).getHex();
  for (const [gw, gd, x, z] of [
    [w, t, 0, d / 2],
    [w, t, 0, -d / 2],
    [t, d, w / 2, 0],
    [t, d, -w / 2, 0],
  ] as const) {
    p.push(part(place(box(gw, h, gd), [x, y + h / 2, z]), color));
    p.push(part(place(box(gw + 0.3, h * 0.25, gd + 0.3), [x, y + h * 1.1, z]), roof));
  }
}

/** A plain enclosure wall with a gate tower (gopura) in the middle of each side. */
function enclosure(
  p: THREE.BufferGeometry[],
  w: number,
  d: number,
  h: number,
  color: number,
  gates = true,
): void {
  for (const [gw, gd, x, z] of [
    [w, 0.6, 0, d / 2],
    [w, 0.6, 0, -d / 2],
    [0.6, d, w / 2, 0],
    [0.6, d, -w / 2, 0],
  ] as const)
    p.push(part(place(box(gw, h, gd), [x, h / 2, z]), color));
  if (gates)
    for (const [x, z] of [
      [0, d / 2],
      [0, -d / 2],
      [w / 2, 0],
      [-w / 2, 0],
    ] as const)
      prasat(p, x, 0, z, 2.6, 4.2, color);
}

function elephant(p: THREE.BufferGeometry[], x: number, y: number, z: number, color: number): void {
  p.push(part(place(box(0.9, 0.7, 1.4), [x, y + 0.75, z]), color));
  for (const [dx, dz] of [
    [-0.3, -0.5],
    [0.3, -0.5],
    [-0.3, 0.5],
    [0.3, 0.5],
  ] as const)
    p.push(part(place(box(0.25, 0.45, 0.25), [x + dx, y + 0.22, z + dz]), color));
  p.push(part(place(box(0.55, 0.55, 0.45), [x, y + 0.95, z + 0.85]), color));
  p.push(part(place(box(0.18, 0.7, 0.18), [x, y + 0.45, z + 1.05]), color));
}

/** A stepped pyramid (temple-mountain): tiers, stairs, towers on the tiers and the top. */
function pyramid(p: THREE.BufferGeometry[], f: TempleForm, base: number, color: number): number {
  const tiers = f.tiers ?? 3;
  const th = f.tierH ?? 1.8;
  const shrink = f.shrink ?? 0.8;
  let y = 0;
  if (f.hill) {
    const hh = f.hill * 2;
    const hill = new THREE.CylinderGeometry(base * 0.45, base * 0.49, hh, lpSeg(10, 7));
    p.push(part(place(hill, [0, hh / 2, 0]), 0x6f8a44));
    y = hh;
  }
  let s = base * 0.86;
  for (let i = 0; i < tiers; i++) {
    const tone = i % 2 ? color : new THREE.Color(color).offsetHSL(0, 0, -0.04).getHex();
    p.push(part(place(box(s, th, s), [0, y + th / 2, 0]), tone));
    cornice(p, s, y + th);
    stairs(p, s, y, th, tone);
    if (f.galleries) gallery(p, s * 0.92, s * 0.92, y + th, 1.2, color);
    if (f.cornerElephants && i < tiers - 1)
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const)
        elephant(p, (dx * s) / 2 - dx * 0.8, y + th, (dz * s) / 2 - dz * 0.8, 0xc8b894);
    y += th;
    s *= shrink;
  }
  // Small towers along the tiers (Bakheng's 60, abstracted), then the summit.
  const n = f.tierTowers ?? 0;
  if (n) {
    const perTier = Math.max(1, Math.ceil(n / Math.max(1, tiers - 1)));
    let yy = (f.hill ?? 0) * 2 + th;
    let ss = base * 0.86 * shrink;
    for (let i = 0; i < tiers - 1 && i * perTier < n; i++) {
      for (let k = 0; k < perTier; k++) {
        const a = (k / perTier) * Math.PI * 2 + Math.PI / 4;
        const r = ss / 2 + 0.9;
        const sx = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * r;
        const sz = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * r;
        prasat(p, sx, yy, sz, 1.6, 2.6, color);
      }
      yy += th;
      ss *= shrink;
    }
  }
  const topS = s / shrink;
  if (f.top === 'quincunx') {
    const o = topS * 0.3;
    for (const [dx, dz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const)
      prasat(p, dx * o, y, dz * o, topS * 0.3, topS * 0.55 + 2, color);
    prasat(p, 0, y, 0, topS * 0.4, topS * 0.8 + 3, color);
  } else if (f.plain) {
    // Ta Keo: the towers were never finished and never carved; plain blocks.
    prasat(p, 0, y, 0, topS * 0.4, topS * 0.6 + 2, 0x9f9a86);
  } else prasat(p, 0, y, 0, topS * 0.5, topS * 0.8 + 3, color);
  // Ring of towers at ground level (Bakong's eight brick towers).
  const ring = f.ringTowers ?? 0;
  for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2 + Math.PI / 8;
    const r = base * 0.47;
    prasat(p, Math.cos(a) * r, 0, Math.sin(a) * r, 2.2, 5, TEMPLE_STONE.brick);
  }
  return y;
}

/** The model of one campaign temple (all of it; construction is shown by clipping). */
export function templeGeometry(ch: Chapter, tile: number): THREE.BufferGeometry {
  const f = ch.form;
  const W = ch.footprint[0] * tile;
  const D = ch.footprint[1] * tile;
  const base = Math.min(W, D);
  const color = TEMPLE_STONE[f.material ?? 'sandstone'];
  const p: THREE.BufferGeometry[] = [];
  // Enclosed temples stand in a paved court; temple-mountains rise straight from the ground.
  if (f.kind !== 'pyramid') p.push(part(place(box(W * 0.96, 0.35, D * 0.96), [0, 0.17, 0]), PAVING));
  switch (f.kind) {
    case 'pyramid':
      pyramid(p, f, base, color);
      break;
    case 'towers': {
      // Lolei: four brick towers in two rows on one terrace.
      const th = f.tierH ?? 1.2;
      let y = 0.35;
      let s = base * 0.8;
      for (let i = 0; i < (f.tiers ?? 2); i++) {
        p.push(part(place(box(s, th, s), [0, y + th / 2, 0]), LATERITE));
        stairs(p, s, y, th, LATERITE);
        y += th;
        s *= 0.85;
      }
      const o = s * 0.24;
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const)
        prasat(p, dx * o, y, dz * o, s * 0.36, s * 0.75, color);
      break;
    }
    case 'row3': {
      // Banteay Srei: small pink sandstone shrines in a row, libraries, enclosure walls.
      enclosure(p, W * 0.92, D * 0.92, 1.4, LATERITE);
      p.push(part(place(box(W * 0.5, 0.8, D * 0.6), [0, 0.4, 0]), color));
      for (const dx of [-1, 0, 1]) prasat(p, dx * W * 0.14, 0.8, 0, W * 0.12, dx ? 5 : 6.5, color);
      for (const dx of [-1, 1]) {
        p.push(part(place(box(W * 0.14, 2.2, D * 0.12), [dx * W * 0.14, 1.1, D * 0.2]), color));
        p.push(
          part(
            place(
              new THREE.CylinderGeometry(0.5, 0.5, 1, 3),
              [dx * W * 0.14, 2.6, D * 0.2],
              [0, 0, Math.PI / 2],
              [1.2, 1.3, D * 0.12],
            ),
            color,
          ),
        );
      }
      break;
    }
    case 'galleried': {
      // Angkor Wat: three rising galleried levels, the quincunx of towers on the top.
      enclosure(p, W * 0.96, D * 0.96, 1.6, LATERITE, false);
      prasat(p, -W * 0.48, 0, 0, 5, 7, color); // western entrance
      const levels = f.levels ?? 3;
      let y = 0.35;
      let s = base * 0.62;
      for (let i = 0; i < levels; i++) {
        const h = i === 0 ? 1 : 3.2;
        p.push(
          part(
            place(box(s, h, s), [0, y + h / 2, 0]),
            new THREE.Color(color).offsetHSL(0, 0, -0.03 * i).getHex(),
          ),
        );
        stairs(p, s, y, h, color);
        gallery(p, s * 0.95, s * 0.95, y + h, 2.2, color);
        if (i > 0)
          for (const [dx, dz] of [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ] as const)
            prasat(p, (dx * s * 0.95) / 2, y + h, (dz * s * 0.95) / 2, 2.4, i === levels - 1 ? 11 : 6, color);
        y += h;
        s *= 0.7;
      }
      prasat(p, 0, y, 0, s * 0.9, 18, color);
      break;
    }
    case 'complex': {
      // Ta Prohm / Preah Khan: flat temples of concentric enclosures, halls and towers.
      const rings = f.rings ?? 3;
      for (let i = 0; i < rings; i++) {
        const k = 1 - i * (0.7 / rings);
        if (i === 0) enclosure(p, W * 0.96 * k, D * 0.96 * k, 1.6, LATERITE);
        else gallery(p, W * 0.9 * k, D * 0.9 * k, 0.35, 2, color);
      }
      const n = f.towers ?? 8;
      const r = base * 0.18;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        prasat(
          p,
          Math.cos(a) * r * (k % 2 ? 1.4 : 1),
          0.35,
          Math.sin(a) * r * (k % 2 ? 1.4 : 1),
          1.8,
          4,
          color,
        );
      }
      prasat(p, 0, 0.35, 0, 3.4, 8, color);
      // Halls between the enclosures.
      for (const [x, z, w, d] of [
        [0, base * 0.3, base * 0.3, 2],
        [0, -base * 0.3, base * 0.3, 2],
        [base * 0.3, 0, 2, base * 0.3],
        [-base * 0.3, 0, 2, base * 0.3],
      ] as const)
        p.push(part(place(box(w, 2, d), [x, 1.35, z]), color));
      break;
    }
    case 'bayon': {
      // The Bayon: terraces, a ring of face towers, the great round central tower.
      enclosure(p, W * 0.92, D * 0.92, 1.4, color, false);
      const levels = f.levels ?? 3;
      let y = 0.35;
      let s = base * 0.7;
      for (let i = 0; i < levels; i++) {
        const h = 2.2;
        p.push(part(place(box(s, h, s), [0, y + h / 2, 0]), color));
        stairs(p, s, y, h, color);
        if (i === 0) gallery(p, s * 0.95, s * 0.95, y + h, 2, color);
        y += h;
        s *= 0.72;
      }
      const n = f.faceTowers ?? 12;
      const r = base * 0.25;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        prasat(p, Math.cos(a) * r, 0.35 + 2.2, Math.sin(a) * r, 2.4, 6, color, true);
      }
      const round = new THREE.CylinderGeometry(s * 0.45, s * 0.55, 6, lpSeg(12, 8));
      p.push(part(place(round, [0, y + 3, 0]), color));
      prasat(p, 0, y + 6, 0, s * 0.8, 9, color, true);
      break;
    }
    default:
      prasat(p, 0, 0.35, 0, base * 0.4, base * 0.6, color);
  }
  return mergeGeometries(p)!;
}

/** Height of a model (for clipping while it rises). */
export function heightOf(geo: THREE.BufferGeometry): number {
  geo.computeBoundingBox();
  return geo.boundingBox!.max.y;
}

/**
 * Empire places (world.json, D60): a small low-poly landmark per kind, centred, y = 0.
 * temple: a laterite enclosure with a gate and a central tower; town: stilt houses inside a
 * palisade with a shrine; port: houses on the shore, a jetty and two boats.
 */
export function landmarkGeometry(kind: 'temple' | 'town' | 'port'): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  if (kind === 'temple') {
    p.push(part(place(box(14, 0.4, 14), [0, 0.2, 0]), PAVING));
    enclosure(p, 13, 13, 1.4, LATERITE);
    p.push(part(place(box(6, 1.2, 6), [0, 0.6, 0]), TEMPLE_STONE.sandstone));
    prasat(p, 0, 1.2, 0, 3.4, 8, TEMPLE_STONE.sandstone);
    return mergeGeometries(p)!;
  }
  const wood = 0x8a5a32;
  const thatch = 0xc9a25a;
  const hut = (x: number, z: number, r = 0) => {
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      p.push(part(place(box(0.2, 1.8, 0.2), [x + dx * 1.2, 0.9, z + dz * 1.0]), wood));
    p.push(part(place(box(2.8, 1.4, 2.4), [x, 2.4, z], [0, r, 0]), 0xd2b27a));
    p.push(part(place(new THREE.ConeGeometry(2.3, 1.6, 4), [x, 3.9, z], [0, Math.PI / 4 + r, 0]), thatch));
  };
  if (kind === 'town') {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.2) continue;
      p.push(
        part(place(new THREE.ConeGeometry(0.22, 2.2, 5), [Math.cos(a) * 9, 1.1, Math.sin(a) * 9]), wood),
      );
    }
    for (const [x, z] of [
      [-4, -3],
      [3, -4],
      [-3, 4],
      [4, 2],
    ] as const)
      hut(x, z);
    prasat(p, 0, 0, 0, 2, 4, TEMPLE_STONE.brick);
  } else {
    hut(-4, -3);
    hut(2, -4);
    p.push(part(place(box(1.4, 0.3, 9), [0, 0.3, 5]), wood)); // jetty
    for (const x of [-2.5, 2.5]) p.push(part(place(box(1.2, 0.5, 4), [x, 0.25, 7], [0, 0.2, 0]), 0x6a4a2a)); // boats
  }
  return mergeGeometries(p)!;
}
