import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanName, loadConfigs, parseBlocklist, truncateGraphemes } from './index';

const { giftMap: map } = loadConfigs();
const blocklist = parseBlocklist(
  readFileSync(new URL('../../../config/names-blocklist.txt', import.meta.url), 'utf8'),
);

describe('cleanName (AC-06)', () => {
  it('keeps Khmer names intact, including subscripts', () => {
    expect(cleanName('សុខា', 'sokha99', map, blocklist)).toEqual({ display: 'សុខា', source: 'name' });
    expect(cleanName('ស្រីមុំ', undefined, map, blocklist).display).toBe('ស្រីមុំ');
  });

  it('keeps English names', () => {
    expect(cleanName('Dara Chan', 'dara', map, blocklist)).toEqual({ display: 'Dara Chan', source: 'name' });
  });

  it('removes emoji but keeps the name', () => {
    expect(cleanName('Dara 🔥🙏', 'dara', map, blocklist)).toEqual({ display: 'Dara', source: 'name' });
    expect(cleanName('👑សុខា👑', 'sokha', map, blocklist).display).toBe('សុខា');
  });

  it('Thai or Chinese names fall back to the @handle (game shows Khmer + English only)', () => {
    expect(cleanName('สมชาย', 'somchai_bkk', map, blocklist)).toEqual({
      display: '@somchai_bkk',
      source: 'handle',
    });
    expect(cleanName('小明', 'xiaoming', map, blocklist)).toEqual({ display: '@xiaoming', source: 'handle' });
    expect(cleanName('Dara ใจดี', 'dara.k', map, blocklist).display).toBe('@dara.k');
  });

  it('emoji-only names fall back to the @handle', () => {
    expect(cleanName('🔥🔥🔥', 'firefan', map, blocklist).display).toBe('@firefan');
  });

  it('no usable name or handle → Builder / អ្នកសាងសង់', () => {
    expect(cleanName('🔥', undefined, map, blocklist)).toEqual({ display: 'អ្នកសាងសង់', source: 'fallback' });
    expect(cleanName('สมชาย', 'สมชาย', map, blocklist, 'en')).toEqual({
      display: 'Builder',
      source: 'fallback',
    });
  });

  it('blocklisted words are replaced, even with spacing tricks', () => {
    expect(cleanName('Shit Head', 'x', map, blocklist).source).toBe('fallback');
    expect(cleanName('s.h.i.t', 'x', map, blocklist).source).toBe('fallback');
    expect(cleanName('TikTok Official', 'x', map, blocklist).source).toBe('fallback');
  });

  it('a blocklisted handle is not used', () => {
    expect(cleanName('小明', 'porn_king', map, blocklist).source).toBe('fallback');
  });

  it('strips control characters and extra spaces', () => {
    expect(cleanName('  Dara\u0007   Chan  ', 'd', map, blocklist).display).toBe('Dara Chan');
  });

  it('keeps Khmer joiners that shaping needs', () => {
    expect(cleanName('ក​ខ', 'k', map, blocklist).display).toBe('កខ');
    expect(cleanName('ក‌ខ', 'k', map, blocklist).display).toBe('ក‌ខ');
  });

  it('long names are cut to 16 characters without breaking Khmer clusters', () => {
    const long = cleanName('Sokha The Great Builder Of Angkor', 'x', map, blocklist).display;
    expect([...new Intl.Segmenter('km', { granularity: 'grapheme' }).segment(long)]).toHaveLength(16);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('truncateGraphemes', () => {
  it('counts a Khmer consonant + subscript + vowel as one character', () => {
    // ស្ត្រី = one cluster sequence; must never be split mid-cluster
    const s = 'ស្ត្រីស្ត្រីស្ត្រី';
    const out = truncateGraphemes(s, 2);
    expect(out.endsWith('…')).toBe(true);
    expect(s.startsWith(out.slice(0, -1))).toBe(true);
  });
  it('leaves short text alone', () => {
    expect(truncateGraphemes('abc', 16)).toBe('abc');
  });
});

describe('blocklist file', () => {
  it('ignores comments and blank lines', () => {
    expect(parseBlocklist('# c\n\nWord\n  two  \n')).toEqual(['word', 'two']);
  });
});
