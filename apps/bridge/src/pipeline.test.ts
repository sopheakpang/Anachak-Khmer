import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfigs, type BridgeMessage, type FeedLine, type StonePlaced } from '@temples/shared';
import { Pipeline } from './pipeline';
import { MemoryStore } from './store';

const configs = loadConfigs();
const T0 = new Date('2026-09-28T19:00:00').getTime();

let out: BridgeMessage[];
let store: MemoryStore;
let p: Pipeline;
let seq = 0;

beforeEach(() => {
  out = [];
  store = new MemoryStore(configs);
  p = new Pipeline(configs, store, ['badword'], (m) => out.push(m));
  seq = 0;
});

const user = (id = 'u1', name = 'Dara') => ({ id, name, handle: id });
function send(type: string, extra: Record<string, unknown> = {}, u = user(), ts = T0) {
  return p.enqueue({ id: `e${++seq}`, type, user: u, ts, count: 1, ...extra });
}
const stones = () => out.filter((m): m is StonePlaced => m.kind === 'stone');
const feed = () => out.filter((m): m is FeedLine => m.kind === 'feed');
const commands = (name: string) => out.filter((m) => m.kind === 'command' && m.name === name);

describe('AC-01: a 30-coin gift', () => {
  it('becomes one Large stone worth 150 units within one tick (≤ 200 ms)', () => {
    send('gift', { giftName: 'Doughnut', giftCoins: 30 });
    p.tick(T0 + 50);
    expect(stones()).toHaveLength(1);
    expect(stones()[0]).toMatchObject({ tier: 'large', units: 150, applied: 150, stones: 1, name: 'Dara' });
    expect(store.progress().progress).toBe(150);
  });
});

describe('AC-02: gift combos', () => {
  it('12 Roses in one streak → 12 named small stones and one feed line ×12', () => {
    for (let i = 1; i <= 12; i++) send('gift', { giftName: 'Rose', giftCoins: 1, comboEnd: i === 12 });
    p.tick(T0 + 50);
    expect(stones().reduce((n, s) => n + s.stones, 0)).toBe(12);
    expect(stones().every((s) => s.tier === 'small' && s.name === 'Dara')).toBe(true);
    const gifts = feed().filter((f) => f.action === 'gift');
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({ giftName: 'Rose', count: 12, units: 60 });
  });

  it('a streak that never sends comboEnd is closed after 5 s idle', () => {
    for (let i = 0; i < 3; i++) send('gift', { giftName: 'Rose', giftCoins: 1, comboEnd: false });
    p.tick(T0 + 50);
    expect(feed().filter((f) => f.action === 'gift')).toHaveLength(0);
    p.tick(T0 + 50 + 5000);
    expect(feed().filter((f) => f.action === 'gift')[0]).toMatchObject({ count: 3 });
  });

  it('a gift with no combo info shows in the feed at once', () => {
    send('gift', { giftName: 'Lion', giftCoins: 29999 });
    p.tick(T0 + 50);
    expect(feed()[0]).toMatchObject({ giftName: 'Lion', count: 1 });
  });
});

describe('AC-03: duplicates', () => {
  it('the same event id is counted once', () => {
    const e = { id: 'same', type: 'gift', user: user(), giftCoins: 5, ts: T0 };
    expect(p.enqueue(e)).toBe(true);
    expect(p.enqueue(e)).toBe(false);
    p.tick(T0 + 50);
    expect(stones()).toHaveLength(1);
  });
});

describe('AC-05: malformed events', () => {
  it('are logged and ignored; nothing crashes', () => {
    expect(p.enqueue(null)).toBe(false);
    expect(p.enqueue({ type: 'gift' })).toBe(false);
    expect(p.enqueue({ id: 'x', type: 'gift', user: user(), ts: T0 })).toBe(false); // no coins
    expect(p.enqueue('garbage')).toBe(false);
    expect(p.invalid).toBe(4);
    p.tick(T0 + 50);
    expect(stones()).toHaveLength(0);
  });
});

describe('AC-06 in the pipeline: names', () => {
  it('Thai names show the @handle; blocklisted names show the fallback', () => {
    send('gift', { giftCoins: 1, giftName: 'Rose' }, { id: 'somchai', name: 'สมชาย', handle: 'somchai' });
    send('gift', { giftCoins: 1, giftName: 'Rose' }, { id: 'x', name: 'Badword King', handle: 'x' });
    p.tick(T0 + 50);
    expect(stones().map((s) => s.name)).toEqual(['@somchai', 'អ្នកសាងសង់']);
  });
});

describe('AC-07 in the pipeline: caps', () => {
  it('a Lion moves Preah Ko 15% and fills the stockpile', () => {
    send('gift', { giftName: 'Lion', giftCoins: 29999 });
    p.tick(T0 + 50);
    expect(store.progress()).toMatchObject({ progress: 450, stockpile: 29999 * 5 - 450 });
  });
});

describe('AC-08: follow once per stream', () => {
  it('a second follow gives no units', () => {
    send('follow');
    send('follow');
    p.tick(T0 + 50);
    expect(stones()).toHaveLength(1);
    expect(store.progress().progress).toBe(20);
  });
  it('a new stream allows it again', () => {
    send('follow');
    p.tick(T0 + 50);
    p.newStream();
    send('follow');
    p.tick(T0 + 100);
    expect(store.progress().progress).toBe(40);
  });
});

describe('likes', () => {
  it('are batched per user every 2 s into one unnamed stone group and one feed line', () => {
    for (let i = 0; i < 15; i++) send('like');
    send('like', { count: 5 }, user('u2', 'Sokha'));
    p.tick(T0 + 1000);
    expect(stones()).toHaveLength(0);
    p.tick(T0 + 2000);
    expect(stones()).toHaveLength(2);
    expect(stones()[0]).toMatchObject({ name: null, stones: 15, units: 15, tier: 'small' });
    expect(feed().map((f) => [f.name, f.count])).toEqual([
      ['Dara', 15],
      ['Sokha', 5],
    ]);
    expect(store.likes('2026-09-28')).toBe(20);
  });
});

describe('shares', () => {
  it('count once per user per 5 minutes', () => {
    send('share');
    send('share', {}, user(), T0 + 1000);
    p.tick(T0 + 50);
    expect(store.progress().progress).toBe(10);
    send('share');
    p.tick(T0 + 5 * 60_000 + 100);
    expect(store.progress().progress).toBe(20);
  });
});

describe('comments', () => {
  it('guild join, then one change per stream', () => {
    send('comment', { text: '1' });
    p.tick(T0 + 50);
    send('comment', { text: '2' });
    p.tick(T0 + 100);
    send('comment', { text: '3' });
    p.tick(T0 + 150);
    expect(store.guildOf('u1')).toBe('2');
    expect(commands('guildJoined')).toHaveLength(2);
  });

  it('!mystone: 1 per user per 2 min and 1 globally per 10 s', () => {
    send('comment', { text: '!mystone' });
    p.tick(T0 + 50);
    send('comment', { text: '!mystone' }, user('u2', 'Sokha'));
    p.tick(T0 + 5_000); // global cooldown
    send('comment', { text: '!ថ្មខ្ញុំ' }, user('u2', 'Sokha'));
    p.tick(T0 + 11_000);
    send('comment', { text: '!mystone' });
    p.tick(T0 + 60_000); // u1 still in 2-min cooldown
    expect(commands('myStone').map((c) => (c.kind === 'command' ? c.userId : ''))).toEqual(['u1', 'u2']);
  });

  it('normal chat does nothing', () => {
    send('comment', { text: 'សួស្តី' });
    p.tick(T0 + 50);
    expect(out.filter((m) => m.kind !== 'state')).toHaveLength(0);
  });
});

describe('joins', () => {
  it('only 1 of every 10 joins is welcomed', () => {
    for (let i = 0; i < 25; i++) send('join', {}, user(`j${i}`, `J${i}`));
    p.tick(T0 + 50);
    expect(commands('welcome')).toHaveLength(3);
  });
});

describe('queue', () => {
  it('when full, drops non-gift actions but never gifts', () => {
    const small = new Pipeline(
      { ...configs, giftMap: { ...configs.giftMap, queue: { max: 3, drainPerTick: 200 } } },
      store,
      [],
      (m) => out.push(m),
    );
    for (let i = 0; i < 3; i++) small.enqueue({ id: `s${i}`, type: 'share', user: user(`s${i}`), ts: T0 });
    expect(small.enqueue({ id: 'f', type: 'follow', user: user('f'), ts: T0 })).toBe(false);
    expect(small.enqueue({ id: 'g', type: 'gift', giftCoins: 1, user: user('g'), ts: T0 })).toBe(true);
    expect(small.dropped).toBe(1);
    expect(small.queueLength).toBe(4);
  });

  it('drains at most drainPerTick events per tick', () => {
    for (let i = 0; i < 250; i++) send('gift', { giftCoins: 1, giftName: 'Rose' }, user(`g${i}`));
    p.tick(T0 + 50);
    expect(p.queueLength).toBe(50);
  });
});

describe('state', () => {
  it('reports temple, leaderboards and guilds; throttled to 4 per second', () => {
    send('comment', { text: '4' });
    send('gift', { giftCoins: 30, giftName: 'Doughnut' });
    send('gift', { giftCoins: 5, giftName: 'Finger Heart' }, user('u2', 'Sokha'));
    p.tick(T0 + 50);
    p.tick(T0 + 100);
    const states = out.filter((m) => m.kind === 'state');
    expect(states).toHaveLength(1);
    const s = p.state(T0 + 100);
    expect(s.temple).toMatchObject({ templeId: 'preah-ko', km: 'ព្រះគោ', progress: 175, target: 3000 });
    expect(s.topTemple.map((b) => [b.name, b.units, b.guild])).toEqual([
      ['Dara', 150, '4'],
      ['Sokha', 25, null],
    ]);
    expect(s.guilds['4']).toBe(150);
    expect(s.topTemple[0]?.rankEn).toBe('Stone Cutter');
  });

  it('pause and resume are announced', () => {
    p.setPaused(true, T0);
    expect(commands('pause')).toHaveLength(1);
    expect(p.state(T0).paused).toBe(true);
  });
});

describe('carved slots (prompt 10)', () => {
  it('named stones get a slot; likes do not', () => {
    send('gift', { giftName: 'Rose', giftCoins: 1 }); // 5 units → blocks 0-1, carved on block 1
    for (let i = 0; i < 10; i++) send('like');
    p.tick(T0 + 50);
    p.tick(T0 + 2100);
    const [rose, likes] = stones();
    expect(rose?.slot).toEqual({ kind: 'normal', index: 1 });
    expect(likes?.slot).toBeNull();
  });

  it('a Large gift takes the first big piece (a Nandi statue) and is listed in names', () => {
    send('gift', { giftName: 'Doughnut', giftCoins: 30 });
    p.tick(T0 + 50);
    expect(stones()[0]?.slot).toEqual({ kind: 'big', index: 0 });
    const names = p.names(T0);
    expect(names).toMatchObject({ kind: 'names', templeId: 'preah-ko' });
    expect(names.kind === 'names' && names.names).toEqual([
      { slot: { kind: 'big', index: 0 }, name: 'Dara', tier: 'large', userId: 'u1' },
    ]);
  });

  it('big pieces are used in order', () => {
    send('gift', { giftName: 'Doughnut', giftCoins: 30 });
    send('gift', { giftName: 'Doughnut', giftCoins: 30 }, user('u2', 'Sokha'));
    p.tick(T0 + 50);
    expect(stones().map((s) => s.slot)).toEqual([
      { kind: 'big', index: 0 },
      { kind: 'big', index: 1 },
    ]);
  });
});

describe('gifts today (resource counter on the Build tab)', () => {
  it('counts every gift of a combo; likes are counted separately', () => {
    for (let i = 1; i <= 3; i++) send('gift', { giftName: 'Rose', giftCoins: 1, comboEnd: i === 3 });
    send('gift', { giftName: 'Doughnut', giftCoins: 30 });
    send('like', { count: 7 });
    p.tick(T0 + 2100);
    const s = p.state(T0 + 2100);
    expect(s.giftsToday).toBe(4);
    expect(s.likesToday).toBe(7);
  });
});
