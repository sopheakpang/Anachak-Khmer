import type { GiftMap } from './schemas';

export interface CleanName {
  display: string;
  source: 'name' | 'handle' | 'fallback';
}

// Characters the game's fonts can draw: Khmer, basic Latin letters/digits, a few symbols.
const KHMER = '\\u1780-\\u17FF\\u19E0-\\u19FF\\u200C\\u200D';
const LATIN = 'A-Za-z0-9\\u00C0-\\u00FF';
// ZWNJ/ZWJ are allowed on their own on purpose (Khmer shaping), not as a joined sequence.
// eslint-disable-next-line no-misleading-character-class
const SAFE = new RegExp(`^[${KHMER}${LATIN} ._'\\-]+$`, 'u');
// Emoji, pictographs, variation selectors and control/format characters are removed before
// checking — except ZWNJ/ZWJ (U+200C/U+200D), which Khmer text needs for correct shaping.
// Built with `new RegExp` because the `v` flag (set subtraction) is newer than the TS target.
const STRIP = new RegExp(
  '[[\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\u{FE0F}\\u{20E3}\\p{Cc}\\p{Cf}]--[\\u200C\\u200D]]',
  'gv',
);

function stripUnsafe(s: string): string {
  return s.replace(STRIP, '').replace(/\s+/g, ' ').trim();
}

/** Cut to `max` user-visible characters without splitting a Khmer cluster. */
export function truncateGraphemes(s: string, max: number): string {
  const seg = new Intl.Segmenter('km', { granularity: 'grapheme' });
  const parts = [...seg.segment(s)].map((x) => x.segment);
  return parts.length <= max ? s : parts.slice(0, max - 1).join('') + '…';
}

export function parseBlocklist(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith('#'));
}

function isBlocked(s: string, blocklist: string[]): boolean {
  const flat = s.toLowerCase().replace(/[\s._'-]/g, '');
  return blocklist.some((w) => flat.includes(w.replace(/[\s._'-]/g, '')));
}

/**
 * Name shown and carved on stones (spec: Recognition, AC-06).
 * The game shows only Khmer and English, so a display name in another script (Thai,
 * Chinese…) or only emoji falls back to the viewer's @handle, then to "Builder".
 */
export function cleanName(
  name: string,
  handle: string | undefined,
  map: GiftMap,
  blocklist: string[],
  lang: 'km' | 'en' = 'km',
): CleanName {
  const fallback: CleanName = {
    display: lang === 'km' ? map.names.fallbackKm : map.names.fallbackEn,
    source: 'fallback',
  };
  const max = map.names.maxLength;
  const n = stripUnsafe(name);
  if (n && SAFE.test(n)) {
    return isBlocked(n, blocklist) ? fallback : { display: truncateGraphemes(n, max), source: 'name' };
  }
  const h = stripUnsafe(handle ?? '').replace(/^@/, '');
  if (h && SAFE.test(h) && !isBlocked(h, blocklist)) {
    return { display: truncateGraphemes('@' + h, max), source: 'handle' };
  }
  return fallback;
}
