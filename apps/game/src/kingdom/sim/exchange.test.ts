import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';
import { exchange, hasMarket, quote, trend, updateExchange } from './exchange';
import { restore, serialize } from './save';

/** PK: a market to exchange goods (Anachak Khmer; Zhou Daguan's market women). */

const data = loadKingdom();
const M = data.anachak.market;

function withMarket(done = true): KingdomSim {
  const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
  s.ai.nextRaid = 1e9;
  Object.assign(s.res[PLAYER], { food: 1000, wood: 1000, stone: 1000, gold: 1000 });
  const id = s.nextId++;
  s.buildings.set(id, {
    ...[...s.buildings.values()][0]!,
    id,
    type: M.building,
    team: PLAYER,
    progress: done ? 1 : 0.5,
    queue: [],
  });
  return s;
}

describe('the market', () => {
  it('is a building the era allows, with mats and shades (Zhou Daguan)', () => {
    expect(data.buildings[M.building]).toBeTruthy();
    expect(data.buildings[M.building]!.sources).toContain('harris2007');
  });

  it('trades only once it stands', () => {
    const s = withMarket(false);
    expect(hasMarket(s)).toBe(false);
    expect(exchange(s, 'food', 'wood', 50)).toEqual({ ok: false, reason: 'requires' });
  });

  it('gives a lot of one good for another at the rate, less the stall rent', () => {
    const s = withMarket();
    const n = quote(s, 'food', 'gold', 100);
    expect(n).toBe(Math.floor(((100 * M.value.food) / M.value.gold) * (1 - M.fee) + 1e-6));
    const r = exchange(s, 'food', 'gold', 100);
    expect(r).toEqual({ ok: true, id: n });
    expect(s.res[PLAYER].food).toBe(900);
    expect(s.res[PLAYER].gold).toBe(1000 + n);
    expect(s.events.some((e) => e.kind === 'traded')).toBe(true);
  });

  it('what you sell gets cheaper and what you buy dearer; prices drift back', () => {
    const s = withMarket();
    const first = quote(s, 'wood', 'stone', 100);
    for (let i = 0; i < 5; i++) exchange(s, 'wood', 'stone', 100);
    expect(quote(s, 'wood', 'stone', 100)).toBeLessThan(first);
    expect(trend(s, 'wood')).toBeLessThan(0);
    expect(trend(s, 'stone')).toBeGreaterThan(0);
    for (let i = 0; i < 3000; i++) updateExchange(s, 1);
    expect(Math.abs(quote(s, 'wood', 'stone', 100) - first)).toBeLessThanOrEqual(1);
    expect(Math.abs(trend(s, 'wood'))).toBeLessThan(0.001);
  });

  it('prices stay within their bounds however much is sold', () => {
    const s = withMarket();
    s.res[PLAYER].food = 1e6;
    for (let i = 0; i < 300; i++) exchange(s, 'food', 'wood', 200);
    expect(s.prices.food).toBeGreaterThanOrEqual(M.value.food * M.min - 1e-9);
    expect(s.prices.wood).toBeLessThanOrEqual(M.value.wood * M.max + 1e-9);
  });

  it('needs the goods, and no trade of a good for itself', () => {
    const s = withMarket();
    s.res[PLAYER].stone = 10;
    expect(exchange(s, 'stone', 'gold', 50)).toEqual({ ok: false, reason: 'cost' });
    expect(exchange(s, 'gold', 'gold', 50)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('prices are kept in the save', () => {
    const s = withMarket();
    exchange(s, 'food', 'wood', 200);
    const back = restore(data, serialize(s));
    expect(back.prices.food).toBeCloseTo(s.prices.food);
    expect(back.traded).toBe(200);
  });
});
