import { describe, expect, it } from 'vitest';
import { GUARDIANS, SKILL_VFX, YANTRA_KINDS, loadKingdom } from '@temples/shared';
import { kitSkills } from './heroCore';
import { fxWeaponFor, planSkillVfx, rainPoints, ringPoints, type VfxPiece } from './skillVfx';
import { TALL, artSize } from './yantraArt';

/** PK 1.9.0 (D151): yantra effects for every hero's skills, after PK's JX2 guide. */

const data = loadKingdom();
const H = data.anachak.hero;
const kit = (id: string) => H.kits.find((k) => k.id === id)!;

const plan = (kitId: string, skillId: string, from: [number, number] = [0, 0], to = from) => {
  const k = kit(kitId);
  const S = kitSkills(k).find((s) => s.id === skillId)!;
  return planSkillVfx({
    skill: S,
    guardian: k.guardian,
    weapon: fxWeaponFor(k.weapon, k.fxWeapon),
    color: 0xffd27a,
    from,
    to,
    heading: 0,
    lift: 0,
    area: [0, 6],
    cfg: H.vfx,
  });
};
const of = <T extends VfxPiece['t']>(ps: VfxPiece[], t: T) => ps.filter((p) => p.t === t) as Extract<VfxPiece, { t: T }>[];

describe('skill effects config', () => {
  it('every skill of every hero has at least one effect, all known', () => {
    for (const k of H.kits)
      for (const S of kitSkills(k)) {
        expect(S.vfx.length, `${k.id}.${S.id}`).toBeGreaterThan(0);
        for (const v of S.vfx) expect(SKILL_VFX).toContain(v);
        if (S.yantra) expect(YANTRA_KINDS).toContain(S.yantra);
      }
  });

  it('each fighting hero has a guardian; a spirit effect only where there is one', () => {
    for (const id of ['king', 'spear', 'sword', 'bow', 'rider', 'elephant', 'hunter'])
      expect(GUARDIANS).toContain(kit(id).guardian);
    expect(kit('king').guardian).toBe('naga');
    for (const k of H.kits)
      for (const S of kitSkills(k)) if (S.vfx.includes('spirit')) expect(k.guardian, `${k.id}.${S.id}`).toBeDefined();
  });

  it('every great skill shows at least two effects', () => {
    for (const k of H.kits)
      for (const S of kitSkills(k)) if (S.kind === 'ultimate') expect(S.vfx.length, S.id).toBeGreaterThanOrEqual(2);
  });

  it('weapons: bow shoots arrows, spear and lance spears, the rest swords', () => {
    expect(fxWeaponFor('bow')).toBe('arrow');
    expect(fxWeaponFor('lance')).toBe('spear');
    expect(fxWeaponFor('preahKhan')).toBe('sword');
    expect(fxWeaponFor('axe', 'spear')).toBe('spear');
  });
});

describe('planning the effects', () => {
  it('rain: weapons fall from above onto the place, a burst where each lands, within its radius', () => {
    const S = kitSkills(kit('king')).find((s) => s.id === 'devaraja')!;
    const ps = plan('king', 'devaraja');
    const swords = of(ps, 'sprite').filter((p) => p.art === 'weapon:sword');
    expect(swords).toHaveLength(H.vfx.rain);
    for (const p of swords) {
      expect(p.y).toBeGreaterThan(8);
      // It lands near the ground at the end of its fall.
      expect(p.y + p.vy * p.dur).toBeCloseTo(0.4, 5);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(S.radius + 1e-6);
    }
    expect(of(ps, 'burst').filter((b) => b.kind === 'gold')).toHaveLength(H.vfx.rain);
  });

  it('volley rain falls where the volley does', () => {
    const ps = plan('bow', 'skyOfArrows');
    const arrows = of(ps, 'sprite').filter((p) => p.art === 'weapon:arrow');
    expect(arrows.length).toBeGreaterThan(0);
    const mz = arrows.reduce((a, p) => a + p.z, 0) / arrows.length;
    expect(mz).toBeGreaterThan(3);
  });

  it('a dash: the streak runs from where he started to where he stopped; the guardian rushes on ahead', () => {
    const ps = plan('spear', 'lunge', [0, 0], [0, 3.6]);
    const [beam] = of(ps, 'beam');
    expect(beam!.from).toEqual([0, 0]);
    expect(beam!.to).toEqual([0, 3.6]);
    const spirit = of(ps, 'sprite').find((p) => p.art === 'emblem:garuda')!;
    expect(spirit.vz).toBeGreaterThan(0);
    expect(spirit.z + spirit.vz * spirit.dur).toBeGreaterThan(3.6);
  });

  it('round skills throw crescents all round; others a fan ahead', () => {
    const round = of(plan('sword', 'whirl'), 'sprite').filter((p) => p.art === 'crescent');
    expect(round).toHaveLength(H.vfx.waves);
    const dirs = round.map((p) => Math.atan2(p.vx, p.vz));
    expect(Math.max(...dirs) - Math.min(...dirs)).toBeGreaterThan(Math.PI);
    const fan = of(plan('king', 'khanStrike', [0, 0], [0, 2]), 'sprite').filter((p) => p.art === 'crescent');
    expect(fan).toHaveLength(3);
    for (const p of fan) expect(p.vz).toBeGreaterThan(0);
  });

  it('pillars of script stand in a ring round him, never on his spot', () => {
    const ps = of(plan('elephant', 'earthshaker'), 'pillar');
    expect(ps).toHaveLength(H.vfx.pillars);
    for (const p of ps) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(1.5);
  });

  it('respect: yantra art is never under his feet — guardians at or above head height', () => {
    for (const k of H.kits)
      for (const S of kitSkills(k)) {
        const ps = plan(k.id, S.id, [0, 0], [0, 1]);
        for (const p of of(ps, 'sprite'))
          if (p.art.startsWith('emblem:') || p.art.startsWith('yantra:')) {
            expect(p.y, `${k.id}.${S.id}`).toBeGreaterThanOrEqual(1.8);
            expect(p.vy).toBeGreaterThanOrEqual(0);
          }
      }
  });

  it('the budget: no skill plans more pieces than may live at once', () => {
    for (const k of H.kits)
      for (const S of kitSkills(k)) expect(plan(k.id, S.id).length, `${k.id}.${S.id}`).toBeLessThanOrEqual(H.vfx.maxLive / 2);
  });

  it('blessings: petals fall from above over the place', () => {
    const ps = of(plan('king', 'royalBlessing'), 'sprite').filter((p) => p.art === 'petal');
    expect(ps).toHaveLength(H.vfx.petals);
    for (const p of ps) {
      expect(p.vy).toBeLessThan(0);
      expect(p.y).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('helpers', () => {
  it('rainPoints spreads n points inside the disc; ringPoints on the circle', () => {
    const pts = rainPoints(5, 5, 4, 20);
    expect(pts).toHaveLength(20);
    for (const [x, z] of pts) expect(Math.hypot(x - 5, z - 5)).toBeLessThanOrEqual(4);
    for (const [x, z] of ringPoints(0, 0, 3, 8)) expect(Math.hypot(x, z)).toBeCloseTo(3, 6);
  });

  it('tall art is four times as high as wide', () => {
    expect(TALL.has('rows')).toBe(true);
    expect(artSize('weapon:sword', 512)).toEqual([128, 512]);
    expect(artSize('emblem:naga', 512)).toEqual([512, 512]);
  });
});
