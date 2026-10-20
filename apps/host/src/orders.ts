import { ORDER_DUTIES, ORDER_KITS, ORDER_PLACES, type Order, type Orders } from '@temples/shared';

/**
 * PK 2026-10-20 (D157): the dashboard's ព្រះរាជបញ្ជា · Royal Orders page — the list of the
 * king's daily orders for the 3D hero mode (duties and questions), and a form to add more. The
 * bridge checks each new order, writes config/kingdom/orders.json and sends the new list to the
 * game at once.
 */

export const KIT_NAMES: Record<(typeof ORDER_KITS)[number], string> = {
  worker: 'អ្នកស្រុក · Villager',
  spear: 'ទាហានលំពែង · Spearman',
  sword: 'ទាហានដាវ · Swordsman',
  bow: 'អ្នកបាញ់ធ្នូ · Archer',
  rider: 'ទាហានសេះ · Horseman',
  elephant: 'ដំរីចម្បាំង · War elephant',
  commander: 'មេទ័ព · Commander',
  hunter: 'អ្នកយាម · Watchman',
  cart: 'រទេះគោ · Ox-cart',
  king: 'ព្រះមហាក្សត្រ · King',
};
export const DUTY_NAMES: Record<(typeof ORDER_DUTIES)[number], string> = {
  gather: 'ប្រមូល · Gather (goods)',
  store: 'ដឹកចូលឃ្លាំង · Bring loads to a store',
  defeat: 'កម្ចាត់សត្រូវ · Defeat raiders',
  hunt: 'បរបាញ់ · Hunt animals',
  heal: 'ព្យាបាល · Heal people',
  build: 'សាងសង់ · Help build (blows)',
  visit: 'ទៅកាន់ · Go to a building',
};
export const PLACE_NAMES: Record<(typeof ORDER_PLACES)[number], string> = {
  townCentre: 'ព្រះរាជវាំង · Royal hall',
  storehouse: 'ជង្រុក · Granary',
  market: 'ផ្សារ · Market',
  barracks: 'បន្ទាយទាហាន · Barracks',
  port: 'កំពង់ផែ · River landing',
  house: 'ផ្ទះ · House',
  nobleHouse: 'ផ្ទះអភិជន · Noble house',
  lumberCamp: 'ជំរំកាប់ឈើ · Lumber camp',
};
const RES = ['food', 'wood', 'stone', 'gold'] as const;
const RES_ICON = { food: '🍚', wood: '🪵', stone: '🪨', gold: '🪙' } as const;

/** What the form holds (strings as typed). */
export interface OrderForm {
  type: 'duty' | 'question';
  km: string;
  en: string;
  kits: string[];
  duty: string;
  n: string;
  place: string;
  options: Array<{ km: string; en: string }>;
  answer: number;
  reward: Record<string, string>;
}

/** The order to send to the bridge (the bridge checks it again and gives it an id). */
export function orderFromForm(f: OrderForm): Record<string, unknown> {
  const reward: Record<string, number> = {};
  for (const r of RES) {
    const v = Math.round(Number(f.reward[r] ?? 0));
    if (v > 0) reward[r] = v;
  }
  const base = { km: f.km.trim(), en: f.en.trim(), kits: f.kits, reward };
  if (f.type === 'duty')
    return {
      ...base,
      type: 'duty',
      duty: f.duty,
      n: f.duty === 'visit' ? 1 : Math.max(1, Math.round(Number(f.n) || 1)),
      ...(f.duty === 'visit' ? { place: f.place } : {}),
    };
  // Only the options filled in, the right one followed through the gaps.
  const filled = f.options.map((o, i) => ({ ...o, i })).filter((o) => o.km.trim() || o.en.trim());
  const answer = Math.max(
    0,
    filled.findIndex((o) => o.i === f.answer),
  );
  return {
    ...base,
    type: 'question',
    options: filled.map((o) => ({ km: o.km.trim() || o.en.trim(), en: o.en.trim() || o.km.trim() })),
    answer,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One row of the list. */
export function orderRow(o: Order): string {
  const who = o.kits.length
    ? o.kits.map((k) => esc(KIT_NAMES[k].split(' · ')[1]!)).join(', ')
    : 'Everyone · គ្រប់គ្នា';
  const what =
    o.type === 'duty'
      ? `${esc(DUTY_NAMES[o.duty])}${o.duty === 'visit' && o.place ? ` → ${esc(PLACE_NAMES[o.place])}` : ` × ${o.n}`}`
      : `<ol class="opts">${o.options.map((x, i) => `<li class="${i === o.answer ? 'right' : ''}">${x.km === x.en ? esc(x.km) : `${esc(x.km)} · ${esc(x.en)}`}${i === o.answer ? ' ✓' : ''}</li>`).join('')}</ol>`;
  const pay =
    Object.entries(o.reward)
      .map(([r, n]) => `${RES_ICON[r as keyof typeof RES_ICON] ?? r} ${n}`)
      .join(' ') || '—';
  return (
    `<tr data-id="${esc(o.id)}"><td class="t">${o.type === 'duty' ? '🛠️ Duty' : '❓ Question'}</td>` +
    `<td><b>${esc(o.km)}</b><br><span class="muted">${esc(o.en)}</span></td>` +
    `<td>${what}</td><td>${who}</td><td>${pay}</td>` +
    `<td><button class="danger small" data-order-remove="${esc(o.id)}">Remove</button></td></tr>`
  );
}

/** The whole list, duties first. */
export function ordersTable(orders: Orders): string {
  const list = [...orders.list].sort((a, b) => (a.type === b.type ? 0 : a.type === 'duty' ? -1 : 1));
  return list.map(orderRow).join('');
}
