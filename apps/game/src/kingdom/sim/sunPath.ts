/**
 * The sun and the seasons of Anachak Khmer (PK 1.8.0: "a day light 30 minutes and night 30
 * minutes, make the sun ... the beautiful sunset and sunrise depending on the seasons").
 *
 * Pure (no three.js): the view turns these numbers into the light, the sky and the water.
 * Directions are in the map's frame: +x east, +z south, +y up.
 */
import type { KingdomData } from '@temples/shared';

export type NightCfg = KingdomData['anachak']['night'];
export type SunPathCfg = NonNullable<NightCfg['sunPath']>;

const TAU = Math.PI * 2;
const OBLIQUITY = 23.44;
const frac = (x: number) => ((x % 1) + 1) % 1;
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** The month (0 = January .. 11, with its fraction) on the season calendar at sim time t. */
export function monthAt(t: number, N: Pick<NightCfg, 'daySec'>, P: Pick<SunPathCfg, 'yearDays' | 'startMonth'>): number {
  const days = t / N.daySec;
  return (((P.startMonth + (days / P.yearDays) * 12) % 12) + 12) % 12;
}

/** The sun's declination (degrees) in a month: +23.4 at the June solstice, -23.4 in December. */
export function declination(month: number): number {
  // The March equinox falls about 2.7 months into the year.
  return OBLIQUITY * Math.sin(((month - 2.7) / 12) * TAU);
}

/** How wet the season is (0 = the heart of the dry season, February; 1 = the wet, August). */
export function wetness(month: number): number {
  return 0.5 - 0.5 * Math.cos(((month - 1.5) / 12) * TAU);
}

/**
 * Dusk and dawn for today: the longer days of the wet season start earlier and end later,
 * the short days of December the other way (the middle of the day stays put).
 */
export function seasonalTwilight(
  t: number,
  N: Pick<NightCfg, 'daySec' | 'dusk' | 'dawn' | 'sunPath'>,
): { dusk: [number, number]; dawn: [number, number] } {
  const P = N.sunPath;
  if (!P) return { dusk: N.dusk, dawn: N.dawn };
  const half = (P.seasonShift * declination(monthAt(t, N, P))) / OBLIQUITY / 2;
  return {
    dusk: [N.dusk[0] + half, N.dusk[1] + half],
    dawn: [N.dawn[0] - half, N.dawn[1] - half],
  };
}

export interface SunState {
  /** Day fraction 0..1 (as the night uses). */
  p: number;
  /** 0 at sunrise .. 0.5 noon .. 1 at sunset; > 1 the sun is below the horizon (night). */
  dayPart: number;
  /** Where the sun really is (unit vector; below the horizon at night): the disc in the sky. */
  dir: [number, number, number];
  /** Where the sunlight comes from for shading (kept between lightElevation; unit vector). */
  light: [number, number, number];
  /** Warm sunrise or sunset light 0..1 (the sun near the horizon). */
  golden: number;
  /** True in the morning (the sunrise colours), false in the afternoon (sunset). */
  rising: boolean;
  month: number;
  /** 0 dry .. 1 wet (blends the two seasons' colours). */
  wet: number;
  /** The season now (the one whose months hold today). */
  season: SunPathCfg['seasons'][number];
  /** The sun's colour near the horizon today, and the sky's glow round it (hex). */
  sunColor: string;
  skyColor: string;
}

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixHex = (a: string, b: string, k: number): string => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i]! - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** The sun at sim time t. */
export function sunState(t: number, N: Pick<NightCfg, 'daySec' | 'dusk' | 'dawn' | 'sunPath'>): SunState | null {
  const P = N.sunPath;
  if (!P) return null;
  const p = frac(t / N.daySec);
  const { dusk, dawn } = seasonalTwilight(t, N);
  // Sunrise and sunset: the middles of dawn and dusk (the sun on the horizon).
  const rise = (dawn[0] + dawn[1]) / 2;
  const set = (dusk[0] + dusk[1]) / 2 + 1; // the next day's fraction past the dawn
  const dayLen = set - rise;
  const q = frac(p - rise); // 0 at sunrise
  // Half a turn of the sun's circle over the day, the other half under the land at night.
  const dayPart = q <= dayLen ? q / dayLen : 1 + (q - dayLen) / (1 - dayLen);
  const month = monthAt(t, N, P);
  // The sky's sphere at Angkor: hour angle H (0 at noon), declination, latitude. Sunrise is
  // where the sun's circle crosses the horizon (north of east in June, south of east in
  // December); the day maps onto the arc above the land, the night onto the arc below.
  const rad = Math.PI / 180;
  const phi = P.latitude * rad;
  const dec = declination(month) * rad;
  const h0 = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))));
  const H = dayPart <= 1 ? -h0 + dayPart * 2 * h0 : h0 + (dayPart - 1) * (2 * Math.PI - 2 * h0);
  const east = -Math.cos(dec) * Math.sin(H);
  const north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi);
  const up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(H) * Math.cos(phi);
  const dir: [number, number, number] = [east, up, -north];
  // The light for shading: the same compass bearing, its height kept in lightElevation.
  const elev = Math.asin(Math.max(-1, Math.min(1, dir[1])));
  const [lo, hi] = P.lightElevation.map((d) => (d * Math.PI) / 180) as [number, number];
  const le = Math.min(hi, Math.max(lo, elev));
  // Straight overhead the bearing is lost: light from the south then (+z).
  const flat = Math.hypot(dir[0], dir[2]);
  const [bx, bz] = flat > 1e-4 ? [dir[0] / flat, dir[2] / flat] : [0, 1];
  const light: [number, number, number] = [bx * Math.cos(le), Math.sin(le), bz * Math.cos(le)];
  // Golden light while the sun is low, fading out as it sinks below the horizon.
  const golden = (1 - smooth(0, P.golden, dir[1])) * smooth(-0.12, -0.01, dir[1]);
  const rising = dayPart < 0.5 || dayPart > 1.5;
  const wet = wetness(month);
  const m = Math.floor(month);
  const dry = P.seasons[0]!;
  const rain = P.seasons[1]!;
  const season = P.seasons.find((s) => s.months.includes(m)) ?? dry;
  const k = smooth(0.25, 0.75, wet);
  const sunColor = mixHex(rising ? dry.sunrise : dry.sunset, rising ? rain.sunrise : rain.sunset, k);
  const skyColor = mixHex(rising ? dry.skyRise : dry.skySet, rising ? rain.skyRise : rain.skySet, k);
  return { p, dayPart, dir, light, golden, rising, month, wet, season, sunColor, skyColor };
}
