import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { Inbox, agoText, inboxHtml } from './inbox';

const km = (n: number) => String(n);

describe('PK 2026-10-20 (D160): the ព្រះរាជបញ្ជា inbox', () => {
  it('nothing pops up by default; the inbox keeps 60 messages', () => {
    const r = loadKingdom().rules.inbox;
    expect(r.popups).toBe(false);
    expect(r.max).toBe(60);
  });

  it('keeps the newest first, at most max, and counts what is unread', () => {
    const ib = new Inbox(3);
    for (let i = 0; i < 5; i++) ib.push('news', `m${i}`, i * 1000);
    expect(ib.items.map((it) => it.html)).toEqual(['m4', 'm3', 'm2']);
    expect(ib.unread).toBe(3);
    const v = ib.version;
    ib.readAll();
    expect(ib.unread).toBe(0);
    expect(ib.version).toBeGreaterThan(v);
    ib.readAll();
    expect(ib.version).toBe(v + 1); // nothing new: no redraw
  });

  it('a chapter card is kept whole and found by its id', () => {
    const ib = new Inbox();
    const it = ib.push('card', 'Chapter 2: Bakong', 0, '<h3>Bakong</h3>');
    expect(ib.get(it.id)?.card).toBe('<h3>Bakong</h3>');
    const html = inboxHtml(ib.items, null, 0, km);
    expect(html).toContain(`data-act="inbox-card:${it.id}"`);
    expect(html).toContain('k-ib-card');
  });

  it('shows the council vote at the top while it is open, and says when each message came', () => {
    const ib = new Inbox();
    ib.push('world', '802 · Jayavarman II', 0);
    const html = inboxHtml(ib.items, '<h3>Council vote</h3>', 3 * 60_000, km);
    expect(html.indexOf('k-ib-vote')).toBeLessThan(html.indexOf('k-ib-list'));
    expect(html).toContain('3 min ago');
    expect(agoText(0, 10_000, km)).toContain('now');
    expect(inboxHtml([], null, 0, km)).toContain('Nothing yet');
  });
});
