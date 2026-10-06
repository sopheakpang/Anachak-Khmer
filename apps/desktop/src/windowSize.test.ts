import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { windowSize, landscapeSize, pickDisplay } = require('./windowSize.cjs') as {
  windowSize: (a: { width: number; height: number }, h: number | 'auto') => { width: number; height: number };
  landscapeSize: (a: { width: number; height: number }) => { width: number; height: number };
  pickDisplay: (d: Display[], primary: number, saved?: number) => Display;
};
type Display = { id: number; workArea: { width: number; height: number } };

describe('game window size', () => {
  it('fills a 1080p laptop screen height at 9:16', () => {
    expect(windowSize({ width: 1920, height: 1040 }, 'auto')).toEqual({ width: 585, height: 1040 });
  });
  it('fills a portrait monitor', () => {
    expect(windowSize({ width: 1080, height: 1880 }, 'auto')).toEqual({ width: 1058, height: 1880 });
  });
  it('respects a fixed height but never exceeds the screen', () => {
    expect(windowSize({ width: 1920, height: 1040 }, 960)).toEqual({ width: 540, height: 960 });
    expect(windowSize({ width: 1920, height: 1040 }, 1920)).toEqual({ width: 585, height: 1040 });
  });
  it('stays 9:16 on very narrow screens', () => {
    const s = windowSize({ width: 500, height: 1900 }, 'auto');
    expect(s.width).toBe(500);
    expect(s.width / s.height).toBeCloseTo(9 / 16, 2);
  });
});

describe('Kingdom window (16:9)', () => {
  it('fills the laptop screen width at 16:9', () => {
    expect(landscapeSize({ width: 1920, height: 1040 })).toEqual({ width: 1849, height: 1040 });
    expect(landscapeSize({ width: 1366, height: 728 })).toEqual({ width: 1294, height: 728 });
  });
  it('fits a portrait monitor by width', () => {
    const s = landscapeSize({ width: 1080, height: 1880 });
    expect(s).toEqual({ width: 1080, height: 608 });
  });
});

describe('display choice', () => {
  const laptop = { id: 1, workArea: { width: 1920, height: 1040 } };
  const portrait = { id: 2, workArea: { width: 1080, height: 1880 } };
  it('prefers the saved display', () => expect(pickDisplay([laptop, portrait], 1, 1)).toBe(laptop));
  it('else prefers a portrait monitor', () => expect(pickDisplay([laptop, portrait], 1)).toBe(portrait));
  it('else uses the primary', () => expect(pickDisplay([laptop], 1, 99)).toBe(laptop));
});
