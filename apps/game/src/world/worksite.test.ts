import { describe, expect, it } from 'vitest';
import { ACT } from '../engine/figures';
import { CREW, SITE, WorkSite, type Tower } from './worksite';

const towers = (heights: number[]): Tower[] =>
  [
    [-8, -5],
    [0, -5],
    [8, -5],
    [-8, 5],
    [0, 5],
    [8, 5],
  ].map(([x, z], i) => ({ x: x!, z: z!, height: heights[i] ?? 0, top: 12 }));

/** Run the crew for `sec` seconds in 0.1 s steps, calling `each` after every step. */
function run(
  site: WorkSite,
  tw: Tower[],
  stock: number,
  sec: number,
  each?: (t: number) => void,
  from = 0,
): number {
  let t = from;
  for (; t < from + sec; t += 0.1) {
    site.update(t, tw, stock);
    each?.(t);
  }
  return t;
}

describe('construction crew (busy workers)', () => {
  it('has haulers, carvers, lever teams and a rope team; small presets keep every job', () => {
    const full = new WorkSite(100);
    for (const r of ['hauler', 'carver', 'lever', 'puller'] as const) expect(full.count(r)).toBe(CREW[r]);
    const small = new WorkSite(12);
    expect(small.workers.length).toBe(12);
    for (const r of ['hauler', 'carver', 'lever', 'puller'] as const)
      expect(small.count(r)).toBeGreaterThan(0);
  });

  it('haulers fetch a block, carry it on the head to a tower, set it down and go back', () => {
    const site = new WorkSite(40);
    const tw = towers([4, 4, 4, 4, 4, 4]);
    const drops = new Map<number, number>();
    const was = new Map<number, boolean>();
    run(site, tw, 20, 90, () => {
      for (const w of site.workers.filter((x) => x.role === 'hauler')) {
        if (was.get(w.id) && !w.carrying) drops.set(w.id, (drops.get(w.id) ?? 0) + 1);
        was.set(w.id, w.carrying);
        if (w.state === 'toTower') expect(w.act).toBe(ACT.carry);
        // Never walks through a tower.
        for (const t of tw) expect(Math.hypot(w.x - t.x, w.z - t.z)).toBeGreaterThan(SITE.towerRadius - 0.05);
      }
    });
    const haulers = site.workers.filter((w) => w.role === 'hauler');
    expect(haulers.every((w) => (drops.get(w.id) ?? 0) >= 1)).toBe(true);
  });

  it('blocks go to the towers furthest behind; with an empty pile they come from the gate', () => {
    const site = new WorkSite(40);
    const tw = towers([10, 10, 2, 10, 10, 3]); // towers 2 and 5 are behind
    const targets: Array<[number, number]> = [];
    run(site, tw, 5, 40, () => {
      for (const w of site.workers) if (w.role === 'hauler' && w.state === 'toTower') targets.push(w.target);
    });
    expect(targets.length).toBeGreaterThan(0);
    const near = (i: number, p: [number, number]) =>
      Math.hypot(p[0] - tw[i]!.x, p[1] - tw[i]!.z) < SITE.towerRadius + 1;
    // Most carried blocks go to the two or three towers most behind (2, 5, then the next).
    const behind = targets.filter((p) => near(2, p) || near(5, p)).length;
    expect(behind / targets.length).toBeGreaterThan(0.6);

    const empty = new WorkSite(40);
    run(empty, tw, 0, 1);
    const h = empty.workers.find((w) => w.role === 'hauler' && w.state === 'toSource')!;
    expect(Math.hypot(h.target[0] - SITE.gate[0], h.target[1] - SITE.gate[1])).toBeLessThan(4);
  });

  it('carvers spend most of their time hammering at a block in the carving yard', () => {
    const site = new WorkSite(40);
    let hammer = 0;
    let all = 0;
    run(site, towers([]), 10, 60, () => {
      for (const w of site.workers.filter((x) => x.role === 'carver')) {
        all++;
        if (w.act === ACT.hammer) hammer++;
      }
    });
    expect(hammer / all).toBeGreaterThan(0.6);
  });

  it('lever teams work in pairs at the towers still being built, and rest when all are done', () => {
    const site = new WorkSite(40);
    const tw = towers([6, 6, 6, 12, 12, 12]); // front row finished
    run(site, tw, 10, 40);
    const levers = site.workers.filter((w) => w.role === 'lever');
    for (const w of levers) {
      expect(w.act).toBe(ACT.lever);
      const d = Math.min(...tw.slice(0, 3).map((t) => Math.hypot(w.x - t.x, w.z - t.z)));
      expect(d).toBeLessThan(SITE.towerRadius + 0.6);
    }
    const done = towers([12, 12, 12, 12, 12, 12]);
    run(site, done, 10, 30, undefined, 40);
    for (const w of site.workers.filter((x) => x.role === 'lever')) expect(w.act).toBe(ACT.stand);
  });

  it('the rope team lifts blocks up the tallest growing tower, leaning back as it rises', () => {
    const site = new WorkSite(40);
    const tw = towers([3, 3, 3, 3, 8, 3]); // tower 4 is the tallest still growing
    const ys: number[] = [];
    run(site, tw, 10, 30, (t) => {
      if (t > 20) ys.push(site.lift!.block[1]);
    });
    expect(site.lift?.tower).toBe(4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4); // rises, then a new block starts low
    const pullers = site.workers.filter((w) => w.role === 'puller');
    const pulling = pullers.filter((w) => w.act === ACT.pull);
    for (const w of pulling) expect(w.lean).toBeLessThan(0);
    // Everyone stands on the outer (+z) side of that tower, in a line.
    for (const w of pullers) expect(w.z).toBeGreaterThan(tw[4]!.z + SITE.towerRadius);
    // All finished: no rope team, the pullers carry stones instead.
    run(site, towers([12, 12, 12, 12, 12, 12]), 10, 5, undefined, 30);
    expect(site.lift).toBeNull();
    expect(site.workers.filter((w) => w.role === 'puller').every((w) => w.act !== ACT.pull)).toBe(true);
  });
});
