import { shoreDistance } from './water';
import type { KingdomData } from '@temples/shared';

/**
 * The Greater Angkor map (Khmer Kingdoms campaign, D53): one big tile grid laid out like
 * the Build tab's illustrated map (config/map.json × campaign.map.scale metres). Every
 * temple of the campaign has its site there, in the same arrangement; sites that would
 * overlap at game scale are nudged apart. The Siem Reap river and the Kulen canal with
 * fords, the Indratataka, East and West Barays (Lolei and East Mebon on their islands),
 * Angkor Wat's moat, the Kulen hills, the Tonle Sap shore, forests, laterite pits, the
 * Kulen sandstone quarry, gold and fruit trees. Tiles are 2 m; world (x, z) is centred.
 *
 * Also the grid pathfinder (A* with 8 directions, no corner cutting, then string-pulling)
 * used by every unit.
 */

export type XZ = [number, number];
export type Terrain = 'grass' | 'water' | 'ford' | 'forest' | 'rock' | 'ruin' | 'hill';
/** Gems (PK): sapphires and rubies, mined like gold and paid in gold. */
export type NodeKind = 'tree' | 'stone' | 'gold' | 'gems' | 'fruit' | 'fish' | 'meat';

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  tx: number;
  tz: number;
  amount: number;
}

/** Where a chapter's temple stands (tiles; top-left corner and size). */
export interface TempleSite {
  temple: string;
  chapter: number;
  tx: number;
  tz: number;
  w: number;
  d: number;
}

export interface MapData {
  size: number;
  tile: number;
  terrain: Terrain[];
  nodes: ResourceNode[];
  sites: TempleSite[];
  /** Royal hall of chapter 1 (tile). */
  start: XZ;
  /** Empire towns and temples to discover (world.json). */
  places: Array<{ id: string; tx: number; tz: number }>;
  /** The seed the resources and forests came from (saved, so a load rebuilds them). */
  seed: number;
  /** Anachak Khmer (D92): road tiles (1 = on a royal road), bridge tiles, and how to draw them. */
  road?: Uint8Array;
  bridge?: Uint8Array;
  roads?: RoadLayout;
}

/** The royal roads as laid on the map (Anachak Khmer, D92). */
export interface RoadLayout {
  /** Centre line of each route, in tiles (one point every half tile). */
  routes: Array<{ id: string; line: XZ[] }>;
  /** Bridges where a road crosses water: ends (tile coordinates), and a name if it has one. */
  bridges: Array<{ a: XZ; b: XZ; route: string; id?: string }>;
  /** Rest houses with fire (Jayavarman VII), beside the road. */
  rests: Array<{ tx: number; tz: number; heading: number; route: string }>;
}

/** Which roads to lay (Anachak Khmer): anachak.json "roads". */
export type RoadPlan = KingdomData['anachak']['roads'];

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Distance from point p to the segment a–b. */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Map units (config/map.json) → tile coordinates. */
export function unitsToTile(data: KingdomData, x: number, z: number): XZ {
  const m = data.campaign.map;
  const [ox, oz] = data.world.origin;
  return [Math.round((x * m.scale) / m.tile + ox), Math.round((z * m.scale) / m.tile + oz)];
}

/**
 * Temple sites: each temple at its map.json position, footprint from campaign.json; where
 * two would overlap (the Build map is not to scale), both are pushed apart along the line
 * between them until there is a clear gap. Deterministic.
 */
export function templeSites(data: KingdomData): TempleSite[] {
  const gap = 8; // tiles between neighbouring temples
  const list = data.campaign.chapters.map((c, i) => {
    const [ux, uz] = data.area.sites[c.temple]!;
    const [cx, cz] = unitsToTile(data, ux, uz);
    const pad = c.moat ? 5 : 0;
    return {
      temple: c.temple,
      chapter: i,
      cx,
      cz,
      w: c.footprint[0] + pad * 2,
      d: c.footprint[1] + pad * 2,
      pad,
    };
  });
  for (let iter = 0; iter < 200; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const ox = (a.w + b.w) / 2 + gap - Math.abs(a.cx - b.cx);
        const oz = (a.d + b.d) / 2 + gap - Math.abs(a.cz - b.cz);
        if (ox <= 0 || oz <= 0) continue;
        moved = true;
        // Separate along the axis that needs the smaller move.
        if (ox < oz) {
          const dir = a.cx === b.cx ? (i % 2 ? 1 : -1) : Math.sign(b.cx - a.cx);
          a.cx -= (dir * ox) / 2;
          b.cx += (dir * ox) / 2;
        } else {
          const dir = a.cz === b.cz ? (i % 2 ? 1 : -1) : Math.sign(b.cz - a.cz);
          a.cz -= (dir * oz) / 2;
          b.cz += (dir * oz) / 2;
        }
      }
    if (!moved) break;
  }
  const N = data.campaign.map.size;
  return list.map((s) => {
    const w = s.w - s.pad * 2;
    const d = s.d - s.pad * 2;
    const tx = Math.max(6, Math.min(N - w - 6, Math.round(s.cx - w / 2)));
    const tz = Math.max(6, Math.min(N - d - 6, Math.round(s.cz - d / 2)));
    return { temple: s.temple, chapter: s.chapter, tx, tz, w, d };
  });
}

/** Smooth value noise for forest patches. */
function noise(x: number, z: number, seed: number): number {
  const h = (i: number, j: number) => {
    const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * u;
  const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * u;
  return a + (b - a) * v;
}

/**
 * The Khmer Empire world (D60): the empire map PK sent (config/kingdom/world.json) on one
 * 1080-tile grid, with Greater Angkor (config/map.json) at its origin. Terrain (lake, sea,
 * rivers, mountain ranges, temple sites) is fixed; resources, forests and fish come from
 * `seed`, so every new game starts with a different layout (PK: random positions).
 */
const mapCache = new Map<string, MapData>();

/**
 * The world for a seed. Generating 1080 × 1080 tiles takes most of a second, so the last
 * few worlds are kept; each caller gets its own copy of the resource nodes (they are used
 * up during play), the terrain array is shared and read-only.
 */
export function generateMap(
  data: KingdomData,
  seed = data.campaign.map.seed,
  /** Anachak Khmer (D92): lay the royal roads and their places (Kingdom worlds stay as they were). */
  roads?: RoadPlan,
): MapData {
  const key = `${seed}|${data.world.size}|${roads ? 'roads' : ''}`;
  let m = mapCache.get(key);
  if (!m) {
    m = buildMap(data, seed, roads);
    mapCache.set(key, m);
    if (mapCache.size > 3) mapCache.delete(mapCache.keys().next().value!);
  }
  return { ...m, nodes: m.nodes.map((n) => ({ ...n })) };
}

function buildMap(data: KingdomData, seed: number, roadPlan?: RoadPlan): MapData {
  const cm = data.campaign.map;
  const W = data.world;
  const area = data.area;
  const N = cm.size;
  const T = cm.tile;
  const k = cm.scale / T; // tiles per map unit
  const r = rng(seed);
  const terrain: Terrain[] = new Array(N * N).fill('grass');
  const nodes: ResourceNode[] = [];
  const at = (x: number, z: number) => terrain[z * N + x];
  const set = (x: number, z: number, t: Terrain) => {
    if (x >= 0 && z >= 0 && x < N && z < N) terrain[z * N + x] = t;
  };
  const U = (ux: number, uz: number) => unitsToTile(data, ux, uz);
  const rect = (x0: number, z0: number, x1: number, z1: number, t: Terrain) => {
    for (let z = Math.max(0, Math.floor(z0)); z <= Math.min(N - 1, z1); z++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(N - 1, x1); x++) set(x, z, t);
  };
  const sites = templeSites(data);

  // The sea (Gulf of Thailand) in the south-west and south, with a wavy shore.
  for (let x = 0; x < N; x++) {
    const shore =
      (x < W.sea.bendX
        ? W.sea.westZ + x * W.sea.slope
        : W.sea.westZ + W.sea.bendX * W.sea.slope + (x - W.sea.bendX) * W.sea.eastSlope) +
      Math.sin(x * 0.045) * 6 +
      (noise(x * 0.03, 0.5, seed % 97) - 0.5) * 10;
    for (let z = Math.max(0, Math.floor(shore)); z < N; z++) set(x, z, 'water');
  }
  // The Tonle Sap: a long lake, north-west to south-east.
  {
    const { center, a, b, angle } = W.lake;
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const ext = Math.ceil(a) + 4;
    for (let z = Math.max(0, center[1] - ext); z < Math.min(N, center[1] + ext); z++)
      for (let x = Math.max(0, center[0] - ext); x < Math.min(N, center[0] + ext); x++) {
        const dx = x - center[0];
        const dz = z - center[1];
        const u = dx * c + dz * sn;
        const v = -dx * sn + dz * c;
        const wob = 1 + (noise(x * 0.04, z * 0.04, 5) - 0.5) * 0.12;
        if ((u / a) ** 2 + (v / b) ** 2 < wob) set(x, z, 'water');
      }
  }
  // Mountain ranges (not walkable) with passes, and the Cardamom massif.
  for (const rg of W.ranges) {
    for (let t = Math.max(0, rg.from); t < Math.min(N, rg.to); t++) {
      if (rg.passes.some(([p0, p1]) => t >= p0 && t <= p1)) continue;
      const line = rg.line + Math.sin(t / rg.period) * rg.wave;
      const half = rg.half * (0.8 + 0.4 * noise(t * 0.05, 1.5, 9));
      for (let o = Math.floor(line - half); o <= line + half; o++)
        if (rg.axis === 'x') set(t, o, 'hill');
        else set(o, t, 'hill');
    }
  }
  for (const m of W.massifs) {
    const [mx, mz] = m.center;
    for (let z = Math.max(0, mz - m.r[1] - 20); z < Math.min(N, mz + m.r[1] + 20); z++)
      for (let x = Math.max(0, mx - m.r[0] - 20); x < Math.min(N, mx + m.r[0] + 20); x++) {
        const d = Math.hypot((x - mx) / m.r[0], (z - mz) / m.r[1]);
        if (d < 1 + (noise(x * 0.05, z * 0.05, 13) - 0.5) * 0.5 && at(x, z) !== 'water') set(x, z, 'hill');
      }
  }
  // Kulen hills (north-east of Angkor): the plateau is not walkable.
  const [kx, kz] = U(area.kulen.x, area.kulen.z);
  const kr = area.kulen.radius * k * 0.5;
  for (let z = Math.max(0, Math.floor(kz - kr * 2)); z < Math.min(N, kz + kr * 2); z++)
    for (let x = Math.max(0, Math.floor(kx - kr * 2)); x < Math.min(N, kx + kr * 2); x++) {
      const d = Math.hypot(x - kx, (z - kz) * 1.2) / kr;
      if (d < 1 + (noise(x * 0.08, z * 0.08, 3) - 0.5) * 0.4) set(x, z, 'hill');
    }
  // Barays: straight-sided reservoirs.
  const baray = (b: { x: number; z: number; w: number; d: number }) => {
    const [x0, z0] = U(b.x - b.w / 2, b.z - b.d / 2);
    const [x1, z1] = U(b.x + b.w / 2, b.z + b.d / 2);
    rect(x0, z0, x1, z1, 'water');
    return { x0, z0, x1, z1 };
  };
  const barays = [baray(area.westBaray), baray(area.eastBaray), baray(area.indratataka)];
  // Rivers (tile polylines) with fords; only the tiles near each river are visited.
  const polyline = (tp: XZ[], width: number, fordEvery: number) => {
    const xs = tp.map((p) => p[0]);
    const zs = tp.map((p) => p[1]);
    const pad = Math.ceil(width) + 2;
    for (let z = Math.max(0, Math.min(...zs) - pad); z < Math.min(N, Math.max(...zs) + pad); z++)
      for (let x = Math.max(0, Math.min(...xs) - pad); x < Math.min(N, Math.max(...xs) + pad); x++) {
        let best = Infinity;
        let along = 0;
        let acc = 0;
        for (let i = 0; i < tp.length - 1; i++) {
          const [ax, az] = tp[i]!;
          const [bx, bz] = tp[i + 1]!;
          const d = segDist(x, z, ax, az, bx, bz);
          const len = Math.hypot(bx - ax, bz - az);
          if (d < best) {
            best = d;
            const t = Math.max(
              0,
              Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len || 1)),
            );
            along = acc + t * len;
          }
          acc += len;
        }
        if (best < width / 2) set(x, z, along % fordEvery < 4 ? 'ford' : 'water');
      }
  };
  for (const rv of W.rivers)
    polyline(
      rv.points.map(([x, z]) => [x, z] as XZ),
      rv.width,
      rv.fordEvery,
    );
  polyline(
    area.river.map(([x, z]) => U(x, z)),
    5,
    35,
  );
  polyline(
    area.canal.map(([x, z]) => U(x, z)),
    3,
    30,
  );

  // Temples: sites clear; island temples keep water round them with a causeway to the
  // south shore; Angkor Wat gets its moat and western causeway.
  for (const s of sites) {
    const c = data.campaign.chapters[s.chapter]!;
    const inWater = barays.find(
      (b) =>
        s.tx + s.w / 2 >= b.x0 && s.tx + s.w / 2 <= b.x1 && s.tz + s.d / 2 >= b.z0 && s.tz + s.d / 2 <= b.z1,
    );
    if (c.island) {
      // (The game-scale barays are narrower than the temples, so the ring is always cut.)
      rect(s.tx - 8, s.tz - 8, s.tx + s.w + 7, s.tz + s.d + 7, 'water');
      rect(s.tx - 3, s.tz - 3, s.tx + s.w + 2, s.tz + s.d + 2, 'grass');
      const mid = Math.floor(s.tx + s.w / 2);
      rect(mid - 2, s.tz + s.d + 3, mid + 2, Math.max(inWater ? inWater.z1 + 1 : 0, s.tz + s.d + 8), 'grass');
    } else rect(s.tx - 2, s.tz - 2, s.tx + s.w + 1, s.tz + s.d + 1, 'grass');
    if (c.moat) {
      for (let z = s.tz - 5; z <= s.tz + s.d + 4; z++)
        for (let x = s.tx - 5; x <= s.tx + s.w + 4; x++) {
          const inner = x >= s.tx - 2 && x <= s.tx + s.w + 1 && z >= s.tz - 2 && z <= s.tz + s.d + 1;
          if (!inner) set(x, z, 'water');
        }
      const midZ = Math.floor(s.tz + s.d / 2);
      rect(s.tx - 6, midZ - 2, s.tx - 2, midZ + 2, 'grass'); // western causeway (Angkor Wat faces west)
    }
  }
  // Grounds kept clear: the first royal hall, a new capital's hall, empire towns, rival camps.
  const start = U(cm.start[0], cm.start[1]);
  rect(start[0] - 7, start[1] - 7, start[0] + 7, start[1] + 7, 'grass');
  for (const c of data.campaign.chapters)
    if (c.event?.newHall) {
      const [hx, hz] = U(c.event.newHall[0], c.event.newHall[1]);
      rect(hx - 6, hz - 6, hx + 6, hz + 6, 'grass');
    }
  // Hidden places (PK) stay in their forest: no clearing, and older saves' worlds are unchanged.
  const places = [...W.places, ...(roadPlan?.places ?? [])]
    .filter((p) => !p.hidden)
    .map((p) => ({ id: p.id, tx: p.at[0], tz: p.at[1] }));
  for (const p of places) rect(p.tx - 5, p.tz - 5, p.tx + 5, p.tz + 5, 'grass');
  for (const o of data.campaign.opponents)
    rect(o.from[0] - 5, o.from[1] - 5, o.from[0] + 9, o.from[1] + 9, 'grass');
  // The royal roads (Anachak Khmer): laid before the forests grow, so the woods stand back.
  const laid = roadPlan ? layRoads(roadPlan, N, terrain) : null;
  const nearRoad = laid ? dilate(laid.road, N, 2) : null;

  const free = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N && at(x, z) === 'grass';
  const keepClear = (x: number, z: number, m: number) =>
    sites.some((s) => x >= s.tx - m && x < s.tx + s.w + m && z >= s.tz - m && z < s.tz + s.d + m) ||
    Math.hypot(x - start[0], z - start[1]) < 9 ||
    places.some((p) => Math.abs(x - p.tx) <= 6 && Math.abs(z - p.tz) <= 6) ||
    (nearRoad !== null && nearRoad[z * N + x] === 1) ||
    data.campaign.opponents.some(
      (o) => x >= o.from[0] - 6 && x <= o.from[0] + 10 && z >= o.from[1] - 6 && z <= o.from[1] + 10,
    );

  // Resources (random each game): some near the first hall so every start is fair, the
  // rest scattered over the land; Kulen sandstone near its hills.
  const cluster = (cx: number, cz: number, kind: NodeKind, amount: number, count: number) => {
    let placed = 0;
    for (let ring = 0; ring < 7 && placed < count; ring++)
      for (let dz = -ring; dz <= ring && placed < count; dz++)
        for (let dx = -ring; dx <= ring && placed < count; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring || (dx + dz) % 2) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (!free(x, z) || keepClear(x, z, 3)) continue;
          if (kind !== 'fruit') set(x, z, 'rock');
          nodes.push({ id: 0, kind, tx: x, tz: z, amount });
          placed++;
        }
    return placed;
  };
  const E = data.rules.economy;
  const amountOf = (kind: 'stone' | 'gold' | 'gems' | 'fruit') =>
    kind === 'stone' ? E.stoneRock : kind === 'gold' ? E.goldRock : kind === 'gems' ? E.gemRock : E.fruitBush;
  const R = W.resources;
  const landSpot = (tries: number, ok: (x: number, z: number) => boolean): XZ | null => {
    for (let i = 0; i < tries; i++) {
      const x = Math.floor(r() * N);
      const z = Math.floor(r() * N);
      if (free(x, z) && ok(x, z)) return [x, z];
    }
    return null;
  };
  for (const kind of ['stone', 'gold', 'fruit'] as const) {
    const near = R.nearStart[kind];
    for (let i = 0; near && i < near.n; i++) {
      for (let t = 0; t < 60; t++) {
        const a = r() * Math.PI * 2;
        const d = near.dist[0] + r() * (near.dist[1] - near.dist[0]);
        const x = Math.round(start[0] + Math.cos(a) * d);
        const z = Math.round(start[1] + Math.sin(a) * d);
        if (free(x, z) && !keepClear(x, z, 3) && cluster(x, z, kind, amountOf(kind), near.size) > 0) break;
      }
    }
    const sc = R.scattered[kind];
    for (let i = 0; sc && i < sc.n; i++) {
      const p = landSpot(200, (x, z) => !keepClear(x, z, 6));
      if (p) cluster(p[0], p[1], kind, amountOf(kind), sc.size);
    }
  }
  for (const [x, z] of cm.sandstone) {
    const [sx, sz] = U(x, z);
    const j = R.sandstoneJitter;
    cluster(
      Math.round(sx + (r() - 0.5) * 2 * j),
      Math.round(sz + (r() - 0.5) * 2 * j),
      'stone',
      E.stoneRock * 3,
      12,
    );
  }

  // Forests: noisy patches (the noise moves with the seed), denser in the rainforests.
  const off = (seed % 1000) * 0.37;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (!free(x, z) || keepClear(x, z, 4)) continue;
      let rain = 0;
      for (const f of W.rainforest)
        rain = Math.max(rain, 1 - Math.hypot(x - f.center[0], z - f.center[1]) / f.r);
      const v =
        noise(x * 0.045 + off, z * 0.045, 7) * 0.8 + noise(x * 0.16, z * 0.16 + off, 11) * 0.2 + rain * 0.25;
      if (v > 0.64 && r() < R.forestDensity + rain * R.rainforestBoost + (v - 0.64)) {
        set(x, z, 'forest');
        nodes.push({ id: 0, kind: 'tree', tx: x, tz: z, amount: E.treeWood });
      }
    }
  // Fish in the shallows: water tiles beside land, every so often.
  for (let z = 1; z < N - 1; z++)
    for (let x = 1; x < N - 1; x++) {
      if (at(x, z) !== 'water') continue;
      const land =
        at(x + 1, z) === 'grass' ||
        at(x - 1, z) === 'grass' ||
        at(x, z + 1) === 'grass' ||
        at(x, z - 1) === 'grass';
      if (!land) continue;
      if (r() * W.fish.every >= 1) continue;
      nodes.push({ id: 0, kind: 'fish', tx: x, tz: z, amount: W.fish.amount });
    }
  // Gems last (PK; added later), with their own random draws, so every earlier node keeps its
  // id and the same seed still rebuilds older saves' worlds.
  {
    const g = rng(seed + 9173);
    for (const [x, z] of R.gemFields) cluster(x, z, 'gems', E.gemRock * 2, 8);
    const sc = R.scattered.gems;
    for (let i = 0; sc && i < sc.n; i++)
      for (let t = 0; t < 200; t++) {
        const x = Math.floor(g() * N);
        const z = Math.floor(g() * N);
        if (free(x, z) && !keepClear(x, z, 6) && cluster(x, z, 'gems', E.gemRock, sc.size) > 0) break;
      }
  }
  nodes.forEach((n, i) => (n.id = i + 1));
  const out: MapData = { size: N, tile: T, terrain, nodes, sites, start, places, seed };
  if (laid) Object.assign(out, laid);
  return out;
}

/**
 * Lay the royal roads on the terrain (Anachak Khmer, D92): a strip `width` tiles wide along
 * each route; forest, rock and hill give way to the road; water under it becomes a bridge
 * (walkable, still drawn as water). A named bridge (Spean Praptos) gets its stream first.
 */
export function layRoads(
  plan: RoadPlan,
  N: number,
  terrain: Terrain[],
): { road: Uint8Array; bridge: Uint8Array; roads: RoadLayout } {
  const road = new Uint8Array(N * N);
  const bridge = new Uint8Array(N * N);
  const layout: RoadLayout = { routes: [], bridges: [], rests: [] };
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N;
  const half = (plan.width - 1) / 2;
  // Streams under named bridges, across the road.
  for (const rt of plan.routes) {
    const b = rt.bridge;
    if (!b) continue;
    const i = Math.max(
      1,
      rt.points.findIndex(([x, z]) => x === b.at[0] && z === b.at[1]),
    );
    const [ax, az] = rt.points[i - 1]!;
    const [bx, bz] = rt.points[Math.min(i, rt.points.length - 1)]!;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const [px, pz] = [-(bz - az) / len, (bx - ax) / len];
    for (let t = -b.streamTiles / 2; t <= b.streamTiles / 2; t += 0.5)
      for (const w of [0, 1]) {
        const x = Math.round(b.at[0] + px * t + ((bx - ax) / len) * w);
        const z = Math.round(b.at[1] + pz * t + ((bz - az) / len) * w);
        if (inside(x, z)) terrain[z * N + x] = 'water';
      }
  }
  for (const rt of plan.routes) {
    const line: XZ[] = [];
    for (let i = 1; i < rt.points.length; i++) {
      const [ax, az] = rt.points[i - 1]!;
      const [bx, bz] = rt.points[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len * 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++)
        line.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    layout.routes.push({ id: rt.id, line });
    // A bridge is a run of the centre line over water.
    let run: XZ | null = null;
    let prev: XZ | null = null;
    let along = 0;
    let side = 1;
    let nextRest = plan.restEvery / 2;
    for (let i = 0; i < line.length; i++) {
      const [x, z] = line[i]!;
      const nx = line[Math.min(i + 1, line.length - 1)]!;
      const pv = line[Math.max(i - 1, 0)]!;
      const dl = Math.hypot(nx[0] - pv[0], nx[1] - pv[1]) || 1;
      const dir: XZ = [(nx[0] - pv[0]) / dl, (nx[1] - pv[1]) / dl];
      const cx = Math.round(x);
      const cz = Math.round(z);
      const wet = inside(cx, cz) && (terrain[cz * N + cx] === 'water' || bridge[cz * N + cx] === 1);
      if (wet && !run) run = [x, z];
      if (!wet && run) {
        layout.bridges.push({ a: run, b: prev ?? run, route: rt.id, id: bridgeName(rt, run, prev ?? run) });
        run = null;
      }
      for (let w = -half - 0.5; w <= half + 0.5; w += 0.5) {
        const tx = Math.round(x - dir[1] * w);
        const tz = Math.round(z + dir[0] * w);
        if (!inside(tx, tz)) continue;
        const j = tz * N + tx;
        road[j] = 1;
        const t = terrain[j];
        if (t === 'water') {
          bridge[j] = 1;
          terrain[j] = 'ford';
        } else if (t === 'forest' || t === 'rock' || t === 'hill' || t === 'ruin') terrain[j] = 'grass';
      }
      if (prev) along += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      if (along >= nextRest && i < line.length - 4) {
        nextRest += plan.restEvery;
        const off = half + 3;
        const tx = Math.round(x - dir[1] * off * side);
        const tz = Math.round(z + dir[0] * off * side);
        if (inside(tx, tz) && terrain[tz * N + tx] !== 'water' && !bridge[tz * N + tx]) {
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++)
              if (inside(tx + dx, tz + dz) && terrain[(tz + dz) * N + tx + dx] !== 'water')
                terrain[(tz + dz) * N + tx + dx] = 'grass';
          layout.rests.push({ tx, tz, heading: Math.atan2(dir[0] * side, dir[1] * side), route: rt.id });
          side = -side;
        }
      }
    }
    if (run)
      layout.bridges.push({ a: run, b: prev ?? run, route: rt.id, id: bridgeName(rt, run, prev ?? run) });
  }
  return { road, bridge, roads: layout };
}

/** The bridge's own name if this crossing is the route's named bridge. */
function bridgeName(rt: RoadPlan['routes'][number], a: XZ, b: XZ): string | undefined {
  const at = rt.bridge?.at;
  if (!at) return undefined;
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[1] + b[1]) / 2;
  return Math.hypot(mx - at[0], mz - at[1]) < 6 ? rt.bridge!.id : undefined;
}

/** Grow a 0/1 mask by r tiles (square). */
function dilate(mask: Uint8Array, N: number, r: number): Uint8Array {
  const out = new Uint8Array(N * N);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (!mask[z * N + x]) continue;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const X = x + dx;
          const Z = z + dz;
          if (X >= 0 && Z >= 0 && X < N && Z < N) out[Z * N + X] = 1;
        }
    }
  return out;
}

// ---------------------------------------------------------------- coordinates

export function tileToWorld(map: { size: number; tile: number }, tx: number, tz: number): XZ {
  const half = (map.size * map.tile) / 2;
  return [(tx + 0.5) * map.tile - half, (tz + 0.5) * map.tile - half];
}

export function worldToTile(map: { size: number; tile: number }, x: number, z: number): XZ {
  const half = (map.size * map.tile) / 2;
  return [Math.floor((x + half) / map.tile), Math.floor((z + half) / map.tile)];
}

// ---------------------------------------------------------------- pathfinding

/** Walkability grid: 1 = open. Buildings and resources are stamped in by the simulation. */
export class Grid {
  readonly open: Uint8Array;
  /** Open water that people can cross on bamboo rafts (PK); never built on. */
  readonly water: Uint8Array;
  /** Path cost of a water tile (a raft is slower than walking). */
  waterCost = 2.5;
  /** Royal road tiles (Anachak Khmer, D92) and their path cost (below 1: people prefer them). */
  road: Uint8Array | null = null;
  roadCost = 1;
  constructor(
    readonly size: number,
    readonly tile: number,
  ) {
    this.open = new Uint8Array(size * size);
    this.water = new Uint8Array(size * size);
  }
  static fromMap(map: MapData): Grid {
    const g = new Grid(map.size, map.tile);
    map.terrain.forEach((t, i) => {
      g.open[i] = t === 'grass' || t === 'ford' ? 1 : 0;
      g.water[i] = t === 'water' ? 1 : 0;
    });
    g.road = map.road ?? null;
    return g;
  }
  ok(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size && z < this.size && this.open[z * this.size + x] === 1;
  }
  /** Can a walker (or, with rafts, a rafter) pass this tile? */
  pass(x: number, z: number, rafts: boolean): boolean {
    if (this.ok(x, z)) return true;
    return rafts && x >= 0 && z >= 0 && x < this.size && z < this.size && this.water[z * this.size + x] === 1;
  }
  private shoreD: Uint8Array | null = null;
  /** Tiles from this water tile to the nearest land (0 on land); PK 1.8.0 water depth. */
  shore(x: number, z: number): number {
    if (!this.isWater(x, z)) return 0;
    this.shoreD ??= shoreDistance(this.water, this.size);
    return this.shoreD[z * this.size + x]!;
  }
  isWater(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size && z < this.size && this.water[z * this.size + x] === 1;
  }
  setRect(tx: number, tz: number, w: number, d: number, open: boolean): void {
    for (let z = tz; z < tz + d; z++)
      for (let x = tx; x < tx + w; x++)
        if (x >= 0 && z >= 0 && x < this.size && z < this.size) this.open[z * this.size + x] = open ? 1 : 0;
  }
  /** Straight walk between two tiles never touches a blocked tile. */
  lineOk(ax: number, az: number, bx: number, bz: number, rafts = false): boolean {
    const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 2);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      // Check the tiles a unit's body would brush.
      for (const [ox, oz] of [
        [0.3, 0.3],
        [-0.3, 0.3],
        [0.3, -0.3],
        [-0.3, -0.3],
      ] as const)
        if (!this.pass(Math.floor(x + 0.5 + ox), Math.floor(z + 0.5 + oz), rafts)) return false;
    }
    return true;
  }
}

/** Target area for a path: any open tile inside the rectangle grown by `pad` counts. */
export interface Goal {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

class Heap {
  private readonly a: number[] = [];
  constructor(private readonly f: Float32Array) {}
  get size(): number {
    return this.a.length;
  }
  push(i: number): void {
    const a = this.a;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]!]! <= this.f[a[k]!]!) break;
      [a[p], a[k]] = [a[k]!, a[p]!];
      k = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.f[a[l]!]! < this.f[a[m]!]!) m = l;
        if (r < a.length && this.f[a[r]!]! < this.f[a[m]!]!) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k]!, a[m]!];
        k = m;
      }
    }
    return top;
  }
}

/**
 * Tiles from the start tile to the nearest open tile inside the goal rectangle (grown by
 * one tile, so a blocked tree or building can be reached from beside it). Returns tile
 * centres after string-pulling, or null when unreachable. `limit` caps the search.
 */
const cache = new Map<
  number,
  { g: Float32Array; f: Float32Array; came: Int32Array; seen: Uint32Array; done: Uint32Array; gen: number }
>();
function buffers(N: number) {
  let b = cache.get(N);
  if (!b) {
    const n = N * N;
    b = {
      g: new Float32Array(n),
      f: new Float32Array(n),
      came: new Int32Array(n),
      seen: new Uint32Array(n),
      done: new Uint32Array(n),
      gen: 0,
    };
    cache.set(N, b);
  }
  return b;
}

export function findPath(
  grid: Grid,
  from: XZ,
  goal: Goal,
  limit = 60000,
  pad = 1,
  /** People may cross water on bamboo rafts (PK), at a higher cost than walking. */
  rafts = false,
): XZ[] | null {
  const N = grid.size;
  const [sx, sz] = from;
  const inGoal = (x: number, z: number) =>
    x >= goal.x0 - pad && x <= goal.x1 + pad && z >= goal.z0 - pad && z <= goal.z1 + pad;
  if (inGoal(sx, sz)) return [];
  const gx = (goal.x0 + goal.x1) / 2;
  const gz = (goal.z0 + goal.z1) / 2;
  // Search arrays are reused between calls (a big map would otherwise allocate megabytes
  // per path); a generation stamp marks which entries belong to this search.
  const B = buffers(N);
  const gen = ++B.gen;
  const { g, f, came, seen, done } = B;
  const G = (i: number) => (seen[i] === gen ? g[i]! : Infinity);
  const start = sz * N + sx;
  g[start] = 0;
  seen[start] = gen;
  came[start] = -1;
  const h = (x: number, z: number) => {
    const dx = Math.max(goal.x0 - x, 0, x - goal.x1);
    const dz = Math.max(goal.z0 - z, 0, z - goal.z1);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  f[start] = h(sx, sz);
  const open = new Heap(f);
  open.push(start);
  let best = start;
  let bestH = Infinity;
  let steps = 0;
  while (open.size && steps++ < limit) {
    const cur = open.pop();
    if (done[cur] === gen) continue;
    done[cur] = gen;
    const cx = cur % N;
    const cz = (cur / N) | 0;
    if (inGoal(cx, cz) && (grid.ok(cx, cz) || cur === start))
      return pull(grid, from, trace(came, cur, N), rafts);
    const hh = Math.hypot(cx - gx, cz - gz);
    if (hh < bestH) {
      bestH = hh;
      best = cur;
    }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (!grid.pass(nx, nz, rafts)) continue;
        if (dx && dz && (!grid.pass(cx + dx, cz, rafts) || !grid.pass(cx, cz + dz, rafts))) continue; // no corner cutting
        const ni = nz * N + nx;
        if (done[ni] === gen) continue;
        const ng =
          g[cur]! +
          (dx && dz ? 1.414 : 1) *
            (rafts && grid.isWater(nx, nz) ? grid.waterCost : grid.road?.[ni] ? grid.roadCost : 1);
        if (ng < G(ni)) {
          g[ni] = ng;
          seen[ni] = gen;
          came[ni] = cur;
          f[ni] = ng + h(nx, nz);
          open.push(ni);
        }
      }
  }
  // Unreachable: walk as close as possible (e.g. a target behind water).
  return best === start ? null : pull(grid, from, trace(came, best, N), rafts);
}

function trace(came: Int32Array, end: number, N: number): XZ[] {
  const out: XZ[] = [];
  for (let c = end; c !== -1; c = came[c]!) out.push([c % N, (c / N) | 0]);
  return out.reverse();
}

/** Drop waypoints that a straight walk can skip. */
function pull(grid: Grid, from: XZ, tiles: XZ[], rafts = false): XZ[] {
  const pts = tiles.slice(1);
  if (!pts.length) return pts;
  const out: XZ[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !grid.lineOk(anchor[0], anchor[1], pts[j]![0], pts[j]![1], rafts)) j--;
    out.push(pts[j]!);
    anchor = pts[j]!;
    i = j + 1;
  }
  return out;
}
