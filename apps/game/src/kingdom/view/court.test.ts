import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  brahminGeometry,
  CALM_COURT,
  COURT_LAYOUT,
  courtPose,
  kingGeometry,
  parasolBearerGeometry,
  queenGeometry,
} from './people';
import { LIMB } from '../../engine/figures';
import rulesJson from '../../../../../config/kingdom/rules.json';
import { keungHouseGeometry, rongHouseGeometry } from './houses';
import { royalHallGeometry } from './art';

const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;
const height = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!.max.y;
};
/** Does any vertex carry this colour (as part() writes it)? */
const hasColour = (g: THREE.BufferGeometry, hex: number) => {
  const c = new THREE.Color(hex);
  const a = g.getAttribute('color');
  for (let i = 0; i < a.count; i++)
    if (
      Math.abs(a.getX(i) - c.r) < 1e-3 &&
      Math.abs(a.getY(i) - c.g) < 1e-3 &&
      Math.abs(a.getZ(i) - c.b) < 1e-3
    )
      return true;
  return false;
};

describe('the royal court at the hall (PK, D78)', () => {
  it('has a king, two queens, two Brahmins and parasol bearers', () => {
    const n = (r: string) => COURT_LAYOUT.filter((c) => c.role === r).length;
    expect(n('king')).toBe(1);
    expect(n('queen')).toBe(2);
    expect(n('brahmin')).toBe(2);
    expect(n('parasol')).toBe(2);
    // The king stands in front, the others behind or beside him.
    const king = COURT_LAYOUT.find((c) => c.role === 'king')!;
    for (const c of COURT_LAYOUT) expect(c.at[2]).toBeLessThanOrEqual(king.at[2]);
  });

  it('the king changes with the era: a taller tiered crown under Suryavarman II, none under Jayavarman VII', () => {
    const early = height(kingGeometry('early'));
    const aw = height(kingGeometry('angkorWat'));
    const bayon = height(kingGeometry('bayon'));
    expect(aw).toBeGreaterThan(early - 0.05);
    expect(bayon).toBeLessThan(early);
  });

  it('every figure stays inside the crowd budget', () => {
    for (const era of ['early', 'baphuon', 'angkorWat', 'bayon'] as const) {
      expect(tris(kingGeometry(era))).toBeLessThan(6000);
      expect(tris(queenGeometry(era))).toBeLessThan(6000);
    }
    expect(tris(brahminGeometry())).toBeLessThan(6000);
    expect(tris(parasolBearerGeometry())).toBeLessThan(6000);
  });
});

describe('an active king (PK: he moves, and blesses the city when it grows)', () => {
  it('his pointing arm swings from the shoulder (limb data on the right side)', () => {
    const g = kingGeometry('early');
    const limb = g.getAttribute('limb');
    let right = 0;
    for (let i = 0; i < limb.count; i++)
      if (Math.round(limb.getZ(i)) === LIMB.arm && limb.getX(i) > 0) right++;
    expect(right).toBeGreaterThan(30);
  });

  it('looks over his city and gestures his orders when calm', () => {
    const hs = [0, 5, 10, 15].map((t) => courtPose('king', t, CALM_COURT).heading);
    expect(new Set(hs.map((h) => h.toFixed(2))).size).toBeGreaterThan(2);
    const p = courtPose('king', 3, CALM_COURT);
    expect(p.arm).toBeGreaterThan(0);
    expect(p.armSync).toBe(0);
  });

  it('turns to where the last order went, then looks around again', () => {
    const mood = { blessUntil: -1, lookUntil: 10, lookHeading: 1.2 };
    expect(courtPose('king', 9, mood).heading).toBe(1.2);
    expect(courtPose('king', 11, mood).heading).not.toBe(1.2);
  });

  it('blesses with both arms raised and a happy bounce; the Brahmins bless with him', () => {
    const mood = { blessUntil: 20, lookUntil: -1, lookHeading: 0 };
    const k = courtPose('king', 10.1, mood);
    expect(k.armSync).toBe(1);
    expect(k.arm).toBeGreaterThan(1);
    expect(k.lift).toBeGreaterThan(0);
    expect(courtPose('brahmin', 10, mood).armSync).toBe(1);
    expect(courtPose('queen', 10, mood).arm).toBe(0);
    expect(courtPose('brahmin', 21, mood).armSync).toBe(0);
  });

  it('the blessing rules are in the config', () => {
    expect(rulesJson.court.blessSec).toBeGreaterThan(0);
    expect(rulesJson.court.milestone).toBeGreaterThan(0);
  });
});

describe('roofs by rank (Zhou Daguan; PK research, D78)', () => {
  it('commoners thatch, officials yellow clay tiles, the palace lead and yellow tiles', () => {
    const rong = rongHouseGeometry();
    expect(hasColour(rong, 0xc4a058)).toBe(true); // thatch
    expect(hasColour(keungHouseGeometry(), 0xd2a03c)).toBe(true); // yellow clay tile
    const hall = royalHallGeometry();
    expect(hasColour(hall, 0x8d9396)).toBe(true); // lead
    expect(hasColour(hall, 0xd2a03c)).toBe(true);
  });
});
