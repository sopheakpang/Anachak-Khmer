import { describe, expect, it } from 'vitest';
import { OrderSchema, loadOrders } from '@temples/shared';
import { orderFromForm, ordersTable, type OrderForm } from './orders';

/** PK 2026-10-20 (D157): the dashboard's Royal Orders page. */

const blank: OrderForm = {
  type: 'duty',
  km: ' ទៅផ្សារ ',
  en: ' Go to the market ',
  kits: [],
  duty: 'visit',
  n: '7',
  place: 'market',
  options: [
    { km: '', en: '' },
    { km: '', en: '' },
    { km: '', en: '' },
    { km: '', en: '' },
  ],
  answer: 0,
  reward: { food: '0', wood: '', stone: '3', gold: '10.4' },
};

describe('Royal Orders form', () => {
  it('a visit: one trip to the place, trimmed text, only the rewards given', () => {
    const o = orderFromForm(blank);
    expect(o).toEqual({
      km: 'ទៅផ្សារ',
      en: 'Go to the market',
      kits: [],
      reward: { stone: 3, gold: 10 },
      type: 'duty',
      duty: 'visit',
      n: 1,
      place: 'market',
    });
    expect(OrderSchema.safeParse({ ...o, id: 'x' }).success).toBe(true);
  });

  it('a question keeps the filled answers and follows the ticked one through the gaps', () => {
    const o = orderFromForm({
      ...blank,
      type: 'question',
      kits: ['king'],
      options: [
        { km: 'ក', en: 'A' },
        { km: '', en: '' },
        { km: 'គ', en: '' },
        { km: '', en: 'D' },
      ],
      answer: 2,
    });
    expect(o.options).toEqual([
      { km: 'ក', en: 'A' },
      { km: 'គ', en: 'គ' },
      { km: 'D', en: 'D' },
    ]);
    expect(o.answer).toBe(1);
    expect(OrderSchema.safeParse({ ...o, id: 'q' }).success).toBe(true);
  });

  it('the list shows every order, duties first, the right answer ticked, text escaped', () => {
    const orders = loadOrders();
    const html = ordersTable({
      ...orders,
      list: [...orders.list, { ...orders.list[0]!, id: 'evil', en: '<script>x</script>' }],
    });
    expect(html.match(/<tr /g)!.length).toBe(orders.list.length + 1);
    expect(html).not.toContain('<script>');
    expect(html.indexOf('🛠️')).toBeLessThan(html.indexOf('❓'));
    expect(html).toContain('✓');
  });
});
