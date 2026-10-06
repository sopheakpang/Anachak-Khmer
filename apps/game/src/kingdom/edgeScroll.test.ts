import { describe, expect, it } from 'vitest';
import { edgePan } from './edgeScroll';

const cfg = { enabled: true, marginPx: 20, minSpeed: 0.4 };
const win = { width: 1000, height: 600 };
const full = { left: 0, top: 0, right: 1000, bottom: 600 };

describe('edge scroll (PK 1.6.0)', () => {
  it('does not pan in the middle, or with no cursor, or when off', () => {
    expect(edgePan({ x: 500, y: 300 }, win, full, cfg)).toEqual({ px: 0, pz: 0 });
    expect(edgePan(null, win, full, cfg)).toEqual({ px: 0, pz: 0 });
    expect(edgePan({ x: 0, y: 0 }, win, full, { ...cfg, enabled: false })).toEqual({ px: 0, pz: 0 });
  });

  it('pans toward each window edge, faster deeper into the band', () => {
    expect(edgePan({ x: 0, y: 300 }, win, full, cfg).px).toBeCloseTo(-1);
    expect(edgePan({ x: 999, y: 300 }, win, full, cfg).px).toBeGreaterThan(0.9);
    expect(edgePan({ x: 500, y: 0 }, win, full, cfg).pz).toBeCloseTo(-1);
    expect(edgePan({ x: 500, y: 600 }, win, full, cfg).pz).toBeCloseTo(1);
    const shallow = edgePan({ x: 19, y: 300 }, win, full, cfg).px;
    expect(shallow).toBeLessThan(0);
    expect(shallow).toBeGreaterThan(-0.5);
    // Corners pan on both axes.
    expect(edgePan({ x: 2, y: 598 }, win, full, cfg)).toEqual({ px: expect.any(Number), pz: expect.any(Number) });
  });

  it('keeps panning past a letterboxed stage edge (the bars beside the 16:9 view)', () => {
    const boxed = { left: 100, top: 0, right: 900, bottom: 600 };
    // On the left bar, outside the stage: full speed left.
    expect(edgePan({ x: 50, y: 300 }, win, boxed, cfg).px).toBeCloseTo(-1);
    // Just inside the stage edge: still in the band.
    expect(edgePan({ x: 110, y: 300 }, win, boxed, cfg).px).toBeLessThan(0);
    expect(edgePan({ x: 500, y: 300 }, win, boxed, cfg).px).toBe(0);
  });
});
