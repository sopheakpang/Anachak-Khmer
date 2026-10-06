import { describe, expect, it } from 'vitest';
import { paceFrame, targetFps } from './pacing';

/** Simulate a display refreshing at `hz` for one second and count rendered frames. */
function framesPerSecond(hz: number, fps: number): number {
  let last = 0;
  let count = 0;
  for (let t = 1000 / hz; t <= 1000 + 1e-6; t += 1000 / hz) {
    const r = paceFrame(t, last, fps);
    last = r.last;
    if (r.render) count++;
  }
  return count;
}

describe('frame pacing', () => {
  it('locks to 30 FPS on 60, 75, 120 and 144 Hz displays', () => {
    for (const hz of [60, 75, 120, 144]) {
      expect(framesPerSecond(hz, 30)).toBeGreaterThanOrEqual(29);
      expect(framesPerSecond(hz, 30)).toBeLessThanOrEqual(31);
    }
  });

  it('renders every frame on a 30 Hz display', () => {
    expect(framesPerSecond(30, 30)).toBe(30);
  });

  it('does not burst after a long stall', () => {
    const r = paceFrame(500, 0, 30);
    expect(r.render).toBe(true);
    expect(500 - r.last).toBeLessThan(1000 / 30);
  });

  it('reads the target from the URL', () => {
    expect(targetFps('?fps=60')).toBe(60);
    expect(targetFps('?fps=144')).toBe(30);
    expect(targetFps('')).toBe(30);
  });
});
