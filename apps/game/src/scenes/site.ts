import * as THREE from 'three';
import type { SlotRef, TempleKit } from '@temples/shared';
import { textures, repeated } from '../engine/textures';
import {
  bushGeometry,
  Crowd,
  hutGeometry,
  leafMaterial,
  palmGeometry,
  scatter,
  seeded,
  treeGeometry,
  workerGeometry,
  type Agent,
} from '../engine/figures';
import { groundY, SITE, WorkSite, type Tower, type Worker } from '../world/worksite';
import { Countryside } from '../world/landscape';
import { TempleView } from '../world/temple';
import { NamePlates, type PlateSpec } from '../world/nameplates';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { groundPlane, shadows, soft, seg as lpSeg } from '../engine/look';
import { baseScene, camera, lerp, smooth, type FrameContext, type GameScene, type SlotViewer } from './base';

/**
 * Construction site (spec: Scenes): the temple rising from its kit, bamboo scaffolding
 * around the towers being built, workers, thatched huts and the stone stockpile.
 */
export class SiteScene implements GameScene, SlotViewer {
  readonly name = 'site';
  readonly scene = baseScene(70, 260, { center: [0, 0, 4], extent: 34 });
  readonly camera = camera(42);
  readonly temple: TempleView;
  /** Names being carved on the blocks in the carving yard (the newest viewers). */
  private readonly yardPlates: NamePlates;
  /** The construction crew's rules (world/worksite.ts) and its three crowds by tool. */
  readonly crew: WorkSite;
  private readonly crowds: Crowd[] = [];
  private readonly carried: THREE.InstancedMesh;
  private readonly liftBlock: THREE.Mesh;
  private readonly liftRope: THREE.LineSegments;
  private readonly liftBeam: THREE.Mesh;
  private readonly towerSpots: Array<{ owner: number; x: number; z: number; top: number }>;
  readonly countryside: Countryside;
  private readonly poles: THREE.InstancedMesh;
  /** Horizontal bamboo ledgers tying the scaffolding poles, every 2 m. */
  private readonly ledgers: THREE.InstancedMesh;
  private readonly pile: THREE.InstancedMesh;
  private lastHeights = '';
  private lastPile = -1;
  private readonly m = new THREE.Matrix4();

  constructor(
    kit: TempleKit,
    font: (px: number) => string,
    quality: { maxCharacters: number; trees: number; namePlates: number },
  ) {
    const tx = textures();
    const ground = groundPlane(400, 400, soft({ map: repeated(tx.ground, 40, 40), roughness: 1 }, 0), 3);
    this.scene.add(ground);

    // Grass beyond the work yard.
    const grass = new THREE.Mesh(
      new THREE.RingGeometry(55, 200, lpSeg(48, 4)),
      soft({ map: repeated(tx.grass, 30, 30), roughness: 1 }, 0),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.02;
    shadows(grass, false, true);
    this.scene.add(grass);

    // Paddies, palms, villages, the reservoir and animals beyond the enclosure.
    this.countryside = new Countryside({
      inner: 58,
      outer: 150,
      palms: Math.round(quality.trees * 0.8),
      animals: true,
    });
    this.scene.add(this.countryside.group);

    this.temple = new TempleView(kit, font, quality.namePlates);
    this.scene.add(this.temple.group);

    // Scaffolding poles (bamboo) around towers under construction.
    const pole = new THREE.CylinderGeometry(0.08, 0.08, 1, lpSeg(8, 3));
    pole.translate(0, 0.5, 0);
    this.poles = new THREE.InstancedMesh(pole, soft({ color: 0xd4b574, roughness: 0.6 }), 6 * 12);
    shadows(this.poles, true, false);
    this.poles.count = 0;
    this.poles.frustumCulled = false;
    this.scene.add(this.poles);
    const ledger = new THREE.CylinderGeometry(0.055, 0.055, 1, lpSeg(6, 3)).rotateZ(Math.PI / 2);
    this.ledgers = new THREE.InstancedMesh(ledger, this.poles.material, 6 * 4 * 8);
    shadows(this.ledgers, true, false);
    this.ledgers.count = 0;
    this.ledgers.frustumCulled = false;
    this.scene.add(this.ledgers);

    // Stockpile of fresh grey-green blocks at the yard entrance.
    const blk = new RoundedBoxGeometry(1.4, 0.8, 1, 2, 0.08);
    blk.translate(0, 0.4, 0);
    this.pile = new THREE.InstancedMesh(blk, soft({ map: tx.sandstoneFresh }), 60);
    shadows(this.pile, true, true);
    this.pile.count = 0;
    this.scene.add(this.pile);

    const r = seeded(5);
    // Huts and trees around the yard.
    this.scene.add(
      scatter(hutGeometry(), [
        [-26, 0, 20, 1, Math.PI / 2],
        [-30, 0, 6, 1, Math.PI / 2 + 0.1],
        [28, 0, 18, 1, Math.PI / 2 - 0.1],
        [31, 0, -2, 1, Math.PI / 2],
        [-27, 0, -14, 1, Math.PI / 2 + 0.05],
      ]),
    );
    const trees: Array<[number, number, number, number]> = [];
    for (let i = 0; i < quality.trees; i++) {
      const a = r() * Math.PI * 2;
      const d = 48 + r() * 70;
      trees.push([Math.cos(a) * d, 0, Math.sin(a) * d, 0.8 + r() * 0.8]);
    }
    this.scene.add(scatter(treeGeometry(), trees.slice(0, Math.floor(trees.length * 0.7))));
    this.scene.add(scatter(palmGeometry(), trees.slice(Math.floor(trees.length * 0.7)), leafMaterial));
    // Bushes soften the edge of the work yard.
    const bushes: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = 30 + r() * 22;
      bushes.push([Math.cos(a) * d, 0, Math.sin(a) * d, 0.8 + r() * 0.9]);
    }
    this.scene.add(scatter(bushGeometry(), bushes));

    this.scene.add(enclosure());

    // The construction crew: haulers and the rope team (bare hands), carvers (mallet and
    // chisel), lever teams (bamboo poles). One crowd per tool, all driven by WorkSite.
    this.towerSpots = kit.bigPieces
      .filter((b) => b.kind === 'finial')
      .map((f) => ({ owner: f.owner, x: f.x, z: f.z, top: f.y }));
    this.crew = new WorkSite(Math.min(31, quality.maxCharacters));
    const agent = (w: Worker): Agent => ({
      place: () => ({ x: w.x, y: groundY(w.x, w.z), z: w.z, heading: w.heading, act: w.act, lean: w.lean }),
    });
    const groups: Array<[ReturnType<typeof workerGeometry>, Worker[]]> = [
      [workerGeometry(), this.crew.workers.filter((w) => w.role === 'hauler' || w.role === 'puller')],
      [workerGeometry('mallet'), this.crew.workers.filter((w) => w.role === 'carver')],
      [workerGeometry('pole'), this.crew.workers.filter((w) => w.role === 'lever')],
    ];
    for (const [geo, list] of groups) {
      const c = new Crowd(geo, Math.max(1, list.length));
      c.setAgents(list.map(agent));
      this.crowds.push(c);
      this.scene.add(c.mesh);
    }
    // Blocks carried on the head, the carving yard, and the rope lift.
    const small = new RoundedBoxGeometry(0.6, 0.34, 0.44, 1, 0.04);
    const fresh = soft({ map: tx.sandstoneFresh }, 0.2);
    this.carried = new THREE.InstancedMesh(small, fresh, Math.max(1, this.crew.workers.length));
    this.carried.count = 0;
    this.carried.frustumCulled = false;
    shadows(this.carried, true, false);
    this.scene.add(this.carried);
    const yard = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1.3, 0.75, 0.9, 1, 0.05),
      fresh,
      SITE.carvingYard.length,
    );
    SITE.carvingYard.forEach(([x, z], i) => {
      this.m.makeRotationY((i % 3) * 0.08 - 0.08);
      this.m.setPosition(x, 0.375, z);
      yard.setMatrixAt(i, this.m);
    });
    shadows(yard, true, true);
    this.scene.add(yard);
    // Carvers chisel viewers' names (or a Khmer blessing) into the yard blocks' south face.
    this.yardPlates = new NamePlates(this.temple.plates.atlas);
    this.scene.add(this.yardPlates.mesh);
    this.setYardNames([]);
    this.liftBlock = shadows(
      new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.5, 0.7, 1, 0.05), fresh),
      true,
      false,
    );
    this.liftBeam = shadows(
      new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.6), soft({ color: 0x8a5a32 }, 0.1)),
      true,
      false,
    );
    this.liftRope = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(12), 3),
      ),
      new THREE.LineBasicMaterial({ color: 0x6b4a2a }),
    );
    this.liftRope.frustumCulled = false;
    this.scene.add(this.liftBlock, this.liftBeam, this.liftRope);
  }

  /** The newest names go on the yard blocks; blocks without one carry a Khmer blessing. */
  setYardNames(names: string[]): void {
    this.yardPlates.set(yardPlates(names));
  }

  aimAt(cam: THREE.PerspectiveCamera, slot: SlotRef | null, distance: number, t: number): void {
    const target = this.temple.slotFront(slot);
    const sway = Math.sin(t * Math.PI) * 1.2;
    cam.position.set(target.x + sway, target.y + distance * 0.25, target.z + distance);
    cam.lookAt(target);
  }

  update(ctx: FrameContext): void {
    const t = ctx.now / 1000;
    const v = ctx.view;
    if (v.shot === 'site' && v.mode === 'cut' && v.cut) {
      // Close-up of the stone being set: start wide, settle on the slot.
      const dist = lerp(22, v.cut.slot?.kind === 'big' ? 7 : 5, smooth(Math.min(1, v.t * 1.6)));
      this.aimAt(this.camera, v.cut.slot, dist, v.t);
    } else {
      // Slow orbit around the temple.
      const a = -0.5 + v.t * (v.mode === 'idle' ? 0.5 : 0.9);
      this.camera.position.set(Math.sin(a) * 46, 20 + Math.sin(v.t * Math.PI) * 4, Math.cos(a) * 46);
      this.camera.lookAt(0, 5, 0);
    }
    if (!ctx.paused) {
      this.updateCrew(t, ctx.stockpile);
      this.temple.update(ctx.now);
    }
    this.updateScaffolding();
    this.updatePile(ctx.stockpile);
  }

  /** Towers as the crew sees them: position, masonry height, finished height. */
  towers(): Tower[] {
    const h = this.temple.towerHeights();
    return this.towerSpots.map((f) => ({ x: f.x, z: f.z, height: h[f.owner] ?? 0, top: f.top }));
  }

  private updateCrew(t: number, stockpile: number): void {
    this.crew.update(t, this.towers(), stockpile);
    this.countryside.update(t);
    for (const c of this.crowds) c.update(t);
    let n = 0;
    for (const w of this.crew.workers) {
      if (!w.carrying) continue;
      this.m.makeRotationY(w.heading);
      this.m.setPosition(w.x, groundY(w.x, w.z) + 2.12, w.z);
      this.carried.setMatrixAt(n++, this.m);
    }
    this.carried.count = n;
    this.carried.instanceMatrix.needsUpdate = true;
    const lift = this.crew.lift;
    this.liftBlock.visible = this.liftBeam.visible = this.liftRope.visible = !!lift;
    if (!lift) return;
    const [px, py, pz] = lift.pulley;
    this.liftBlock.position.set(...lift.block);
    this.liftBeam.position.set(px, py + 0.1, pz - lift.dir * 0.5);
    const p = this.liftRope.geometry.getAttribute('position') as THREE.BufferAttribute;
    p.setXYZ(0, px, py, pz);
    p.setXYZ(1, lift.block[0], lift.block[1] + 0.25, lift.block[2]);
    p.setXYZ(2, px, py, pz);
    p.setXYZ(3, ...lift.hands);
    p.needsUpdate = true;
  }

  private updateScaffolding(): void {
    const h = this.temple.towerHeights();
    const key = h.map((x) => x.toFixed(1)).join(',');
    if (key === this.lastHeights) return;
    this.lastHeights = key;
    let n = 0;
    let l = 0;
    const r = 2.6;
    const towers = this.temple.kit.bigPieces.filter((b) => b.kind === 'finial');
    towers.forEach((f) => {
      const height = h[f.owner] ?? 0;
      const done = height >= f.y - 0.01;
      if (height <= 1.9 || done) return; // no scaffolding before walls start, or once finished
      for (const [dx, dz] of [
        [-r, -r],
        [r, -r],
        [-r, r],
        [r, r],
        [0, r + 0.3],
        [0, -r - 0.3],
        [r + 0.3, 0],
        [-r - 0.3, 0],
      ] as const) {
        this.m.makeScale(1, height + 1.5, 1);
        this.m.setPosition(f.x + dx, 1, f.z + dz);
        this.poles.setMatrixAt(n++, this.m);
      }
      // Ledgers on all four sides at each 2 m lift, up to the working level.
      for (let y = 2.4; y <= height + 1.2 && l + 4 <= this.ledgers.instanceMatrix.count; y += 2) {
        for (const [sx, sz, rotY] of [
          [0, -r, 0],
          [0, r, 0],
          [-r, 0, Math.PI / 2],
          [r, 0, Math.PI / 2],
        ] as const) {
          this.m.makeRotationY(rotY);
          this.m.scale(new THREE.Vector3(2 * r + 0.4, 1, 1));
          this.m.setPosition(f.x + sx, y, f.z + sz);
          this.ledgers.setMatrixAt(l++, this.m);
        }
      }
    });
    this.poles.count = n;
    this.poles.instanceMatrix.needsUpdate = true;
    this.ledgers.count = l;
    this.ledgers.instanceMatrix.needsUpdate = true;
  }

  private updatePile(stockpile: number): void {
    const blocks = stockpile <= 0 ? 0 : Math.min(60, Math.ceil(Math.log10(stockpile + 1) * 12));
    if (blocks === this.lastPile) return;
    this.lastPile = blocks;
    for (let i = 0; i < blocks; i++) {
      const layer = Math.floor(i / 12);
      const k = i % 12;
      this.m.makeRotationY(((k * 37) % 10) * 0.05);
      this.m.setPosition(
        -20 + (k % 4) * 1.6 + layer * 0.3,
        layer * 0.8,
        24 + Math.floor(k / 4) * 1.2 - layer * 0.2,
      );
      this.pile.setMatrixAt(i, this.m);
    }
    this.pile.count = blocks;
    this.pile.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Laterite enclosure wall with an east entrance pavilion (gopura), as at Preah Ko.
 * Built as scenery around the work yard; the camera and the workers stay inside it.
 */
export function enclosure(): THREE.Group {
  const g = new THREE.Group();
  const tx = textures();
  const wall = (len: number, x: number, z: number, alongX: boolean) => {
    const mat = soft({ map: repeated(tx.laterite, len / 1.4, 2), roughness: 0.95 }, 0.1);
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(alongX ? len : 0.8, 2, alongX ? 0.8 : len, 1, 0.08),
      mat,
    );
    body.position.set(x, 1, z);
    const cap = new THREE.Mesh(
      new RoundedBoxGeometry(alongX ? len : 1.1, 0.3, alongX ? 1.1 : len, 1, 0.1),
      mat,
    );
    cap.position.set(x, 2.1, z);
    g.add(shadows(body, true, true), shadows(cap, true, true));
  };
  const X = 22.5;
  const ZB = -19;
  const ZF = 34;
  const gate = 6;
  wall(ZF - ZB, -X, (ZF + ZB) / 2, false);
  wall(ZF - ZB, X, (ZF + ZB) / 2, false);
  wall(2 * X + 0.8, 0, ZB, true);
  wall(X - gate, -(X + gate) / 2, ZF, true);
  wall(X - gate, (X + gate) / 2, ZF, true);

  // Gopura: cross-shaped entrance pavilion with a stepped roof and lotus finial.
  const lat = soft({ map: repeated(tx.laterite, 3, 3), roughness: 0.95 }, 0.12);
  const stone = soft({ map: tx.sandstoneGold, color: 0xd8b582, roughness: 0.8 }, 0.2);
  const dark = soft({ color: 0x2a1a10, roughness: 1 }, 0);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = shadows(new THREE.Mesh(geo, mat), true, true);
    m.position.set(x, y, ZF + z);
    g.add(m);
  };
  add(new RoundedBoxGeometry(12.5, 0.6, 6, 1, 0.1), stone, 0, 0.3, 0);
  add(new RoundedBoxGeometry(4.6, 3.8, 4.6, 1, 0.12), lat, 0, 2.5, 0);
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(3.4, 2.9, 3.2, 1, 0.1), lat, s * 3.9, 2.05, 0);
    add(new RoundedBoxGeometry(3.8, 0.32, 3.6, 1, 0.1), stone, s * 3.9, 3.66, 0);
    add(new RoundedBoxGeometry(2.6, 0.5, 2.4, 1, 0.1), lat, s * 3.9, 4.05, 0);
  }
  for (const z of [2.33, -2.33]) {
    add(new RoundedBoxGeometry(1.5, 2.5, 0.08, 1, 0.02), dark, 0, 1.85, z); // doorway
    add(new RoundedBoxGeometry(2.3, 0.45, 0.3, 1, 0.05), stone, 0, 3.3, z * 1.03); // lintel
    for (const x of [-0.9, 0.9])
      add(new THREE.CylinderGeometry(0.1, 0.1, 2.5, lpSeg(8, 3)), stone, x, 1.85, z * 1.05); // colonettes
  }
  [
    [5.1, 0.4],
    [4.1, 0.9],
    [3.2, 0.8],
    [2.2, 0.7],
  ].reduce((y, [w, h]) => {
    add(new RoundedBoxGeometry(w!, h!, w!, 1, 0.12), lat, 0, y + h! / 2, 0);
    return y + h!;
  }, 4.4);
  const bud = new THREE.SphereGeometry(0.5, lpSeg(12, 4), lpSeg(10, 3)).scale(1, 1.6, 1);
  add(bud, stone, 0, 7.8, 0);
  return g;
}

/** Khmer words carved when no viewer name is waiting: blessings and the temple's name. */
export const YARD_WORDS = ['សិរីសួស្តី', 'ព្រះគោ', 'ជ័យមង្គល', 'សុខសប្បាយ'];

/** Plates for the carving-yard blocks: newest names first, then Khmer words. */
export function yardPlates(names: string[]): PlateSpec[] {
  return SITE.carvingYard.map(([x, z], i) => {
    const name = names[i] ?? YARD_WORDS[i % YARD_WORDS.length]!;
    return {
      key: names[i] ? `yard:${name}` : `yard-word:${i % YARD_WORDS.length}`,
      name,
      x,
      y: 0.4,
      z: z + 0.47,
      w: 1.2,
      h: 0.62,
    };
  });
}
