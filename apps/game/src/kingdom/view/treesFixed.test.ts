import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { generateMap } from '../sim/map';
import { addLodFade, lodEye, lodNoise, lodRange, lodShown, lodSides } from './lodFade';
import { drawDistance, fadeAt, scatterPlan, scatterTreeKinds, scatterTreeSpots } from './scatter';
import { ModelTrees, type TreeCfg, type TreeSpot } from './treeModels';
import qualityJson from '../../../../../config/quality.json';

/**
 * PK 2026-10-21 (D167): "tree that disappeared and appeared, just make it fixed like reality" —
 * every tree stays in its place; whatever changes with distance fades instead of popping.
 */
const data = loadKingdom();
const SC = data.props.scatter!;
const L = data.props.treePlacement!.lod!;

describe('the distance fade', () => {
  it('between the model and its cards every pixel is drawn exactly once', () => {
    const r = { s: 40, band: 5, out: 1e9, outBand: 0 };
    for (let d = 30; d <= 50; d += 0.5)
      for (let px = 0; px < 40; px += 3) {
        const n = lodNoise(px, px * 7 + 3);
        expect(lodShown('near', d, r, n) !== lodShown('far', d, r, n), `${d} m`).toBe(true);
      }
    // Well inside: only the model; well outside: only the cards.
    expect(lodShown('near', 30, r, 0.99)).toBe(true);
    expect(lodShown('far', 30, r, 0.01)).toBe(false);
    expect(lodShown('near', 50, r, 0.01)).toBe(false);
  });

  it('the cards fade out at the far edge, not all at once', () => {
    const r = { s: 40, band: 5, out: 180, outBand: 12 };
    const shown = (d: number) => [...Array(100).keys()].filter((i) => lodShown('far', d, r, i / 100)).length;
    expect(shown(160)).toBe(100);
    expect(shown(180)).toBeGreaterThan(30);
    expect(shown(180)).toBeLessThan(70);
    expect(shown(200)).toBe(0);
  });

  it('what the GPU gets: the overlap holds both, with room for the view to move', () => {
    expect(lodSides(10, 40, 5, 14)).toEqual({ near: true, far: false });
    expect(lodSides(40, 40, 5, 14)).toEqual({ near: true, far: true });
    expect(lodSides(70, 40, 5, 14)).toEqual({ near: false, far: true });
  });

  it('a material gets the fade once, keeping what it had', () => {
    const m = new THREE.MeshStandardMaterial();
    let before = 0;
    m.onBeforeCompile = () => void before++;
    m.customProgramCacheKey = () => 'sway';
    addLodFade(m, lodEye(), lodRange(), 'near');
    addLodFade(m, lodEye(), lodRange(), 'near');
    expect(m.customProgramCacheKey()).toBe('sway|lod-near');
    const sh = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <clipping_planes_fragment>',
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    expect(before).toBe(1);
    expect(sh.fragmentShader).toContain('discard');
    expect(Object.keys(sh.uniforms)).toEqual(expect.arrayContaining(['uLodEye', 'uLodS', 'uLodOut']));
  });
});

describe('the tall scattered trees join the forest', () => {
  it('every tall kind (4 m and over) is drawn as a tree, with its cards in the game', async () => {
    const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as { existsSync(p: string): boolean };
    const pub = (f: string) => new URL(`../../../public-mobile/${f}`, import.meta.url).pathname;
    for (const k of SC.kinds) {
      if (!k.tree) continue;
      expect(fs.existsSync(pub(k.tree.cards)), k.id).toBe(true);
      expect(k.tree.height, k.id).toBeGreaterThanOrEqual(4);
    }
    for (const id of ['rainTree', 'mangoTree', 'palmB', 'broadleafC', 'bigTropicalTree', 'cliffWall'])
      expect(SC.kinds.find((k) => k.id === id)?.tree, id).toBeTruthy();
    for (const id of ['wildflowers', 'bush', 'graniteA', 'duck']) expect(SC.kinds.find((k) => k.id === id)?.tree, id).toBeUndefined();
  });

  it('every one of them on the map is a tree spot — not only the nearest few', () => {
    const map = generateMap(data, data.campaign.map.seed, data.anachak.roads);
    const plan = scatterPlan(map, SC.kinds, map.seed, SC.clearHall);
    const trees = scatterTreeKinds(SC.kinds, {});
    const spots = scatterTreeSpots(plan, SC.kinds, trees);
    const tall = plan.filter((p) => SC.kinds[p.kind]!.tree).length;
    expect(spots.length).toBe(tall);
    expect(spots.length).toBeGreaterThan(5000);
    expect(new Set(spots.map((s) => s.id)).size).toBeGreaterThan(trees.length - 3); // a rare one may not grow here
    // Ids never clash with the forest's own kinds (a scatter "bamboo" is not the forest's).
    for (const t of trees) expect(data.props.trees!.some((f) => f.id === t.id)).toBe(false);
  });

  it('the phone’s stand-in model brings its own cards and size', () => {
    const sw = (qualityJson as unknown as Record<string, { kingdom: { scatterSwap?: Record<string, { file: string; scale: number }> } }>)
      .mobile!.kingdom.scatterSwap!;
    const trees = scatterTreeKinds(SC.kinds, { scatterSwap: sw });
    const fan = trees.find((t) => t.id === 'sc:fanPalm')!;
    expect(fan.file).toBe(sw.fanPalm!.file);
    expect(fan.drawScale).toBe(sw.fanPalm!.scale);
    expect(fan.cards).toBe(SC.kinds.find((k) => k.file === sw.fanPalm!.file)!.tree!.cards);
  });
});

describe('the forest drawn with the fade', () => {
  const cfg = (id: string): TreeCfg =>
    ({ id, en: id, source: '', file: '', cards: '', card: 1, height: 10, width: 10, hi: 1000, tex: 512 }) as TreeCfg;
  const ready = (mt: ModelTrees) => {
    for (const k of mt.kinds.values()) {
      (k as { ready: boolean }).ready = true;
      (k as { nearTris: number }).nearTris = 1000;
    }
  };
  const row = (n: number): TreeSpot[] =>
    Array.from({ length: n }, (_, i) => ({ id: 'a', x: i * 5, y: 0, z: 0, rot: 0, scale: 1, shade: 1 }));

  it('near trees as models, far as cards, the overlap as both; the switch is set by distance', () => {
    const mt = new ModelTrees([cfg('a')], null, 400, false);
    mt.lod = { eye: lodEye(), range: lodRange() };
    ready(mt);
    const s = mt.drawFaded(row(60), 0, 0, 1e9, { s: 40, band: 5, margin: 14, out: 1e9, outBand: 0 });
    expect(s).toBe(40);
    const k = mt.kinds.get('a')!;
    // Models within 40 + 5 + 14 m (0 … 55 m: 12 trees), cards beyond 40 − 5 − 14 = 21 m (25 … 295 m).
    expect(k.near.count).toBe(12);
    expect(k.far.count).toBe(55);
    expect(mt.lod.range.uLodS.value).toBe(40);
  });

  it('the triangle budget can only bring the switch nearer', () => {
    const mt = new ModelTrees([cfg('a')], null, 400, false);
    mt.lod = { eye: lodEye(), range: lodRange() };
    ready(mt);
    const s = mt.drawFaded(row(60), 0, 0, 4500, { s: 40, band: 5, margin: 14, out: 1e9, outBand: 0 });
    expect(s).toBeLessThan(40);
    expect(mt.lod.range.uLodS.value).toBe(s);
  });

  it('cards past the far edge are not handed out', () => {
    const mt = new ModelTrees([cfg('a')], null, 400, false);
    mt.lod = { eye: lodEye(), range: lodRange() };
    ready(mt);
    mt.drawFaded(row(60), 0, 0, 1e9, { s: 40, band: 5, margin: 14, out: 100, outBand: 10 });
    // Cards from 25 m to under 100 + 10 + 14 = 124 m.
    expect(mt.kinds.get('a')!.far.count).toBe(20);
  });

  it('the settings: a soft switch on PC and phone, a cap per preset, the haze margin', () => {
    expect(L.hero.band).toBeGreaterThan(0);
    expect(L.rts.band).toBeGreaterThan(0);
    expect(L.outBand).toBeGreaterThan(0);
    const q = qualityJson as unknown as Record<string, { kingdom: { treeCap?: number } }>;
    for (const p of ['low', 'pc1660', 'high', 'ultra', 'lite', 'mobile']) expect(q[p]!.kingdom.treeCap, p).toBeGreaterThan(0);
    expect(q.pc1660!.kingdom.treeCap!).toBeGreaterThan(q.mobile!.kingdom.treeCap!);
  });
});

describe('the small plants fade in', () => {
  const F = SC.fade!;
  it('each kind reaches as far as its size says, further in the RTS view', () => {
    const flowers = SC.kinds.find((k) => k.id === 'wildflowers')!;
    const crane = SC.kinds.find((k) => k.id === 'sarusCrane')!;
    expect(drawDistance(flowers, 0.6, F, 120, false)).toBe(F.min);
    expect(drawDistance(crane, 1.6, F, 120, false)).toBeGreaterThan(F.min);
    expect(drawDistance(crane, 50, F, 120, false)).toBe(F.max);
    expect(drawDistance(crane, 1.6, F, 120, true)).toBeCloseTo(drawDistance(crane, 1.6, F, 120, false) * F.rts);
    // The phone's nearer scatter radius still bounds it.
    expect(drawDistance(crane, 50, F, 60, false)).toBe(60);
  });

  it('when only the nearest few can be drawn, the fade sits inside the last of them', () => {
    expect(fadeAt(30, 5, 24, 0, 5, 0.2)).toBe(30);
    const at = fadeAt(30, 24, 24, 22, 5, 0.2);
    expect(at * 1.2).toBeLessThanOrEqual(22 - 5 + 1e-9);
    expect(fadeAt(30, 24, 24, 2, 5, 0.2)).toBe(0);
  });
});

describe('PK 2026-10-21 (D168): no broken models in the scatter', () => {
  it('the scans that broke when cut are gone; their remade Blender copies are whole and light', async () => {
    const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
      existsSync(p: string): boolean;
      readFileSync(p: string): Uint8Array;
    };
    const pub = (f: string) => new URL(`../../../public-mobile/${f}`, import.meta.url).pathname;
    for (const id of ['wagon', 'scaleTree', 'wisteria', 'botanical', 'deadTree'])
      expect(SC.kinds.some((k) => k.id === id), id).toBe(false);
    for (const f of ['plants/botanical', 'plants/dead-tree', 'props/wagon', 'plants/wisteria', 'plants/scale-tree'])
      expect(fs.existsSync(pub(`models/real/${f}.glb`)), f).toBe(false);
    // Every kind left has its model; the remade ones stay under 6 000 triangles.
    for (const k of SC.kinds) expect(fs.existsSync(pub(k.file)), k.id).toBe(true);
    for (const id of ['denseShrub', 'purpleBush', 'reeds', 'lilyPads', 'redLily', 'wildflowers', 'banyan', 'broadleafA']) {
      const k = SC.kinds.find((x) => x.id === id)!;
      const b = fs.readFileSync(pub(k.file));
      const len = new DataView(b.buffer, b.byteOffset).getUint32(12, true);
      const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as {
        meshes: Array<{ primitives: Array<{ indices: number; attributes: Record<string, number> }> }>;
        accessors: Array<{ count: number }>;
        textures?: unknown[];
      };
      const p = j.meshes[0]!.primitives[0]!;
      expect(j.accessors[p.indices]!.count / 3, id).toBeLessThan(6000);
      // Painted (vertex colours) or the tree maker's leaf atlas: never a smeared scan texture.
      expect(p.attributes.COLOR_0 !== undefined || (j.textures?.length ?? 0) > 0, id).toBe(true);
    }
  });
});
