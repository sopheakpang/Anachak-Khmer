/**
 * Kingdom tab sound (WebAudio synthesis only, no samples): short one-shot effects for work,
 * fighting and events, plus a weather bed (rain, wind gusts, birds in clear weather).
 * The game is streamed on TikTok LIVE, so everything is soft: a low master level, a limiter
 * before the speakers, no harsh highs, and caps on how often an effect can repeat.
 *
 * Background music (D76) is `music.ts`; it plays through the same master and limiter.
 *
 * Safe without WebAudio (Node tests, old browsers): every method becomes a no-op.
 */
import { loadMusic, type MusicConfig, type MusicMoodName } from '@temples/shared';
import { KingdomMusic } from './music';

export type SfxName =
  | 'chop'
  | 'mine'
  | 'hammer'
  | 'farm'
  | 'splash'
  | 'sword'
  | 'spear'
  | 'arrow'
  | 'hit'
  | 'death'
  | 'build'
  | 'complete'
  | 'train'
  | 'raid'
  | 'discover'
  | 'click'
  | 'deny'
  | 'animal'
  | 'dog'
  | 'thunder';

export const SFX_NAMES: readonly SfxName[] = [
  'chop',
  'mine',
  'hammer',
  'farm',
  'splash',
  'sword',
  'spear',
  'arrow',
  'hit',
  'death',
  'build',
  'complete',
  'train',
  'raid',
  'discover',
  'click',
  'deny',
  'animal',
  'dog',
  'thunder',
];

/** Tuning: how many of one effect may start per window, the voice cap, levels. */
export const SOUND_CONFIG = {
  windowMs: 100,
  /** Starts allowed per effect per window (default 2). */
  perWindow: {
    arrow: 3,
    hit: 3,
    click: 3,
    complete: 1,
    raid: 1,
    discover: 1,
    thunder: 1,
    train: 1,
    death: 2,
  } as Partial<Record<SfxName, number>>,
  defaultPerWindow: 2,
  maxVoices: 6,
  /** Master level at volume 1 (kept well below full scale; PK: quieter effects, twice). */
  masterGain: 0.2,
  defaultVolume: 0.55,
};

/** Rough length of each effect in seconds (voice bookkeeping). */
export const SFX_DURATION: Record<SfxName, number> = {
  chop: 0.25,
  mine: 0.35,
  hammer: 0.15,
  farm: 0.3,
  splash: 0.45,
  sword: 0.5,
  spear: 0.15,
  arrow: 0.3,
  hit: 0.15,
  death: 0.4,
  build: 0.25,
  complete: 2.6,
  train: 0.5,
  raid: 1.6,
  discover: 1,
  click: 0.04,
  deny: 0.25,
  animal: 0.3,
  dog: 0.15,
  thunder: 2.2,
};

/**
 * Pure rate limiter: at most `perWindow` starts of one effect in any `windowMs`, and at most
 * `maxVoices` effects sounding at once. Times are in seconds.
 */
export class SfxLimiter {
  private readonly starts = new Map<string, number[]>();
  private ends: number[] = [];

  constructor(
    private readonly cfg: {
      windowMs: number;
      perWindow: Partial<Record<string, number>>;
      defaultPerWindow: number;
      maxVoices: number;
    } = SOUND_CONFIG,
  ) {}

  /** Voices still sounding at `now`. */
  voices(now: number): number {
    this.ends = this.ends.filter((e) => e > now);
    return this.ends.length;
  }

  /** May `name` start at `now` (lasting `dur` s)? Records the start when it may. */
  allow(name: string, now: number, dur: number): boolean {
    if (this.voices(now) >= this.cfg.maxVoices) return false;
    const win = this.cfg.windowMs / 1000;
    const list = (this.starts.get(name) ?? []).filter((s) => s > now - win);
    if (list.length >= (this.cfg.perWindow[name] ?? this.cfg.defaultPerWindow)) {
      this.starts.set(name, list);
      return false;
    }
    list.push(now);
    this.starts.set(name, list);
    this.ends.push(now + dur);
    return true;
  }
}

/** Which sound a simulation event makes (null: silent). Mirrors SimEvent in sim.ts. */
export function sfxForEvent(e: { kind: string; [k: string]: unknown }): SfxName | null {
  switch (e.kind) {
    case 'shot':
      return 'arrow';
    case 'felled':
    case 'hit':
      return 'hit';
    case 'death':
      return 'death';
    case 'destroyed':
      return 'death';
    case 'moved':
    case 'built':
      return 'complete';
    case 'trained':
      return 'train';
    case 'researched':
      return 'discover';
    case 'raid':
      return 'raid';
    case 'chapter':
      return 'complete';
    case 'found':
      return 'dog';
    case 'alarm':
      // PK: the alarm when villagers run (war horn for raiders, a warning call for beasts).
      return e.danger === 'raid' ? 'raid' : 'deny';
    case 'discovered':
      return 'discover';
    case 'ceremony':
      return 'discover'; // conch and gong of a royal ceremony
    case 'decree':
      return e.what === 'ended' ? null : e.what === 'founded' ? 'complete' : 'discover';
    case 'order':
      // The order board: gold for a filled order; a bell when the junk comes; nothing as it sails.
      return e.what === 'filled' ? 'complete' : e.what === 'boat' ? 'discover' : null;
    case 'levy':
      return 'train'; // villagers take up arms (Anachak Khmer)
    case 'battle':
      return 'raid'; // the war horn: the king sends his army
    case 'caravan':
      return 'complete';
    case 'traded':
      return 'click'; // a soft tick at the market (the exchange itself has its own sound)
    case 'weather':
      return e.weather === 'storm' ? 'thunder' : null;
    case 'hunted':
      return 'animal';
    case 'delivered':
      switch (e.res) {
        case 'wood':
          return 'chop';
        case 'stone':
        case 'gold':
          return 'mine';
        case 'food':
          return 'farm';
        default:
          return null;
      }
    case 'outcome':
      return e.result === 'victory' ? 'complete' : 'raid';
    default:
      return null;
  }
}

/** Stereo pan (-1..1) for a world x seen from the camera's x (span: metres to full side). */
export function panFor(x: number, camX: number, span = 60): number {
  return Math.max(-0.8, Math.min(0.8, (x - camX) / span));
}

export interface Ambience {
  rain?: number;
  wind?: number;
  birds?: number;
}

interface Bed {
  rain: GainNode;
  wind: GainNode;
  windLfo: GainNode;
  windFilter: BiquadFilterNode;
}

type Ctx = AudioContext;

export class KingdomSound {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: Bed | null = null;
  private on = true;
  private volume = SOUND_CONFIG.defaultVolume;
  private readonly limiter = new SfxLimiter();
  private amb = { rain: 0, wind: 0, birds: 0 };
  private birdTimer: ReturnType<typeof setTimeout> | null = null;
  /** Background music (D76): generated pinpeat/mahori-style, or PK's own files. */
  readonly music: KingdomMusic;

  constructor(opts: { mobile?: boolean; music?: MusicConfig } = {}) {
    this.music = new KingdomMusic(opts.music ?? loadMusic(), { mobile: opts.mobile });
  }

  /** Whether WebAudio exists here at all. */
  static get supported(): boolean {
    return typeof AudioContext !== 'undefined';
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Create or resume the AudioContext; call from a click or key press (autoplay rules). */
  unlock(): void {
    const ctx = this.context(true);
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  setEnabled(on: boolean): void {
    this.on = on;
    this.applyMaster();
    this.music.setSoundEnabled(on);
    if (on) this.scheduleBirds();
  }

  get musicOn(): boolean {
    return this.music.enabled;
  }

  get musicVolume(): number {
    return this.music.volume;
  }

  /** Music on or off (the sound switch still silences everything). */
  setMusicOn(on: boolean): void {
    this.music.setOn(on);
  }

  setMusicVolume(v: number): void {
    this.music.setVolume(v);
  }

  /** Calm (village day) or tense (raid, battle); crossfades. */
  setMood(m: MusicMoodName): void {
    this.music.setMood(m);
  }

  /** The Kingdom tab is shown: music plays once audio is unlocked. */
  startMusic(): void {
    this.music.play();
  }

  /** The Kingdom tab is left. */
  stopMusic(): void {
    this.music.stop();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  /** Play one effect. pan -1..1 (left..right), gain 0..1 extra scale. */
  play(name: SfxName, opts: { pan?: number; gain?: number } = {}): void {
    if (!this.on) return;
    const ctx = this.context();
    // A suspended context would queue sounds and blurt them all out on resume.
    if (!ctx || !this.master || ctx.state !== 'running') return;
    if (!this.limiter.allow(name, ctx.currentTime, SFX_DURATION[name])) return;
    const out = ctx.createGain();
    out.gain.value = Math.max(0, Math.min(1, opts.gain ?? 1));
    let node: AudioNode = out;
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      out.connect(p);
      node = p;
    }
    node.connect(this.master);
    const t = ctx.currentTime + 0.005;
    try {
      SYNTH[name](new Voice(ctx, out, this.noiseBuffer(ctx)), t);
    } catch {
      /* A browser without some node type: stay silent. */
    }
    // Let the chain go once it has rung out.
    setTimeout(() => node.disconnect(), (SFX_DURATION[name] + 0.5) * 1000);
  }

  /** Weather bed levels 0..1; ramps smoothly. Cheap to call every frame. */
  setAmbience(a: Ambience): void {
    const next = {
      rain: clamp01(a.rain ?? this.amb.rain),
      wind: clamp01(a.wind ?? this.amb.wind),
      birds: clamp01(a.birds ?? this.amb.birds),
    };
    const changed =
      Math.abs(next.rain - this.amb.rain) > 0.01 ||
      Math.abs(next.wind - this.amb.wind) > 0.01 ||
      Math.abs(next.birds - this.amb.birds) > 0.01;
    if (!changed && this.bed) return;
    this.amb = next;
    const ctx = this.context();
    if (!ctx) return;
    const bed = this.ensureBed(ctx);
    if (!bed) return;
    const t = ctx.currentTime;
    bed.rain.gain.setTargetAtTime(next.rain * 0.1, t, 0.8); // PK: softer rain
    bed.wind.gain.setTargetAtTime(next.wind * 0.07, t, 0.8); // PK: softer wind
    bed.windLfo.gain.setTargetAtTime(next.wind * 0.025, t, 0.8); // two LFOs: ±0.05 < 0.07, never inverts
    this.scheduleBirds();
  }

  // ------------------------------------------------------------ internals

  /**
   * The AudioContext, made on first use. Before any user gesture (`gesture` false and the page
   * not activated yet) none is made: the browser would refuse to start it and warn per sound.
   */
  private context(gesture = false): Ctx | null {
    if (this.ctx) return this.ctx;
    if (!KingdomSound.supported) return null;
    const activation = (globalThis.navigator as { userActivation?: { hasBeenActive: boolean } } | undefined)
      ?.userActivation;
    if (!gesture && activation && !activation.hasBeenActive) return null;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      // A gentle limiter so stacked effects never clip the stream.
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -14;
      lim.knee.value = 8;
      lim.ratio.value = 8;
      lim.attack.value = 0.004;
      lim.release.value = 0.2;
      master.connect(lim).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.applyMaster();
      this.music.attach({ ctx, master, noise: this.noiseBuffer(ctx) });
      return ctx;
    } catch {
      return null;
    }
  }

  private applyMaster(): void {
    if (!this.ctx || !this.master) return;
    const v = this.on ? this.volume * SOUND_CONFIG.masterGain : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private noiseBuffer(ctx: Ctx): AudioBuffer {
    if (!this.noise) this.noise = makeNoise(ctx, 1, 7);
    return this.noise;
  }

  private ensureBed(ctx: Ctx): Bed | null {
    if (this.bed) return this.bed;
    if (!this.master) return null;
    try {
      // Rain: a soft hiss, band-limited so it sits under the effects.
      const rainSrc = loopNoise(ctx, 3, 11);
      const rhp = ctx.createBiquadFilter();
      rhp.type = 'highpass';
      rhp.frequency.value = 500;
      const rlp = ctx.createBiquadFilter();
      rlp.type = 'lowpass';
      rlp.frequency.value = 5200;
      const rain = ctx.createGain();
      rain.gain.value = 0;
      rainSrc.connect(rhp).connect(rlp).connect(rain).connect(this.master);
      // Wind: band-passed noise whose level and colour wander with two slow LFOs.
      const windSrc = loopNoise(ctx, 4, 23);
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.9;
      const wind = ctx.createGain();
      wind.gain.value = 0;
      windSrc.connect(windFilter).connect(wind).connect(this.master);
      const lfo1 = ctx.createOscillator();
      lfo1.frequency.value = 0.11;
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.043;
      const windLfo = ctx.createGain();
      windLfo.gain.value = 0;
      lfo1.connect(windLfo);
      lfo2.connect(windLfo);
      windLfo.connect(wind.gain);
      const sweep = ctx.createGain();
      sweep.gain.value = 180;
      lfo1.connect(sweep).connect(windFilter.frequency);
      const t = ctx.currentTime;
      rainSrc.start(t);
      windSrc.start(t);
      lfo1.start(t);
      lfo2.start(t);
      this.bed = { rain, wind, windLfo, windFilter };
      return this.bed;
    } catch {
      return null;
    }
  }

  /** A bird now and then while birds > 0 (clear weather). */
  private scheduleBirds(): void {
    if (this.birdTimer !== null || !this.ctx || this.amb.birds <= 0.02 || !this.on) return;
    const wait = 2500 + Math.random() * 6000 * (1.3 - this.amb.birds);
    this.birdTimer = setTimeout(() => {
      this.birdTimer = null;
      if (this.amb.birds > 0.02 && this.on) this.chirp(this.amb.birds);
      this.scheduleBirds();
    }, wait);
  }

  private chirp(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const out = ctx.createGain();
    out.gain.value = 0.05 * level;
    let node: AudioNode = out;
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.random() * 1.4 - 0.7;
      out.connect(p);
      node = p;
    }
    node.connect(this.master);
    const v = new Voice(ctx, out, this.noiseBuffer(ctx));
    const base = 2600 + Math.random() * 1400;
    const notes = 2 + Math.floor(Math.random() * 3);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < notes; i++) {
      const f = base * (1 + (Math.random() - 0.3) * 0.25);
      v.tone('sine', f * 0.85, f * 1.2, t, 0.07, 1, 0.005);
      t += 0.09 + Math.random() * 0.05;
    }
    setTimeout(() => node.disconnect(), 1200);
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Seeded white noise (so the loops don't phase against each other). */
function makeNoise(ctx: Ctx, seconds: number, seed: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 4294967296) * 2 - 1;
  }
  return buf;
}

function loopNoise(ctx: Ctx, seconds: number, seed: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = makeNoise(ctx, seconds, seed);
  src.loop = true;
  return src;
}

/** Small synthesis kit for one effect: tones and filtered noise bursts into `out`. */
class Voice {
  constructor(
    private readonly ctx: Ctx,
    private readonly out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
  ) {}

  private env(t: number, dur: number, peak: number, attack: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    g.connect(this.out);
    return g;
  }

  /** An oscillator gliding f0 → f1 over `dur` with a percussive envelope. */
  tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    peak: number,
    attack = 0.004,
    lowpass = 0,
  ): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, dur, peak, attack);
    if (lowpass > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      o.connect(f).connect(g);
    } else o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** A noise burst through a filter whose cutoff glides f0 → f1. */
  noise(
    type: BiquadFilterType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    peak: number,
    attack = 0.003,
    q = 1,
  ): BiquadFilterNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(f).connect(this.env(t, dur, peak, attack));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  /** A struck bell: inharmonic partials, each decaying at its own rate. */
  bell(base: number, partials: Array<[number, number, number]>, t: number, peak: number): void {
    for (const [ratio, amp, decay] of partials) {
      this.tone('sine', base * ratio, base * ratio, t, decay, peak * amp, 0.006);
      // A slightly detuned twin gives the slow beating of cast bronze.
      this.tone('sine', base * ratio * 1.003, base * ratio * 1.003, t, decay * 0.9, peak * amp * 0.4, 0.006);
    }
  }

  /** A horn: detuned saws through a lowpass that swells open then closes. */
  horn(f: number, t: number, dur: number, peak: number, open: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.18);
    g.gain.setValueAtTime(peak * 0.9, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(open, t + dur * 0.35);
    lp.frequency.linearRampToValueAtTime(f * 3, t + dur);
    lp.connect(g);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = f * 0.008;
    vib.connect(vibAmt);
    for (const detune of [0, 1.013]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const fd = f * (detune || 1);
      // Blown up to pitch, sagging at the end of the breath.
      o.frequency.setValueAtTime(fd * 0.88, t);
      o.frequency.exponentialRampToValueAtTime(fd, t + Math.min(0.2, dur * 0.2));
      o.frequency.setValueAtTime(fd, t + dur * 0.75);
      o.frequency.exponentialRampToValueAtTime(fd * 0.93, t + dur);
      vibAmt.connect(o.frequency);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

/** The synthesis recipe of every effect (levels are relative; the master keeps them low). */
const SYNTH: Record<SfxName, (v: Voice, t: number) => void> = {
  chop(v, t) {
    v.tone('sine', 190, 85, t, 0.14, 0.7);
    v.noise('bandpass', 1100, 500, t, 0.08, 0.5, 0.002, 1.2);
    v.noise('bandpass', 3000, 2600, t + 0.045, 0.03, 0.12, 0.002, 3);
    v.noise('bandpass', 3600, 3000, t + 0.08, 0.025, 0.08, 0.002, 3);
  },
  mine(v, t) {
    v.tone('triangle', 2200, 2150, t, 0.25, 0.18, 0.002);
    v.tone('sine', 3310, 3290, t, 0.16, 0.1, 0.002);
    v.tone('sine', 1320, 1300, t, 0.3, 0.12, 0.002);
    v.noise('highpass', 3500, 3500, t, 0.03, 0.15, 0.001);
  },
  hammer(v, t) {
    v.tone('sine', 360, 230, t, 0.1, 0.55);
    v.tone('triangle', 720, 600, t, 0.05, 0.15);
    v.noise('bandpass', 700, 500, t, 0.05, 0.3, 0.002, 1.5);
  },
  farm(v, t) {
    v.noise('bandpass', 1400, 700, t, 0.28, 0.35, 0.05, 1.4);
    v.tone('sine', 150, 110, t + 0.02, 0.12, 0.2, 0.01);
  },
  splash(v, t) {
    v.noise('lowpass', 3200, 400, t, 0.4, 0.45, 0.01, 0.7);
    v.tone('sine', 520, 1150, t + 0.03, 0.08, 0.18, 0.003);
    v.tone('sine', 700, 1400, t + 0.12, 0.07, 0.12, 0.003);
  },
  sword(v, t) {
    v.noise('highpass', 2500, 2500, t, 0.03, 0.2, 0.001);
    for (const [f, a, d] of [
      [1180, 0.16, 0.45],
      [1870, 0.1, 0.35],
      [2650, 0.07, 0.25],
      [3420, 0.04, 0.18],
    ] as const)
      v.tone('sine', f, f * 0.995, t, d, a, 0.001);
  },
  spear(v, t) {
    v.tone('sine', 150, 70, t, 0.12, 0.6);
    v.noise('lowpass', 900, 300, t, 0.07, 0.35, 0.002);
  },
  arrow(v, t) {
    v.noise('bandpass', 700, 2600, t, 0.22, 0.28, 0.08, 2.5);
  },
  hit(v, t) {
    v.tone('sine', 120, 60, t, 0.13, 0.55);
    v.noise('lowpass', 500, 200, t, 0.08, 0.35, 0.002);
  },
  death(v, t) {
    v.tone('sine', 95, 45, t, 0.35, 0.55, 0.01);
    v.noise('lowpass', 260, 120, t, 0.25, 0.3, 0.01);
  },
  build(v, t) {
    v.tone('sine', 170, 95, t, 0.18, 0.6);
    v.noise('lowpass', 1100, 300, t, 0.08, 0.35, 0.002);
    v.tone('triangle', 540, 480, t + 0.09, 0.05, 0.12);
  },
  complete(v, t) {
    // Kong vong: a warm bronze gong, G3 with bell-like upper partials.
    v.bell(
      196,
      [
        [1, 0.34, 2.5],
        [2, 0.18, 1.8],
        [2.76, 0.12, 1.3],
        [4.07, 0.06, 0.9],
        [5.4, 0.03, 0.6],
      ],
      t,
      1,
    );
    v.noise('lowpass', 900, 300, t, 0.06, 0.15, 0.002);
  },
  train(v, t) {
    // A short conch blip.
    v.horn(330, t, 0.45, 0.22, 1300);
  },
  raid(v, t) {
    // Buffalo-horn war trumpet, low and long.
    v.horn(98, t, 1.5, 0.35, 900);
    v.horn(147, t + 0.05, 1.45, 0.12, 800);
  },
  discover(v, t) {
    PENTA.slice(0, 5).forEach((f, i) => {
      v.tone('sine', f * 2, f * 2, t + i * 0.085, 0.7, 0.14, 0.004);
      v.tone('triangle', f, f, t + i * 0.085, 0.5, 0.08, 0.004);
    });
  },
  click(v, t) {
    v.tone('sine', 1700, 1500, t, 0.03, 0.18, 0.001);
  },
  deny(v, t) {
    v.tone('triangle', 150, 140, t, 0.22, 0.3, 0.01, 700);
    v.tone('triangle', 156, 146, t, 0.22, 0.25, 0.01, 700);
  },
  animal(v, t) {
    v.tone('sawtooth', 210, 130, t, 0.26, 0.35, 0.03, 800);
    v.noise('bandpass', 500, 350, t, 0.2, 0.1, 0.03, 2);
  },
  dog(v, t) {
    v.tone('sawtooth', 560, 320, t, 0.11, 0.3, 0.005, 1400);
    v.noise('bandpass', 900, 700, t, 0.08, 0.15, 0.003, 2);
  },
  thunder(v, t) {
    v.noise('bandpass', 1400, 500, t, 0.25, 0.15, 0.01, 0.8);
    v.noise('lowpass', 300, 70, t + 0.05, 2.1, 0.9, 0.08, 0.5);
    v.noise('lowpass', 180, 60, t + 0.5, 1.5, 0.6, 0.2, 0.5);
  },
};
