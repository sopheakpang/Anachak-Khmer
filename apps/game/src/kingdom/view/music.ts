import type { MusicConfig, MusicInstrument, MusicMoodName, MusicScale, MusicTrack } from '@temples/shared';

/**
 * Kingdom tab background music (D76). Original music, generated live in WebAudio, in the
 * manner of the Khmer pinpeat (tense: raids, battle) and mahori (calm: village day) ensembles.
 * No recording is copied or sampled; every note is composed here from a seeded generator.
 *
 * Instruments (all synthesised):
 * - roneat ek: bright wooden xylophone, the core melody an octave up, elaborated, with rolls;
 * - roneat thung: the low xylophone, syncopated off the beat;
 * - kong vong: the circle of bronze gongs, the core melody on strong beats (bell partials);
 * - sralai: quadruple-reed oboe, sustained and nasal, with slides, grace notes and vibrato;
 * - sampho / skor thom: hand drum and the big barrel drums (skor thom only when tense);
 * - chhing: small cymbals keeping time, open "chhing" and closed "chhap" in turn.
 *
 * Texture: heterophony (every melodic instrument plays its own variant of one core melody).
 * Form: a piece is a few phrases on one core melody (varied each time) and accelerates from
 * slow to fast; then a new piece starts slow, now and then in another pentatonic mode.
 * Every phrase cadences on the tonic.
 *
 * The pure parts (scale, generator, scheduler, track choice, mood rule) are tested in Node;
 * `KingdomMusic` is the thin WebAudio layer and is a no-op without an AudioContext.
 */

// ---------------------------------------------------------------- random

/** A small seeded generator (mulberry32): the same seed gives the same music. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;
}

// ---------------------------------------------------------------- pitch

/**
 * Semitones above the tonic of scale step `step` (0 = tonic, scale.length = tonic an octave
 * up, negative = below the tonic).
 */
export function stepSemitones(step: number, scale: readonly number[]): number {
  const n = scale.length;
  const oct = Math.floor(step / n);
  return oct * 12 + scale[step - oct * n]!;
}

/** Frequency of a scale step. */
export function stepHz(step: number, scale: readonly number[], tonicHz: number): number {
  return tonicHz * 2 ** (stepSemitones(step, scale) / 12);
}

/** Is this many semitones above the tonic a note of the scale (any octave)? */
export function inScale(semitones: number, scale: readonly number[]): boolean {
  return scale.includes(((semitones % 12) + 12) % 12);
}

/** Is this step a tonic (any octave)? */
export function isTonic(step: number, scale: readonly number[]): boolean {
  return ((step % scale.length) + scale.length) % scale.length === 0;
}

// ---------------------------------------------------------------- phrases

export interface CoreNote {
  /** Start, in beats from the phrase start. */
  beat: number;
  /** Length in beats. */
  dur: number;
  /** Scale step (0 = tonic). */
  step: number;
}

export interface MusicEvent {
  inst: MusicInstrument;
  beat: number;
  dur: number;
  /** Scale step for pitched instruments. */
  step?: number;
  /** 0..1 accent. */
  vel: number;
  /** Roneat: a tremolo roll over the note's length. */
  roll?: boolean;
  /** Chhing: open (true) or closed "chhap"; sampho: high slap (true) or low tone. */
  open?: boolean;
  /** Sralai: the step it slides in from. */
  from?: number;
  /** Sralai: a quick upper grace note first. */
  grace?: boolean;
}

export interface Phrase {
  mood: MusicMoodName;
  scaleId: string;
  scale: readonly number[];
  /** Beats per minute. */
  tempo: number;
  beats: number;
  core: CoreNote[];
  /** Every instrument's notes, sorted by beat. */
  events: MusicEvent[];
}

/** The tempo of phrase `i` of `n` in a piece: slow → fast, easing into the fast end. */
export function tempoAt(range: readonly [number, number], i: number, n: number): number {
  const k = n <= 1 ? 0 : Math.max(0, Math.min(1, i / (n - 1)));
  const eased = k * k * (3 - 2 * k);
  return range[0] + (range[1] - range[0]) * eased;
}

const LOW = -2;

/**
 * A core melody of `beats` beats on a pentatonic scale of `n` notes: mostly steps, a few leaps,
 * a half cadence on the fifth step (G) midway, and the last two beats a held tonic.
 */
export function coreMelody(rng: () => number, beats: number, n = 5): CoreNote[] {
  const high = n + 2;
  const out: CoreNote[] = [];
  let step = pick(rng, [0, 2, 3, n]);
  let beat = 0;
  const half = Math.floor(beats / 2);
  const end = beats - 2;
  while (beat < end) {
    // Mostly one note a beat; sometimes two quick ones, sometimes a held one.
    let dur = 1;
    const r = rng();
    if (r < 0.2 && beat + 2 <= end && beat !== half - 1) dur = 2;
    else if (r < 0.35) dur = 0.5;
    if (beat === half - 1) {
      step = 3; // half cadence
      dur = 1;
    }
    out.push({ beat, dur, step });
    if (dur === 0.5) {
      // The second of the pair: a neighbour.
      step = Math.max(LOW, Math.min(high, step + (rng() < 0.5 ? -1 : 1)));
      out.push({ beat: beat + 0.5, dur: 0.5, step });
    }
    beat += dur === 0.5 ? 1 : dur;
    const m = rng();
    const dir = rng() < 0.5 ? -1 : 1;
    const move = m < 0.55 ? 1 : m < 0.8 ? 2 : m < 0.9 ? 0 : 3;
    step = Math.max(LOW, Math.min(high, step + dir * move));
  }
  // Cadence: approach by step, then the tonic held to the end.
  const last = out[out.length - 1]?.step ?? 0;
  const tonic = Math.abs(last - n) < Math.abs(last) ? n : 0;
  // Arrive from a neighbour, not from the tonic itself.
  const prev = out[out.length - 1];
  if (prev && ((prev.step % n) + n) % n === 0) prev.step = tonic + 1;
  out.push({ beat: end, dur: beats - end, step: tonic });
  return out;
}

/** A variation of a core melody: one to three notes nudged by a step, the cadence kept. */
export function varyMelody(rng: () => number, core: readonly CoreNote[], n = 5): CoreNote[] {
  const out = core.map((c) => ({ ...c }));
  const free = out.length - 2;
  if (free <= 0) return out;
  const k = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < k; i++) {
    const c = out[Math.floor(rng() * free)]!;
    c.step = Math.max(LOW, Math.min(n + 2, c.step + (rng() < 0.5 ? -1 : 1)));
  }
  return out;
}

/** The chhing: `perBeat` strokes a beat, open "chhing" and closed "chhap" in turn. */
export function chhingPattern(beats: number, perBeat: number): MusicEvent[] {
  const out: MusicEvent[] = [];
  const total = beats * perBeat;
  for (let i = 0; i < total; i++)
    out.push({
      inst: 'chhing',
      beat: i / perBeat,
      dur: 1 / perBeat,
      open: i % 2 === 0,
      vel: i % 2 ? 0.7 : 1,
    });
  return out;
}

function noteAt(core: readonly CoreNote[], beat: number): CoreNote {
  let found = core[0]!;
  for (const c of core) if (c.beat <= beat + 1e-9) found = c;
  return found;
}

export interface MoodParams {
  chhingPerBeat: number;
  roneatDensity: number;
  rollChance: number;
  levels: Record<MusicInstrument, number>;
}

/** Every instrument's part for one phrase, built around `core` (heterophony). */
export function arrange(
  rng: () => number,
  core: readonly CoreNote[],
  beats: number,
  mood: MusicMoodName,
  p: MoodParams,
  n = 5,
): MusicEvent[] {
  const ev: MusicEvent[] = [];
  const L = p.levels;
  const lastIdx = core.length - 1;
  // Roneat ek: an octave up, each core note split into quick notes that wander to the next.
  if (L.roneatEk > 0)
    core.forEach((c, i) => {
      const next = core[i + 1]?.step ?? c.step;
      const hits = Math.max(1, Math.round(c.dur * p.roneatDensity));
      if (i === lastIdx || (c.dur >= 2 && rng() < p.rollChance)) {
        ev.push({ inst: 'roneatEk', beat: c.beat, dur: c.dur, step: c.step + n, vel: 0.8, roll: true });
        return;
      }
      for (let h = 0; h < hits; h++) {
        let s = c.step;
        if (h > 0) {
          const r = rng();
          s =
            r < 0.4
              ? c.step + Math.sign(next - c.step)
              : r < 0.7
                ? c.step + n
                : c.step + (rng() < 0.5 ? 1 : -1);
        }
        ev.push({
          inst: 'roneatEk',
          beat: c.beat + (h * c.dur) / hits,
          dur: c.dur / hits,
          step: s + n,
          vel: h === 0 ? 1 : 0.65,
        });
      }
    });
  // Roneat thung: low, off the beat, now and then silent.
  if (L.roneatThung > 0)
    for (let b = 0; b < beats - 1; b++) {
      if (rng() < 0.3) continue;
      ev.push({
        inst: 'roneatThung',
        beat: b + 0.5,
        dur: 0.5,
        step: noteAt(core, b + 0.5).step - n,
        vel: 0.8,
      });
    }
  // Kong vong: the core on strong beats (every beat when tense), an octave doubling at times.
  if (L.kongVong > 0) {
    const every = mood === 'tense' ? 1 : 2;
    for (let b = 0; b < beats; b += every) {
      const c = noteAt(core, b);
      ev.push({ inst: 'kongVong', beat: b, dur: every, step: c.step, vel: b === 0 ? 1 : 0.75 });
      if (rng() < 0.2) ev.push({ inst: 'kongVong', beat: b, dur: every, step: c.step + n, vel: 0.4 });
    }
  }
  // Sralai: the core, sustained; repeated notes tied; slides in from the last note, graces.
  if (L.sralai > 0) {
    let prev: number | undefined;
    for (let i = 0; i < core.length; i++) {
      const c = core[i]!;
      let dur = c.dur;
      while (core[i + 1] && core[i + 1]!.step === c.step) dur += core[++i]!.dur;
      ev.push({
        inst: 'sralai',
        beat: c.beat,
        dur,
        step: c.step,
        vel: 0.9,
        ...(prev !== undefined && prev !== c.step && rng() < 0.5 ? { from: prev } : {}),
        ...(dur >= 1 && rng() < 0.25 ? { grace: true } : {}),
      });
      prev = c.step;
    }
  }
  // Drums. Calm: a soft hand drum on the main beats. Tense: hand-drum patterns and skor thom.
  if (L.sampho > 0) {
    const bars = Math.ceil(beats / 4);
    const calmBar: Array<[number, boolean]> = [
      [0, false],
      [2, true],
    ];
    const tenseBars: Array<Array<[number, boolean]>> = [
      [
        [0, false],
        [1, true],
        [1.5, true],
        [2, false],
        [3, true],
      ],
      [
        [0, false],
        [0.5, true],
        [1.5, true],
        [2, false],
        [2.5, false],
        [3, true],
        [3.5, true],
      ],
    ];
    for (let bar = 0; bar < bars; bar++) {
      const pattern = mood === 'tense' ? pick(rng, tenseBars) : calmBar;
      for (const [o, open] of pattern) {
        const b = bar * 4 + o;
        if (b < beats) ev.push({ inst: 'sampho', beat: b, dur: 0.5, open, vel: o === 0 ? 1 : 0.7 });
      }
    }
  }
  if (L.skorThom > 0) {
    for (let b = 0; b < beats; b += 2)
      ev.push({ inst: 'skorThom', beat: b, dur: 1, vel: b % 4 === 0 ? 1 : 0.7 });
    // A fill into the cadence.
    ev.push({ inst: 'skorThom', beat: beats - 1, dur: 0.5, vel: 0.8 });
    ev.push({ inst: 'skorThom', beat: beats - 0.5, dur: 0.5, vel: 0.9 });
  }
  if (L.chhing > 0) ev.push(...chhingPattern(beats, p.chhingPerBeat));
  return ev.sort((a, b) => a.beat - b.beat);
}

/**
 * The composer: pieces of a few phrases, each a variation of the piece's core melody, the tempo
 * rising across the piece; a new piece may shift mode. Deterministic for a seed.
 */
export class Composer {
  private readonly rng: () => number;
  private scale: MusicScale;
  private core: CoreNote[] = [];
  private beats = 8;
  private index = 0;
  private mood: MusicMoodName | null = null;

  constructor(
    private readonly cfg: Pick<
      MusicConfig,
      'scales' | 'modalShift' | 'phraseBeats' | 'phrasesPerPiece' | 'moods'
    >,
    seed: number,
  ) {
    this.rng = mulberry32(seed);
    this.scale = cfg.scales[0]!;
  }

  /** Start a new piece with the next phrase (a mood change does this too). */
  newPiece(): void {
    this.core = [];
  }

  next(mood: MusicMoodName): Phrase {
    const rng = this.rng;
    if (mood !== this.mood) this.core = [];
    this.mood = mood;
    if (!this.core.length || this.index >= this.cfg.phrasesPerPiece) {
      const shift = this.cfg.scales.length > 1 && rng() < this.cfg.modalShift;
      this.scale = shift ? pick(rng, this.cfg.scales.slice(1)) : this.cfg.scales[0]!;
      this.beats = pick(rng, this.cfg.phraseBeats);
      this.core = coreMelody(rng, this.beats, this.scale.semitones.length);
      this.index = 0;
    }
    const m = this.cfg.moods[mood];
    const n = this.scale.semitones.length;
    const core = this.index === 0 ? this.core.map((c) => ({ ...c })) : varyMelody(rng, this.core, n);
    const base = tempoAt(m.tempo, this.index, this.cfg.phrasesPerPiece);
    const tempo = Math.max(m.tempo[0], Math.min(m.tempo[1], base * (1 + (rng() - 0.5) * 0.04)));
    this.index++;
    return {
      mood,
      scaleId: this.scale.id,
      scale: this.scale.semitones,
      tempo,
      beats: this.beats,
      core,
      events: arrange(rng, core, this.beats, mood, m, n),
    };
  }
}

// ---------------------------------------------------------------- scheduling

/** Where scheduled notes go (WebAudio in the game, a recorder in tests). */
export interface MusicSink {
  play(ev: MusicEvent, time: number, secPerBeat: number, phrase: Phrase): void;
}

/**
 * Look-ahead scheduler on the audio clock: each tick schedules the notes due before
 * `now + lookahead`, so a late timer never makes the music stumble and only a few notes
 * exist ahead of time.
 */
export class PhraseScheduler {
  mood: MusicMoodName = 'calm';
  private phrase: Phrase | null = null;
  private start = 0;
  private idx = 0;
  private running = false;

  constructor(
    private readonly composer: Pick<Composer, 'next' | 'newPiece'>,
    private readonly sink: MusicSink,
    private readonly lookahead: number,
  ) {}

  get current(): Phrase | null {
    return this.phrase;
  }

  /** Start (or restart) shortly after `now`. */
  reset(now: number): void {
    this.phrase = null;
    this.start = now + 0.1;
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.phrase = null;
  }

  /** Change mood: the current phrase stops at its next beat, the new mood starts there. */
  setMood(mood: MusicMoodName, now: number): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.composer.newPiece();
    if (!this.running) return;
    if (this.phrase) {
      const spb = 60 / this.phrase.tempo;
      const from = Math.max(now + this.lookahead, this.start);
      this.start += Math.ceil((from - this.start) / spb) * spb;
      this.phrase = null;
    }
  }

  /** Schedule what is due; returns how many notes were sent to the sink. */
  tick(now: number): number {
    if (!this.running) return 0;
    const horizon = now + this.lookahead;
    let sent = 0;
    // After a long stall (a hidden tab), start again instead of rushing to catch up.
    if (!this.phrase && this.start < now - 0.2) this.start = now + 0.05;
    for (let guard = 0; guard < 64; guard++) {
      if (!this.phrase) {
        if (this.start >= horizon) return sent;
        this.phrase = this.composer.next(this.mood);
        this.idx = 0;
      }
      const p = this.phrase;
      const spb = 60 / p.tempo;
      while (this.idx < p.events.length) {
        const ev = p.events[this.idx]!;
        const t = this.start + ev.beat * spb;
        if (t >= horizon) return sent;
        this.idx++;
        if (t < now - 0.05) continue; // too late to play well: skip it
        this.sink.play(ev, t, spb, p);
        sent++;
      }
      const end = this.start + p.beats * spb;
      this.phrase = null;
      this.start = end;
      if (end >= horizon) return sent;
    }
    return sent;
  }
}

// ---------------------------------------------------------------- PK's own tracks

/**
 * Shuffled play of PK's tracks: every track once per round in a random order (never the same
 * track twice in a row), skipping files that failed to load. `null` when none is left.
 */
export class TrackPicker {
  private order: MusicTrack[] = [];
  private readonly failed = new Set<string>();
  private last: string | null = null;

  constructor(
    private readonly tracks: readonly MusicTrack[],
    private readonly rng: () => number = Math.random,
  ) {}

  /** Any track that has not failed? (else: generated music) */
  get available(): boolean {
    return this.tracks.some((t) => !this.failed.has(t.file));
  }

  next(): MusicTrack | null {
    if (!this.available) return null;
    if (!this.order.length) {
      const pool = this.tracks.filter((t) => !this.failed.has(t.file));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      if (pool.length > 1 && pool[0]!.file === this.last) pool.push(pool.shift()!);
      this.order = pool;
    }
    const t = this.order.shift()!;
    this.last = t.file;
    return t;
  }

  /** A file could not be loaded: never pick it again. */
  fail(file: string): void {
    this.failed.add(file);
    this.order = this.order.filter((t) => t.file !== file);
  }
}

/** Which music plays: PK's tracks when any are listed and loadable, else the generated music. */
export function musicSource(picker: TrackPicker, allowTracks: boolean): 'tracks' | 'generated' {
  return allowTracks && picker.available ? 'tracks' : 'generated';
}

// ---------------------------------------------------------------- mood rule

/** Is any of `units` within `r` metres of any of `targets`? */
export function anyNear(
  units: Iterable<readonly [number, number]>,
  targets: ReadonlyArray<readonly [number, number]>,
  r: number,
): boolean {
  const r2 = r * r;
  for (const [ux, uz] of units)
    for (const [tx, tz] of targets) if ((ux - tx) ** 2 + (uz - tz) ** 2 <= r2) return true;
  return false;
}

/**
 * Calm or tense: tense from `raidWarnSec` before a raid (while raids can come at all) and while
 * enemies are near the player's buildings; calm again `calmAfterSec` after the last threat.
 */
export class MoodTracker {
  mood: MusicMoodName = 'calm';
  private lastThreat = -Infinity;

  constructor(private readonly rules: MusicConfig['moodRules']) {}

  /** `time` in seconds of real time (not sim time: a new game restarts that). */
  update(
    time: number,
    s: { secondsToRaid: number; raidsWaiting: boolean; enemyNear: boolean },
  ): MusicMoodName {
    const threat = s.enemyNear || (!s.raidsWaiting && s.secondsToRaid <= this.rules.raidWarnSec);
    if (threat) {
      this.lastThreat = time;
      this.mood = 'tense';
    } else if (time - this.lastThreat >= this.rules.calmAfterSec) this.mood = 'calm';
    return this.mood;
  }
}

// ---------------------------------------------------------------- WebAudio

type Ctx = AudioContext;

/** The instruments, synthesised into one bus per mood (few nodes per note, nothing long-lived). */
class MusicSynth implements MusicSink {
  constructor(
    private readonly ctx: Ctx,
    private readonly buses: Record<MusicMoodName, GainNode>,
    private readonly noiseBuf: AudioBuffer,
    private readonly cfg: MusicConfig,
  ) {}

  play(ev: MusicEvent, t: number, spb: number, p: Phrase): void {
    const level = this.cfg.moods[p.mood].levels[ev.inst] * ev.vel;
    if (level <= 0) return;
    const bus = this.buses[p.mood];
    const hz = (step: number) => stepHz(step, p.scale, this.cfg.tonicHz);
    try {
      switch (ev.inst) {
        case 'roneatEk': {
          const f = hz(ev.step ?? 0);
          if (ev.roll) {
            // Tremolo roll: quick even strokes for the note's length (capped).
            const gap = 0.075;
            const hits = Math.min(14, Math.max(2, Math.floor((ev.dur * spb) / gap)));
            for (let i = 0; i < hits; i++)
              this.bar(bus, f, t + i * gap, level * (i ? 0.55 : 0.9), 0.22, i === 0);
          } else this.bar(bus, f, t, level, 0.3, true);
          break;
        }
        case 'roneatThung':
          this.bar(bus, hz(ev.step ?? 0), t, level, 0.5, false, 2.8);
          break;
        case 'kongVong':
          this.gong(bus, hz(ev.step ?? 0), t, level);
          break;
        case 'sralai':
          this.reed(
            bus,
            hz(ev.step ?? 0),
            ev.from !== undefined ? hz(ev.from) : 0,
            t,
            ev.dur * spb,
            level,
            !!ev.grace,
            p.mood,
          );
          break;
        case 'sampho':
          if (ev.open) {
            this.thump(bus, 330, 250, t, 0.12, level * 0.7);
            this.hiss(bus, 'bandpass', 1800, t, 0.04, level * 0.5);
          } else this.thump(bus, 120, 72, t, 0.25, level);
          break;
        case 'skorThom':
          this.thump(bus, 78, 46, t, 0.6, level);
          this.hiss(bus, 'lowpass', 320, t, 0.08, level * 0.4);
          break;
        case 'chhing':
          if (ev.open) {
            this.hiss(bus, 'highpass', 6000, t, 0.45, level * 0.5);
            this.sine(bus, 3760, t, 0.4, level * 0.35, 0.002);
            this.sine(bus, 5650, t, 0.3, level * 0.2, 0.002);
          } else {
            this.hiss(bus, 'bandpass', 4200, t, 0.05, level * 0.6);
            this.sine(bus, 3760, t, 0.045, level * 0.25, 0.001);
          }
          break;
      }
    } catch {
      /* A browser without some node type: stay silent. */
    }
  }

  private env(bus: AudioNode, t: number, dur: number, peak: number, attack: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    g.connect(bus);
    return g;
  }

  private sine(bus: AudioNode, f: number, t: number, dur: number, peak: number, attack = 0.003): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = f;
    const g = this.env(bus, t, dur, peak, attack);
    o.connect(g);
    o.onended = () => g.disconnect();
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(
    bus: AudioNode,
    type: BiquadFilterType,
    f: number,
    t: number,
    dur: number,
    peak: number,
  ): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    const g = this.env(bus, t, dur, peak, 0.001);
    src.connect(flt).connect(g);
    src.onended = () => g.disconnect();
    src.start(t, (t * 7.31) % 0.5);
    src.stop(t + dur + 0.05);
  }

  private thump(bus: AudioNode, f0: number, f1: number, t: number, dur: number, peak: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = this.env(bus, t, dur, peak, 0.003);
    o.connect(g);
    o.onended = () => g.disconnect();
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** A wooden bar: fundamental, the bar's high partial (≈ 3.9×, short), and a mallet click. */
  private bar(
    bus: AudioNode,
    f: number,
    t: number,
    peak: number,
    decay: number,
    click: boolean,
    partial = 3.93,
  ): void {
    this.sine(bus, f, t, decay, peak * 0.6, 0.002);
    this.sine(bus, f * partial, t, decay * 0.25, peak * 0.18, 0.001);
    if (click) this.hiss(bus, 'bandpass', 2600, t, 0.015, peak * 0.25);
  }

  /** A bossed gong: inharmonic partials with long, staggered decays. */
  private gong(bus: AudioNode, f: number, t: number, peak: number): void {
    this.sine(bus, f, t, 1.6, peak * 0.5, 0.004);
    this.sine(bus, f * 2.02, t, 0.9, peak * 0.18, 0.004);
    this.sine(bus, f * 2.76, t, 0.55, peak * 0.1, 0.004);
  }

  /**
   * The sralai: a sawtooth reed through two formant peaks (nasal), sliding in from the last
   * note, an optional upper grace, and vibrato that grows after the attack. Calm (mahori)
   * colours it darker and softer.
   */
  private reed(
    bus: AudioNode,
    f: number,
    from: number,
    t: number,
    dur: number,
    peak: number,
    grace: boolean,
    mood: MusicMoodName,
  ): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const start = from || (grace ? f * 2 ** (2 / 12) : f);
    o.frequency.setValueAtTime(start, t);
    o.frequency.exponentialRampToValueAtTime(f, t + (grace ? 0.06 : from ? 0.12 : 0.02));
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.6;
    const vibAmt = ctx.createGain();
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.5, dur * 0.6));
    vib.connect(vibAmt).connect(o.frequency);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'peaking';
    f1.frequency.value = 1150;
    f1.Q.value = 2.5;
    f1.gain.value = 10;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking';
    f2.frequency.value = 2700;
    f2.Q.value = 3;
    f2.gain.value = 7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = mood === 'calm' ? 1900 : 3400;
    const g = ctx.createGain();
    const end = t + Math.max(0.15, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak * 0.35, t + 0.05);
    g.gain.setValueAtTime(peak * 0.3, Math.max(t + 0.06, end - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.06);
    o.connect(f1).connect(f2).connect(lp).connect(g).connect(bus);
    o.onended = () => g.disconnect();
    o.start(t);
    vib.start(t);
    o.stop(end + 0.1);
    vib.stop(end + 0.1);
  }
}

export interface MusicAttach {
  ctx: Ctx;
  /** The sound master (music goes through it and its limiter). */
  master: AudioNode;
  noise: AudioBuffer;
}

/**
 * The music player: generated music or PK's tracks, on/off, volume and mood. Plays only while
 * wanted (the Kingdom tab is open), on, sound is on, and the AudioContext runs (after the
 * first click or key: autoplay rules).
 */
export class KingdomMusic {
  private audio: MusicAttach | null = null;
  private out: GainNode | null = null;
  private buses: Record<MusicMoodName, GainNode> | null = null;
  private scheduler: PhraseScheduler | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private on = true;
  private wanted = false;
  private soundOn = true;
  private vol: number;
  private moodName: MusicMoodName = 'calm';
  private readonly picker: TrackPicker;
  private readonly allowTracks: boolean;
  private source: 'tracks' | 'generated';
  private el: HTMLAudioElement | null = null;
  /** The element goes through WebAudio (http pages) or plays by itself (file:// pages). */
  private elRouted = false;
  private generating = false;
  private readonly seed: number;

  constructor(
    readonly cfg: MusicConfig,
    opts: { mobile?: boolean; seed?: number } = {},
  ) {
    this.vol = opts.mobile ? cfg.mobileVolume : cfg.defaultVolume;
    this.picker = new TrackPicker(cfg.tracks);
    this.allowTracks = !opts.mobile || cfg.tracksOnMobile;
    this.source = musicSource(this.picker, this.allowTracks);
    this.seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  }

  get enabled(): boolean {
    return this.on;
  }

  get volume(): number {
    return this.vol;
  }

  get mood(): MusicMoodName {
    return this.moodName;
  }

  /** 'tracks' (PK's files) or 'generated'. */
  get playing(): 'tracks' | 'generated' {
    return this.source;
  }

  /** Called by KingdomSound once its AudioContext exists. */
  attach(a: MusicAttach): void {
    if (this.audio) return;
    try {
      const { ctx } = a;
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(a.master);
      const calm = ctx.createGain();
      const tense = ctx.createGain();
      calm.gain.value = this.moodName === 'calm' ? 1 : 0;
      tense.gain.value = this.moodName === 'tense' ? 1 : 0;
      calm.connect(out);
      tense.connect(out);
      this.audio = a;
      this.out = out;
      this.buses = { calm, tense };
      const synth = new MusicSynth(ctx, this.buses, a.noise, this.cfg);
      this.scheduler = new PhraseScheduler(new Composer(this.cfg, this.seed), synth, this.cfg.lookaheadSec);
      this.scheduler.mood = this.moodName;
    } catch {
      this.audio = null;
    }
    this.sync();
  }

  setOn(on: boolean): void {
    this.on = on;
    this.sync();
  }

  setVolume(v: number): void {
    this.vol = Math.max(0, Math.min(1, v));
    this.applyLevel();
  }

  /** Follow the global sound switch. */
  setSoundEnabled(on: boolean): void {
    this.soundOn = on;
    this.sync();
  }

  setMood(m: MusicMoodName): void {
    if (m === this.moodName) return;
    this.moodName = m;
    const a = this.audio;
    if (!a || !this.buses || !this.scheduler) return;
    const t = a.ctx.currentTime;
    const tau = Math.max(0.01, this.cfg.crossfadeSec / 3);
    this.buses[m].gain.cancelScheduledValues(t);
    this.buses[m].gain.setTargetAtTime(1, t, tau / 3);
    const other = m === 'calm' ? 'tense' : 'calm';
    this.buses[other].gain.cancelScheduledValues(t);
    this.buses[other].gain.setTargetAtTime(0, t, tau);
    this.scheduler.setMood(m, t);
  }

  /** The Kingdom tab is shown: play when allowed. */
  play(): void {
    this.wanted = true;
    this.sync();
  }

  /** The Kingdom tab is left: silence. */
  stop(): void {
    this.wanted = false;
    this.sync();
  }

  private get shouldRun(): boolean {
    return this.wanted && this.on && this.soundOn && !!this.audio;
  }

  private sync(): void {
    this.applyLevel();
    const run = this.shouldRun;
    if (this.source === 'tracks') {
      this.stopGenerated();
      if (run) this.playTrack();
      else this.el?.pause();
      return;
    }
    if (run) this.startGenerated();
    else this.stopGenerated();
  }

  private applyLevel(): void {
    const level = this.shouldRun ? this.vol * this.cfg.level : 0;
    if (this.out && this.audio) this.out.gain.setTargetAtTime(level, this.audio.ctx.currentTime, 0.3);
    // A file:// page's element plays by itself (not through WebAudio): set its own volume.
    if (this.el && !this.elRouted) this.el.volume = Math.max(0, Math.min(1, level));
  }

  private startGenerated(): void {
    if (this.generating || !this.audio || !this.scheduler) return;
    this.generating = true;
    this.scheduler.reset(this.audio.ctx.currentTime);
    const tick = () => {
      const a = this.audio;
      if (a && a.ctx.state === 'running') this.scheduler!.tick(a.ctx.currentTime);
    };
    tick();
    this.timer = setInterval(tick, 100);
  }

  private stopGenerated(): void {
    if (!this.generating) return;
    this.generating = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.scheduler?.stop();
  }

  private playTrack(): void {
    if (this.el) {
      void this.el.play().catch(() => undefined);
      return;
    }
    const track = this.picker.next();
    if (!track || typeof Audio === 'undefined') return this.fallBack();
    const el = new Audio();
    el.preload = 'auto';
    el.src = new URL(`music/${encodeURIComponent(track.file)}`, document.baseURI).href;
    el.addEventListener('ended', () => {
      if (this.el !== el) return;
      this.el = null;
      if (this.shouldRun) this.playTrack();
    });
    el.addEventListener('error', () => {
      if (this.el !== el) return;
      console.warn(`[music] cannot load music/${track.file}; skipping it`);
      this.picker.fail(track.file);
      this.el = null;
      if (!this.picker.available) return this.fallBack();
      if (this.shouldRun) this.playTrack();
    });
    // Through the master and limiter where the page is served over http(s). A page opened
    // from disk (the Electron build) may not route file:// media into WebAudio, so there the
    // element plays by itself at the same level.
    this.elRouted = false;
    if (this.audio && this.out && /^https?:$/.test(location.protocol)) {
      try {
        this.audio.ctx.createMediaElementSource(el).connect(this.out);
        this.elRouted = true;
      } catch {
        this.elRouted = false;
      }
    }
    this.el = el;
    this.applyLevel();
    void el.play().catch(() => undefined);
  }

  private fallBack(): void {
    if (this.source === 'generated') return;
    console.warn(
      '[music] none of the tracks in config/kingdom/music.json could be played; using the generated music',
    );
    this.source = 'generated';
    this.el = null;
    this.sync();
  }
}
