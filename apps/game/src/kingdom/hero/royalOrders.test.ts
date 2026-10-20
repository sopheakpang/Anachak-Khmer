import { describe, expect, it } from 'vitest';
import { loadOrders, type Order } from '@temples/shared';
import {
  answerKey,
  dutyNeed,
  dutyProgress,
  liveOrders,
  nextOrder,
  orderHtml,
  ordersVersion,
  setLiveOrders,
} from './royalOrders';

/** PK 2026-10-20 (D157): ព្រះរាជបញ្ជា · Royal Orders in the 3D hero mode. */

const O = loadOrders();
const stats = { defeat: 0, hunt: 0, heal: 0, gather: 0, store: 0, build: 0 };

describe('Royal Orders in the hero mode', () => {
  it('never sends him to a building the kingdom has not got', () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 400; i++) {
      const o = nextOrder(O, 'king', null, (p) => p === 'townCentre', rnd)!;
      if (o.type === 'duty' && o.duty === 'visit') expect(o.place).toBe('townCentre');
    }
  });

  it('a duty grows each round; a visit is one trip; progress counts from when it came', () => {
    const gather = O.list.find((o) => o.id === 'gather')!;
    expect(dutyNeed(gather, 0, O.grow)).toBe(20);
    expect(dutyNeed(gather, 2, O.grow)).toBeGreaterThan(20);
    const visit = O.list.find((o) => o.type === 'duty' && o.duty === 'visit')!;
    expect(dutyNeed(visit, 5, O.grow)).toBe(1);
    expect(dutyProgress({ o: gather, need: 20, have: 7 }, { ...stats, gather: 12 }, false)).toBe(5);
    expect(dutyProgress({ o: visit, need: 1, have: 0 }, stats, true)).toBe(1);
  });

  it('a question shows its answers as buttons with keys 1–4; 1–4 answer it; text is escaped', () => {
    const q: Order = {
      id: 'q',
      type: 'question',
      km: '<b>?',
      en: 'Which?',
      kits: [],
      reward: {},
      options: [
        { km: 'ក', en: 'A' },
        { km: 'ខ', en: 'B' },
        { km: 'គ', en: 'C' },
      ],
      answer: 1,
    };
    const html = orderHtml({ o: q, need: 1, have: 0 }, 0, false);
    expect(html.match(/data-hero="ans\d"/g)).toEqual([
      'data-hero="ans0"',
      'data-hero="ans1"',
      'data-hero="ans2"',
    ]);
    expect(html).toContain('<kbd>3</kbd>');
    expect(html).not.toContain('<b>?');
    expect(html).toContain('ព្រះរាជបញ្ជា');
    expect(orderHtml({ o: q, need: 1, have: 0 }, 0, true)).not.toContain('<kbd>');
    expect(answerKey('Digit2', 3)).toBe(1);
    expect(answerKey('Numpad3', 3)).toBe(2);
    expect(answerKey('Digit4', 3)).toBe(-1);
    expect(answerKey('KeyQ', 3)).toBe(-1);
  });

  it('new orders from the dashboard replace the list at once', () => {
    const v = ordersVersion();
    setLiveOrders({ ...O, list: O.list.slice(0, 3) });
    expect(ordersVersion()).toBe(v + 1);
    expect(liveOrders().list).toHaveLength(3);
    setLiveOrders(O);
  });
});
