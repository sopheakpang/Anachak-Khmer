/**
 * PK 2026-10-20 (D160): "move the events that pop up into ព្រះរាជបញ្ជា". Nothing pops up over
 * the kingdom any more: the news (gifts, saves, raids, finds), the world's history as the years
 * pass, the chapter cards and the viewers' council vote all go into one Royal Orders inbox,
 * opened from the year bar (👑, key N). The button counts what is unread and glows while a vote
 * is open. Rules: rules.json `inbox` (how many to keep, whether anything still pops up).
 */

export type InboxKind = 'news' | 'world' | 'card';

export interface InboxItem {
  id: number;
  kind: InboxKind;
  /** One line (HTML, already escaped by its maker). */
  html: string;
  /** A card's full text, opened from the inbox. */
  card?: string;
  /** Game clock when it came (performance.now ms). */
  at: number;
  read: boolean;
}

export class Inbox {
  readonly items: InboxItem[] = [];
  private next = 1;
  /** Bumped on every change, so the HUD only redraws when something changed. */
  version = 0;

  constructor(readonly max = 60) {}

  push(kind: InboxKind, html: string, at: number, card?: string): InboxItem {
    const it: InboxItem = { id: this.next++, kind, html, at, read: false, ...(card ? { card } : {}) };
    this.items.unshift(it);
    if (this.items.length > this.max) this.items.length = this.max;
    this.version++;
    return it;
  }

  get unread(): number {
    let n = 0;
    for (const it of this.items) if (!it.read) n++;
    return n;
  }

  /** Everything has been seen (the inbox was opened). */
  readAll(): void {
    let changed = false;
    for (const it of this.items)
      if (!it.read) {
        it.read = true;
        changed = true;
      }
    if (changed) this.version++;
  }

  get(id: number): InboxItem | undefined {
    return this.items.find((it) => it.id === id);
  }

  clear(): void {
    if (!this.items.length) return;
    this.items.length = 0;
    this.version++;
  }
}

const ICON: Record<InboxKind, string> = { news: '📣', world: '📜', card: '🏯' };

/** How long ago, in Khmer digits and English (minutes, or "now"). */
export function agoText(at: number, now: number, km: (n: number) => string): string {
  const m = Math.floor(Math.max(0, now - at) / 60_000);
  return m < 1 ? 'ឥឡូវ · now' : `${km(m)} នាទីមុន · ${m} min ago`;
}

/**
 * The inbox panel: the council vote while it is open (live counts), then the messages, newest
 * first; a chapter card has an Open button that shows the whole card.
 */
export function inboxHtml(
  items: readonly InboxItem[],
  council: string | null,
  now: number,
  km: (n: number) => string,
): string {
  const head = `<h3><span>👑 ព្រះរាជបញ្ជា · Royal Orders</span><button data-act="inbox" data-ui>✕</button></h3>`;
  const vote = council ? `<div class="k-ib-vote">${council}</div>` : '';
  const rows = items.length
    ? items
        .map(
          (it) =>
            `<li class="k-ib-${it.kind}${it.read ? '' : ' k-ib-new'}"><i>${ICON[it.kind]}</i><span>${it.html}<small>${agoText(it.at, now, km)}</small></span>` +
            (it.card ? `<button data-act="inbox-card:${it.id}" data-ui>បើក · Open</button>` : '') +
            `</li>`,
        )
        .join('')
    : `<li class="k-ib-empty"><span>មិនទាន់មានដំណឹង · Nothing yet</span></li>`;
  return `${head}${vote}<ol class="k-ib-list">${rows}</ol>`;
}
