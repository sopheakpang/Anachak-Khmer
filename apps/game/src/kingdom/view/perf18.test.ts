import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { ElephantGrass } from './elephantGrass';
import { SUN_EVERY, fogTexel } from './scene';
import { KingdomSim, PLAYER } from '../sim/sim';
import type { Patch } from './detail';

const D = loadKingdom();

describe('1.8.0 optimisation pass', () => {
  it('a grass field knows before planting whether the view moved far enough to re-plant', () => {
    const g = new ElephantGrass(D.diorama.sward, false);
    const at = (): Patch => 'grass';
    expect(g.wouldLay(0, 0, 20)).toBe(true); // never planted
    expect(g.lay(0, 0, 20, 2, 0, at, () => true)).toBe(true);
    expect(g.wouldLay(0, 0, 20)).toBe(false);
    expect(g.wouldLay(4, 0, 20)).toBe(false); // under a quarter of the radius
    expect(g.wouldLay(6, 0, 20)).toBe(true);
    expect(g.wouldLay(0, 0, 30)).toBe(true); // zoomed out a lot
    // lay agrees with wouldLay (no work when nothing moved), unless forced.
    expect(g.lay(4, 0, 20, 2, 0, at, () => true)).toBe(false);
    expect(g.lay(4, 0, 20, 2, 0, at, () => true, true)).toBe(true);
  });

  it('the fog texture is written one 32-bit word a texel: grey in RGB, opaque', () => {
    const px = new Uint32Array([fogTexel(22)]);
    expect([...new Uint8Array(px.buffer)]).toEqual([22, 22, 22, 255]);
    expect([...new Uint8Array(new Uint32Array([fogTexel(238)]).buffer)]).toEqual([238, 238, 238, 255]);
    expect(SUN_EVERY).toBeLessThanOrEqual(0.05);
  });

  it('the sim counts new exploration apart from what is in sight now', () => {
    const s = new KingdomSim(D, 'easy');
    s.ai.nextRaid = 1e9;
    s.updateFog();
    const v0 = s.exploredVersion;
    const fog0 = s.fogVersion;
    // Standing still: the fog is worked out again, nothing new is seen.
    s.updateFog();
    expect(s.fogVersion).toBe(fog0 + 1);
    expect(s.exploredVersion).toBe(v0);
    // A villager walks into land nobody has seen.
    const u = [...s.units.values()].find((x) => x.team === PLAYER)!;
    u.x += 60;
    s.updateFog();
    expect(s.exploredVersion).toBe(v0 + 1);
  });
});
