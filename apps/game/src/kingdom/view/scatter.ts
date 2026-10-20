import * as THREE from 'three';
import type { ScatterKind } from '@temples/shared';
import type { MapData, Terrain } from '../sim/map';
import { loadProp, meshOf, realMaterial } from './props';
import { waterDistance } from './treeModels';

/**
 * PK 1.9.0 (D153): PK's plants, rocks, flowers and small life laid over the land in natural
 * patterns — clumps in the forest, shrubs and flowers along its edge, reeds on the shores,
 * lotus and lily pads in still water, boulders on the hills and ruins, rare fantasy finds deep
 * in the forest. The plan is pure and repeatable (the map's seed); `ScatterView` draws only
 * the nearest of each kind, one instanced mesh a kind, and keeps clear of buildings.
 */

export interface Spot {
  kind: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

/** A small repeatable random (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Map = Pick<MapData, 'size' | 'tile' | 'terrain' | 'road' | 'start'>;

/**
 * D165: the phone's lighter scenery — the same kinds in the same places (the plan does not
 * change), drawn within `radius` m of the view and `share` of each kind's count (at least one).
 */
export function scatterForPreset<K extends { maxVisible: number }, C extends { radius: number }>(
  kinds: readonly K[],
  cfg: C,
  g: { scatterRadius?: number; scatterShare?: number },
): { kinds: K[]; cfg: C } {
  const share = g.scatterShare ?? 1;
  return {
    kinds: kinds.map((k) => (share >= 1 ? k : { ...k, maxVisible: Math.max(1, Math.round(k.maxVisible * share)) })),
    cfg: g.scatterRadius ? { ...cfg, radius: Math.min(cfg.radius, g.scatterRadius) } : cfg,
  };
}

/** Does a tile belong to a habitat? */
export function inHabitat(map: Map, tx: number, tz: number, habitat: ScatterKind['habitat']): boolean {
  const N = map.size;
  if (tx < 1 || tz < 1 || tx >= N - 1 || tz >= N - 1) return false;
  const t = map.terrain[tz * N + tx]!;
  const on = (dx: number, dz: number, k: Terrain) => map.terrain[(tz + dz) * N + tx + dx] === k;
  const near = (k: Terrain) => on(1, 0, k) || on(-1, 0, k) || on(0, 1, k) || on(0, -1, k);
  if (map.road?.[tz * N + tx]) return false;
  switch (habitat) {
    case 'forest':
      return t === 'forest';
    case 'forestEdge':
      return t === 'grass' && near('forest');
    case 'grass':
      return t === 'grass' && !near('water');
    case 'shore':
      return t === 'grass' && near('water');
    case 'pond':
      return t === 'water' && (near('grass') || near('forest'));
    case 'hill':
      return t === 'hill' || t === 'rock';
    case 'ruin':
      return t === 'ruin';
    case 'village': {
      const [sx, sz] = map.start;
      const d = Math.hypot(tx - sx, tz - sz);
      return t === 'grass' && d > 6 && d < 40;
    }
  }
}

/** Every spot on the map, kind by kind (same seed → same land). */
export function scatterPlan(
  map: Map,
  kinds: readonly ScatterKind[],
  seed: number,
  clearHall: number,
): Spot[] {
  const out: Spot[] = [];
  const N = map.size;
  const T = map.tile;
  const half = (N * T) / 2;
  const [sx, sz] = map.start;
  const wet = kinds.some((k) => k.dry) ? waterDistance(map) : null;
  const dryOk = (k: ScatterKind, tile: number) => !k.dry || !wet || wet[tile]! >= k.dry;
  kinds.forEach((k, ki) => {
    const r = rng(seed * 31 + ki * 977 + 13);
    // Tiles of the habitat (sampled every other tile on big maps: the plan stays quick).
    const step = N > 400 ? 2 : 1;
    const tiles: number[] = [];
    for (let tz = 1; tz < N - 1; tz += step)
      for (let tx = 1; tx < N - 1; tx += step) {
        if (Math.hypot(tx - sx, tz - sz) < clearHall) continue;
        if (inHabitat(map, tx, tz, k.habitat) && dryOk(k, tz * N + tx)) tiles.push(tz * N + tx);
      }
    if (!tiles.length) return;
    const clumps = k.rare ? 1 : Math.max(1, Math.round(((tiles.length * step * step) / 1000) * k.per1k));
    for (let c = 0; c < clumps; c++) {
      const tile = tiles[Math.floor(r() * tiles.length)]!;
      const cx = (tile % N) + 0.5;
      const cz = Math.floor(tile / N) + 0.5;
      const n = k.clump[0] + Math.floor(r() * (k.clump[1] - k.clump[0] + 1));
      for (let i = 0; i < n; i++) {
        // Denser in the middle of a clump (a natural patch, not a grid).
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * k.spread;
        const x = cx * T - half + Math.cos(a) * d;
        const z = cz * T - half + Math.sin(a) * d;
        // Stay in the habitat (a shore plant never walks into the water, a lily never onto land).
        const ttx = Math.floor((x + half) / T);
        const ttz = Math.floor((z + half) / T);
        if (!inHabitat(map, ttx, ttz, k.habitat) || !dryOk(k, ttz * N + ttx)) continue;
        out.push({
          kind: ki,
          x,
          z,
          rot: r() * Math.PI * 2,
          scale: k.scale[0] + r() * (k.scale[1] - k.scale[0]),
        });
      }
    }
  });
  return out;
}

/**
 * The nearest spots of one kind within `radius` of a point, at most `max`, skipping those
 * within `clear` m of a building centre (buildings: [x, z, half-size]).
 */
export function nearestSpots(
  spots: readonly Spot[],
  x: number,
  z: number,
  radius: number,
  max: number,
  buildings: ReadonlyArray<readonly [number, number, number]>,
  clear: number,
): Spot[] {
  const r2 = radius * radius;
  const pick: Array<[number, Spot]> = [];
  for (const s of spots) {
    const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d2 > r2) continue;
    if (buildings.some(([bx, bz, h]) => Math.abs(s.x - bx) < h + clear && Math.abs(s.z - bz) < h + clear))
      continue;
    pick.push([d2, s]);
  }
  pick.sort((a, b) => a[0] - b[0]);
  return pick.slice(0, max).map((p) => p[1]);
}

/**
 * Where the scatter is picked round. RTS: where the view meets the ground (or 40 m ahead when it
 * looks level). The 3D hero mode (PK 2026-10-20, D156): round the hero himself — the camera
 * looks nearly level there, so its ray met the ground far ahead and the trees right by him were
 * never among the nearest: they stayed invisible.
 */
export function scatterCentre(
  hero: boolean,
  look: readonly [number, number],
  cam: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
): [number, number] {
  if (hero) return [look[0], look[1]];
  const k = dir.y < -0.05 ? Math.min(400, cam.y / -dir.y) : 40;
  return [cam.x + dir.x * k, cam.z + dir.z * k];
}

/** Draws the scatter: one instanced mesh a kind, filled with the nearest spots. */
export class ScatterView {
  readonly group = new THREE.Group();
  private readonly meshes: Array<THREE.InstancedMesh | null>;
  private readonly byKind: Spot[][];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly sv = new THREE.Vector3();
  private last = -1e9;

  constructor(
    readonly kinds: readonly ScatterKind[],
    spots: readonly Spot[],
    private readonly cfg: { radius: number; everySec: number; clearBuilding: number },
    private readonly url: (file: string) => string,
  ) {
    this.group.name = 'scatter';
    this.byKind = kinds.map(() => []);
    for (const s of spots) this.byKind[s.kind]!.push(s);
    this.meshes = kinds.map(() => null);
    kinds.forEach((k, i) => {
      if (!this.byKind[i]!.length) return;
      void loadProp(this.url(k.file)).then((model) => {
        const src = model && meshOf(model);
        if (!src) return;
        const geo = src.geometry.clone();
        geo.applyMatrix4(src.matrixWorld);
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        // Base on the ground, centred on its trunk; sunk by `sink` of its height.
        geo.translate(
          -(bb.min.x + bb.max.x) / 2,
          -bb.min.y - k.sink * (bb.max.y - bb.min.y),
          -(bb.min.z + bb.max.z) / 2,
        );
        const mesh = new THREE.InstancedMesh(geo, realMaterial(src.material as THREE.Material), k.maxVisible);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.name = `scatter:${k.id}`;
        // D160: PK's models are cover too: they open round the people (view/seeThrough.ts).
        mesh.userData.seeThrough = true;
        this.meshes[i] = mesh;
        this.group.add(mesh);
        this.last = -1e9;
      });
    });
  }

  /** How many are drawn now (for the budget meter and the tests). */
  get shown(): number {
    return this.meshes.reduce((a, m) => a + (m?.count ?? 0), 0);
  }

  /** Re-pick the nearest spots now and then. */
  update(
    now: number,
    cx: number,
    cz: number,
    groundY: (x: number, z: number) => number,
    buildings: ReadonlyArray<readonly [number, number, number]>,
  ): void {
    if (now - this.last < this.cfg.everySec) return;
    this.last = now;
    this.kinds.forEach((k, i) => {
      const mesh = this.meshes[i];
      if (!mesh) return;
      const near = nearestSpots(
        this.byKind[i]!,
        cx,
        cz,
        this.cfg.radius,
        k.maxVisible,
        buildings,
        this.cfg.clearBuilding,
      );
      near.forEach((s, j) => {
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), s.rot);
        this.sv.setScalar(s.scale);
        this.m.compose(this.v.set(s.x, groundY(s.x, s.z), s.z), this.q, this.sv);
        mesh.setMatrixAt(j, this.m);
      });
      mesh.count = near.length;
      // D165: a kind with none near costs no draw call.
      mesh.visible = near.length > 0;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  dispose(): void {
    for (const m of this.meshes) {
      if (!m) continue;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
    this.group.clear();
  }
}
