import type { Resource } from '@temples/shared';
import { rng } from './map';
import type { Building, KingdomSim } from './sim';

/**
 * Hay Day-style features for the Kingdom (PK: "upgrade some features similar to Hay Day"):
 *
 * - The order board: a few buyers each want two or three of the kingdom's goods and pay in
 *   gold. Deliver when the store has enough; a filled or thrown-away order is replaced after
 *   a wait (a longer one for a thrown-away order), as the trucks and the order board in
 *   Hay Day.
 * - The junk: now and then a Chinese junk comes up the river with a bigger order and a
 *   bonus, and sails if it is not filled in time (Hay Day's boat).
 * - Baskets: the chickens and pigs at houses and the hall fill a basket every so often;
 *   click it to take the food (Hay Day's animals). Nobody may click on a live stream, so a
 *   full basket is taken in by itself a little later.
 *
 * Plain rules on top of the simulation; the state is kept in saves.
 */

export interface Order {
  id: number;
  /** Buyer id (rules.orders.buyers), or 'boat' for the junk. */
  buyer: string;
  want: Partial<Record<Resource, number>>;
  gold: number;
  /** Game time the buyer arrives (the slot shows a wait until then). */
  readyAt: number;
  /** The junk leaves at this time if not filled. */
  leavesAt?: number;
}

export interface MarketSave {
  orders: Order[];
  nextId: number;
  nextBoatAt: number;
  filled: number;
}

export type DeliverFail = 'missing' | 'waiting' | 'short';

const PLAYER = 0;

export class Market {
  orders: Order[] = [];
  nextId = 1;
  nextBoatAt: number;
  /** Orders filled this game (for the record). */
  filled = 0;

  constructor(private readonly sim: KingdomSim) {
    const R = sim.data.rules.orders;
    for (let i = 0; i < R.slots; i++) this.orders.push(this.make(sim.time + R.firstSec + i * 8));
    this.nextBoatAt = sim.time + R.boat.everySec;
  }

  private get rules() {
    return this.sim.data.rules.orders;
  }

  /** A new order from a buyer, from a seeded random draw (same game, same orders). */
  make(readyAt: number, boat = false): Order {
    const R = this.rules;
    const id = this.nextId++;
    // Mix the seed and the order number well (nearby seeds of the generator start alike).
    const r = rng((Math.imul(this.sim.seed ^ 0x9e3779b9, 2654435761) ^ Math.imul(id, 0x85ebca6b)) >>> 0);
    r();
    r();
    const buyer = boat ? null : R.buyers[Math.floor(r() * R.buyers.length)]!;
    const pool: Resource[] = boat ? (['food', 'wood', 'stone'] as Resource[]) : [...buyer!.wants];
    const items = boat
      ? Math.min(R.boat.items, pool.length)
      : Math.min(pool.length, 1 + Math.floor(r() * 2.5));
    const scale = (1 + R.amount.perChapter * this.sim.chapter) * (boat ? 2 : 1);
    const want: Partial<Record<Resource, number>> = {};
    let value = 0;
    for (let k = 0; k < items; k++) {
      const res = pool.splice(Math.floor(r() * pool.length), 1)[0]!;
      const n = Math.max(
        5,
        Math.round(((R.amount.min + r() * (R.amount.max - R.amount.min)) * scale) / 5) * 5,
      );
      want[res] = n;
      value += n * (R.value[res] ?? 1);
    }
    const bonus = 1 + R.multiItemBonus * (items - 1) + (boat ? R.boat.bonus : 0);
    const gold = Math.max(5, Math.round((value * R.goldPerValue * bonus) / 5) * 5);
    const o: Order = { id, buyer: boat ? 'boat' : buyer!.id, want, gold, readyAt };
    if (boat) o.leavesAt = readyAt + R.boat.staySec;
    return o;
  }

  /** Once a second: the junk comes and goes. */
  update(): void {
    const t = this.sim.time;
    const R = this.rules;
    const boat = this.orders.find((o) => o.buyer === 'boat');
    if (boat && boat.leavesAt !== undefined && t >= boat.leavesAt) {
      this.orders = this.orders.filter((o) => o !== boat);
      this.nextBoatAt = t + R.boat.everySec;
      this.sim.events.push({ kind: 'order', what: 'sailed', order: boat, t });
    } else if (!boat && t >= this.nextBoatAt) {
      // PK: the junk needs a river landing to tie up at; without one it passes by.
      const port = [...this.sim.buildings.values()].some(
        (b) => b.team === PLAYER && b.type === 'port' && b.progress >= 1,
      );
      if (!port) {
        this.nextBoatAt = t + R.boat.everySec;
        this.sim.events.push({ kind: 'order', what: 'noport', order: null, t });
        return;
      }
      const o = this.make(t, true);
      this.orders.push(o);
      this.sim.events.push({ kind: 'order', what: 'boat', order: o, t });
    }
  }

  /** Can the store fill this order now? */
  canFill(o: Order): boolean {
    const have = this.sim.res[PLAYER];
    return Object.entries(o.want).every(([r, n]) => have[r as Resource] >= (n ?? 0));
  }

  /** Visible orders (buyer has arrived). */
  ready(): Order[] {
    return this.orders.filter((o) => this.sim.time >= o.readyAt);
  }

  deliver(id: number): { ok: true; gold: number } | { ok: false; reason: DeliverFail } {
    const o = this.orders.find((x) => x.id === id);
    if (!o) return { ok: false, reason: 'missing' };
    if (this.sim.time < o.readyAt) return { ok: false, reason: 'waiting' };
    if (!this.canFill(o)) return { ok: false, reason: 'short' };
    const res = this.sim.res[PLAYER];
    for (const [r, n] of Object.entries(o.want)) res[r as Resource] -= n ?? 0;
    res.gold += o.gold;
    this.filled++;
    this.replace(o, this.rules.refillSec);
    this.sim.events.push({ kind: 'order', what: 'filled', order: o, t: this.sim.time });
    return { ok: true, gold: o.gold };
  }

  /** Throw an order away; a new buyer comes after a longer wait. The junk just sails. */
  discard(id: number): boolean {
    const o = this.orders.find((x) => x.id === id);
    if (!o || this.sim.time < o.readyAt) return false;
    this.replace(o, this.rules.discardSec);
    return true;
  }

  private replace(o: Order, wait: number): void {
    const i = this.orders.indexOf(o);
    if (o.buyer === 'boat') {
      this.orders.splice(i, 1);
      this.nextBoatAt = this.sim.time + this.rules.boat.everySec;
    } else this.orders[i] = this.make(this.sim.time + wait);
  }

  save(): MarketSave {
    return {
      orders: this.orders.map((o) => ({ ...o, want: { ...o.want } })),
      nextId: this.nextId,
      nextBoatAt: this.nextBoatAt,
      filled: this.filled,
    };
  }

  load(s: MarketSave): void {
    this.orders = s.orders.map((o) => ({ ...o, want: { ...o.want } }));
    this.nextId = s.nextId;
    this.nextBoatAt = s.nextBoatAt;
    this.filled = s.filled;
  }
}

// ---------------------------------------------------------------- baskets

/** Does this building keep animals that fill a basket? */
export function keepsAnimals(sim: KingdomSim, b: Building): boolean {
  return b.team === PLAYER && b.progress >= 1 && sim.data.rules.livestock.produce.types.includes(b.type);
}

/** Is a basket full and waiting to be taken? */
export function basketReady(sim: KingdomSim, b: Building): boolean {
  return keepsAnimals(sim, b) && b.basketAt !== undefined && sim.time >= b.basketAt;
}

/** Once a second: start baskets at new houses; take in baskets nobody clicked. */
export function updateBaskets(sim: KingdomSim): void {
  const P = sim.data.rules.livestock.produce;
  for (const b of sim.buildings.values()) {
    if (!keepsAnimals(sim, b)) continue;
    if (b.basketAt === undefined) b.basketAt = sim.time + P.everySec;
    else if (sim.time >= b.basketAt + P.autoSec) collectBasket(sim, b.id);
  }
}

/** Take the food in a full basket (a click on it). */
export function collectBasket(sim: KingdomSim, id: number): number {
  const b = sim.buildings.get(id);
  if (!b || !basketReady(sim, b)) return 0;
  const P = sim.data.rules.livestock.produce;
  sim.res[PLAYER].food += P.food;
  b.basketAt = sim.time + P.everySec;
  sim.events.push({ kind: 'delivered', res: 'food', n: P.food, at: sim.center(b), t: sim.time });
  return P.food;
}
