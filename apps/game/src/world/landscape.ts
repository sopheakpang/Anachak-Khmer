import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { textures, repeated } from '../engine/textures';
import {
  ACT,
  Crowd,
  hutGeometry,
  leafMaterial,
  palmGeometry,
  scatter,
  seeded,
  type Agent,
} from '../engine/figures';
import {
  elephantGeometry,
  elephantWithBlockGeometry,
  horseGeometry,
  oxCartGeometry,
  zebuGeometry,
} from '../engine/animals';
import { shadows, soft } from '../engine/look';

/**
 * The countryside around Preah Ko at Hariharalaya (PK: "landscape views"): rice paddies
 * in every stage from flooded to ripe, sugar palms on the dikes, stilt villages, the
 * Indratataka reservoir that Indravarman I dug to the north, grazing zebu, horses by the
 * huts and an elephant bringing stone along the causeway to the east gate.
 * All of it is instanced: a few draw calls in total.
 */

export interface CountrysideOptions {
  /** Keep this radius around the temple free (enclosure and work yard). */
  inner: number;
  /** Half-size of the paddy area. */
  outer: number;
  palms: number;
  animals: boolean;
}

/** Deterministic smooth-ish noise for choosing paddy stages in patches. */
const patch = (x: number, z: number) =>
  0.5 + 0.25 * Math.sin(x * 0.045 + Math.cos(z * 0.03) * 2) + 0.25 * Math.sin(z * 0.05 - x * 0.02);

const STAGES = [
  { color: 0x9fbfb4, water: true }, // flooded, just planted
  { color: 0x9fd05a, water: false }, // young rice
  { color: 0x6fa83a, water: false }, // mature green
  { color: 0xd8bf5a, water: false }, // ripe, golden
];

export class Countryside {
  readonly group = new THREE.Group();
  private readonly crowds: Crowd[] = [];

  constructor(opts: CountrysideOptions) {
    const tx = textures();
    const r = seeded(21);
    const plotW = 9;
    const plotD = 7;
    const gap = 0.7;
    const plots: Array<{ x: number; z: number; stage: number }> = [];
    for (let x = -opts.outer; x < opts.outer; x += plotW + gap)
      for (let z = -opts.outer; z < opts.outer; z += plotD + gap) {
        const cx = x + plotW / 2;
        const cz = z + plotD / 2;
        if (Math.hypot(cx, cz) < opts.inner) continue;
        if (cz < -118) continue; // the reservoir
        if (Math.abs(cx) < 5 && cz > 30) continue; // causeway to the east gate
        const n = patch(cx, cz) + (r() - 0.5) * 0.25;
        plots.push({ x: cx, z: cz, stage: Math.max(0, Math.min(3, Math.floor(n * 4))) });
      }
    const plotGeo = new THREE.BoxGeometry(plotW, 0.12, plotD);
    const rice = new THREE.InstancedMesh(
      plotGeo,
      soft({ map: repeated(tx.paddy, 2, 2), roughness: 0.95 }, 0),
      plots.filter((p) => !STAGES[p.stage]!.water).length,
    );
    const water = new THREE.InstancedMesh(
      plotGeo,
      soft({ color: 0xffffff, roughness: 0.18, metalness: 0.1, envMapIntensity: 1.4 }, 0),
      plots.filter((p) => STAGES[p.stage]!.water).length,
    );
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let ri = 0;
    let wi = 0;
    for (const p of plots) {
      const st = STAGES[p.stage]!;
      m.makeTranslation(p.x, st.water ? 0.03 : 0.08, p.z);
      c.set(st.color).multiplyScalar(0.94 + r() * 0.12);
      if (st.water) {
        water.setMatrixAt(wi, m);
        water.setColorAt(wi++, c);
      } else {
        rice.setMatrixAt(ri, m);
        rice.setColorAt(ri++, c);
      }
    }
    shadows(rice, false, true);
    shadows(water, false, true);
    this.group.add(rice, water);

    // Dike paths between paddies are the grass showing through the gaps; sugar palms
    // stand on them, alone or in small groups, the classic Khmer skyline.
    const palms: Array<[number, number, number, number]> = [];
    for (let i = 0; i < opts.palms; i++) {
      const p = plots[Math.floor(r() * plots.length)]!;
      const group = 1 + Math.floor(r() * 3);
      for (let k = 0; k < group; k++)
        palms.push([p.x + plotW / 2 + gap / 2 + (r() - 0.5) * 0.4, 0, p.z + (k - 1) * 2.2, 0.9 + r() * 0.5]);
    }
    this.group.add(scatter(palmGeometry(), palms, leafMaterial));

    // Stilt villages among the fields.
    // Pteas Kantaang houses facing east (door side to the rising sun), a little askew.
    const huts: Array<[number, number, number, number, number]> = [];
    for (const [vx, vz] of [
      [-72, 26],
      [68, -38],
      [-58, -72],
      [84, 60],
      [-96, 88],
    ] as const)
      for (let k = 0; k < 5; k++)
        huts.push([
          vx + (r() - 0.5) * 18,
          0,
          vz + (r() - 0.5) * 14,
          0.9 + r() * 0.3,
          Math.PI / 2 + (r() - 0.5) * 0.3,
        ]);
    this.group.add(scatter(hutGeometry(), huts));

    // Indratataka reservoir (baray) to the north, with its earth embankment.
    const baray = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 120),
      soft({ map: repeated(tx.water, 30, 9), color: 0x9fc4c4, roughness: 0.12, metalness: 0.1 }, 0),
    );
    baray.rotation.x = -Math.PI / 2;
    baray.position.set(0, 0.05, -185);
    this.group.add(shadows(baray, false, true), shadows(reservoirDam(), true, true));

    if (opts.animals) this.addAnimals(r);
  }

  /** Grazing zebu, horses by the huts, an elephant hauling a block, zebu carts with stone. */
  private addAnimals(r: () => number): void {
    const graze = (ax: number, az: number, bx: number, bz: number, period: number, phase: number): Agent => ({
      place: (t: number) => {
        // Mostly standing and grazing; now and then a slow walk to the other spot.
        const k = (((t / period + phase) % 2) + 2) % 2;
        const leg = k % 1;
        const walking = leg > 0.75;
        const f = walking ? (leg - 0.75) / 0.25 : 0;
        const [x0, z0, x1, z1] = k < 1 ? [ax, az, bx, bz] : [bx, bz, ax, az];
        const x = x0 + (x1 - x0) * f;
        const z = z0 + (z1 - z0) * f;
        return {
          x,
          y: 0.12,
          z,
          heading: Math.atan2(x1 - x0, z1 - z0) + (walking ? 0 : 0.4 * Math.sin(phase * 9)),
          act: walking ? ACT.crowd : ACT.stand,
          lean: walking ? 0 : 0.12,
        };
      },
    });
    const herd = (
      geo: THREE.BufferGeometry,
      n: number,
      cx: number,
      cz: number,
      spread: number,
      motion: { speed: number; leg: number },
    ) => {
      const crowd = new Crowd(geo, n, 1, { ...motion, arm: 0, armSync: 0 });
      const agents: Agent[] = [];
      for (let i = 0; i < n; i++) {
        const ax = cx + (r() - 0.5) * spread;
        const az = cz + (r() - 0.5) * spread;
        agents.push(graze(ax, az, ax + (r() - 0.5) * 10, az + (r() - 0.5) * 10, 14 + r() * 16, r() * 2));
      }
      crowd.setAgents(agents);
      this.crowds.push(crowd);
      this.group.add(crowd.mesh);
    };
    herd(zebuGeometry(), 9, 44, 50, 26, { speed: 3.4, leg: 0.35 });
    herd(horseGeometry(), 4, -40, 44, 14, { speed: 3.8, leg: 0.4 });
    herd(horseGeometry({ pack: true }), 2, -30, 40, 6, { speed: 3.8, leg: 0.4 });

    // An elephant carries a block up the causeway to the gate and walks back for more:
    // two meshes (loaded going in, unloaded coming back), one shown at a time.
    const walk = (loaded: boolean) => (t: number) => {
      const k = (t / 28) % 2;
      const f = k < 1 ? k : 2 - k;
      const s = f * f * (3 - 2 * f);
      const shown = loaded === k < 1;
      return { x: 1.6, y: shown ? 0 : -60, z: 110 - 68 * s, heading: k < 1 ? Math.PI : 0 };
    };
    for (const loaded of [true, false]) {
      const geo = loaded ? elephantWithBlockGeometry() : elephantGeometry();
      const ele = new Crowd(geo, 1, 1, { speed: 2.2, leg: 0.28, arm: 0, armSync: 0 });
      ele.setAgents([{ place: walk(loaded) }]);
      this.crowds.push(ele);
      this.group.add(ele.mesh);
    }

    // Zebu carts bring cut stone along the west road to the yard's stockpile and go back.
    const carts = new Crowd(oxCartGeometry(), 2, 1, { speed: 3.2, leg: 0.4, arm: 0, armSync: 0 });
    const road = (phase: number): Agent => ({
      place: (t: number) => {
        const k = (((t / 40 + phase) % 2) + 2) % 2;
        const f = k < 1 ? k : 2 - k;
        const [x0, z0, x1, z1] = [-78, 96, -21, 30];
        const x = x0 + (x1 - x0) * f;
        const z = z0 + (z1 - z0) * f;
        const heading = Math.atan2(x1 - x0, z1 - z0) + (k < 1 ? 0 : Math.PI);
        return { x, y: 0.1, z, heading };
      },
    });
    carts.setAgents([road(0), road(0.9)]);
    this.crowds.push(carts);
    this.group.add(carts.mesh);
  }

  update(t: number): void {
    for (const c of this.crowds) c.update(t);
  }
}

/**
 * The Indratataka's earth embankment (dam): sloped dikes on all four sides with a grassy
 * crown path, and a stepped laterite sluice in the middle of the south dike where water
 * was let out toward the fields. Reservoir 420 × 120 m centred at (0, -185).
 */
export function reservoirDam(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const earth = new THREE.Color(0x9a8a5a);
  const grass = new THREE.Color(0x7f9a4a);
  const laterite = new THREE.Color(0x9a5236);
  const paint = (g: THREE.BufferGeometry, c: THREE.Color, top?: THREE.Color) => {
    const geo = g.index ? g.toNonIndexed() : g;
    const pos = geo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    geo.computeVertexNormals();
    const n = geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const cc = top && n.getY(i) > 0.9 ? top : c;
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    parts.push(geo);
  };
  // A dike: trapezoid cross-section (base 9 m, crown 3 m, 2.2 m high), extruded along x.
  const dike = (len: number, x: number, z: number, rotY: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-4.5, 0);
    sh.lineTo(-1.5, 2.2);
    sh.lineTo(1.5, 2.2);
    sh.lineTo(4.5, 0);
    sh.lineTo(-4.5, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    g.rotateY(Math.PI / 2 + rotY);
    g.translate(x, 0, z);
    paint(g, earth, grass);
  };
  dike(430, 0, -122, 0); // south
  dike(430, 0, -248, 0); // north
  dike(126, -213, -185, Math.PI / 2); // west
  dike(126, 213, -185, Math.PI / 2); // east
  // Sluice: a laterite channel through the south dike with stepped walls.
  for (let k = 0; k < 3; k++) {
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(1.2, 2.6 - k * 0.6, 10 - k * 2.5);
      g.translate(sx * (2.4 + k * 1.1), (2.6 - k * 0.6) / 2, -122);
      paint(g, laterite);
    }
  }
  const floor = new THREE.BoxGeometry(4.2, 0.3, 12);
  floor.translate(0, 0.15, -121);
  paint(floor, laterite.clone().multiplyScalar(0.85));
  return new THREE.Mesh(mergeGeometries(parts)!, soft({ vertexColors: true, roughness: 1 }, 0));
}
