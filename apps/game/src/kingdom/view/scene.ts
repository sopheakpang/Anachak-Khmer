import { RoadView } from './roads';
import { FishSchools, type FishSpot } from './fishSchool';
import { marketGeometry } from './marketGeo';
import { anachakHallGeometry } from './royalHall';
import { fireGlow, nightness, restsActive } from '../sim/anachak';
import { sunState, type SunState } from '../sim/sunPath';
import * as THREE from 'three';
import { NO_GFX, type KingdomGfx } from './gfx';
import { heightTexture, makeWater, type Water, makePrekWater, skyStep } from './water';
import {
  bambooGeometry,
  forestPalmGeometry,
  gemRockGeometry,
  rahatFrameGeometry,
  rahatWheelGeometry,
  riceTuftGeometry,
  banyanGeometry,
  greatBanyanGeometry,
  lushTreeGeometry,
  egretGeometry,
  homeYardGeometry,
  mangoGeometry,
  swayMaterial,
  bambooRaftGeometry,
} from './flora';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Resource, TempleKit } from '@temples/shared';
import { LANDSCAPE_SIZE as KSIZE } from '../../stage';
import { baseScene } from '../../scenes/base';
import {
  ACT,
  Crowd,
  bushGeometry,
  palmGeometry,
  crowdMaterial,
  figureMaterial,
  treeGeometry,
  type Act,
  type Agent,
} from '../../engine/figures';
import { riderGeometry } from '../../expedition/jungleArt';
import { soft, SUN_DIR } from '../../engine/look';
import { repeated, textures } from '../../engine/textures';
import { TempleView } from '../../world/temple';
import { tileToWorld, worldToTile, type XZ } from '../sim/map';
import { PLAYER, RIVAL, type Building, type KingdomSim, type Team, type Unit } from '../sim/sim';
import {
  boulderGeometry,
  headwear,
  riceFieldGeometry,
  rivalCampGeometry,
  royalHallGeometry,
  scaffoldGeometry,
  storehouseGeometry,
  lumberCampGeometry,
  warCampGeometry,
} from './art';
import { heightOf, landmarkGeometry, templeGeometry } from './temples';
import { WeatherFx } from './weather';
import { Particles, type BurstKind } from './vfx';
import { rahatSpot, riceLook, riceStage } from '../sim/rice';
import { currentCeremony } from '../sim/ceremony';
import { junkGeometry, portGeometry } from './ships';
import { loadGeometry } from './loads';
import { ALERT_COLOR, beaconGeometry, beaconMaterial, beacons, type Flash } from './alerts';
import type { SfxName } from './sound';
import { keungHouseGeometry, rongHouseGeometry } from './houses';
import { chickenGeometry, cowGeometry, pigGeometry } from './livestock';
import {
  buffaloRiderGeometry,
  commanderGeometry,
  eraLookOf,
  kingGeometry,
  queenGeometry,
  brahminGeometry,
  parasolBearerGeometry,
  COURT_LAYOUT,
  type CourtRole,
  type CourtMood,
  CALM_COURT,
  courtPose,
  horsemanGeometry,
  oxCartUnitGeometry,
  soldierGeometry,
  villagerGeometry,
  watchmanGeometry,
  type EraLook,
  type Job,
} from './people';
import { ANIMAL_LOOK, PERCH_RATE } from './wildLook';
import { applyProp, loadProp } from './props';
import { NprUnits } from './npr';
import { blockAo, splatTerrain, wetness, type SplatUniforms } from './terrain';
import { GroundDetailRts, hash as detailHash, type Patch } from './detail';
import { WearMap } from './wear';
import { ElephantGrass, grassReach } from './elephantGrass';
import { LightShafts, MistLayer, mistAmount, shaftAmount } from './atmosphere';
import { addSeeThrough, seeAmount, seeUniforms, setTargets, type SeeUniforms } from './seeThrough';
import { TorchView, torchSpots, type TorchSite } from './torches';
import { NightSky } from './nightSky';
import { FallenTrees, boatGeometry, paddleGeometry, paddleMatrix } from './actions';
import { modelUrl } from '../hero/glbModel';
import type { PropSlotId } from '@temples/shared';

/**
 * The Kingdom tab's 3D view: terrain, water, forests, rocks, buildings in construction
 * stages, both sides' units, selection rings, health bars, arrows, fog of war and the
 * placement ghost. It only reads the simulation; all input goes through kingdom.ts.
 */

/**
 * The camera looks diagonally across the land from the south-east, like the classic
 * isometric RTS view PK asked for (D67): yaw 45°, a 46° pitch and a narrow lens so the
 * view reads almost like an isometric map.
 */
export const CAM_YAW = Math.PI / 4;
export const CAM_PITCH_DEG = 46;

export const TEAM_COLOR: Record<Team, number> = { 0: 0x2f5fa8, 1: 0xb8412f };
const STILL = { speed: 0, leg: 0, arm: 0, armSync: 0 };
/** The water plane's height (m). */
const WATER_Y = -0.12;
/**
 * Grass grows where the ground stands this far (m) above the water plane: not on a bank that dips
 * under it, but on the low meadows, which lie only a few cm higher (PK 1.8.0: the lawn left a
 * bare band there at 0.08).
 */
export const GRASS_DRY = 0.03;
const TREE_CAP = 1600;
/** The RTS camera's lens (degrees). */
const RTS_FOV = 32;

/** How much further back a camera with `fov` must stand to frame what one with `base` does. */
export function lensStretch(base: number, fov: number): number {
  const t = (d: number) => Math.tan(THREE.MathUtils.degToRad(d) / 2);
  return t(base) / t(fov);
}
type XYZ = [number, number, number];
/** Rice plants drawn at once (about 30 fields near the view). */
const RICE_CAP = 3000;
const RICE_GREEN = new THREE.Color(0x86c440);
const RICE_DARK = new THREE.Color(0x5a9a2c);
const RICE_GOLD = new THREE.Color(0xdcb04a);
const RICE_STRAW = new THREE.Color(0xa88a52);

/** What the pointer is over, for the hover marker. */
export type HoverTarget = { kind: 'unit' | 'building' | 'node' | 'animal'; id: number } | null;

const TERRAIN_COLOR: Record<string, number> = {
  grass: 0x6f9440,
  water: 0xb3a77c, // PK 1.8.0: a pale sand bed under the clear water
  ford: 0xa08658,
  forest: 0x4f7430,
  rock: 0x8a8270,
  ruin: 0x7f6a4a,
  hill: 0x5f7a3c,
};

function baseUnitGeometry(type: string, era: EraLook, job: Job): THREE.BufferGeometry {
  switch (type) {
    case 'spearman':
    case 'swordsman':
    case 'archer':
      return soldierGeometry(type, era);
    case 'warElephant':
      return riderGeometry();
    case 'horseman':
      return horsemanGeometry(era);
    case 'buffaloRider':
      return buffaloRiderGeometry(era);
    case 'oxCart':
      return oxCartUnitGeometry();
    case 'commander':
      return commanderGeometry(era);
    case 'watchman':
      return watchmanGeometry(era);
    default:
      return villagerGeometry(job, era);
  }
}

/** Head height of each model (where an opponent's headwear sits). */
const HEAD_TOP: Record<string, number> = { warElephant: 4.12, horseman: 2.67, buffaloRider: 2.55 };

/**
 * A unit model for an era (the people change their dress with the centuries: PK's
 * character prompt set) and, for villagers, the job in hand (tool-to-job). Opponents wear
 * their headwear (campaign.json `look`) over the plain early dress.
 */
export function teamUnitGeometry(
  type: string,
  look = '',
  era: EraLook = 'early',
  job: Job = 'idle',
): THREE.BufferGeometry {
  const base = baseUnitGeometry(type, look ? 'early' : era, job);
  const extra = type === 'warElephant' ? headwear(look, 4.12, 1.05) : headwear(look, HEAD_TOP[type] ?? 1.93);
  return extra.length ? mergeGeometries([base, ...extra])! : base;
}

/** What a villager is doing, as a job with its own tool (PK prompt 29, tool-to-job). */
export function jobOf(u: Unit): Job {
  const t = u.task;
  if (u.anim === 'walk' && u.carry && u.carry.n > 0) return 'porter';
  if (t.kind === 'build') return 'builder';
  if (t.kind === 'hunt') return 'hunter';
  if (t.kind === 'gather') {
    if (t.field !== null) return 'farmer';
    switch (t.nodeKind ?? (t.res === 'wood' ? 'tree' : t.res)) {
      case 'tree':
        return 'woodcutter';
      case 'stone':
        return 'quarryman';
      case 'gold':
      case 'gems':
        return 'goldworker';
      case 'fish':
        return 'fisher';
      case 'meat':
        return 'hunter';
      default:
        return 'forager';
    }
  }
  return 'idle';
}

/** Work that shows a burst of particles and makes a sound, by job. */
const WORK_FX: Partial<Record<Job, { burst: BurstKind; sfx: SfxName; every: number }>> = {
  woodcutter: { burst: 'chips', sfx: 'chop', every: 1.1 },
  quarryman: { burst: 'dust', sfx: 'mine', every: 1.0 },
  goldworker: { burst: 'gold', sfx: 'mine', every: 1.3 },
  builder: { burst: 'dust', sfx: 'hammer', every: 1.2 },
  farmer: { burst: 'splash', sfx: 'farm', every: 2.2 },
  fisher: { burst: 'splash', sfx: 'splash', every: 2.6 },
  forager: { burst: 'leaves', sfx: 'farm', every: 2.4 },
};

export function buildingGeometry(
  type: string,
  variant: 'kingdom' | 'anachak' = 'kingdom',
): THREE.BufferGeometry {
  switch (type) {
    case 'townCentre':
      // Anachak Khmer: the carved hall on its brick terrace (PK's reference image, D98).
      return variant === 'anachak' ? anachakHallGeometry() : royalHallGeometry();
    case 'house':
      return rongHouseGeometry(); // Pteas Rong (PK's references, D67)
    case 'nobleHouse':
      return keungHouseGeometry(); // Pteas Keung, the officials' house
    case 'storehouse':
      return storehouseGeometry();
    case 'lumberCamp':
      return lumberCampGeometry();
    case 'riceField':
      return riceFieldGeometry();
    case 'port':
      return portGeometry();
    case 'barracks':
      return warCampGeometry();
    case 'market':
      return marketGeometry(); // mats and shades on open ground (Zhou Daguan; Anachak Khmer)
    default:
      return rivalCampGeometry();
  }
}

/** Instanced buildings of one type (team colour on banners and cloths). */
class BuildingSet {
  readonly mesh: THREE.InstancedMesh;
  constructor(geo: THREE.BufferGeometry, capacity: number) {
    this.mesh = new THREE.InstancedMesh(geo, crowdMaterial(STILL), capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
}

export class KingdomScene {
  /** The royal court at each hall (D78), rebuilt when the era (and so the dress) changes. */
  private readonly court = new Map<CourtRole, THREE.InstancedMesh>();
  private readonly courtMood: CourtMood = { ...CALM_COURT };
  private water: Water | null = null;
  private readonly sway = swayMaterial();
  private treeSets: THREE.InstancedMesh[] = [];
  private yards!: THREE.InstancedMesh;
  private dikePalms!: THREE.InstancedMesh;
  private egrets!: THREE.InstancedMesh;
  /** The rice in the fields, plant by plant, and the rahat water wheels (PK). */
  private rice!: THREE.InstancedMesh;
  private rahatFrames!: THREE.InstancedMesh;
  private rahatWheels!: THREE.InstancedMesh;
  /** Light alerts (PK): progress, finished, full. */
  private beaconMesh!: THREE.InstancedMesh;
  private readonly flashes: Flash[] = [];
  /** PK: the Chinese junk at the landing while its order is open. */
  private junk!: THREE.Mesh;
  private junkSince = -1;
  /** Bamboo rafts under people crossing water (PK). */
  private rafts!: THREE.InstancedMesh;
  private paddles!: THREE.InstancedMesh;
  /** PK 1.8.0: bamboo rafts (ក្បូនឬស្សី) under people carrying wood or stone across deep water. */
  private bamboo!: THREE.InstancedMesh;
  /** PK 1.7.0: trees fall with the last axe cut and leave a stump. */
  private fallen!: FallenTrees;
  /** PK 1.8.0: elephant grass, see-through cover, torches, the stars and the moon. */
  readonly egrass: ElephantGrass | null = null;
  /** PK 1.8.0: the 30 cm meadow grass (diorama.json sward). */
  readonly sward: ElephantGrass | null = null;
  /** PK 1.8.0: the 10 cm lawn (diorama.json lawn) and the stone clusters (stones). */
  readonly lawn: ElephantGrass | null = null;
  readonly stones: ElephantGrass | null = null;
  private readonly egrassKey = new Map<ElephantGrass, string>();
  private readonly egrassClear = new Map<ElephantGrass, Set<number>>();
  readonly see: SeeUniforms | null = null;
  private seeScanAt = -1;
  readonly torches: TorchView | null = null;
  private torchKey = '';
  readonly nightSky: NightSky | null = null;
  private readonly sunColor = new THREE.Color();
  /** PK 1.8.0: the sun's own colour at midday (sunrise and sunset warm it). */
  private readonly sunDay = new THREE.Color();
  /** PK 1.8.0: where the sun really is (the disc in the sky, the path on the water). */
  private readonly sunSkyDir = SUN_DIR.clone();
  private readonly goldenColor = new THREE.Color();
  /** The sun and the season now (Anachak Khmer with a sun path), for the HUD and the tests. */
  sunNow: SunState | null = null;
  private readonly moonColor = new THREE.Color();
  private readonly lightDir = new THREE.Vector3();
  private smokeAt = 0;
  private courtEra = '';
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(RTS_FOV, KSIZE.width / KSIZE.height, 1, 1100);
  /**
   * The RTS lens (PK 1.7.0, HD-2D diorama): a long lens from further back flattens the view
   * like a model village. `lensK` stretches the camera distance so the framing stays what it
   * was at 32 degrees; the game's zoom numbers do not change.
   */
  private rtsFov = RTS_FOV;
  private rtsFar = 1100;
  private lensK = 1;
  private readonly sun: THREE.DirectionalLight;
  private readonly half: number;
  private readonly trees: THREE.InstancedMesh;
  /** Camera target and distance (for the tree window). */
  private view: [number, number, number] = [0, 0, 100];
  private readonly rocks: Record<'stone' | 'gold' | 'gems', THREE.InstancedMesh>;
  private readonly rockIndex = new Map<number, [mesh: 'stone' | 'gold' | 'gems', i: number]>();
  private readonly fruit: THREE.InstancedMesh;
  private readonly fruitIndex = new Map<number, number>();
  private readonly nodeShown = new Set<number>();
  private readonly sets = new Map<string, BuildingSet>();
  private readonly scaffold: THREE.InstancedMesh;
  private readonly crowds = new Map<string, Crowd>();
  /** What workers carry home, one model per resource (PK: real things, shown while walking). */
  private readonly loadSets: Record<Resource, THREE.InstancedMesh>;
  private readonly rings: THREE.InstancedMesh;
  private readonly bars: { bg: THREE.InstancedMesh; fg: THREE.InstancedMesh };
  private readonly arrows: THREE.InstancedMesh;
  private readonly rubble: THREE.InstancedMesh;
  private readonly fogTex: THREE.DataTexture;
  private readonly ghost: THREE.Mesh;
  private readonly ghostMat: THREE.MeshBasicMaterial;
  readonly temple: TempleView | null;
  /** Campaign temples other than Preah Ko: one clipped model each, by temple id. */
  private readonly temples = new Map<string, { mesh: THREE.Mesh; clip: THREE.Plane; height: number }>();
  private readonly siteMarker: THREE.Group;
  /** Wild animals by kind, fish traps, butchered kills, empire landmarks, weather, hover. */
  private readonly wild = new Map<string, Crowd>();
  /** PK 1.7.0: people, animals and the court drawn as flat NPR toon figures with ink outlines. */
  readonly npr: NprUnits | null = null;
  /** PK 1.7.0: grass clumps, flowers, pebbles and lotus near the camera (diorama look). */
  readonly detail: GroundDetailRts | null = null;
  /** PK 1.7.0: where people live, walk and work, the grass gives way to earth. */
  readonly wear: WearMap | null = null;
  private wearAt = -1;
  private wearUp = -1;
  private wearKey = '';
  /** The sun's direction (lower in the diorama look, for long shadows). */
  private sunDirNow = SUN_DIR.clone();
  /** The diorama's foliage tint for the trees (null: the trees' own colours). */
  private foliage: THREE.Color | null = null;
  private detailKey = '';
  private detailFields: Set<number> | null = null;
  private detailAt: ((tx: number, tz: number) => Patch) | null = null;
  /** Canopy animals' current height in the trees, by animal id (D75). */
  private readonly perchY = new Map<number, number>();
  private wildT = 0;
  private readonly fishMesh: THREE.InstancedMesh;
  /** Fish swimming round the fishing spots (PK). */
  readonly schools = new FishSchools();
  private schoolSpots: FishSpot[] = [];
  private schoolsAt = -1e9;
  private readonly meatMesh: THREE.InstancedMesh;
  private readonly meatIds = new Set<number>();
  readonly weatherFx: WeatherFx;
  /** Chips, dust, splashes, sparks, smoke (D68). */
  readonly particles = new Particles(700);
  /** Work sounds heard this frame (kingdom.ts plays them), with their world x for panning. */
  readonly sounds: Array<{ name: SfxName; x: number; z: number }> = [];
  private readonly livestock = new Map<string, Crowd>();
  private readonly hoverRing: THREE.Mesh;
  private hover: HoverTarget = null;
  private readonly splashes: THREE.InstancedMesh;
  private lastT = 0;
  private frameDt = 0;
  private readonly flights: Array<{ from: THREE.Vector3; to: THREE.Vector3; t0: number }> = [];
  private readonly ruins: Array<{ x: number; z: number; w: number; d: number; until: number }> = [];
  private lastEvent = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(
    private readonly sim: KingdomSim,
    kit: TempleKit | null,
    font: (px: number) => string,
    /** Anno-style graphics per quality preset (D79). */
    readonly gfx: KingdomGfx = NO_GFX,
  ) {
    const map = sim.map;
    this.half = (map.size * map.tile) / 2;
    this.scene = baseScene(150, 520, { center: [0, 0, 0], extent: 60 });
    this.sun = this.scene.children.find((o) => o instanceof THREE.DirectionalLight) as THREE.DirectionalLight;

    if (this.gfx.diorama) {
      this.npr = new NprUnits(sim.data.diorama.units);
      const C = sim.data.diorama.camera;
      this.rtsFov = C.fov;
      this.rtsFar = C.far;
      this.lensK = lensStretch(RTS_FOV, C.fov);
      this.camera.fov = C.fov;
      this.camera.far = C.far;
      this.camera.updateProjectionMatrix();
      this.detail = new GroundDetailRts(sim.data.diorama.detail);
      this.wear = new WearMap(sim.map.size, sim.data.diorama.ground);
      this.wear.setBuildings(sim.buildings.values());
      this.wear.upload();
      // A lower afternoon sun: long readable shadows; a softer sky fill: deeper shade.
      const L = sim.data.diorama.light;
      const el = THREE.MathUtils.degToRad(L.elevation);
      const flat = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
      this.sunDirNow.set(flat.x * Math.cos(el), Math.sin(el), flat.y * Math.cos(el));
      this.sunSkyDir.copy(this.sunDirNow);
      this.sun.position.copy(this.sunDirNow).multiplyScalar(120);
      this.sun.intensity = L.sun;
      if (this.sun.castShadow) {
        this.sun.shadow.mapSize.set(L.shadowMap, L.shadowMap);
        this.sun.shadow.camera.far = 400;
      }
      const hemi = this.scene.children.find((o) => o instanceof THREE.HemisphereLight) as
        | THREE.HemisphereLight
        | undefined;
      if (hemi) hemi.intensity = L.fill;
      this.foliage = new THREE.Color(L.foliage);
    }
    this.buildTerrain();
    if (this.detail) this.scene.add(this.detail.group);
    if (sim.map.roads) {
      this.roads = new RoadView(sim.map, sim.data.anachak.roads.width);
      this.scene.add(this.roads.group);
    }
    // PK 1.8.0: tall elephant grass rolling in the wind.
    if (this.gfx.diorama && this.gfx.elephantGrass && sim.data.diorama.elephantGrass.count > 0) {
      const g = new ElephantGrass(sim.data.diorama.elephantGrass, !!this.gfx.grassShadows && this.sun.castShadow);
      (this as { egrass: ElephantGrass | null }).egrass = g;
      this.scene.add(g.group);
    }
    // PK 1.8.0: the short grass (30 cm, PK's Meshy model) over every green meadow.
    // PK 1.8.0: under it the 10 cm lawn on every green tile, and a few clusters of stones.
    if (this.gfx.diorama && this.gfx.sward) {
      const D = sim.data.diorama;
      for (const [key, cfg] of [['lawn', D.lawn], ['sward', D.sward], ['stones', D.stones]] as const) {
        if (cfg.count <= 0) continue;
        const g = new ElephantGrass(cfg, false);
        (this as unknown as Record<string, ElephantGrass | null>)[key] = g;
        this.scene.add(g.group);
      }
    }
    if (this.gfx.seeThrough) (this as { see: SeeUniforms | null }).see = seeUniforms();
    // PK 1.8.0: ground mist and light shafts (the diorama presets).
    if (this.gfx.diorama && this.gfx.atmosphere) {
      const A = sim.data.diorama.atmosphere;
      this.mist = new MistLayer(A.mist);
      this.shafts = new LightShafts(A.shafts);
      this.scene.add(this.mist.group, this.shafts.group);
    }
    // PK 1.8.0: the nights of Anachak Khmer: torches, stars and the moon.
    if (sim.variant === 'anachak') {
      const N = sim.data.anachak.night;
      const tv = new TorchView(N.torches, this.gfx.torchLights ?? 0, figureMaterial);
      (this as { torches: TorchView | null }).torches = tv;
      this.scene.add(tv.group);
      const sky = new NightSky(N);
      (this as { nightSky: NightSky | null }).nightSky = sky;
      this.scene.add(sky.group);
      this.sunColor.copy(this.sun.color);
      this.sunDay.copy(this.sun.color);
      this.moonColor.set(N.heavens.moonlight);
    }
    // Trees, rocks and fruit: instanced, hidden until explored.
    // Trees: the big map has ~10 000; only explored ones near the camera are drawn
    // (at most TREE_CAP instances, refilled when the view moves), so the frame budget holds.
    // Tree kinds (D79): the common tree, then banyan, bamboo, sugar palm and mango as the
    // preset allows; with wind on, every crown sways (harder on windy and stormy days).
    const leaves = this.gfx.wind ? this.sway.material : figureMaterial;
    // Anachak Khmer: a lush anime forest (PK's reference image) — broadleaf trees and great banyans.
    const anachak = sim.variant === 'anachak' && sim.data.anachak.look === 'anime';
    const kinds = [
      anachak ? lushTreeGeometry() : treeGeometry(1),
      anachak ? greatBanyanGeometry() : banyanGeometry(),
      bambooGeometry(),
      forestPalmGeometry(),
      mangoGeometry(),
    ];
    this.treeSets = kinds.slice(0, Math.max(1, Math.min(5, this.gfx.treeKinds))).map((g) => {
      const m = new THREE.InstancedMesh(g, leaves, TREE_CAP);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      return m;
    });
    this.trees = this.treeSets[0]!;
    for (const m of this.treeSets) m.userData.seeThrough = true;
    for (const m of this.treeSets.slice(1)) this.scene.add(m);
    // The rice year (PK): plants that grow from a seedling bed to golden rows, and the rahat.
    this.rice = new THREE.InstancedMesh(riceTuftGeometry(), figureMaterial, RICE_CAP);
    this.rahatFrames = new THREE.InstancedMesh(rahatFrameGeometry(), figureMaterial, 24);
    this.rahatWheels = new THREE.InstancedMesh(rahatWheelGeometry(), figureMaterial, 24);
    // People cross water in a dugout boat and paddle it (PK 1.7.0: ទូក, not a raft).
    this.rafts = new THREE.InstancedMesh(boatGeometry(), figureMaterial, 60);
    this.paddles = new THREE.InstancedMesh(paddleGeometry(), figureMaterial, 60);
    this.paddles.count = 0;
    this.paddles.frustumCulled = false;
    this.paddles.castShadow = true;
    this.scene.add(this.paddles);
    this.fallen = new FallenTrees(this.treeSets[0]!.geometry, this.treeSets[0]!.material as THREE.Material);
    this.scene.add(this.fallen.group);
    this.junk = new THREE.Mesh(junkGeometry(), figureMaterial);
    this.junk.visible = false;
    this.junk.castShadow = true;
    this.scene.add(this.junk);
    this.beaconMesh = new THREE.InstancedMesh(beaconGeometry(), beaconMaterial(), 64);
    this.beaconMesh.count = 0;
    this.beaconMesh.frustumCulled = false;
    this.beaconMesh.renderOrder = 5;
    this.scene.add(this.beaconMesh);
    this.bamboo = new THREE.InstancedMesh(bambooRaftGeometry(), figureMaterial, 40);
    for (const m of [this.rice, this.rahatFrames, this.rahatWheels, this.rafts, this.bamboo]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = m !== this.rice;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // Village life (D79): kitchen gardens by the houses, palms on the paddy dikes, egrets.
    this.yards = new THREE.InstancedMesh(homeYardGeometry(), figureMaterial, 80);
    this.dikePalms = new THREE.InstancedMesh(palmGeometry(), leaves, 120);
    this.egrets = new THREE.InstancedMesh(egretGeometry(), figureMaterial, 8);
    for (const m of [this.yards, this.dikePalms, this.egrets]) {
      m.count = 0;
      m.castShadow = m !== this.egrets;
      m.receiveShadow = true;
      m.frustumCulled = false;
      if (this.gfx.life) this.scene.add(m);
    }
    const boulder = boulderGeometry();
    const stones = [...sim.nodes.values()].filter((n) => n.kind === 'stone');
    const golds = [...sim.nodes.values()].filter((n) => n.kind === 'gold');
    const gems = [...sim.nodes.values()].filter((n) => n.kind === 'gems');
    this.rocks = {
      stone: new THREE.InstancedMesh(
        boulder,
        soft({ color: 0xc2b48c, roughness: 0.9 }, 0.15),
        Math.max(1, stones.length),
      ),
      gold: new THREE.InstancedMesh(
        boulder,
        soft({ color: 0xd9ad3c, roughness: 0.5, metalness: 0.35 }, 0.2),
        Math.max(1, golds.length),
      ),
      // Sapphires and rubies in grey rock (PK: gems), glinting.
      gems: new THREE.InstancedMesh(
        gemRockGeometry(),
        soft({ vertexColors: true, roughness: 0.25, metalness: 0.15 }, 0.3),
        Math.max(1, gems.length),
      ),
    };
    stones.forEach((n, i) => this.rockIndex.set(n.id, ['stone', i]));
    golds.forEach((n, i) => this.rockIndex.set(n.id, ['gold', i]));
    gems.forEach((n, i) => this.rockIndex.set(n.id, ['gems', i]));
    const fruits = [...sim.nodes.values()].filter((n) => n.kind === 'fruit');
    this.fruit = new THREE.InstancedMesh(bushGeometry(), figureMaterial, Math.max(1, fruits.length));
    fruits.forEach((n, i) => this.fruitIndex.set(n.id, i));
    for (const mesh of [this.rocks.stone, this.rocks.gold, this.rocks.gems, this.fruit]) {
      this.m.makeScale(0, 0, 0);
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, this.m);
      mesh.castShadow = true;
      mesh.frustumCulled = false; // instances appear later, all over the big map
      this.scene.add(mesh);
    }
    // Fish traps (bamboo cones in the shallows) and butchered kills (brown bundles).
    const fish = [...sim.nodes.values()].filter((n) => n.kind === 'fish');
    this.fishMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.45, 0.9, 6).rotateX(Math.PI).translate(0, 0.1, 0),
      soft({ color: 0xc9a25a, roughness: 0.9 }, 0.1),
      Math.max(1, fish.length),
    );
    this.fishMesh.count = 0;
    this.fishMesh.frustumCulled = false;
    this.scene.add(this.fishMesh);
    this.scene.add(this.schools.mesh);
    this.meatMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 0.35, 0.6).translate(0, 0.18, 0),
      soft({ color: 0x7a3e2a, roughness: 1 }, 0.1),
      40,
    );
    this.meatMesh.count = 0;
    this.meatMesh.frustumCulled = false;
    this.scene.add(this.meatMesh);
    // Empire places: one merged mesh of landmarks (temples, towns, a port).
    const marks: THREE.BufferGeometry[] = [];
    for (const p of sim.places) {
      const [wx, wz] = tileToWorld(map, p.at[0], p.at[1]);
      marks.push(landmarkGeometry(p.kind).translate(wx, 0, wz));
    }
    if (marks.length) {
      const lm = new THREE.Mesh(mergeGeometries(marks)!, soft({ vertexColors: true, roughness: 0.9 }, 0.15));
      lm.castShadow = true;
      lm.receiveShadow = true;
      this.scene.add(lm);
    }
    // Hover marker: a pulsing ring under what the pointer is over (before you click).
    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffe07a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 6;
    this.scene.add(this.hoverRing);
    // Water splashes around farmers at work in the paddies.
    this.splashes = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.2, 0.3, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xe6f4ff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        toneMapped: false,
      }),
      60,
    );
    this.splashes.count = 0;
    this.splashes.frustumCulled = false;
    this.scene.add(this.splashes);
    this.weatherFx = new WeatherFx(this.scene);
    this.particles.setViewport(KSIZE.height, this.camera.fov);
    this.scene.add(this.particles.mesh);
    for (const [kind, geo, n] of [
      ['chicken', chickenGeometry(), 160],
      ['pig', pigGeometry(), 80],
      ['cow', cowGeometry({ brown: true }), 60],
    ] as const) {
      const c = new Crowd(geo, n, 1, { speed: 3, leg: 0.4, arm: 0, armSync: 0 }, [0xffffff]);
      this.livestock.set(kind, c);
      this.scene.add(c.mesh);
    }
    this.scene.add(this.trees);
    this.fruit.castShadow = false;
    for (let i = 0; i < fruits.length; i++) this.fruit.setColorAt(i, this.c.set(0xd9a04a));
    // PK's real 3D props (1.6.0), swapped in as they load.
    if (this.gfx.props) this.loadProps();

    // Building sets per type, scaffolding, the monument (the real Preah Ko kit).
    for (const type of [
      'townCentre',
      'house',
      'nobleHouse',
      'storehouse',
      'lumberCamp',
      'riceField',
      'barracks',
      'port',
      'rivalCamp',
    ]) {
      const set = new BuildingSet(
        buildingGeometry(type, sim.variant),
        type === 'house' || type === 'riceField' ? 40 : 12,
      );
      this.sets.set(type, set);
      set.mesh.userData.seeThrough = true;
      this.scene.add(set.mesh);
    }
    if (this.gfx.props) this.loadBuildingModels();
    this.scaffold = new THREE.InstancedMesh(scaffoldGeometry(), crowdMaterial(STILL), 24);
    this.scaffold.count = 0;
    this.scaffold.frustumCulled = false;
    this.scene.add(this.scaffold);
    this.temple = kit ? new TempleView(kit, font, 0) : null;
    if (this.temple) {
      const site = map.sites.find((x) => x.temple === 'preah-ko') ?? map.sites[0]!;
      // The kit is centred on its platform: put that centre on the middle of the site.
      const [wx, wz] = tileToWorld(map, site.tx, site.tz);
      this.temple.group.position.set(
        wx - map.tile / 2 + (site.w * map.tile) / 2,
        0,
        wz - map.tile / 2 + (site.d * map.tile) / 2,
      );
      this.temple.group.visible = false;
      this.temple.setProgress(kit!.slots.length, 0);
      this.temple.snap();
      this.scene.add(this.temple.group);
    }

    // The other temples of the campaign, each on its site; they rise course by course
    // (a clipping plane) while built and stand complete once their chapter is done.
    sim.data.campaign.chapters.forEach((ch, i) => {
      if (ch.form.kind === 'kit') return;
      const site = map.sites[i]!;
      const geo = templeGeometry(ch, map.tile);
      const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
      const mesh = new THREE.Mesh(
        geo,
        soft({ vertexColors: true, roughness: 0.9, clippingPlanes: [clip], clipShadows: true }, 0.15),
      );
      const [x0, z0] = tileToWorld(map, site.tx, site.tz);
      mesh.position.set(
        x0 - map.tile / 2 + (site.w * map.tile) / 2,
        0,
        z0 - map.tile / 2 + (site.d * map.tile) / 2,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.userData.temple = ch.temple;
      this.scene.add(mesh);
      this.temples.set(ch.temple, { mesh, clip, height: heightOf(geo) + 0.5 });
      mesh.userData.seeThrough = true;
    });
    // The current chapter's site: golden stakes and cords around its footprint.
    this.siteMarker = new THREE.Group();
    const cord = new THREE.MeshBasicMaterial({ color: 0xf1cd78, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++)
      this.siteMarker.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25).translate(0, 1.1, 0), cord));
    for (let i = 0; i < 4; i++) this.siteMarker.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), cord));
    this.scene.add(this.siteMarker);

    // Loads carried over the head, selection rings, health bars, arrows, rubble.
    this.loadSets = Object.fromEntries(
      (['food', 'wood', 'stone', 'gold'] as const).map((r) => {
        const m = new THREE.InstancedMesh(loadGeometry(r), figureMaterial, 160);
        m.count = 0;
        m.castShadow = true;
        m.frustumCulled = false;
        this.scene.add(m);
        return [r, m];
      }),
    ) as unknown as Record<Resource, THREE.InstancedMesh>;
    this.rings = new THREE.InstancedMesh(
      new THREE.RingGeometry(0.62, 0.8, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x9dff6a,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
      220,
    );
    const barGeo = new THREE.PlaneGeometry(1, 0.16);
    this.bars = {
      bg: new THREE.InstancedMesh(
        barGeo,
        new THREE.MeshBasicMaterial({ color: 0x1a1410, toneMapped: false, depthTest: false }),
        220,
      ),
      fg: new THREE.InstancedMesh(
        barGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false }),
        220,
      ),
    };
    this.bars.bg.renderOrder = 10;
    this.bars.fg.renderOrder = 11;
    this.arrows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x3a2a1a }),
      60,
    );
    this.rubble = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.25, 1),
      soft({ color: 0x5a4a3a, roughness: 1 }, 0),
      30,
    );
    for (const mesh of [this.rings, this.bars.bg, this.bars.fg, this.arrows, this.rubble]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }

    // Fog of war: a dark veil over the ground, opaque where nobody has been.
    // The fog veil texture is half the tile grid on the empire map (upload stays small).
    const N = sim.fog.size > 600 ? sim.fog.size / 2 : sim.fog.size;
    this.fogTex = new THREE.DataTexture(new Uint8Array(N * N * 4), N, N, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(map.size * map.tile, map.size * map.tile).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x0c0a08,
        alphaMap: this.fogTex,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    fog.position.y = 0.35;
    fog.renderOrder = 5;
    this.scene.add(fog);
    this.veil = fog;

    // Placement ghost.
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x7cff7c,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.ghostMat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  // ------------------------------------------------------------ world

  private buildTerrain(): void {
    const map = this.sim.map;
    const N = map.size;
    const size = N * map.tile;
    // One vertex every 2 tiles on the Angkor map, every 4 on the empire map (D56, D60).
    const step = N > 600 ? 4 : N > 200 ? 2 : 1;
    const S = Math.floor(N / step);
    const geo = new THREE.PlaneGeometry(size, size, S, S);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    // PK 1.8.0: how much of the land round each vertex is forest (dead leaves lie only there).
    const forestK = new Float32Array(pos.count);
    const c = new THREE.Color();
    const at = (x: number, z: number) => {
      const j = Math.max(0, Math.min(N - 1, z)) * N + Math.max(0, Math.min(N - 1, x));
      // Under a royal road's bridge the river still runs (Anachak Khmer, D92).
      return map.bridge?.[j] ? 'water' : map.terrain[j]!;
    };
    for (let i = 0; i < pos.count; i++) {
      // Vertex (i) sits at a tile corner: blend the four tiles around it.
      const vx = (i % (S + 1)) * step;
      const vz = Math.floor(i / (S + 1)) * step;
      const around: string[] = [];
      const h = Math.max(1, step / 2);
      for (let dz = -h; dz < h; dz++) for (let dx = -h; dx < h; dx++) around.push(at(vx + dx, vz + dz));
      const wet = around.filter((t) => t === 'water').length;
      const high = around.filter((t) => t === 'hill').length;
      forestK[i] = around.filter((t) => t === 'forest').length / around.length;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const t of around) {
        c.set(TERRAIN_COLOR[t] ?? TERRAIN_COLOR.grass!);
        r += c.r / around.length;
        g += c.g / around.length;
        b += c.b / around.length;
      }
      const n = 0.93 + 0.14 * Math.abs((Math.sin(vx * 12.9898 + vz * 78.233) * 43758.5453) % 1);
      col.set([r * n, g * n, b * n], i * 3);
      // Water tiles sink below the water plane; the rest gets small low-poly facets.
      const lift = Math.sin(vx * 1.7 + vz * 2.3) * 0.08;
      // The Kulen hills rise (not walkable, so units never stand on them).
      const n4 = around.length;
      pos.setY(
        i,
        wet >= n4 * 0.6 ? -0.9 : wet > 0 ? -0.35 : high === n4 ? 5 + lift * 20 : high > 0 ? 1.6 : lift,
      );
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    // The ground's height grid (PK 1.8.0: nothing planted where the bank dips under the water).
    const gh = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) gh[i] = pos.getY(i);
    this.groundH = { h: gh, n: S + 1, size };
    const tx = textures();
    const groundMat = soft({ vertexColors: true, map: repeated(tx.grass, 48, 48), roughness: 1 }, 0);
    if (this.gfx.diorama) {
      // The diorama ground (PK 1.7.0): laterite slopes, emerald lowland, block-shadow AO.
      const hs = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) hs[i] = pos.getY(i);
      const D = this.sim.data.diorama.terrain;
      geo.setAttribute('aoBlock', new THREE.BufferAttribute(blockAo(hs, S + 1, D.aoSteps), 1));
      geo.setAttribute('aForest', new THREE.BufferAttribute(forestK, 1));
      this.groundU = splatTerrain(
        groundMat,
        D,
        this.sim.data.diorama.ground,
        this.wear?.texture,
        size,
        this.sim.data.diorama.wet,
      );
      this.puddleSky.copy(this.groundU.uSky.value);
    }
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);
    if (this.gfx.water === 'shader') {
      // Living water (D79): depth colour from the ground under it, ripples, foam at the shore.
      const heights = new Float32Array((S + 1) * (S + 1));
      for (let i = 0; i < pos.count; i++) heights[i] = pos.getY(i);
      this.water = this.gfx.diorama
        ? makePrekWater(heightTexture(heights, S + 1), size, -0.12, this.sunDirNow, this.sim.data.diorama.water)
        : makeWater(heightTexture(heights, S + 1), size, -0.12, SUN_DIR);
      this.scene.add(this.water.mesh);
    } else {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        soft({ color: 0x5f9fa6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }, 0),
      );
      water.position.y = -0.12;
      this.scene.add(water);
    }
    // Ruins: fallen laterite blocks.
    const ruinTiles: XZ[] = [];
    map.terrain.forEach((t, i) => {
      if (t === 'ruin') ruinTiles.push([i % N, Math.floor(i / N)]);
    });
    const ruins = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.6, 0.8, 1.1),
      soft({ color: 0x9a5a3a, roughness: 1 }, 0.1),
      Math.max(1, ruinTiles.length),
    );
    ruinTiles.forEach(([x, z], i) => {
      const [wx, wz] = tileToWorld(map, x, z);
      this.m.makeRotationY((x * 7 + z) % 3);
      this.m.setPosition(wx, 0.35, wz);
      ruins.setMatrixAt(i, this.m);
    });
    ruins.castShadow = true;
    this.scene.add(ruins);
  }

  /** Show trees, rocks and fruit once their tile has been explored; hide used-up ones. */
  /**
   * Rocks and fruit bushes: only explored ones still there, within reach of the camera, packed
   * at the front of their instanced meshes (PK 1.8.0: the frame budget; PK's 3D models are
   * ~1 000 triangles each, so the whole map's worth must not be drawn every frame).
   */
  private nodesAt: [number, number, number] = [NaN, NaN, NaN];
  private syncNodes(force = true): void {
    const [cx, cz, dist] = this.view;
    const [ax, az, ad] = this.nodesAt;
    if (!force && Math.hypot(cx - ax, cz - az) < 15 && Math.abs(dist - ad) < 15) return;
    this.nodesAt = [cx, cz, dist];
    const s = this.sim;
    const size = s.fog.size;
    const reach = Math.max(90, dist * 2.2);
    const counts = { stone: 0, gold: 0, gems: 0, fruit: 0 };
    const place = (mesh: THREE.InstancedMesh, i: number, x: number, z: number, scale: number, rot: number) => {
      this.m.makeRotationY(rot);
      this.m.scale(this.v.setScalar(scale));
      this.m.setPosition(x, 0, z);
      mesh.setMatrixAt(i, this.m);
    };
    this.nodeShown.clear();
    const show = (id: number): [number, number] | null => {
      const n = s.nodes.get(id);
      if (!n || !s.fog.explored[n.tz * size + n.tx]) return null;
      const [x, z] = s.nodePos(n);
      if (Math.abs(x - cx) > reach || Math.abs(z - cz) > reach) return null;
      this.nodeShown.add(id);
      return [x, z];
    };
    for (const [id, [kind]] of this.rockIndex) {
      const p = show(id);
      const n = s.nodes.get(id);
      if (p && n) place(this.rocks[kind], counts[kind]++, p[0], p[1], 1.1, n.tx + n.tz);
    }
    for (const id of this.fruitIndex.keys()) {
      const p = show(id);
      const n = s.nodes.get(id);
      if (p && n) place(this.fruit, counts.fruit++, p[0], p[1], 1.4, n.tx);
    }
    for (const kind of ['stone', 'gold', 'gems'] as const) {
      this.rocks[kind].count = counts[kind];
      this.rocks[kind].instanceMatrix.needsUpdate = true;
    }
    this.fruit.count = counts.fruit;
    this.fruit.instanceMatrix.needsUpdate = true;
  }

  /** Explored trees within reach of the camera, nearest first, up to TREE_CAP. */
  private treesAt: [number, number, number] = [NaN, NaN, NaN];
  private syncTrees(force: boolean): void {
    const [cx, cz, dist] = this.view;
    const [ax, az, ad] = this.treesAt;
    if (!force && Math.hypot(cx - ax, cz - az) < 12 && Math.abs(dist - ad) < 15) return;
    this.treesAt = [cx, cz, dist];
    const s = this.sim;
    const size = s.fog.size;
    const T = s.map.tile;
    const reach = dist * 1.9 + 20;
    // The RTS camera looks north-west over the land; the hero looks every way.
    const [north, south] = this.heroView ? [1, 1] : [1.2, 0.6];
    const x0 = Math.floor((cx - reach) / T + size / 2);
    const x1 = Math.ceil((cx + reach) / T + size / 2);
    const z0 = Math.floor((cz - reach * north) / T + size / 2);
    const z1 = Math.ceil((cz + reach * south) / T + size / 2);
    const list: Array<[number, number, number, number]> = [];
    for (const n of s.nodes.values()) {
      if (n.kind !== 'tree' || n.tx < x0 || n.tx > x1 || n.tz < z0 || n.tz > z1) continue;
      if (!s.fog.explored[n.tz * size + n.tx]) continue;
      const [x, z] = s.nodePos(n);
      list.push([Math.hypot(x - cx, z - cz), x, z, n.tx * 7 + n.tz * 13]);
    }
    if (list.length > TREE_CAP) list.sort((a, b) => a[0] - b[0]).length = TREE_CAP;
    // Which kind grows where: fixed per tree (from its tile), common trees most often.
    const weights = [42, 12, 10, 12, 24].slice(0, this.treeSets.length);
    const total = weights.reduce((a, b) => a + b, 0);
    const counts = this.treeSets.map(() => 0);
    for (const [, x, z, h] of list) {
      let r = (h * 2654435761) % total;
      let k = 0;
      while (r >= weights[k]!) r -= weights[k++]!;
      const set = this.treeSets[k]!;
      this.m.makeRotationY((h * 0.37) % 6.28);
      this.m.scale(this.v.setScalar(0.75 + (h % 10) / 20));
      this.m.setPosition(x, 0, z);
      if (this.foliage) {
        // Deeper natural greens, each tree its own shade (PK 1.7.0).
        const v = 0.86 + ((h * 37) % 100) / 400;
        set.setColorAt(counts[k]!, this.c.copy(this.foliage).multiplyScalar(v));
      }
      set.setMatrixAt(counts[k]!++, this.m);
    }
    this.treeSets.forEach((set, k) => {
      set.count = counts[k]!;
      set.instanceMatrix.needsUpdate = true;
      if (set.instanceColor) set.instanceColor.needsUpdate = true;
    });
    // Windy days: leaves fall from the nearest crowns (PK), not from the sky.
    const crowns: number[] = [];
    for (const [, x, z, h] of list.slice(0, 80)) crowns.push(x, 4.3 * (0.75 + (h % 10) / 20), z);
    this.weatherFx?.setLeafSources(crowns);
  }

  /** Feet wear the grass and buildings keep their yards bare (PK 1.7.0), once a second. */
  private syncWear(): void {
    const w = this.wear;
    if (!w) return;
    const s = this.sim;
    if (this.wearAt < 0) this.wearAt = s.time;
    const dt = s.time - this.wearAt;
    if (dt < 1) return;
    this.wearAt = s.time;
    if (this.detailKey !== this.wearKey) {
      this.wearKey = this.detailKey;
      w.setBuildings(s.buildings.values());
    }
    const walkers: Array<{ tx: number; tz: number; working: boolean }> = [];
    for (const u of s.units.values()) {
      if (s.onWater(u)) continue;
      const [tx, tz] = worldToTile(s.map, u.x, u.z);
      walkers.push({ tx, tz, working: u.anim === 'gather' || u.anim === 'build' });
    }
    w.step(walkers, Math.min(dt, 5));
    if (s.time - this.wearUp >= 2) {
      this.wearUp = s.time;
      w.upload();
    }
  }

  /** What the ground detail sees on a tile (unexplored, built on, fields and roads: nothing). */
  private patchAt(fields: Set<number>): (tx: number, tz: number) => Patch {
    const s = this.sim;
    const N = s.map.size;
    return (tx, tz) => {
      if (tx < 0 || tz < 0 || tx >= N || tz >= N) return 'none';
      const j = tz * N + tx;
      if (!s.fog.explored[j] || fields.has(j) || s.map.road?.[j]) return 'none';
      const t = s.map.terrain[j];
      if (t === 'water') {
        if (s.map.bridge?.[j]) return 'none';
        const land = (x: number, z: number) =>
          x >= 0 && z >= 0 && x < N && z < N && s.map.terrain[z * N + x] !== 'water';
        return land(tx + 1, tz) || land(tx - 1, tz) || land(tx, tz + 1) || land(tx, tz - 1) ? 'bank' : 'water';
      }
      if (t === 'forest') return 'forest';
      if (t === 'grass') {
        if (!s.grid.ok(tx, tz)) return 'none';
        // Worn to earth (PK 1.7.0): only stones lie there.
        return this.wear && this.wear.at(tx, tz) > this.sim.data.diorama.ground.soilTo ? 'soil' : 'grass';
      }
      return 'none';
    };
  }

  private syncDetail(t: number, fresh: boolean): void {
    const d = this.detail;
    if (!d || this.heroView) {
      if (d) d.group.visible = !this.heroView;
      return;
    }
    d.group.visible = true;
    const s = this.sim;
    // The land changes when buildings or fields come and go: lay the detail again then.
    let h = s.buildings.size;
    for (const b of s.buildings.values()) h = (h * 31 + b.id * 7 + b.tx * 131 + b.tz * 17) % 1e9;
    const key = String(h);
    const changed = key !== this.detailKey;
    if (changed) this.detailKey = key;
    const [cx, cz, dist] = this.view;
    const N = s.map.size;
    // The fields are found only when the detail is laid again (rarely), not every frame.
    const at = (tx: number, tz: number): Patch => {
      if (!this.detailFields) {
        const f = new Set<number>();
        for (const b of s.buildings.values())
          if (b.type === 'riceField')
            for (let z = b.tz; z < b.tz + b.d; z++) for (let x = b.tx; x < b.tx + b.w; x++) f.add(z * N + x);
        this.detailFields = f;
        this.detailAt = this.patchAt(f);
      }
      return this.detailAt!(tx, tz);
    };
    if (changed || fresh) this.detailFields = null;
    d.update(cx, cz, dist, t, s.map.tile, this.half, at, changed || fresh);
  }

  /** Every figure mesh (people, livestock, wild animals, the court) toon-shaded and inked. */
  private syncNpr(): void {
    const npr = this.npr;
    if (!npr) return;
    for (const c of this.crowds.values()) npr.apply(c.mesh, this.scene);
    for (const c of this.livestock.values()) npr.apply(c.mesh, this.scene);
    for (const c of this.wild.values()) npr.apply(c.mesh, this.scene);
    for (const m of this.court.values()) npr.apply(m, this.scene);
    npr.update(this.camera, KSIZE.height);
  }

  /** How many of PK's prop models are on the map now (the tests read it). */
  propsOn = 0;

  private loadProps(): void {
    const targets: Partial<Record<PropSlotId, THREE.InstancedMesh>> = {
      'tree.common': this.treeSets[0],
      'tree.palm': this.treeSets[3],
      'tree.mango': this.treeSets[4],
      dikePalm: this.dikePalms,
      'rock.stone': this.rocks.stone,
      'rock.gold': this.rocks.gold,
      fruit: this.fruit,
    };
    for (const [id, slot] of Object.entries(this.sim.data.props.slots)) {
      const mesh = targets[id as PropSlotId];
      if (!mesh || !slot || (this.gfx.diorama && slot.diorama === false)) continue;
      void loadProp(modelUrl(slot.file)).then((m) => {
        if (m && applyProp(mesh, m, slot)) this.propsOn++;
      });
    }
  }

  /** PK 1.8.0: buildings drawn from PK's own models (the royal hall), in every look. */
  private loadBuildingModels(): void {
    for (const [type, slot] of Object.entries(this.sim.data.props.buildings ?? {})) {
      const set = this.sets.get(type);
      if (!set) continue;
      void loadProp(modelUrl(slot.file)).then((m) => {
        if (m && applyProp(set.mesh, m, slot)) this.propsOn++;
      });
    }
  }

  private syncFog(): void {
    const { visible, explored, size } = this.sim.fog;
    const d = this.fogTex.image.data as Uint8Array;
    const N = this.fogTex.image.width;
    const k = size / N; // tiles per texel (1 or 2)
    for (let tz = 0; tz < N; tz++)
      for (let tx = 0; tx < N; tx++) {
        let vis = 0;
        let exp = 0;
        for (let j = 0; j < k; j++)
          for (let i = 0; i < k; i++) {
            const idx = (tz * k + j) * size + tx * k + i;
            vis |= visible[idx]!;
            exp |= explored[idx]!;
          }
        // Explored land stays clear (PK: no grey filter when zoomed out); only land nobody has
        // seen is dark.
        const a = vis ? 0 : exp ? 22 : 238;
        // Texture rows run south → north on the plane; fog rows run north → south.
        const o = ((N - 1 - tz) * N + tx) * 4;
        d[o] = d[o + 1] = d[o + 2] = a;
        d[o + 3] = 255;
      }
    this.fogTex.needsUpdate = true;
  }

  /** The fish round the fishing spots near the view (the list is refreshed twice a second). */
  private syncSchools(t: number): void {
    const s = this.sim;
    if (t - this.schoolsAt > 0.5) {
      this.schoolsAt = t;
      const [cx, cz] = this.view;
      const size = s.fog.size;
      const near: Array<FishSpot & { d: number }> = [];
      for (const f of s.fish) {
        if (f.amount < 20 || !s.fog.explored[f.tz * size + f.tx]) continue;
        const [x, z] = s.nodePos(f);
        const d = Math.hypot(x - cx, z - cz);
        if (d < 240) near.push({ x, z, full: Math.min(1, f.amount / 200), d });
      }
      near.sort((a, b) => a.d - b.d);
      this.schoolSpots = near;
    }
    this.schools.update(this.schoolSpots, t);
  }

  /** Fish traps in explored shallows (hidden while fished out), and kills waiting to be carried. */
  private syncFish(): void {
    const s = this.sim;
    const size = s.fog.size;
    let n = 0;
    for (const f of s.fish) {
      if (n >= this.fishMesh.instanceMatrix.count) break;
      if (!s.fog.explored[f.tz * size + f.tx] || f.amount < 20) continue;
      const [x, z] = s.nodePos(f);
      this.m.makeRotationY(f.tx);
      this.m.setPosition(x, -0.15, z);
      this.fishMesh.setMatrixAt(n++, this.m);
    }
    this.fishMesh.count = n;
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }

  private syncMeat(): void {
    let n = 0;
    for (const id of [...this.meatIds]) {
      const node = this.sim.nodes.get(id);
      if (!node) {
        this.meatIds.delete(id);
        continue;
      }
      if (n >= this.meatMesh.instanceMatrix.count) break;
      const [x, z] = this.sim.nodePos(node);
      this.m.makeRotationY(id);
      this.m.scale(this.v.setScalar(0.6 + 0.4 * Math.min(1, node.amount / 150)));
      this.m.setPosition(x, 0, z);
      this.meatMesh.setMatrixAt(n++, this.m);
    }
    this.meatMesh.count = n;
    this.meatMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Wild animals seen now: grazing (legs still) or running. Canopy animals (gibbons,
   * langurs, hornbills...) rest up in the trees and climb down to run (D75).
   */
  private syncWild(t: number): void {
    const dt = Math.min(0.25, Math.max(0, t - this.wildT));
    this.wildT = t;
    const groups = new Map<string, Agent[]>();
    for (const a of this.sim.animals.values()) {
      if (!this.sim.isVisible(a.x, a.z) || a.id === this.hiddenAnimal) continue;
      const list = groups.get(a.kind) ?? [];
      const { x, z, heading, moving } = a;
      const perch = ANIMAL_LOOK[a.kind]?.perch;
      let y = 0;
      if (perch) {
        const goal = moving ? 0 : perch;
        const was = this.perchY.get(a.id) ?? goal;
        y = was + Math.sign(goal - was) * Math.min(Math.abs(goal - was), PERCH_RATE * dt);
        this.perchY.set(a.id, y);
      }
      list.push({ place: () => ({ x, y, z, heading, act: moving ? ACT.crowd : ACT.stand }) });
      groups.set(a.kind, list);
    }
    if (this.perchY.size > 2 * this.sim.animals.size + 64)
      for (const id of this.perchY.keys()) if (!this.sim.animals.has(id)) this.perchY.delete(id);
    for (const [kind, spec] of Object.entries(ANIMAL_LOOK)) {
      let c = this.wild.get(kind);
      const list = groups.get(kind) ?? [];
      if (!c && !list.length) continue;
      if (!c) {
        c = new Crowd(
          spec.geo(),
          60,
          spec.scale,
          { speed: spec.speed, leg: spec.leg, arm: spec.arm ?? 0, armSync: 0 },
          [0xffffff],
        );
        this.wild.set(kind, c);
        this.scene.add(c.mesh);
      }
      c.setAgents(list.slice(0, 60));
      c.update(t);
    }
  }

  /** The hover marker follows its target; farmers at work splash in the paddies. */
  private syncHover(t: number): void {
    const h = this.hover;
    const s = this.sim;
    let at: XZ | null = null;
    let r = 1;
    let color = 0xffe07a;
    if (h?.kind === 'unit') {
      const u = s.units.get(h.id);
      if (u) {
        at = [u.x, u.z];
        r = (s.def(u.type).radius ?? 0.5) * 1.9;
        color = u.team === PLAYER ? 0x9dff6a : 0xff6a4a;
      }
    } else if (h?.kind === 'building') {
      const b = s.buildings.get(h.id);
      if (b) {
        at = s.center(b);
        r = (Math.max(b.w, b.d) * s.map.tile) / 1.3;
        color = b.team === PLAYER ? 0x9dff6a : 0xff6a4a;
      }
    } else if (h?.kind === 'node') {
      const n = s.nodes.get(h.id);
      if (n) {
        at = s.nodePos(n);
        r = 1.3;
      }
    } else if (h?.kind === 'animal') {
      const a = s.animals.get(h.id);
      if (a) {
        at = [a.x, a.z];
        r = ANIMAL_LOOK[a.kind]?.ring ?? 1.1;
        // Predators get the red ring (D75: tiger, leopards, dholes, crocodile, king cobra).
        color = s.kindOf(a).behaviour === 'predator' ? 0xff6a4a : 0xffe07a;
      }
    }
    this.hoverRing.visible = !!at;
    if (at) {
      const k = r * (1 + 0.08 * Math.sin(t * 6));
      this.hoverRing.scale.set(k, 1, k);
      this.hoverRing.position.set(at[0], 0.12, at[1]);
      (this.hoverRing.material as THREE.MeshBasicMaterial).color.set(color);
    }
    // Splashes: rings that grow and fade around each farmer working a field.
    let n = 0;
    for (const u of s.units.values()) {
      if (u.team !== PLAYER || u.anim !== 'gather' || u.task.kind !== 'gather' || u.task.field === null)
        continue;
      for (let j = 0; j < 2 && n < this.splashes.instanceMatrix.count; j++) {
        const f = (t * 0.8 + j * 0.5 + u.id * 0.37) % 1;
        const k = 0.6 + f * 2.2;
        const ang = u.heading;
        this.m.makeScale(k, 1, k);
        this.m.setPosition(u.x + Math.sin(ang) * 0.6, 0.08, u.z + Math.cos(ang) * 0.6);
        this.splashes.setMatrixAt(n++, this.m);
      }
    }
    this.splashes.count = n;
    this.splashes.instanceMatrix.needsUpdate = true;
  }

  /** What the pointer is over (null hides the marker). */
  setHover(h: HoverTarget): void {
    this.hover = h;
  }

  // ------------------------------------------------------------ buildings

  private syncBuildings(now: number): void {
    const s = this.sim;
    const counts = new Map<string, number>();
    let sc = 0;
    for (const b of s.buildings.values()) {
      const [cx, cz] = s.center(b);
      if (b.team === RIVAL && !this.exploredAt(cx, cz)) continue;
      if (b.type === 'monument') {
        this.syncMonument(b, now);
        if (b.progress < 1) sc = this.scaffoldFor(b, sc, cx, cz);
        continue;
      }
      const facing =
        b.type === 'house' || b.type === 'nobleHouse'
          ? Math.PI / 2 // houses face east
          : b.type === 'port'
            ? this.portFacing(b) // the landing stage runs out over the water
            : 0;
      const set = this.sets.get(b.type);
      if (!set) continue;
      const i = counts.get(b.type) ?? 0;
      if (i >= set.mesh.instanceMatrix.count) continue;
      counts.set(b.type, i + 1);
      // Construction stages: foundation, 25 %, 50 %, 75 %, done.
      const stage = b.progress >= 1 ? 1 : 0.12 + 0.88 * (Math.floor(b.progress * 4) / 4 + 0.08);
      this.m.makeRotationY(facing).scale(this.v.set(1, stage, 1));
      this.m.setPosition(cx, 0, cz);
      set.mesh.setMatrixAt(i, this.m);
      // Damaged buildings darken.
      const k = 0.55 + 0.45 * Math.min(1, b.hp / b.maxHp / Math.max(0.05, b.progress));
      // PK's own model keeps its colours (white = as made); built-in shapes take the team colour.
      const team = set.mesh.userData.prop ? 0xffffff : this.teamColor(b.team);
      set.mesh.setColorAt(i, this.c.set(team));
      if (b.progress >= 1 && k < 0.99) {
        // Tint the whole model darker when hurt: move the team colour toward soot.
        set.mesh.setColorAt(i, this.c.set(team).lerp(new THREE.Color(0x222222), 1 - k));
      }
      if (b.progress < 1) sc = this.scaffoldFor(b, sc, cx, cz);
    }
    for (const [type, set] of this.sets) {
      set.mesh.count = counts.get(type) ?? 0;
      set.mesh.instanceMatrix.needsUpdate = true;
      if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
    }
    this.scaffold.count = sc;
    this.scaffold.instanceMatrix.needsUpdate = true;
    // Temples with no building (a new game, a loaded save) are hidden.
    const standing = new Set<string>();
    for (const b of s.buildings.values()) if (b.type === 'monument') standing.add(this.templeOf(b));
    if (this.temple && !standing.has('preah-ko')) this.temple.group.visible = false;
    for (const [id, t] of this.temples) if (!standing.has(id)) t.mesh.visible = false;
    this.syncSite(standing);
  }

  /**
   * The king, queens, Brahmins and parasol bearers on the terrace of every royal hall
   * (PK, D78). The king and the dress follow the chapter's era.
   */
  /** PK: the king blesses the growing city — arms raised, Brahmins with him, gold sparkles. */
  courtBless(t: number, seconds = 6): void {
    this.courtMood.blessUntil = t + seconds;
    for (const b of this.sim.buildings.values())
      if (b.team === PLAYER && b.type === 'townCentre' && b.progress >= 1) {
        const [cx, cz] = this.sim.center(b);
        this.particles.burst('gold', cx, 3.2, cz + 7.6, 14);
      }
  }

  /** The king turns to point where an order went (for a few seconds). */
  courtLook(x: number, z: number, t: number): void {
    const hall = [...this.sim.buildings.values()].find(
      (b) => b.team === PLAYER && b.type === 'townCentre' && b.progress >= 1,
    );
    if (!hall) return;
    const [cx, cz] = this.sim.center(hall);
    const h = Math.atan2(x - cx, z - (cz + 7.6));
    // He turns at most a quarter round each way; he does not turn his back on the court.
    this.courtMood.lookHeading = Math.max(-1.4, Math.min(1.4, h));
    this.courtMood.lookUntil = t + 4;
  }

  /**
   * The rice in each field near the view, plant by plant (PK: see the rice grow until the
   * harvest): a seedling bed in one corner while the farmer sows and waters, then rows of
   * plants that grow tall and turn gold, and are reaped row by row. While the field is
   * watered a rahat wheel turns on its west bund.
   */
  private syncRice(t: number): void {
    const s = this.sim;
    const T = s.map.tile;
    const [vx, vz, vd] = this.view;
    let n = 0;
    let nr = 0;
    for (const b of s.buildings.values()) {
      if (b.type !== 'riceField' || b.progress < 1) continue;
      const [cx, cz] = s.center(b);
      if (Math.abs(cx - vx) > vd * 1.6 || Math.abs(cz - vz) > vd * 1.6) continue;
      if (b.team !== PLAYER && !s.isVisible(cx, cz)) continue;
      const look = riceLook(s, b);
      const hw = (b.w * T) / 2 - 0.6;
      const hd = (b.d * T) / 2 - 0.6;
      const put = (x: number, z: number, i: number, h: number, col: THREE.Color) => {
        if (n >= RICE_CAP) return;
        const j = ((b.id * 31 + i * 17) % 13) / 13;
        this.m
          .makeRotationY(j * 6.28)
          .scale(this.v.set(0.9 + 0.3 * j, h * (0.9 + 0.2 * j), 0.9 + 0.3 * j))
          .setPosition(x, 0.05, z);
        this.rice.setMatrixAt(n, this.m);
        this.rice.setColorAt(n++, col);
      };
      if (!look.rows) {
        // Seedling bed (nursery) in the north-east corner, thick and bright green.
        for (let i = 0; i < 16; i++)
          put(
            cx + hw - 0.3 - (i % 4) * 0.35,
            cz - hd + 0.3 + Math.floor(i / 4) * 0.35,
            i,
            look.height,
            RICE_GREEN,
          );
      } else {
        const cols = 13;
        const rows = 9;
        const green = this.c.copy(RICE_GREEN).lerp(RICE_DARK, Math.min(1, look.height));
        const ripe = green.clone().lerp(RICE_GOLD, look.ripe);
        for (let r = 0; r < rows; r++)
          for (let k = 0; k < cols; k++) {
            const i = r * cols + k;
            const x = cx - hw + ((k + 0.5) / cols) * hw * 2;
            const z = cz - hd + ((r + 0.5) / rows) * hd * 2;
            // Reaped from the west: the first columns are stubble.
            const cut = (k + 0.5) / cols < look.cut;
            put(x, z, i, cut ? 0.12 : look.height, cut ? RICE_STRAW : ripe);
          }
      }
      if (riceStage(s, b).id === 'water' && nr < this.rahatFrames.instanceMatrix.count) {
        const [rx, rz] = rahatSpot(s, b);
        this.m.makeRotationY(0).setPosition(rx, 0, rz);
        this.rahatFrames.setMatrixAt(nr, this.m);
        this.m.makeRotationX(-t * 1.6).setPosition(rx, 0.55, rz);
        this.rahatWheels.setMatrixAt(nr++, this.m);
      }
    }
    this.rice.count = n;
    this.rice.instanceMatrix.needsUpdate = true;
    if (this.rice.instanceColor) this.rice.instanceColor.needsUpdate = true;
    for (const m of [this.rahatFrames, this.rahatWheels]) {
      m.count = nr;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  /** Which way a landing faces: toward the nearest open water. */
  private portFacing(b: Building): number {
    const w = this.sim.waterNear(b.tx, b.tz, b.w, b.d, 3);
    if (!w) return 0;
    const [cx, cz] = this.sim.center(b);
    const [wx, wz] = tileToWorld(this.sim.map, w[0], w[1]);
    return Math.atan2(wx - cx, wz - cz);
  }

  /**
   * PK: the Chinese junk sails in to the landing when its order comes, waits moored beside
   * the landing stage, and sails off when the order is filled or its time is up.
   */
  private syncJunk(t: number): void {
    const s = this.sim;
    const boat = s.market.orders.find((o) => o.buyer === 'boat' && s.time >= o.readyAt);
    const port = [...s.buildings.values()].find(
      (b) => b.team === PLAYER && b.type === 'port' && b.progress >= 1,
    );
    if (!boat || !port) {
      this.junk.visible = false;
      this.junkSince = -1;
      return;
    }
    if (this.junkSince < 0) this.junkSince = t;
    const a = this.portFacing(port);
    const [cx, cz] = s.center(port);
    // Moored alongside the end of the landing stage, broadside to the shore.
    const out = (Math.max(port.w, port.d) * s.map.tile) / 2 + 9;
    const mx = cx + Math.sin(a) * out + Math.cos(a) * 3.5;
    const mz = cz + Math.cos(a) * out - Math.sin(a) * 3.5;
    // Sailing in from 70 m out over the first 15 seconds.
    const k = Math.min(1, (t - this.junkSince) / 15);
    const ease = 1 - (1 - k) * (1 - k);
    const far = 70 * (1 - ease);
    this.junk.position.set(mx + Math.sin(a) * far, -0.5 + Math.sin(t * 0.8) * 0.06, mz + Math.cos(a) * far);
    this.junk.rotation.set(Math.sin(t * 0.6) * 0.015, a + Math.PI / 2, 0);
    this.junk.visible = true;
  }

  /** PK: a gold flash of light where something was just finished. */
  flash(x: number, z: number, r: number, t: number): void {
    const sec = this.sim.data.rules.alerts.flashSec;
    this.flashes.push({ x, z, r, until: t + sec, sec });
    if (this.flashes.length > 24) this.flashes.shift();
  }

  private syncBeacons(t: number): void {
    const [vx, vz, vd] = this.view;
    let n = 0;
    const max = this.beaconMesh.instanceMatrix.count;
    for (const b of beacons(this.sim, t, this.flashes)) {
      if (n >= max) break;
      if (Math.abs(b.x - vx) > vd * 2 || Math.abs(b.z - vz) > vd * 2) continue;
      const grow = b.kind === 'done' ? 1 + (1 - b.glow) * 0.5 : 1;
      this.m.makeScale(b.r * grow, b.kind === 'done' ? 1.4 : 1, b.r * grow).setPosition(b.x, 0, b.z);
      this.beaconMesh.setMatrixAt(n, this.m);
      this.beaconMesh.setColorAt(n++, this.c.set(ALERT_COLOR[b.kind]).multiplyScalar(Math.max(0, b.glow)));
    }
    this.beaconMesh.count = n;
    this.beaconMesh.instanceMatrix.needsUpdate = true;
    if (this.beaconMesh.instanceColor) this.beaconMesh.instanceColor.needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--)
      if (this.flashes[i]!.until < t) this.flashes.splice(i, 1);
  }

  /** Is this point on the square in front of a royal hall where the court stands? */
  /** Is (x, z) inside the part of the world the camera shows now? */
  private near(x: number, z: number): boolean {
    return Math.abs(x - this.view[0]) < this.view[2] && Math.abs(z - this.view[1]) < this.view[2];
  }

  private nearCourt(x: number, z: number): boolean {
    for (const b of this.sim.buildings.values()) {
      if (b.type !== 'townCentre') continue;
      const [cx, cz] = this.sim.center(b);
      if (Math.abs(x - cx) < 6 && z - cz > 2 && z - cz < 12) return true;
    }
    return false;
  }

  private ceremonyFxAt = 0;

  private syncCourt(t: number): void {
    // PK: a royal ceremony under way shows at the hall: fireworks, holy water or gold light.
    const cer = currentCeremony(this.sim);
    if (cer && t >= this.ceremonyFxAt) {
      this.ceremonyFxAt = t + 1.3;
      for (const b of this.sim.buildings.values()) {
        if (b.team !== PLAYER || b.type !== 'townCentre' || b.progress < 1) continue;
        const [cx, cz] = this.sim.center(b);
        if (cer.fx === 'fireworks')
          this.particles.burst('sparks', cx + (Math.random() - 0.5) * 8, 9 + Math.random() * 3, cz + 4, 16);
        else if (cer.fx === 'water') this.particles.burst('splash', cx, 2, cz + 7.6, 10);
        else this.particles.burst('gold', cx, 3, cz + 7.2, 10);
      }
    }
    const era = eraLookOf(this.sim.era.id);
    if (era !== this.courtEra) {
      this.courtEra = era;
      for (const m of this.court.values()) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
      this.court.clear();
      const geos: Record<CourtRole, THREE.BufferGeometry> = {
        king: kingGeometry(era),
        queen: queenGeometry(era),
        brahmin: brahminGeometry(),
        parasol: parasolBearerGeometry(),
      };
      for (const role of Object.keys(geos) as CourtRole[]) {
        const n = COURT_LAYOUT.filter((c) => c.role === role).length * 3;
        const m = new THREE.InstancedMesh(geos[role], crowdMaterial(STILL), n);
        m.count = 0;
        m.castShadow = true;
        m.frustumCulled = false;
        this.court.set(role, m);
        this.scene.add(m);
      }
    }
    const counts = new Map<CourtRole, number>();
    for (const b of this.sim.buildings.values()) {
      if (b.team !== PLAYER || b.type !== 'townCentre' || b.progress < 1) continue;
      const [cx, cz] = this.sim.center(b);
      for (const c of COURT_LAYOUT) {
        if (c.role === 'king' && this.hideKing) continue; // the king is out, played in 3D
        const m = this.court.get(c.role)!;
        const i = counts.get(c.role) ?? 0;
        if (i >= m.instanceMatrix.count) continue;
        counts.set(c.role, i + 1);
        const pose = courtPose(c.role, t, this.courtMood);
        this.m.makeRotationY(pose.heading).setPosition(cx + c.at[0], c.at[1] + pose.lift, cz + c.at[2]);
        m.setMatrixAt(i, this.m);
        // Cloth colours: royal gold, the queens' silk, the Brahmins' white, the attendants' red.
        const cloth: Record<CourtRole, number> = {
          king: 0xd9a646,
          queen: 0x8c2f5c,
          brahmin: 0xf3ecd8,
          parasol: 0xa8322a,
        };
        m.setColorAt(i, this.c.set(cloth[c.role]));
      }
    }
    for (const [role, m] of this.court) {
      const pose = courtPose(role, t, this.courtMood);
      const u = (m.material as THREE.Material).userData.uniforms as Record<string, { value: number }>;
      u.uTime!.value = t;
      u.uArm!.value = pose.arm;
      u.uArmSync!.value = pose.armSync;
      u.uSpeed!.value = pose.speed;
      m.count = counts.get(role) ?? 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Village life (D79, PK's plan): a kitchen garden with jars, firewood and a fence beside
   * every house (where the ground is free), sugar palms on the corners of the paddy dikes,
   * egrets circling over the fields, and cooking smoke from the houses near the view.
   */
  private syncLife(t: number): void {
    const s = this.sim;
    const T = s.map.tile;
    const [vx, vz, vd] = this.view;
    let ny = 0;
    let np = 0;
    let ne = 0;
    let nf = 0;
    const near = (x: number, z: number, k = 2) => Math.abs(x - vx) < vd * k && Math.abs(z - vz) < vd * k;
    const smoke = t >= this.smokeAt;
    if (smoke) this.smokeAt = t + 1.4;
    let smokes = 0;
    for (const b of s.buildings.values()) {
      if (b.team !== PLAYER || b.progress < 1) continue;
      const [cx, cz] = s.center(b);
      if (b.type === 'house' || b.type === 'nobleHouse') {
        // The yard on the south side, if those tiles are open ground.
        const yz = cz + (b.d * T) / 2 + 2.2;
        const [tx, tz] = worldToTile(s.map, cx, yz);
        const free = s.grid.ok(tx, tz) && s.grid.ok(tx - 1, tz) && s.grid.ok(tx + 1, tz);
        if (free && ny < this.yards.instanceMatrix.count) {
          this.m.makeRotationY(((b.id * 1.7) % 1) * 0.3 - 0.15).setPosition(cx, 0, yz);
          this.yards.setMatrixAt(ny++, this.m);
        }
        if (smoke && smokes < 6 && near(cx, cz, 1) && (b.id + Math.floor(t)) % 3 === 0) {
          smokes++;
          this.particles.burst('smoke', cx + 1.2, 5.6, cz - 0.6, 2);
        }
      } else if (b.type === 'riceField') {
        const hw = (b.w * T) / 2;
        const hd = (b.d * T) / 2;
        for (const [sx, sz] of [
          [-1, -1],
          [1, 1],
        ] as const) {
          if (np >= this.dikePalms.instanceMatrix.count) break;
          const px = cx + sx * (hw + 0.6);
          const pz = cz + sz * (hd + 0.6);
          // Only on open ground, and never in front of the royal court (PK: nothing on top of things).
          const [ptx, ptz] = worldToTile(s.map, px, pz);
          if (!s.grid.ok(ptx, ptz) || this.nearCourt(px, pz)) continue;
          this.m.makeRotationY(b.id + sx).scale(this.v.setScalar(0.85));
          this.m.setPosition(px, 0, pz);
          this.dikePalms.setMatrixAt(np++, this.m);
        }
        // One egret over every third field near the view, a few in all (PK: fewer birds).
        if (
          near(cx, cz) &&
          nf++ % 3 === 0 &&
          ne < Math.min(this.gfx.birds, this.egrets.instanceMatrix.count)
        ) {
          const a = t * 0.22 + b.id;
          const r = 7 + (b.id % 4);
          this.m
            .makeRotationY(-a)
            .scale(this.v.setScalar(0.6))
            .setPosition(cx + Math.cos(a) * r, 9 + Math.sin(t * 1.3 + b.id) * 0.4, cz + Math.sin(a) * r);
          this.egrets.setMatrixAt(ne++, this.m);
        }
      }
    }
    for (const [m, n] of [
      [this.yards, ny],
      [this.dikePalms, np],
      [this.egrets, ne],
    ] as const) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  private templeOf(b: Building): string {
    return b.temple ?? this.sim.chapterData.temple;
  }

  /** Stakes and cords around the site of the temple this chapter asks for. */
  private siteShown = '';
  private syncSite(standing: Set<string>): void {
    const s = this.sim;
    const site = s.outcome ? null : s.site;
    const done = !site || s.completed.includes(site.temple);
    this.siteMarker.visible = !done && !standing.has(site!.temple);
    if (!site || this.siteShown === site.temple) return;
    this.siteShown = site.temple;
    const T = s.map.tile;
    const [x0, z0] = tileToWorld(s.map, site.tx, site.tz);
    const w = site.w * T;
    const d = site.d * T;
    const cx = x0 - T / 2 + w / 2;
    const cz = z0 - T / 2 + d / 2;
    const k = this.siteMarker.children;
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([sx, sz], i) => k[i]!.position.set(cx + (sx! * w) / 2, 0, cz + (sz! * d) / 2));
    k[4]!.scale.set(w, 1, 1);
    k[4]!.position.set(cx, 1.4, cz - d / 2);
    k[5]!.scale.set(w, 1, 1);
    k[5]!.position.set(cx, 1.4, cz + d / 2);
    k[6]!.rotation.y = Math.PI / 2;
    k[6]!.scale.set(d, 1, 1);
    k[6]!.position.set(cx - w / 2, 1.4, cz);
    k[7]!.rotation.y = Math.PI / 2;
    k[7]!.scale.set(d, 1, 1);
    k[7]!.position.set(cx + w / 2, 1.4, cz);
  }

  /** Team colour: the player's blue, or this chapter's opponent's colour. */
  private teamColor(team: Team): number {
    return team === PLAYER ? TEAM_COLOR[PLAYER] : new THREE.Color(this.sim.opponent.color).getHex();
  }

  private scaffoldFor(b: Building, i: number, cx: number, cz: number): number {
    if (i >= this.scaffold.instanceMatrix.count) return i;
    const T = this.sim.map.tile;
    const h =
      b.type === 'monument'
        ? 3 + (this.temples.get(this.templeOf(b))?.height ?? 12) * b.progress
        : b.type === 'riceField'
          ? 0.4
          : 1.5 + 4 * b.progress;
    this.m.makeScale(b.w * T + 0.6, h, b.d * T + 0.6);
    this.m.setPosition(cx, 0, cz);
    this.scaffold.setMatrixAt(i, this.m);
    this.scaffold.setColorAt(i, this.c.set(0xffffff));
    return i + 1;
  }

  private monumentShown = -1;
  private syncMonument(b: Building, now: number): void {
    const other = this.temples.get(this.templeOf(b));
    if (other) {
      // Rises from the ground up: the clipping plane sits at the built height.
      other.mesh.visible = true;
      other.clip.constant = b.progress >= 1 ? 1e4 : 0.3 + other.height * b.progress;
      return;
    }
    if (!this.temple) return;
    this.temple.group.visible = true;
    const target = this.temple.kit.slots.length;
    const shown = Math.round(b.progress * target);
    if (shown !== this.monumentShown) {
      // A big jump (a loaded save, a finished temple, the demo) appears at once.
      const jump = Math.abs(shown - this.monumentShown) > 12;
      this.monumentShown = shown;
      this.temple.setProgress(target, shown);
      if (jump) this.temple.snap();
    }
    this.temple.update(now);
  }

  private exploredAt(x: number, z: number): boolean {
    const [tx, tz] = worldToTile(this.sim.map, x, z);
    const f = this.sim.fog;
    return tx >= 0 && tz >= 0 && tx < f.size && tz < f.size && f.explored[tz * f.size + tx] === 1;
  }

  // ------------------------------------------------------------ units

  /** Crowds per unit type and side; each opponent has its own (colour and headwear). */
  private crowdKey(type: string, team: Team, job: Job): string {
    const era = eraLookOf(this.sim.era.id);
    return team === PLAYER ? `${type}:0::${era}:${job}` : `${type}:1:${this.sim.opponent.id}:${era}:${job}`;
  }

  private crowd(key: string): Crowd {
    let c = this.crowds.get(key);
    if (!c) {
      const [type, t, opp, era, job] = key.split(':') as [string, string, string, EraLook, Job];
      const team = Number(t) as Team;
      const o = this.sim.data.campaign.opponents.find((x) => x.id === opp);
      const big =
        type === 'warElephant' || type === 'horseman' || type === 'buffaloRider' || type === 'oxCart';
      c = new Crowd(
        teamUnitGeometry(type, o?.look, era, job),
        big ? 24 : type === 'villager' ? 160 : 90, // PK 1.7.0: up to 150 people
        1,
        big ? { speed: type === 'horseman' ? 4 : 2.4, leg: 0.3, arm: 0, armSync: 0 } : undefined,
        [team === PLAYER ? TEAM_COLOR[PLAYER] : new THREE.Color(o?.color ?? '#b8412f').getHex()],
      );
      this.crowds.set(key, c);
      this.scene.add(c.mesh);
    }
    return c;
  }

  private act(u: Unit): Act {
    const role = this.sim.def(u.type).role;
    if (u.anim === 'walk') return u.carry && u.carry.n > 0 && role === 'worker' ? ACT.carry : ACT.crowd;
    if (u.anim === 'gather') {
      const t = u.task;
      // Farmers plant and tend the rice; fishers and butchers work low; others cut and dig.
      if (t.kind === 'gather' && t.field !== null) {
        // The rice year (PK): sow, tread the rahat, transplant, tend, reap.
        const f = this.sim.buildings.get(t.field);
        const stage = f ? riceStage(this.sim, f).id : 'grow';
        return stage === 'sow'
          ? ACT.sow
          : stage === 'water'
            ? ACT.pedal
            : stage === 'harvest'
              ? ACT.reap
              : ACT.plant;
      }
      // PK 1.7.0: the woodcutter swings his axe into the trunk; the fisher throws his net.
      const kind = t.kind === 'gather' ? (t.nodeKind ?? (t.res === 'wood' ? 'tree' : t.res)) : null;
      if (kind === 'tree') return ACT.chop;
      if (kind === 'fish') return ACT.fish;
      return u.carry?.res === 'food' ? ACT.lift : ACT.hammer;
    }
    if (u.anim === 'build') return ACT.hammer;
    if (u.anim === 'attack') {
      if (role === 'ranged') return ACT.draw;
      if (role === 'elephant' || u.type === 'buffaloRider') return ACT.crowd;
      if (u.type === 'horseman') return ACT.thrust;
      if (u.type === 'swordsman') return ACT.sword;
      return ACT.thrust; // spears, and villagers' hunting spears
    }
    if (u.type === 'swordsman' && u.task.kind === 'idle') return ACT.guard;
    return role === 'elephant' ? ACT.crowd : ACT.stand;
  }

  private syncUnits(t: number, selected: Set<number>): void {
    const s = this.sim;
    const groups = new Map<string, Agent[]>();
    const loads: Record<Resource, number> = { food: 0, wood: 0, stone: 0, gold: 0 };
    let rings = 0;
    let bars = 0;
    let nrafts = 0;
    let nbamboo = 0;
    const camQ = this.camera.quaternion;
    this.fallen.setTree(this.treeSets[0]!.geometry, this.treeSets[0]!.material as THREE.Material);
    this.fallen.update(t);
    for (const u of s.units.values()) {
      if (u.team === RIVAL && !s.isVisible(u.x, u.z)) continue;
      if (u.id === this.hiddenUnit) continue; // drawn by the 3D hero mode
      const job = u.type === 'villager' ? jobOf(u) : 'idle';
      const key = this.crowdKey(u.type, u.team, job);
      let act = this.act(u);
      const list = groups.get(key) ?? [];
      let x = u.x;
      let z = u.z;
      let y = 0;
      let heading = u.heading;
      if (act === ACT.pedal && u.task.kind === 'gather' && u.task.field !== null) {
        // On the rahat: standing on the wheel's treads, facing along the trough.
        const f = s.buildings.get(u.task.field);
        if (f) {
          [x, z] = rahatSpot(s, f);
          y = 0.5;
          heading = Math.PI / 2;
        }
      }
      // At night people out walking carry a torch (PK 1.8.0), held up in the right hand.
      if (
        this.torchGlow > 0.05 &&
        act === ACT.crowd &&
        u.team === PLAYER &&
        this.sim.data.anachak.night.torches.carry &&
        !['elephant', 'cavalry'].includes(this.sim.def(u.type).role)
      )
        act = ACT.torch;
      // Crossing water (PK 1.8.0): wade below the chest; deeper, a dugout boat (paddled) or a
      // bamboo raft (poled, with wood or stone aboard) when the side has a landing; else swim.
      let lean = act === ACT.plant ? 0.42 : act === ACT.reap ? 0.35 : undefined; // farmers bend over the rice
      const way = s.waterWay(u);
      if (way !== 'land') {
        const bob = Math.sin(t * 2 + u.id) * 0.03;
        const depth = s.depthAt(x, z);
        if (way === 'wade') {
          // The water stands at its depth on the body (big animals are taller: they sink less of it).
          y = WATER_Y - Math.min(depth, this.sim.data.rules.water.chestDepth) * 0.92;
        } else if (way === 'swim' && u.anim !== 'walk') {
          // Treading water, waiting: only the head and shoulders above the surface.
          act = ACT.stand;
          y = WATER_Y - 1.38 + bob;
        } else if (way === 'swim') {
          // Lying flat, head toward the heading: the figure pivots at its feet, so step back half a body.
          act = ACT.swim;
          lean = 1.42;
          y = WATER_Y - 0.26 + bob * 0.5;
          x -= Math.sin(heading) * 0.85;
          z -= Math.cos(heading) * 0.85;
          if ((t + u.id * 0.31) % 0.9 < this.frameDt && this.near(x, z)) {
            this.particles.burst('splash', x + Math.sin(heading) * 1.4, WATER_Y + 0.1, z + Math.cos(heading) * 1.4, 4);
          }
        } else if (way === 'raft' && nbamboo < this.bamboo.instanceMatrix.count) {
          y = WATER_Y + 0.12 + bob;
          act = ACT.lever; // pushing on the punting pole
          this.m.makeRotationY(heading).setPosition(x, WATER_Y - 0.02 + bob, z);
          this.bamboo.setMatrixAt(nbamboo++, this.m);
        } else if (nrafts < this.rafts.instanceMatrix.count) {
          y = -0.06 + bob;
          act = ACT.row;
          this.m.makeRotationY(heading).setPosition(x, WATER_Y + bob, z);
          this.rafts.setMatrixAt(nrafts, this.m);
          this.paddles.setMatrixAt(nrafts++, paddleMatrix(this.m, x, y, z, heading, t));
        }
      }
      list.push({ place: () => ({ x, y, z, heading, act, lean }) });
      groups.set(key, list);
      // Work shows: chips fly, dust puffs, water splashes, with a sound, near the camera only.
      const fx = u.anim === 'gather' || u.anim === 'build' ? WORK_FX[job] : undefined;
      if (fx && Math.abs(x - this.view[0]) < this.view[2] && Math.abs(z - this.view[1]) < this.view[2]) {
        const phase = (t + u.id * 0.37) % fx.every;
        if (phase < this.frameDt) {
          const fwd = 0.6;
          this.particles.burst(fx.burst, x + Math.sin(heading) * fwd, 0.6, z + Math.cos(heading) * fwd, 6);
          this.sounds.push({ name: fx.sfx, x, z });
        }
      }
      // The load shows only on the walk home, not while he works (PK: no box over workers).
      if (u.carry && u.carry.n > 0.5 && u.anim === 'walk') {
        const r = u.carry.res;
        const set = this.loadSets[r];
        if (loads[r] < set.instanceMatrix.count) {
          this.m.makeRotationY(heading);
          this.m.setPosition(x, y + 1.98, z);
          set.setMatrixAt(loads[r]++, this.m);
        }
      }
      const d = s.def(u.type);
      const sel = selected.has(u.id);
      const r = d.radius ?? 0.5;
      if (sel && rings < this.rings.instanceMatrix.count) {
        this.m.makeScale(r * 1.6, 1, r * 1.6);
        this.m.setPosition(x, 0.08, z);
        this.rings.setMatrixAt(rings++, this.m);
      }
      if ((sel || u.hp < d.hp) && bars < this.bars.fg.instanceMatrix.count) {
        const f = Math.max(0, u.hp / d.hp);
        const y = u.type === 'warElephant' ? 4.9 : 2.5;
        const w = u.type === 'warElephant' ? 2.2 : 1.1;
        this.m.compose(this.v.set(x, y, z), camQ, new THREE.Vector3(w, 1, 1));
        this.bars.bg.setMatrixAt(bars, this.m);
        this.m.compose(this.v.set(x, y, z), camQ, new THREE.Vector3(w * f, 0.75, 1));
        // Keep the bar left-aligned: shift by half the lost width along the camera's right.
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ).multiplyScalar((-w * (1 - f)) / 2);
        this.m.setPosition(this.v.set(x, y, z).add(right));
        this.bars.fg.setMatrixAt(bars, this.m);
        this.bars.fg.setColorAt(
          bars++,
          this.c.set(u.team === PLAYER ? (f > 0.5 ? 0x7ee06a : 0xf0c040) : 0xe0503a),
        );
      }
    }
    for (const [key, c] of this.crowds) c.setAgents(groups.get(key) ?? []);
    for (const [key, list] of groups) this.crowd(key).setAgents(list);
    for (const c of this.crowds.values()) c.update(t);
    // Selected buildings get a ring sized to their footprint.
    for (const id of selected) {
      const b = s.buildings.get(id);
      if (!b || rings >= this.rings.instanceMatrix.count) continue;
      const [cx, cz] = s.center(b);
      const k = (Math.max(b.w, b.d) * s.map.tile) / 1.4;
      this.m.makeScale(k, 1, k);
      this.m.setPosition(cx, 0.1, cz);
      this.rings.setMatrixAt(rings++, this.m);
    }
    for (const r of ['food', 'wood', 'stone', 'gold'] as const) {
      this.loadSets[r].count = loads[r];
      this.loadSets[r].instanceMatrix.needsUpdate = true;
    }
    this.rafts.count = nrafts;
    this.bamboo.count = nbamboo;
    this.bamboo.instanceMatrix.needsUpdate = true;
    this.paddles.count = nrafts;
    this.paddles.instanceMatrix.needsUpdate = true;
    this.rafts.instanceMatrix.needsUpdate = true;
    this.rings.count = rings;
    this.bars.bg.count = this.bars.fg.count = bars;
    for (const mesh of [this.rings, this.bars.bg, this.bars.fg]) mesh.instanceMatrix.needsUpdate = true;
    if (this.bars.fg.instanceColor) this.bars.fg.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ effects

  /**
   * Village animals (PK: farms have pigs, cows and chickens; D70): chickens and a pig round
   * each house and the hall, a cow grazing at each rice field. They wander slowly about
   * their home on a loop of their own (pure decoration, not simulated).
   */
  private syncLivestock(t: number): void {
    const L = this.sim.data.rules.livestock;
    const lists = new Map<string, Agent[]>([...this.livestock.keys()].map((k) => [k, []]));
    const [vx, vz, vd] = this.view;
    for (const b of this.sim.buildings.values()) {
      if (b.team !== PLAYER || b.progress < 1) continue;
      const per =
        b.type === 'house' || b.type === 'nobleHouse'
          ? L.perHouse
          : b.type === 'riceField'
            ? L.perField
            : b.type === 'townCentre'
              ? L.perHall
              : null;
      if (!per) continue;
      const [cx, cz] = this.sim.center(b);
      if (Math.abs(cx - vx) > vd * 2 || Math.abs(cz - vz) > vd * 2) continue;
      const ring = (Math.max(b.w, b.d) * this.sim.map.tile) / 2 + 1.2;
      let k = 0;
      for (const [kind, n] of Object.entries(per)) {
        const list = lists.get(kind);
        if (!list) continue;
        for (let i = 0; i < n; i++, k++) {
          const seed = b.id * 7.13 + k * 2.71;
          const speed = kind === 'chicken' ? 0.35 : 0.12;
          list.push({
            place: (time: number) => {
              // A slow loop round the plot with a little wobble; the heading follows it.
              const a = seed + (time * speed) / ring;
              const r = ring + Math.sin(time * 0.3 + seed) * Math.min(1.5, L.wanderM * 0.3);
              const x = cx + Math.cos(a) * r;
              const z = cz + Math.sin(a) * r;
              return { x, y: 0, z, heading: -a };
            },
          });
        }
      }
    }
    for (const [kind, c] of this.livestock) {
      c.setAgents(lists.get(kind) ?? []);
      c.update(t);
    }
  }

  private syncEffects(t: number): void {
    const s = this.sim;
    for (let i = this.lastEvent; i < s.events.length; i++) {
      const e = s.events[i]!;
      if (e.kind === 'shot')
        this.flights.push({
          from: new THREE.Vector3(e.from[0], 1.5, e.from[1]),
          to: new THREE.Vector3(e.to[0], 1.1, e.to[1]),
          t0: t,
        });
      if (e.kind === 'hunted') this.meatIds.add(e.node);
      if (e.kind === 'hit') this.particles.burst('sparks', e.at[0], 1.1, e.at[1], 5);
      if (e.kind === 'felled') {
        this.fallen.fell(e.at[0], e.at[1], e.dir, t, 0.75 + ((Math.abs(e.at[0] * 7 + e.at[1] * 13) % 10) / 20));
        this.particles.burst('dust', e.at[0], 0.6, e.at[1], 14);
      }
      if (e.kind === 'death') this.particles.burst('hit', e.unit.x, 0.3, e.unit.z, 10);
      if (e.kind === 'built') {
        const [bx, bz] = s.center(e.building);
        this.particles.burst('smoke', bx, 1.5, bz, 18);
      }
      if (e.kind === 'destroyed') {
        const [bx, bz] = s.center(e.building);
        this.particles.burst('dust', bx, 1, bz, 24);
      }
      if (e.kind === 'destroyed') {
        const [cx, cz] = s.center(e.building);
        this.ruins.push({
          x: cx,
          z: cz,
          w: e.building.w * s.map.tile,
          d: e.building.d * s.map.tile,
          until: t + 40,
        });
      }
    }
    this.lastEvent = s.events.length;
    let n = 0;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]!;
      const k = (t - f.t0) / 0.35;
      if (k >= 1 || n >= this.arrows.instanceMatrix.count) {
        this.flights.splice(i, 1);
        continue;
      }
      const p = f.from.clone().lerp(f.to, k);
      p.y += Math.sin(k * Math.PI) * 1.4;
      this.m.lookAt(f.from, f.to, new THREE.Vector3(0, 1, 0));
      this.m.setPosition(p);
      this.arrows.setMatrixAt(n++, this.m);
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
    let r = 0;
    for (let i = this.ruins.length - 1; i >= 0; i--) {
      const x = this.ruins[i]!;
      if (t > x.until) {
        this.ruins.splice(i, 1);
        continue;
      }
      if (r >= this.rubble.instanceMatrix.count) continue;
      this.m.makeScale(x.w * 0.8, 1, x.d * 0.8);
      this.m.setPosition(x.x, 0.1, x.z);
      this.rubble.setMatrixAt(r++, this.m);
    }
    this.rubble.count = r;
    this.rubble.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ public

  /** Draw the building ghost at a tile position (null hides it). */
  setGhost(type: string | null, tx = 0, tz = 0, ok = true): void {
    this.ghost.visible = !!type;
    if (!type) return;
    const d = this.sim.data.buildings[type]!;
    const T = this.sim.map.tile;
    const [x0, z0] = tileToWorld(this.sim.map, tx, tz);
    this.ghost.scale.set(d.size[0] * T, type === 'riceField' ? 0.3 : 2.5, d.size[1] * T);
    this.ghost.position.set(x0 - T / 2 + (d.size[0] * T) / 2, 0, z0 - T / 2 + (d.size[1] * T) / 2);
    this.ghostMat.color.set(ok ? 0x7cff7c : 0xff5a4a);
  }

  /** The royal roads, bridges and rest houses (Anachak Khmer, D92). */
  roads: RoadView | null = null;
  /** An animal drawn by someone else (the hero mode's tiger), or null. */
  hiddenAnimal: number | null = null;
  /** How dark it is (Anachak Khmer), 0 day .. 1 night. */
  night = 0;
  private lastNight = 0;

  /** A unit drawn elsewhere (the 3D hero mode's own model), and the king when he is played. */
  hiddenUnit: number | null = null;
  hideKing = false;
  /** The 3D hero mode is on: no fog veil, trees loaded all round the hero. */
  heroView = false;
  private veil!: THREE.Mesh;

  /**
   * The 3D hero mode's chase camera (Anachak Khmer, D92): eye and target, the lens; the trees,
   * shadows and life load round the hero as they do round the RTS view.
   */
  setChase(eye: XYZ, look: XYZ, fov: number, around: number): void {
    const c = this.camera;
    if (c.fov !== fov) {
      c.fov = fov;
      c.near = 0.3;
      c.far = 1800; // the painted mountains and sky lie far out
      c.updateProjectionMatrix();
    }
    c.position.set(eye[0], eye[1], eye[2]);
    c.lookAt(look[0], look[1], look[2]);
    c.updateMatrixWorld();
    this.view = [look[0], look[2], around];
    this.sun.target.position.set(look[0], 0, look[2]);
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.position.set(look[0] + dir.x * 120, dir.y * 120, look[2] + dir.z * 120);
    this.sun.target.updateMatrixWorld();
    for (const o of this.scene.children) if (o.userData.followCamera) o.position.set(look[0], 0, look[2]);
  }

  /** Back to the RTS lens after the hero mode. */
  rtsLens(): void {
    const c = this.camera;
    if (c.fov === this.rtsFov) return;
    c.fov = this.rtsFov;
    c.near = 1;
    c.far = this.rtsFar;
    c.updateProjectionMatrix();
  }

  /** The sun's direction (the hero mode's sky draws its disc there). */
  get sunDir(): THREE.Vector3 {
    return this.sunSkyDir.clone();
  }

  /**
   * PK 1.8.0: the sun crosses the sky with the hour (east, over the south, west), its light
   * warms to the season's sunrise and sunset colours, the sky glows round it and the water
   * carries a path of its light (sim/sunPath.ts; config anachak.json night.sunPath).
   */
  private syncSun(N: KingdomSim['data']['anachak']['night']): void {
    const st = sunState(this.sim.time, N);
    this.sunNow = st;
    if (!st) return;
    this.sunSkyDir.set(st.dir[0], st.dir[1], st.dir[2]);
    this.sunDirNow.set(st.light[0], st.light[1], st.light[2]);
    // Cloud and rain dull the sunrise; the night hides it.
    const w = this.sim.weather.id;
    const cloud = w === 'storm' ? 0.2 : w === 'rain' ? 0.45 : w === 'clear' ? 1 : 0.75;
    const g = st.golden * cloud;
    this.goldenColor.set(st.sunColor);
    this.sunColor.copy(this.sunDay).lerp(this.goldenColor, g * 0.85);
    const fx = this.weatherFx;
    fx.golden = g;
    fx.goldenSun.copy(this.goldenColor);
    fx.goldenSky.set(st.skyColor);
    // The light follows the sun by day (the moon takes over in syncNight).
    if (this.night <= 0.001) {
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirNow, 120);
      this.sun.color.copy(this.sunColor);
    }
    // The sky dome: the disc where the sun is.
    this.skyDome ??=
      (this.scene.children.find(
        (o) => (o as THREE.Mesh).isMesh && !!((o as THREE.Mesh).material as THREE.ShaderMaterial).uniforms?.sunDisc,
      ) as THREE.Mesh | undefined) ?? null;
    if (this.skyDome) {
      const u = (this.skyDome.material as THREE.ShaderMaterial).uniforms;
      (u.sunDir!.value as THREE.Vector3).copy(this.sunSkyDir);
      u.sunDisc!.value = st.dir[1] > -0.05 ? 1 : 0;
    }
    // The water: the glint from where the sun is, and at sunrise and sunset a path of light.
    const prek = this.water as (Water & { setSun?: (d: THREE.Vector3, c: THREE.Color, g: number) => void }) | null;
    prek?.setSun?.(st.dir[1] > 0.02 ? this.sunSkyDir : this.sunDirNow, this.sunColor, g * (1 - this.night));
  }
  private skyDome: THREE.Mesh | null = null;

  /** Point the camera: target (x, z), distance along a fixed RTS angle (diagonal, AoE II-like: D67). */
  setCamera(x: number, z: number, dist: number): void {
    const pitch = THREE.MathUtils.degToRad(CAM_PITCH_DEG);
    const real = dist * this.lensK;
    const h = Math.cos(pitch) * real;
    this.camera.position.set(x + Math.sin(CAM_YAW) * h, Math.sin(pitch) * real, z + Math.cos(CAM_YAW) * h);
    this.camera.lookAt(x, 0, z);
    this.camera.updateMatrixWorld();
    this.view = [x, z, dist];
    if (this.weatherFx) this.weatherFx.zoom = real; // (the constructor may place the camera first)
    if (this.gfx.diorama && this.sun?.castShadow) {
      // The long lens sees more ground: the shadows cover what is on screen.
      const ext = Math.max(60, dist * 1.25);
      const c = this.sun.shadow.camera;
      if (Math.abs(c.right - ext) > ext * 0.08) {
        c.left = -ext;
        c.right = ext;
        c.top = ext;
        c.bottom = -ext;
        c.updateProjectionMatrix();
      }
    }
    // Shadows follow the view.
    this.sun.target.position.set(x, 0, z);
    const dir = this.sun.position.clone().sub(this.sun.target.position).normalize();
    this.sun.position.set(x + dir.x * 120, dir.y * 120, z + dir.z * 120);
    this.sun.target.updateMatrixWorld();
    for (const o of this.scene.children) if (o.userData.followCamera) o.position.set(x, 0, z);
  }

  private fogAt = -1;
  private treesFresh = -1e9;
  update(t: number, now: number, selected: Set<number>): void {
    let fresh = false;
    if (this.sim.fogVersion !== this.fogAt) {
      this.fogAt = this.sim.fogVersion;
      this.syncFog();
      this.roads?.sync(this.sim.fog.explored, restsActive(this.sim));
      this.syncNodes();
      this.syncFish();
      // Trees change when land is explored or a tree is cut down (checked a few times a second).
      fresh = t - this.treesFresh > 1.5;
      if (fresh) this.treesFresh = t;
    }
    this.veil.visible = !this.heroView;
    this.syncTrees(fresh);
    this.syncNodes(false);
    this.syncMeat();
    this.syncWild(t);
    this.syncHover(t);
    const [cx, cz] = this.view;
    this.frameDt = Math.min(0.25, Math.max(0, t - this.lastT));
    if (this.sim.variant === 'anachak') {
      // Anachak Khmer's day and night; the rest houses' fires (PK).
      const N = this.sim.data.anachak.night;
      this.night = nightness(this.sim.time, N);
      this.weatherFx.night = this.night;
      this.syncSun(N);
      this.roads?.fire(fireGlow(this.night, N), N.fire.radius, t);
      const T = N.torches;
      this.torchGlow = Math.min(1, Math.max(0, (this.night - T.from) / (1 - T.from)));
    }
    this.weatherFx.update(this.sim.weather.id, t, cx, cz, this.frameDt);
    this.particles.update(this.frameDt);
    this.syncSchools(t);
    this.water?.update(t);
    // The Prek water's fake sky follows the time of day (stepped: noon, dawn/dusk, night).
    const prek = this.water as (Water & { setSky?: (hex: string) => void }) | null;
    if (prek?.setSky) {
      const rising = this.night < this.lastNight - 1e-6;
      prek.setSky(skyStep(this.sim.data.diorama.water, this.night, rising));
      // Sunrise and sunset (PK 1.8.0): the water mirrors the season's glowing sky.
      if (this.sunNow && this.weatherFx.golden > 0.3 && this.night < 0.5) prek.setSky(this.sunNow.skyColor);
      this.lastNight = this.night;
    }
    this.sway.uniforms.uTime.value = t;
    const w = this.sim.weather.id;
    // PK: a gentler wind in the trees.
    this.sway.uniforms.uWind.value = w === 'storm' ? 0.9 : w === 'windy' ? 0.6 : w === 'rain' ? 0.4 : 0.2;
    if (this.gfx.life) this.syncLife(t);
    this.syncRice(t);
    this.syncBeacons(t);
    this.syncJunk(t);
    this.lastT = t;
    this.sounds.length = 0;
    this.syncLivestock(t);
    this.syncBuildings(now);
    this.syncCourt(t);
    this.syncUnits(t, selected);
    this.syncNpr();
    this.syncDetail(t, fresh);
    this.syncWear();
    this.syncWet(t);
    this.syncAir(t);
    this.syncElephantGrass(this.egrass, t, fresh);
    this.syncElephantGrass(this.sward, t, fresh);
    this.syncElephantGrass(this.lawn, t, fresh);
    this.syncElephantGrass(this.stones, t, fresh);
    this.syncNight(t);
    this.syncSee(t, selected);
    this.syncEffects(t);
  }

  // ------------------------------------------------------------ PK 1.8.0

  /** A number that changes when buildings come, go or move (the land under them changed). */
  private landKey(): string {
    let h = this.sim.buildings.size;
    for (const b of this.sim.buildings.values()) h = (h * 31 + b.id * 7 + b.tx * 131 + b.tz * 17) % 1e9;
    return String(h);
  }

  /** People near the middle of the view, nearest first: [x, z] pairs (selected first). */
  private peopleNear(cx: number, cz: number, radius: number, max: number, selected?: Set<number>): Unit[] {
    const out: Array<[number, Unit]> = [];
    const r2 = radius * radius;
    for (const u of this.sim.units.values()) {
      if (u.team === RIVAL && !this.sim.isVisible(u.x, u.z)) continue;
      const d = (u.x - cx) ** 2 + (u.z - cz) ** 2;
      if (d > r2) continue;
      out.push([selected?.has(u.id) ? -1 : d, u]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, max).map((p) => p[1]);
  }

  /** Wet ground after rain (PK 1.8.0): soaks in rain or storm, dries slowly; puddles mirror the sky. */
  private syncWet(t: number): void {
    const U = this.groundU;
    if (!U) return;
    const id = this.sim.weather.id;
    // Game time drives it (the ground dries faster when the game runs faster).
    const dt = this.wetAt < 0 ? 0 : Math.max(0, this.sim.time - this.wetAt);
    this.wetAt = this.sim.time;
    this.wet = wetness(this.wet, id === 'rain' || id === 'storm', Math.min(dt, 30), this.sim.data.diorama.wet);
    U.uWet.value = this.wet;
    U.uRain.value = this.weatherFx.rain;
    U.uTime.value = t;
    U.uSky.value.copy(this.puddleSky).lerp(this.nightPuddle, this.night);
  }
  private wetAt = -1;
  private groundH: { h: Float32Array; n: number; size: number } | null = null;

  /** The drawn ground's height (m) at a world point (bilinear on the terrain grid). */
  groundY(x: number, z: number): number {
    const G = this.groundH;
    if (!G) return 0;
    const fx = Math.min(G.n - 1.001, Math.max(0, ((x + G.size / 2) / G.size) * (G.n - 1)));
    const fz = Math.min(G.n - 1.001, Math.max(0, ((z + G.size / 2) / G.size) * (G.n - 1)));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const ux = fx - ix;
    const uz = fz - iz;
    const at = (a: number, b: number) => G.h[b * G.n + a]!;
    const top = at(ix, iz) * (1 - ux) + at(ix + 1, iz) * ux;
    const bot = at(ix, iz + 1) * (1 - ux) + at(ix + 1, iz + 1) * ux;
    return top * (1 - uz) + bot * uz;
  }

  /** The dawn (0..1, Anachak Khmer's day): from the end of the night until the morning is up. */
  private dawn(): number {
    if (this.sim.variant !== 'anachak') return 0;
    const N = this.sim.data.anachak.night;
    const p = (((this.sim.time / N.daySec) % 1) + 1) % 1;
    const q = p < 0.5 ? p + 1 : p; // the dawn runs over the end of the day into the next
    const a = N.dawn[0];
    const b = N.dawn[1] + 0.12;
    if (q < a || q > b) return 0;
    return Math.sin(((q - a) / (b - a)) * Math.PI);
  }

  /** Ground mist and light shafts (PK 1.8.0), round the view, from the weather and the hour. */
  private syncAir(t: number): void {
    const mist = this.mist;
    const shafts = this.shafts;
    if (!mist || !shafts) return;
    const A = this.sim.data.diorama.atmosphere;
    const id = this.sim.weather.id;
    const [cx, cz, dist] = this.view;
    const radius = Math.max(60, dist * 1.3);
    const off = this.heroView;
    mist.update(t, cx, cz, radius, off ? 0 : mistAmount(id, this.dawn(), this.wet, A.mist), this.night, this.windXZ);
    shafts.update(
      t,
      cx,
      cz,
      radius,
      off ? 0 : shaftAmount(id, this.wet, this.night, A.shafts),
      this.sunDirNow,
      this.camera.position,
    );
  }

  /** Elephant grass: planted round the view, wind from the weather, trampled by walkers. */
  private syncElephantGrass(g: ElephantGrass | null, t: number, fresh: boolean): void {
    if (!g) return;
    const s = this.sim;
    let [cx, cz] = this.view;
    let radius = Math.max(30, this.view[2] * g.cfg.reach);
    // In the 3D hero mode the grass grows round the hero (PK 1.8.0: running through the grass).
    const hero = this.heroView ? s.heroEye : null;
    g.group.visible = !this.heroView || !!hero;
    if (this.heroView && !hero) return;
    if (hero) {
      [cx, cz] = hero;
      radius = 36;
    }
    // A carpet (every tile): only as far as its clumps reach, so the LOD fade hides its edge.
    if (g.cfg.cover >= 1) radius = Math.min(radius, grassReach(g.cfg, this.sim.map.tile));
    const walkers: number[] = [];
    if (hero) walkers.push(hero[0], hero[1]);
    for (const u of this.peopleNear(cx, cz, radius, 15)) walkers.push(u.x, u.z);
    g.frame(t, this.weatherFx.wind, cx, cz, radius, walkers);
    const key = this.landKey();
    const changed = key !== this.egrassKey.get(g);
    if (changed || !this.egrassClear.get(g)) {
      this.egrassKey.set(g, key);
      // No tall grass within keepAway tiles of any building (yards, doors, paths to them).
      const N = s.map.size;
      const k = g.cfg.keepAway;
      // The edge is ragged: up to 2 tiles further out on some tiles, so no straight line shows.
      const near = new Set<number>();
      for (const b of s.buildings.values())
        for (let z = b.tz - k - 2; z < b.tz + b.d + k + 2; z++)
          for (let x = b.tx - k - 2; x < b.tx + b.w + k + 2; x++) {
            if (x < 0 || z < 0 || x >= N || z >= N) continue;
            const out = Math.max(b.tx - x, x - (b.tx + b.w - 1), b.tz - z, z - (b.tz + b.d - 1), 0);
            if (out <= k + Math.floor(detailHash(x, z, 77) * 3)) near.add(z * N + x);
          }
      this.egrassClear.set(g, near);
    }
    const near = this.egrassClear.get(g)!;
    const N = s.map.size;
    const T = s.map.tile;
    const clear = (tx: number, tz: number) =>
      !near.has(tz * N + tx) &&
      (!this.wear || this.wear.at(tx, tz) < (g.cfg.wearMax ?? 0.04)) &&
      // Dry land only: where the drawn bank dips under the water plane there is no grass.
      this.groundY((tx + 0.5) * T - this.half, (tz + 0.5) * T - this.half) > WATER_Y + GRASS_DRY;
    const at = this.detailAt ?? this.patchAt(new Set());
    g.lay(cx, cz, radius, s.map.tile, this.half, at, clear, changed || fresh, (x, z) => this.groundY(x, z));
  }

  /** The night (Anachak Khmer): torches, the stars and the moon, and moonlight. */
  private syncNight(t: number): void {
    const tv = this.torches;
    const sky = this.nightSky;
    if (!tv || !sky) return;
    const s = this.sim;
    const N = s.data.anachak.night;
    const T = N.torches;
    const key = this.landKey();
    if (key !== this.torchKey) {
      this.torchKey = key;
      const sites: TorchSite[] = [];
      for (const b of s.buildings.values()) {
        if (b.team !== PLAYER || b.progress < 1) continue;
        const [x, z] = s.center(b);
        const facing = b.type === 'house' || b.type === 'nobleHouse' ? Math.PI / 2 : 0;
        // Footprint in m, turned with the house (east-facing houses swap width and depth).
        const w = b.w * s.map.tile;
        const d = b.d * s.map.tile;
        sites.push({ type: b.type, cx: x, cz: z, w: facing ? d : w, d: facing ? w : d, facing });
      }
      tv.setSpots(torchSpots(sites, T));
    }
    // Torches light once the night has come in far enough.
    const glow = this.torchGlow;
    const [cx, cz, dist] = this.view;
    const radius = Math.max(40, dist * 1.4);
    const planted: number[] = [];
    const carried: number[] = [];
    if (glow > 0.05 && !this.heroView) {
      const seen = new Set<string>();
      for (const u of this.peopleNear(cx, cz, radius, 120)) {
        if (u.team !== PLAYER) continue;
        const role = s.def(u.type).role;
        if (role === 'elephant' || role === 'cavalry' || s.waterWay(u) !== 'land') continue;
        if (T.carry && u.anim === 'walk' && !(u.carry && u.carry.n > 0) && carried.length < 60 * 3) {
          // Held up in the right hand, a little ahead of the face (ACT.torch raises the arm).
          const h = u.heading;
          const sx = Math.cos(h);
          const sz = -Math.sin(h);
          carried.push(u.x + Math.sin(h) * 0.42 - sx * 0.28, 2.05, u.z + Math.cos(h) * 0.42 - sz * 0.28);
        } else if (T.planted && (u.anim === 'gather' || u.anim === 'build')) {
          // One torch planted per work spot (a 6 m cell), a step to the side of the worker.
          const cell = `${Math.floor(u.x / 6)},${Math.floor(u.z / 6)}`;
          if (seen.has(cell)) continue;
          seen.add(cell);
          planted.push(u.x + Math.cos(u.heading) * 1.4, u.z - Math.sin(u.heading) * 1.4);
        }
      }
    }
    tv.update(glow, t, this.camera.quaternion, cx, cz, radius, planted, carried);
    // The stars and the moon (seen in the 3D mode's sky), and moonlight on the land.
    sky.update(s.time, t, this.night, this.camera, 1);
    if (this.night > 0.001) {
      const k = this.night;
      // From where the moon stands (kept above 25° so the shadows stay on the land).
      const moon = this.moonAim.copy(sky.moonNow);
      if (moon.y < 0.45) moon.setY(0.45);
      moon.normalize();
      this.lightDir.copy(this.sunDirNow).lerp(moon, k).normalize();
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.lightDir, 120);
      this.sun.color.copy(this.sunColor).lerp(this.moonColor, k);
      this.weatherFx.moonlight = sky.moonlight;
    } else if (this.lastMoon) {
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDirNow, 120);
      this.sun.color.copy(this.sunColor);
    }
    this.lastMoon = this.night > 0.001;
  }
  private lastMoon = false;
  /** PK 1.8.0: ground mist and light shafts. */
  mist: MistLayer | null = null;
  shafts: LightShafts | null = null;
  private readonly windXZ = new THREE.Vector2(1, 0.35);
  /** PK 1.8.0: the ground's wetness (0 dry … 1 soaked) and its uniforms. */
  wet = 0;
  private groundU: SplatUniforms | null = null;
  private readonly puddleSky = new THREE.Color();
  private readonly nightPuddle = new THREE.Color(0x1b2747);
  private readonly moonAim = new THREE.Vector3();
  /** How bright the torches are now (0 by day), for the people who carry them. */
  private torchGlow = 0;

  /** Zoomed in close: open a see-through window in the cover round each person near the middle. */
  private syncSee(t: number, selected: Set<number>): void {
    const U = this.see;
    if (!U) return;
    // New cover (props loaded, a temple rose, buildings added) gets the window test.
    if (t - this.seeScanAt > 2 || this.seeScanAt < 0) {
      this.seeScanAt = t;
      this.scene.traverse((o) => {
        if (!o.userData.seeThrough) return;
        const m = (o as THREE.Mesh).material;
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) addSeeThrough(mat, U);
      });
    }
    const C = this.sim.data.diorama.seeThrough;
    const [cx, cz, dist] = this.view;
    const amount = this.heroView ? 0 : seeAmount(dist, C.zoom, C.amount);
    const pts: number[] = [];
    if (amount > 0)
      for (const u of this.peopleNear(cx, cz, dist * 1.2, C.targets, selected)) {
        const big = this.sim.def(u.type).role === 'elephant';
        pts.push(u.x, big ? 2.2 : 1.0, u.z);
      }
    this.camera.updateMatrixWorld();
    setTargets(U, this.camera, pts, C.radius, amount, C.targets);
  }

  /** Stage pixel (1080 × 1920) → ground point, or null off the map. */
  groundAt(px: number, py: number): XZ | null {
    const ndc = new THREE.Vector2((px / KSIZE.width) * 2 - 1, -(py / KSIZE.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit || Math.abs(hit.x) > this.half || Math.abs(hit.z) > this.half) return null;
    return [hit.x, hit.z];
  }

  /** World point → stage pixel. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * KSIZE.width, y: ((1 - v.y) / 2) * KSIZE.height };
  }
}
