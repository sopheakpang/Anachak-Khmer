import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../sim/map';
import {
  centreOn,
  clampPan,
  clampZoom,
  glyphFor,
  isDrag,
  placeLabels,
  screenToWorld,
  worldToScreen,
  zoomAbout,
  ZOOM_MAX,
  ZOOM_MIN,
} from './ancientMap';

const map = { size: 1080, tile: 2 };
const fit = 728 / 1080;

describe('ancient map helpers', () => {
  it('screen ↔ world round-trips at several zooms and pans', () => {
    for (const zoom of [1, 1.7, 3, 6])
      for (const pan of [
        { x: 0, y: 0 },
        { x: 346, y: 0 },
        { x: -1200, y: -800 },
      ])
        for (const [px, py] of [
          [0, 0],
          [714, 364],
          [1419, 727],
        ] as const) {
          const [x, z] = screenToWorld(px, py, pan, zoom, map, fit);
          const [sx, sy] = worldToScreen(x, z, pan, zoom, map, fit);
          expect(sx).toBeCloseTo(px, 6);
          expect(sy).toBeCloseTo(py, 6);
        }
  });

  it('matches tileToWorld (world is centred on the map)', () => {
    const pan = { x: 10, y: 20 };
    const [x, z] = tileToWorld(map, 100, 700);
    const [sx, sy] = worldToScreen(x, z, pan, 2, map, fit);
    expect(sx).toBeCloseTo(10 + 100.5 * fit * 2, 6);
    expect(sy).toBeCloseTo(20 + 700.5 * fit * 2, 6);
    // The map's top-left corner and centre.
    expect(screenToWorld(10, 20, pan, 2, map, fit)).toEqual([-1080, -1080]);
    const c = centreOn(0, 0, 1, map, fit, 1420, 728);
    expect(screenToWorld(710, 364, c, 1, map, fit)[0]).toBeCloseTo(0, 6);
    expect(screenToWorld(710, 364, c, 1, map, fit)[1]).toBeCloseTo(0, 6);
  });

  it('clamps zoom to 1×–6× and zooms about the cursor', () => {
    expect(clampZoom(0.2)).toBe(ZOOM_MIN);
    expect(clampZoom(40)).toBe(ZOOM_MAX);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(2.5)).toBe(2.5);
    const pan = { x: 346, y: 0 };
    const before = screenToWorld(500, 300, pan, 1, map, fit);
    const z = zoomAbout(pan, 1, 3, 500, 300);
    expect(z.zoom).toBe(3);
    const after = screenToWorld(500, 300, z.pan, z.zoom, map, fit);
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(zoomAbout(pan, 6, 20, 0, 0).zoom).toBe(6);
  });

  it('keeps the map in view when panning', () => {
    const p = clampPan({ x: 5000, y: -9000 }, 2, fit, 1080, 1420, 728);
    expect(p.x).toBe(710);
    expect(p.y).toBeCloseTo(364 - 1080 * fit * 2, 6);
    const ok = { x: 100, y: -50 };
    expect(clampPan(ok, 2, fit, 1080, 1420, 728)).toEqual(ok);
  });

  it('maps terrain to ink glyphs', () => {
    expect(glyphFor('hill')).toBe('mountain');
    expect(glyphFor('forest')).toBe('tree');
    expect(glyphFor('water')).toBe('waves');
    expect(glyphFor('ford')).toBe('ford');
    expect(glyphFor('rock')).toBe('stones');
    expect(glyphFor('ruin')).toBe('ruin');
    expect(glyphFor('grass')).toBeNull();
  });

  it('tells a click from a drag (6 px)', () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(5, 4)).toBe(true);
    expect(isDrag(-6, 0)).toBe(true);
  });

  it('hides labels that would overlap, keeping the earlier ones', () => {
    const keep = placeLabels([
      { x: 0, y: 0, w: 100, h: 40 },
      { x: 50, y: 20, w: 100, h: 40 },
      { x: 100, y: 0, w: 50, h: 40 },
      { x: 0, y: 100, w: 100, h: 40 },
    ]);
    expect(keep).toEqual([true, false, true, true]);
  });
});
