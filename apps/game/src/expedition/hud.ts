import type { ExpeditionConfig, HeroConfig } from '@temples/shared';
import { HALF, SHRINES, zoneAt } from './kulenMap';
import type { HeroState } from './hero';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const KM_DIGITS = '០១២៣៤៥៦៧៨៩';
const km = (n: number) => String(n).replace(/\d/g, (d) => KM_DIGITS[Number(d)]!);

export interface HudModel {
  hero: HeroState | null;
  heroCfg: HeroConfig | null;
  /** Hero choice screen: seconds left and chat votes, or null once a hero is chosen. */
  select: { secondsLeft: number; votes: [number, number, number] } | null;
  expedition: number; // 1..4
  of: number;
  quarterShare: number; // 0..1 progress of this expedition's 25%
  feed: Array<{ name: string; what: string }>;
  explored: Uint8Array;
  minimapBase: HTMLCanvasElement;
  camView: { x: number; z: number; w: number; h: number };
  cooldowns: Record<string, number>;
  /** The Old Quarry: blocks brought to camp, carrying one now, cut progress (0..1) or null. */
  quarry: { delivered: number; carrying: boolean; cutting: number | null };
  /** Show the big how-to-play card (first seconds after the hero is chosen). */
  howTo: boolean;
}

/**
 * Expedition HUD (prompt E01/E03), Khmer first, all inside the 9:16 zones that keep clear
 * of TikTok's header, comments and buttons. Interactive parts (hero cards, minimap, skill
 * buttons) take pointer events; the rest lets clicks through to the jungle.
 */
export class ExpeditionHud {
  readonly root: HTMLDivElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly mini: HTMLCanvasElement;
  private readonly miniG: CanvasRenderingContext2D | null;
  private miniAt = 0;
  private lastSelectKey = '';
  private lastBarsKey = '';
  onPickHero: (index: 0 | 1 | 2) => void = () => undefined;
  onMinimap: (x: number, z: number, button: number) => void = () => undefined;
  onSkill: (key: 'Q' | 'W' | 'E' | 'R') => void = () => undefined;

  constructor(
    parent: HTMLElement,
    private readonly cfg: ExpeditionConfig,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'exp-ui';
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="exp-top" data-ui>
        <div class="exp-chapter"><span class="exp-chapter-km">ជំពូក ១ · ស្វែងរកថ្មពិសិដ្ឋ</span><span class="exp-chapter-en">Chapter 1 · Find the sacred stone</span></div>
        <div class="exp-objective" id="exp-objective"></div>
        <div class="exp-quota"><span id="exp-quota-label"></span><div class="exp-quota-bar"><div id="exp-quota-fill"></div></div></div>
      </section>
      <ol class="exp-feed" id="exp-feed"></ol>
      <canvas class="exp-minimap" id="exp-minimap" width="280" height="280" data-ui></canvas>
      <section class="exp-bars" id="exp-bars" data-ui></section>
      <section class="exp-skills" id="exp-skills"></section>
      <section class="exp-select" id="exp-select" hidden></section>
      <div class="exp-floats" id="exp-floats"></div>
      <section class="exp-howto" id="exp-howto" hidden data-ui>
        <div class="exp-howto-km">ព្រួញ ដើរ · កណ្ដុរ តម្រង់ · ចុច វាយ</div>
        <div class="exp-howto-en">Arrow keys walk · Mouse aims · Click to strike</div>
        <div class="exp-howto-keys"><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> ពរ · skills <kbd>Space</kbd> លោត · dash <kbd>F</kbd> ដាប់ថ្ម · cut stone</div>
      </section>
      <div class="exp-target" id="exp-target" hidden><span id="exp-target-name"></span><i><b id="exp-target-fill"></b></i></div>
    `;
    parent.append(this.root);
    for (const id of [
      'objective',
      'quota-label',
      'quota-fill',
      'feed',
      'bars',
      'skills',
      'select',
      'floats',
      'target',
      'target-name',
      'target-fill',
      'howto',
    ]) {
      this.el[id] = this.root.querySelector(`#exp-${id}`)!;
    }
    this.mini = this.root.querySelector('#exp-minimap')!;
    this.miniG = this.mini.getContext('2d');
    this.mini.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const r = this.mini.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * HALF * 2 - HALF;
      const z = ((e.clientY - r.top) / r.height) * HALF * 2 - HALF;
      this.onMinimap(x, z, e.button);
    });
    this.mini.addEventListener('contextmenu', (e) => e.preventDefault());
    this.el.select!.addEventListener('pointerdown', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-hero]');
      if (card) {
        e.stopPropagation();
        this.onPickHero(Number(card.dataset.hero) as 0 | 1 | 2);
      }
    });
    this.el.skills!.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
      if (b) {
        e.stopPropagation();
        this.onSkill(b.dataset.key as 'Q' | 'W' | 'E' | 'R');
      }
    });
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  render(m: HudModel, now: number): void {
    // Hero choice.
    const sel = this.el.select!;
    sel.hidden = !m.select;
    if (m.select) {
      // Build the cards once; afterwards only the countdown and vote counts change,
      // so a click is never lost to a re-render.
      if (!this.lastSelectKey) {
        this.lastSelectKey = 'built';
        sel.innerHTML =
          `<div class="exp-select-head" data-ui>ជ្រើសវីរជន · Choose your hero <b id="exp-select-sec"></b></div>` +
          `<div class="exp-select-sub" data-ui>អ្នកមើលវាយ !១ !២ !៣ · Viewers type !1 !2 !3</div>` +
          `<div class="exp-cards">${this.cfg.heroes
            .map(
              (h, i) => `<button class="exp-card exp-card-${h.id}" data-hero="${i}" data-ui>
                <span class="exp-card-num">!${i + 1}</span>
                <span class="exp-card-emblem"></span>
                <span class="exp-card-name">${esc(h.km)}</span>
                <span class="exp-card-en">${esc(h.en)}</span>
                <span class="exp-card-role">${esc(h.roleKm)} · ${esc(h.roleEn)}</span>
                <span class="exp-card-stats">
                  <i style="--v:${h.health / 900}"></i><i style="--v:${h.energy / 160}"></i><i style="--v:${h.speed / 5.2}"></i>
                </span>
                <span class="exp-card-votes" data-votes="${i}"></span>
              </button>`,
            )
            .join('')}</div>`;
      }
      const sec = sel.querySelector('#exp-select-sec');
      const secText = km(m.select.secondsLeft);
      if (sec && sec.textContent !== secText) sec.textContent = secText;
      sel.querySelectorAll<HTMLElement>('[data-votes]').forEach((v) => {
        const text = `${km(m.select!.votes[Number(v.dataset.votes)]!)} សំឡេង · votes`;
        if (v.textContent !== text) v.textContent = text;
      });
    } else this.lastSelectKey = '';

    // Objective: the zone the hero stands in, or the call to explore.
    const hero = m.hero;
    const zone = hero ? zoneAt(hero.x, hero.z) : null;
    const qy = m.quarry;
    const obj =
      qy.cutting !== null
        ? `<b>កំពុងដាប់ថ្ម ${km(Math.round(qy.cutting * 100))}%</b> · Cutting a block…`
        : qy.carrying
          ? '<b>សែងថ្មទៅគំនរនៅជំរំ</b> · Carry the block to the camp pile'
          : zone?.id === 'quarry'
            ? `<b>${esc(zone.km)}</b> · click a rock face (or F) to cut a block`
            : zone
              ? `<b>${esc(zone.km)}</b> · ${esc(zone.en)}`
              : hero && !hero.alive
                ? '<b>កំពុងរស់ឡើងវិញ…</b> · Rising again at the shrine…'
                : '<b>ស្វែងរកភ្នំគូលែន</b> · Explore Kulen: find the stone vein';
    if (this.el.objective!.innerHTML !== obj) this.el.objective!.innerHTML = obj;
    const q = `ដំណើរ ${km(m.expedition)}/${km(m.of)} · Expedition ${m.expedition}/${m.of} · ថ្ម ${km(qy.delivered)} blocks`;
    if (this.el['quota-label']!.textContent !== q) this.el['quota-label']!.textContent = q;
    this.el['quota-fill']!.style.width = `${Math.round(m.quarterShare * 100)}%`;

    this.el.howto!.hidden = !m.howTo;

    // Gift feed (last 4).
    const feed = m.feed
      .slice(0, 4)
      .map((f) => `<li data-ui><b>${esc(f.name)}</b> ${esc(f.what)}</li>`)
      .join('');
    if (this.el.feed!.innerHTML !== feed) this.el.feed!.innerHTML = feed;

    // Hero bars.
    if (hero && m.heroCfg) {
      const key = `${m.heroCfg.id}|${Math.round(hero.health)}|${Math.round(hero.energy)}`;
      if (key !== this.lastBarsKey) {
        this.lastBarsKey = key;
        const h = m.heroCfg;
        this.el.bars!.innerHTML = `<span class="exp-portrait exp-card-${h.id}"><span class="exp-card-emblem"></span></span>
          <span class="exp-bars-text"><b>${esc(h.km)}</b> ${esc(h.en)}</span>
          <span class="exp-bar hp"><i style="width:${(hero.health / h.health) * 100}%"></i><em>${Math.round(hero.health)}</em></span>
          <span class="exp-bar en"><i style="width:${(hero.energy / h.energy) * 100}%"></i><em>${Math.round(hero.energy)}</em></span>`;
        this.renderSkills(h);
      }
    }
    this.el.bars!.hidden = !hero;
    this.el.skills!.hidden = !hero;
    for (const b of this.el.skills!.querySelectorAll<HTMLElement>('[data-key]')) {
      const left = m.cooldowns[b.dataset.skill ?? ''] ?? 0;
      b.style.setProperty('--cd', String(left));
    }

    if (now - this.miniAt > 150) {
      this.miniAt = now;
      this.drawMinimap(m);
    }
  }

  /** Damage numbers and short messages that rise and fade (stage pixels). */
  renderFloats(list: Array<{ text: string; x: number; y: number; opacity: number; color: string }>): void {
    const html = list
      .map(
        (f) =>
          `<span class="exp-float" style="left:${f.x.toFixed(0)}px;top:${f.y.toFixed(0)}px;opacity:${f.opacity.toFixed(2)};color:${f.color}">${esc(f.text)}</span>`,
      )
      .join('');
    if (this.el.floats!.innerHTML !== html) this.el.floats!.innerHTML = html;
  }

  /** Name and health bar over the target under the cursor. */
  renderTarget(t: { x: number; y: number; name: string; share: number } | null): void {
    const box = this.el.target!;
    box.hidden = !t;
    if (!t) return;
    box.style.left = `${t.x.toFixed(0)}px`;
    box.style.top = `${t.y.toFixed(0)}px`;
    if (this.el['target-name']!.textContent !== t.name) this.el['target-name']!.textContent = t.name;
    this.el['target-fill']!.style.width = `${Math.round(t.share * 100)}%`;
  }

  private skillsFor = '';
  private renderSkills(h: HeroConfig): void {
    if (this.skillsFor === h.id) return;
    this.skillsFor = h.id;
    this.el.skills!.innerHTML = h.skills
      .map((id) => {
        const s = this.cfg.skills[id]!;
        const [c1, c2] = [s.colors[0], s.colors[1] ?? s.colors[0]];
        return `<button class="exp-skill" data-key="${s.key}" data-skill="${id}" data-ui style="--c1:${c1};--c2:${c2}">
          <span class="exp-skill-key">${s.key}</span><span class="exp-skill-km">${esc(s.km)}</span></button>`;
      })
      .join('');
  }

  private drawMinimap(m: HudModel): void {
    const g = this.miniG;
    if (!g) return;
    const S = 280 / (HALF * 2);
    g.clearRect(0, 0, 280, 280);
    g.drawImage(m.minimapBase, 0, 0, 280, 280);
    // Unexplored jungle stays under the mist.
    g.fillStyle = 'rgba(232,238,234,0.92)';
    for (let r = 0; r < 90; r++)
      for (let c = 0; c < 90; c++) {
        const v = m.explored[r * 90 + c]!;
        if (v < 200) {
          g.globalAlpha = 1 - v / 255;
          g.fillRect(c * 2 * S, r * 2 * S, 2 * S + 0.5, 2 * S + 0.5);
        }
      }
    g.globalAlpha = 1;
    g.fillStyle = '#f5c75a';
    for (const [x, z] of SHRINES) {
      g.beginPath();
      g.arc((x + HALF) * S, (z + HALF) * S, 4, 0, Math.PI * 2);
      g.fill();
    }
    // Camera view.
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2;
    const v = m.camView;
    g.strokeRect((v.x - v.w / 2 + HALF) * S, (v.z - v.h / 2 + HALF) * S, v.w * S, v.h * S);
    if (m.hero) {
      const hx = (m.hero.x + HALF) * S;
      const hz = (m.hero.z + HALF) * S;
      g.save();
      g.translate(hx, hz);
      g.rotate(-m.hero.heading + Math.PI);
      g.fillStyle = '#ffe07a';
      g.strokeStyle = '#3b2412';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(6, 6);
      g.lineTo(0, 3);
      g.lineTo(-6, 6);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
}

/** Game-drawn cursor (a golden pointer) so the stream shows exactly what the host does. */
export class GameCursor {
  readonly el: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'exp-cursor';
    this.el.hidden = true;
    this.el.innerHTML = `<svg class="c-normal" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><path d="M6 4 L40 22 L25 26 L33 42 L27 45 L19 29 L8 38 Z" fill="#ffd36a" stroke="#3b2412" stroke-width="3" stroke-linejoin="round"/></svg><svg class="c-attack" viewBox="0 0 48 48" width="52" height="52" aria-hidden="true"><path d="M5 5 L30 30 M24 36 L36 24 M31 31 L42 42" stroke="#3b2412" stroke-width="8" stroke-linecap="round"/><path d="M5 5 L30 30 M24 36 L36 24 M31 31 L42 42" stroke="#ff6a4a" stroke-width="4.5" stroke-linecap="round"/><circle cx="5" cy="5" r="3" fill="#ffe07a"/></svg>`;
    parent.append(this.el);
  }
  move(x: number, y: number): void {
    this.el.style.transform = `translate(${x - 6}px, ${y - 4}px)`;
  }
  private state = 'normal';
  /** normal = gold arrow; attack = red-gold sword (target in reach); far = grey (too far). */
  setState(state: 'normal' | 'attack' | 'far'): void {
    if (state === this.state) return;
    this.state = state;
    this.el.dataset.state = state;
  }
  show(on: boolean): void {
    this.el.hidden = !on;
  }
}
