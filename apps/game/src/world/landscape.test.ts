import { describe, expect, it } from 'vitest';
import { reservoirDam } from './landscape';
import { yardPlates, YARD_WORDS } from '../scenes/site';
import { SITE } from './worksite';
import { fmtShort } from '../ui/overlay';

describe("Build tab details from PK's prompt", () => {
  it('the Indratataka has an earth dam on all four sides with a sluice in the south dike', () => {
    const dam = reservoirDam();
    dam.geometry.computeBoundingBox();
    const b = dam.geometry.boundingBox!;
    expect(b.min.x).toBeLessThan(-212);
    expect(b.max.x).toBeGreaterThan(212);
    expect(b.min.z).toBeLessThan(-250);
    expect(b.max.z).toBeGreaterThan(-120);
    expect(b.max.y).toBeGreaterThan(2);
  });

  it("carvers cut the newest viewers' names into the yard blocks; the rest get Khmer blessings", () => {
    const plates = yardPlates(['Dara', 'Sokha']);
    expect(plates).toHaveLength(SITE.carvingYard.length);
    expect(plates.map((p) => p.name).slice(0, 3)).toEqual(['Dara', 'Sokha', YARD_WORDS[2]]);
    // Each plate sits on its block's south (camera) face.
    plates.forEach((p, i) => {
      expect(p.x).toBe(SITE.carvingYard[i]![0]);
      expect(p.z).toBeGreaterThan(SITE.carvingYard[i]![1]);
    });
    expect(new Set(yardPlates([]).map((p) => p.key)).size).toBe(YARD_WORDS.length);
  });

  it('gift and like counters read short: 950, 1.2k, 34k, 1.5M', () => {
    expect(fmtShort(950)).toBe('950');
    expect(fmtShort(1234)).toBe('1.2k');
    expect(fmtShort(34_567)).toBe('34k');
    expect(fmtShort(1_530_000)).toBe('1.5M');
  });
});
