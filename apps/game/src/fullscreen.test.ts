import { describe, expect, it } from 'vitest';
import { canFullscreen, isFullscreen, toggleFullscreen, type FullscreenDoc } from './fullscreen';

function fakeDoc(enabled = true, refuse = false): FullscreenDoc & { calls: string[] } {
  const calls: string[] = [];
  const doc: FullscreenDoc & { calls: string[] } = {
    calls,
    fullscreenEnabled: enabled,
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: async () => {
        calls.push('enter');
        if (refuse) throw new Error('not allowed');
        doc.fullscreenElement = {} as Element;
      },
    },
    exitFullscreen: async () => {
      calls.push('exit');
      doc.fullscreenElement = null;
    },
  };
  return doc;
}

describe('full screen (PK 1.8.0)', () => {
  it('toggles in and out', async () => {
    const doc = fakeDoc();
    expect(canFullscreen(doc)).toBe(true);
    expect(await toggleFullscreen(doc)).toBe(true);
    expect(isFullscreen(doc)).toBe(true);
    expect(await toggleFullscreen(doc)).toBe(false);
    expect(isFullscreen(doc)).toBe(false);
    expect(doc.calls).toEqual(['enter', 'exit']);
  });

  it('does nothing where the browser cannot (iPhone)', async () => {
    const doc = fakeDoc(false);
    expect(canFullscreen(doc)).toBe(false);
    expect(await toggleFullscreen(doc)).toBe(false);
    expect(doc.calls).toEqual([]);
  });

  it('a refusal leaves the window as it was', async () => {
    const doc = fakeDoc(true, true);
    expect(await toggleFullscreen(doc)).toBe(false);
    expect(isFullscreen(doc)).toBe(false);
  });
});
