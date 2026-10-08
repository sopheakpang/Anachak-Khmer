import { waterDepth, waterSpeed, waterWay, type WaterWay } from './water';
import {
  RESOURCES,
  eraContent,
  type AnimalKind,
  type Chapter,
  type Cost,
  type KingdomData,
  type KingdomRules,
  type Opponent,
  type Resource,
} from '@temples/shared';
import {
  findPath,
  generateMap,
  Grid,
  rng,
  tileToWorld,
  worldToTile,
  type Goal,
  type MapData,
  type NodeKind,
  type ResourceNode,
  type Terrain,
  type XZ,
  unitsToTile,
  type TempleSite,
} from './map';
import { Market, updateBaskets, type Order } from './market';
import { rahatSpot, riceStage } from './rice';
import { runDecree } from './decree';
import { ceremonyBuff, updateCeremonies } from './ceremony';
import { updateRoads } from './anachak';
import { updateExchange } from './exchange';

/**
 * Khmer Kingdoms simulation (the RTS tab, v0.1): pure rules, no 3D, fully unit-tested.
 * Villagers gather food, wood, stone and gold and carry it to a drop-off; buildings are
 * placed as foundations and raised by builders in stages; the royal hall and war camp
 * train units; technologies change rates; soldiers fight; a rival chiefdom (gameplay
 * fiction, see rules.json) sends raids; fog of war hides what no one sees. Every number
 * comes from config/kingdom/*.json.
 */

export type Team = 0 | 1;
export const PLAYER: Team = 0;
export const RIVAL: Team = 1;

export type Task =
  | { kind: 'idle' }
  | { kind: 'move'; to: XZ; attackMove?: boolean }
  | {
      kind: 'gather';
      node: number | null;
      field: number | null;
      res: Resource;
      phase: 'go' | 'work' | 'return';
      near: XZ;
      /** What kind of node to look for when this one runs out (fish, meat, fruit…). */
      nodeKind?: NodeKind;
    }
  | { kind: 'hunt'; animal: number }
  | { kind: 'build'; building: number }
  | { kind: 'attack'; unit?: number; building?: number }
  /** An ox-cart taking timber from a lumber camp to the store (PK: wood goes by cart). */
  | { kind: 'haul'; camp: number; phase: 'load' | 'deliver'; until?: number };

export interface Unit {
  id: number;
  type: string;
  team: Team;
  x: number;
  z: number;
  hp: number;
  heading: number;
  task: Task;
  path: XZ[] | null;
  repathAt: number;
  carry: { res: Resource; n: number } | null;
  ready: number;
  /** What the unit is doing this moment (for animation). */
  anim: 'idle' | 'walk' | 'gather' | 'build' | 'attack';
  /** Raid unit: which wave, for retreat. */
  wave?: number;
  /** Waypoints still to walk after the current move (shift + right-click). */
  waypoints?: XZ[];
  /** The current path is one leg of a long walk (recompute when it ends). */
  leg?: boolean;
  /** When the unit last had nothing to do (for idle workers finding jobs). */
  idleSince?: number;
  /** A commander's name (rules.json commanders, by era). */
  name?: { km: string; en: string };
  /** Running from danger until this time (PK: villagers flee raiders and wild beasts). */
  fleeUntil?: number;
  /** What a villager was doing before the alarm (taken up again when it is safe). */
  afterFlee?: Task;
  /** A hunter-scout carrying news of a find back to the king (PK). */
  report?: { node: number; what: string; at: XZ };
  /** Hides from his kills, worth this much gold at a store (PK). */
  hides?: number;
  /** Played by hand in the 3D hero mode (Anachak Khmer, D92): the AI leaves it alone. */
  manual?: boolean;
}

/** A wild animal in the forests and grasslands (PK: hunting). */
export interface Animal {
  id: number;
  kind: string;
  x: number;
  z: number;
  hp: number;
  heading: number;
  home: XZ;
  target: XZ | null;
  /** Running away until this time. */
  fleeUntil: number;
  fleeFrom: XZ | null;
  /** A predator's prey, or the hunter a defensive animal strikes back at. */
  prey?: number;
  /** A defensive animal fights its hunter until this time (D75). */
  angryUntil?: number;
  ready: number;
  moving: boolean;
}

export type WeatherId = 'clear' | 'cloudy' | 'rain' | 'storm' | 'mist' | 'windy';

export interface QueueItem {
  kind: 'unit' | 'tech';
  id: string;
  left: number;
  total: number;
}

export interface Building {
  id: number;
  type: string;
  team: Team;
  tx: number;
  tz: number;
  w: number;
  d: number;
  hp: number;
  maxHp: number;
  armor: number;
  progress: number;
  queue: QueueItem[];
  food?: number;
  /** Temples: which one (temples.json id). */
  temple?: string;
  /** Lumber camp: timber waiting for an ox-cart. */
  stock?: number;
  /** Houses with animals: when the basket is full (Hay Day-style collecting, PK). */
  basketAt?: number;
  /** Rice fields: how far through the rice year (0–1: sow, water, transplant, grow, reap). */
  grow?: number;
}

export type SimEvent =
  | { kind: 'shot'; from: XZ; to: XZ; t: number; team: Team }
  | { kind: 'hit'; at: XZ; t: number }
  | { kind: 'death'; unit: Unit; t: number }
  | { kind: 'destroyed'; building: Building; t: number }
  | { kind: 'built'; building: Building; t: number }
  | { kind: 'moved'; building: Building; from: XZ; t: number }
  | { kind: 'felled'; at: XZ; dir: number; t: number }
  | { kind: 'trained'; unit: Unit; t: number }
  | { kind: 'researched'; tech: string; t: number }
  | { kind: 'raid'; wave: number; size: number; t: number }
  | { kind: 'chapter'; done: string; next: string | null; t: number }
  | { kind: 'discovered'; place: string; t: number }
  | { kind: 'weather'; weather: WeatherId; t: number }
  | { kind: 'hunted'; animal: string; at: XZ; node: number; t: number }
  | { kind: 'delivered'; res: Resource; n: number; at: XZ; t: number }
  | { kind: 'outcome'; result: 'victory' | 'defeat'; how: string; t: number }
  /** A watchman found a resource (stone, gold, fruit) on his walk. */
  | { kind: 'found'; node: number; what: string; at: XZ; t: number }
  /** Villagers ran from a danger; the soldiers were called (PK). */
  | {
      kind: 'alarm';
      at: XZ;
      danger: 'raid' | 'animal';
      what: string;
      /** The person in most danger (nearest to it), and the raider or beast (PK: danger calls). */
      who?: number;
      foe?: { unit?: number; animal?: number };
      t: number;
    }
  /** PK: a royal ceremony began. */
  | { kind: 'ceremony'; id: string; t: number }
  /** PK: the king's decree began, laid the temple's foundation, or ended. */
  | { kind: 'decree'; what: 'begun' | 'founded' | 'ended'; t: number }
  /** The order board (Hay Day-style, PK): an order filled, the junk arrived or sailed. */
  | { kind: 'order'; what: 'filled' | 'boat' | 'sailed'; order: Order; t: number }
  /** PK: a junk came by but found no river landing to tie up at. */
  | { kind: 'order'; what: 'noport'; order: null; t: number }
  /** Anachak Khmer (D92): the king called villagers to arms. */
  | { kind: 'levy'; unit: string; n: number; t: number }
  /** The king ordered his soldiers to fight (target null: no enemy, they gather at the hall). */
  | { kind: 'battle'; to: XZ | null; n: number; t: number }
  /** A caravan came in along a royal road. */
  | { kind: 'caravan'; route: string; cost: Cost; t: number }
  /** A trade at the market (Anachak Khmer). */
  | { kind: 'traded'; give: Resource; get: Resource; lot: number; got: number; t: number };

export type Fail =
  | 'cost'
  | 'pop'
  | 'blocked'
  | 'requires'
  | 'busy'
  | 'unknown'
  | 'site'
  | 'era'
  | 'limit'
  | 'shore'
  | 'fixed';
export type Result<T = number> = { ok: true; id: T } | { ok: false; reason: Fail };

const RIVAL_CAMP = 'rivalCamp';
/** Long walks are planned in legs of this many tiles. */
const LEG_TILES = 100;

/** What a node gives. */
export function resourceOf(kind: NodeKind): Resource {
  return kind === 'tree'
    ? 'wood'
    : kind === 'stone'
      ? 'stone'
      : kind === 'gold' || kind === 'gems'
        ? 'gold'
        : 'food';
}

/** Trees and rocks stand on their tile; fruit bushes and carcasses can be walked past, fish are in water. */
export function blocksTile(kind: NodeKind): boolean {
  return kind === 'tree' || kind === 'stone' || kind === 'gold' || kind === 'gems';
}

export class KingdomSim {
  readonly map: MapData;
  readonly grid: Grid;
  readonly nodes = new Map<number, ResourceNode>();
  readonly units = new Map<number, Unit>();
  readonly buildings = new Map<number, Building>();
  readonly res: [Record<Resource, number>, Record<Resource, number>];
  readonly techs = new Set<string>();
  readonly events: SimEvent[] = [];
  /** The order board and the junk (Hay Day-style, PK). */
  readonly market: Market;
  /** PK: the king's decree — everyone works for the temple until it stands. */
  decree: 'temple' | null = null;
  private decreeAt = 0;
  /** PK: royal ceremonies and the royal power (ព្រះបារមី) they build. */
  ceremony: { id: string; until: number } | null = null;
  ceremonyAt = -1;
  ceremoniesHeld = 0;
  prestige = 0;
  readonly aiLog: string[] = [];
  readonly fog: { size: number; visible: Uint8Array; explored: Uint8Array };
  time = 0;
  outcome: { result: 'victory' | 'defeat'; how: string } | null = null;
  monumentDoneAt = -1;
  nextId = 1;
  ai = { wave: 0, nextRaid: 0, state: 'ECONOMIC' as string };
  /** Campaign (D53): the chapter being played and the temples already finished. */
  chapter = 0;
  readonly completed: string[] = [];
  /** Wild animals (hunting), empire places found, the weather, idle-worker automation. */
  readonly animals = new Map<number, Animal>();
  readonly discovered = new Set<string>();
  weather: { id: WeatherId; next: number } = { id: 'clear', next: 0 };
  autoWork: boolean;
  /** Fish nodes (never removed; they come back), kept apart for the regrowth loop. */
  readonly fish: ResourceNode[];
  /** Bumped each time the fog is recomputed (the view redraws its veil then). */
  fogVersion = 0;
  private fogAt = 0;
  private wildAt = 0;
  /** Next time shy animals and predators look around for people (twice a second, D75). */
  private wildScanAt = 0;
  private kindCache: Map<string, AnimalKind> | null = null;
  private guardAt = 0;
  /** Next danger check (twice a second) and the last alarm call. */
  private alarmAt = 0;
  private lastAlarm = -1e9;
  /** Commanders raised so far (their names go round the era's list). */
  commandersRaised = 0;
  /** Resource nodes watchmen have already reported. */
  readonly reported = new Set<number>();
  /** Anachak Khmer (D92): when each road's next caravan comes, people called to arms so far. */
  caravanAt: Record<string, number> = {};
  levied = 0;
  /** Today's market prices (Anachak Khmer), and how much has been traded in all. */
  prices: Record<Resource, number> = { food: 1, wood: 1, stone: 1, gold: 1 };
  traded = 0;
  private exchangeAt = 0;
  /** Where the 3D hero stands, while one is played (he explores round him). */
  heroEye: XZ | null = null;
  private minerals: ResourceNode[] | null = null;
  private available!: ReturnType<typeof eraContent>;
  private readonly rand: () => number;

  constructor(
    readonly data: KingdomData,
    readonly difficulty: 'easy' | 'normal' | 'hard' | 'expert' = data.rules.ai.difficulty,
    fresh = true,
    /** Resource and forest layout (a new game picks a random one; saves keep it). */
    readonly seed = data.campaign.map.seed,
    /** Anachak Khmer (D92): the royal roads, rest houses and caravans; Kingdom when absent. */
    readonly variant: 'kingdom' | 'anachak' = 'kingdom',
  ) {
    const R = data.rules;
    this.rand = rng(seed + 17);
    this.market = new Market(this);
    this.prices = { ...data.anachak.market.value };
    this.map = generateMap(data, seed, variant === 'anachak' ? data.anachak.roads : undefined);
    this.autoWork = R.automation.autoWork;
    this.weather = { id: 'clear', next: R.weather.cycleMin * 60 };
    this.grid = Grid.fromMap(this.map);
    this.grid.waterCost = R.rafts.cost;
    this.grid.roadCost = data.anachak.roads.cost;
    for (const n of this.map.nodes) this.nodes.set(n.id, n);
    this.fish = this.map.nodes.filter((n) => n.kind === 'fish');
    this.nextId = this.map.nodes.length + 1;
    this.res = [
      { food: 0, wood: 0, stone: 0, gold: 0, ...R.start.resources },
      { food: 0, wood: 0, stone: 0, gold: 0 },
    ];
    const cells = this.map.size;
    this.fog = {
      size: cells,
      visible: new Uint8Array(cells * cells),
      explored: new Uint8Array(cells * cells),
    };
    this.ai.nextRaid = this.level.firstRaidSec;
    this.setChapter(0);
    if (fresh) this.setup();
  }

  // ------------------------------------------------------------ campaign

  get chapterData(): Chapter {
    return this.data.campaign.chapters[Math.min(this.chapter, this.data.campaign.chapters.length - 1)]!;
  }

  get era() {
    return this.data.eras.find((e) => e.id === this.chapterData.era)!;
  }

  /** Places to discover: the world's, and in Anachak Khmer the royal roads' ends too (D92). */
  get places(): KingdomData['world']['places'] {
    return this.variant === 'anachak'
      ? [...this.data.world.places, ...this.data.anachak.roads.places]
      : this.data.world.places;
  }

  /** Index of the tile under a world point (fog and terrain arrays). */
  tileIndex(x: number, z: number): number {
    const [tx, tz] = worldToTile(this.map, x, z);
    return tz * this.map.size + tx;
  }

  /** On a royal road (Anachak Khmer, D92)? */
  onRoad(x: number, z: number): boolean {
    if (!this.map.road) return false;
    const [tx, tz] = worldToTile(this.map, x, z);
    return this.map.road[tz * this.map.size + tx] === 1;
  }

  get opponent(): Opponent {
    return this.data.campaign.opponents.find((o) => o.id === this.chapterData.opponent)!;
  }

  /** Game time when this chapter began (the calendar counts from it). */
  chapterStart = 0;

  /**
   * The in-game year (PK: a timeline that runs with the temple age): it starts at the
   * chapter's year and moves on with game time, but stays before the next temple's year
   * until this chapter's temple is finished.
   */
  get year(): number {
    const ch = this.chapterData;
    const C = this.data.rules.calendar;
    const next = this.data.campaign.chapters[this.chapter + 1]?.year ?? ch.year + C.extraYearsAfterLast;
    const run = Math.floor(Math.max(0, this.time - this.chapterStart) / C.secPerYear);
    return Math.max(ch.year, Math.min(next - 1, ch.year + run));
  }

  /**
   * Send someone to look for a resource (PK: a button to find what is short): the nearest
   * source not yet reported, unexplored ground first. Watchmen go if there are any, else
   * one idle villager. Returns where they went and how many, or null if nobody can go.
   */
  scoutFor(res: Resource): { to: XZ; units: number; node: number } | null {
    const kinds =
      res === 'food'
        ? ['fruit', 'fish']
        : res === 'gold'
          ? ['gold', 'gems']
          : [res === 'wood' ? 'tree' : res];
    const hall = [...this.buildings.values()].find((b) => b.team === PLAYER && b.type === 'townCentre');
    const watch = [...this.units.values()].filter((u) => u.team === PLAYER && u.type === 'watchman');
    const idle = [...this.units.values()].filter(
      (u) => u.team === PLAYER && u.type === 'villager' && u.task.kind === 'idle',
    );
    const go = watch.length ? watch : idle.slice(0, 1);
    if (!go.length) return null;
    const from: XZ = hall
      ? [hall.tx + hall.w / 2, hall.tz + hall.d / 2]
      : worldToTile(this.map, go[0]!.x, go[0]!.z);
    const N = this.fog.size;
    let best: ResourceNode | null = null;
    let bestScore = Infinity;
    for (const n of this.nodes.values()) {
      if (!kinds.includes(n.kind) || this.reported.has(n.id)) continue;
      const d = Math.hypot(n.tx - from[0], n.tz - from[1]);
      // Prefer sources nobody has seen yet; known ones only if nothing new is near.
      const score = d + (this.fog.explored[n.tz * N + n.tx] ? 120 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (!best) return null;
    const to = this.nodePos(best);
    this.cmdMove(
      go.map((u) => u.id),
      to,
    );
    return { to, units: go.length, node: best.id };
  }

  /** The current chapter's temple site. */
  get site(): TempleSite {
    return this.map.sites[Math.min(this.chapter, this.map.sites.length - 1)]!;
  }

  /** What this era allows (everything from earlier eras stays). */
  allows(kind: 'buildings' | 'units' | 'techs', id: string): boolean {
    return this.available[kind].has(id);
  }

  /** Set the chapter number and what its era unlocks (also used when loading a save). */
  setChapter(n: number): void {
    this.chapter = n;
    this.available = eraContent(this.data, this.chapterData.era);
    this.revealSite();
  }

  /** The chapter's temple site is known ground: it is shown (explored) from the start. */
  private revealSite(): void {
    if (!this.fog || this.chapter >= this.map.sites.length) return;
    const s = this.site;
    const N = this.fog.size;
    for (let z = Math.max(0, s.tz - 4); z < Math.min(N, s.tz + s.d + 4); z++)
      for (let x = Math.max(0, s.tx - 4); x < Math.min(N, s.tx + s.w + 4); x++)
        this.fog.explored[z * N + x] = 1;
  }

  /** The rival of this chapter sets up camp where its raids come from. */
  private makeCamp(): void {
    const o = this.opponent;
    const [ux, uz] = o.from;
    const N = this.map.size;
    const cx = Math.max(4, Math.min(N - 9, ux));
    const cz = Math.max(4, Math.min(N - 9, uz));
    let spot: XZ = [cx, cz];
    search: for (let r = 0; r < 60; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          let ok = true;
          for (let j = -1; j < 6 && ok; j++)
            for (let i = -1; i < 6 && ok; i++) ok = this.grid.ok(x + i, z + j);
          if (ok) {
            spot = [x, z];
            break search;
          }
        }
    const camp = this.addBuilding(RIVAL_CAMP, RIVAL, spot[0], spot[1], 1);
    const R = this.data.rules;
    for (let i = 0; i < R.ai.camp.guards; i++) this.spawnNear(camp, o.raiders[i % o.raiders.length]!, RIVAL);
  }

  /** The chapter's temple stands: record it, move on to the next era and temple. */
  private completeChapter(): void {
    const done = this.chapterData.temple;
    this.decree = null; // the king's decree is fulfilled
    this.completed.push(done);
    const next = this.chapter + 1;
    const chapters = this.data.campaign.chapters;
    this.events.push({ kind: 'chapter', done, next: chapters[next]?.temple ?? null, t: this.time });
    if (next >= chapters.length) {
      this.chapter = next;
      return this.finish('victory', 'Every temple of the campaign stands');
    }
    // The old rival withdraws; the next chapter's rival arrives from its own direction.
    for (const u of [...this.units.values()]) if (u.team === RIVAL) this.units.delete(u.id);
    for (const b of [...this.buildings.values()]) if (b.team === RIVAL) this.removeBuilding(b);
    this.setChapter(next);
    this.chapterStart = this.time;
    this.monumentDoneAt = -1;
    this.ai.wave = 0;
    this.ai.nextRaid = this.time + this.level.firstRaidSec;
    this.setAi('ECONOMIC', `${this.opponent.en} watches the new building site`);
    const ev = this.chapterData.event;
    if (ev?.newHall) {
      // A new capital: a royal hall is raised there (e.g. Yasodharapura, c. 900).
      const [hx, hz] = unitsToTile(this.data, ev.newHall[0], ev.newHall[1]);
      const hall = this.addBuilding('townCentre', PLAYER, hx - 2, hz - 2, 1);
      for (let i = 0; i < 3; i++) this.spawnNear(hall, 'villager');
    }
    this.makeCamp();
  }

  get level() {
    return this.data.rules.ai.levels[this.difficulty];
  }

  /** Scenario start: royal hall, villagers, the rival camp and its guards. */
  private setup(): void {
    const R = this.data.rules;
    const [tx, tz] = this.map.start;
    const tc = this.addBuilding('townCentre', PLAYER, tx - 2, tz - 2, 1);
    for (let i = 0; i < R.start.villagers; i++) this.spawnNear(tc, 'villager');
    this.makeCamp();
    for (const kind of this.data.world.animals.kinds)
      while ([...this.animals.values()].filter((a) => a.kind === kind.id).length < kind.count)
        if (!this.spawnHerd(kind)) break;
    this.updateFog();
  }

  // ------------------------------------------------------------ lookups

  def(type: string) {
    return this.data.units[type]!;
  }

  bdef(type: string): {
    id: string;
    km: string;
    en: string;
    size: [number, number];
    hp: number;
    armor: number;
    pop: number;
    vision: number;
    buildSec: number;
    dropOff: string[];
    trains: string[];
    researches: string[];
    stockpile?: boolean;
    freeUnit?: string;
  } {
    if (type === RIVAL_CAMP) {
      const c = this.data.rules.ai.camp;
      return {
        id: RIVAL_CAMP,
        size: [5, 5] as [number, number],
        hp: c.hp,
        armor: c.armor,
        pop: 0,
        vision: 8,
        dropOff: [],
        trains: [],
        researches: [],
        buildSec: 1,
        km: `ជំរំ${this.opponent.km}`,
        en: `${this.opponent.en} camp`,
      };
    }
    return this.data.buildings[type]!;
  }

  popCap(team: Team = PLAYER): number {
    let cap = 0;
    for (const b of this.buildings.values())
      if (b.team === team && b.progress >= 1) cap += this.bdef(b.type).pop;
    return Math.min(cap, this.data.rules.start.maxPop);
  }

  popUsed(team: Team = PLAYER): number {
    let n = 0;
    for (const u of this.units.values()) if (u.team === team) n += this.def(u.type).pop;
    for (const b of this.buildings.values())
      if (b.team === team) for (const q of b.queue) if (q.kind === 'unit') n += this.def(q.id).pop;
    return n;
  }

  center(b: Building): XZ {
    const [x0, z0] = tileToWorld(this.map, b.tx, b.tz);
    const T = this.map.tile;
    return [x0 - T / 2 + (b.w * T) / 2, z0 - T / 2 + (b.d * T) / 2];
  }

  /** Distance from a point to a building's footprint edge (m). */
  distTo(b: Building, x: number, z: number): number {
    const T = this.map.tile;
    const [cx, cz] = this.center(b);
    const dx = Math.max(0, Math.abs(x - cx) - (b.w * T) / 2);
    const dz = Math.max(0, Math.abs(z - cz) - (b.d * T) / 2);
    return Math.hypot(dx, dz);
  }

  nodePos(n: ResourceNode): XZ {
    return tileToWorld(this.map, n.tx, n.tz);
  }

  hasBuilt(type: string, team: Team = PLAYER): boolean {
    for (const b of this.buildings.values())
      if (b.team === team && b.type === type && b.progress >= 1) return true;
    return false;
  }

  canAfford(cost: Cost, team: Team = PLAYER): boolean {
    return RESOURCES.every((r) => (this.res[team][r] ?? 0) >= (cost[r] ?? 0));
  }

  pay(cost: Cost, team: Team = PLAYER, sign = 1): void {
    for (const r of RESOURCES) this.res[team][r] -= sign * (cost[r] ?? 0);
  }

  /** LIVE support and council gifts. */
  addResources(cost: Cost, team: Team = PLAYER): void {
    this.pay(cost, team, -1);
  }

  // ------------------------------------------------------------ creation

  addBuilding(type: string, team: Team, tx: number, tz: number, progress = 0, temple?: string): Building {
    const d = this.bdef(type);
    const site = temple ? this.map.sites.find((x) => x.temple === temple) : undefined;
    const b: Building = {
      id: this.nextId++,
      type,
      team,
      tx,
      tz,
      w: site?.w ?? d.size[0],
      d: site?.d ?? d.size[1],
      ...(temple ? { temple } : {}),
      maxHp: d.hp,
      hp: Math.max(1, d.hp * Math.max(0.05, progress)),
      armor: d.armor,
      progress,
      queue: [],
    };
    const food = (this.data.buildings[type] as { food?: number } | undefined)?.food;
    if (food)
      b.food =
        food * (this.techs.has('indratataka') ? (this.data.techs.indratataka!.effect.fieldFood ?? 1) : 1);
    this.buildings.set(b.id, b);
    // Rice fields can be walked on; everything else blocks.
    if (type !== 'riceField') this.grid.setRect(tx, tz, b.w, b.d, false);
    return b;
  }

  spawnNear(b: Building, type: string, team: Team = b.team): Unit {
    const spot = this.freeTileNear(b.tx + Math.floor(b.w / 2), b.tz + b.d, 8) ?? [b.tx, b.tz + b.d];
    const [x, z] = tileToWorld(this.map, spot[0], spot[1]);
    const u: Unit = {
      id: this.nextId++,
      type,
      team,
      x: x + (this.rand() - 0.5) * 0.8,
      z: z + (this.rand() - 0.5) * 0.8,
      hp: this.def(type).hp,
      heading: 0,
      task: { kind: 'idle' },
      path: null,
      repathAt: 0,
      carry: null,
      ready: 0,
      anim: 'idle',
    };
    this.units.set(u.id, u);
    return u;
  }

  freeTileNear(cx: number, cz: number, radius: number): XZ | null {
    for (let r = 0; r <= radius; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.grid.ok(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        }
    return null;
  }

  // ------------------------------------------------------------ player commands

  /** Why a building can't go here (null = it can). */
  canPlace(type: string, tx: number, tz: number, team: Team = PLAYER): Fail | null {
    const d = this.data.buildings[type];
    if (!d || !d.buildable) return 'unknown';
    if (!this.allows('buildings', type)) return 'era';
    if (!d.requires.every((r) => this.hasBuilt(r, team))) return 'requires';
    if (!this.canAfford(d.cost, team)) return 'cost';
    let [w, h] = d.size;
    if (d.fixedSite) {
      // The chapter's temple goes on its historical site only, one at a time.
      const s = this.site;
      if (tx !== s.tx || tz !== s.tz) return 'site';
      for (const b of this.buildings.values()) if (b.type === type && b.temple === s.temple) return 'busy';
      [w, h] = [s.w, s.d];
    }
    for (let z = tz; z < tz + h; z++)
      for (let x = tx; x < tx + w; x++) if (!this.grid.ok(x, z)) return 'blocked';
    // Nothing is built over another thing (PK): rice fields (walkable), fruit bushes, carcasses
    // and fish traps do not block walking, so they are checked here too.
    const over = (bx: number, bz: number, bw: number, bd: number) =>
      bx < tx + w && bx + bw > tx && bz < tz + h && bz + bd > tz;
    for (const b of this.buildings.values()) if (over(b.tx, b.tz, b.w, b.d)) return 'blocked';
    for (const n of this.nodes.values()) if (over(n.tx, n.tz, 1, 1)) return 'blocked';
    for (const u of this.units.values()) {
      const [ux, uz] = worldToTile(this.map, u.x, u.z);
      if (u.team !== team && ux >= tx && ux < tx + w && uz >= tz && uz < tz + h) return 'blocked';
    }
    // PK: a river landing stands at the water's edge (open water within 2 tiles).
    if (d.shore && !this.waterNear(tx, tz, w, h, 2)) return 'shore';
    return null;
  }

  /** Open water within `r` tiles of a footprint. */
  waterNear(tx: number, tz: number, w: number, h: number, r: number): XZ | null {
    let best: XZ | null = null;
    let bd = Infinity;
    const cx = tx + w / 2;
    const cz = tz + h / 2;
    for (let z = tz - r; z < tz + h + r; z++)
      for (let x = tx - r; x < tx + w + r; x++)
        if (this.grid.isWater(x, z)) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d < bd) {
            bd = d;
            best = [x, z];
          }
        }
    return best;
  }

  /** This chapter's temple site (top-left tile). */
  monumentSpot(): XZ {
    return [this.site.tx, this.site.tz];
  }

  /** PK: the king's decree on (build the temple) or off. */
  setDecree(on: boolean): void {
    const next = on ? 'temple' : null;
    if (next === this.decree) return;
    this.decree = next;
    this.decreeAt = this.time; // set to work at once
    this.events.push({ kind: 'decree', what: on ? 'begun' : 'ended', t: this.time });
  }

  /** The temple being built this chapter, if its foundation is laid. */
  currentTemple(): Building | undefined {
    const t = this.chapterData.temple;
    return [...this.buildings.values()].find((b) => b.type === 'monument' && b.temple === t);
  }

  place(type: string, tx: number, tz: number, builders: number[] = [], team: Team = PLAYER): Result {
    const why = this.canPlace(type, tx, tz, team);
    if (why) return { ok: false, reason: why };
    this.pay(this.data.buildings[type]!.cost, team);
    const b = this.addBuilding(type, team, tx, tz, 0, type === 'monument' ? this.site.temple : undefined);
    // Own units standing on the new foundation step off it.
    for (const u of this.units.values()) {
      const [ux, uz] = worldToTile(this.map, u.x, u.z);
      if (ux >= tx && ux < tx + b.w && uz >= tz && uz < tz + b.d && type !== 'riceField') {
        const spot = this.freeTileNear(ux, uz, 12);
        if (spot) [u.x, u.z] = tileToWorld(this.map, spot[0], spot[1]);
        u.path = null;
      }
    }
    this.cmdBuild(builders, b.id);
    return { ok: true, id: b.id };
  }

  /** What one move of a building costs (rules.moveBuilding.costShare of its price). */
  moveCost(type: string): Cost {
    const share = this.data.rules.moveBuilding.costShare;
    const out: Cost = {};
    for (const [r, n] of Object.entries(this.data.buildings[type]?.cost ?? {}))
      if (n && Math.ceil(n * share) > 0) out[r as Resource] = Math.ceil(n * share);
    return out;
  }

  /** Can this building be moved at all (PK 1.6.0: not the historical temples)? */
  movable(id: number, team: Team = PLAYER): boolean {
    const M = this.data.rules.moveBuilding;
    const b = this.buildings.get(id);
    if (!M.enabled || !b || b.team !== team || b.temple) return false;
    return !M.fixed.includes(b.type) && !this.data.buildings[b.type]?.fixedSite;
  }

  /** Why a building cannot go to (tx, tz), or null when it can. Its own old spot does not count. */
  canMove(id: number, tx: number, tz: number, team: Team = PLAYER): Fail | null {
    const b = this.buildings.get(id);
    if (!b) return 'unknown';
    if (!this.movable(id, team)) return 'fixed';
    if (tx === b.tx && tz === b.tz) return null;
    if (!this.canAfford(this.moveCost(b.type), team)) return 'cost';
    const solid = b.type !== 'riceField';
    if (solid) this.grid.setRect(b.tx, b.tz, b.w, b.d, true);
    try {
      for (let z = tz; z < tz + b.d; z++)
        for (let x = tx; x < tx + b.w; x++) if (!this.grid.ok(x, z)) return 'blocked';
      const over = (bx: number, bz: number, bw: number, bd: number) =>
        bx < tx + b.w && bx + bw > tx && bz < tz + b.d && bz + bd > tz;
      for (const o of this.buildings.values()) if (o !== b && over(o.tx, o.tz, o.w, o.d)) return 'blocked';
      for (const n of this.nodes.values()) if (over(n.tx, n.tz, 1, 1)) return 'blocked';
      for (const u of this.units.values()) {
        const [ux, uz] = worldToTile(this.map, u.x, u.z);
        if (u.team !== team && ux >= tx && ux < tx + b.w && uz >= tz && uz < tz + b.d) return 'blocked';
      }
      if (this.data.buildings[b.type]?.shore && !this.waterNear(tx, tz, b.w, b.d, 2)) return 'shore';
      return null;
    } finally {
      if (solid) this.grid.setRect(b.tx, b.tz, b.w, b.d, false);
    }
  }

  /** PK 1.6.0: pick a building up and set it down elsewhere (whole, with its queue and stock). */
  moveBuilding(id: number, tx: number, tz: number, team: Team = PLAYER): Result {
    const why = this.canMove(id, tx, tz, team);
    if (why) return { ok: false, reason: why };
    const b = this.buildings.get(id)!;
    if (tx === b.tx && tz === b.tz) return { ok: true, id };
    this.pay(this.moveCost(b.type), team);
    const from: XZ = [b.tx, b.tz];
    const solid = b.type !== 'riceField';
    if (solid) this.grid.setRect(b.tx, b.tz, b.w, b.d, true);
    b.tx = tx;
    b.tz = tz;
    if (solid) this.grid.setRect(tx, tz, b.w, b.d, false);
    for (const u of this.units.values()) {
      const [ux, uz] = worldToTile(this.map, u.x, u.z);
      if (solid && ux >= tx && ux < tx + b.w && uz >= tz && uz < tz + b.d) {
        const spot = this.freeTileNear(ux, uz, 12);
        if (spot) [u.x, u.z] = tileToWorld(this.map, spot[0], spot[1]);
      }
      // Everyone walks a fresh way (to it, or round where it now stands).
      u.path = null;
    }
    this.events.push({ kind: 'moved', building: b, from, t: this.time });
    return { ok: true, id };
  }

  /** Cancel a foundation: part of the cost comes back. */
  cancel(id: number): boolean {
    const b = this.buildings.get(id);
    if (!b || b.progress >= 1 || b.team !== PLAYER) return false;
    const cost = this.data.buildings[b.type]?.cost ?? {};
    const share = this.data.rules.economy.refundShare;
    for (const r of RESOURCES) this.res[b.team][r] += Math.floor((cost[r] ?? 0) * share);
    this.removeBuilding(b);
    return true;
  }

  train(buildingId: number, unit: string): Result<string> {
    const b = this.buildings.get(buildingId);
    const d = this.data.units[unit];
    if (!b || !d || b.progress < 1) return { ok: false, reason: 'unknown' };
    if (!this.bdef(b.type).trains.includes(unit) || !this.allows('units', unit))
      return { ok: false, reason: 'era' };
    if (!d.requires.every((t) => this.techs.has(t))) return { ok: false, reason: 'requires' };
    if (!this.canAfford(d.cost, b.team)) return { ok: false, reason: 'cost' };
    if (this.popUsed(b.team) + d.pop > this.popCap(b.team)) return { ok: false, reason: 'pop' };
    if (b.queue.length >= 5) return { ok: false, reason: 'busy' };
    if (d.max !== undefined && this.countOf(unit, b.team) >= d.max) return { ok: false, reason: 'limit' };
    this.pay(d.cost, b.team);
    b.queue.push({ kind: 'unit', id: unit, left: d.trainSec, total: d.trainSec });
    return { ok: true, id: unit };
  }

  /** Units of a type alive or waiting in a queue. */
  countOf(type: string, team: Team = PLAYER): number {
    let n = 0;
    for (const u of this.units.values()) if (u.team === team && u.type === type) n++;
    for (const b of this.buildings.values())
      if (b.team === team) for (const q of b.queue) if (q.kind === 'unit' && q.id === type) n++;
    return n;
  }

  /** The commander's title and names for the current era (the last entry at or before it). */
  get commanderRank(): KingdomRules['commanders'][number] {
    const list = this.data.rules.commanders;
    const order = this.data.eras.map((e) => e.id);
    const now = order.indexOf(this.era.id);
    let pick = list[0]!;
    for (const c of list) if (order.indexOf(c.era) <= now) pick = c;
    return pick;
  }

  research(buildingId: number, tech: string): Result<string> {
    const b = this.buildings.get(buildingId);
    const t = this.data.techs[tech];
    if (!b || !t || b.progress < 1) return { ok: false, reason: 'unknown' };
    if (!this.bdef(b.type).researches.includes(tech) || !this.allows('techs', tech))
      return { ok: false, reason: 'era' };
    if (this.techs.has(tech) || this.isResearching(tech)) return { ok: false, reason: 'busy' };
    if (!t.requires.every((r) => this.techs.has(r))) return { ok: false, reason: 'requires' };
    if (!this.canAfford(t.cost, b.team)) return { ok: false, reason: 'cost' };
    this.pay(t.cost, b.team);
    b.queue.push({ kind: 'tech', id: tech, left: t.researchSec, total: t.researchSec });
    return { ok: true, id: tech };
  }

  isResearching(tech: string): boolean {
    for (const b of this.buildings.values())
      if (b.queue.some((q) => q.kind === 'tech' && q.id === tech)) return true;
    return false;
  }

  /** Cancel the last item in a building's queue (full refund). */
  unqueue(buildingId: number): boolean {
    const b = this.buildings.get(buildingId);
    const q = b?.queue.pop();
    if (!b || !q) return false;
    this.pay(q.kind === 'unit' ? this.def(q.id).cost : this.data.techs[q.id]!.cost, b.team, -1);
    return true;
  }

  private assign(ids: number[], task: (u: Unit) => Task | null): void {
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.team !== PLAYER) continue;
      const t = task(u);
      if (!t) continue;
      u.task = t;
      u.path = null;
      u.repathAt = 0;
    }
  }

  cmdMove(ids: number[], to: XZ, attackMove = false): void {
    // Spread a group around the point so they don't all fight for one spot.
    const n = ids.length;
    let i = 0;
    this.assign(ids, () => {
      const k = i++;
      const ring = Math.floor(Math.sqrt(k));
      const a = k * 2.4;
      const r = n > 1 ? 1.2 + ring * 1.3 : 0;
      return { kind: 'move', to: [to[0] + Math.cos(a) * r, to[1] + Math.sin(a) * r], attackMove };
    });
  }

  cmdGather(ids: number[], nodeId: number): void {
    const n = this.nodes.get(nodeId);
    if (!n) return;
    const res = resourceOf(n.kind);
    this.assign(ids, (u) =>
      this.def(u.type).gather
        ? {
            kind: 'gather',
            node: nodeId,
            field: null,
            res,
            phase: 'go',
            near: this.nodePos(n),
            nodeKind: n.kind,
          }
        : null,
    );
  }

  /** Villagers hunt an animal (spears thrown from a few metres), then carry the meat home. */
  cmdHunt(ids: number[], animalId: number): void {
    const a = this.animals.get(animalId);
    // Protected kinds (elephants, primates, the giant ibis...) are never hunted (D75).
    if (!a || !this.kindOf(a).huntable) return;
    this.assign(ids, (u) => (this.def(u.type).gather ? { kind: 'hunt', animal: animalId } : null));
  }

  /** Shift + right-click: add a waypoint after the current walk (scouting several spots). */
  cmdWaypoint(ids: number[], to: XZ): void {
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.team !== PLAYER) continue;
      if (u.task.kind === 'move') (u.waypoints ??= []).push(to);
      else {
        u.task = { kind: 'move', to };
        u.path = null;
        u.waypoints = [];
      }
    }
  }

  cmdFarm(ids: number[], fieldId: number): void {
    const f = this.buildings.get(fieldId);
    if (!f || f.type !== 'riceField') return;
    // One farmer per field; extra villagers go to the next free field or wait.
    this.assign(ids, (u) =>
      this.def(u.type).gather
        ? { kind: 'gather', node: null, field: fieldId, res: 'food', phase: 'go', near: this.center(f) }
        : null,
    );
  }

  cmdBuild(ids: number[], buildingId: number): void {
    this.assign(ids, (u) => (this.def(u.type).build ? { kind: 'build', building: buildingId } : null));
  }

  cmdAttack(ids: number[], target: { unit?: number; building?: number }): void {
    this.assign(ids, () => ({ kind: 'attack', ...target }));
  }

  /** Right-click: do the obvious thing with what is under the cursor. */
  cmdSmart(
    ids: number[],
    at: XZ,
    pick: { unit?: number; building?: number; node?: number; animal?: number },
  ): void {
    const workers = ids.filter((id) => this.def(this.units.get(id)?.type ?? 'villager').gather);
    const fighters = ids.filter((id) => !workers.includes(id));
    if (pick.unit) {
      const t = this.units.get(pick.unit);
      if (t && t.team !== PLAYER) return this.cmdAttack(ids, { unit: t.id });
    }
    if (pick.building) {
      const b = this.buildings.get(pick.building);
      if (b && b.team !== PLAYER) return this.cmdAttack(ids, { building: b.id });
      if (b && b.progress < 1) {
        this.cmdBuild(workers, b.id);
        return this.cmdMove(fighters, at);
      }
      if (b && b.type === 'riceField') {
        this.cmdFarm(workers, b.id);
        return this.cmdMove(fighters, at);
      }
      if (b && this.bdef(b.type).dropOff.length) {
        // Drop what they carry, then idle there.
        this.assign(workers, (u) =>
          u.carry
            ? { kind: 'gather', node: null, field: null, res: u.carry.res, phase: 'return', near: at }
            : { kind: 'move', to: at },
        );
        return this.cmdMove(fighters, at);
      }
    }
    if (pick.animal) {
      const a = this.animals.get(pick.animal);
      if (a) {
        const k = this.kindOf(a);
        // A protected animal: everyone just walks there (no one is sent to hunt it).
        if (!k.huntable) return this.cmdMove(ids, at, false);
        this.cmdHunt(workers, a.id);
        // Soldiers help with a predator; otherwise they walk along.
        return this.cmdMove(fighters, [a.x, a.z], k.behaviour === 'predator');
      }
    }
    if (pick.node) {
      this.cmdGather(workers, pick.node);
      return this.cmdMove(fighters, at);
    }
    this.cmdMove(ids, at, false);
  }

  // ------------------------------------------------------------ simulation

  update(dt: number): void {
    if (this.outcome) return;
    let left = dt;
    while (left > 1e-6 && !this.outcome) {
      const step = Math.min(0.1, left);
      left -= step;
      this.step(step);
    }
  }

  private step(dt: number): void {
    this.time += dt;
    for (const b of [...this.buildings.values()]) this.updateQueue(b, dt);
    for (const u of [...this.units.values()]) if (this.units.has(u.id)) this.updateUnit(u, dt);
    this.updateAnimals(dt);
    if (this.time >= this.alarmAt) {
      this.alarmAt = this.time + 0.5;
      this.alarm();
    }
    this.updateWeather();
    if (this.time >= this.guardAt) {
      this.guardAt = this.time + 1;
      this.guard();
      this.findWork();
      this.discover();
      this.supply(1);
      this.haulWood();
      this.scout();
      this.market.update();
      updateBaskets(this);
      updateCeremonies(this);
      if (this.variant === 'anachak') {
        updateRoads(this);
        updateExchange(this, this.time - this.exchangeAt);
        this.exchangeAt = this.time;
      }
      if (this.time >= this.decreeAt) {
        this.decreeAt = this.time + this.data.rules.decree.everySec;
        runDecree(this);
      }
    }
    // Hospitals (Jayavarman VII): the people heal slowly when not fighting.
    const regen = this.playerEffect('regen', 0);
    if (regen > 0)
      for (const u of this.units.values())
        if (u.team === PLAYER && u.anim !== 'attack') u.hp = Math.min(this.def(u.type).hp, u.hp + regen * dt);
    this.separate(dt);
    this.updateAi();
    if (this.time >= this.fogAt) {
      this.fogAt = this.time + this.data.rules.fog.updateSec;
      this.updateFog();
    }
    this.checkOutcome();
  }

  private mult(kind: 'gather' | 'build' | 'monument', res?: Resource): number {
    // A royal ceremony under way lifts the people's work (PK).
    let k = kind === 'monument' ? 1 : ceremonyBuff(this, kind);
    for (const t of this.techs) {
      const e = this.data.techs[t]?.effect;
      if (!e) continue;
      if (kind === 'gather' && res && e.gatherRate?.[res]) k *= e.gatherRate[res]!;
      if (kind === 'build' && e.buildRate) k *= e.buildRate;
      if (kind === 'monument' && e.monumentRate) k *= e.monumentRate;
    }
    return k;
  }

  /** A player tech effect that is a single number: speed multiplies, regen adds. */
  playerEffect(key: 'speed' | 'regen', base: number): number {
    let k = base;
    for (const t of this.techs) {
      const v = this.data.techs[t]?.effect[key];
      if (v === undefined) continue;
      k = key === 'speed' ? k * v : k + v;
    }
    return k;
  }

  attackOf(u: Unit, target?: Unit): number {
    const d = this.def(u.type);
    let a = d.attack;
    if (u.team === PLAYER) for (const t of this.techs) a += this.data.techs[t]?.effect.attack?.[u.type] ?? 0;
    if (target) a += d.bonusVs?.[target.type] ?? 0;
    if (d.role !== 'worker' && d.role !== 'commander' && this.nearCommander(u))
      a *= this.data.rules.army.commander.attack;
    return a;
  }

  /** A friendly commander stands close by (his aura, D69). */
  nearCommander(u: Unit): boolean {
    const r = this.data.rules.army.commander.auraTiles * this.map.tile;
    for (const c of this.units.values())
      if (c.team === u.team && c.type === 'commander' && c !== u && Math.hypot(c.x - u.x, c.z - u.z) < r)
        return true;
    return false;
  }

  private updateQueue(b: Building, dt: number): void {
    const q = b.queue[0];
    if (!q || b.progress < 1) return;
    q.left -= dt;
    if (q.left > 0) return;
    b.queue.shift();
    if (q.kind === 'unit') {
      const u = this.spawnNear(b, q.id);
      if (u.type === 'commander') {
        // Named after the era's recorded generals, in turn; the title alone when none is known.
        const r = this.commanderRank;
        u.name = r.names.length ? r.names[this.commandersRaised % r.names.length]! : { km: r.km, en: r.en };
        this.commandersRaised++;
      }
      this.events.push({ kind: 'trained', unit: u, t: this.time });
    } else {
      this.techs.add(q.id);
      this.events.push({ kind: 'researched', tech: q.id, t: this.time });
      if (q.id === 'indratataka')
        for (const f of this.buildings.values())
          if (f.food !== undefined) f.food *= this.data.techs.indratataka!.effect.fieldFood ?? 1;
    }
  }

  // ------------------------------------------------------------ units

  private updateUnit(u: Unit, dt: number): void {
    if (u.manual) return; // the player moves it (3D hero mode)
    const d = this.def(u.type);
    u.anim = 'idle';
    const t = u.task;
    switch (t.kind) {
      case 'idle':
        if (d.role !== 'worker' && d.role !== 'support' && d.role !== 'scout') this.autoAggro(u);
        return;
      case 'move': {
        if (t.attackMove && this.autoAggro(u)) return;
        if (this.walkTo(u, dt, { point: t.to }, 0.4)) {
          const next = u.waypoints?.shift();
          u.task = next ? { kind: 'move', to: next, attackMove: t.attackMove } : { kind: 'idle' };
          u.path = null;
        }
        return;
      }
      case 'build':
        return this.doBuild(u, t, dt);
      case 'gather':
        return this.doGather(u, t, dt);
      case 'attack':
        return this.doAttack(u, t, dt);
      case 'hunt':
        return this.doHunt(u, t, dt);
      case 'haul':
        return this.doHaul(u, t, dt);
    }
  }

  /** Military units pick a fight with an enemy they can see. */
  private autoAggro(u: Unit): boolean {
    const d = this.def(u.type);
    let best: Unit | null = null;
    let bd = d.vision;
    for (const o of this.units.values()) {
      if (o.team === u.team) continue;
      const k = Math.hypot(o.x - u.x, o.z - u.z);
      if (k < bd) {
        bd = k;
        best = o;
      }
    }
    if (best) {
      const back = u.task;
      u.task = { kind: 'attack', unit: best.id };
      u.path = null;
      // Remember an attack-move so the unit carries on after the fight.
      if (back.kind === 'move' && back.attackMove) (u as Unit & { resume?: Task }).resume = back;
      return true;
    }
    if (u.team === RIVAL) {
      // Raiders also attack buildings they pass.
      for (const b of this.buildings.values())
        if (b.team !== u.team && this.distTo(b, u.x, u.z) < d.vision * 0.6) {
          const back = u.task;
          u.task = { kind: 'attack', building: b.id };
          u.path = null;
          if (back.kind === 'move' && back.attackMove) (u as Unit & { resume?: Task }).resume = back;
          return true;
        }
    }
    return false;
  }

  /**
   * Walk toward a point, a building's edge or a resource tile. True when within `reach`.
   * Paths are recomputed when missing, blocked or stale.
   */
  private walkTo(
    u: Unit,
    dt: number,
    goal: { point?: XZ; building?: Building; tile?: XZ },
    reach: number,
  ): boolean {
    const dist = goal.building
      ? this.distTo(goal.building, u.x, u.z)
      : goal.tile
        ? (() => {
            const [gx, gz] = tileToWorld(this.map, goal.tile[0], goal.tile[1]);
            return Math.max(0, Math.hypot(gx - u.x, gz - u.z) - this.map.tile * 0.5);
          })()
        : Math.hypot(goal.point![0] - u.x, goal.point![1] - u.z);
    if (dist <= reach) {
      u.path = [];
      return true;
    }
    if (!u.path || (!u.path.length && this.time >= u.repathAt)) {
      u.repathAt = this.time + 1.5;
      const from = worldToTile(this.map, u.x, u.z);
      let g: Goal;
      let pad = 1;
      if (goal.building)
        g = {
          x0: goal.building.tx,
          z0: goal.building.tz,
          x1: goal.building.tx + goal.building.w - 1,
          z1: goal.building.tz + goal.building.d - 1,
        };
      else if (goal.tile) g = { x0: goal.tile[0], z0: goal.tile[1], x1: goal.tile[0], z1: goal.tile[1] };
      else {
        const [px, pz] = worldToTile(this.map, goal.point![0], goal.point![1]);
        g = { x0: px, z0: pz, x1: px, z1: pz };
        pad = this.grid.ok(px, pz) ? 0 : 1;
      }
      // Long walks go in legs of about 100 tiles (the world is 1080 tiles across).
      const far = Math.max(Math.abs(g.x0 - from[0]), Math.abs(g.z0 - from[1])) > LEG_TILES + 10;
      if (far) {
        const f = LEG_TILES / Math.hypot(g.x0 - from[0], g.z0 - from[1]);
        const lx = Math.round(from[0] + (g.x0 - from[0]) * f);
        const lz = Math.round(from[1] + (g.z0 - from[1]) * f);
        const spot = this.freeTileNear(lx, lz, 20);
        if (spot) {
          g = { x0: spot[0], z0: spot[1], x1: spot[0], z1: spot[1] };
          pad = 0;
        }
      }
      const rafts = this.data.rules.rafts.enabled;
      const p = findPath(this.grid, from, g, far ? 60000 : 20000, pad, rafts);
      u.leg = far && !!p;
      u.path = p ? p.map(([x, z]) => tileToWorld(this.map, x, z)) : [];
      if (goal.point && p && !far) u.path.push(goal.point);
      if (!p) return dist <= reach * 3; // unreachable: give up near enough
    }
    if (u.leg && !u.path.length) {
      // End of a leg: plan the next one now.
      u.path = null;
      u.leg = false;
      return false;
    }
    const speed =
      this.def(u.type).speed *
      (u.carry && u.carry.n > 0 ? 0.9 : 1) *
      (u.team === PLAYER ? this.playerEffect('speed', 1) : 1) *
      this.weatherDef.speed *
      waterSpeed(this.waterWay(u), this.data.rules.water, this.data.rules.rafts.speed) * // wade, swim, boat (PK)
      (this.onRoad(u.x, u.z) ? this.data.anachak.roads.speed : 1); // a royal road (D92)
    let move = speed * dt;
    if (!u.path.length) {
      // Path done but not quite in reach (e.g. a diagonal tile): step straight in.
      const [ax, az] = this.aimPoint(u, goal);
      const dx = ax - u.x;
      const dz = az - u.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        const s = Math.min(d, move);
        u.x += (dx / d) * s;
        u.z += (dz / d) * s;
        u.heading = Math.atan2(dx, dz);
        u.anim = 'walk';
      }
      return false;
    }
    while (move > 0 && u.path.length) {
      const [wx, wz] = u.path[0]!;
      const dx = wx - u.x;
      const dz = wz - u.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) {
        u.path.shift();
        continue;
      }
      const s = Math.min(d, move);
      u.x += (dx / d) * s;
      u.z += (dz / d) * s;
      u.heading = Math.atan2(dx, dz);
      move -= s;
      if (s >= d) u.path.shift();
    }
    u.anim = 'walk';
    return false;
  }

  /** Is this unit on open water (crossing on a raft)? */
  onWater(u: Unit): boolean {
    const [tx, tz] = worldToTile(this.map, u.x, u.z);
    return this.grid.isWater(tx, tz);
  }

  /** Water depth (m) under a world point; 0 on land (PK 1.8.0). */
  depthAt(x: number, z: number): number {
    const [tx, tz] = worldToTile(this.map, x, z);
    return waterDepth(this.grid.shore(tx, tz), this.map.tile, this.data.rules.water);
  }

  /** Does this side own boats (a finished river landing, rules.water.boatsFrom)? */
  hasBoats(team: number): boolean {
    if (this.boatsAt !== this.time) {
      this.boatsAt = this.time;
      this.boats = [false, false];
      const from = this.data.rules.water.boatsFrom;
      for (const b of this.buildings.values())
        if (b.progress >= 1 && from.includes(b.type) && (b.team === 0 || b.team === 1)) this.boats[b.team] = true;
    }
    return this.boats[team] ?? false;
  }
  private boats: boolean[] = [false, false];
  private boatsAt = -1;

  /** How this unit crosses the water it stands in: wade, swim, boat or raft; 'land' off water. */
  waterWay(u: Unit): WaterWay {
    const depth = this.depthAt(u.x, u.z);
    if (depth <= 0) return 'land';
    const load = u.carry && u.carry.n > 0 ? u.carry.res : null;
    return waterWay(depth, this.def(u.type).role, this.hasBoats(u.team), load, this.data.rules.water);
  }

  /** The closest point of a goal (building edge, tile centre or point). */
  private aimPoint(u: Unit, goal: { point?: XZ; building?: Building; tile?: XZ }): XZ {
    if (goal.point) return goal.point;
    if (goal.tile) return tileToWorld(this.map, goal.tile[0], goal.tile[1]);
    const b = goal.building!;
    const T = this.map.tile;
    const [cx, cz] = this.center(b);
    const hw = (b.w * T) / 2;
    const hd = (b.d * T) / 2;
    return [Math.max(cx - hw, Math.min(cx + hw, u.x)), Math.max(cz - hd, Math.min(cz + hd, u.z))];
  }

  private doBuild(u: Unit, t: Extract<Task, { kind: 'build' }>, dt: number): void {
    const b = this.buildings.get(t.building);
    if (!b || b.progress >= 1) {
      // Finished: farmers stay on their new field, others look for more work.
      if (b && b.type === 'riceField' && !this.farmerOn(b, u.id))
        u.task = { kind: 'gather', node: null, field: b.id, res: 'food', phase: 'go', near: this.center(b) };
      else u.task = this.nextBuildJob(u) ?? { kind: 'idle' };
      u.path = null;
      return;
    }
    if (!this.walkTo(u, dt, { building: b }, 1.1)) return;
    const [cx, cz] = this.center(b);
    u.heading = Math.atan2(cx - u.x, cz - u.z);
    u.anim = 'build';
    const d = this.bdef(b.type);
    const rate =
      (this.def(u.type).build ?? 1) *
      this.mult('build') *
      (b.type === 'monument' ? this.mult('monument') : 1);
    const before = b.progress;
    b.progress = Math.min(1, b.progress + (dt * rate) / d.buildSec);
    b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * b.maxHp);
    if (b.progress >= 1) {
      b.hp = Math.max(b.hp, b.maxHp * 0.999);
      this.events.push({ kind: 'built', building: b, t: this.time });
      if (b.type === 'monument' && b.temple === this.chapterData.temple) this.monumentDoneAt = this.time;
      // The lumber camp comes with its ox-cart (when there is room in the houses).
      const free = d.freeUnit;
      if (free && this.popUsed(b.team) + this.def(free).pop <= this.popCap(b.team)) {
        const cart = this.spawnNear(b, free);
        this.events.push({ kind: 'trained', unit: cart, t: this.time });
      }
    }
  }

  private nextBuildJob(u: Unit): Task | null {
    let best: Building | null = null;
    let bd = 30;
    for (const b of this.buildings.values()) {
      if (b.team !== u.team || b.progress >= 1) continue;
      const k = this.distTo(b, u.x, u.z);
      if (k < bd) {
        bd = k;
        best = b;
      }
    }
    return best ? { kind: 'build', building: best.id } : null;
  }

  private farmerOn(f: Building, except: number): boolean {
    for (const o of this.units.values())
      if (o.id !== except && o.task.kind === 'gather' && o.task.field === f.id) return true;
    return false;
  }

  dropOffFor(u: Unit, res: Resource, stores = true): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings.values()) {
      if (b.team !== u.team || b.progress < 1) continue;
      const def = this.bdef(b.type);
      if (!(def.dropOff as string[]).includes(res)) continue;
      // The ox-cart takes the timber to a real store, never to another log yard.
      if (!stores && def.stockpile) continue;
      const k = this.distTo(b, u.x, u.z);
      if (k < bd) {
        bd = k;
        best = b;
      }
    }
    return best;
  }

  /** Nearest node of the same kind near a spot (when a tree falls, take the next one). */
  private nearestNode(kind: ResourceNode['kind'], near: XZ, within = 40): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bd = within;
    for (const n of this.nodes.values()) {
      if (n.kind !== kind || n.amount <= 0) continue;
      const [x, z] = this.nodePos(n);
      const k = Math.hypot(x - near[0], z - near[1]);
      if (k < bd) {
        bd = k;
        best = n;
      }
    }
    return best;
  }

  private doGather(u: Unit, t: Extract<Task, { kind: 'gather' }>, dt: number): void {
    const d = this.def(u.type);
    const cap = d.carry ?? 10;
    if (t.phase === 'return') {
      if (!u.carry || u.carry.n <= 0) {
        t.phase = 'go';
        u.path = null;
        if (t.node === null && t.field === null) u.task = { kind: 'idle' };
        return;
      }
      const drop = this.dropOffFor(u, u.carry.res);
      if (!drop) {
        u.task = { kind: 'idle' };
        return;
      }
      if (!this.walkTo(u, dt, { building: drop }, this.data.rules.economy.dropOffRange)) return;
      // A lumber camp keeps the timber until an ox-cart takes it to the store (PK).
      if (this.bdef(drop.type).stockpile) drop.stock = (drop.stock ?? 0) + Math.floor(u.carry.n);
      else this.res[u.team][u.carry.res] += Math.floor(u.carry.n);
      if (u.team === PLAYER)
        this.events.push({
          kind: 'delivered',
          res: u.carry.res,
          n: Math.floor(u.carry.n),
          at: [u.x, u.z],
          t: this.time,
        });
      u.carry = null;
      t.phase = 'go';
      u.path = null;
      if (t.node === null && t.field === null) u.task = { kind: 'idle' };
      return;
    }
    // Source: a node (tree, rock, fruit) or a rice field.
    let node = t.node !== null ? this.nodes.get(t.node) : undefined;
    const field = t.field !== null ? this.buildings.get(t.field) : undefined;
    if (t.node !== null && (!node || node.amount <= 0)) {
      const kind =
        t.nodeKind ??
        (t.res === 'wood' ? 'tree' : t.res === 'food' ? 'fruit' : (t.res as ResourceNode['kind']));
      node = (kind === 'meat' ? null : this.nearestNode(kind, t.near)) ?? undefined;
      if (!node) {
        t.phase = 'return';
        t.node = null;
        if (!u.carry) u.task = { kind: 'idle' };
        return;
      }
      t.node = node.id;
      u.path = null;
    }
    if (t.field !== null && (!field || (field.food ?? 0) <= 0)) {
      if (field && (field.food ?? 0) <= 0) this.removeBuilding(field); // exhausted: fallow
      t.field = null;
      t.phase = 'return';
      if (!u.carry) u.task = { kind: 'idle' };
      return;
    }
    if (t.phase === 'go') {
      const arrived = node
        ? this.walkTo(u, dt, { tile: [node.tx, node.tz] }, this.data.rules.economy.gatherRange)
        : field
          ? this.walkTo(u, dt, { point: this.center(field) }, 1.2)
          : true;
      if (!arrived) return;
      t.phase = 'work';
    }
    if (u.carry && u.carry.res !== t.res) u.carry = null; // switched jobs: drop the old load
    const rate =
      (d.gather?.[t.res] ?? 0.4) *
      this.mult('gather', t.res) *
      this.weatherDef.gather *
      (field ? this.weatherDef.farm : 1) *
      (node?.kind === 'gems' ? this.data.rules.economy.gemValue : 1); // gems pay more (PK)
    const got = Math.min(rate * dt, cap - (u.carry?.n ?? 0), node ? node.amount : (field?.food ?? 0));
    u.carry = { res: t.res, n: (u.carry?.n ?? 0) + got };
    if (node) {
      node.amount -= got;
      const [nx, nz] = this.nodePos(node);
      u.heading = Math.atan2(nx - u.x, nz - u.z);
      if (node.amount <= 0 && node.kind !== 'fish') {
        // PK 1.7.0: the last cut brings the tree down, away from the woodcutter.
        if (node.kind === 'tree') this.events.push({ kind: 'felled', at: [nx, nz], dir: u.heading, t: this.time });
        this.removeNode(node); // fish come back
      }
    } else if (field) {
      field.food = (field.food ?? 0) - got;
      this.growRice(field, dt);
      // The farmer faces his work: the rahat wheel at the field's edge while he waters.
      if (riceStage(this, field).id === 'water') {
        const [wx, wz] = rahatSpot(this, field);
        u.heading = Math.atan2(wx - u.x, wz - u.z);
      }
    }
    u.anim = 'gather';
    if (u.carry.n >= cap - 1e-6 || got <= 0) {
      t.phase = 'return';
      u.path = null;
    }
  }

  /** The rice year moves on while a farmer works the field; the harvest brings food in. */
  growRice(f: Building, dt: number): void {
    const R = this.data.rules.rice;
    f.grow = (f.grow ?? 0) + dt / R.cycleSec;
    if (f.grow < 1) return;
    f.grow -= 1;
    this.res[f.team].food += R.harvestFood;
    this.events.push({ kind: 'delivered', res: 'food', n: R.harvestFood, at: this.center(f), t: this.time });
  }

  private doAttack(u: Unit, t: Extract<Task, { kind: 'attack' }>, dt: number): void {
    const d = this.def(u.type);
    const tu = t.unit !== undefined ? this.units.get(t.unit) : undefined;
    const tb = t.building !== undefined ? this.buildings.get(t.building) : undefined;
    if (d.role === 'support') {
      // The supply cart never fights.
      u.task = { kind: 'idle' };
      return;
    }
    if (!tu && !tb) {
      const resume = (u as Unit & { resume?: Task }).resume;
      u.task = resume ?? { kind: 'idle' };
      (u as Unit & { resume?: Task }).resume = undefined;
      u.path = null;
      return;
    }
    const reach = d.range + (tu ? (tu.type === 'warElephant' ? 1.2 : 0.3) : 0.2);
    const inRange = tu ? Math.hypot(tu.x - u.x, tu.z - u.z) <= reach : this.distTo(tb!, u.x, u.z) <= reach;
    if (!inRange) {
      // Chase: repath often toward a moving target.
      if (tu && u.path && u.path.length === 0) u.path = null;
      if (tu && this.time >= u.repathAt) u.path = null;
      this.walkTo(u, dt, tu ? { point: [tu.x, tu.z] } : { building: tb! }, reach);
      return;
    }
    const [tx, tz] = tu ? [tu.x, tu.z] : this.center(tb!);
    u.heading = Math.atan2(tx - u.x, tz - u.z);
    u.anim = 'attack';
    if (this.time < u.ready) return;
    u.ready = this.time + d.cooldownSec;
    if (d.role === 'ranged')
      this.events.push({ kind: 'shot', from: [u.x, u.z], to: [tx, tz], t: this.time, team: u.team });
    if (tu) this.damageUnit(tu, this.attackOf(u, tu), u);
    else this.damageBuilding(tb!, this.attackOf(u));
    if (d.splash)
      for (const o of [...this.units.values()])
        if (o.team !== u.team && o !== tu && Math.hypot(o.x - tx, o.z - tz) < d.splash)
          this.damageUnit(o, this.attackOf(u, o) * 0.5, u);
  }

  damageUnit(target: Unit, attack: number, by: Unit): void {
    const td = this.def(target.type);
    const aura =
      td.role !== 'worker' && this.nearCommander(target) ? this.data.rules.army.commander.armor : 0;
    const dmg = Math.max(1, attack - td.armor - aura);
    target.hp -= dmg;
    this.events.push({ kind: 'hit', at: [target.x, target.z], t: this.time });
    if (target.hp <= 0) {
      this.units.delete(target.id);
      this.events.push({ kind: 'death', unit: target, t: this.time });
      return;
    }
    // Hit back: idle or working soldiers answer; villagers answer only when idle.
    const role = td.role;
    if (role === 'support' || role === 'scout') return; // carts and watchmen do not turn to fight
    if (target.task.kind !== 'attack' && (role !== 'worker' || target.task.kind === 'idle')) {
      target.task = { kind: 'attack', unit: by.id };
      target.path = null;
    }
  }

  damageBuilding(b: Building, attack: number): void {
    // Finished temples cannot be destroyed in the game (a gameplay rule).
    if (b.type === 'monument' && b.progress >= 1) return;
    b.hp -= Math.max(1, attack - b.armor);
    this.events.push({ kind: 'hit', at: this.center(b), t: this.time });
    if (b.hp <= 0) this.removeBuilding(b, true);
  }

  private removeBuilding(b: Building, destroyed = false): void {
    this.buildings.delete(b.id);
    if (b.type !== 'riceField') this.grid.setRect(b.tx, b.tz, b.w, b.d, true);
    if (destroyed) this.events.push({ kind: 'destroyed', building: b, t: this.time });
    // Refund anything still queued.
    for (const q of b.queue)
      this.pay(q.kind === 'unit' ? this.def(q.id).cost : this.data.techs[q.id]!.cost, b.team, -1);
  }

  removeNode(n: ResourceNode): void {
    this.nodes.delete(n.id);
    if (blocksTile(n.kind)) this.grid.setRect(n.tx, n.tz, 1, 1, true);
  }

  /** Gentle push so units don't stand inside each other. */
  private separate(dt: number): void {
    const list = [...this.units.values()];
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const ra = this.def(a.type).radius ?? 0.45;
        const rb = this.def(b.type).radius ?? 0.45;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = ra + rb;
        if (d >= min || d < 1e-6) continue;
        const push = Math.min((min - d) * 0.5, 2 * dt);
        const ux = dx / d;
        const uz = dz / d;
        // The hero played by hand is never pushed; others step aside for him.
        const moveA = !a.manual && (a.anim === 'walk' || a.task.kind === 'idle');
        const moveB = !b.manual && (b.anim === 'walk' || b.task.kind === 'idle');
        const tryMove = (u: Unit, sx: number, sz: number) => {
          const [tx, tz] = worldToTile(this.map, u.x + sx, u.z + sz);
          if (this.grid.ok(tx, tz)) {
            u.x += sx;
            u.z += sz;
          }
        };
        if (moveA) tryMove(a, -ux * push, -uz * push);
        if (moveB) tryMove(b, ux * push, uz * push);
      }
  }

  // ------------------------------------------------------------ rival AI (gameplay fiction)

  private updateAi(): void {
    const L = this.level;
    const camp = [...this.buildings.values()].find((b) => b.type === RIVAL_CAMP);
    if (!camp) return;
    // No raids while the kingdom has no war camp to answer them (PK, D62).
    const RR = this.data.rules.raids;
    if (RR.requireBarracks && !this.hasBuilt('barracks')) {
      this.ai.nextRaid = Math.max(this.ai.nextRaid, this.time + RR.graceSec);
      if (this.ai.state !== 'WAITING')
        this.setAi('WAITING', `${this.opponent.en} waits: the kingdom has no war camp yet`);
      return;
    }
    if (this.time >= this.ai.nextRaid) {
      this.ai.wave++;
      this.ai.nextRaid = this.time + L.everySec;
      const size = L.wave + Math.floor((this.ai.wave - 1) / L.growEvery) + Math.floor(this.chapter / 3);
      // Raids go for the temple under construction, or else the nearest royal hall.
      const site = this.currentTemple();
      const halls = [...this.buildings.values()].filter((b) => b.team === PLAYER && b.type === 'townCentre');
      const [ccx, ccz] = this.center(camp);
      halls.sort((a, b) => this.distTo(a, ccx, ccz) - this.distTo(b, ccx, ccz));
      const aim = site && site.progress < 1 ? site : halls[0];
      const target = aim ? this.center(aim) : ([0, 0] as XZ);
      const raiders = this.opponent.raiders;
      for (let i = 0; i < size; i++) {
        const u = this.spawnNear(camp, raiders[i % raiders.length]!, RIVAL);
        u.wave = this.ai.wave;
        u.task = {
          kind: 'move',
          to: [target[0] + (this.rand() - 0.5) * 6, target[1] + (this.rand() - 0.5) * 6],
          attackMove: true,
        };
      }
      this.setAi('ATTACKING', `wave ${this.ai.wave}: ${size} ${this.opponent.en} raiders march`);
      this.events.push({ kind: 'raid', wave: this.ai.wave, size, t: this.time });
    } else if (
      this.ai.nextRaid - this.time < 30 &&
      this.ai.state !== 'PREPARING_ATTACK' &&
      this.ai.state !== 'ATTACKING'
    ) {
      this.setAi('PREPARING_ATTACK', `next raid in ${Math.round(this.ai.nextRaid - this.time)} s`);
    }
    // Retreat a wave that has lost most of its strength.
    const waves = new Map<number, { hp: number; max: number; units: Unit[] }>();
    for (const u of this.units.values())
      if (u.team === RIVAL && u.wave) {
        const w = waves.get(u.wave) ?? { hp: 0, max: 0, units: [] };
        w.hp += u.hp;
        w.max += this.def(u.type).hp;
        w.units.push(u);
        waves.set(u.wave, w);
      }
    for (const [wave, w] of waves) {
      const spawned = L.wave + Math.floor((wave - 1) / L.growEvery);
      const strength = w.units.length / spawned;
      if (strength <= L.retreatAt && !w.units.every((u) => u.task.kind === 'move' && !u.task.attackMove)) {
        const home = this.center(camp);
        for (const u of w.units) {
          u.task = { kind: 'move', to: [home[0] + (this.rand() - 0.5) * 8, home[1] + 8 + this.rand() * 4] };
          u.path = null;
          u.wave = undefined;
        }
        this.setAi('RETREATING', `wave ${wave} falls back to the camp`);
      }
    }
    if (!waves.size && this.ai.state === 'ATTACKING')
      this.setAi('RECOVERING', 'raiders gone; rebuilding strength');
    else if (!waves.size && this.ai.state === 'RETREATING')
      this.setAi('RECOVERING', 'regrouping at the camp');
  }

  private setAi(state: string, why: string): void {
    if (this.ai.state === state) return;
    this.ai.state = state;
    this.aiLog.push(`[${Math.floor(this.time)}s] ${state}: ${why}`);
    if (this.aiLog.length > 50) this.aiLog.shift();
  }

  // ------------------------------------------------------------ fog of war

  updateFog(): void {
    this.fogVersion++;
    const { size, visible, explored } = this.fog;
    visible.fill(0);
    const T = this.map.tile;
    const mark = (x: number, z: number, r: number) => {
      const [cx, cz] = worldToTile(this.map, x, z);
      const rt = Math.ceil(r / T);
      for (let dz = -rt; dz <= rt; dz++)
        for (let dx = -rt; dx <= rt; dx++) {
          if (dx * dx + dz * dz > rt * rt) continue;
          const tx = cx + dx;
          const tz = cz + dz;
          if (tx < 0 || tz < 0 || tx >= size || tz >= size) continue;
          visible[tz * size + tx] = 1;
          explored[tz * size + tx] = 1;
        }
    };
    for (const u of this.units.values()) if (u.team === PLAYER) mark(u.x, u.z, this.def(u.type).vision);
    // The 3D hero sees far round him (Anachak Khmer, D92).
    if (this.heroEye) mark(this.heroEye[0], this.heroEye[1], this.data.anachak.hero.vision);
    for (const b of this.buildings.values())
      if (b.team === PLAYER) {
        const [x, z] = this.center(b);
        mark(x, z, this.bdef(b.type).vision + Math.max(b.w, b.d));
      }
  }

  isVisible(x: number, z: number): boolean {
    const [tx, tz] = worldToTile(this.map, x, z);
    return (
      tx >= 0 &&
      tz >= 0 &&
      tx < this.fog.size &&
      tz < this.fog.size &&
      this.fog.visible[tz * this.fog.size + tx] === 1
    );
  }

  // ------------------------------------------------------------ the wild: animals, fish

  kindOf(a: Animal): AnimalKind {
    if (!this.kindCache) this.kindCache = new Map(this.data.world.animals.kinds.map((k) => [k.id, k]));
    return this.kindCache.get(a.kind)!;
  }

  /** Is this tile a fitting home for the kind (D75 habitats)? */
  habitatOk(kind: AnimalKind, x: number, z: number): boolean {
    switch (kind.habitat) {
      case 'forest':
      case 'canopy':
        return this.terrainNear(x, z, 3, 'forest');
      case 'grass':
        return !this.terrainNear(x, z, 3, 'forest');
      case 'water':
        return this.terrainNear(x, z, 3, 'water');
      case 'hill':
        return this.terrainNear(x, z, 3, 'hill');
    }
  }

  /**
   * A herd of one kind in its habitat, away from the kingdom's buildings. Kinds with a
   * region (the Cardamoms in the west, the eastern plains) look there first (D75).
   */
  spawnHerd(kind: AnimalKind): boolean {
    const N = this.map.size;
    const [lo, hi] = kind.herd;
    const n = lo + Math.floor(this.rand() * (hi - lo + 1));
    const r = kind.region;
    for (let tries = 0; tries < 400; tries++) {
      const inRegion = r !== undefined && tries < 250;
      const x = Math.floor(inRegion ? r.x[0] + this.rand() * (r.x[1] - r.x[0]) : this.rand() * N);
      const z = Math.floor(inRegion ? r.z[0] + this.rand() * (r.z[1] - r.z[0]) : this.rand() * N);
      if (!this.grid.ok(x, z)) continue;
      if (!this.habitatOk(kind, x, z)) continue;
      let farFromHome = true;
      for (const b of this.buildings.values())
        if (b.team === PLAYER && Math.hypot(b.tx - x, b.tz - z) < 45) farFromHome = false;
      if (!farFromHome) continue;
      const [wx, wz] = tileToWorld(this.map, x, z);
      for (let i = 0; i < n; i++) {
        const a: Animal = {
          id: this.nextId++,
          kind: kind.id,
          x: wx + (this.rand() - 0.5) * 4,
          z: wz + (this.rand() - 0.5) * 4,
          hp: kind.hp,
          heading: this.rand() * Math.PI * 2,
          home: [wx, wz],
          target: null,
          fleeUntil: 0,
          fleeFrom: null,
          ready: 0,
          moving: false,
        };
        this.animals.set(a.id, a);
      }
      return true;
    }
    return false;
  }

  private terrainNear(x: number, z: number, r: number, t: Terrain): boolean {
    const N = this.map.size;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const tx = x + dx;
        const tz = z + dz;
        if (tx >= 0 && tz >= 0 && tx < N && tz < N && this.map.terrain[tz * N + tx] === t) return true;
      }
    return false;
  }

  /**
   * Grazing and wandering, by behaviour (D75): shy animals bolt from people within their
   * range, predators (tiger, leopards, dholes, crocodiles, king cobras) attack people within
   * range and chase them as far as their leash, defensive animals (boar, wild cattle,
   * elephants, bears, python) strike back at whoever hunts them, calm ones run only when hit.
   */
  private updateAnimals(dt: number): void {
    const W = this.data.world;
    // Look around for people twice a second (one list of the player's units for everyone).
    let people: Unit[] | null = null;
    if (this.time >= this.wildScanAt) {
      this.wildScanAt = this.time + 0.5;
      people = [];
      for (const u of this.units.values()) if (u.team === PLAYER) people.push(u);
    }
    for (const a of this.animals.values()) {
      const k = this.kindOf(a);
      a.moving = false;
      const fights = k.behaviour === 'predator' || k.behaviour === 'defensive';
      if (fights && a.prey !== undefined) {
        const prey = this.units.get(a.prey);
        const keen = k.behaviour === 'predator' || this.time < (a.angryUntil ?? 0);
        if (prey && keen && Math.hypot(prey.x - a.home[0], prey.z - a.home[1]) < k.leash) {
          const d = Math.hypot(prey.x - a.x, prey.z - a.z);
          if (d > 1.3) this.stepAnimal(a, prey.x, prey.z, k.speed * dt);
          else if (this.time >= a.ready) {
            a.ready = this.time + 1.4;
            a.heading = Math.atan2(prey.x - a.x, prey.z - a.z);
            this.damageUnitBy(prey, k.attack);
          }
          continue;
        }
        a.prey = undefined;
        a.angryUntil = undefined;
      }
      if (people && (k.behaviour === 'predator' || k.behaviour === 'shy')) {
        let near: Unit | null = null;
        let nd = k.range;
        for (const u of people) {
          const d = Math.hypot(u.x - a.x, u.z - a.z);
          // A predator only goes for someone it can run straight at.
          if (d < nd && (k.behaviour !== 'predator' || this.openLine(a.x, a.z, u.x, u.z))) {
            nd = d;
            near = u;
          }
        }
        if (near && k.behaviour === 'predator') a.prey = near.id;
        // A shy animal bolts, then pauses before it bolts again (so hunters can close in).
        else if (near && (a.fleeUntil <= 0 || this.time > a.fleeUntil + 3)) {
          a.fleeUntil = this.time + 2.5;
          a.fleeFrom = [near.x, near.z];
        }
      }
      if (this.time < a.fleeUntil && a.fleeFrom) {
        const dx = a.x - a.fleeFrom[0];
        const dz = a.z - a.fleeFrom[1];
        const d = Math.hypot(dx, dz) || 1;
        this.stepAnimal(a, a.x + (dx / d) * 5, a.z + (dz / d) * 5, k.speed * dt);
        continue;
      }
      if (!a.target) {
        if (this.rand() < dt * 0.15) {
          const ang = this.rand() * Math.PI * 2;
          const r = 4 + this.rand() * 14;
          a.target = [a.home[0] + Math.cos(ang) * r, a.home[1] + Math.sin(ang) * r];
        }
        continue;
      }
      const d = Math.hypot(a.target[0] - a.x, a.target[1] - a.z);
      if (d < 0.5 || !this.stepAnimal(a, a.target[0], a.target[1], k.speed * 0.3 * dt)) a.target = null;
    }
    // Herds come back over time; fish return to the shallows.
    if (this.time >= this.wildAt) {
      this.wildAt = this.time + W.animals.respawnSec;
      for (const kind of W.animals.kinds) {
        let n = 0;
        for (const a of this.animals.values()) if (a.kind === kind.id) n++;
        if (n < kind.count) this.spawnHerd(kind);
      }
    }
    const regrow = W.fish.regrowPerSec * dt;
    if (regrow > 0)
      for (const n of this.fish)
        if (n.amount < W.fish.amount) n.amount = Math.min(W.fish.amount, n.amount + regrow);
  }

  /** Open ground all the way from one point to (just short of) another, in half-metre steps. */
  private openLine(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(d / 0.5);
    for (let i = 1; i < n; i++) {
      const [tx, tz] = worldToTile(this.map, ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n);
      if (!this.grid.ok(tx, tz)) return false;
    }
    return true;
  }

  /** Walk an animal straight toward a point over open ground. False if blocked. */
  stepAnimal(a: Animal, x: number, z: number, step: number): boolean {
    const dx = x - a.x;
    const dz = z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return false;
    const s = Math.min(d, step);
    const nx = a.x + (dx / d) * s;
    const nz = a.z + (dz / d) * s;
    const [tx, tz] = worldToTile(this.map, nx, nz);
    a.heading = Math.atan2(dx, dz);
    if (!this.grid.ok(tx, tz)) return false;
    a.x = nx;
    a.z = nz;
    a.moving = true;
    return true;
  }

  /** Villagers hunt: close in, throw spears from a few metres, then butcher the kill. */
  private doHunt(u: Unit, t: Extract<Task, { kind: 'hunt' }>, dt: number): void {
    const a = this.animals.get(t.animal);
    if (!a) {
      u.task = { kind: 'idle' };
      u.path = null;
      return;
    }
    const reach = this.data.rules.automation.huntRange;
    if (Math.hypot(a.x - u.x, a.z - u.z) > reach) {
      if (this.time >= u.repathAt) u.path = null;
      this.walkTo(u, dt, { point: [a.x, a.z] }, reach);
      return;
    }
    u.heading = Math.atan2(a.x - u.x, a.z - u.z);
    u.anim = 'attack';
    if (this.time < u.ready) return;
    u.ready = this.time + this.def(u.type).cooldownSec;
    const k = this.kindOf(a);
    this.events.push({ kind: 'shot', from: [u.x, u.z], to: [a.x, a.z], t: this.time, team: u.team });
    a.hp -= this.def(u.type).attack * 3;
    if (k.behaviour === 'predator' || k.behaviour === 'defensive') {
      // It turns on its hunter (D75): a predator keeps at it, a defensive animal for a while.
      a.prey = u.id;
      a.angryUntil = this.time + 8;
    } else {
      a.fleeUntil = this.time + 2;
      a.fleeFrom = [u.x, u.z];
    }
    if (a.hp > 0) return;
    // The kill becomes meat to carry home.
    this.animals.delete(a.id);
    const [tx, tz] = worldToTile(this.map, a.x, a.z);
    const meat: ResourceNode = { id: this.nextId++, kind: 'meat', tx, tz, amount: k.meat };
    this.nodes.set(meat.id, meat);
    this.events.push({ kind: 'hunted', animal: a.kind, at: [a.x, a.z], node: meat.id, t: this.time });
    // PK: the hunter-scout keeps the hide to sell at a store.
    if (u.type === 'watchman')
      u.hides = (u.hides ?? 0) + Math.round(k.meat * this.data.rules.army.watchman.hideShare);
    // A soldier who killed a dangerous beast goes back to his post; a villager takes the meat.
    if (!this.def(u.type).gather) {
      u.task = { kind: 'idle' };
      u.path = null;
      return;
    }
    u.task = {
      kind: 'gather',
      node: meat.id,
      field: null,
      res: 'food',
      phase: 'go',
      near: [a.x, a.z],
      nodeKind: 'meat',
    };
    u.path = null;
  }

  /** A hit on a unit from something that is not a unit (a tiger). */
  private damageUnitBy(target: Unit, attack: number): void {
    target.hp -= Math.max(1, attack - this.def(target.type).armor);
    this.events.push({ kind: 'hit', at: [target.x, target.z], t: this.time });
    if (target.hp <= 0) {
      this.units.delete(target.id);
      this.events.push({ kind: 'death', unit: target, t: this.time });
    }
  }

  // ------------------------------------------------------------ automation

  /** A wild animal that would hurt people now: a predator, or a defensive one that was hit. */
  private dangerous(a: Animal): boolean {
    const k = this.kindOf(a);
    return k.behaviour === 'predator' || (k.behaviour === 'defensive' && this.time < (a.angryUntil ?? 0));
  }

  /**
   * The alarm (PK: "normal citizens react to danger from robbers or wild animals: they break
   * off their jobs and run for their lives, and the alarm calls the army to kill the danger").
   * Villagers and ox-carts near a raider or a dangerous animal run to the nearest house or
   * hall, wait there, then take up their work again; idle soldiers go for the danger.
   */
  private alarm(): void {
    const A = this.data.rules.alarm;
    const T = this.map.tile;
    const R = A.radiusTiles * T;
    const dangers: Array<{
      x: number;
      z: number;
      raid: boolean;
      what: string;
      unit?: number;
      animal?: number;
    }> = [];
    for (const u of this.units.values())
      if (u.team === RIVAL)
        dangers.push({ x: u.x, z: u.z, raid: true, what: this.def(u.type).en, unit: u.id });
    for (const a of this.animals.values())
      if (this.dangerous(a))
        dangers.push({ x: a.x, z: a.z, raid: false, what: this.kindOf(a).en, animal: a.id });
    let called: (typeof dangers)[number] | null = null;
    let who: { id: number; d: number } | null = null;
    for (const u of this.units.values()) {
      if (u.team !== PLAYER) continue;
      const role = this.def(u.type).role;
      if (role !== 'worker' && role !== 'support') continue;
      let near: (typeof dangers)[number] | null = null;
      let nd = R;
      for (const g of dangers) {
        // A hunter stands his ground against the animal he is hunting himself.
        if (g.animal !== undefined && u.task.kind === 'hunt' && u.task.animal === g.animal) continue;
        const d = Math.hypot(g.x - u.x, g.z - u.z);
        if (d < nd) {
          nd = d;
          near = g;
        }
      }
      if (near) {
        called ??= near;
        if (near === called && (!who || nd < who.d)) who = { id: u.id, d: nd };
        if (u.fleeUntil === undefined) {
          // Remember the job (not a walk or an earlier flight) to take it up again.
          if (u.task.kind !== 'idle' && u.task.kind !== 'move' && u.task.kind !== 'attack')
            u.afterFlee = u.task;
          u.task = { kind: 'move', to: this.shelterFrom(u, near) };
          u.path = null;
          u.waypoints = undefined;
        }
        u.fleeUntil = this.time + A.safeSec;
      } else if (u.fleeUntil !== undefined && this.time >= u.fleeUntil) {
        u.task = u.afterFlee ?? { kind: 'idle' };
        u.afterFlee = undefined;
        u.fleeUntil = undefined;
        u.path = null;
      }
    }
    if (!called) return;
    // Idle soldiers within reach go for the danger.
    for (const s of this.units.values()) {
      const role = this.def(s.type).role;
      if (s.team !== PLAYER || role === 'worker' || role === 'support' || role === 'scout') continue;
      if (s.task.kind !== 'idle') continue;
      if (Math.hypot(s.x - called.x, s.z - called.z) > A.soldierTiles * T) continue;
      s.task =
        called.unit !== undefined
          ? { kind: 'attack', unit: called.unit }
          : { kind: 'hunt', animal: called.animal! };
      s.path = null;
    }
    if (this.time - this.lastAlarm >= A.repeatSec) {
      this.lastAlarm = this.time;
      this.events.push({
        kind: 'alarm',
        at: [called.x, called.z],
        danger: called.raid ? 'raid' : 'animal',
        what: called.what,
        who: who?.id,
        foe: called.unit !== undefined ? { unit: called.unit } : { animal: called.animal },
        t: this.time,
      });
    }
  }

  /** Where to run: the nearest house or hall that is not past the danger, else straight away from it. */
  private shelterFrom(u: Unit, from: { x: number; z: number }): XZ {
    const away = Math.hypot(u.x - from.x, u.z - from.z);
    let best: XZ | null = null;
    let bd = Infinity;
    for (const b of this.buildings.values()) {
      if (b.team !== PLAYER || b.progress < 1) continue;
      if (!['townCentre', 'house', 'nobleHouse', 'storehouse'].includes(b.type)) continue;
      const [cx, cz] = this.center(b);
      if (Math.hypot(cx - from.x, cz - from.z) < away) continue; // the danger is between
      const d = Math.hypot(cx - u.x, cz - u.z);
      if (d < bd) {
        bd = d;
        best = [cx, cz];
      }
    }
    if (best) return best;
    const k = Math.max(0.01, away);
    const run = this.data.rules.alarm.radiusTiles * this.map.tile * 2;
    return [u.x + ((u.x - from.x) / k) * run, u.z + ((u.z - from.z) / k) * run];
  }

  /** Idle ox-carts take timber from lumber camps to the store (PK: wood goes by cart). */
  private haulWood(): void {
    const H = this.data.rules.haul;
    const camps = [...this.buildings.values()].filter(
      (b) =>
        b.team === PLAYER && b.progress >= 1 && this.bdef(b.type).stockpile && (b.stock ?? 0) >= H.minLoad,
    );
    if (!camps.length) return;
    for (const c of this.units.values()) {
      if (c.team !== PLAYER || c.type !== 'oxCart' || c.task.kind !== 'idle' || c.fleeUntil !== undefined)
        continue;
      // The fullest camp nobody else is already going to.
      const busy = new Set<number>();
      for (const o of this.units.values())
        if (o.task.kind === 'haul' && o.task.phase === 'load') busy.add(o.task.camp);
      const camp = camps.filter((b) => !busy.has(b.id)).sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0];
      if (!camp) return;
      c.task = { kind: 'haul', camp: camp.id, phase: 'load' };
      c.path = null;
    }
  }

  private doHaul(u: Unit, t: Extract<Task, { kind: 'haul' }>, dt: number): void {
    const H = this.data.rules.haul;
    if (t.phase === 'load') {
      const camp = this.buildings.get(t.camp);
      if (!camp || (camp.stock ?? 0) <= 0) {
        t.phase = 'deliver';
        u.path = null;
        if (!u.carry) u.task = { kind: 'idle' };
        return;
      }
      if (!this.walkTo(u, dt, { building: camp }, this.data.rules.economy.dropOffRange + 0.5)) return;
      u.anim = 'gather';
      t.until ??= this.time + H.loadSec;
      if (this.time < (t.until ?? 0)) return;
      const n = Math.min(H.capacity, camp.stock ?? 0);
      camp.stock = (camp.stock ?? 0) - n;
      u.carry = { res: 'wood', n };
      t.phase = 'deliver';
      t.until = undefined;
      u.path = null;
      return;
    }
    if (!u.carry) {
      u.task = { kind: 'idle' };
      return;
    }
    const store = this.dropOffFor(u, u.carry.res, false);
    if (!store) {
      u.task = { kind: 'idle' };
      return;
    }
    if (!this.walkTo(u, dt, { building: store }, this.data.rules.economy.dropOffRange + 0.5)) return;
    this.res[u.team][u.carry.res] += Math.floor(u.carry.n);
    this.events.push({
      kind: 'delivered',
      res: u.carry.res,
      n: Math.floor(u.carry.n),
      at: [u.x, u.z],
      t: this.time,
    });
    u.carry = null;
    u.task = { kind: 'idle' };
    u.path = null;
  }

  /** Soldiers defend: raiders near the kingdom are met by idle soldiers (PK, D62). */
  private guard(): void {
    const A = this.data.rules.automation;
    const T = this.map.tile;
    const mine = [...this.buildings.values()].filter((b) => b.team === PLAYER);
    const threats = [...this.units.values()].filter(
      (u) => u.team === RIVAL && mine.some((b) => this.distTo(b, u.x, u.z) < A.guardTiles * T),
    );
    if (!threats.length) return;
    for (const u of this.units.values()) {
      const role = this.def(u.type).role;
      if (u.team !== PLAYER || role === 'worker' || role === 'support' || role === 'scout') continue;
      if (u.task.kind !== 'idle' || u.manual) continue;
      let best: Unit | null = null;
      let bd = Infinity;
      for (const t of threats) {
        const d = Math.hypot(t.x - u.x, t.z - u.z);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (best && bd < A.guardTiles * T * 1.5) {
        u.task = { kind: 'attack', unit: best.id };
        u.path = null;
      }
    }
  }

  /** Idle villagers find work by themselves when automation is on. */
  private findWork(): void {
    const A = this.data.rules.automation;
    for (const u of this.units.values()) {
      if (u.team !== PLAYER || !this.def(u.type).gather || u.manual) continue;
      if (u.task.kind !== 'idle') {
        u.idleSince = undefined;
        continue;
      }
      u.idleSince ??= this.time;
      if (!this.autoWork || this.time - u.idleSince < A.idleSec) continue;
      const job = this.jobFor(u);
      if (job) {
        u.task = job;
        u.path = null;
        u.idleSince = undefined;
      }
    }
  }

  /**
   * The most useful job for a villager: an unfinished building close by, an empty rice
   * field, then the resource the kingdom has least of (nearest source within reach).
   */
  jobFor(u: Unit): Task | null {
    const A = this.data.rules.automation;
    const T = this.map.tile;
    const build = this.nextBuildJob(u);
    if (build) return build;
    for (const f of this.buildings.values())
      if (f.team === PLAYER && f.type === 'riceField' && f.progress >= 1 && !this.farmerOn(f, u.id))
        if (this.distTo(f, u.x, u.z) < A.searchTiles * T)
          return { kind: 'gather', node: null, field: f.id, res: 'food', phase: 'go', near: this.center(f) };
    const stock = this.res[PLAYER];
    const order = [...RESOURCES].sort((a, b) => stock[a] - stock[b]);
    for (const res of order) {
      const job = this.gatherJob(u, res, A.searchTiles * T);
      if (job) return job;
    }
    return null;
  }

  /** Gather this resource at the nearest source within reach (gold also from gem patches). */
  gatherJob(u: Unit, res: Resource, reach: number): Task | null {
    const kinds: NodeKind[] =
      res === 'food'
        ? ['fruit', 'meat', 'fish']
        : res === 'wood'
          ? ['tree']
          : res === 'gold'
            ? ['gold', 'gems']
            : [res as NodeKind];
    let best: ResourceNode | null = null;
    let bd = reach;
    for (const n of this.nodes.values()) {
      if (!kinds.includes(n.kind) || n.amount <= 1) continue;
      const [x, z] = this.nodePos(n);
      const d = Math.hypot(x - u.x, z - u.z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best || !this.dropOffFor(u, res)) return null;
    return {
      kind: 'gather',
      node: best.id,
      field: null,
      res,
      phase: 'go',
      near: this.nodePos(best),
      nodeKind: best.kind,
    };
  }

  /** Idle villagers now (for the idle-worker button). */
  idleWorkers(): Unit[] {
    return [...this.units.values()].filter(
      (u) => u.team === PLAYER && this.def(u.type).gather && u.task.kind === 'idle' && !u.manual,
    );
  }

  /** Supply carts feed the soldiers round them: they heal (D69). */
  private supply(dt: number): void {
    const S = this.data.rules.army.supply;
    const r = S.radiusTiles * this.map.tile;
    for (const c of this.units.values()) {
      if (c.type !== 'oxCart') continue;
      for (const u of this.units.values()) {
        if (u.team !== c.team || u === c) continue;
        const d = this.def(u.type);
        if (d.role === 'worker' || d.role === 'support') continue;
        if (u.hp < d.hp && Math.hypot(u.x - c.x, u.z - c.z) < r)
          u.hp = Math.min(d.hp, u.hp + S.healPerSec * dt);
      }
    }
  }

  /**
   * Watchmen walk the land by themselves (PK: "seeking the map and find the resource"):
   * an idle watchman heads for the nearest unexplored ground ahead of him, and reports
   * stone, gold and fruit he sees (one report per patch).
   */
  private scout(): void {
    const W = this.data.rules.army.watchman;
    const T = this.map.tile;
    this.minerals ??= [...this.nodes.values()].filter((n) => W.reportKinds.includes(n.kind));
    const hall = [...this.buildings.values()].find(
      (b) => b.team === PLAYER && b.type === 'townCentre' && b.progress >= 1,
    );
    for (const u of this.units.values()) {
      if (u.type !== 'watchman' || u.team !== PLAYER || u.fleeUntil !== undefined) continue;
      // PK: with news of a find, the hunter-scout and his dog go back to tell the king.
      if (u.report) {
        const r = u.report;
        const [hx, hz] = hall ? this.center(hall) : [u.x, u.z];
        if (!hall || Math.hypot(hx - u.x, hz + W.reportAtM - u.z) <= W.reportAtM) {
          this.events.push({ kind: 'found', node: r.node, what: r.what, at: r.at, t: this.time });
          this.sellHides(u); // the hall takes his hides too
          u.report = undefined;
          u.task = { kind: 'idle' };
          u.path = null;
        } else if (u.task.kind !== 'move') {
          u.task = { kind: 'move', to: [hx, hz + W.reportAtM] };
          u.path = null;
        }
        continue;
      }
      const vision = this.def(u.type).vision * T;
      for (const n of this.minerals) {
        if (this.reported.has(n.id) || !this.nodes.has(n.id)) continue;
        const [x, z] = this.nodePos(n);
        if (Math.hypot(x - u.x, z - u.z) > vision) continue;
        // One report per patch: mark every node of that kind nearby as known.
        for (const o of this.minerals)
          if (o.kind === n.kind && Math.hypot(o.tx - n.tx, o.tz - n.tz) < 12) this.reported.add(o.id);
        u.report = { node: n.id, what: n.kind, at: [x, z] };
        break;
      }
      if (u.report) continue;
      // PK: with a full load of hides he goes to the nearest store to sell them.
      if ((u.hides ?? 0) >= W.hidesCap) {
        const store = this.nearestStore(u);
        if (store) {
          const [sx, sz] = this.center(store);
          if (this.distTo(store, u.x, u.z) <= 6) {
            this.sellHides(u);
            u.task = { kind: 'idle' };
          } else if (u.task.kind !== 'move') {
            u.task = { kind: 'move', to: [sx, sz + (store.d * T) / 2 + 2] };
            u.path = null;
          }
          continue;
        }
      }
      // PK: on the way, the hunter and his dog take game they meet (the kill is meat, food).
      if (u.task.kind === 'idle' || u.task.kind === 'move') {
        let prey: Animal | null = null;
        let best = W.huntTiles * T;
        for (const a of this.animals.values()) {
          if (!this.kindOf(a).huntable) continue;
          const d = Math.hypot(a.x - u.x, a.z - u.z);
          if (d < best) {
            best = d;
            prey = a;
          }
        }
        if (prey) {
          u.task = { kind: 'hunt', animal: prey.id };
          u.path = null;
          continue;
        }
      }
      // PK: he looks for the hidden places (and any place not yet found) near enough.
      if (u.task.kind === 'idle') {
        const place = this.unfoundPlaceNear(u, W.seekPlacesTiles);
        if (place) {
          u.task = { kind: 'move', to: place };
          u.path = null;
          continue;
        }
      }
      if (u.task.kind === 'idle') {
        const to = this.exploreTarget(u, W.exploreStepTiles);
        if (to) {
          u.task = { kind: 'move', to };
          u.path = null;
        }
      }
    }
  }

  /** The nearest store (storehouse or hall) that takes gold. */
  private nearestStore(u: Unit): Building | null {
    let best: Building | null = null;
    let bd = Infinity;
    for (const b of this.buildings.values()) {
      if (b.team !== u.team || b.progress < 1 || !this.bdef(b.type).dropOff.includes('gold')) continue;
      const d = this.distTo(b, u.x, u.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** PK: the hides become gold in the kingdom's store. */
  sellHides(u: Unit): void {
    const n = u.hides ?? 0;
    if (n <= 0) return;
    this.res[u.team].gold += n;
    u.hides = 0;
    this.events.push({ kind: 'delivered', res: 'gold', n, at: [u.x, u.z], t: this.time });
  }

  /** An undiscovered place within reach (tiles), as a point to walk to. */
  private unfoundPlaceNear(u: Unit, tiles: number): XZ | null {
    const [tx, tz] = worldToTile(this.map, u.x, u.z);
    let best: XZ | null = null;
    let bd = tiles;
    for (const p of this.places) {
      if (this.discovered.has(p.id)) continue;
      const d = Math.hypot(p.at[0] - tx, p.at[1] - tz);
      if (d < bd) {
        bd = d;
        best = tileToWorld(this.map, p.at[0], p.at[1]);
      }
    }
    return best;
  }

  /** Unexplored, walkable ground ahead of a unit (it keeps its heading when it can). */
  exploreTarget(u: Unit, step: number): XZ | null {
    const [tx, tz] = worldToTile(this.map, u.x, u.z);
    const N = this.map.size;
    const f = this.fog;
    for (let ring = 1; ring <= 6; ring++) {
      const r = step * ring;
      for (let k = 0; k < 24; k++) {
        // Try straight ahead first, then fan out to both sides.
        const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / 24);
        const a = Math.atan2(Math.sin(u.heading), Math.cos(u.heading)) + off;
        const x = Math.round(tx + Math.sin(a) * r);
        const z = Math.round(tz + Math.cos(a) * r);
        if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue;
        if (f.explored[z * f.size + x] || !this.grid.ok(x, z)) continue;
        return tileToWorld(this.map, x, z);
      }
    }
    return null;
  }

  // ------------------------------------------------------------ places and weather

  /** Empire towns and temples: the first of your people to come near finds them (and a gift). */
  private discover(): void {
    const W = this.data.world;
    const T = this.map.tile;
    for (const p of this.places) {
      if (this.discovered.has(p.id)) continue;
      const [px, pz] = tileToWorld(this.map, p.at[0], p.at[1]);
      for (const u of this.units.values())
        if (u.team === PLAYER && Math.hypot(u.x - px, u.z - pz) < W.discoverRadius * T) {
          this.discovered.add(p.id);
          this.addResources(p.reward);
          this.events.push({ kind: 'discovered', place: p.id, t: this.time });
          break;
        }
    }
  }

  get weatherDef() {
    const k = this.data.rules.weather.kinds;
    return k.find((w) => w.id === this.weather.id) ?? k[0]!;
  }

  /** The weather changes every cycle (PK: every 30 minutes of play). */
  private updateWeather(): void {
    const Wt = this.data.rules.weather;
    if (this.time < this.weather.next) return;
    const total = Wt.kinds.reduce((a, k) => a + k.weight, 0);
    let pick = this.rand() * total;
    let id = Wt.kinds[0]!.id;
    for (const k of Wt.kinds) {
      pick -= k.weight;
      if (pick <= 0) {
        id = k.id;
        break;
      }
    }
    this.weather = { id, next: this.time + Wt.cycleMin * 60 };
    this.events.push({ kind: 'weather', weather: id, t: this.time });
  }

  // ------------------------------------------------------------ victory

  private checkOutcome(): void {
    if (this.outcome) return;
    const V = this.data.rules.victory;
    const hasTc = [...this.buildings.values()].some((b) => b.team === PLAYER && b.type === 'townCentre');
    if (!hasTc) return this.finish('defeat', 'The royal hall has fallen');
    const temple = this.currentTemple();
    if (
      temple &&
      temple.progress >= 1 &&
      this.monumentDoneAt >= 0 &&
      this.time - this.monumentDoneAt >= V.monumentHoldSec
    )
      return this.completeChapter();
    if (V.destroyCamp && ![...this.buildings.values()].some((b) => b.type === RIVAL_CAMP))
      return this.finish('victory', 'The rival camp is destroyed');
  }

  private finish(result: 'victory' | 'defeat', how: string): void {
    if (this.outcome) return;
    this.outcome = { result, how };
    this.events.push({ kind: 'outcome', result, how, t: this.time });
  }
}
