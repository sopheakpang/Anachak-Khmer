import { describe, expect, it } from 'vitest';
import { loadConfigs } from '@temples/shared';
import { Director, type DirectorView } from './director';

const { camera } = loadConfigs();
const T0 = 1_000_000;

/** Run the director every 100 ms from `from` to `to`, keeping activity alive. */
function run(d: Director, from: number, to: number, keepAlive = true): DirectorView[] {
  const out: DirectorView[] = [];
  for (let t = from; t <= to; t += 100) {
    if (keepAlive && t % 10_000 === 0) d.onActivity(t);
    out.push(d.tick(t));
  }
  return out;
}

describe('AC-10: base loop', () => {
  it('runs map 15 s → quarry 10 → river 15 → hauling 10 → site 10 and repeats (±0.5 s)', () => {
    const d = new Director(camera, T0);
    const views = run(d, T0, T0 + 120_000);
    const changes: Array<[string, number]> = [];
    views.forEach((v, i) => {
      if (i === 0 || v.shot !== views[i - 1]!.shot) changes.push([v.shot, i * 100]);
    });
    expect(changes.slice(0, 6)).toEqual([
      ['map', 0],
      ['quarry', 15_000],
      ['river', 25_000],
      ['hauling', 40_000],
      ['site', 50_000],
      ['map', 60_000],
    ]);
  });
});

describe('AC-11: full-screen cuts', () => {
  it('two Large gifts 2 s apart play one after the other, never starting within 8 s', () => {
    const d = new Director(camera, T0);
    d.onStone('large', { kind: 'big', index: 0 }, 'Dara', T0 + 1000);
    run(d, T0, T0 + 1900);
    d.onStone('large', { kind: 'big', index: 1 }, 'Sokha', T0 + 3000);
    const views = run(d, T0 + 2000, T0 + 20_000);
    const cutStarts: number[] = [];
    let prev: string | null = 'Dara'; // Dara's cut is already running when this window starts
    views.forEach((v, i) => {
      const who = v.cut?.name ?? null;
      if (who && who !== prev) cutStarts.push(2000 + i * 100);
      prev = who;
    });
    expect(views.some((v) => v.cut?.name === 'Sokha')).toBe(true);
    expect(cutStarts).toEqual([9000]); // Dara started at 1000 (before this window), Sokha at 1000 + 8000
    expect(views.filter((v) => v.mode === 'cut').every((v) => v.shot === 'site')).toBe(true);
  });

  it('the loop resumes where it left off after a cut', () => {
    const d = new Director(camera, T0);
    run(d, T0, T0 + 20_000); // 5 s into quarry
    d.onStone('huge', null, 'Lion', T0 + 20_000);
    const during = d.tick(T0 + 22_000);
    expect(during.mode).toBe('cut');
    const after = d.tick(T0 + 26_100);
    expect(after.shot).toBe('quarry');
    expect(after.t).toBeCloseTo(0.51, 1);
  });

  it('the queue keeps at most 4, biggest first; overflow goes to PiP', () => {
    const d = new Director(camera, T0);
    d.onStone('large', null, 'first', T0);
    d.onStone('large', null, 'L1', T0 + 10);
    d.onStone('huge', null, 'H1', T0 + 20);
    d.onStone('large', null, 'L2', T0 + 30);
    d.onStone('large', null, 'L3', T0 + 40);
    d.onStone('large', null, 'L4', T0 + 50);
    expect(d.queued).toBe(4);
    expect(d.tick(T0 + 60).pip?.name).toBe('L4');
    expect(d.tick(T0 + 8000).cut?.name).toBe('H1');
  });
});

describe('AC-12: small and medium stones', () => {
  it('never take the full screen; they show in PiP for 4 s', () => {
    const d = new Director(camera, T0);
    d.onStone('small', { kind: 'normal', index: 3 }, 'Dara', T0);
    d.onStone('medium', { kind: 'normal', index: 9 }, 'Sokha', T0 + 100);
    const v = d.tick(T0 + 200);
    expect(v.mode).toBe('loop');
    expect(v.pip).toMatchObject({ name: 'Sokha', slot: { kind: 'normal', index: 9 } });
    expect(d.tick(T0 + 4200).pip).toBeNull();
  });

  it('unnamed stones (likes) show no PiP', () => {
    const d = new Director(camera, T0);
    d.onStone('small', null, null, T0);
    expect(d.tick(T0 + 100).pip).toBeNull();
  });
});

describe('AC-13 camera part: !mystone', () => {
  it('shows the viewer’s stone in PiP for 5 s', () => {
    const d = new Director(camera, T0);
    d.onMyStone({ kind: 'big', index: 2 }, 'Pich', T0);
    expect(d.tick(T0 + 4900).pip?.slot).toEqual({ kind: 'big', index: 2 });
    expect(d.tick(T0 + 5100).pip).toBeNull();
  });
});

describe('idle and pause', () => {
  it('after 60 s without events, tours map and site slowly', () => {
    const d = new Director(camera, T0);
    const v = run(d, T0, T0 + 61_000, false).at(-1)!;
    expect(v.mode).toBe('idle');
    expect(d.tick(T0 + 61_000 + 20_500).shot).toBe('site');
    d.onActivity(T0 + 90_000);
    expect(d.tick(T0 + 90_100).mode).toBe('loop');
  });

  it('pause freezes the loop', () => {
    const d = new Director(camera, T0);
    d.tick(T0 + 5000);
    d.setPaused(true, T0 + 5000);
    d.tick(T0 + 50_000);
    d.setPaused(false, T0 + 50_000);
    const v = d.tick(T0 + 50_100);
    expect(v.shot).toBe('map');
    expect(v.t).toBeCloseTo(5.1 / 15, 2);
  });

  it('a locked shot (for screenshots) stays put', () => {
    const d = new Director(camera, T0);
    d.locked = 'river';
    expect(d.tick(T0 + 99_999).shot).toBe('river');
  });
});
