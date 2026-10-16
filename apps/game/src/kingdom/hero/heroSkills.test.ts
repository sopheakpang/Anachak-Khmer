import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { HeroCore, NO_INPUT, kitFor, kitSkills, type HeroAct, type HeroInput } from './heroCore';
import { Keymap } from '../keymap';
import { SFX_NAMES, type SfxName } from '../view/sound';

/** PK 1.9.0 (D146 ខ៥ B, D150): four skills for fighters, two for workers; each its yantra, colour, sound. */

const data = loadKingdom();
const H = data.anachak.hero;
const open = { open: () => true };
const run = (c: HeroCore, input: Partial<HeroInput>, sec: number, dt = 1 / 30): HeroAct[] => {
  const acts: HeroAct[] = [];
  for (let t = 0; t < sec - 1e-9; t += dt) acts.push(...c.step(dt, { ...NO_INPUT, ...input }, open));
  return acts;
};

describe('hero skills (ខ៥ B)', () => {
  it('four skills for the king, soldiers, riders, the elephant, the commander and the hunter; two for villagers and the cart', () => {
    for (const k of H.kits) {
      const n = kitSkills(k).length;
      expect(n, k.id).toBe(k.id === 'worker' || k.id === 'cart' ? 2 : 4);
    }
  });

  it('every skill is named in Khmer and English, has its yantra, a #rrggbb colour and a known sound; ids are unique', () => {
    const ids = new Set<string>();
    for (const k of H.kits)
      for (const S of kitSkills(k)) {
        expect(S.km.length && S.en.length).toBeTruthy();
        expect(ids.has(S.id), S.id).toBe(false);
        ids.add(S.id);
        if (S !== k.skill) {
          expect(['lotus', 'spiral', 'grid']).toContain(S.yantra);
          expect(S.color).toMatch(/^#[0-9a-f]{6}$/i);
          expect(SFX_NAMES).toContain(S.sound as SfxName);
        }
      }
  });

  it('the fourth skill is the great one: a long wait and a wide reach', () => {
    for (const k of H.kits) {
      const all = kitSkills(k);
      if (all.length < 4) continue;
      const big = all[3]!;
      expect(big.cd, k.id).toBeGreaterThanOrEqual(30);
      const fights = all.slice(0, 3).filter((s) => s.kind !== 'heal' && s.kind !== 'dog');
      expect(big.radius, k.id).toBeGreaterThanOrEqual(Math.max(...fights.map((s) => s.radius)));
    }
    expect(kitSkills(kitFor(H, 'king'))[3]!.kind).toBe('ultimate');
  });

  it('each slot plays its own skill and keeps its own cooldown', () => {
    const c = new HeroCore(H, kitFor(H, 'king'), 0, 0, 0);
    const a1 = run(c, { skill3: true }, 0.1);
    expect(c.state).toBe('skill');
    expect(c.skillSlot).toBe(2);
    expect(c.skillNow.id).toBe(kitSkills(c.kit)[2]!.id);
    const a2 = run(c, {}, 1);
    const acts = [...a1, ...a2].filter((a) => a.kind === 'skill');
    expect(acts).toEqual([{ kind: 'skill', slot: 2 }]);
    expect(c.skillLeft(2)).toBeGreaterThan(0);
    expect(c.skillLeft(0)).toBe(0);
    // Slot 1 is free while slot 3 cools down.
    run(c, { skill: true }, 0.1);
    expect(c.skillSlot).toBe(0);
  });

  it('keys: Action uses 1 2 3 for the others, MOBA uses Q W E R', () => {
    const k = new Keymap(data.controls, null);
    expect(k.action('hero', 'Digit1')).toBe('skill2');
    expect(k.action('hero', 'Digit3')).toBe('skill4');
    k.applyScheme('moba');
    expect(k.action('hero', 'KeyQ')).toBe('skill');
    expect(k.action('hero', 'KeyW')).toBe('skill2');
    expect(k.action('hero', 'KeyE')).toBe('skill3');
    expect(k.action('hero', 'KeyR')).toBe('skill4');
  });
});
