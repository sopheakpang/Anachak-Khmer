import { describe, expect, it } from 'vitest';
import qualityJson from '../../../../../config/quality.json';
import { TreeShade, shadeAlpha, shadePixels, shadeRadius, type ShadeCfg } from './treeShade';
import type { KingdomGfx } from './gfx';

/** PK 2026-10-20 (D166): the soft shade painted under the trees where there are no real shadows. */
const q = qualityJson as unknown as Record<string, { look: { shadows: boolean }; kingdom: KingdomGfx }>;
const cfg: ShadeCfg = { strength: 0.5, size: 0.75, minHeight: 2.5, color: '#14200c' };

describe('painted tree shade', () => {
  it('is darkest under the trunk and fades to nothing at the edge', () => {
    expect(shadeAlpha(0, 0.5)).toBeCloseTo(0.5);
    expect(shadeAlpha(0.5, 0.5)).toBeLessThan(0.5);
    expect(shadeAlpha(0.5, 0.5)).toBeGreaterThan(0);
    expect(shadeAlpha(1, 0.5)).toBe(0);
    const px = shadePixels(8, 0.5, [20, 32, 12]);
    expect(px.length).toBe(8 * 8 * 4);
    expect(px[0 + 3]).toBe(0); // a corner: outside the disc
    const mid = (4 * 8 + 4) * 4;
    expect(px[mid + 3]).toBeGreaterThan(100);
    expect([px[mid], px[mid + 1], px[mid + 2]]).toEqual([20, 32, 12]);
  });

  it('a tree’s shade follows its crown; low plants throw none', () => {
    expect(shadeRadius(18, 16, cfg)).toBeCloseTo(6);
    expect(shadeRadius(1.2, 3, cfg)).toBe(0);
  });

  it('one draw call for every tree, never more than it holds', () => {
    const s = new TreeShade(cfg, 3);
    s.begin();
    for (let i = 0; i < 5; i++) s.add(i, 0, 0, 2);
    s.add(9, 0, 9, 0); // no shade
    s.end();
    expect(s.count).toBe(3);
    expect(s.mesh.count).toBe(3);
    expect(s.mesh.visible).toBe(true);
    s.begin();
    s.end();
    expect(s.mesh.visible).toBe(false);
    s.dispose();
  });

  it('the phone has it (no real shadows there) and lighter forest budgets; the PC has neither', () => {
    expect(q.mobile!.look.shadows).toBe(false);
    expect(q.mobile!.kingdom.shade!.strength).toBeGreaterThan(0);
    expect(q.mobile!.kingdom.shade!.strength).toBeLessThanOrEqual(1);
    const F = q.mobile!.kingdom.forestTris!;
    expect(F.near.hero).toBeLessThan(160_000);
    expect(F.near.rts).toBeLessThan(20_000);
    for (const k of ['pc1660', 'high', 'ultra']) {
      expect(q[k]!.kingdom.shade, k).toBeUndefined();
      expect(q[k]!.kingdom.forestTris, k).toBeUndefined();
    }
  });
});
