import { describe, expect, it } from 'vitest';
import fonts from '../../../config/fonts.json';
import { fontStack, fontWeight, missingInMainFont, stackCoverage, type FontsConfig } from './fonts';

const config = fonts as FontsConfig;

describe('font roles (spec: Screen layout)', () => {
  it('uses Moulpali and Kantumruy Pro, and Bokor only for the developer credit (PK)', () => {
    expect(Object.keys(config.families).sort()).toEqual(['Bokor', 'Kantumruy Pro', 'Moulpali']);
    expect(
      Object.entries(config.roles)
        .filter(([, f]) => f === 'Bokor')
        .map(([r]) => r),
    ).toEqual(['credit']);
    expect(config.roles).toMatchObject({
      title: 'Moulpali',
      bigMoment: 'Moulpali',
      names: 'Kantumruy Pro',
      small: 'Kantumruy Pro',
    });
  });

  it('shows viewer names in bold', () => {
    expect(fontWeight(config, 'names')).toBe(700);
    expect(fontWeight(config, 'small')).toBe(400);
  });

  it('every role can draw Khmer and English with bundled fonts', () => {
    for (const role of Object.keys(config.roles)) {
      expect([...stackCoverage(config, role)].sort()).toEqual(['khmer', 'latin']);
    }
  });

  it('each role font has its own Khmer and English letters (no fallback needed)', () => {
    for (const role of Object.keys(config.roles)) expect(missingInMainFont(config, role)).toEqual([]);
  });

  it('builds a CSS stack without duplicates', () => {
    expect(fontStack(config, 'small')).toBe('"Kantumruy Pro", sans-serif');
    expect(fontStack(config, 'title')).toBe('"Moulpali", "Kantumruy Pro", sans-serif');
  });

  it('rejects unknown roles', () => {
    expect(() => fontStack(config, 'nope')).toThrow();
  });
});
