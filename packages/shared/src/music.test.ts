import { describe, expect, it } from 'vitest';
import { loadMusic, parseMusic } from './music';

describe('Kingdom music config (D76)', () => {
  it('loads config/kingdom/music.json: music well under the effects, pentatonic home scale', () => {
    const m = loadMusic();
    expect(m.level).toBeLessThanOrEqual(0.3);
    expect(m.scales[0]!.semitones).toEqual([0, 2, 4, 7, 9]);
    expect(m.mobileVolume).toBeLessThan(m.defaultVolume);
    // Tense (pinpeat) is faster and denser than calm (mahori), and calm has no big drum.
    expect(m.moods.tense.tempo[0]).toBeGreaterThan(m.moods.calm.tempo[1]);
    expect(m.moods.tense.chhingPerBeat).toBeGreaterThan(m.moods.calm.chhingPerBeat);
    expect(m.moods.calm.levels.skorThom).toBe(0);
    expect(m.moods.tense.levels.skorThom).toBeGreaterThan(0);
    expect(m.moodRules.raidWarnSec).toBe(30);
  });

  it('fills every default from an empty file', () => {
    const m = parseMusic({});
    expect(m.level).toBe(0.25);
    expect(m.tracks).toEqual([]);
    expect(m.scales).toHaveLength(1);
    expect(m.moods.calm.tempo).toEqual([62, 88]);
    expect(m.moods.calm.levels.roneatEk).toBe(0.5);
    expect(m.moods.tense.tempo).toEqual([116, 156]);
    expect(m.moods.tense.levels.skorThom).toBe(0.6);
    // A partial mood keeps the defaults it leaves out.
    const p = parseMusic({ moods: { calm: { tempo: [50, 60], levels: { sralai: 0.1 } } } });
    expect(p.moods.calm.tempo).toEqual([50, 60]);
    expect(p.moods.calm.levels.sralai).toBe(0.1);
    expect(p.moods.calm.levels.chhing).toBe(0.12);
  });

  it('accepts tracks in public/music and refuses bad values', () => {
    const ok = parseMusic({ tracks: [{ file: 'Sarika Keo.mp3', km: 'សារិកាកែវ', en: 'Sarika Keo' }] });
    expect(ok.tracks[0]!.file).toBe('Sarika Keo.mp3');
    expect(() => parseMusic({ tracks: [{ file: '../secret.mp3', km: 'x', en: 'x' }] })).toThrow();
    expect(() => parseMusic({ tracks: [{ file: 'song.wma', km: 'x', en: 'x' }] })).toThrow();
    expect(() => parseMusic({ level: 2 })).toThrow();
    expect(() => parseMusic({ scales: [{ id: 'bad', semitones: [2, 4, 7] }] })).toThrow();
    expect(() => parseMusic({ scales: [{ id: 'bad', semitones: [0, 7, 4] }] })).toThrow();
    expect(() => parseMusic({ moods: { calm: { tempo: [120, 60] } } })).toThrow();
  });
});
