import { describe, expect, it } from 'vitest';
import { GameEventSchema, loadConfigs, tierForEvent } from '@temples/shared';
import { demoKind, dueEvents, makeEvent, pickUser, rng, roseCombo, TEST_GIFTS, TEST_USERS } from './events';

const { giftMap } = loadConfigs();
const u = TEST_USERS[0]!;

describe('host test events are valid game events', () => {
  it.each([
    ['like', { type: 'like', count: 15 }],
    ['follow', { type: 'follow' }],
    ['share', { type: 'share' }],
    ['join', { type: 'join' }],
    ['comment', { type: 'comment', text: '3' }],
    ['!mystone', { type: 'comment', text: '!mystone' }],
    ['gift', { type: 'gift', name: 'Lion', coins: 29999 }],
  ] as const)('%s', (_n, kind) => {
    expect(GameEventSchema.safeParse(makeEvent(kind, u, 1000)).success).toBe(true);
  });

  it('every test gift lands in the right tier', () => {
    const tiers = TEST_GIFTS.map((g) =>
      tierForEvent(
        GameEventSchema.parse(makeEvent({ type: 'gift', name: g.name, coins: g.coins }, u, 1)),
        giftMap,
      ),
    );
    expect(tiers).toEqual(['small', 'medium', 'large', 'large', 'huge', 'huge']);
  });

  it('ids are unique', () => {
    const ids = new Set(Array.from({ length: 500 }, () => makeEvent({ type: 'like' }, u, 5).id));
    expect(ids.size).toBe(500);
  });

  it('a rose combo ends on the last one', () => {
    const c = roseCombo(12, u, 0);
    expect(c).toHaveLength(12);
    expect(c.filter((e) => e.comboEnd === true)).toHaveLength(1);
    expect(c.at(-1)?.comboEnd).toBe(true);
  });

  it('includes Thai and emoji names to test the @handle fallback', () => {
    expect(TEST_USERS.some((x) => /[฀-๿]/.test(x.name))).toBe(true);
    expect(TEST_USERS.some((x) => /^\p{Extended_Pictographic}+$/u.test(x.name))).toBe(true);
  });
});

describe('stress pacing', () => {
  it('sends 1,000 ±5 events per minute when ticking every 50 ms', () => {
    let sent = 0;
    for (let t = 0; t <= 60_000; t += 50) sent += dueEvents(1000, t, sent);
    expect(sent).toBeGreaterThanOrEqual(995);
    expect(sent).toBeLessThanOrEqual(1005);
  });
  it('stays exact over 10 minutes with uneven ticks', () => {
    let sent = 0;
    const r = rng(7);
    for (let t = 0; t <= 600_000; t += 30 + Math.floor(r() * 60)) sent += dueEvents(1000, t, sent);
    expect(Math.abs(sent - 10_000)).toBeLessThanOrEqual(5);
  });
});

describe('demo mix', () => {
  it('is mostly likes, some gifts, rare Lions — and every event is valid', () => {
    const r = rng(42);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const k = demoKind(r);
      const key = k.type === 'gift' ? k.name : k.type;
      counts[key] = (counts[key] ?? 0) + 1;
      expect(GameEventSchema.safeParse(makeEvent(k, pickUser(r), i)).success).toBe(true);
    }
    expect(counts.like! / 10_000).toBeGreaterThan(0.55);
    expect(counts.Rose).toBeGreaterThan(counts.Doughnut!);
    expect(counts.Lion ?? 0).toBeLessThan(40);
  });
  it('the same seed gives the same run', () => {
    const a = rng(1);
    const b = rng(1);
    expect(Array.from({ length: 20 }, () => demoKind(a))).toEqual(
      Array.from({ length: 20 }, () => demoKind(b)),
    );
  });
});
