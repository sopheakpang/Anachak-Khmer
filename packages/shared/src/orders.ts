import { z } from 'zod';
import ordersJson from '../../../config/kingdom/orders.json';

/**
 * PK 2026-10-20 (D157): ព្រះរាជបញ្ជា · Royal Orders — the king's daily orders in the 3D hero
 * mode: duties to do and questions to answer. Kept in config/kingdom/orders.json; PK adds and
 * removes them in the host dashboard and the bridge writes the file (writeOrders).
 */

export const ORDER_DUTIES = ['gather', 'store', 'defeat', 'hunt', 'heal', 'build', 'visit'] as const;
export type OrderDuty = (typeof ORDER_DUTIES)[number];
/** The heroes of the 3D mode (anachak.json hero.kits ids). */
export const ORDER_KITS = [
  'worker',
  'spear',
  'sword',
  'bow',
  'rider',
  'elephant',
  'commander',
  'hunter',
  'cart',
  'king',
] as const;
/** Buildings a "visit" order can send the hero to. */
export const ORDER_PLACES = [
  'townCentre',
  'storehouse',
  'market',
  'barracks',
  'port',
  'house',
  'nobleHouse',
  'lumberCamp',
] as const;

const Text = { km: z.string().trim().min(1).max(300), en: z.string().trim().min(1).max(300) };
const Reward = z.partialRecord(z.enum(['food', 'wood', 'stone', 'gold']), z.number().int().min(0).max(1000));
const Common = {
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  ...Text,
  /** Which heroes it is for (empty = everyone). */
  kits: z.array(z.enum(ORDER_KITS)).default([]),
  reward: Reward,
};

export const OrderSchema = z
  .discriminatedUnion('type', [
    z.object({
      ...Common,
      type: z.literal('duty'),
      duty: z.enum(ORDER_DUTIES),
      n: z.number().int().min(1).max(500),
      /** A visit's building type. */
      place: z.enum(ORDER_PLACES).optional(),
    }),
    z.object({
      ...Common,
      type: z.literal('question'),
      options: z.array(z.object(Text)).min(2).max(4),
      /** Index of the right option (0 = the first). */
      answer: z.number().int().min(0),
    }),
  ])
  .superRefine((o, ctx) => {
    if (o.type === 'question' && o.answer >= o.options.length)
      ctx.addIssue({ code: 'custom', message: 'answer must point at one of the options', path: ['answer'] });
    if (o.type === 'duty' && o.duty === 'visit' && !o.place)
      ctx.addIssue({ code: 'custom', message: 'a visit needs a place', path: ['place'] });
  });
export type Order = z.infer<typeof OrderSchema>;

export const OrdersSchema = z
  .object({
    $comment: z.string().optional(),
    /** A duty's count grows by this each time round. */
    grow: z.number().min(1).max(3),
    /** About one order in this many is a question (when the hero has questions). */
    questionEvery: z.number().int().min(1).max(20),
    list: z.array(OrderSchema).min(1),
  })
  .superRefine((o, ctx) => {
    const seen = new Set<string>();
    for (const [i, x] of o.list.entries()) {
      if (seen.has(x.id))
        ctx.addIssue({ code: 'custom', message: `duplicate id ${x.id}`, path: ['list', i, 'id'] });
      seen.add(x.id);
    }
  });
export type Orders = z.infer<typeof OrdersSchema>;

export function loadOrders(): Orders {
  return OrdersSchema.parse(ordersJson);
}

/** Orders for a hero (its kit, or everyone's). */
export function ordersFor(list: readonly Order[], kit: string): Order[] {
  return list.filter((o) => !o.kits.length || (o.kits as string[]).includes(kit));
}

/**
 * The next order for a hero: at random (`r` 0..1, `q` 0..1 for the question roll), never the
 * one just done; about one in `questionEvery` is a question when there are both kinds.
 */
export function pickOrder(
  orders: Pick<Orders, 'list' | 'questionEvery'>,
  kit: string,
  r: number,
  q: number,
  lastId: string | null,
): Order | null {
  const mine = ordersFor(orders.list, kit);
  if (!mine.length) return null;
  const qs = mine.filter((o) => o.type === 'question');
  const ds = mine.filter((o) => o.type === 'duty');
  let pool = qs.length && ds.length ? (q < 1 / orders.questionEvery ? qs : ds) : mine;
  if (pool.length > 1) pool = pool.filter((o) => o.id !== lastId);
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]!;
}

/** A new id for an order (from its English text, made unique). */
export function orderId(en: string, taken: readonly string[]): string {
  const base =
    en
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'order';
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** The file as written by the bridge (two-space JSON, the comment first). */
export function ordersFileText(o: Orders): string {
  return `${JSON.stringify(o, null, 2)}\n`;
}
