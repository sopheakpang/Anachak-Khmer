import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';
import { restore, serialize } from './save';

const data = loadKingdom();
const C = data.rules.calendar;
const calm = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};

describe('the running calendar (PK: a timeline with the temple age)', () => {
  it('starts at the chapter year and moves on one year per secPerYear', () => {
    const s = calm();
    const y0 = data.campaign.chapters[0]!.year;
    expect(s.year).toBe(y0);
    s.time = C.secPerYear * 1.5;
    expect(s.year).toBe(y0 + 1);
  });

  it('never reaches the next temple year before this temple is finished', () => {
    const s = calm();
    s.time = C.secPerYear * 10_000;
    expect(s.year).toBe(data.campaign.chapters[1]!.year - 1);
  });

  it('is kept in saves', () => {
    const s = calm();
    s.time = 500;
    s.chapterStart = 260;
    const back = restore(data, JSON.parse(JSON.stringify(serialize(s))));
    expect(back.chapterStart).toBe(260);
    expect(back.year).toBe(s.year);
  });

  it('offers speeds from config, 1x first', () => {
    expect(data.rules.speed.options[0]).toBe(1);
    expect(data.rules.speed.options.every((v, i, a) => i === 0 || v > a[i - 1]!)).toBe(true);
  });
});

describe('find what is short (PK: a button to seek the scarcest resource)', () => {
  it('sends an idle villager to an unreported source when there is no watchman', () => {
    const s = calm();
    const go = s.scoutFor('gold');
    expect(go).not.toBeNull();
    expect(go!.units).toBe(1);
    const node = s.nodes.get(go!.node)!;
    expect(node.kind).toBe('gold');
    const mover = [...s.units.values()].find((u) => u.team === PLAYER && u.task.kind === 'move');
    expect(mover).toBeDefined();
  });

  it('looks for fruit or fish when food is short, and reports nobody free', () => {
    const s = calm();
    const go = s.scoutFor('food');
    expect(['fruit', 'fish']).toContain(s.nodes.get(go!.node)!.kind);
    for (const u of s.units.values())
      if (u.team === PLAYER) u.task = { kind: 'build', building: -1 } as never;
    expect(s.scoutFor('stone')).toBeNull();
  });
});

describe('world events (PK: what happened in the world in those years)', () => {
  it('are sorted, bilingual and inside the Angkor age bar', () => {
    const ev = data.worldEvents;
    expect(ev.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < ev.length; i++) expect(ev[i]!.year).toBeGreaterThanOrEqual(ev[i - 1]!.year);
    for (const w of ev) {
      expect(w.km.length).toBeGreaterThan(3);
      expect(w.en.length).toBeGreaterThan(3);
      expect(w.year).toBeGreaterThanOrEqual(800);
      expect(w.year).toBeLessThanOrEqual(1220);
    }
    expect(ev.some((w) => w.khmer)).toBe(true);
    expect(ev.some((w) => !w.khmer)).toBe(true);
  });
});
