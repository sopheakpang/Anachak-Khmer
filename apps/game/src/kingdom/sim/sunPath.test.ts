import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { declination, monthAt, seasonalTwilight, sunState, wetness } from './sunPath';
import { nightness } from './anachak';

const N = loadKingdom().anachak.night;
const P = N.sunPath!;
const day = N.daySec;

/** Minutes of daylight on the day that starts at sim time t0 (sun above the horizon). */
function daylight(t0: number): number {
  let up = 0;
  for (let i = 0; i < 3600; i++) if (sunState(t0 + (i / 3600) * day, N)!.dir[1] > 0) up++;
  return (up / 3600) * (day / 60);
}

describe('PK 1.8.0: 30 minutes of day, 30 of night, the sun and the seasons', () => {
  it('a day is an hour: about 30 minutes of daylight and 30 of night, by the season', () => {
    expect(day).toBe(3600);
    // March (the equinox): 30 minutes; June longer, December shorter (Angkor: ±¾ h in 24 h).
    const at = (month: number) => (((month - P.startMonth + 12) % 12) / 12) * P.yearDays * day;
    const march = daylight(at(2.7));
    const june = daylight(at(5.7));
    const dec = daylight(at(11.7));
    expect(march).toBeGreaterThan(29);
    expect(march).toBeLessThan(31);
    expect(june).toBeGreaterThan(march + 1);
    expect(dec).toBeLessThan(march - 1);
    expect(june).toBeLessThan(33);
    expect(dec).toBeGreaterThan(27);
    // The night (the darkness the game draws) matches: about half the hour dark.
    let dark = 0;
    for (let i = 0; i < 600; i++) dark += nightness(at(2.7) + (i / 600) * day, N);
    expect(dark / 600).toBeGreaterThan(0.4);
    expect(dark / 600).toBeLessThan(0.55);
  });

  it('the sun rises in the east, crosses over the south, sets in the west', () => {
    const rise = (N.dawn[0] + N.dawn[1]) / 2;
    const set = (N.dusk[0] + N.dusk[1]) / 2;
    const t = (p: number) => p * day;
    const morning = sunState(t(rise + 0.05), N)!;
    const noon = sunState(t(((rise + set + 1) / 2) % 1), N)!;
    const evening = sunState(t(set - 0.05), N)!;
    const midnight = sunState(t((rise + set) / 2), N)!;
    expect(morning.dir[0]).toBeGreaterThan(0.5); // east = +x
    expect(evening.dir[0]).toBeLessThan(-0.5); // west
    expect(noon.dir[1]).toBeGreaterThan(0.75); // high at noon
    expect(noon.dir[2]).toBeGreaterThan(0); // November: over the south (+z)
    expect(midnight.dir[1]).toBeLessThan(0); // under the land at night
    expect(morning.rising && !evening.rising).toBe(true);
    // The light for shading stays between lightElevation (no flat noon, no black sunrise).
    for (const s of [morning, noon, evening]) {
      const el = (Math.asin(s.light[1]) * 180) / Math.PI;
      expect(el).toBeGreaterThanOrEqual(P.lightElevation[0] - 0.01);
      expect(el).toBeLessThanOrEqual(P.lightElevation[1] + 0.01);
      expect(Math.hypot(...s.light)).toBeCloseTo(1, 5);
    }
  });

  it('sunrise and sunset glow gold; the noon sun does not', () => {
    const set = (N.dusk[0] + N.dusk[1]) / 2;
    const rise = (N.dawn[0] + N.dawn[1]) / 2;
    expect(sunState((set - 0.005) * day, N)!.golden).toBeGreaterThan(0.6);
    expect(sunState((((rise + set + 1) / 2) % 1) * day, N)!.golden).toBeLessThan(0.05);
    expect(sunState(((rise + set) / 2) * day, N)!.golden).toBe(0); // midnight
  });

  it('the seasons: dry from November to April, wet from May to October, colours blend between', () => {
    expect(monthAt(0, N, P)).toBe(P.startMonth);
    expect(declination(5.7)).toBeGreaterThan(23);
    expect(declination(11.7)).toBeLessThan(-23);
    expect(wetness(1.5)).toBeCloseTo(0);
    expect(wetness(7.5)).toBeCloseTo(1);
    const at = (month: number, p: number) => ((((month - P.startMonth + 12) % 12) / 12) * P.yearDays + p) * day;
    const set = (N.dusk[0] + N.dusk[1]) / 2 - 0.004;
    const dry = sunState(at(1, set), N)!;
    const wet = sunState(at(7, set), N)!;
    expect(dry.season.id).toBe('dry');
    expect(wet.season.id).toBe('wet');
    expect(dry.sunColor).not.toBe(wet.sunColor);
    // June: the sun sets north of west (−z); December: south of west (+z).
    expect(sunState(at(5.7, set), N)!.dir[2]).toBeLessThan(0);
    expect(sunState(at(11.7, set), N)!.dir[2]).toBeGreaterThan(0);
    // The wet season's longer days: dusk later, dawn earlier.
    const j = seasonalTwilight(at(5.7, 0), N);
    expect(j.dusk[0]).toBeGreaterThan(N.dusk[0]);
    expect(j.dawn[0]).toBeLessThan(N.dawn[0]);
    expect(j.dawn[1]).toBeLessThan(1);
  });
});
