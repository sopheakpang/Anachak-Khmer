import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PC_ONLY } from '../vite.mobile.config';
import { PHONE_MODEL_DIRS, cacheKey, fitTexture, keepRatio, shrinkModels, toRedo } from '../tools/phoneModels';
import qualityJson from '../../../config/quality.json';

/** PK 2026-10-20 (D163): the phone build carries the PC's 3D models, phone-sized. */
describe('phone-sized PC models', () => {
  it('textures fit the phone size, keep their shape and never grow', () => {
    expect(fitTexture(4096, 4096, 1024)).toEqual([1024, 1024]);
    expect(fitTexture(2048, 1024, 1024)).toEqual([1024, 512]);
    expect(fitTexture(512, 512, 1024)).toEqual([512, 512]);
    expect((qualityJson.mobile as { modelTextureMax?: number }).modelTextureMax).toBe(1024);
  });

  it('D165: still models over the phone budget are simplified; rigged ones keep their shape', () => {
    const max = (qualityJson.mobile as { modelMaxTris?: number }).modelMaxTris!;
    expect(max).toBeGreaterThanOrEqual(1000);
    expect(keepRatio(46_581, 3000, false)).toBeCloseTo(3000 / 46_581);
    expect(keepRatio(2000, 3000, false)).toBe(1);
    expect(keepRatio(46_581, 3000, true)).toBe(1);
    expect(cacheKey(1, 1, '1024/3000')).not.toBe(cacheKey(1, 1, 1024));
  });

  it('D166: the old stump stays whole on the phone (it smears when cut)', () => {
    const keep = (qualityJson.mobile as { modelKeepWhole?: string[] }).modelKeepWhole!;
    expect(keep).toContain('models/real/plants/old-stump.glb');
    for (const f of keep) expect(PHONE_MODEL_DIRS.some((d) => f.startsWith(d + '/'))).toBe(true);
  });

  it('only new or changed models are made again', () => {
    const k = cacheKey(100, 5.4, 1024);
    expect(k).toBe('100:5:1024');
    expect(toRedo({ 'a.glb': k, 'b.glb': k }, { 'a.glb': k, 'b.glb': 'old' })).toEqual(['b.glb']);
    expect(cacheKey(100, 5, 2048)).not.toBe(k);
  });

  it('the phone build has models/real and models/buildings; only the old heroes stay off', () => {
    expect(PC_ONLY).toEqual(['models/heroes']);
    for (const d of PHONE_MODEL_DIRS) expect(PC_ONLY).not.toContain(d);
  });

  it('copies a model with small textures as it is, from the cache the next time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'phone-'));
    const src = join(root, 'src');
    const out = join(root, 'out');
    mkdirSync(join(src, 'models/real/x'), { recursive: true });
    // The smallest valid GLB: header + an empty JSON scene.
    const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }).padEnd(28, ' '));
    const glb = Buffer.alloc(12 + 8 + json.length);
    glb.write('glTF', 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(json.length, 12);
    glb.write('JSON', 16);
    json.copy(glb, 20);
    writeFileSync(join(src, 'models/real/x/a.glb'), glb);
    const first = await shrinkModels(src, out, join(root, 'cache'), 1024);
    expect(first).toMatchObject({ made: 1, files: 1 });
    expect(readFileSync(join(out, 'models/real/x/a.glb')).equals(glb)).toBe(true);
    const again = await shrinkModels(src, join(root, 'out2'), join(root, 'cache'), 1024);
    expect(again.made).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});
