import { describe, expect, it } from 'vitest';
import qualityJson from '../../../../../config/quality.json';
import { GFX_PRESETS, gfxPanelHtml } from './hud';
import { PRESETS, qualityFrom } from '../../engine/app';

/** PK's plan, Sprint G (D149): the 🖥 panel with the frame rate and the preset, and the PC 1660 preset. */
describe('graphics presets and the 🖥 panel', () => {
  it('pc1660: high plus 4096 shadows and the Meshy buildings; Low keeps the budget', () => {
    const q = qualityJson as unknown as Record<string, { look: { shadowMapSize: number }; kingdom: { meshyModels?: boolean } }>;
    expect(q.pc1660!.look.shadowMapSize).toBe(4096);
    expect(q.pc1660!.kingdom.meshyModels).toBe(true);
    expect(q.low!.kingdom.meshyModels).toBe(false);
    expect(q.lite!.kingdom.meshyModels).toBe(false);
    expect(q.mobile!.kingdom.meshyModels).toBe(false);
    for (const p of PRESETS) expect(q[p], p).toBeTruthy();
    expect(GFX_PRESETS.map((p) => p.id)).toEqual([...PRESETS]);
  });

  it('the preset chosen in the game wins over the window default; presetLock or a bad value does not', () => {
    expect(qualityFrom('?preset=low', 'pc1660').name).toBe('pc1660');
    expect(qualityFrom('?preset=low', null).name).toBe('low');
    expect(qualityFrom('?preset=ultra', null).name).toBe('ultra');
    expect(qualityFrom('?preset=lite&presetLock=1', 'pc1660').name).toBe('lite');
    expect(qualityFrom('?preset=nonsense', null).name).toBe('low');
  });

  it('the panel: FPS green at the target, red under it; every preset a button, the current lit', () => {
    const s = { fps: 31.4, frameMs: 21.2, triangles: 585_442, drawCalls: 104 };
    const ok = gfxPanelHtml('pc1660', s, 30);
    expect(ok).toContain('k-gfx-fps k-ok');
    expect(ok).toContain('31 FPS');
    expect(ok).toMatch(/k-gfx-p k-on" data-act="gfx-set:pc1660"/);
    for (const p of PRESETS) expect(ok).toContain(`data-act="gfx-set:${p}"`);
    expect(gfxPanelHtml('low', { ...s, fps: 22 }, 30)).toContain('k-gfx-fps k-slow');
  });
});
