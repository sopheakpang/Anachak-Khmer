import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { textures, repeated } from '../engine/textures';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { groundPlane, shadows, soft, seg as lpSeg } from '../engine/look';
import {
  bushGeometry,
  COLORS,
  Crowd,
  figureMaterial,
  leafMaterial,
  part,
  place,
  palmGeometry,
  raftGeometry,
  scatter,
  seeded,
  treeGeometry,
  workerGeometry,
  type Agent,
} from '../engine/figures';
import { elephantGeometry, oxCartGeometry } from '../engine/animals';
import { baseScene, camera, lerp, type FrameContext, type GameScene } from './base';

/** Stone on a wooden sledge with log rollers. */
function sledgeGeometry(): THREE.BufferGeometry {
  const parts = [
    part(place(new RoundedBoxGeometry(2.0, 0.18, 2.8, 2, 0.05), [0, 0.42, 0]), COLORS.wood),
    part(place(new RoundedBoxGeometry(1.8, 1.1, 2.4, 3, 0.14), [0, 1.06, 0]), COLORS.sandstone),
  ];
  for (const z of [-1, 0, 1])
    parts.push(
      part(
        place(new THREE.CylinderGeometry(0.17, 0.17, 2.3, lpSeg(10, 3)), [0, 0.17, z], [0, 0, Math.PI / 2]),
        COLORS.woodDark,
      ),
    );
  return mergeGeometries(parts)!;
}

/** Distant temple towers on the horizon (the goal of every convoy). */
function horizonTowers(): THREE.Group {
  const g = new THREE.Group();
  const mat = soft({ color: 0xc08a64 }, 0.2);
  for (const [x, h] of [
    [-8, 11],
    [0, 13],
    [8, 11],
  ] as const) {
    const body = new THREE.Mesh(new RoundedBoxGeometry(4, h * 0.55, 4, 2, 0.2), mat);
    body.position.set(x, h * 0.275, 0);
    // Stepped, rounded tower top.
    for (let k = 0; k < 4; k++) {
      const w = 3.6 - k * 0.75;
      const tier = new THREE.Mesh(new RoundedBoxGeometry(w, h * 0.1, w, 2, 0.15), mat);
      tier.position.set(x, h * 0.55 + h * 0.1 * k + h * 0.05, 0);
      g.add(tier);
    }
    const bud = new THREE.Mesh(new THREE.SphereGeometry(0.6, lpSeg(12, 4), lpSeg(10, 3)), mat);
    bud.scale.set(1, 1.6, 1);
    bud.position.set(x, h * 0.95 + 0.6, 0);
    g.add(body, bud);
  }
  return g;
}

/** Kulen quarry: cliff face, cutters splitting blocks, the stockpile growing. */
export class QuarryScene implements GameScene {
  readonly name = 'quarry';
  readonly scene = baseScene(45, 200, { center: [-2, 0, -4], extent: 30 });
  readonly camera = camera(45);
  private readonly cutters: Crowd;
  private readonly blocks: THREE.InstancedMesh;
  private lastBlocks = -1;

  constructor(maxCharacters: number) {
    const tx = textures();
    const ground = groundPlane(300, 300, soft({ map: repeated(tx.ground, 30, 30), roughness: 1 }, 0), 3);
    this.scene.add(ground);
    const r = seeded(9);
    // Stepped cliff of grey-green sandstone.
    const cliffMat = soft({ map: repeated(tx.sandstoneFresh, 2, 2), color: 0xa9b08c, roughness: 0.95 }, 0.15);
    for (let i = 0; i < 14; i++) {
      const w = 6 + r() * 8;
      const h = 4 + r() * 10;
      const m = shadows(
        new THREE.Mesh(new RoundedBoxGeometry(w, h, 6 + r() * 4, 3, 0.9), cliffMat),
        true,
        true,
      );
      m.position.set(-30 + i * 4.5, h / 2, -14 - r() * 6);
      m.rotation.y = (r() - 0.5) * 0.3;
      this.scene.add(m);
    }
    this.scene.add(
      scatter(
        treeGeometry(),
        Array.from(
          { length: 30 },
          () =>
            [-40 + r() * 80, 12 + r() * 4, -26 - r() * 20, 0.9 + r() * 0.6] as [
              number,
              number,
              number,
              number,
            ],
        ),
      ),
    );
    const blk = new RoundedBoxGeometry(1.6, 0.9, 1.1, 2, 0.1);
    blk.translate(0, 0.45, 0);
    this.blocks = new THREE.InstancedMesh(blk, soft({ map: tx.sandstoneFresh }), 80);
    this.blocks.count = 0;
    shadows(this.blocks, true, true);
    this.scene.add(this.blocks);
    this.scene.add(
      scatter(
        bushGeometry(),
        Array.from(
          { length: 24 },
          () =>
            [(r() < 0.5 ? -1 : 1) * (16 + r() * 24), 0, -2 + r() * 12, 0.7 + r()] as [
              number,
              number,
              number,
              number,
            ],
        ),
      ),
    );

    // Stone cutters swing their mallets together-ish (each has its own phase).
    this.cutters = new Crowd(workerGeometry('mallet'), Math.min(20, maxCharacters), 1, {
      speed: 5,
      leg: 0,
      arm: 1.3,
      armSync: 1,
    });
    const agents: Agent[] = Array.from({ length: Math.min(16, maxCharacters) }, (_, i) => {
      const x = -24 + i * 3.2;
      const z = -8 + (i % 3) * 1.5;
      return {
        place: (t: number) => ({
          x,
          y: 0,
          z,
          heading: Math.PI,
          bob: Math.max(0, Math.sin(t * 5 + i * 1.618)) * 0.06,
          lean: 0.12 + 0.1 * Math.sin(t * 5 + i * 1.618),
        }),
      };
    });
    this.cutters.setAgents(agents);
    this.scene.add(this.cutters.mesh);

    // Carriers walk freshly cut blocks from the cliff to the stockpile in the foreground.
    this.carriers = new Crowd(workerGeometry('load'), Math.min(12, maxCharacters));
    this.carriers.setAgents(
      Array.from({ length: Math.min(10, maxCharacters) }, (_, i) => {
        const z = 4 + (i % 3) * 1.6;
        const speed = 1.1 + (i % 4) * 0.12;
        return {
          place: (t: number) => {
            const x = -18 + ((t * speed + i * 4.3) % 36);
            return { x, y: 0, z, heading: Math.PI / 2, bob: Math.abs(Math.sin(t * 6 + i)) * 0.04 };
          },
        };
      }),
    );
    this.scene.add(this.carriers.mesh);
    // A few cut blocks and wooden levers lying about.
    const loose = soft({ map: tx.sandstoneFresh }, 0.2);
    for (const [x, z, ry] of [
      [-9, 9, 0.3],
      [-6.5, 10.5, -0.2],
      [-3, 8.5, 0.6],
      [2, 11, 0.1],
    ] as const) {
      const b = shadows(new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.9, 1.1, 2, 0.1), loose), true, true);
      b.position.set(x, 0.45, z);
      b.rotation.y = ry;
      this.scene.add(b);
    }
    const lever = shadows(
      new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, lpSeg(8, 3)), soft({ color: COLORS.wood })),
      true,
      false,
    );
    lever.position.set(-7.6, 0.9, 9.6);
    lever.rotation.set(0, 0.4, 1.2);
    this.scene.add(lever);
  }

  private readonly carriers: Crowd;

  update(ctx: FrameContext): void {
    const t = ctx.view.t;
    this.camera.position.set(lerp(-12, 12, t), 9, 19);
    this.camera.lookAt(lerp(-6, 8, t), 2.5, -6);
    if (!ctx.paused) {
      this.cutters.update(ctx.now / 1000);
      this.carriers.update(ctx.now / 1000);
    }
    const n = Math.min(80, 8 + Math.ceil(Math.log10(ctx.stockpile + 10) * 14));
    if (n !== this.lastBlocks) {
      this.lastBlocks = n;
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const layer = Math.floor(i / 16);
        const k = i % 16;
        m.makeRotationY(((k * 29) % 7) * 0.04);
        m.setPosition(6 + (k % 8) * 1.8 + layer * 0.4, layer * 0.9, 3 + Math.floor(k / 8) * 1.3);
        this.blocks.setMatrixAt(i, m);
      }
      this.blocks.count = n;
      this.blocks.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Canal with bamboo rafts carrying huge blocks, pole men, temple towers in the distance. */
export class RiverScene implements GameScene {
  readonly name = 'river';
  readonly scene = baseScene(55, 280, { center: [0, 0, 4], extent: 36 });
  readonly camera = camera(45);
  private readonly rafts: Crowd;
  private readonly polers: Crowd;
  private readonly water: THREE.Mesh;
  private raftCount = 0;

  constructor(maxCharacters: number) {
    const tx = textures();
    const banks = groundPlane(400, 400, soft({ map: repeated(tx.grass, 40, 40), roughness: 1 }, 0), 6);
    this.scene.add(banks);
    // Muddy banks along the canal.
    const mud = shadows(
      new THREE.Mesh(new THREE.PlaneGeometry(19, 400), soft({ color: 0x8f7048, roughness: 1 }, 0)),
      false,
      true,
    );
    mud.rotation.x = -Math.PI / 2;
    mud.position.y = 0.03;
    this.scene.add(mud);
    const waterTex = repeated(tx.water, 3, 40);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 400),
      new THREE.MeshStandardMaterial({
        map: waterTex,
        color: 0x4f9f98,
        roughness: 0.16,
        metalness: 0,
        envMapIntensity: 1.4,
      }),
    );
    shadows(this.water, false, true);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.05;
    this.scene.add(this.water);
    const r = seeded(21);
    const pts: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 70; i++) {
      const side = i % 2 ? 1 : -1;
      pts.push([side * (9 + r() * 20), 0, -180 + r() * 220, 0.8 + r() * 0.7]);
    }
    this.scene.add(scatter(palmGeometry(), pts.slice(0, 35), leafMaterial));
    this.scene.add(scatter(treeGeometry(), pts.slice(35)));
    this.scene.add(
      scatter(
        bushGeometry(),
        Array.from(
          { length: 50 },
          (_, i) =>
            [(i % 2 ? 1 : -1) * (10 + r() * 6), 0, -150 + r() * 190, 0.8 + r() * 0.6] as [
              number,
              number,
              number,
              number,
            ],
        ),
      ),
    );
    const towers = horizonTowers();
    towers.position.set(0, 0, -170);
    towers.scale.setScalar(1.6);
    this.scene.add(towers);

    this.rafts = new Crowd(raftGeometry(), 4, 1, { speed: 1, leg: 0, arm: 0, armSync: 0 });
    shadows(this.rafts.mesh, true, false);
    // Pole men push with both arms.
    this.polers = new Crowd(workerGeometry('pole'), Math.min(16, maxCharacters), 1, {
      speed: 2.2,
      leg: 0.12,
      arm: 0.9,
      armSync: 1,
    });
    this.scene.add(this.rafts.mesh, this.polers.mesh);
  }

  private setRafts(n: number): void {
    if (n === this.raftCount) return;
    this.raftCount = n;
    const rafts: Agent[] = [];
    const polers: Agent[] = [];
    for (let i = 0; i < n; i++) {
      const z0 = 20 - i * 26;
      const zAt = (t: number) => z0 - ((t * 1.2) % 60);
      rafts.push({
        place: (t) => ({
          x: i % 2 ? 1.5 : -1.5,
          y: 0.1,
          z: zAt(t),
          heading: 0,
          bob: Math.sin(t * 1.5 + i) * 0.05,
        }),
      });
      for (const [dx, dz] of [
        [-1.7, 2.8],
        [1.7, -2.8],
      ] as const)
        polers.push({
          place: (t) => ({
            x: (i % 2 ? 1.5 : -1.5) + dx,
            y: 0.35,
            z: zAt(t) + dz,
            heading: Math.PI,
            bob: Math.sin(t * 2 + dz) * 0.04,
            lean: 0.18,
          }),
        });
    }
    this.rafts.setAgents(rafts);
    this.polers.setAgents(polers);
  }

  update(ctx: FrameContext): void {
    this.setRafts(Math.max(1, Math.min(4, ctx.convoys.raft)));
    const time = ctx.now / 1000;
    const t = ctx.view.t;
    this.camera.position.set(lerp(7, 4, t), lerp(5, 7, t), 34 - t * 10);
    this.camera.lookAt(0, 1.5, 6 - t * 30);
    if (!ctx.paused) {
      const map = (this.water.material as THREE.MeshStandardMaterial).map;
      if (map) map.offset.y = (time * 0.02) % 1;
      this.rafts.update(time);
      this.polers.update(time);
    }
  }
}

/** Dirt road: elephants dragging blocks on log rollers, rope teams, ox-carts. */
export class HaulingScene implements GameScene {
  readonly name = 'hauling';
  readonly scene = baseScene(45, 240, { center: [0, 0, -4], extent: 28 });
  readonly camera = camera(45);
  private readonly elephants: Crowd;
  private readonly carts: Crowd;
  private readonly haulers: Crowd;
  private readonly sledges: THREE.InstancedMesh;
  private key = '';

  constructor(maxCharacters: number) {
    const tx = textures();
    const grass = groundPlane(400, 400, soft({ map: repeated(tx.grass, 40, 40), roughness: 1 }, 0), 9);
    this.scene.add(grass);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 400),
      soft({ map: repeated(tx.ground, 2, 60), roughness: 1 }, 0),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.03;
    shadows(road, false, true);
    this.scene.add(road);
    const r = seeded(33);
    this.scene.add(
      scatter(
        treeGeometry(),
        Array.from(
          { length: 60 },
          (_, i) =>
            [(i % 2 ? 1 : -1) * (8 + r() * 30), 0, -150 + r() * 190, 0.8 + r() * 0.8] as [
              number,
              number,
              number,
              number,
            ],
        ),
      ),
    );
    this.scene.add(
      scatter(
        bushGeometry(),
        Array.from(
          { length: 60 },
          (_, i) =>
            [(i % 2 ? 1 : -1) * (6.5 + r() * 14), 0, -120 + r() * 150, 0.7 + r() * 0.8] as [
              number,
              number,
              number,
              number,
            ],
        ),
      ),
    );
    const towers = horizonTowers();
    towers.position.set(-6, 0, -150);
    towers.scale.setScalar(1.4);
    this.scene.add(towers);

    this.elephants = new Crowd(elephantGeometry(), 6, 1, { speed: 2.4, leg: 0.3, arm: 0, armSync: 0 });
    this.carts = new Crowd(oxCartGeometry(), 6, 1, { speed: 3.2, leg: 0.4, arm: 0, armSync: 0 });
    // Rope teams lean into the pull, both arms on the rope.
    this.haulers = new Crowd(workerGeometry(), Math.min(40, maxCharacters), 1, {
      speed: 4.5,
      leg: 0.45,
      arm: 0.35,
      armSync: 1,
    });
    this.sledges = new THREE.InstancedMesh(sledgeGeometry(), figureMaterial, 12);
    this.sledges.count = 0;
    shadows(this.sledges, true, false);
    const rope = new THREE.CylinderGeometry(0.035, 0.035, 1, lpSeg(5, 3));
    rope.rotateX(Math.PI / 2);
    rope.translate(0, 0, 0.5);
    this.ropes = new THREE.InstancedMesh(rope, soft({ color: 0xa9844f }), 6);
    this.ropes.count = 0;
    this.ropes.frustumCulled = false;
    this.scene.add(this.elephants.mesh, this.carts.mesh, this.haulers.mesh, this.sledges, this.ropes);
  }

  private configure(elephants: number, carts: number, ropeTeams: number): void {
    const key = `${elephants},${carts},${ropeTeams}`;
    if (key === this.key) return;
    this.key = key;
    const speed = 0.9;
    // Convoys loop through a 36 m stretch of road in front of the camera.
    const zAt = (z0: number) => (t: number) => 12 - ((((12 - z0 + t * speed) % 36) + 36) % 36);
    this.elephants.setAgents(
      Array.from({ length: elephants }, (_, i) => {
        const z = zAt(10 - i * 14);
        return {
          place: (t: number) => ({
            x: -2,
            y: 0,
            z: z(t),
            heading: Math.PI,
            bob: Math.abs(Math.sin(t * 3 + i)) * 0.06,
          }),
        };
      }),
    );
    this.carts.setAgents(
      Array.from({ length: carts }, (_, i) => {
        const z = zAt(4 - i * 12);
        return {
          place: (t: number) => ({
            x: 2.8,
            y: 0,
            z: z(t),
            heading: Math.PI,
            bob: Math.abs(Math.sin(t * 4 + i)) * 0.04,
          }),
        };
      }),
    );
    const haulers: Agent[] = [];
    for (let team = 0; team < ropeTeams; team++) {
      for (let k = 0; k < 8; k++) {
        const z = zAt(18 - team * 16 - k * 1.1);
        haulers.push({
          place: (t: number) => ({
            x: 0.2 + (k % 2) * 0.8,
            y: 0,
            z: z(t),
            heading: Math.PI,
            bob: Math.abs(Math.sin(t * 4.5 + k)) * 0.04,
            lean: 0.32,
          }),
        });
      }
    }
    this.haulers.setAgents(haulers);
    this.sledgeZ = [
      ...Array.from({ length: elephants }, (_, i) => ({ x: -2, z: zAt(10 - i * 14 + 3.8), rope: 0 })),
      ...Array.from({ length: ropeTeams }, (_, t) => ({ x: 0.6, z: zAt(18 - t * 16 + 2), rope: 9.2 })),
    ].slice(0, 12);
  }

  private sledgeZ: Array<{ x: number; z: (t: number) => number; rope: number }> = [];
  private readonly ropes: THREE.InstancedMesh;

  update(ctx: FrameContext): void {
    const c = ctx.convoys;
    this.configure(
      Math.max(2, Math.min(4, c.elephants)),
      Math.max(1, Math.min(4, c.oxcart)),
      Math.max(1, Math.min(3, Math.ceil(c.workers / 3))),
    );
    const time = ctx.now / 1000;
    const t = ctx.view.t;
    this.camera.position.set(lerp(13, 9, t), 10, lerp(18, 10, t));
    this.camera.lookAt(-1, 0, lerp(-6, -12, t));
    if (!ctx.paused) {
      this.elephants.update(time);
      this.carts.update(time);
      this.haulers.update(time);
      const m = new THREE.Matrix4();
      let ropes = 0;
      this.sledgeZ.forEach((s, i) => {
        const z = s.z(time);
        m.makeTranslation(s.x, 0, z);
        this.sledges.setMatrixAt(i, m);
        if (s.rope > 0 && z - s.rope > -24 && ropes < 6) {
          // Rope from the front of the sledge to the lead hauler (convoy moves toward -Z).
          m.makeScale(1, 1, s.rope);
          m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
          m.setPosition(s.x, 0.95, z - 1.2);
          this.ropes.setMatrixAt(ropes++, m);
        }
      });
      this.sledges.count = this.sledgeZ.length;
      this.sledges.instanceMatrix.needsUpdate = true;
      this.ropes.count = ropes;
      this.ropes.instanceMatrix.needsUpdate = true;
    }
  }
}
