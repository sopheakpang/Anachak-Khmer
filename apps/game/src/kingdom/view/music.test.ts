import { describe, expect, it, vi } from 'vitest';
import { loadMusic, parseMusic } from '@temples/shared';
import {
  Composer,
  KingdomMusic,
  MoodTracker,
  PhraseScheduler,
  TrackPicker,
  anyNear,
  chhingPattern,
  coreMelody,
  inScale,
  isTonic,
  mulberry32,
  musicSource,
  stepHz,
  stepSemitones,
  tempoAt,
  type MusicEvent,
  type MusicSink,
  type Phrase,
} from './music';

const cfg = loadMusic();
const PENTA = [0, 2, 4, 7, 9];

describe('scale and pitch helpers', () => {
  it('maps scale steps to semitones across octaves, below the tonic too', () => {
    expect([0, 1, 2, 3, 4].map((s) => stepSemitones(s, PENTA))).toEqual([0, 2, 4, 7, 9]);
    expect(stepSemitones(5, PENTA)).toBe(12);
    expect(stepSemitones(8, PENTA)).toBe(19);
    expect(stepSemitones(-1, PENTA)).toBe(-3); // A below
    expect(stepSemitones(-5, PENTA)).toBe(-12);
  });

  it('gives frequencies from the tonic (C4 → C D E G A)', () => {
    expect(stepHz(0, PENTA, 261.63)).toBeCloseTo(261.63, 2);
    expect(stepHz(3, PENTA, 261.63)).toBeCloseTo(392.0, 0);
    expect(stepHz(5, PENTA, 261.63)).toBeCloseTo(523.26, 1);
  });

  it('knows scale notes and tonics in any octave', () => {
    expect(inScale(7, PENTA)).toBe(true);
    expect(inScale(5, PENTA)).toBe(false); // F is not in C D E G A
    expect(inScale(-3, PENTA)).toBe(true);
    expect(isTonic(10, PENTA)).toBe(true);
    expect(isTonic(-5, PENTA)).toBe(true);
    expect(isTonic(3, PENTA)).toBe(false);
  });

  it('the tempo rises slow → fast across a piece', () => {
    expect(tempoAt([60, 90], 0, 6)).toBe(60);
    expect(tempoAt([60, 90], 5, 6)).toBe(90);
    const t = [0, 1, 2, 3, 4, 5].map((i) => tempoAt([60, 90], i, 6));
    expect([...t].sort((a, b) => a - b)).toEqual(t);
    expect(tempoAt([60, 90], 0, 1)).toBe(60);
  });
});

/** Phrases from a composer. */
function phrases(seed: number, mood: 'calm' | 'tense', n: number, c = cfg): Phrase[] {
  const comp = new Composer(c, seed);
  return Array.from({ length: n }, () => comp.next(mood));
}

describe('phrase generator', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(phrases(42, 'calm', 8)).toEqual(phrases(42, 'calm', 8));
    expect(phrases(42, 'calm', 4)).not.toEqual(phrases(43, 'calm', 4));
  });

  it('core melodies fill their beats and end on a held tonic, approached by a neighbour', () => {
    for (let seed = 1; seed < 200; seed++) {
      const rng = mulberry32(seed);
      for (const beats of [8, 12, 16]) {
        const m = coreMelody(rng, beats);
        const last = m[m.length - 1]!;
        expect(isTonic(last.step, PENTA)).toBe(true);
        expect(last.beat + last.dur).toBe(beats);
        expect(last.dur).toBe(2);
        expect(isTonic(m[m.length - 2]!.step, PENTA)).toBe(false);
        const total = m.reduce((s, c) => s + c.dur, 0);
        expect(total).toBe(beats);
      }
    }
  });

  it('every pitched note of every instrument is in the phrase scale, modal shifts included', () => {
    const c = parseMusic({ ...cfg, modalShift: 0.8, phrasesPerPiece: 1 });
    const seen = new Set<string>();
    for (const p of [...phrases(7, 'calm', 30, c), ...phrases(9, 'tense', 30, c)]) {
      seen.add(p.scaleId);
      for (const e of p.events)
        if (e.step !== undefined) expect(inScale(stepSemitones(e.step, p.scale), p.scale), e.inst).toBe(true);
      for (const n of p.core) expect(inScale(stepSemitones(n.step, p.scale), p.scale)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('every phrase cadences on the tonic (core, roneat and sralai)', () => {
    for (const p of [...phrases(3, 'calm', 20), ...phrases(4, 'tense', 20)]) {
      expect(isTonic(p.core[p.core.length - 1]!.step, p.scale)).toBe(true);
      for (const inst of ['roneatEk', 'sralai'] as const) {
        const notes = p.events.filter((e) => e.inst === inst);
        expect(isTonic(notes[notes.length - 1]!.step!, p.scale), inst).toBe(true);
      }
      // Events stay inside the phrase and are sorted.
      expect(p.events.every((e) => e.beat >= 0 && e.beat < p.beats)).toBe(true);
      expect(p.events.map((e) => e.beat)).toEqual([...p.events.map((e) => e.beat)].sort((a, b) => a - b));
    }
  });

  it('phrases of a piece are variations of one core melody (same length and cadence)', () => {
    const ps = phrases(11, 'calm', cfg.phrasesPerPiece);
    const first = ps[0]!.core;
    for (const p of ps) {
      expect(p.beats).toBe(ps[0]!.beats);
      expect(p.core.map((c) => c.beat)).toEqual(first.map((c) => c.beat));
      const differ = p.core.filter((c, i) => c.step !== first[i]!.step).length;
      expect(differ).toBeLessThanOrEqual(3);
    }
    // The tempo accelerates across the piece.
    expect(ps[ps.length - 1]!.tempo).toBeGreaterThan(ps[0]!.tempo);
  });

  it('tense is faster than calm and its chhing denser; calm has no big drum', () => {
    const calm = phrases(5, 'calm', 12);
    const tense = phrases(5, 'tense', 12);
    expect(Math.min(...tense.map((p) => p.tempo))).toBeGreaterThan(Math.max(...calm.map((p) => p.tempo)));
    const density = (ps: Phrase[]) =>
      ps.reduce((s, p) => s + p.events.filter((e) => e.inst === 'chhing').length, 0) /
      ps.reduce((s, p) => s + p.beats, 0);
    expect(density(tense)).toBeGreaterThan(density(calm));
    expect(calm.some((p) => p.events.some((e) => e.inst === 'skorThom'))).toBe(false);
    expect(tense.every((p) => p.events.some((e) => e.inst === 'skorThom'))).toBe(true);
    for (const p of [...calm, ...tense]) expect(p.tempo).toBeGreaterThanOrEqual(cfg.moods[p.mood].tempo[0]);
  });

  it('the chhing alternates open chhing and closed chhap', () => {
    const c = chhingPattern(4, 2);
    expect(c).toHaveLength(8);
    expect(c.map((e) => e.open)).toEqual([true, false, true, false, true, false, true, false]);
    expect(c.map((e) => e.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });
});

/** A fake audio clock: the sink records when each note would sound. */
function recorder(): MusicSink & { notes: Array<{ ev: MusicEvent; t: number; mood: string }> } {
  const notes: Array<{ ev: MusicEvent; t: number; mood: string }> = [];
  return { notes, play: (ev, t, _spb, p) => notes.push({ ev, t, mood: p.mood }) };
}

describe('look-ahead scheduler', () => {
  it('schedules only what is due within the look-ahead, in time order, phrase after phrase', () => {
    const sink = recorder();
    const s = new PhraseScheduler(new Composer(cfg, 1), sink, 0.4);
    s.reset(10);
    s.tick(10);
    expect(sink.notes.length).toBeGreaterThan(0);
    expect(sink.notes.every((n) => n.t >= 10 && n.t < 10.4)).toBe(true);
    for (let t = 10.1; t < 70; t += 0.1) s.tick(t);
    const times = sink.notes.map((n) => n.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[times.length - 1]!).toBeLessThan(70.4);
    // A minute of calm music has several phrases' worth of notes and no gap over two seconds.
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(Math.max(...gaps)).toBeLessThan(2);
  });

  it('does nothing until started and after stop', () => {
    const sink = recorder();
    const s = new PhraseScheduler(new Composer(cfg, 1), sink, 0.4);
    expect(s.tick(0)).toBe(0);
    s.reset(0);
    s.tick(1);
    s.stop();
    const n = sink.notes.length;
    expect(s.tick(2)).toBe(0);
    expect(sink.notes.length).toBe(n);
  });

  it('a mood change cuts the phrase at a beat and continues in the new mood', () => {
    const sink = recorder();
    const s = new PhraseScheduler(new Composer(cfg, 2), sink, 0.4);
    s.reset(0);
    for (let t = 0; t < 3; t += 0.1) s.tick(t);
    s.setMood('tense', 3);
    for (let t = 3; t < 10; t += 0.1) s.tick(t);
    const firstTense = sink.notes.find((n) => n.mood === 'tense')!;
    expect(firstTense).toBeDefined();
    expect(firstTense.t).toBeGreaterThanOrEqual(3.4 - 1e-9);
    // No calm note is sounded after the first tense one.
    expect(sink.notes.filter((n) => n.mood === 'calm' && n.t > firstTense.t)).toEqual([]);
  });

  it('after a stall it restarts instead of rushing through missed notes', () => {
    const sink = recorder();
    const s = new PhraseScheduler(new Composer(cfg, 3), sink, 0.4);
    s.reset(0);
    s.tick(0);
    s.tick(500);
    expect(sink.notes.every((n) => n.t < 0.4 || n.t >= 500 - 0.05)).toBe(true);
  });
});

describe('PK’s tracks and the fallback', () => {
  const tracks = ['a.mp3', 'b.mp3', 'c.ogg'].map((file) => ({ file, km: file, en: file }));

  it('plays every track once per round, shuffled, never the same twice in a row', () => {
    const p = new TrackPicker(tracks, mulberry32(9));
    const got = Array.from({ length: 30 }, () => p.next()!.file);
    for (let r = 0; r < 10; r++) expect(new Set(got.slice(r * 3, r * 3 + 3)).size).toBe(3);
    for (let i = 1; i < got.length; i++) expect(got[i]).not.toBe(got[i - 1]);
  });

  it('skips files that failed; none left → generated music', () => {
    const p = new TrackPicker(tracks, mulberry32(1));
    expect(musicSource(p, true)).toBe('tracks');
    p.fail('a.mp3');
    p.fail('b.mp3');
    expect(Array.from({ length: 4 }, () => p.next()!.file)).toEqual(['c.ogg', 'c.ogg', 'c.ogg', 'c.ogg']);
    p.fail('c.ogg');
    expect(p.next()).toBeNull();
    expect(musicSource(p, true)).toBe('generated');
  });

  it('no tracks listed, or tracks not allowed (phone): generated music', () => {
    expect(musicSource(new TrackPicker([]), true)).toBe('generated');
    expect(musicSource(new TrackPicker(tracks), false)).toBe('generated');
    expect(new KingdomMusic(cfg).playing).toBe(cfg.tracks.length ? 'tracks' : 'generated');
    const withTracks = parseMusic({ ...cfg, tracks });
    expect(new KingdomMusic(withTracks).playing).toBe('tracks');
    expect(new KingdomMusic(withTracks, { mobile: true }).playing).toBe('generated');
  });
});

describe('mood rule', () => {
  const rules = cfg.moodRules;

  it('tense from 30 s before a raid until no enemy is near, then calm after a pause', () => {
    const m = new MoodTracker(rules);
    expect(m.update(0, { secondsToRaid: 120, raidsWaiting: false, enemyNear: false })).toBe('calm');
    expect(m.update(1, { secondsToRaid: 30, raidsWaiting: false, enemyNear: false })).toBe('tense');
    // The raid comes; the next one is far off but enemies are at the buildings.
    expect(m.update(40, { secondsToRaid: 240, raidsWaiting: false, enemyNear: true })).toBe('tense');
    // Enemies gone: still tense for a moment, then calm.
    expect(m.update(41, { secondsToRaid: 239, raidsWaiting: false, enemyNear: false })).toBe('tense');
    expect(
      m.update(40 + rules.calmAfterSec, { secondsToRaid: 230, raidsWaiting: false, enemyNear: false }),
    ).toBe('calm');
  });

  it('no countdown tension while raids wait for a war camp', () => {
    const m = new MoodTracker(rules);
    expect(m.update(0, { secondsToRaid: 5, raidsWaiting: true, enemyNear: false })).toBe('calm');
  });

  it('anyNear measures distance to the buildings', () => {
    expect(anyNear([[0, 0]], [[30, 0]], 40)).toBe(true);
    expect(anyNear([[0, 0]], [[50, 0]], 40)).toBe(false);
    expect(anyNear([], [[0, 0]], 40)).toBe(false);
  });
});

describe('KingdomMusic without WebAudio (Node)', () => {
  it('keeps its settings and is silent without an AudioContext', () => {
    const m = new KingdomMusic(cfg, { seed: 1 });
    expect(m.volume).toBe(cfg.defaultVolume);
    expect(new KingdomMusic(cfg, { mobile: true }).volume).toBe(cfg.mobileVolume);
    m.setVolume(3);
    expect(m.volume).toBe(1);
    m.setOn(false);
    expect(m.enabled).toBe(false);
    m.setMood('tense');
    expect(m.mood).toBe('tense');
    const spy = vi.spyOn(globalThis, 'setInterval');
    m.setOn(true);
    m.play();
    m.stop();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
