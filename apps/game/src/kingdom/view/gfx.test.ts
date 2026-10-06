import { describe, expect, it } from 'vitest';
import qualityJson from '../../../../../config/quality.json';
import { NO_GFX, postChain, type KingdomGfx } from './gfx';
import {
  bambooGeometry,
  forestPalmGeometry,
  banyanGeometry,
  egretGeometry,
  homeYardGeometry,
  mangoGeometry,
  swayMaterial,
} from './flora';

const presets = qualityJson as unknown as Record<string, { kingdom: KingdomGfx }>;
const tris = (g: { getAttribute(n: string): { count: number } }) => g.getAttribute('position').count / 3;

describe('Anno-style graphics per preset (D79)', () => {
  it('every preset says what the Kingdom draws', () => {
    for (const name of ['low', 'high', 'ultra', 'lite', 'mobile']) {
      const g = presets[name]!.kingdom;
      expect(['shader', 'flat']).toContain(g.water);
      expect(g.treeKinds).toBeGreaterThanOrEqual(1);
      expect(g.treeKinds).toBeLessThanOrEqual(5);
      // PK: not too many birds — a handful at most.
      expect(g.birds).toBeLessThanOrEqual(6);
      expect(g.aoScale).toBeGreaterThan(0);
    }
  });

  it('phones skip the heavy passes; the stream laptop gets half-size ambient occlusion', () => {
    expect(postChain(presets.mobile!.kingdom)).toEqual([]);
    expect(presets.mobile!.kingdom.birds).toBe(0);
    expect(presets.low!.kingdom.aoScale).toBeLessThanOrEqual(0.5);
    expect(postChain(presets.lite!.kingdom)).toEqual(['output', 'grade']);
    // The diorama look (D121) paints its shade into the ground instead of screen-space AO.
    expect(postChain(presets.high!.kingdom)).toEqual(['bloom', 'output', 'grade']);
    expect(postChain({ ...presets.high!.kingdom, diorama: false })).toEqual(['ao', 'bloom', 'output', 'grade']);
    expect(postChain(NO_GFX)).toEqual([]);
  });

  it('the new trees and village things stay light', () => {
    for (const g of [
      banyanGeometry(),
      bambooGeometry(),
      mangoGeometry(),
      homeYardGeometry(),
      egretGeometry(),
    ])
      expect(tris(g)).toBeLessThan(3000);
    // Forest kinds are drawn up to 1 600 times, twice (view and shadows): keep each light.
    for (const g of [banyanGeometry(), bambooGeometry(), forestPalmGeometry(), mangoGeometry()])
      expect(tris(g)).toBeLessThanOrEqual(260);
  });

  it('the sway material follows the weather', () => {
    const s = swayMaterial();
    expect(s.uniforms.uWind.value).toBeGreaterThan(0);
    expect(s.material.customProgramCacheKey()).toBe('sway');
  });
});
