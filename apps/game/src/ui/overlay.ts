import layoutJson from '../../../../config/layout.json';
import cardsJson from '../../../../config/history-cards.json';
import { type BuilderSummary, type CommandMessage, type GameState, type TierName } from '@temples/shared';
import type { GameModel } from '../logic/store';

type Zone = { x: number; y: number; w: number; h: number; keepClear?: boolean };
const zones = layoutJson.zones as Record<string, Zone>;
const cards = (cardsJson as { cards: Array<{ km: string; en: string; source: string }> }).cards;
const help = layoutJson.helpPopup;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => n.toLocaleString('en-US');
const km = (n: number) => n.toLocaleString('en-US');
const pos = (z: Zone) => `left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px`;

const GUILDS: Record<string, { km: string; en: string }> = {
  '1': { km: 'ជាងកាត់ថ្ម', en: 'Stone Cutters' },
  '2': { km: 'អ្នកថែដំរី', en: 'Elephant Keepers' },
  '3': { km: 'អ្នកបើកក្បូន', en: 'River Rafters' },
  '4': { km: 'ជាងចម្លាក់', en: 'Carvers' },
};

/**
 * On-screen text (prompt 13), Khmer first. Everything sits inside the zones in
 * config/layout.json and never in TikTok's own areas (AC-21). The help pop-up is neutral:
 * no gift prices, no "send X to unlock".
 */
export class Overlay {
  /** Played without the bridge (?offline=1, the web build): no "Reconnecting…" badge. */
  offline = false;
  readonly root: HTMLDivElement;
  private readonly el: Record<string, HTMLElement> = {};
  private cardIndex = 0;
  private cardUntil = 0;
  private nextCardAt = 0;
  private bannerUntil = 0;
  private lastStateKey = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ui';
    this.root.innerHTML = `
      <div class="grade"></div>
      <section class="title-band" style="${pos(zones.titleBand!)}">
        <div class="game-title" data-ui>សាងប្រាសាទ</div>
        <div class="temple-line" data-ui><span class="temple-km" id="ui-temple-km"></span><span class="temple-en" id="ui-temple-en"></span></div>
        <div class="era" id="ui-era" data-ui></div>
        <div class="progress-row">
          <span class="res-pill res-gift" data-ui><i></i><b id="ui-gifts">0</b><small>អំណោយ</small></span>
          <div class="progress" data-ui><div class="progress-fill" id="ui-fill"></div><span id="ui-pct"></span></div>
          <span class="res-pill res-like" data-ui><i></i><b id="ui-likes">0</b><small>ចូលចិត្ត</small></span>
        </div>
        <div class="under" data-ui><span id="ui-stones"></span><span id="ui-stock"></span><span id="ui-guild"></span></div>
      </section>
      <section class="info-band" style="${pos(zones.infoBand!)}">
        <ol class="feed" id="ui-feed"></ol>
        <div class="top"><div class="top-h" data-ui>អ្នកសាងសង់ឆ្នើម · Top builders</div><ol id="ui-top"></ol></div>
        <div class="card" id="ui-card" hidden></div>
      </section>
      <div class="toasts" id="ui-toasts" style="${pos(zones.toasts!)}"></div>
      <div class="banner" id="ui-banner" hidden></div>
      <div class="help" id="ui-help" data-ui hidden></div>
      <div class="badge" id="ui-badge" hidden></div>
      <div class="zones" id="ui-zones" hidden></div>
    `;
    parent.append(this.root);
    for (const id of [
      'temple-km',
      'temple-en',
      'era',
      'fill',
      'pct',
      'stones',
      'stock',
      'guild',
      'feed',
      'top',
      'card',
      'toasts',
      'banner',
      'badge',
      'zones',
      'help',
      'gifts',
      'likes',
    ]) {
      this.el[id] = this.root.querySelector(`#ui-${id}`)!;
    }
    this.el.zones!.innerHTML = Object.entries(zones)
      .filter(([, z]) => z.keepClear)
      .map(([name, z]) => `<div class="zone" style="${pos(z)}"><span>${name}</span></div>`)
      .join('');
  }

  render(m: GameModel, now: number): void {
    if (m.state) this.renderState(m.state);
    this.renderFeed(m);
    this.renderToasts(m, now);
    this.el.zones!.hidden = !m.safeZones;
    const badge = this.el.badge!;
    if (!m.connected && !this.offline) {
      badge.hidden = false;
      badge.textContent = 'កំពុងភ្ជាប់ឡើងវិញ… · Reconnecting…';
    } else if (!m.connected) {
      badge.hidden = true;
    } else if (m.status && m.status.connection !== 'connected') {
      badge.hidden = false;
      badge.textContent = `TikTok ${m.status.connection === 'reconnecting' ? 'កំពុងភ្ជាប់ឡើងវិញ… · reconnecting…' : 'offline'}`;
    } else if (m.paused) {
      badge.hidden = false;
      badge.textContent = 'ផ្អាក · Paused';
    } else {
      badge.hidden = true;
    }
    this.renderCard(now);
    if (now > this.bannerUntil) this.el.banner!.hidden = true;
    this.renderHelp(now);
  }

  private helpStart = -1;
  /** PK: the help pop-up can be closed with ✕ and then stays away. */
  private helpOff = false;
  /**
   * Help pop-up at the top (PK: white rounded box, black letters, pops up and goes).
   * Build mode explains likes and guilds; Expedition explains the controls.
   */
  private renderHelp(now: number): void {
    const h = help;
    if (this.helpStart < 0) this.helpStart = now;
    const t = (now - this.helpStart) / 1000 - h.firstSec;
    const on = !this.helpOff && t >= 0 && t % h.everySec < h.showSec;
    const el = this.el.help!;
    const expedition = this.root.classList.contains('mode-expedition');
    const kingdom = this.root.classList.contains('mode-kingdom');
    const html = kingdom
      ? '<b>ចុចឆ្វេង</b> ជ្រើស · <b>ចុចស្ដាំ</b> បញ្ជា · <b>!១ !២ !៣</b> បោះឆ្នោត<br>Left-click: select · Right-click: command · Viewers vote !1 !2 !3'
      : expedition
        ? '<b>ព្រួញ</b> ដើរ · <b>កណ្ដុរ</b> តម្រង់ · <b>ចុច</b> វាយ · <b>Q W E R</b> ពរ · <b>F</b> ដាប់ថ្ម<br>Arrow keys walk · Mouse aims · Click to strike · Q W E R skills · F cut stone'
        : '<b>ចុចបេះដូង</b> ដើម្បីដាក់ថ្ម · <b>វាយ 1–4</b> ចូលក្រុម<br>Tap like to lay a stone · Type 1–4 to join a guild';
    const full = `<button class="help-x" aria-label="close">✕</button>${html}`;
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('pointerdown', (e) => {
        if (!(e.target as HTMLElement).closest('.help-x')) return;
        e.stopPropagation();
        this.helpOff = true;
        el.hidden = true;
      });
    }
    if (el.dataset.html !== full) {
      el.dataset.html = full;
      el.innerHTML = full;
    }
    if (el.hidden === on) {
      el.hidden = !on;
      if (on) {
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      }
    }
  }

  /** Big banner for Huge gifts (spec: Screen); stays up for most of the cut. */
  banner(name: string, tier: TierName, units: number, now: number, ms = 5000): void {
    if (tier !== 'huge') return;
    const b = this.el.banner!;
    const initial = [...name.replace('@', '')][0] ?? '?';
    b.innerHTML = `<div class="avatar">${esc(initial)}</div><div><div class="b-name">${esc(name)}</div><div class="b-sub">ថ្មធំ ${km(units)} · Huge stone +${fmt(units)}</div></div>`;
    b.hidden = false;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    this.bannerUntil = now + ms;
  }

  command(c: CommandMessage, now: number): void {
    if (c.name === 'guildJoined' && c.displayName && c.guild) {
      this.toast(`${c.displayName} → ${GUILDS[c.guild]!.km}`, now);
    }
    if (c.name === 'welcome' && c.displayName) this.toast(`សូមស្វាគមន៍ ${c.displayName}`, now);
  }

  private extraToasts: Array<{ text: string; at: number }> = [];
  private toast(text: string, now: number): void {
    this.extraToasts.push({ text, at: now });
    this.extraToasts = this.extraToasts.slice(-2);
  }

  /** Show a history card now (idle mode) or on the regular schedule. */
  maybeCard(now: number, everyMs: number, idle: boolean): void {
    if (now < this.cardUntil) return;
    if (this.nextCardAt === 0) this.nextCardAt = now + everyMs;
    if (now < this.nextCardAt && !(idle && now - this.cardUntil > 25_000)) return;
    const c = cards[this.cardIndex++ % cards.length]!;
    const el = this.el.card!;
    el.innerHTML = `<div class="card-h">តើអ្នកដឹងទេ? · Did you know?</div><p class="card-km">${esc(c.km)}</p><p class="card-en">${esc(c.en)}</p><div class="card-src">${esc(c.source)}</div>`;
    this.cardUntil = now + 12_000;
    this.nextCardAt = now + everyMs;
  }

  private renderCard(now: number): void {
    const showing = now < this.cardUntil;
    this.el.card!.hidden = !showing;
    this.root.classList.toggle('card-on', showing);
  }

  private renderState(s: GameState): void {
    const t = s.temple;
    const top = s.topTemple[0];
    const leadGuild = (Object.entries(s.guilds) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
    // TikTok support as resources: gifts and likes received today (the bridge counts them).
    const gifts = fmtShort(s.giftsToday ?? 0);
    const likes = fmtShort(s.likesToday ?? 0);
    if (this.el.gifts!.textContent !== gifts) this.el.gifts!.textContent = gifts;
    if (this.el.likes!.textContent !== likes) this.el.likes!.textContent = likes;
    const key = JSON.stringify([t, s.topTemple, leadGuild]);
    if (key === this.lastStateKey) return;
    this.lastStateKey = key;
    const pct = Math.min(100, (t.progress / t.target) * 100);
    this.el['temple-km']!.textContent = t.km;
    this.el['temple-en']!.textContent = t.en;
    this.el.era!.textContent = /^\d+$/.test(t.year) ? `គ.ស. ${t.year} · ${t.king}` : `${t.year} · ${t.king}`;
    this.el.fill!.style.width = `${pct}%`;
    this.el.pct!.textContent = `${pct < 10 ? pct.toFixed(1) : Math.floor(pct)}%`;
    this.el.stones!.textContent = `ថ្ម ${fmt(t.progress)} / ${fmt(t.target)}`;
    this.el.stock!.textContent = t.stockpile > 0 ? `ឃ្លាំងគូលែន ${fmt(t.stockpile)}` : '';
    this.el.guild!.textContent = leadGuild && leadGuild[1] > 0 ? `⚑ ${GUILDS[leadGuild[0]]!.km}` : '';
    this.el.top!.innerHTML =
      s.topTemple
        .slice(0, 5)
        .map(
          (b: BuilderSummary) =>
            `<li data-ui><span class="n">${esc(b.name)}</span><span class="u">${fmt(b.units)}</span></li>`,
        )
        .join('') || '<li class="empty" data-ui>ចាប់ផ្ដើមសាងសង់! · Start building!</li>';
    void top;
  }

  private lastFeedKey = '';
  private renderFeed(m: GameModel): void {
    const key = m.feed.map((f) => `${f.name}${f.count}${f.ts}`).join('|');
    if (key === this.lastFeedKey) return;
    this.lastFeedKey = key;
    this.el.feed!.innerHTML = m.feed
      .map((f) => {
        const what =
          f.action === 'gift'
            ? `${esc(f.giftName ?? '')}${f.count > 1 ? ` ×${f.count}` : ''}`
            : f.action === 'like'
              ? `❤ ${f.count}`
              : f.action === 'follow'
                ? 'តាមដាន · follow'
                : f.action === 'share'
                  ? 'ចែករំលែក · share'
                  : f.action;
        return `<li data-ui><b>${esc(f.name)}</b> <span>${what}</span> <em>+${fmt(f.units)}</em></li>`;
      })
      .join('');
  }

  private renderToasts(m: GameModel, now: number): void {
    const items = m.toasts
      .filter((t) => now - t.at < 4000)
      .map((t) => `<div class="toast t-${t.tier}" data-ui><b>${esc(t.name)}</b> +${fmt(t.units)} ថ្ម</div>`)
      .concat(
        this.extraToasts
          .filter((t) => now - t.at < 4000)
          .map((t) => `<div class="toast" data-ui>${esc(t.text)}</div>`),
      );
    const html = items.join('');
    if (this.el.toasts!.innerHTML !== html) this.el.toasts!.innerHTML = html;
  }
}

/** Zones TikTok covers; used by tests and the safe-zone overlay. */
export function keepClearZones(): Array<Zone & { name: string }> {
  return Object.entries(zones)
    .filter(([, z]) => z.keepClear)
    .map(([name, z]) => ({ name, ...z }));
}

/** Short counts for the resource pills: 950, 1.2k, 34k, 1.5M. */
export function fmtShort(n: number): string {
  if (n < 1000) return String(Math.floor(n));
  if (n < 10_000) return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${(Math.floor(n / 100_000) / 10).toFixed(1)}M`;
}
