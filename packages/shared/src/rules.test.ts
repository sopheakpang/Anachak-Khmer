import { describe, expect, it } from 'vitest';
import {
  applyToTemple,
  loadConfigs,
  parseComment,
  rankFor,
  startTemple,
  templeTarget,
  tierForCoins,
  tierForEvent,
  unitsFor,
  GameEventSchema,
  type GameEvent,
  type TempleProgress,
} from './index';

const { giftMap: map, temples } = loadConfigs();

function ev(partial: Partial<GameEvent> & Pick<GameEvent, 'type'>): GameEvent {
  return GameEventSchema.parse({ id: 'e1', user: { id: 'u1', name: 'Dara' }, ts: 0, count: 1, ...partial });
}

const fresh = (target = 3000): TempleProgress => ({
  templeId: 'preah-ko',
  target,
  progress: 0,
  stockpile: 0,
  completed: false,
});

describe('configs', () => {
  it('all config files pass their schemas', () => {
    expect(() => loadConfigs()).not.toThrow();
  });
  it('campaign starts at Preah Ko (879) and has 13 temples in order', () => {
    expect(temples.temples[0]).toMatchObject({ id: 'preah-ko', km: 'ព្រះគោ', year: '879', kitReady: true });
    expect(temples.temples).toHaveLength(13);
    expect(temples.temples.map((t) => t.order)).toEqual([...Array(13).keys()].map((i) => i + 1));
  });
  it('uses PK’s Khmer spellings', () => {
    const km = Object.fromEntries(temples.temples.map((t) => [t.id, t.km]));
    expect(km['ta-keo']).toBe('តាកែវ');
    expect(km['ta-prohm']).toBe('តាព្រហ្ម');
    expect(km['preah-khan']).toBe('ព្រះខ័ន');
  });
});

describe('tiers (spec: Stone tiers)', () => {
  it.each([
    [1, 'small'],
    [4, 'small'],
    [5, 'medium'],
    [29, 'medium'],
    [30, 'large'],
    [999, 'large'],
    [1000, 'huge'],
    [44999, 'huge'],
  ])('%i coins → %s', (coins, tier) => {
    expect(tierForCoins(coins, map)).toBe(tier);
  });

  it('AC-04: an unknown gift of 50 coins is Large by its coin value', () => {
    expect(tierForEvent(ev({ type: 'gift', giftName: 'Brand New Gift', giftCoins: 50 }), map)).toBe('large');
  });

  it('0 coins still counts as small (never crashes)', () => {
    expect(tierForCoins(0, map)).toBe('small');
  });

  it('likes, follows and shares place small stones; comments and joins place none', () => {
    expect(tierForEvent(ev({ type: 'like' }), map)).toBe('small');
    expect(tierForEvent(ev({ type: 'follow' }), map)).toBe('small');
    expect(tierForEvent(ev({ type: 'share' }), map)).toBe('small');
    expect(tierForEvent(ev({ type: 'comment', text: 'hi' }), map)).toBeNull();
    expect(tierForEvent(ev({ type: 'join' }), map)).toBeNull();
  });
});

describe('units (spec: Actions)', () => {
  it('like 1 each, follow 20, share 10, comment/join 0', () => {
    expect(unitsFor(ev({ type: 'like', count: 7 }), map)).toBe(7);
    expect(unitsFor(ev({ type: 'follow' }), map)).toBe(20);
    expect(unitsFor(ev({ type: 'share' }), map)).toBe(10);
    expect(unitsFor(ev({ type: 'comment', text: '1' }), map)).toBe(0);
    expect(unitsFor(ev({ type: 'join' }), map)).toBe(0);
  });
  it('AC-01 math: a 30-coin gift is worth 150 units', () => {
    expect(unitsFor(ev({ type: 'gift', giftCoins: 30 }), map)).toBe(150);
  });
  it('gift count multiplies (a combo event of 3 Roses = 15)', () => {
    expect(unitsFor(ev({ type: 'gift', giftCoins: 1, count: 3 }), map)).toBe(15);
  });
  it('huge numbers stay exact', () => {
    expect(unitsFor(ev({ type: 'gift', giftCoins: 44999, count: 100 }), map)).toBe(22_499_500);
  });
});

describe('temple caps (AC-07)', () => {
  it('one event moves the temple at most 15%; the rest goes to the stockpile', () => {
    const r = applyToTemple(fresh(3000), 29999 * 5, map);
    expect(r.applied).toBe(450);
    expect(r.toStockpile).toBe(29999 * 5 - 450);
    expect(r.state.progress).toBe(450);
    expect(r.state.stockpile).toBe(r.toStockpile);
  });
  it('small events apply fully', () => {
    const r = applyToTemple(fresh(3000), 10, map);
    expect(r).toMatchObject({ applied: 10, toStockpile: 0 });
  });
  it('never passes 100%; overflow to stockpile; marks completed', () => {
    const r = applyToTemple({ ...fresh(3000), progress: 2990 }, 100, map);
    expect(r.state.progress).toBe(3000);
    expect(r.state.completed).toBe(true);
    expect(r.toStockpile).toBe(90);
  });
  it('after completion everything goes to the stockpile', () => {
    const r = applyToTemple({ ...fresh(3000), progress: 3000, completed: true }, 5, map);
    expect(r).toMatchObject({ applied: 0, toStockpile: 5 });
  });
  it('zero units changes nothing', () => {
    const s = fresh();
    expect(applyToTemple(s, 0, map).state).toBe(s);
  });
  it('units are conserved across many events', () => {
    let s = fresh(3000);
    let total = 0;
    for (const u of [1, 150, 5000, 7, 149995, 20, 10]) {
      total += u;
      s = applyToTemple(s, u, map).state;
    }
    expect(s.progress + s.stockpile).toBe(total);
  });
});

describe('temple start and targets', () => {
  it('targets scale with size (Angkor Wat ×10)', () => {
    expect(templeTarget('preah-ko', temples)).toBe(3000);
    expect(templeTarget('angkor-wat', temples)).toBe(30000);
    expect(() => templeTarget('nope', temples)).toThrow();
  });
  it('the stockpile fills at most 50% of the next temple', () => {
    const t = startTemple('bakong', 100_000, temples, map);
    expect(t).toMatchObject({ target: 6000, progress: 3000, stockpile: 97_000, completed: false });
  });
  it('a small stockpile is used fully', () => {
    expect(startTemple('bakong', 200, temples, map)).toMatchObject({ progress: 200, stockpile: 0 });
  });
});

describe('ranks', () => {
  it.each([
    [0, 'Laborer'],
    [99, 'Laborer'],
    [100, 'Stone Cutter'],
    [1000, 'Mason'],
    [10000, 'Master Carver'],
    [100000, 'Royal Architect'],
    [9_999_999, 'Royal Architect'],
  ])('%i units → %s', (u, en) => {
    expect(rankFor(u, map).en).toBe(en);
  });
  it('has Khmer rank names', () => {
    expect(rankFor(100000, map).km).toBe('ស្ថាបត្យករហ្លួង');
  });
});

describe('comments', () => {
  it('1–4 join a guild', () => {
    expect(parseComment(' 3 ', map)).toEqual({ kind: 'guild', guild: '3' });
  });
  it('!mystone in English or Khmer', () => {
    expect(parseComment('!MyStone', map)).toEqual({ kind: 'myStone' });
    expect(parseComment('!1', map)).toEqual({ kind: 'heroVote', choice: 1 });
    expect(parseComment(' ! 3 ', map)).toEqual({ kind: 'heroVote', choice: 3 });
    expect(parseComment('!២', map)).toEqual({ kind: 'heroVote', choice: 2 });
    expect(parseComment('!4', map)).toBeNull();
    expect(parseComment('!ថ្មខ្ញុំ', map)).toEqual({ kind: 'myStone' });
  });
  it('other chat is ignored', () => {
    expect(parseComment('hello 1', map)).toBeNull();
    expect(parseComment('5', map)).toBeNull();
  });
});

describe('event schema', () => {
  it('AC-05: malformed events are rejected, not crashed on', () => {
    expect(GameEventSchema.safeParse({ type: 'gift' }).success).toBe(false);
    expect(
      GameEventSchema.safeParse({ id: 'x', type: 'gift', user: { id: 'u', name: 'a' }, ts: 1 }).success,
    ).toBe(false);
    expect(
      GameEventSchema.safeParse({ id: 'x', type: 'dance', user: { id: 'u', name: 'a' }, ts: 1 }).success,
    ).toBe(false);
    expect(
      GameEventSchema.safeParse({ id: 'x', type: 'comment', user: { id: 'u', name: 'a' }, ts: 1 }).success,
    ).toBe(false);
  });
  it('count defaults to 1', () => {
    expect(ev({ type: 'like' }).count).toBe(1);
  });
});
