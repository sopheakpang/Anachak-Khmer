import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim } from './sim';

/** PK 2026-10-19: the enemy is named by the chapter's era; an invented one says so. */

const data = loadKingdom();

describe('the enemy by era', () => {
  it('879–900: the rival chiefdom, labelled as invented (no war is recorded)', () => {
    const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
    expect(s.chapterData.year).toBe(879);
    expect(s.foe.km).toBe('មេកន្ទ្រាញ');
    expect(s.foe.invented).toBe(true);
    expect(s.foe.en).toMatch(/invented/);
  });

  it('every chapter names a real opponent of its era from the campaign', () => {
    const byYear = data.campaign.chapters.map((c) => [c.year, c.opponent] as const);
    for (const [year, opp] of byYear) {
      const o = data.campaign.opponents.find((x) => x.id === opp)!;
      expect(o, `${year}`).toBeTruthy();
      if (year >= 945 && year < 965) expect(opp).toBe('champa');
      if (year >= 1113 && year <= 1150) expect(opp).toBe('daiviet');
      if (year >= 1177) expect(opp).toBe('champa');
    }
    const champa = data.campaign.opponents.find((x) => x.id === 'champa')!;
    expect(champa.confidence).toBe('HISTORICALLY_CONFIRMED');
  });
});
