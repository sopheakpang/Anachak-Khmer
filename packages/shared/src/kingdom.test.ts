import { describe, expect, it } from 'vitest';
import {
  AnimalKindSchema,
  VILLAGER_JOBS,
  eraContent,
  loadKingdom,
  validateCharacters,
  validateKingdom,
  type KingdomData,
} from './kingdom';

const data = loadKingdom();
const clone = (): KingdomData => JSON.parse(JSON.stringify(data)) as KingdomData;

describe('Khmer Kingdoms data (historical DNA)', () => {
  it('loads every kingdom file and passes historical validation with no errors', () => {
    const errors = validateKingdom(data).filter((w) => w.level === 'error');
    expect(errors).toEqual([]);
    expect(data.eras[0]!.id).toBe('roluos');
    expect(data.eras[0]!.ruler.en).toBe('Indravarman I');
    expect(data.rules.scenario.year).toBe(879);
  });

  it('marks the scenario as historically inspired; invented opponents are labelled fictional', () => {
    expect(data.rules.scenario.label).toBe('HISTORICALLY_INSPIRED_SCENARIO');
    expect(data.rules.scenario.note.en).toMatch(/gameplay/i);
    const chiefdom = data.campaign.opponents.find((o) => o.id === 'chiefdom')!;
    expect(chiefdom.confidence).toBe('FICTIONAL');
    expect(chiefdom.notes).toMatch(/invented/i);
  });

  it('the campaign follows the Build tab: every temple of temples.json, in order, at its map site', () => {
    const order = Object.values(data.temples).sort((a, b) => a.order - b.order);
    expect(data.campaign.chapters.map((c) => c.temple)).toEqual(order.map((t) => t.id));
    for (const c of data.campaign.chapters) expect(data.area.sites[c.temple], c.temple).toBeDefined();
    // Years only go forward; each chapter sits inside its era's years.
    const years = data.campaign.chapters.map((c) => c.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it('opponents follow history: Champa for the Bayon, Đại Việt for Angkor Wat; each explains itself', () => {
    const opp = (t: string) => data.campaign.chapters.find((c) => c.temple === t)!.opponent;
    expect(opp('bayon')).toBe('champa');
    expect(opp('angkor-wat')).toBe('daiviet');
    for (const o of data.campaign.opponents) expect(o.notes, o.id).toBeTruthy();
    expect(data.campaign.opponents.find((o) => o.id === 'daiviet')!.notes).toMatch(/abstraction/i);
  });

  it('later eras add content: noble houses in the Angkor Wat age, hospitals under Jayavarman VII', () => {
    expect(eraContent(data, 'roluos').buildings.has('nobleHouse')).toBe(false);
    expect(eraContent(data, 'suryavarman2').buildings.has('nobleHouse')).toBe(true);
    expect(eraContent(data, 'eleventh').techs.has('hospitals')).toBe(false);
    expect(eraContent(data, 'jayavarman7').techs.has('hospitals')).toBe(true);
    expect(eraContent(data, 'jayavarman7').buildings.has('house')).toBe(true); // earlier content stays
  });

  it('every non-confirmed object explains itself, and uncertain elephants sit behind a technology', () => {
    for (const x of [...Object.values(data.buildings), ...Object.values(data.units)])
      if (x.confidence !== 'HISTORICALLY_CONFIRMED') expect(x.notes, x.id).toBeTruthy();
    expect(data.units.warElephant!.confidence).toBe('HISTORICALLY_UNCERTAIN');
    expect(data.units.warElephant!.requires).toContain('elephantTraining');
  });

  it('catches anachronisms, missing sources and unexplained uncertainty', () => {
    const d = clone();
    d.buildings.barracks!.trains.push('crossbowCart'); // not defined, not in the era
    d.units.archer!.sources = ['madeUpBook'];
    d.units.spearman!.notes = '';
    d.rules.scenario.year = 1181; // Jayavarman VII, far outside Roluos
    d.campaign.chapters[1]!.year = 1150; // Bakong placed in the wrong century
    d.campaign.chapters[2]!.temple = 'bayon'; // out of order
    const msgs = validateKingdom(d).map((w) => `${w.object}: ${w.message}`);
    expect(msgs.some((m) => m.includes('year 1150 is outside roluos'))).toBe(true);
    expect(msgs.some((m) => m.includes('temples.json has "lolei" in this place'))).toBe(true);
    expect(msgs.some((m) => m.includes('crossbowCart'))).toBe(true);
    expect(msgs.some((m) => m.includes('unknown source "madeUpBook"'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('spearman') && m.includes('notes'))).toBe(true);
    expect(msgs.some((m) => m.includes('year 1181 is outside roluos'))).toBe(true);
  });
});

describe('historical characters and commanders (PK prompt set, D69, D71)', () => {
  it('every occupation has evidence, a readable tool and a real place in the game', () => {
    const w = validateCharacters(data);
    expect(w.filter((x) => x.level === 'error')).toEqual([]);
    expect(data.occupations.length).toBeGreaterThanOrEqual(40);
    for (const j of VILLAGER_JOBS)
      expect(
        data.occupations.some((o) => o.inGame === `villager:${j}`),
        j,
      ).toBe(true);
    // Abstractions are flagged, not hidden.
    expect(w.some((x) => x.object === 'scout' && x.message.includes('GAMEPLAY_ABSTRACTION'))).toBe(true);
  });

  it('the validator catches invented sources, unknown units and child soldiers', () => {
    const d = clone();
    d.occupations[0]!.sources = ['madeUpBook'];
    d.occupations[1]!.inGame = 'unit:dragonRider';
    const child = d.occupations.find((o) => o.id === 'child')!;
    child.inGame = 'unit:spearman';
    const msgs = validateCharacters(d).map((x) => `${x.object}: ${x.message}`);
    expect(msgs.some((m) => m.includes('unknown source "madeUpBook"'))).toBe(true);
    expect(msgs.some((m) => m.includes('unknown unit "dragonRider"'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('child') && m.includes('never units'))).toBe(true);
  });

  it('commanders carry names from inscriptions for the eras that have them', () => {
    const c = (era: string) => data.rules.commanders.find((x) => x.era === era)!;
    expect(c('eleventh').names[0]!.en).toBe('Saṅgrāma');
    expect(c('jayavarman7').names.map((n) => n.en)).toContain('Śrīndrakumāra');
    expect(c('roluos').names).toEqual([]); // no named general known: title only
    expect(data.units.commander!.max).toBe(1);
    // New units belong to eras: horsemen only once the Angkor Wat reliefs show them.
    expect(eraContent(data, 'eleventh').units.has('horseman')).toBe(false);
    expect(eraContent(data, 'suryavarman2').units.has('horseman')).toBe(true);
    expect(eraContent(data, 'roluos').units.has('watchman')).toBe(true);
  });
});

describe("wild animals: Cambodia's forest wildlife (D75)", () => {
  const old = {
    id: 'tiger',
    km: 'ខ្លា',
    en: 'Tiger',
    count: 10,
    herd: [1, 1],
    habitat: 'forest',
    hp: 120,
    speed: 6,
    meat: 150,
    aggressive: true,
    attack: 9,
  };

  it('an old (D61) animal still parses; the new fields get defaults', () => {
    const k = AnimalKindSchema.parse(old);
    expect(k.behaviour).toBe('predator');
    expect(k).toMatchObject({ range: 7, leash: 40, huntable: true, nocturnal: false, sources: [] });
    expect(k.region).toBeUndefined();
    expect(AnimalKindSchema.parse({ ...old, aggressive: false }).behaviour).toBe('calm');
    expect(AnimalKindSchema.parse({ ...old, aggressive: undefined }).behaviour).toBe('calm');
  });

  it('parses the new fields: habitats, behaviour, protection, night, region, DNA', () => {
    const k = AnimalKindSchema.parse({
      ...old,
      aggressive: undefined,
      habitat: 'water',
      behaviour: 'defensive',
      range: 4,
      leash: 12,
      huntable: false,
      nocturnal: true,
      region: { x: [10, 20], z: [30, 40] },
      confidence: 'HISTORICALLY_UNCERTAIN',
      sources: ['pk-wildlife'],
      notes: 'check the Khmer name',
    });
    expect(k).toMatchObject({ habitat: 'water', behaviour: 'defensive', range: 4, huntable: false });
    expect(k).toMatchObject({ nocturnal: true, leash: 12, region: { x: [10, 20], z: [30, 40] } });
    for (const habitat of ['forest', 'grass', 'water', 'hill', 'canopy'])
      expect(AnimalKindSchema.safeParse({ ...old, habitat }).success, habitat).toBe(true);
    expect(AnimalKindSchema.safeParse({ ...old, habitat: 'sky' }).success).toBe(false);
    expect(AnimalKindSchema.safeParse({ ...old, behaviour: 'angry' }).success).toBe(false);
  });

  it('the world config validates; the validator catches duplicate kinds, bad sources and herds', () => {
    expect(data.world.animals.kinds.length).toBeGreaterThanOrEqual(26);
    const d = clone();
    const kinds = d.world.animals.kinds;
    kinds.push({ ...kinds[0]! });
    kinds[1]!.sources = ['madeUpBook'];
    kinds[2]!.confidence = 'HISTORICALLY_UNCERTAIN';
    kinds[2]!.notes = '';
    kinds[3]!.herd = [3, 1];
    const msgs = validateKingdom(d).map((w) => `${w.object}: ${w.message}`);
    expect(msgs).toContain(`${kinds[0]!.id}: duplicate animal kind`);
    expect(msgs).toContain(`animal:${kinds[1]!.id}: unknown source "madeUpBook"`);
    expect(msgs.some((m) => m.startsWith(`animal:${kinds[2]!.id}: HISTORICALLY_UNCERTAIN must`))).toBe(true);
    expect(msgs).toContain(`animal:${kinds[3]!.id}: herd must be [min, max] with min ≥ 1`);
  });
});
