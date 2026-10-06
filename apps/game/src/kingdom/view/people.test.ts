import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { workerGeometry } from '../../engine/figures';
import { spearmanGeometry } from './art';
import { buffaloGeometry, dogGeometry } from './beasts';
import {
  buffaloRiderGeometry,
  commanderGeometry,
  eraLookOf,
  horsemanGeometry,
  oxCartUnitGeometry,
  soldierGeometry,
  villagerGeometry,
  watchmanGeometry,
  type Job,
} from './people';

const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;
const ok = (g: THREE.BufferGeometry) => {
  const n = g.getAttribute('position').count;
  for (const a of ['normal', 'color', 'limb', 'limbZ']) expect(g.getAttribute(a).count, a).toBe(n);
};
const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

describe('Kingdom people (occupation and era looks)', () => {
  const base = tris(spearmanGeometry());

  it('every villager job carries its own tool, and the plain worker is unchanged', () => {
    const idle = villagerGeometry('idle', 'early').getAttribute('position').count;
    const jobs: Job[] = [
      'builder',
      'farmer',
      'fisher',
      'woodcutter',
      'quarryman',
      'goldworker',
      'hunter',
      'forager',
      'porter',
    ];
    for (const j of jobs) {
      const g = villagerGeometry(j, 'early');
      ok(g);
      expect(g.getAttribute('position').count, j).not.toBe(idle);
      expect(tris(g), j).toBeLessThan(base * 1.4);
    }
    // The default worker (Build tab crowds) keeps its jewellery and top-knot.
    expect(workerGeometry().getAttribute('position').count).toBeGreaterThan(
      workerGeometry('none', { jewelry: false }).getAttribute('position').count,
    );
  });

  it('soldiers change their dress with the era', () => {
    for (const t of ['spearman', 'swordsman', 'archer'] as const) {
      const early = soldierGeometry(t, 'early');
      const aw = soldierGeometry(t, 'angkorWat');
      ok(early);
      ok(aw);
      expect(aw.getAttribute('position').count, t).toBeGreaterThan(early.getAttribute('position').count);
      expect(tris(aw), t).toBeLessThan(base * 1.4 * 1.6);
    }
    expect(eraLookOf('roluos')).toBe('early');
    expect(eraLookOf('eleventh')).toBe('baphuon');
    expect(eraLookOf('suryavarman2')).toBe('angkorWat');
    expect(eraLookOf('jayavarman7')).toBe('bayon');
  });

  it('the commander has his parasol, the watchman his dog; mounts stay in budget', () => {
    for (const e of ['early', 'angkorWat', 'bayon'] as const) {
      const c = commanderGeometry(e);
      ok(c);
      expect(box(c).max.y).toBeGreaterThan(3);
    }
    const w = watchmanGeometry('early');
    ok(w);
    expect(box(w).max.x).toBeGreaterThan(0.5);
    const h = horsemanGeometry('angkorWat');
    const b = buffaloRiderGeometry('early');
    const cart = oxCartUnitGeometry();
    for (const g of [h, b, cart]) ok(g);
    expect(tris(h)).toBeLessThan(9000);
    expect(tris(b)).toBeLessThan(9000);
    expect(tris(cart)).toBeLessThan(12000);
    expect(tris(dogGeometry())).toBeLessThan(1200);
    expect(tris(buffaloGeometry())).toBeLessThan(3000);
  });
});

describe('tool-to-job in the game (scene.jobOf)', () => {
  it('a villager takes the tool of what he is doing', async () => {
    const { jobOf } = await import('./scene');
    const u = (task: object, extra: object = {}) =>
      ({
        id: 1,
        type: 'villager',
        team: 0,
        x: 0,
        z: 0,
        hp: 40,
        heading: 0,
        path: null,
        repathAt: 0,
        carry: null,
        ready: 0,
        anim: 'gather',
        task,
        ...extra,
      }) as unknown as Parameters<typeof jobOf>[0];
    const g = (nodeKind: string, res = 'food') => ({
      kind: 'gather',
      node: 1,
      field: null,
      res,
      phase: 'go',
      near: [0, 0],
      nodeKind,
    });
    expect(jobOf(u(g('tree', 'wood')))).toBe('woodcutter');
    expect(jobOf(u(g('stone', 'stone')))).toBe('quarryman');
    expect(jobOf(u(g('gold', 'gold')))).toBe('goldworker');
    expect(jobOf(u(g('fish')))).toBe('fisher');
    expect(jobOf(u(g('fruit')))).toBe('forager');
    expect(jobOf(u({ kind: 'gather', node: null, field: 3, res: 'food', phase: 'go', near: [0, 0] }))).toBe(
      'farmer',
    );
    expect(jobOf(u({ kind: 'build', building: 2 }))).toBe('builder');
    expect(jobOf(u({ kind: 'hunt', animal: 4 }))).toBe('hunter');
    expect(jobOf(u({ kind: 'idle' }, { anim: 'walk', carry: { res: 'wood', n: 5 } }))).toBe('porter');
    expect(jobOf(u({ kind: 'idle' }, { anim: 'idle' }))).toBe('idle');
  });
});
