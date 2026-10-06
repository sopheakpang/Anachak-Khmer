import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/sim';
import { KingdomSound, SFX_NAMES, SfxLimiter, panFor, sfxForEvent, type SfxName } from './sound';

describe('KingdomSound without WebAudio', () => {
  it('is a silent no-op in Node', () => {
    expect(typeof AudioContext).toBe('undefined');
    const s = new KingdomSound();
    expect(KingdomSound.supported).toBe(false);
    expect(() => {
      s.unlock();
      for (const n of SFX_NAMES) s.play(n, { pan: 0.5, gain: 0.8 });
      s.setAmbience({ rain: 1, wind: 0.5, birds: 1 });
      s.setVolume(2);
      s.setEnabled(false);
    }).not.toThrow();
    expect(s.enabled).toBe(false);
  });
});

describe('sfxForEvent', () => {
  // Keyed by every SimEvent kind, so a new event kind fails typecheck until it is mapped here.
  const cases: Record<SimEvent['kind'], Array<[Record<string, unknown>, SfxName | null]>> = {
    shot: [[{}, 'arrow']],
    hit: [[{}, 'hit']],
    felled: [[{}, 'hit']],
    death: [[{}, 'death']],
    destroyed: [[{}, 'death']],
    built: [[{}, 'complete']],
    moved: [[{}, 'complete']],
    trained: [[{}, 'train']],
    researched: [[{}, 'discover']],
    raid: [[{}, 'raid']],
    chapter: [[{}, 'complete']],
    discovered: [[{}, 'discover']],
    ceremony: [[{ id: 'devaraja' }, 'discover']],
    decree: [
      [{ what: 'begun' }, 'discover'],
      [{ what: 'founded' }, 'complete'],
      [{ what: 'ended' }, null],
    ],
    order: [
      [{ what: 'filled' }, 'complete'],
      [{ what: 'boat' }, 'discover'],
      [{ what: 'sailed' }, null],
    ],
    found: [[{ what: 'stone' }, 'dog']],
    levy: [[{ unit: 'spearman', n: 5 }, 'train']],
    battle: [[{ to: null, n: 3 }, 'raid']],
    caravan: [[{ route: 'phimai' }, 'complete']],
    traded: [[{ give: 'food', get: 'wood' }, 'click']],
    alarm: [
      [{ danger: 'raid' }, 'raid'],
      [{ danger: 'animal' }, 'deny'],
    ],
    weather: [
      [{ weather: 'storm' }, 'thunder'],
      [{ weather: 'rain' }, null],
      [{ weather: 'windy' }, null],
    ],
    hunted: [[{ animal: 'deer' }, 'animal']],
    delivered: [
      [{ res: 'wood' }, 'chop'],
      [{ res: 'stone' }, 'mine'],
      [{ res: 'gold' }, 'mine'],
      [{ res: 'food' }, 'farm'],
    ],
    outcome: [
      [{ result: 'victory' }, 'complete'],
      [{ result: 'defeat' }, 'raid'],
    ],
  };
  for (const [kind, list] of Object.entries(cases))
    for (const [extra, want] of list)
      it(`${kind} ${JSON.stringify(extra)} → ${want}`, () => {
        expect(sfxForEvent({ kind, ...extra })).toBe(want);
      });

  it('unknown kinds are silent', () => {
    expect(sfxForEvent({ kind: 'nope' })).toBeNull();
  });
});

describe('SfxLimiter', () => {
  const cfg = { windowMs: 100, perWindow: { raid: 1 }, defaultPerWindow: 2, maxVoices: 4 };

  it('caps starts of one effect per window', () => {
    const l = new SfxLimiter(cfg);
    expect(l.allow('chop', 0, 0.01)).toBe(true);
    expect(l.allow('chop', 0.02, 0.01)).toBe(true);
    expect(l.allow('chop', 0.05, 0.01)).toBe(false);
    expect(l.allow('hit', 0.05, 0.01)).toBe(true); // other effects are independent
    expect(l.allow('chop', 0.101, 0.01)).toBe(true); // the first start left the window
    expect(l.allow('raid', 1, 0.01)).toBe(true);
    expect(l.allow('raid', 1.05, 0.01)).toBe(false);
    expect(l.allow('raid', 1.2, 0.01)).toBe(true);
  });

  it('caps voices sounding at once', () => {
    const l = new SfxLimiter(cfg);
    const names = ['a', 'b', 'c', 'd', 'e'];
    expect(names.map((n) => l.allow(n, 0, 1))).toEqual([true, true, true, true, false]);
    expect(l.voices(0.5)).toBe(4);
    expect(l.voices(1.1)).toBe(0);
    expect(l.allow('e', 1.1, 1)).toBe(true);
  });
});

describe('panFor', () => {
  it('pans by screen side and clamps', () => {
    expect(panFor(0, 0)).toBe(0);
    expect(panFor(30, 0)).toBeCloseTo(0.5);
    expect(panFor(-500, 0)).toBe(-0.8);
  });
});

describe('KingdomSound music controls (D76)', () => {
  it('exposes music on/off, volume and mood; the phone starts quieter', () => {
    const s = new KingdomSound();
    const phone = new KingdomSound({ mobile: true });
    expect(phone.musicVolume).toBeLessThan(s.musicVolume);
    expect(s.musicOn).toBe(true);
    s.setMusicOn(false);
    expect(s.musicOn).toBe(false);
    s.setMusicVolume(0.3);
    expect(s.musicVolume).toBe(0.3);
    s.setMood('tense');
    expect(s.music.mood).toBe('tense');
    // Without WebAudio these are safe no-ops.
    s.startMusic();
    s.setEnabled(false);
    s.stopMusic();
  });
});
