import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, type Building } from './sim';
import { basketReady, collectBasket } from './market';
import { restore, serialize } from './save';

/** PK: features like Hay Day — the order board, the junk, baskets to collect. */

const data = loadKingdom();
const R = data.rules.orders;
const P = data.rules.livestock.produce;
const quiet = (port = true) => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  if (port) {
    // PK: the junk ties up at a river landing; put one by the nearest water.
    const h = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    for (let r = 4; r < 200; r++) {
      let done = false;
      for (let k = 0; k < 32 && !done; k++) {
        const tx = Math.round(h.tx + Math.cos((k / 32) * Math.PI * 2) * r);
        const tz = Math.round(h.tz + Math.sin((k / 32) * Math.PI * 2) * r);
        if (s.grid.ok(tx, tz) && s.grid.ok(tx + 3, tz + 3) && s.waterNear(tx, tz, 4, 4, 2)) {
          s.addBuilding('port', PLAYER, tx, tz, 1);
          done = true;
        }
      }
      if (done) break;
    }
  }
  return s;
};
const rich = (s: KingdomSim) =>
  Object.assign(s.res[PLAYER], { food: 5000, wood: 5000, stone: 5000, gold: 0 });
const hall = (s: KingdomSim): Building => [...s.buildings.values()].find((b) => b.type === 'townCentre')!;

describe('the order board (Hay Day trucks)', () => {
  it('has a buyer per slot after a short wait, each wanting goods for gold', () => {
    const s = quiet();
    expect(s.market.orders).toHaveLength(R.slots);
    expect(s.market.ready()).toHaveLength(0);
    s.update(R.firstSec + R.slots * 8 + 1);
    const ready = s.market.ready();
    expect(ready).toHaveLength(R.slots);
    for (const o of ready) {
      expect(Object.keys(o.want).length).toBeGreaterThanOrEqual(1);
      expect(o.gold).toBeGreaterThan(0);
      const buyer = R.buyers.find((b) => b.id === o.buyer)!;
      for (const r of Object.keys(o.want)) expect(buyer.wants).toContain(r);
    }
  });

  it('different buyers come', () => {
    const s = quiet();
    const buyers = new Set(Array.from({ length: 30 }, () => s.market.make(0).buyer));
    expect(buyers.size).toBeGreaterThanOrEqual(3);
  });

  it('the same game gives the same orders (seeded)', () => {
    const a = quiet().market.orders.map((o) => [o.buyer, o.want, o.gold]);
    const b = quiet().market.orders.map((o) => [o.buyer, o.want, o.gold]);
    expect(a).toEqual(b);
  });

  it('delivering takes the goods, pays the gold, and a new buyer comes after the wait', () => {
    const s = quiet();
    s.update(R.firstSec + 1);
    rich(s);
    const o = s.market.ready()[0]!;
    const before = { ...s.res[PLAYER] };
    const r = s.market.deliver(o.id);
    expect(r.ok).toBe(true);
    expect(s.res[PLAYER].gold).toBe(o.gold);
    for (const [k, n] of Object.entries(o.want))
      expect(s.res[PLAYER][k as 'food']).toBe(before[k as 'food'] - (n ?? 0));
    expect(s.events.some((e) => e.kind === 'order' && e.what === 'filled')).toBe(true);
    const next = s.market.orders.find((x) => !s.market.ready().includes(x))!;
    expect(next.readyAt).toBeCloseTo(s.time + R.refillSec, 5);
    expect(s.market.filled).toBe(1);
  });

  it('cannot deliver without enough goods, or before the buyer is there', () => {
    const s = quiet();
    const waiting = s.market.orders[0]!;
    expect(s.market.deliver(waiting.id)).toEqual({ ok: false, reason: 'waiting' });
    s.update(R.firstSec + 1);
    Object.assign(s.res[PLAYER], { food: 0, wood: 0, stone: 0 });
    expect(s.market.deliver(waiting.id)).toEqual({ ok: false, reason: 'short' });
  });

  it('a thrown-away order is replaced after the longer wait', () => {
    const s = quiet();
    s.update(R.firstSec + 1);
    const o = s.market.ready()[0]!;
    expect(s.market.discard(o.id)).toBe(true);
    expect(s.market.orders.find((x) => x.id === o.id)).toBeUndefined();
    expect(Math.max(...s.market.orders.map((x) => x.readyAt))).toBeCloseTo(s.time + R.discardSec, 5);
  });

  it('later temples ask for more', () => {
    const s = quiet();
    const sum = (o: { want: Partial<Record<string, number>> }): number =>
      Object.values(o.want).reduce<number>((a, b) => a + (b ?? 0), 0);
    const early = s.market.orders.reduce((a, o) => a + sum(o), 0);
    s.chapter = 10;
    const late = [0, 1, 2].map(() => s.market.make(0)).reduce((a, o) => a + sum(o), 0);
    expect(late).toBeGreaterThan(early);
  });
});

describe('the junk (Hay Day boat)', () => {
  it('comes with a big order and a bonus, and sails if it is not filled', () => {
    const s = quiet();
    s.update(R.boat.everySec + 1);
    const boat = s.market.orders.find((o) => o.buyer === 'boat')!;
    expect(boat).toBeDefined();
    expect(Object.keys(boat.want)).toHaveLength(R.boat.items);
    expect(s.events.some((e) => e.kind === 'order' && e.what === 'boat')).toBe(true);
    s.update(R.boat.staySec + 1);
    expect(s.market.orders.find((o) => o.buyer === 'boat')).toBeUndefined();
    expect(s.events.some((e) => e.kind === 'order' && e.what === 'sailed')).toBe(true);
  });

  it('filled, it pays and leaves', () => {
    const s = quiet();
    s.update(R.boat.everySec + 1);
    rich(s);
    const boat = s.market.orders.find((o) => o.buyer === 'boat')!;
    expect(s.market.deliver(boat.id).ok).toBe(true);
    expect(s.res[PLAYER].gold).toBe(boat.gold);
    expect(s.market.orders.find((o) => o.buyer === 'boat')).toBeUndefined();
  });
});

describe('the junk needs a river landing (PK)', () => {
  it('passes by without a port, and says so', () => {
    const s = quiet(false);
    s.update(R.boat.everySec + 1);
    expect(s.market.orders.some((o) => o.buyer === 'boat')).toBe(false);
    expect(s.events.some((e) => e.kind === 'order' && e.what === 'noport')).toBe(true);
  });

  it('a landing must stand at the edge of the water', () => {
    const s = quiet(false);
    s.res[PLAYER].wood = 9999;
    s.res[PLAYER].stone = 9999;
    const h = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    expect(s.canPlace('port', h.tx + 8, h.tz + 8)).toBe('shore');
    expect(data.buildings.port!.shore).toBe(true);
  });
});

describe('baskets at the houses (Hay Day animals)', () => {
  it('fill after a while; a click takes the food', () => {
    const s = quiet();
    const h = hall(s);
    h.progress = 1;
    s.update(1.1);
    expect(basketReady(s, h)).toBe(false);
    s.update(P.everySec);
    expect(basketReady(s, h)).toBe(true);
    const food = s.res[PLAYER].food;
    expect(collectBasket(s, h.id)).toBe(P.food);
    expect(s.res[PLAYER].food).toBe(food + P.food);
    expect(basketReady(s, h)).toBe(false);
    expect(collectBasket(s, h.id)).toBe(0);
  });

  it('a basket nobody clicks is taken in by itself (live streams)', () => {
    const s = quiet();
    const h = hall(s);
    h.progress = 1;
    s.update(1.1);
    const food = s.res[PLAYER].food;
    s.update(P.everySec + P.autoSec + 1.5);
    expect(s.res[PLAYER].food).toBeGreaterThanOrEqual(food + P.food);
  });
});

describe('saves', () => {
  it('keep the orders, the junk timer and the baskets', () => {
    const s = quiet();
    s.update(R.firstSec + 1);
    const h = hall(s);
    const back = restore(data, JSON.parse(JSON.stringify(serialize(s))));
    expect(back.market.orders).toEqual(s.market.orders);
    expect(back.market.nextBoatAt).toBe(s.market.nextBoatAt);
    expect(back.buildings.get(h.id)!.basketAt).toBe(h.basketAt);
  });
});
