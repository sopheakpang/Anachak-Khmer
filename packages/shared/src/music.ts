import { z } from 'zod';
import musicJson from '../../../config/kingdom/music.json';

/**
 * Kingdom tab background music (D76): the musical rules of the generated pinpeat/mahori-style
 * music, and PK's own optional tracks. Every field has a default, so a short file still works.
 */

const Level = z.number().min(0).max(1);

export const MusicInstrumentLevelsSchema = z.object({
  roneatEk: Level.default(0.5),
  roneatThung: Level.default(0.35),
  kongVong: Level.default(0.35),
  sralai: Level.default(0.2),
  sampho: Level.default(0.3),
  skorThom: Level.default(0),
  chhing: Level.default(0.12),
});
export type MusicLevels = z.infer<typeof MusicInstrumentLevelsSchema>;
export type MusicInstrument = keyof MusicLevels;

const Tempo = z
  .tuple([z.number().min(30).max(240), z.number().min(30).max(240)])
  .refine(([a, b]) => a <= b, 'tempo: [slow, fast] with slow ≤ fast');

export const MusicMoodSchema = z.object({
  /** Beats per minute at the start and the end of a piece (the slow-fast arc). */
  tempo: Tempo.default([62, 88]),
  /** Chhing strokes per beat (open and closed in turn). */
  chhingPerBeat: z.number().int().min(1).max(4).default(1),
  /** Roneat ek notes per core-melody beat. */
  roneatDensity: z.number().int().min(1).max(4).default(2),
  /** Chance that a long roneat note becomes a tremolo roll. */
  rollChance: z.number().min(0).max(1).default(0.15),
  levels: MusicInstrumentLevelsSchema.prefault({}),
});
export type MusicMood = z.infer<typeof MusicMoodSchema>;
export type MusicMoodName = 'calm' | 'tense';

export const MusicScaleSchema = z.object({
  id: z.string().min(1),
  en: z.string().optional(),
  /** Semitones above the tonic, starting with 0, rising, inside one octave. */
  semitones: z
    .array(z.number().int().min(0).max(11))
    .min(3)
    .refine((s) => s[0] === 0 && s.every((x, i) => i === 0 || x > s[i - 1]!), 'starts at 0 and rises'),
});
export type MusicScale = z.infer<typeof MusicScaleSchema>;

export const MusicTrackSchema = z.object({
  /** File name inside apps/game/public/music/ (mp3, ogg or m4a). */
  file: z.string().regex(/^[^/\\]+\.(mp3|ogg|m4a)$/i, 'a file name in public/music (mp3, ogg, m4a)'),
  km: z.string().min(1),
  en: z.string().min(1),
});
export type MusicTrack = z.infer<typeof MusicTrackSchema>;

const PENTATONIC: MusicScale = { id: 'pentatonic', semitones: [0, 2, 4, 7, 9] };

export const MusicConfigSchema = z.object({
  note: z.string().optional(),
  /** Music level as a share of the master (well under the effects). */
  level: Level.default(0.25),
  defaultVolume: Level.default(0.8),
  /** The phone build starts quieter. */
  mobileVolume: Level.default(0.5),
  tonicHz: z.number().min(55).max(880).default(261.63),
  /** The first scale is home; the others are the modal shifts. */
  scales: z.array(MusicScaleSchema).min(1).default([PENTATONIC]),
  /** Chance that a new piece moves to another scale. */
  modalShift: z.number().min(0).max(1).default(0.2),
  /** Core-melody lengths in beats. */
  phraseBeats: z.array(z.number().int().min(4).max(32)).min(1).default([8, 12, 16]),
  /** Phrases per piece; the tempo rises across a piece, then a new piece starts slow. */
  phrasesPerPiece: z.number().int().min(1).max(32).default(6),
  lookaheadSec: z.number().min(0.05).max(2).default(0.4),
  crossfadeSec: z.number().min(0).max(10).default(2.5),
  /** The HUD's music-volume button steps through these. */
  volumeSteps: z.array(Level).min(1).default([0.2, 0.4, 0.6, 0.8, 1]),
  moods: z
    .object({
      calm: MusicMoodSchema.prefault({}),
      tense: MusicMoodSchema.prefault({
        tempo: [116, 156],
        chhingPerBeat: 2,
        roneatDensity: 4,
        rollChance: 0.3,
        levels: { sralai: 0.3, sampho: 0.45, skorThom: 0.6, chhing: 0.16 },
      }),
    })
    .prefault({}),
  moodRules: z
    .object({
      /** Tense from this many seconds before a raid. */
      raidWarnSec: z.number().min(0).default(30),
      /** Enemies this close to one of the player's buildings keep it tense. */
      nearMetres: z.number().positive().default(40),
      /** Calm again only after this long with no enemy near. */
      calmAfterSec: z.number().min(0).default(8),
    })
    .prefault({}),
  /** PK's own music (files he owns or may use). Empty: generated music only. */
  tracks: z.array(MusicTrackSchema).default([]),
  /** Copy and play the tracks on the phone build too (they make the offline app bigger). */
  tracksOnMobile: z.boolean().default(false),
});
export type MusicConfig = z.infer<typeof MusicConfigSchema>;

/** Parse a music config (throws with the exact field on a bad value). */
export function parseMusic(json: unknown): MusicConfig {
  return MusicConfigSchema.parse(json);
}

/** config/kingdom/music.json, validated. */
export function loadMusic(): MusicConfig {
  return parseMusic(musicJson);
}
