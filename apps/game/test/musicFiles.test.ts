import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMusicFile, listMusic, musicFiles, musicRequest, musicType } from '../tools/musicFiles';

describe('PK’s music files (D76)', () => {
  it('serves plain mp3/ogg/m4a names only', () => {
    expect(isMusicFile('song.mp3')).toBe(true);
    expect(isMusicFile('Song Two.M4A')).toBe(true);
    expect(isMusicFile('README.md')).toBe(false);
    expect(isMusicFile('../x.mp3')).toBe(false);
    expect(isMusicFile('a/b.ogg')).toBe(false);
    expect(isMusicFile('.hidden.mp3')).toBe(false);
    expect(musicRequest('/song%20two.mp3?v=1')).toBe('song two.mp3');
    expect(musicRequest('/%2e%2e%2fsecret.mp3')).toBeNull();
    expect(musicRequest('/%E0%A4%A')).toBeNull();
    expect(musicType('a.mp3')).toBe('audio/mpeg');
    expect(musicType('a.OGG')).toBe('audio/ogg');
    expect(musicType('a.m4a')).toBe('audio/mp4');
  });

  it('lists the audio files of the folder (none when it is missing) and copies them to the build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'music-'));
    try {
      expect(listMusic(join(dir, 'nope'))).toEqual([]);
      writeFileSync(join(dir, 'b.ogg'), 'x');
      writeFileSync(join(dir, 'a.mp3'), 'y');
      writeFileSync(join(dir, 'README.md'), '#');
      mkdirSync(join(dir, 'sub.mp3'));
      expect(listMusic(dir)).toEqual(['a.mp3', 'b.ogg']);
      const emitted: string[] = [];
      const ctx = { emitFile: (f: { fileName: string }) => emitted.push(f.fileName) };
      const run = (copy: boolean) =>
        (musicFiles({ dir, copy }).generateBundle as unknown as (this: typeof ctx) => void).call(ctx);
      run(false);
      expect(emitted).toEqual([]);
      run(true);
      expect(emitted).toEqual(['music/a.mp3', 'music/b.ogg']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
