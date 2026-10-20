import { describe, expect, it } from 'vitest';
import { ORDER_KITS, loadOrders, orderId, ordersFor, pickOrder, type Order } from './orders';
import { loadKingdom } from './kingdom';

/** PK 2026-10-20 (D157): ព្រះរាជបញ្ជា · Royal Orders. */

describe('Royal Orders', () => {
  const O = loadOrders();

  it('the file validates; ids are unique; every hero has duties and questions', () => {
    const kits = loadKingdom().anachak.hero.kits.map((k) => k.id);
    expect([...ORDER_KITS].sort()).toEqual([...kits].sort());
    for (const k of kits) {
      const mine = ordersFor(O.list, k);
      expect(
        mine.some((o) => o.type === 'duty'),
        k,
      ).toBe(true);
      expect(
        mine.some((o) => o.type === 'question'),
        k,
      ).toBe(true);
    }
  });

  it('picks at random, never the one just done; about one in questionEvery is a question', () => {
    let last: string | null = null;
    let qs = 0;
    const N = 3000;
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const o: Order = pickOrder(O, 'king', r(), r(), last)!;
      expect(o.id).not.toBe(last);
      expect(!o.kits.length || (o.kits as string[]).includes('king')).toBe(true);
      if (o.type === 'question') qs++;
      last = o.id;
    }
    expect(qs / N).toBeGreaterThan(1 / O.questionEvery - 0.05);
    expect(qs / N).toBeLessThan(1 / O.questionEvery + 0.05);
  });

  it('a new id comes from the English text and never clashes', () => {
    expect(orderId('Buy fish at the market!', [])).toBe('buy-fish-at-the-market');
    expect(orderId('Gather', ['gather'])).toBe('gather-2');
    expect(orderId('ខ្មែរ', [])).toBe('order');
  });
});
