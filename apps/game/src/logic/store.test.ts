import { describe, expect, it } from 'vitest';
import type { GameState, StonePlaced } from '@temples/shared';
import { Activity } from './activity';
import { biggestStoneOf, emptyModel, newestNames, reduce } from './store';

const state = (templeId = 'preah-ko', progress = 0): GameState => ({
  kind: 'state',
  mode: 'build',
  temple: {
    templeId,
    target: 3000,
    progress,
    stockpile: 0,
    completed: false,
    km: 'ព្រះគោ',
    en: 'Preah Ko',
    year: '879',
    king: 'Indravarman I',
    order: 1,
  },
  topTemple: [],
  topToday: [],
  guilds: { '1': 0, '2': 0, '3': 0, '4': 0 },
  likesToday: 0,
  giftsToday: 0,
  paused: false,
  ts: 0,
});

const stone = (p: Partial<StonePlaced>): StonePlaced => ({
  kind: 'stone',
  eventId: 'e',
  userId: 'u1',
  name: 'Dara',
  tier: 'small',
  stones: 1,
  units: 5,
  applied: 5,
  toStockpile: 0,
  source: 'gift',
  slot: { kind: 'normal', index: 2 },
  ts: 0,
  ...p,
});

describe('game store (prompt 07)', () => {
  it('applies state, names and stones', () => {
    const m = emptyModel();
    reduce(m, state(), 0);
    reduce(
      m,
      {
        kind: 'names',
        templeId: 'preah-ko',
        names: [{ slot: { kind: 'big', index: 0 }, name: 'Sokha', tier: 'large', userId: 'u2' }],
        ts: 0,
      },
      0,
    );
    const r = reduce(m, stone({}), 10);
    expect(r.stone?.name).toBe('Dara');
    expect([...m.names.keys()]).toEqual(['big:0', 'normal:2']);
    expect(m.toasts).toHaveLength(1);
  });

  it('keeps the last 4 feed lines, newest first', () => {
    const m = emptyModel();
    for (let i = 0; i < 6; i++)
      reduce(m, { kind: 'feed', userId: 'u', name: `N${i}`, action: 'like', count: 1, units: 1, ts: i }, i);
    expect(m.feed.map((f) => f.name)).toEqual(['N5', 'N4', 'N3', 'N2']);
  });

  it('toasts expire after 4 s and at most 3 show', () => {
    const m = emptyModel();
    for (let i = 0; i < 5; i++) reduce(m, stone({ name: `T${i}` }), i * 100);
    expect(m.toasts.map((t) => t.name)).toEqual(['T2', 'T3', 'T4']);
    reduce(m, stone({ name: 'late' }), 5000);
    expect(m.toasts.map((t) => t.name)).toEqual(['late']);
  });

  it('a new temple clears carved names', () => {
    const m = emptyModel();
    reduce(m, state(), 0);
    reduce(m, stone({}), 0);
    reduce(m, state('bakong'), 0);
    expect(m.names.size).toBe(0);
  });

  it('safe zones and pause commands', () => {
    const m = emptyModel();
    reduce(m, { kind: 'command', name: 'safeZones', on: true, ts: 0 }, 0);
    reduce(m, { kind: 'command', name: 'pause', ts: 0 }, 0);
    expect(m.safeZones).toBe(true);
    expect(m.paused).toBe(true);
  });

  it('finds a viewer’s biggest stone (big pieces first)', () => {
    const m = emptyModel();
    reduce(m, stone({ slot: { kind: 'normal', index: 5 }, tier: 'huge' }), 0);
    reduce(m, stone({ slot: { kind: 'big', index: 1 }, tier: 'large' }), 0);
    reduce(m, stone({ slot: { kind: 'normal', index: 9 }, tier: 'small', userId: 'u9' }), 0);
    expect(biggestStoneOf(m, 'u1')).toEqual({ kind: 'big', index: 1 });
    expect(biggestStoneOf(m, 'nobody')).toBeNull();
  });
});

describe('activity (prompt 11)', () => {
  it('counts the last 60 s per tier and scales convoys', () => {
    const a = new Activity();
    for (let i = 0; i < 20; i++) a.add(i * 1000, 'small');
    a.add(10_000, 'huge');
    a.add(10_000, 'large', 3);
    expect(a.counts(30_000)).toEqual({ small: 20, medium: 0, large: 3, huge: 1 });
    expect(a.convoys(30_000, 100)).toEqual({ workers: 4, oxcart: 1, elephants: 3, raft: 1 });
    expect(a.counts(200_000)).toEqual({ small: 0, medium: 0, large: 0, huge: 0 });
    expect(a.convoys(200_000, 100)).toEqual({ workers: 2, oxcart: 1, elephants: 1, raft: 1 });
  });
});

describe('map routes', () => {
  it('along() never fails on empty or single-point routes', async () => {
    const { along } = await import('../scenes/along');
    expect(along([], 0.5)).toEqual([0, 0]);
    expect(along([[3, 4]], 0.5)).toEqual([3, 4]);
    expect(
      along(
        [
          [0, 0],
          [10, 0],
        ],
        0.25,
      ),
    ).toEqual([2.5, 0]);
    expect(
      along(
        [
          [0, 0],
          [10, 0],
        ],
        1.25,
      ),
    ).toEqual([2.5, 0]);
  });
});

describe('carving yard names', () => {
  it('newestNames: newest first, no repeats, at most n', () => {
    const m = new Map([
      ['a', { name: 'Dara', tier: 'small' as const, userId: 'u1' }],
      ['b', { name: 'Sokha', tier: 'small' as const, userId: 'u2' }],
      ['c', { name: 'Dara', tier: 'large' as const, userId: 'u1' }],
      ['d', { name: 'Vanna', tier: 'small' as const, userId: 'u3' }],
    ]);
    expect(newestNames(m, 8)).toEqual(['Vanna', 'Dara', 'Sokha']);
    expect(newestNames(m, 2)).toEqual(['Vanna', 'Dara']);
  });
});
