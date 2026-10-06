import { describe, expect, it } from 'vitest';
import credits from '../../../config/credits.json';

describe('About card text (PK 1.7.0)', () => {
  it('says who made the game, why, and that it is still a prototype, in Khmer and English', () => {
    for (const p of [credits.about, credits.purpose, credits.status]) {
      expect(p.km.length).toBeGreaterThan(40);
      expect(p.en.length).toBeGreaterThan(40);
      expect(p.km).toMatch(/[ក-៿]/); // Khmer script
    }
    expect(credits.status.label.en).toBe('Prototype');
    expect(credits.status.km).toContain('កំណែសាកល្បង');
  });
});
