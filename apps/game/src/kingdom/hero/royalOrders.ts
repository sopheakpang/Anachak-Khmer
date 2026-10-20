import { loadOrders, pickOrder, type Order, type Orders } from '@temples/shared';

/**
 * PK 2026-10-20 (D157): ព្រះរាជបញ្ជា · Royal Orders in the 3D hero mode. The game starts with
 * config/kingdom/orders.json and takes the bridge's list whenever PK changes it in the dashboard.
 */

let live: Orders = loadOrders();
let version = 0;

/** The orders now (the dashboard's latest when the bridge has sent them). */
export function liveOrders(): Orders {
  return live;
}
/** Changes each time new orders arrive (the hero mode checks its current order against it). */
export function ordersVersion(): number {
  return version;
}
/** New orders from the bridge (PK changed them in the dashboard). */
export function setLiveOrders(o: Orders): void {
  live = o;
  version++;
}

/** The counters a duty is measured by (what the hero has done since the hero mode began). */
export type DutyStats = Record<'defeat' | 'hunt' | 'heal' | 'gather' | 'store' | 'build', number>;

/** An order being worked on: how much it needs and where the counter stood when it came. */
export interface ActiveOrder {
  o: Order;
  need: number;
  have: number;
}

/** How much a duty needs the `round`-th time round (it grows a little each time). */
export function dutyNeed(o: Order, round: number, grow: number): number {
  if (o.type !== 'duty') return 1;
  if (o.duty === 'visit') return 1;
  return Math.max(1, Math.round(o.n * Math.pow(grow, round)));
}

/**
 * Pick the next order for a hero: at random, never the last one, skipping visits to a building
 * the kingdom has not got yet (`has`).
 */
export function nextOrder(
  orders: Orders,
  kit: string,
  last: string | null,
  has: (place: string) => boolean,
  rnd: () => number = Math.random,
): Order | null {
  for (let i = 0; i < 12; i++) {
    const o = pickOrder(orders, kit, rnd(), rnd(), last);
    if (!o) return null;
    if (o.type === 'duty' && o.duty === 'visit' && o.place && !has(o.place)) {
      last = o.id;
      continue;
    }
    return o;
  }
  return null;
}

/** How far along a duty is (0..need). */
export function dutyProgress(a: ActiveOrder, stats: DutyStats, visited: boolean): number {
  if (a.o.type !== 'duty') return 0;
  if (a.o.duty === 'visit') return visited ? 1 : 0;
  return Math.min(a.need, stats[a.o.duty] - a.have);
}

const KM_DIGITS = '០១២៣៤៥៦៧៨៩';
const kmNum = (n: number) => String(Math.round(n)).replace(/\d/g, (d) => KM_DIGITS[Number(d)]!);
const escHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The order's card in the hero HUD: ព្រះរាជបញ្ជា above it; a duty with its count, a question
 * with its answers as buttons (and their keys 1–4 on the PC).
 */
export function orderHtml(a: ActiveOrder, got: number, phone: boolean): string {
  const head = `<small class="k-ro-head">ព្រះរាជបញ្ជា · Royal order</small>`;
  if (a.o.type === 'duty')
    return (
      `<div class="k-hero-quest">${head}<b>📜 ${escHtml(a.o.km)}</b><span>${escHtml(a.o.en)}</span>` +
      `<em>${kmNum(got)} / ${kmNum(a.need)}</em></div>`
    );
  const opts = a.o.options
    .map(
      (x, i) =>
        `<button class="k-ro-opt" data-hero="ans${i}" data-ui>${phone ? '' : `<kbd>${i + 1}</kbd>`}<b>${escHtml(x.km)}</b><span>${escHtml(x.en)}</span></button>`,
    )
    .join('');
  return (
    `<div class="k-hero-quest k-ro-q">${head}<b>❓ ${escHtml(a.o.km)}</b><span>${escHtml(a.o.en)}</span>` +
    `<div class="k-ro-opts">${opts}</div></div>`
  );
}

/** The answer a key gives while a question is up (Digit1–4 → 0–3), or -1. */
export function answerKey(code: string, options: number): number {
  const m = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  if (!m) return -1;
  const i = Number(m[1]) - 1;
  return i < options ? i : -1;
}
