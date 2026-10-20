/**
 * PK's own trees (1.8.0: "replace all trees with 3D, keep the details"): every tree kind of
 * config/kingdom/props.json `trees` is drawn from PK's Meshy model — the model itself
 * (scripts/models/trees.mjs) for the trees nearest the view, as many as the `nearTris` budget
 * allows, and crossed picture cards of the same model (scripts/models/grassCards.mjs: 6 side
 * views and 2 from above, 8 triangles a tree) for the rest, so a whole forest keeps the model's
 * look and the frame budget. Where they grow is `treePlacement`: the forest's mix of kinds, a coconut palm and a
 * banana plant by every house of a hamlet of three or more, and now and then a palm or a
 * coconut beside the worn paths to a storehouse. A tree whose model has not loaded yet is
 * simply not drawn by this module (the built-in trees stand in until the models are in).
 */
import * as THREE from 'three';
import { shadeRadius, type TreeShade } from './treeShade';
import type { KingdomData } from '@temples/shared';
import { hash } from './detail';
import { meshOf } from './props';
import { addSway } from './flora';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { grassCardGeometry } from './elephantGrass';

/** The flat top card of a far tree sits this high in the crown (share of the tree's height). */
export const TREE_TOP_CARD = 0.62;

type SwayUniforms = { uTime: { value: number }; uWind: { value: number } };

/**
 * The picture-card trees' shader: the atlas row per tree (`aVariant`: two sets of views), the
 * flat top card shown only to a camera looking down, and the crown's sway (same as the models).
 */
function cardPatch(m: THREE.Material, sway: SwayUniforms | null, key: string): void {
  const U = sway ?? { uTime: { value: 0 }, uWind: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uWind;\nattribute float aKind;\nattribute float aVariant;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv.y = vMapUv.y * 0.5 + aVariant * 0.5;\n#endif',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 tO = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        if (aKind > 1.5) {
          vec3 tV = normalize(cameraPosition - tO);
          transformed *= smoothstep(0.42, 0.62, tV.y);
        }
        float ph = tO.x * 0.37 + tO.z * 0.23;
        float bend = max(0.0, position.y - 1.6) * 0.045 * uWind;
        transformed.x += sin(uTime * 1.7 + ph) * bend;
        transformed.z += cos(uTime * 1.3 + ph * 1.3) * bend * 0.7;`,
      );
  };
  m.customProgramCacheKey = () => key;
}

export type TreeCfg = NonNullable<KingdomData['props']['trees']>[number];
export type TreePlacement = NonNullable<KingdomData['props']['treePlacement']>;

/** A tree to draw: which model, where, turned and scaled (1 = the model's `height`), tinted. */
export interface TreeSpot {
  id: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** Brightness × (each tree its own shade). */
  shade: number;
}

/**
 * PK 2026-10-20 (D156) "Trees should not growing in water": how many tiles each tile is from
 * open water (0 = water, up to `max`), so trees on the bank are drawn smaller and stand back
 * from the edge instead of hanging their 20 m crowns over the river.
 */
export function waterDistance(map: { size: number; terrain: ArrayLike<string> }, max = 4): Uint8Array {
  const N = map.size;
  const d = new Uint8Array(N * N).fill(max);
  let front: number[] = [];
  for (let i = 0; i < N * N; i++)
    if (map.terrain[i] === 'water') {
      d[i] = 0;
      front.push(i);
    }
  for (let step = 1; step < max && front.length; step++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % N;
      const z = (i - x) / N;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (d[j]! > step) {
          d[j] = step;
          next.push(j);
        }
      }
    }
    front = next;
  }
  return d;
}

/** A tree this many tiles from the water is drawn this much of its size (1 well inland). */
export function shoreScale(tiles: number): number {
  return tiles <= 0 ? 0 : tiles === 1 ? 0.35 : tiles === 2 ? 0.55 : tiles === 3 ? 0.8 : 1;
}

/** Pick one of a weighted list by a number 0..1. */
export function pickWeighted<T extends { weight: number }>(list: readonly T[], r: number): T {
  const total = list.reduce((a, b) => a + b.weight, 0);
  let v = r * total;
  for (const e of list) {
    if (v < e.weight) return e;
    v -= e.weight;
  }
  return list[list.length - 1]!;
}

/** A building as these rules see it: type, centre (m), footprint (m). */
export interface Lot {
  type: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Inside a building's footprint (with a margin, m)? */
function inside(lots: readonly Lot[], x: number, z: number, margin: number): boolean {
  for (const b of lots)
    if (Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin) return true;
  return false;
}

/**
 * Hamlets: houses within `linkM` of each other form one group; every house of a group of at
 * least `minHouses` gets a coconut palm and a banana plant in its yard, behind or beside the
 * house (houses face east, +x), never inside a building or where `ok` says no (water).
 */
/**
 * D160 (PK: "in front of the royal hall better not mess up with trees"): the open court before
 * each royal hall (it faces +z): `halfWidth` m either side of its centre, from its centre out to
 * `depth` m. No yard tree, wayside palm, scattered plant or forest tree stands there.
 */
export function inHallFront(
  lots: ReadonlyArray<{ type: string; x: number; z: number }>,
  x: number,
  z: number,
  F: { halfWidth: number; depth: number } | undefined,
): boolean {
  if (!F) return false;
  for (const b of lots)
    if (b.type === 'townCentre' && Math.abs(x - b.x) <= F.halfWidth && z - b.z >= 0 && z - b.z <= F.depth)
      return true;
  return false;
}

export function villageTrees(
  lots: readonly Lot[],
  V: TreePlacement['village'],
  ok: (x: number, z: number) => boolean,
): TreeSpot[] {
  const houses = lots.filter((b) => V.houseTypes.includes(b.type));
  const parent = houses.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < houses.length; i++)
    for (let j = i + 1; j < houses.length; j++)
      if (Math.hypot(houses[i]!.x - houses[j]!.x, houses[i]!.z - houses[j]!.z) <= V.linkM)
        parent[find(i)] = find(j);
  const size = new Map<number, number>();
  houses.forEach((_, i) => size.set(find(i), (size.get(find(i)) ?? 0) + 1));
  const out: TreeSpot[] = [];
  houses.forEach((h, i) => {
    if ((size.get(find(i)) ?? 0) < V.minHouses) return;
    const r = (k: number) => hash(Math.round(h.x * 10), Math.round(h.z * 10), k);
    // D160 (PK: "decrease the trees in villages"): only `share` of the houses have yard trees.
    if (r(99) >= (V.share ?? 1)) return;
    const back = h.w / 2 + 1.6;
    const side = h.d / 2 + 1.4;
    // Coconut behind the house, banana to one side (or the other ones if those are taken).
    const coconutAt: Array<[number, number]> = [
      [h.x - back, h.z + side * 0.5],
      [h.x - back, h.z - side * 0.5],
      [h.x, h.z + side + 0.6],
      [h.x, h.z - side - 0.6],
    ];
    const bananaAt: Array<[number, number]> = [
      [h.x - back * 0.6, h.z - side],
      [h.x - back * 0.6, h.z + side],
      [h.x + 0.2, h.z - side],
      [h.x - back - 1.2, h.z],
    ];
    const place = (spots: Array<[number, number]>, id: string, k: number) => {
      for (const [x, z] of spots) {
        const jx = x + (r(k) - 0.5) * 0.8;
        const jz = z + (r(k + 1) - 0.5) * 0.8;
        if (inside(lots, jx, jz, 0.4) || !ok(jx, jz) || inHallFront(lots, jx, jz, V.hallFront)) continue;
        if (out.some((t) => Math.hypot(t.x - jx, t.z - jz) < 1.4)) continue;
        out.push({
          id,
          x: jx,
          y: 0,
          z: jz,
          rot: r(k + 2) * Math.PI * 2,
          scale: 0.85 + 0.3 * r(k + 3),
          shade: 0.92 + 0.16 * r(k + 4),
        });
        return;
      }
    };
    place(coconutAt, V.coconut, 10);
    place(bananaAt, V.banana[Math.floor(r(20) * V.banana.length) % V.banana.length]!, 30);
  });
  return out;
}

/**
 * Beside the worn paths near a storehouse: a tile of open land (wear below `clear`) within two
 * tiles of a worn one (above `worn`), within `radius` m of a storehouse, gets a palm or a coconut now and
 * then (`share` of such tiles, fixed per tile). `ok` says the land is open (no building, no water).
 */
export function waysideTrees(
  stores: ReadonlyArray<{ x: number; z: number }>,
  W: TreePlacement['wayside'],
  tile: number,
  half: number,
  wearAt: (tx: number, tz: number) => number,
  ok: (x: number, z: number) => boolean,
): TreeSpot[] {
  const out: TreeSpot[] = [];
  const seen = new Set<number>();
  const R = Math.ceil(W.radius / tile);
  for (const s of stores) {
    const cx = Math.floor((s.x + half) / tile);
    const cz = Math.floor((s.z + half) / tile);
    for (let tz = cz - R; tz <= cz + R; tz++)
      for (let tx = cx - R; tx <= cx + R; tx++) {
        const key = tz * 100003 + tx;
        if (seen.has(key)) continue;
        seen.add(key);
        if (hash(tx, tz, 401) >= W.share) continue;
        const x = (tx + 0.5) * tile - half;
        const z = (tz + 0.5) * tile - half;
        if (Math.hypot(x - s.x, z - s.z) > W.radius) continue;
        if (wearAt(tx, tz) >= W.clear) continue;
        // Next to a worn path: lean the tree away from it, to the far side of its own tile.
        let px = 0;
        let pz = 0;
        // (Within two tiles: the worn earth fades out over a tile at its edge.)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const)
          for (const k of [1, 2])
            if (wearAt(tx + dx * k, tz + dz * k) > W.worn) {
              px += dx;
              pz += dz;
              break;
            }
        if (!px && !pz) continue;
        const l = Math.hypot(px, pz) || 1;
        const fx = x - (px / l) * tile * 0.3;
        const fz = z - (pz / l) * tile * 0.3;
        if (!ok(fx, fz)) continue;
        const kind = pickWeighted(W.kinds, hash(tx, tz, 402));
        out.push({
          id: kind.id,
          x: fx,
          y: 0,
          z: fz,
          rot: hash(tx, tz, 403) * Math.PI * 2,
          scale: 0.85 + 0.3 * hash(tx, tz, 404),
          shade: 0.92 + 0.16 * hash(tx, tz, 405),
        });
      }
  }
  return out;
}

/** How a tree is drawn: the model itself, its lighter copy, or picture cards. */
export const NEAR = 0;
export const MID = 1;
export const FAR = 2;

/**
 * Near, middle or far (1.8.0: three steps): out from (cx, cz), the trees get the detailed model
 * while its triangles stay within `budget`, then the lighter copy while those stay within
 * `midBudget`, and the rest picture cards. A kind with no lighter copy (`midTrisOf` Infinity)
 * goes from the model straight to cards. Returns a level per spot.
 */
export function treeLevels(
  spots: readonly TreeSpot[],
  cx: number,
  cz: number,
  budget: number,
  trisOf: (id: string) => number,
  midBudget = 0,
  midTrisOf: (id: string) => number = () => Infinity,
): Uint8Array {
  const order = spots.map((s, i) => [Math.hypot(s.x - cx, s.z - cz), i] as const).sort((a, b) => a[0] - b[0]);
  const level = new Uint8Array(spots.length).fill(FAR);
  let used = 0;
  let k = 0;
  for (; k < order.length; k++) {
    const i = order[k]![1];
    const t = trisOf(spots[i]!.id);
    if (used + t > budget) break;
    used += t;
    level[i] = NEAR;
  }
  let mid = 0;
  for (; k < order.length; k++) {
    const i = order[k]![1];
    const t = midTrisOf(spots[i]!.id);
    if (!Number.isFinite(t)) continue; // no lighter copy: cards
    if (mid + t > midBudget) break;
    mid += t;
    level[i] = MID;
  }
  return level;
}

/** Near or far only (the two-step rule): a flag per spot, true = the detailed model. */
export function nearOrFar(
  spots: readonly TreeSpot[],
  cx: number,
  cz: number,
  budget: number,
  trisOf: (id: string) => number,
): boolean[] {
  return [...treeLevels(spots, cx, cz, budget, trisOf)].map((l) => l === NEAR);
}

interface Kind {
  cfg: TreeCfg;
  near: THREE.InstancedMesh;
  /** The lighter copy (1.8.0), drawn with the near model's material. */
  mid: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
  /** Which of the two sets of views each far tree shows. */
  variant: THREE.InstancedBufferAttribute;
  nearTris: number;
  /** Infinity until the lighter copy is in (or when the tree has none). */
  midTris: number;
  ready: boolean;
  /** D166: the fitted tree's height and crown width (m), for its painted shade. */
  height: number;
  width: number;
}

/**
 * D158: the alpha cut-out a near tree keeps from its model's material (leaf cards in an
 * alpha-masked atlas; glTF alphaMode MASK arrives as alphaTest). 0 for an opaque model.
 */
export function nearCutout(m: THREE.Material | null | undefined): number {
  const a = m?.alphaTest ?? 0;
  return a > 0 && a < 1 ? a : 0;
}

/**
 * Scale a model's geometry to `height` m (or smaller, so its crown is at most `width` m
 * across), its trunk on the origin, its foot on the ground. D159: `keepNormals` keeps the
 * model's own normals (the Blender trees' leaf cards face out of their round clumps, so the
 * crown shades softly like one mass instead of flat cards); otherwise they are worked out again.
 */
export function fitTree(
  src: THREE.BufferGeometry,
  height: number,
  width = Infinity,
  keepNormals = false,
): THREE.BufferGeometry {
  const g = src.clone();
  const keep = keepNormals && !!g.getAttribute('normal');
  for (const k of Object.keys(g.attributes))
    if (k !== 'position' && k !== 'uv' && !(keep && k === 'normal')) g.deleteAttribute(k);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const k = Math.min(
    height / Math.max(1e-6, b.max.y - b.min.y),
    width / Math.max(1e-6, b.max.x - b.min.x, b.max.z - b.min.z),
  );
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(k, k, k);
  if (!keep) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The trees drawn from PK's models: a near and a far instanced mesh per kind. */
export class ModelTrees {
  readonly group = new THREE.Group();
  readonly kinds = new Map<string, Kind>();
  /** How many kinds have their models in (the tests and the scene read it). */
  loaded = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly c = new THREE.Color();

  constructor(
    readonly trees: readonly TreeCfg[],
    readonly sway: { uTime: { value: number }; uWind: { value: number } } | null,
    capacity: number,
    shadows: boolean,
  ) {
    for (const cfg of trees) {
      const mk = (cap: number) => {
        const mesh = new THREE.InstancedMesh(
          new THREE.BufferGeometry(),
          new THREE.MeshStandardMaterial(),
          cap,
        );
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = shadows;
        mesh.receiveShadow = true;
        mesh.userData.seeThrough = true;
        mesh.userData.tree = cfg.id;
        this.group.add(mesh);
        return mesh;
      };
      this.kinds.set(cfg.id, {
        cfg,
        near: mk(Math.min(capacity, 400)),
        mid: mk(Math.min(capacity, 800)),
        far: mk(capacity),
        variant: new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1),
        nearTris: cfg.hi,
        midTris: Infinity,
        ready: false,
        height: cfg.height,
        width: cfg.width,
      });
    }
  }

  /**
   * Load every model and its picture cards in the background; a missing file leaves that kind
   * out (its trees are not drawn by this module until it is in).
   */
  load(url: (file: string) => string): Promise<void> {
    const one = async (kind: Kind) => {
      const [model, cards, lighter] = await Promise.all([
        new GLTFLoader()
          .loadAsync(url(kind.cfg.file))
          .then((g) => meshOf(g.scene))
          .catch(() => null),
        new THREE.TextureLoader().loadAsync(url(kind.cfg.cards)).catch(() => null),
        kind.cfg.midFile
          ? new GLTFLoader()
              .loadAsync(url(kind.cfg.midFile))
              .then((g) => meshOf(g.scene))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!model || !cards) return;
      // Near: PK's model itself, fitted to the tree's height (and crown width).
      const geo = model.geometry.clone();
      geo.applyMatrix4(model.matrixWorld);
      // D158: the Blender forest trees carry leaf cards (an alpha-masked leaf atlas); keep the
      // model's cut-out so the leaves are leaves, and cast shadows through the same cut-out;
      // D159: and keep their normals (out of each round leaf clump).
      const cut = nearCutout(model.material as THREE.Material);
      const fitted = fitTree(geo, kind.cfg.height, kind.cfg.width, cut > 0);
      geo.dispose();
      kind.near.geometry.dispose();
      kind.near.geometry = fitted;
      const map = (model.material as THREE.MeshStandardMaterial).map ?? null;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({
        map,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        alphaTest: cut,
      });
      if (this.sway) addSway(mat, this.sway, 'tree-model');
      (kind.near.material as THREE.Material).dispose();
      kind.near.material = mat;
      if (cut > 0 && map) {
        const nd = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          map,
          alphaTest: cut,
          side: THREE.DoubleSide,
        });
        if (this.sway) addSway(nd, this.sway, 'tree-model-depth');
        kind.near.customDepthMaterial = nd;
      }
      kind.nearTris = (fitted.index ? fitted.index.count : fitted.getAttribute('position').count) / 3;
      fitted.computeBoundingBox();
      const fb = fitted.boundingBox!;
      kind.height = fb.max.y - fb.min.y;
      kind.width = Math.max(fb.max.x - fb.min.x, fb.max.z - fb.min.z);
      // Middle: the lighter copy, fitted the same way, in the near model's material (its texture).
      if (lighter) {
        const lg = lighter.geometry.clone();
        lg.applyMatrix4(lighter.matrixWorld);
        const fm = fitTree(lg, kind.cfg.height, kind.cfg.width);
        lg.dispose();
        lighter.geometry.dispose();
        (lighter.material as THREE.Material).dispose();
        kind.mid.geometry.dispose();
        kind.mid.geometry = fm;
        (kind.mid.material as THREE.Material).dispose();
        kind.mid.material = mat;
        kind.midTris = (fm.index ? fm.index.count : fm.getAttribute('position').count) / 3;
      }
      // Far: crossed picture cards of the same model, as tall as the fitted model.
      fitted.computeBoundingBox();
      const h = fitted.boundingBox!.max.y - fitted.boundingBox!.min.y;
      const cardGeo = grassCardGeometry(kind.cfg.card, 1, true, TREE_TOP_CARD);
      cardGeo.scale(h, h, h);
      cardGeo.setAttribute('aVariant', kind.variant);
      kind.far.geometry.dispose();
      kind.far.geometry = cardGeo;
      cards.colorSpace = THREE.SRGBColorSpace;
      cards.anisotropy = 4;
      const cm = new THREE.MeshStandardMaterial({
        map: cards,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.95,
        metalness: 0,
        vertexColors: true,
      });
      cardPatch(cm, this.sway, 'tree-cards');
      (kind.far.material as THREE.Material).dispose();
      kind.far.material = cm;
      const depth = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: cards,
        alphaTest: 0.5,
      });
      cardPatch(depth, this.sway, 'tree-cards-depth');
      kind.far.customDepthMaterial = depth;
      kind.ready = true;
      this.loaded++;
    };
    return Promise.all([...this.kinds.values()].map(one)).then(() => undefined);
  }

  /** Is this kind's model in (so a tree of it can be drawn)? */
  has(id: string): boolean {
    return !!this.kinds.get(id)?.ready;
  }

  /**
   * Draw these trees: the nearest in detail within `budget` triangles, the next lighter within
   * `midBudget`, the rest as picture cards.
   */
  /** D166: the painted shade under every tree drawn (the phone: no real shadows). */
  groundShade: TreeShade | null = null;

  draw(spots: readonly TreeSpot[], cx: number, cz: number, budget: number, midBudget = 0): void {
    this.groundShade?.begin();
    const level = treeLevels(
      spots,
      cx,
      cz,
      budget,
      (id) => this.kinds.get(id)?.nearTris ?? Infinity,
      midBudget,
      (id) => this.kinds.get(id)?.midTris ?? Infinity,
    );
    const counts = new Map<THREE.InstancedMesh, number>();
    spots.forEach((t, i) => {
      const k = this.kinds.get(t.id);
      if (!k?.ready) return;
      const far = level[i] === FAR;
      const mesh = level[i] === NEAR ? k.near : far ? k.far : k.mid;
      const n = counts.get(mesh) ?? 0;
      if (n >= mesh.instanceMatrix.count) return;
      this.q.setFromAxisAngle(this.up, t.rot);
      this.m.compose(this.p.set(t.x, t.y, t.z), this.q, this.s.setScalar(t.scale));
      mesh.setMatrixAt(n, this.m);
      mesh.setColorAt(n, this.c.setScalar(t.shade));
      if (far) k.variant.setX(n, hash(Math.round(t.x * 3), Math.round(t.z * 3), 7) < 0.5 ? 0 : 1);
      counts.set(mesh, n + 1);
      if (this.groundShade)
        this.groundShade.add(t.x, t.y, t.z, shadeRadius(k.height * t.scale, k.width * t.scale, this.groundShade.cfg));
    });
    this.groundShade?.end();
    for (const k of this.kinds.values())
      for (const mesh of [k.near, k.mid, k.far]) {
        mesh.count = counts.get(mesh) ?? 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh === k.far) k.variant.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
  }

  /** Triangles drawn now (near, middle and far), for the budget check. */
  triangles(): number {
    let t = 0;
    for (const k of this.kinds.values())
      for (const mesh of [k.near, k.mid, k.far]) {
        const g = mesh.geometry;
        const n = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0);
        t += (n / 3) * mesh.count;
      }
    return t;
  }
}
