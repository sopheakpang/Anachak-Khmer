import { z } from 'zod';
import erasJson from '../../../config/kingdom/eras.json';
import sourcesJson from '../../../config/kingdom/sources.json';
import buildingsJson from '../../../config/kingdom/buildings.json';
import unitsJson from '../../../config/kingdom/units.json';
import techsJson from '../../../config/kingdom/techs.json';
import rulesJson from '../../../config/kingdom/rules.json';
import campaignJson from '../../../config/kingdom/campaign.json';
import worldJson from '../../../config/kingdom/world.json';
import charactersJson from '../../../config/kingdom/characters.json';
import mapJson from '../../../config/map.json';
import templesJson from '../../../config/temples.json';
import worldEventsJson from '../../../config/kingdom/worldEvents.json';
import anachakJson from '../../../config/kingdom/anachak.json';
import propsJson from '../../../config/kingdom/props.json';
import dioramaJson from '../../../config/kingdom/diorama.json';
import controlsJson from '../../../config/kingdom/controls.json';

/**
 * Khmer Kingdoms (the RTS tab): data-driven historical content. Every object carries its
 * "historical DNA": a confidence label and the sources behind it, so the game never
 * presents an uncertain detail or a gameplay invention as fact.
 */

export const ConfidenceSchema = z.enum([
  'HISTORICALLY_CONFIRMED',
  'HISTORICALLY_SUPPORTED',
  'HISTORICALLY_UNCERTAIN',
  'GAMEPLAY_ABSTRACTION',
  'FICTIONAL',
]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const RESOURCES = ['food', 'wood', 'stone', 'gold'] as const;
export type Resource = (typeof RESOURCES)[number];
const ResourceSchema = z.enum(RESOURCES);
const Cost = z.partialRecord(ResourceSchema, z.number().nonnegative());
export type Cost = Partial<Record<Resource, number>>;

const Dna = {
  confidence: ConfidenceSchema,
  sources: z.array(z.string()),
  notes: z.string().optional(),
};

const Bi = { km: z.string().min(1), en: z.string().min(1) };

export const EraSchema = z.object({
  id: z.string(),
  ...Bi,
  startYear: z.number().int(),
  endYear: z.number().int(),
  startingYear: z.number().int(),
  ruler: z.object({ ...Bi, confidence: ConfidenceSchema, sources: z.array(z.string()) }),
  summary: z.object(Bi),
  religion: z.object({ en: z.string(), confidence: ConfidenceSchema, sources: z.array(z.string()) }),
  architecture: z.object({ en: z.string(), confidence: ConfidenceSchema, sources: z.array(z.string()) }),
  confidence: ConfidenceSchema,
  sources: z.array(z.string()),
  buildings: z.array(z.string()),
  units: z.array(z.string()),
  techs: z.array(z.string()),
  monuments: z.array(z.string()),
});
export type Era = z.infer<typeof EraSchema>;

export const BuildingDefSchema = z.object({
  id: z.string(),
  ...Bi,
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  buildSec: z.number().positive(),
  hp: z.number().positive(),
  armor: z.number().nonnegative(),
  pop: z.number().int().nonnegative(),
  vision: z.number().positive(),
  cost: Cost,
  dropOff: z.array(ResourceSchema),
  trains: z.array(z.string()),
  researches: z.array(z.string()),
  requires: z.array(z.string()),
  buildable: z.boolean(),
  food: z.number().positive().optional(),
  fixedSite: z.boolean().optional(),
  /** Goods dropped here are kept in the building until an ox-cart hauls them (PK: wood by cart). */
  stockpile: z.boolean().optional(),
  /** A unit that comes with the building when it is finished (the lumber camp's ox-cart). */
  freeUnit: z.string().optional(),
  /** PK: built at the water's edge only (the river landing for the big ships). */
  shore: z.boolean().optional(),
  ...Dna,
});
export type BuildingDef = z.infer<typeof BuildingDefSchema>;

export const UnitDefSchema = z.object({
  id: z.string(),
  ...Bi,
  /** support: the supply cart (heals, no attack); scout: the watchman (explores by himself); commander: aura (D69). */
  role: z.enum(['worker', 'infantry', 'ranged', 'elephant', 'cavalry', 'support', 'scout', 'commander']),
  hp: z.number().positive(),
  armor: z.number().nonnegative(),
  speed: z.number().positive(),
  range: z.number().positive(),
  attack: z.number().nonnegative(),
  cooldownSec: z.number().positive(),
  vision: z.number().positive(),
  cost: Cost,
  trainSec: z.number().positive(),
  pop: z.number().int().positive(),
  trainedAt: z.string(),
  requires: z.array(z.string()),
  carry: z.number().positive().optional(),
  gather: z.partialRecord(ResourceSchema, z.number().positive()).optional(),
  build: z.number().positive().optional(),
  bonusVs: z.record(z.string(), z.number()).optional(),
  radius: z.number().positive().optional(),
  splash: z.number().positive().optional(),
  /** At most this many alive or queued at once (the commander: 1). */
  max: z.number().int().positive().optional(),
  ...Dna,
});
export type UnitDef = z.infer<typeof UnitDefSchema>;

export const TechDefSchema = z.object({
  id: z.string(),
  ...Bi,
  cost: Cost,
  researchSec: z.number().positive(),
  requires: z.array(z.string()),
  effect: z.object({
    gatherRate: z.partialRecord(ResourceSchema, z.number().positive()).optional(),
    fieldFood: z.number().positive().optional(),
    buildRate: z.number().positive().optional(),
    monumentRate: z.number().positive().optional(),
    speed: z.number().positive().optional(),
    regen: z.number().positive().optional(),
    attack: z.record(z.string(), z.number()).optional(),
    unlock: z.array(z.string()).optional(),
  }),
  history: z.string(),
  ...Dna,
});
export type TechDef = z.infer<typeof TechDefSchema>;

const XY = z.tuple([z.number(), z.number()]);
const Level = z.object({
  firstRaidSec: z.number().positive(),
  everySec: z.number().positive(),
  wave: z.number().int().positive(),
  growEvery: z.number().int().positive(),
  retreatAt: z.number().min(0).max(1),
});

export const KingdomRulesSchema = z.object({
  scenario: z.object({
    id: z.string(),
    ...Bi,
    era: z.string(),
    year: z.number().int(),
    label: z.enum(['DOCUMENTED', 'HISTORICALLY_INSPIRED_SCENARIO']),
    objective: z.object(Bi),
    note: z.object(Bi),
  }),
  start: z.object({
    resources: Cost,
    villagers: z.number().int().positive(),
    maxPop: z.number().int().positive(),
    /** PK 1.7.0: the phone build's ceiling (a smaller screen and a slower GPU). */
    mobileMaxPop: z.number().int().positive().optional(),
  }),
  economy: z.object({
    refundShare: z.number().min(0).max(1),
    dropOffRange: z.number().positive(),
    gatherRange: z.number().positive(),
    treeWood: z.number().positive(),
    stoneRock: z.number().positive(),
    goldRock: z.number().positive(),
    fruitBush: z.number().positive(),
    /** Gem patches (PK): what one holds, and how much faster they pay in gold than a gold rock. */
    gemRock: z.number().positive().default(200),
    gemValue: z.number().positive().default(2),
  }),
  ai: z.object({
    difficulty: z.enum(['easy', 'normal', 'hard', 'expert']),
    levels: z.object({ easy: Level, normal: Level, hard: Level, expert: Level }),
    camp: z.object({
      hp: z.number().positive(),
      armor: z.number().nonnegative(),
      guards: z.number().int().nonnegative(),
    }),
    raiders: z.array(z.string()).min(1),
  }),
  victory: z.object({ monumentHoldSec: z.number().nonnegative(), destroyCamp: z.boolean() }),
  fog: z.object({ cell: z.number().positive(), updateSec: z.number().positive() }),
  tiktok: z.object({
    perStone: z.object({ small: Cost, medium: Cost, large: Cost, huge: Cost }),
  }),
  council: z.object({
    intervalSec: z.number().positive(),
    voteSec: z.number().positive(),
    choices: z
      .array(
        z.object({
          id: z.string(),
          ...Bi,
          give: Cost.optional(),
          units: z.record(z.string(), z.number().int().positive()).optional(),
        }),
      )
      .length(3),
  }),
  save: z.object({ autosaveSec: z.number().positive(), backups: z.number().int().min(1) }),
  /** Raids wait until the player has a finished war camp (PK, D62). */
  raids: z.object({ requireBarracks: z.boolean(), graceSec: z.number().nonnegative() }),
  /** Idle villagers find work themselves; soldiers guard the kingdom (PK, D62). */
  automation: z.object({
    autoWork: z.boolean(),
    idleSec: z.number().nonnegative(),
    searchTiles: z.number().positive(),
    guardTiles: z.number().positive(),
    huntRange: z.number().positive(),
  }),
  /**
   * PK: villagers drop their work and run from raiders and dangerous animals; the alarm calls
   * the soldiers. radiusTiles: how close a danger must come; safeSec: how long they keep away.
   */
  alarm: z
    .object({
      radiusTiles: z.number().positive().default(6),
      safeSec: z.number().positive().default(6),
      repeatSec: z.number().positive().default(12),
      soldierTiles: z.number().positive().default(40),
    })
    .default({ radiusTiles: 6, safeSec: 6, repeatSec: 12, soldierTiles: 40 }),
  /**
   * PK (1.6.0): the map follows the mouse at the window's edge, also past the stage's edge
   * (letterbox bars, HUD panels). `marginPx` is the band in screen pixels; the pan speeds up
   * from `minSpeed` to 1 (× the arrow-key speed) as the cursor goes deeper into the band.
   */
  edgeScroll: z
    .object({
      enabled: z.boolean().default(true),
      marginPx: z.number().positive().default(14),
      minSpeed: z.number().min(0).max(1).default(0.35),
    })
    .default({ enabled: true, marginPx: 14, minSpeed: 0.35 }),
  /**
   * PK (1.6.0): the player can move his own buildings to a new spot, except the historical
   * temples (they stand on their real sites). `costShare` of the building's price is paid per move.
   */
  moveBuilding: z
    .object({
      enabled: z.boolean().default(true),
      fixed: z.array(z.string()).default(['monument']),
      costShare: z.number().min(0).max(1).default(0),
    })
    .default({ enabled: true, fixed: ['monument'], costShare: 0 }),
  /** PK: timber goes to the store by ox-cart: what one cart takes and how long loading lasts. */
  haul: z
    .object({
      capacity: z.number().positive().default(60),
      loadSec: z.number().nonnegative().default(3),
      minLoad: z.number().nonnegative().default(20),
    })
    .default({ capacity: 60, loadSec: 3, minLoad: 20 }),
  /**
   * The in-game calendar (PK: a timeline that runs with the temple age): the year moves on
   * by one every `secPerYear` game seconds, from the chapter's year up to the year before
   * the next temple, and jumps ahead when the temple is finished.
   */
  calendar: z
    .object({
      secPerYear: z.number().positive().default(120),
      extraYearsAfterLast: z.number().int().default(30),
    })
    .default({ secPerYear: 120, extraYearsAfterLast: 30 }),
  /** PK: royal ceremonies, held automatically, from the historical record; they build royal power. */
  ceremonies: z.object({
    everySec: z.number().positive(),
    firstSec: z.number().nonnegative(),
    durSec: z.number().positive(),
    buff: z.object({ gather: z.number().positive(), build: z.number().positive() }),
    list: z
      .array(
        z.object({
          id: z.string(),
          km: z.string(),
          en: z.string(),
          note: z.object({ km: z.string(), en: z.string() }),
          prestige: z.number().nonnegative(),
          eras: z.array(z.string()).optional(),
          fx: z.enum(['gold', 'water', 'fireworks']),
          confidence: ConfidenceSchema,
        }),
      )
      .min(1),
    sources: z.array(z.string()).default([]),
  }),
  /** PK: the king's decree — everyone works for the temple until it stands. */
  decree: z
    .object({
      everySec: z.number().positive().default(5),
      maxBuilders: z.number().int().positive().default(14),
      keepFarmers: z.boolean().default(true),
    })
    .default({ everySec: 5, maxBuilders: 14, keepFarmers: true }),
  /** PK: the king blesses the growing city (finished buildings, new people). */
  court: z
    .object({
      blessSec: z.number().positive().default(6),
      blessEverySec: z.number().nonnegative().default(20),
      milestone: z.number().int().positive().default(10),
    })
    .default({ blessSec: 6, blessEverySec: 20, milestone: 10 }),
  /** Game speed choices (PK: the timeline speed can be adjusted). */
  speed: z
    .object({
      options: z.array(z.number().positive()).min(1).default([1, 2, 3, 5]),
      start: z.number().positive().default(1),
    })
    .default({ options: [1, 2, 3, 5], start: 1 }),
  /** Weather changes on a fixed cycle (PK: every 30 minutes). */
  weather: z.object({
    cycleMin: z.number().positive(),
    kinds: z
      .array(
        z.object({
          id: z.enum(['clear', 'cloudy', 'rain', 'storm', 'mist', 'windy']),
          ...Bi,
          weight: z.number().positive(),
          /** Multipliers while it lasts. */
          gather: z.number().positive(),
          speed: z.number().positive(),
          farm: z.number().positive(),
        }),
      )
      .min(1),
  }),
  /** Commander aura, supply cart healing, the watchman's walks (D69). */
  army: z.object({
    commander: z.object({
      auraTiles: z.number().positive(),
      attack: z.number().positive(),
      armor: z.number(),
    }),
    supply: z.object({ radiusTiles: z.number().positive(), healPerSec: z.number().positive() }),
    watchman: z.object({
      exploreStepTiles: z.number().positive(),
      reportKinds: z.array(z.string()),
      /** PK: he reports to the king this far in front of the hall. */
      reportAtM: z.number().positive().default(10),
      /** PK: he and his dog hunt game this close (tiles). */
      huntTiles: z.number().nonnegative().default(8),
      /** PK: hides kept from a kill (share of its meat, sold as gold) and how many he carries. */
      hideShare: z.number().nonnegative().default(0.25),
      hidesCap: z.number().positive().default(60),
      /** PK: he heads for an undiscovered hidden place this close (tiles). */
      seekPlacesTiles: z.number().nonnegative().default(220),
    }),
  }),
  /** The commander's title and names by era (the first era at or before the chapter's). */
  commanders: z
    .array(
      z.object({
        era: z.string(),
        ...Bi,
        names: z.array(z.object(Bi)),
        ...Dna,
      }),
    )
    .min(1),
  /** Village animals round houses, fields and the hall (decoration, D70). */
  livestock: z.object({
    perHouse: z.record(z.string(), z.number().int().nonnegative()),
    perField: z.record(z.string(), z.number().int().nonnegative()),
    perHall: z.record(z.string(), z.number().int().nonnegative()),
    wanderM: z.number().positive(),
    /** Hay Day-style baskets to collect at houses with animals (PK). */
    produce: z
      .object({
        everySec: z.number().positive().default(90),
        food: z.number().int().nonnegative().default(12),
        autoSec: z.number().nonnegative().default(45),
        types: z.array(z.string()).default(['house', 'nobleHouse', 'townCentre']),
      })
      .default({ everySec: 90, food: 12, autoSec: 45, types: ['house', 'nobleHouse', 'townCentre'] }),
  }),
  /** PK: light alerts (work in progress, finished, running out, store full, still needed). */
  alerts: z
    .object({
      lowRes: z.number().nonnegative().default(50),
      campFull: z.number().positive().default(180),
      flashSec: z.number().positive().default(2.5),
      needSec: z.number().positive().default(1.8),
    })
    .default({ lowRes: 50, campFull: 180, flashSec: 2.5, needSec: 1.8 }),
  /** PK: people cross water on boats or bamboo rafts (path cost and speed on water). */
  rafts: z
    .object({
      enabled: z.boolean().default(true),
      cost: z.number().min(1).default(2.5),
      speed: z.number().positive().max(1).default(0.55),
    })
    .default({ enabled: true, cost: 2.5, speed: 0.55 }),
  /**
   * PK 1.8.0: how people cross water. Depth grows with the distance from the shore. Below
   * chest height they wade; deeper they ride a dugout boat (ទូក) or, with a heavy load, a bamboo
   * raft (ក្បូនឬស្សី) once their side owns a building in `boatsFrom`; without a boat they swim.
   */
  water: z
    .object({
      chestDepth: z.number().positive(),
      shoreSlope: z.number().positive(),
      maxDepth: z.number().positive(),
      wadeSpeed: z.number().positive().max(1),
      swimSpeed: z.number().positive().max(1),
      boatsFrom: z.array(z.string()),
      raftLoads: z.array(z.enum(['food', 'wood', 'stone', 'gold'])),
      wadeRoles: z.array(z.string()),
    })
    .default({
      chestDepth: 1.3,
      shoreSlope: 0.3,
      maxDepth: 4,
      wadeSpeed: 0.75,
      swimSpeed: 0.4,
      boatsFrom: ['port'],
      raftLoads: ['wood', 'stone'],
      wadeRoles: ['elephant', 'cavalry'],
    }),
  /** The rice year in a field (PK): sow, water with the rahat wheel, transplant, grow, reap. */
  rice: z.object({
    cycleSec: z.number().positive(),
    harvestFood: z.number().nonnegative(),
    stages: z
      .array(
        z.object({
          id: z.enum(['sow', 'water', 'transplant', 'grow', 'harvest']),
          km: z.string(),
          en: z.string(),
          until: z.number().positive().max(1),
        }),
      )
      .length(5),
  }),
  /** Hay Day-style order board (PK): buyers want goods and pay in gold; a junk now and then. */
  orders: z.object({
    slots: z.number().int().min(1).max(4),
    firstSec: z.number().nonnegative(),
    refillSec: z.number().nonnegative(),
    discardSec: z.number().nonnegative(),
    amount: z.object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
      perChapter: z.number(),
    }),
    value: z.record(z.string(), z.number().nonnegative()),
    goldPerValue: z.number().positive(),
    multiItemBonus: z.number().nonnegative(),
    buyers: z
      .array(
        z.object({
          id: z.string(),
          km: z.string(),
          en: z.string(),
          wants: z.array(ResourceSchema).min(1),
        }),
      )
      .min(1),
    boat: z.object({
      everySec: z.number().positive(),
      staySec: z.number().positive(),
      items: z.number().int().min(1).max(4),
      bonus: z.number().nonnegative(),
      km: z.string(),
      en: z.string(),
    }),
    confidence: z.string().optional(),
    sources: z.array(z.string()).default([]),
  }),
});
export type KingdomRules = z.infer<typeof KingdomRulesSchema>;

export const OpponentSchema = z.object({
  id: z.string(),
  ...Bi,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  look: z.enum(['rival', 'khmer', 'cham', 'daiviet']),
  /** Where the rival camp stands, in world tiles (config/kingdom/world.json). */
  from: XY,
  raiders: z.array(z.string()).min(1),
  ...Dna,
});
export type Opponent = z.infer<typeof OpponentSchema>;

const FormSchema = z.object({
  kind: z.enum(['kit', 'pyramid', 'towers', 'row3', 'galleried', 'complex', 'bayon']),
  tiers: z.number().int().positive().optional(),
  tierH: z.number().positive().optional(),
  shrink: z.number().positive().max(1).optional(),
  top: z.enum(['single', 'quincunx']).optional(),
  ringTowers: z.number().int().nonnegative().optional(),
  tierTowers: z.number().int().nonnegative().optional(),
  layout: z.enum(['grid2']).optional(),
  levels: z.number().int().positive().optional(),
  rings: z.number().int().positive().optional(),
  towers: z.number().int().nonnegative().optional(),
  faceTowers: z.number().int().nonnegative().optional(),
  hill: z.number().nonnegative().optional(),
  cornerElephants: z.boolean().optional(),
  galleries: z.boolean().optional(),
  enclosure: z.boolean().optional(),
  plain: z.boolean().optional(),
  material: z.enum(['brick', 'sandstone', 'laterite', 'pink']).optional(),
});
export type TempleForm = z.infer<typeof FormSchema>;

export const ChapterSchema = z.object({
  temple: z.string(),
  era: z.string(),
  year: z.number().int(),
  opponent: z.string(),
  footprint: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  form: FormSchema,
  island: z.boolean().optional(),
  moat: z.boolean().optional(),
  event: z.object({ ...Bi, confidence: ConfidenceSchema, newHall: XY.optional() }).optional(),
  history: z.object(Bi),
  sources: z.array(z.string()),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const CampaignSchema = z.object({
  map: z.object({
    /** Metres per map unit (config/map.json is a 100 × 100 plane). */
    scale: z.number().positive(),
    size: z.number().int().min(64),
    tile: z.number().positive(),
    seed: z.number().int(),
    start: XY,
    laterite: z.array(XY),
    sandstone: z.array(XY),
    gold: z.array(XY),
    fruit: z.array(XY),
  }),
  opponents: z.array(OpponentSchema).min(1),
  chapters: z.array(ChapterSchema).min(1),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** The Build tab's illustrated map (config/map.json), used to lay out the Kingdom map. */
export const AreaMapSchema = z.object({
  kulen: z.object({ x: z.number(), z: z.number(), radius: z.number(), height: z.number() }),
  quarry: z.object({ x: z.number(), z: z.number() }),
  kilns: z.object({ x: z.number(), z: z.number() }),
  river: z.array(XY),
  canal: z.array(XY),
  tonleSap: z.object({ z: z.number() }),
  angkorThom: z.object({ x: z.number(), z: z.number(), size: z.number() }),
  angkorWat: z.object({ x: z.number(), z: z.number(), size: z.number() }),
  westBaray: z.object({ x: z.number(), z: z.number(), w: z.number(), d: z.number() }),
  eastBaray: z.object({ x: z.number(), z: z.number(), w: z.number(), d: z.number() }),
  indratataka: z.object({ x: z.number(), z: z.number(), w: z.number(), d: z.number() }),
  sites: z.record(z.string(), XY),
  labels: z.array(z.object({ ...Bi, x: z.number(), z: z.number() })),
});
export type AreaMap = z.infer<typeof AreaMapSchema>;

const Tile = z.tuple([z.number(), z.number()]);

/**
 * One kind of wild animal (D61; Cambodian wildlife, D75). Every field added for D75 has a
 * default, so older configs (habitat forest/grass, `aggressive`) still parse:
 * - habitat: forest / grass, `water` (shores of rivers, the lake and swamps), `hill` (next
 *   to hill tiles, e.g. serow on karst), `canopy` (forest edge, drawn up in the trees).
 * - behaviour: `calm` (runs only when hit), `shy` (runs from people within `range` m),
 *   `defensive` (strikes back at its hunter), `predator` (attacks people within `range`).
 *   Missing: `predator` if the old `aggressive` flag is set, else `calm`.
 * - huntable: false = protected / not hunted (villagers are never sent after it).
 * - nocturnal: shown in the hover tip.
 * - region: optional preferred tile box ({ x: [min, max], z: [min, max] }), e.g. the
 *   Cardamoms in the west or the eastern plains; herds fall back to anywhere suitable.
 * - confidence / sources / notes: the kind's own DNA (Khmer names PK should check, etc.).
 */
export const AnimalKindSchema = z
  .object({
    id: z.string(),
    ...Bi,
    count: z.number().int().nonnegative(),
    herd: Tile,
    habitat: z.enum(['forest', 'grass', 'water', 'hill', 'canopy']),
    hp: z.number().positive(),
    speed: z.number().positive(),
    meat: z.number().positive(),
    /** Old flag (before D75); `behaviour: 'predator'` replaces it. */
    aggressive: z.boolean().optional(),
    attack: z.number().nonnegative(),
    behaviour: z.enum(['calm', 'shy', 'defensive', 'predator']).optional(),
    /** Metres: how close people may come before a shy animal runs or a predator attacks. */
    range: z.number().positive().default(7),
    /** Metres from its home a predator or angry animal will chase. */
    leash: z.number().positive().default(40),
    huntable: z.boolean().default(true),
    nocturnal: z.boolean().default(false),
    region: z.object({ x: Tile, z: Tile }).optional(),
    confidence: ConfidenceSchema.optional(),
    sources: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .transform((k) => ({
    ...k,
    behaviour: k.behaviour ?? (k.aggressive ? ('predator' as const) : ('calm' as const)),
  }));

/** A place on the empire map (temple, town, port). */
export const PlaceSchema = z.object({
  id: z.string(),
  ...Bi,
  at: Tile,
  kind: z.enum(['temple', 'town', 'port']),
  /** PK: hidden places are not marked until a hunter-scout (or anyone) finds them. */
  hidden: z.boolean().optional(),
  note: z.object(Bi),
  reward: Cost,
  confidence: ConfidenceSchema,
  sources: z.array(z.string()),
});

export const WorldSchema = z.object({
  size: z.number().int().min(128),
  origin: Tile,
  lake: z.object({ center: Tile, a: z.number().positive(), b: z.number().positive(), angle: z.number() }),
  rivers: z.array(
    z.object({
      id: z.string(),
      ...Bi,
      width: z.number().positive(),
      fordEvery: z.number().positive(),
      points: z.array(Tile).min(2),
    }),
  ),
  sea: z.object({ westZ: z.number(), slope: z.number(), bendX: z.number(), eastSlope: z.number() }),
  ranges: z.array(
    z.object({
      id: z.string(),
      ...Bi,
      axis: z.enum(['x', 'z']),
      from: z.number(),
      to: z.number(),
      line: z.number(),
      wave: z.number(),
      period: z.number().positive(),
      half: z.number().positive(),
      passes: z.array(Tile),
    }),
  ),
  massifs: z.array(z.object({ id: z.string(), ...Bi, center: Tile, r: Tile })),
  rainforest: z.array(z.object({ center: Tile, r: z.number().positive() })),
  places: z.array(PlaceSchema),
  neighbours: z.array(z.object({ id: z.string(), ...Bi, at: Tile })),
  discoverRadius: z.number().positive(),
  resources: z.object({
    nearStart: z.partialRecord(
      z.enum(['stone', 'gold', 'fruit', 'gems']),
      z.object({ n: z.number().int().nonnegative(), dist: Tile, size: z.number().int().positive() }),
    ),
    scattered: z.partialRecord(
      z.enum(['stone', 'gold', 'fruit', 'gems']),
      z.object({ n: z.number().int().nonnegative(), size: z.number().int().positive() }),
    ),
    /** Gem fields (Pailin sapphires and rubies, PK): tile centres of rich gem patches. */
    gemFields: z.array(Tile).default([]),
    sandstoneJitter: z.number().nonnegative(),
    forestDensity: z.number().min(0).max(1),
    rainforestBoost: z.number().min(0).max(1),
  }),
  fish: z.object({
    every: z.number().int().positive(),
    amount: z.number().positive(),
    regrowPerSec: z.number().nonnegative(),
  }),
  animals: z.object({
    respawnSec: z.number().positive(),
    kinds: z.array(AnimalKindSchema),
    ...Dna,
  }),
});
export type World = z.infer<typeof WorldSchema>;

const Pt = z.tuple([z.number(), z.number()]);
/**
 * Anachak Khmer (PK's second Kingdom tab, D92): the levy, the battle order, the royal roads
 * and the 3D hero mode (config/kingdom/anachak.json).
 */
export const AnachakSchema = z.object({
  tab: z.object({ ...Bi, savePrefix: z.string().min(1) }),
  /**
   * PK 1.6.0: the graphic style. 'build' = the Build and Expedition tabs' look (low-poly
   * facets, soft natural light, warm haze, no ink); 'anime' = the 90s anime cel look (D98).
   */
  look: z.enum(['build', 'anime']).default('build'),
  levy: z.object({
    roles: z.array(z.string()).min(1),
    steps: z.array(z.number().int().positive()).min(1),
    keepFarmers: z.boolean(),
    rallyTiles: z.number().nonnegative(),
    rallySpread: z.number().nonnegative(),
    note: z.object(Bi),
    confidence: ConfidenceSchema,
    sources: z.array(z.string()),
  }),
  battle: z.object({ searchTiles: z.number().positive() }),
  night: z.object({
    daySec: z.number().positive(),
    dusk: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    dawn: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    sun: z.number().min(0).max(1),
    sky: z.number().min(0).max(1),
    zenith: z.string().regex(/^#[0-9a-f]{6}$/i),
    horizon: z.string().regex(/^#[0-9a-f]{6}$/i),
    fog: z.string().regex(/^#[0-9a-f]{6}$/i),
    fire: z.object({ day: z.number().min(0), night: z.number().min(0), radius: z.number().positive() }),
    /** PK 1.8.0: torches by the houses, round the work places, in people's hands at night. */
    torches: z.object({
      houses: z.array(z.string()),
      work: z.record(z.string(), z.number().int().min(0).max(8)),
      carry: z.boolean(),
      planted: z.boolean(),
      max: z.number().int().min(1),
      from: z.number().min(0).max(1),
      flame: z.string().regex(/^#[0-9a-f]{6}$/i),
      glow: z.string().regex(/^#[0-9a-f]{6}$/i),
      light: z.string().regex(/^#[0-9a-f]{6}$/i),
      glowSize: z.number().positive(),
      pool: z.number().positive(),
      lightRange: z.number().positive(),
      lightIntensity: z.number().min(0),
    }),
    /** PK 1.8.0: the stars and the moon. */
    heavens: z.object({
      stars: z.number().int().min(0).max(5000),
      starSize: z.tuple([z.number().positive(), z.number().positive()]),
      starColor: z.string().regex(/^#[0-9a-f]{6}$/i),
      cycleDays: z.number().positive(),
      moonHigh: z.number().min(10).max(90),
      moonSize: z.number().positive(),
      moonColor: z.string().regex(/^#[0-9a-f]{6}$/i),
      moonlight: z.string().regex(/^#[0-9a-f]{6}$/i),
    }),
    confidence: ConfidenceSchema,
  }),
  market: z.object({
    building: z.string(),
    lots: z.array(z.number().int().positive()).min(1),
    value: z.object({
      food: z.number().positive(),
      wood: z.number().positive(),
      stone: z.number().positive(),
      gold: z.number().positive(),
    }),
    fee: z.number().min(0).max(0.9),
    step: z.number().min(0).max(1),
    min: z.number().positive(),
    max: z.number().positive(),
    recoverPerSec: z.number().min(0),
    confidence: ConfidenceSchema,
    sources: z.array(z.string()).min(1),
  }),
  danger: z.object({
    askSec: z.number().positive(),
    everySec: z.number().positive(),
    watchDist: z.number().positive(),
  }),
  tiger: z.object({
    everySec: z.number().positive(),
    chance: z.number().min(0).max(1),
    dist: z.tuple([z.number().positive(), z.number().positive()]),
    kingBite: z.number().positive(),
    confidence: ConfidenceSchema,
    sources: z.array(z.string()).min(1),
  }),
  roads: z.object({
    width: z.number().int().positive(),
    speed: z.number().positive(),
    cost: z.number().positive().max(1),
    restEvery: z.number().int().positive(),
    restEra: z.string(),
    restHealPerSec: z.number().nonnegative(),
    restRadiusTiles: z.number().positive(),
    caravanSec: z.number().positive(),
    routes: z
      .array(
        z.object({
          id: z.string(),
          ...Bi,
          dest: z.string(),
          caravan: Cost,
          points: z.array(Pt).min(2),
          bridge: z
            .object({ at: Pt, id: z.string(), ...Bi, streamTiles: z.number().int().positive() })
            .optional(),
          confidence: ConfidenceSchema,
          sources: z.array(z.string()).min(1),
        }),
      )
      .min(1),
    places: z.array(PlaceSchema),
    note: z.object(Bi),
    uncertain: z.object(Bi),
  }),
  hero: z.object({
    camera: z.object({
      dist: z.number().positive(),
      height: z.number(),
      fov: z.number().positive(),
      minDist: z.number().positive(),
      maxDist: z.number().positive(),
      /** Starting pitch (rad above level): low enough that the sky and horizon show. */
      pitch: z.number(),
      pitchMin: z.number(),
      pitchMax: z.number(),
      lookHeight: z.number(),
      fogNear: z.number().positive(),
      fogFar: z.number().positive(),
    }),
    move: z.object({
      walk: z.number().positive(),
      run: z.number().positive(),
      jump: z.number().positive(),
      gravity: z.number().positive(),
      dash: z.number().positive(),
      dashSec: z.number().positive(),
      dashCd: z.number().nonnegative(),
      turn: z.number().positive(),
      staminaMax: z.number().positive(),
      staminaRun: z.number().nonnegative(),
      staminaDash: z.number().nonnegative(),
      staminaRegen: z.number().nonnegative(),
    }),
    combo: z.object({
      /** Where in a swing the blow lands (0–1). */
      hitAt: z.number().min(0).max(1),
      steps: z.number().int().positive(),
      window: z.number().positive(),
      sec: z.array(z.number().positive()).min(1),
      mul: z.array(z.number().positive()).min(1),
    }),
    tuning: z.object({
      thirdReach: z.number().nonnegative(),
      bareWork: z.number().positive(),
      aimCone: z.number().positive(),
      volleyAhead: z.number().positive(),
      volleyMax: z.number().int().positive(),
      chopTimes: z.number().int().positive(),
      chopKnock: z.number().positive(),
    }),
    attackMul: z.number().positive(),
    armorBonus: z.number().nonnegative(),
    interactRange: z.number().positive(),
    /** How far the played hero sees (m): he explores the land round him. */
    vision: z.number().positive(),
    chopPerSwing: z.number().positive(),
    buildPerSwing: z.number().positive(),
    king: z.object({
      hp: z.number().positive(),
      attack: z.number().positive(),
      armor: z.number().nonnegative(),
    }),
    kits: z
      .array(
        z.object({
          id: z.string(),
          units: z.array(z.string()),
          weapon: z.enum(['axe', 'spear', 'sword', 'bow', 'lance', 'goad', 'staff', 'preahKhan']),
          reach: z.number().positive(),
          arc: z.number().positive(),
          skill: z.object({
            id: z.string(),
            ...Bi,
            cd: z.number().positive(),
            radius: z.number().positive(),
            power: z.number().positive(),
            kind: z.enum(['chop', 'spin', 'dash', 'volley', 'heal', 'dog']),
          }),
        }),
      )
      .min(1),
    kingNote: z.object(Bi),
    /** PK: rigged .glb character models by kit id (apps/game/public/models). */
    models: z
      .record(
        z.string(),
        z.union([z.string(), z.object({ file: z.string().min(1), hips: z.number().positive() })]),
      )
      .optional(),
    quests: z.object({
      grow: z.number().positive(),
      list: z
        .array(
          z.object({
            kits: z.array(z.string()).min(1),
            kind: z.enum(['gather', 'store', 'defeat', 'hunt', 'heal', 'build']),
            n: z.number().positive(),
            ...Bi,
            reward: Cost,
          }),
        )
        .min(1),
    }),
    confidence: ConfidenceSchema,
  }),
});
export type Anachak = z.infer<typeof AnachakSchema>;
export type HeroKit = Anachak['hero']['kits'][number];
export type RoadRoute = Anachak['roads']['routes'][number];
export type AnimalKind = World['animals']['kinds'][number];
export type AnimalBehaviour = AnimalKind['behaviour'];
export type Place = World['places'][number];

export interface TempleInfo {
  id: string;
  km: string;
  en: string;
  year: string;
  king: string;
  order: number;
}

/** One occupation of the historical human database (PK's character prompt set, D71). */
export const OccupationSchema = z.object({
  id: z.string(),
  ...Bi,
  group: z.enum([
    'civilian',
    'construction',
    'crafts',
    'trade',
    'religion',
    'royal',
    'military',
    'culture',
    'family',
  ]),
  eras: z.array(z.string()).min(1),
  socialStatus: z.string(),
  clothing: z.string().min(1),
  hair: z.string().min(1),
  jewelry: z.string(),
  tools: z.array(z.string()).min(1),
  carried: z.array(z.string()),
  workstation: z.string(),
  workAnimation: z.string(),
  resource: z.string(),
  /** villager:<job> (the villager's look for that job), unit:<id>, or planned. */
  inGame: z.string().regex(/^(villager:[a-z]+|unit:[A-Za-z]+|planned)$/),
  ...Dna,
});
export type Occupation = z.infer<typeof OccupationSchema>;

export const SourcesSchema = z.object({
  sources: z.array(
    z.object({ id: z.string(), title: z.string(), author: z.string(), year: z.number().int() }),
  ),
});

/** What was happening elsewhere in the world (PK: the years and eras of the world). */
export const WorldEventSchema = z.object({
  year: z.number().int(),
  /** "c." when the year is approximate. */
  circa: z.boolean().default(false),
  place: z.object(Bi),
  ...Bi,
  /** Khmer events are part of the kingdom's own story; others happen elsewhere. */
  khmer: z.boolean().default(false),
  confidence: ConfidenceSchema,
});
export type WorldEvent = z.infer<typeof WorldEventSchema>;

/** PK 1.6.0: real 3D models for the world's props (config/kingdom/props.json). */
export const PropSlotSchema = z.object({
  file: z.string(),
  source: z.string(),
  tris: z.number().int().positive(),
  tex: z.number().int().positive(),
  fit: z.enum(['height', 'width']),
  sway: z.boolean().optional(),
  sink: z.number().min(0).max(0.5).optional(),
  tint: z.string().optional(),
  bake: z.enum(['vertex']).optional(),
  /** Baked plants: brighten (×) and saturate (×) the colours to sit with the game's palette. */
  light: z.number().positive().optional(),
  sat: z.number().min(0).optional(),
  /** false: keep the built-in shape in the diorama look (PK 1.7.0). */
  diorama: z.boolean().optional(),
  en: z.string(),
});
export type PropSlot = z.infer<typeof PropSlotSchema>;
export const PROP_SLOTS = ['tree.common', 'tree.palm', 'tree.mango', 'dikePalm', 'rock.stone', 'rock.gold', 'fruit'] as const;
export type PropSlotId = (typeof PROP_SLOTS)[number];
export const PropsSchema = z.object({
  slots: z.record(z.enum(PROP_SLOTS), PropSlotSchema),
});

/** PK 1.7.0: the Angkor Cel-Diorama look (config/kingdom/diorama.json, docs/VISUAL_BIBLE.md). */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** A field of wind-blown grass (view/elephantGrass.ts): the tall stands and the short sward. */
const GrassFieldSchema = z.object({
    count: z.number().int().min(0),
    blades: z.number().int().min(3).max(24),
    reach: z.number().positive(),
    standTiles: z.number().positive(),
    cover: z.number().min(0).max(1),
    perTile: z.number().min(0).max(16),
    bank: z.number().min(0).max(1),
    keepAway: z.number().int().min(0).max(12),
    height: z.tuple([z.number().positive(), z.number().positive()]),
    /** Width of a tussock (m): it is wider than tall, so stands read as a dense mass. */
    spread: z.tuple([z.number().positive(), z.number().positive()]),
    /** PK 1.8.0: PK's Meshy grass baked into cards (atlas file, card size per 1 of grass height, width share). */
    cards: z
      .object({
        file: z.string(),
        card: z.number().positive(),
        spread: z.tuple([z.number().positive(), z.number().positive()]),
        /** Rows each card is cut in (more = it bends smoother in the wind; 1 for short grass). */
        rows: z.number().int().min(1).max(8).optional(),
        /** The atlas has a 4th column, the grass from above, shown on a flat card (the RTS camera). */
        top: z.boolean().optional(),
        /** Height of that flat card, as a share of the grass height (default 0.45; higher for a short lawn on bumpy ground). */
        topAt: z.number().min(0.05).max(1).optional(),
        source: z.string(),
      })
      .optional(),
    /** PK 1.8.0: dense cogon grass (ស្បូវ) mixed in: its share, its heights (m) and paler tint. */
    cogon: z.object({
      share: z.number().min(0).max(1),
      height: z.tuple([z.number().positive(), z.number().positive()]),
      tint: Hex,
    }),
    /** Most wear (0..1) a tile may have and still grow it (default 0.04; worn earth shows from ground.soilFrom). */
    wearMax: z.number().min(0).max(1).optional(),
    /** Colour every clump is multiplied by (x1.5: may brighten), to match the ground's green. */
    tint: Hex.optional(),
    dry: Hex,
    dryShare: z.number().min(0).max(1),
    flowering: z.number().min(0).max(1),
    gustSheen: z.number().min(0).max(1),
    baseDark: z.number().min(0).max(1),
    trample: z.number().min(0),
    lod: z.tuple([z.number().positive(), z.number().positive()]),
    wind: z.object({
      strength: z.number().min(0).max(3),
      dirDeg: z.number(),
      speed: z.number().min(0),
      waveScale: z.number().positive(),
      sharpness: z.number().min(0).max(0.49),
      baseBend: z.number().min(0).max(1),
      gustBend: z.number().min(0).max(1.5),
      sway: z.number().min(0).max(0.5),
      swaySpeed: z.number().min(0),
      flutter: z.number().min(0).max(0.3),
      flutterSpeed: z.number().min(0),
    }),
  });

export const DioramaSchema = z.object({
  camera: z.object({ fov: z.number().min(8).max(60), far: z.number().positive() }),
  post: z.object({
    focusBand: z.number().min(0).max(0.5),
    blur: z.number().min(0),
    blurClose: z.number().min(0),
    highlight: Hex,
    shadow: Hex,
    split: z.number().min(0).max(1),
    contrast: z.number().positive(),
    saturation: z.number().min(0),
    vignette: z.number().min(0).max(1),
  }),
  units: z.object({
    ramp: z
      .array(z.object({ from: z.number().min(0).max(1), level: z.number().min(0).max(2) }))
      .min(2)
      .max(6),
    shadowTint: Hex,
    outlinePx: z.number().min(0).max(6),
    outline: Hex,
    rim: z.number().min(0),
    rimPower: z.number().positive(),
    saturation: z.number().min(0),
  }),
  terrain: z.object({
    laterite: Hex,
    emerald: Hex,
    lowland: Hex,
    earth: Hex,
    slopeFrom: z.number().min(0).max(1),
    slopeTo: z.number().min(0).max(1),
    patches: z.number().min(0).max(1),
    aoSteps: z.number().int().min(1).max(8),
    aoStrength: z.number().min(0).max(1),
  }),
  water: z.object({
    shallow: Hex,
    deep: Hex,
    silt: Hex,
    shallowDepth: z.number().min(0),
    deepDepth: z.number().positive(),
    fresnelPower: z.number().positive(),
    skyDawn: Hex,
    skyNoon: Hex,
    skyDusk: Hex,
    skyNight: Hex,
    specSize: z.number().min(0).max(1),
    specBand: z.number().min(0).max(0.2),
    specStrength: z.number().min(0),
    foamDepth: z.number().min(0),
    foam: Hex,
    rippleSpeed: z.number().min(0),
    rippleScale: z.number().positive(),
    rippleStrength: z.number().min(0).max(1),
    /** PK 1.8.0: crystal-clear water: opacity in the shallows and the deep, light on the bed. */
    clarity: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
    caustics: z.number().min(0).max(1).optional(),
  }),
  ground: z.object({
    meadowDark: Hex,
    meadowLight: Hex,
    meadowDry: Hex,
    forestFloor: Hex,
    soil: Hex,
    soilDark: Hex,
    soilLight: Hex,
    yardTiles: z.number().int().min(0).max(8),
    walkWear: z.number().min(0),
    workWear: z.number().min(0),
    regrow: z.number().min(0),
    soilFrom: z.number().min(0).max(1),
    soilTo: z.number().min(0).max(1),
    /** PK 1.8.0: dead leaves on the forest floor. */
    litter: Hex.optional(),
  }),
  /** PK 1.8.0: wet ground and puddles on the mud paths after rain (view/terrain.ts). */
  wet: z.object({
    soak: z.number().positive(),
    dry: z.number().positive(),
    puddleScale: z.number().positive(),
    puddleCover: z.number().min(0).max(1),
    darken: z.number().min(0).max(1),
    sky: Hex,
  }),
  light: z.object({
    elevation: z.number().min(5).max(85),
    shadowMap: z.number().int().min(256).max(8192),
    fill: z.number().min(0),
    sun: z.number().min(0),
    foliage: Hex,
  }),
  /** PK 1.8.0: dense tall tropical grass that rolls in the wind (view/elephantGrass.ts). */
  elephantGrass: GrassFieldSchema,
  /** PK 1.8.0: the short grass (30 cm) that covers every green meadow, same wind (PK's Meshy model). */
  sward: GrassFieldSchema,
  /** PK 1.8.0: the 10 cm lawn under everything on the open grass (PK's "make grass for floor"). */
  lawn: GrassFieldSchema,
  /** PK 1.8.0: a few clusters of stones in the grass (PK's "Grass and Stones"; no wind). */
  stones: GrassFieldSchema,
  /** PK 1.8.0: ground mist and light shafts through the clouds (view/atmosphere.ts). */
  atmosphere: z.object({
    mist: z.object({
      count: z.number().int().min(0).max(64),
      cell: z.number().positive(),
      size: z.tuple([z.number().positive(), z.number().positive()]),
      height: z.tuple([z.number(), z.number()]),
      opacity: z.number().min(0).max(1),
      color: Hex,
      nightColor: Hex,
      weather: z.record(z.string(), z.number().min(0).max(1)),
      dawn: z.number().min(0).max(1),
      wet: z.number().min(0).max(1),
    }),
    shafts: z.object({
      count: z.number().int().min(0).max(32),
      cell: z.number().positive(),
      width: z.tuple([z.number().positive(), z.number().positive()]),
      length: z.number().positive(),
      strength: z.number().min(0).max(2),
      color: Hex,
      weather: z.record(z.string(), z.number().min(0).max(1)),
      afterRain: z.number().min(0).max(1),
    }),
  }),
  /**
   * PK 1.8.0: zoomed in close, whatever stands between the camera and the people at work
   * (buildings, trees, tall grass) turns see-through round them (view/seeThrough.ts).
   */
  seeThrough: z.object({
    /** Camera distance (m): fully on below the first, off above the second. */
    zoom: z.tuple([z.number().positive(), z.number().positive()]),
    /** How many people and animals are kept in view at once (nearest the middle of the view). */
    targets: z.number().int().min(1).max(32),
    /** Size of the see-through window round each (m, across; it is taller than wide). */
    radius: z.number().positive(),
    /** Share of the cover taken away in the middle of the window (0..1; 1 = a hole). */
    amount: z.number().min(0).max(1),
  }),
  detail: z.object({
    tufts: z.number().int().min(0),
    flowers: z.number().int().min(0),
    pebbles: z.number().int().min(0),
    lotus: z.number().int().min(0),
    /** PK 1.8.0: mossy laterite rocks, fallen palm fronds, creeping roots. */
    rocks: z.number().int().min(0).default(0),
    fronds: z.number().int().min(0).default(0),
    roots: z.number().int().min(0).default(0),
    reach: z.number().positive(),
  }),
});
export type Diorama = z.infer<typeof DioramaSchema>;

/** The keyboard (PK 1.8.0): every action, its names, its default keys (KeyboardEvent.code). */
const ControlActionSchema = z.object({
  id: z.string().min(1),
  km: z.string().min(1),
  en: z.string().min(1),
  keys: z.array(z.string().min(1)).min(1).max(2),
});
export const ControlsSchema = z
  .object({ map: z.array(ControlActionSchema).min(1), hero: z.array(ControlActionSchema).min(1) })
  .superRefine((c, ctx) => {
    for (const g of ['map', 'hero'] as const) {
      const ids = new Set<string>();
      const keys = new Map<string, string>();
      for (const a of c[g]) {
        if (ids.has(a.id)) ctx.addIssue({ code: 'custom', path: [g], message: `${a.id} twice` });
        ids.add(a.id);
        for (const k of a.keys) {
          if (keys.has(k)) ctx.addIssue({ code: 'custom', path: [g], message: `${k} on ${keys.get(k)} and ${a.id}` });
          keys.set(k, a.id);
        }
      }
    }
  });
export type Controls = z.infer<typeof ControlsSchema>;
export type ControlAction = z.infer<typeof ControlActionSchema>;

export interface KingdomData {
  eras: Era[];
  sources: Array<{ id: string; title: string; author: string; year: number }>;
  buildings: Record<string, BuildingDef>;
  units: Record<string, UnitDef>;
  techs: Record<string, TechDef>;
  rules: KingdomRules;
  campaign: Campaign;
  area: AreaMap;
  world: World;
  occupations: Occupation[];
  /** Events in the world, by year (PK: the years and eras of the world). */
  worldEvents: WorldEvent[];
  temples: Record<string, TempleInfo>;
  /** Anachak Khmer, the second Kingdom tab (D92). */
  anachak: Anachak;
  props: z.infer<typeof PropsSchema>;
  diorama: Diorama;
  /** The default keys (config/kingdom/controls.json). */
  controls: Controls;
}

const byId = <T extends { id: string }>(list: T[]): Record<string, T> =>
  Object.fromEntries(list.map((x) => [x.id, x]));

/** Load and validate every kingdom file (throws with the exact field on a bad value). */
export function loadKingdom(): KingdomData {
  return {
    eras: z.object({ eras: z.array(EraSchema).min(1) }).parse(erasJson).eras,
    sources: SourcesSchema.parse(sourcesJson).sources,
    buildings: byId(z.object({ buildings: z.array(BuildingDefSchema) }).parse(buildingsJson).buildings),
    units: byId(z.object({ units: z.array(UnitDefSchema) }).parse(unitsJson).units),
    techs: byId(z.object({ techs: z.array(TechDefSchema) }).parse(techsJson).techs),
    rules: KingdomRulesSchema.parse(rulesJson),
    campaign: CampaignSchema.parse(campaignJson),
    area: AreaMapSchema.parse(mapJson),
    world: WorldSchema.parse(worldJson),
    anachak: AnachakSchema.parse(anachakJson),
    props: PropsSchema.parse(propsJson),
    diorama: DioramaSchema.parse(dioramaJson),
    controls: ControlsSchema.parse(controlsJson),
    occupations: z.object({ occupations: z.array(OccupationSchema).min(1) }).parse(charactersJson)
      .occupations,
    worldEvents: z
      .object({ events: z.array(WorldEventSchema) })
      .parse(worldEventsJson)
      .events.sort((a, b) => a.year - b.year),
    temples: Object.fromEntries(
      (templesJson as { temples: TempleInfo[] }).temples.map((t) => [
        t.id,
        { id: t.id, km: t.km, en: t.en, year: t.year, king: t.king, order: t.order },
      ]),
    ),
  };
}

/** The era a chapter belongs to, and everything unlocked up to and including it. */
export function eraContent(
  data: KingdomData,
  eraId: string,
): { buildings: Set<string>; units: Set<string>; techs: Set<string> } {
  const out = { buildings: new Set<string>(), units: new Set<string>(), techs: new Set<string>() };
  for (const e of data.eras) {
    e.buildings.forEach((b) => out.buildings.add(b));
    e.units.forEach((u) => out.units.add(u));
    e.techs.forEach((t) => out.techs.add(t));
    if (e.id === eraId) break;
  }
  return out;
}

// ---------------------------------------------------------------- historical validation

export interface HistoricalWarning {
  level: 'error' | 'warning';
  object: string;
  message: string;
}

/**
 * The historical validation tool (prompt 32): checks that everything an era offers exists,
 * belongs to that era, cites known sources, and that anything not confirmed says why in a
 * note. Content marked GAMEPLAY_ABSTRACTION or FICTIONAL is allowed but must say so.
 */
export function validateKingdom(data: KingdomData): HistoricalWarning[] {
  const out: HistoricalWarning[] = [];
  const sourceIds = new Set(data.sources.map((s) => s.id));
  const checkDna = (id: string, dna: { confidence: Confidence; sources: string[]; notes?: string }) => {
    for (const s of dna.sources)
      if (!sourceIds.has(s)) out.push({ level: 'error', object: id, message: `unknown source "${s}"` });
    const historical = dna.confidence.startsWith('HISTORICALLY');
    if (historical && dna.sources.length === 0)
      out.push({ level: 'error', object: id, message: `${dna.confidence} needs at least one source` });
    if (dna.confidence !== 'HISTORICALLY_CONFIRMED' && !dna.notes?.trim())
      out.push({
        level: 'error',
        object: id,
        message: `${dna.confidence} must explain the uncertainty or abstraction in notes`,
      });
  };
  for (const era of data.eras) {
    if (era.startYear > era.endYear)
      out.push({ level: 'error', object: era.id, message: 'era ends before it starts' });
    if (era.startingYear < era.startYear || era.startingYear > era.endYear)
      out.push({ level: 'error', object: era.id, message: 'starting year is outside the era' });
    for (const s of era.sources)
      if (!sourceIds.has(s)) out.push({ level: 'error', object: era.id, message: `unknown source "${s}"` });
    const lists: Array<[string, string[], Record<string, unknown>]> = [
      ['building', era.buildings, data.buildings],
      ['unit', era.units, data.units],
      ['tech', era.techs, data.techs],
    ];
    for (const [kind, ids, table] of lists)
      for (const id of ids)
        if (!table[id])
          out.push({ level: 'error', object: era.id, message: `${kind} "${id}" is not defined` });
  }
  for (const b of Object.values(data.buildings)) {
    checkDna(b.id, b);
    for (const t of [...b.trains])
      if (!data.units[t]) out.push({ level: 'error', object: b.id, message: `trains unknown unit "${t}"` });
    if (b.freeUnit && !data.units[b.freeUnit])
      out.push({ level: 'error', object: b.id, message: `comes with unknown unit "${b.freeUnit}"` });
    for (const t of b.researches)
      if (!data.techs[t])
        out.push({ level: 'error', object: b.id, message: `researches unknown tech "${t}"` });
    for (const r of b.requires)
      if (!data.buildings[r])
        out.push({ level: 'error', object: b.id, message: `requires unknown building "${r}"` });
  }
  for (const u of Object.values(data.units)) {
    checkDna(u.id, u);
    if (!data.buildings[u.trainedAt])
      out.push({ level: 'error', object: u.id, message: `trained at unknown building "${u.trainedAt}"` });
    for (const r of u.requires)
      if (!data.techs[r]) out.push({ level: 'error', object: u.id, message: `requires unknown tech "${r}"` });
    if (u.confidence === 'HISTORICALLY_UNCERTAIN' && u.requires.length === 0 && u.role === 'elephant')
      out.push({
        level: 'warning',
        object: u.id,
        message: 'uncertain elephants should be behind a technology',
      });
  }
  // Wild animals (D75): unique ids, and each kind's own DNA when it has one.
  const animalIds = new Set<string>();
  for (const k of data.world.animals.kinds) {
    if (animalIds.has(k.id)) out.push({ level: 'error', object: k.id, message: 'duplicate animal kind' });
    animalIds.add(k.id);
    if (k.confidence)
      checkDna(`animal:${k.id}`, { confidence: k.confidence, sources: k.sources, notes: k.notes });
    else
      for (const s of k.sources)
        if (!sourceIds.has(s))
          out.push({ level: 'error', object: `animal:${k.id}`, message: `unknown source "${s}"` });
    if (k.herd[0] > k.herd[1] || k.herd[0] < 1)
      out.push({ level: 'error', object: `animal:${k.id}`, message: 'herd must be [min, max] with min ≥ 1' });
  }
  for (const t of Object.values(data.techs)) {
    checkDna(t.id, { confidence: t.confidence, sources: t.sources, notes: t.history });
    for (const r of t.requires)
      if (!data.techs[r]) out.push({ level: 'error', object: t.id, message: `requires unknown tech "${r}"` });
  }
  const first = data.eras.find((e) => e.id === data.rules.scenario.era);
  if (!first)
    out.push({
      level: 'error',
      object: data.rules.scenario.id,
      message: `unknown era "${data.rules.scenario.era}"`,
    });
  else if (data.rules.scenario.year < first.startYear || data.rules.scenario.year > first.endYear)
    out.push({
      level: 'error',
      object: data.rules.scenario.id,
      message: `year ${data.rules.scenario.year} is outside ${first.id}`,
    });
  // Every building, unit and technology belongs to some era.
  const all = eraContent(data, data.eras[data.eras.length - 1]!.id);
  for (const id of Object.keys(data.buildings))
    if (!all.buildings.has(id))
      out.push({ level: 'warning', object: id, message: 'not part of any era: hidden' });
  for (const id of Object.keys(data.units))
    if (!all.units.has(id))
      out.push({ level: 'warning', object: id, message: 'not part of any era: hidden' });
  // Eras run in time order.
  data.eras.forEach((e, i) => {
    const prev = data.eras[i - 1];
    if (prev && e.startYear < prev.startYear)
      out.push({ level: 'error', object: e.id, message: 'era starts before the previous one' });
  });
  // Campaign: chapters follow temples.json, sit in their era's years, use known opponents and sites.
  const order = Object.values(data.temples).sort((a, b) => a.order - b.order);
  data.campaign.chapters.forEach((c, i) => {
    const id = `chapter ${i + 1} (${c.temple})`;
    if (order[i]?.id !== c.temple)
      out.push({ level: 'error', object: id, message: `temples.json has "${order[i]?.id}" in this place` });
    const era = data.eras.find((e) => e.id === c.era);
    if (!era) out.push({ level: 'error', object: id, message: `unknown era "${c.era}"` });
    else {
      if (c.year < era.startYear || c.year > era.endYear)
        out.push({
          level: 'error',
          object: id,
          message: `year ${c.year} is outside ${era.id} (${era.startYear}–${era.endYear})`,
        });
      if (!era.monuments.includes(c.temple))
        out.push({ level: 'error', object: id, message: `era ${era.id} does not list this temple` });
    }
    const prev = data.campaign.chapters[i - 1];
    if (prev && c.year < prev.year)
      out.push({ level: 'error', object: id, message: 'chapters must run forward in time' });
    if (prev && data.eras.findIndex((e) => e.id === c.era) < data.eras.findIndex((e) => e.id === prev.era))
      out.push({ level: 'error', object: id, message: 'eras must run forward' });
    if (!data.campaign.opponents.some((o) => o.id === c.opponent))
      out.push({ level: 'error', object: id, message: `unknown opponent "${c.opponent}"` });
    if (!data.area.sites[c.temple])
      out.push({ level: 'error', object: id, message: 'no site on config/map.json' });
    for (const src of c.sources)
      if (!sourceIds.has(src)) out.push({ level: 'error', object: id, message: `unknown source "${src}"` });
    if (c.form.kind === 'kit' && c.temple !== 'preah-ko')
      out.push({ level: 'error', object: id, message: 'only Preah Ko has a 3D kit' });
  });
  for (const o of data.campaign.opponents) {
    checkDna(o.id, o);
    for (const r of o.raiders)
      if (!data.units[r]) out.push({ level: 'error', object: o.id, message: `raider "${r}" is not defined` });
  }
  for (const r of data.rules.ai.raiders)
    if (!data.units[r]) out.push({ level: 'error', object: 'ai', message: `raider "${r}" is not defined` });
  // Anachak Khmer (D92): roads, levy and heroes refer to real things.
  const A = data.anachak;
  const roles = new Set(Object.values(data.units).map((u) => u.role));
  for (const r of A.levy.roles)
    if (!roles.has(r as never)) out.push({ level: 'error', object: 'levy', message: `unknown role "${r}"` });
  checkDna('levy', { ...A.levy, notes: A.levy.note.en });
  const placeIds = new Set([...data.world.places, ...A.roads.places].map((p) => p.id));
  for (const p of A.roads.places) checkDna(p.id, { ...p, notes: p.note.en });
  if (!data.eras.some((e) => e.id === A.roads.restEra))
    out.push({ level: 'error', object: 'roads', message: `unknown era "${A.roads.restEra}"` });
  for (const r of A.roads.routes) {
    checkDna(r.id, { ...r, notes: A.roads.uncertain.en });
    if (!placeIds.has(r.dest))
      out.push({ level: 'error', object: r.id, message: `unknown place "${r.dest}"` });
    for (const [x, z] of r.points)
      if (x < 0 || z < 0 || x >= data.world.size || z >= data.world.size)
        out.push({ level: 'error', object: r.id, message: `point ${x},${z} is off the map` });
  }
  const kitUnits = A.hero.kits.flatMap((k) => k.units);
  for (const u of kitUnits)
    if (!data.units[u])
      out.push({ level: 'error', object: 'hero', message: `kit unit "${u}" is not defined` });
  for (const u of Object.keys(data.units))
    if (!kitUnits.includes(u))
      out.push({ level: 'error', object: 'hero', message: `"${u}" has no hero kit` });
  if (!A.hero.kits.some((k) => k.id === 'king'))
    out.push({ level: 'error', object: 'hero', message: 'the king needs a hero kit' });
  checkDna('tiger', { ...A.tiger, notes: 'Encounter timing is gameplay; tigers on the reliefs.' });
  checkDna('market', {
    ...A.market,
    notes: 'Rates, fee and price moves are gameplay; the market itself is in Zhou Daguan.',
  });
  if (!data.buildings[A.market.building])
    out.push({ level: 'error', object: 'market', message: `unknown building "${A.market.building}"` });
  if (A.market.min >= 1 || A.market.max <= 1)
    out.push({
      level: 'error',
      object: 'market',
      message: 'prices must be able to fall below and rise above value',
    });
  if (!(
    A.night.dusk[0] < A.night.dusk[1] &&
    A.night.dusk[1] <= A.night.dawn[0] &&
    A.night.dawn[0] < A.night.dawn[1]
  ))
    out.push({ level: 'error', object: 'night', message: 'dusk must come before dawn' });
  if (A.tiger.dist[0] >= A.tiger.dist[1])
    out.push({ level: 'error', object: 'tiger', message: 'dist must be [near, far]' });
  return out;
}

/** Villager jobs the view draws (apps/game kingdom/view/people.ts Job). */
export const VILLAGER_JOBS = [
  'builder',
  'farmer',
  'fisher',
  'woodcutter',
  'quarryman',
  'goldworker',
  'hunter',
  'forager',
  'porter',
] as const;

/**
 * The historical character validator (prompt 34): every occupation cites known sources,
 * explains anything not confirmed, carries a tool readable at RTS distance (prompt 29),
 * belongs to known eras, points at a real unit or villager job, and children are never
 * soldiers (prompt 26). Warnings are shown as HISTORICAL WARNING lines.
 */
export function validateCharacters(data: KingdomData): HistoricalWarning[] {
  const out: HistoricalWarning[] = [];
  const sourceIds = new Set(data.sources.map((s) => s.id));
  const eraIds = new Set(data.eras.map((e) => e.id));
  const seen = new Set<string>();
  const jobs = new Set<string>(VILLAGER_JOBS);
  for (const o of data.occupations) {
    const err = (message: string) => out.push({ level: 'error', object: o.id, message });
    if (seen.has(o.id)) err('duplicate occupation');
    seen.add(o.id);
    for (const s of o.sources) if (!sourceIds.has(s)) err(`unknown source "${s}"`);
    if (o.confidence.startsWith('HISTORICALLY') && !o.sources.length) err('needs a source');
    if (o.confidence !== 'HISTORICALLY_CONFIRMED' && !o.notes?.trim()) err('must explain the uncertainty');
    for (const e of o.eras) if (!eraIds.has(e)) err(`unknown era "${e}"`);
    const [kind, ref] = o.inGame.split(':');
    if (kind === 'unit' && !data.units[ref!]) err(`unknown unit "${ref}"`);
    if (kind === 'villager' && !jobs.has(ref!)) err(`unknown villager job "${ref}"`);
    if (o.group === 'family' && kind === 'unit') err('family members are never units');
    if (o.confidence === 'GAMEPLAY_ABSTRACTION')
      out.push({ level: 'warning', object: o.id, message: 'This design is marked GAMEPLAY_ABSTRACTION.' });
    if (o.confidence === 'HISTORICALLY_UNCERTAIN')
      out.push({ level: 'warning', object: o.id, message: 'The evidence for this character is uncertain.' });
  }
  for (const j of VILLAGER_JOBS)
    if (!data.occupations.some((o) => o.inGame === `villager:${j}`))
      out.push({ level: 'error', object: j, message: 'villager job has no occupation entry' });
  for (const c of data.rules.commanders) {
    if (!eraIds.has(c.era))
      out.push({ level: 'error', object: `commander:${c.era}`, message: 'unknown era' });
    for (const s of c.sources)
      if (!sourceIds.has(s))
        out.push({ level: 'error', object: `commander:${c.era}`, message: `unknown source "${s}"` });
  }
  return out;
}
