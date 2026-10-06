import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { heightOf, templeGeometry } from './temples';
import { headwear, nobleHouseGeometry, stiltHouseGeometry } from './art';

const data = loadKingdom();
const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe('campaign temple models (D54)', () => {
  const chapters = data.campaign.chapters.filter((c) => c.form.kind !== 'kit');

  it('every temple but Preah Ko (the stone kit) gets a model that fits its site', () => {
    expect(chapters.length).toBe(data.campaign.chapters.length - 1);
    for (const ch of chapters) {
      const g = templeGeometry(ch, 2);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const W = ch.footprint[0] * 2;
      const D = ch.footprint[1] * 2;
      expect(b.min.y, ch.temple).toBeGreaterThanOrEqual(-0.01);
      // Inside the footprint (a stair may reach a little past the edge).
      expect(b.max.x - b.min.x, ch.temple).toBeLessThanOrEqual(W + 3);
      expect(b.max.z - b.min.z, ch.temple).toBeLessThanOrEqual(D + 3);
      expect(heightOf(g), ch.temple).toBeGreaterThan(5);
      expect(tri(g), ch.temple).toBeLessThan(20_000); // all 12 stay far inside the frame budget
    }
  });

  it('keeps the silhouettes apart: Angkor Wat the tallest, Banteay Srei small, Bakheng on its hill', () => {
    const h = (id: string) =>
      heightOf(
        templeGeometry(
          data.campaign.chapters.find((c) => c.temple === id)!,
          2,
        ),
      );
    expect(h('angkor-wat')).toBeGreaterThan(h('ta-prohm'));
    expect(h('angkor-wat')).toBeGreaterThan(h('bakong'));
    expect(h('banteay-srei')).toBeLessThan(h('bakong'));
    expect(h('phnom-bakheng')).toBeGreaterThan(h('pre-rup'));
  });
});

describe('houses from PK’s reference file', () => {
  it('Kantaang stilt house stands on stone ssom footings and fits its 4 × 4 m plot', () => {
    const g = stiltHouseGeometry();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeLessThanOrEqual(4.2);
    expect(b.max.y).toBeGreaterThan(4); // raised floor + gable
    expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
  });

  it('Rongdeung noble house is taller and wider, with the prom spire on top', () => {
    const a = stiltHouseGeometry();
    const n = nobleHouseGeometry();
    a.computeBoundingBox();
    n.computeBoundingBox();
    expect(n.boundingBox!.max.y).toBeGreaterThan(a.boundingBox!.max.y + 1.5);
    expect(n.boundingBox!.max.x - n.boundingBox!.min.x).toBeLessThanOrEqual(6.2);
  });

  it('opponents wear their own headwear (Cham lotus headdress, Đại Việt hat); Khmer rivals none', () => {
    expect(headwear('cham', 1.9).length).toBeGreaterThan(3);
    expect(headwear('daiviet', 1.9).length).toBe(1);
    expect(headwear('khmer', 1.9)).toEqual([]);
    expect(headwear('rival', 1.9)).toEqual([]);
  });
});
