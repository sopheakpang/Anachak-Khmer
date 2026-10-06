import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';
import { templeShortfall } from './decree';
import { ceremoniesFor, ceremonyBuff, currentCeremony } from './ceremony';
import { restore, serialize } from './save';

/** PK: the king's decree to build the temple, and royal ceremonies that build his power. */

const data = loadKingdom();
const quiet = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const villagers = (s: KingdomSim) =>
  [...s.units.values()].filter((u) => u.team === PLAYER && u.type === 'villager');

describe("the king's decree", () => {
  it('sets everyone to gather what the temple lacks', () => {
    const s = quiet();
    Object.assign(s.res[PLAYER], { food: 0, wood: 0, stone: 0, gold: 0 });
    for (const u of villagers(s)) u.task = { kind: 'idle' };
    s.setDecree(true);
    s.update(1.1);
    const short = templeShortfall(s);
    const tasks = villagers(s).map((u) => (u.task.kind === 'gather' ? u.task.res : u.task.kind));
    for (const r of Object.keys(short)) expect(tasks).toContain(r);
    expect(s.events.some((e) => e.kind === 'decree' && e.what === 'begun')).toBe(true);
  });

  it('lays the foundation when the store has enough, then sends builders', () => {
    const s = quiet();
    Object.assign(s.res[PLAYER], { food: 9999, wood: 9999, stone: 9999, gold: 9999 });
    s.setDecree(true);
    s.update(1.1);
    // The temple needs a storehouse first: the decree lays it out; finish it here.
    for (const b of s.buildings.values()) if (b.type === 'storehouse') b.progress = 1;
    s.update(5.5);
    const site = s.currentTemple();
    expect(site).toBeDefined();
    s.update(5.5);
    const builders = villagers(s).filter((u) => u.task.kind === 'build' && u.task.building === site!.id);
    expect(builders.length).toBeGreaterThan(0);
    expect(builders.length).toBeLessThanOrEqual(data.rules.decree.maxBuilders);
    expect(s.events.some((e) => e.kind === 'decree' && e.what === 'founded')).toBe(true);
  });

  it('leaves farmers on their fields, and ends when lifted', () => {
    const s = quiet();
    const field = [...s.buildings.values()].find((b) => b.type === 'riceField');
    const v = villagers(s)[0]!;
    if (field) s.cmdFarm([v.id], field.id);
    Object.assign(s.res[PLAYER], { food: 0, wood: 0, stone: 0, gold: 0 });
    s.setDecree(true);
    s.update(1.1);
    if (field) expect(v.task.kind === 'gather' && v.task.field).toBe(field.id);
    s.setDecree(false);
    expect(s.decree).toBeNull();
    expect(s.events.some((e) => e.kind === 'decree' && e.what === 'ended')).toBe(true);
  });
});

describe('royal ceremonies', () => {
  const C = data.rules.ceremonies;

  it('every ceremony is from the record: a note in Khmer and English and a confidence', () => {
    for (const c of C.list) {
      expect(c.note.km.length).toBeGreaterThan(10);
      expect(c.note.en.length).toBeGreaterThan(10);
      expect(['HISTORICALLY_CONFIRMED', 'HISTORICALLY_SUPPORTED']).toContain(c.confidence);
    }
    expect(C.sources).toContain('harris2007');
  });

  it('the bathing of Buddha images only under Jayavarman VII (Buddhist); devaraja in the early eras', () => {
    const s = quiet();
    expect(ceremoniesFor(s).map((c) => c.id)).not.toContain('buddhaWater');
    expect(ceremoniesFor(s).map((c) => c.id)).toContain('devaraja');
  });

  it('come by themselves, raise royal power and lift the work while they last', () => {
    const s = quiet();
    expect(ceremonyBuff(s, 'build')).toBe(1);
    s.update(C.firstSec + 1.5);
    const c = currentCeremony(s)!;
    expect(c).not.toBeNull();
    expect(s.prestige).toBe(c.prestige);
    expect(ceremonyBuff(s, 'build')).toBe(C.buff.build);
    expect(s.events.some((e) => e.kind === 'ceremony')).toBe(true);
    s.update(C.durSec + 1);
    expect(currentCeremony(s)).toBeNull();
    s.update(C.everySec);
    expect(s.ceremoniesHeld).toBe(2);
  });

  it('are kept in saves with the decree and royal power', () => {
    const s = quiet();
    s.update(C.firstSec + 1.5);
    s.setDecree(true);
    const back = restore(data, JSON.parse(JSON.stringify(serialize(s))));
    expect(back.prestige).toBe(s.prestige);
    expect(back.decree).toBe('temple');
    expect(back.ceremony).toEqual(s.ceremony);
    expect(back.ceremoniesHeld).toBe(1);
  });
});
