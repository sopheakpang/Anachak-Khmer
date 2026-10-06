import {
  RESOURCES,
  type Confidence,
  type Cost,
  type KingdomData,
  type Resource,
  type WorldEvent,
} from '@temples/shared';
import { PLAYER, type KingdomSim } from '../sim/sim';
import { TEAM_COLOR } from './scene';
import { LANDSCAPE_SIZE as KSIZE } from '../../stage';
import './hud.css';

/**
 * Kingdom HUD on the 16:9 stage (1920 × 1080, D51), text ≥ 26 px:
 * top bar: resources, population, objective, year, era, ruler;
 * right: council vote; left: messages;
 * bottom bar: minimap, selection and command buttons (build, train, research).
 */

const KM_DIGITS = '០១២៣៤៥៦៧៨៩';
export const km = (n: number | string) => String(n).replace(/\d/g, (d) => KM_DIGITS[Number(d)]!);
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The year bar spans the Angkor age: Jayavarman II (802) to just after the Bayon. */
export const YEARBAR_RANGE: [number, number] = [800, 1220];

/** Where each resource comes from (PK: "Food from rice fields, fishing, hunting"). */
export const RES_FROM: Record<Resource, string> = {
  food: 'មកពីស្រែ នេសាទ បរបាញ់ ផ្លែឈើ · from rice fields, fishing, hunting and fruit trees',
  wood: 'មកពីដើមឈើ (រទេះគោដឹកពីឃ្លាំងឈើ) · from trees (ox-carts bring it from the lumber camp)',
  stone: 'មកពីថ្ម និងថ្មភក់គូលែន · from rock outcrops and the Kulen sandstone',
  gold: 'មកពីរ៉ែមាស · from gold deposits',
};

export const RES_LABEL: Record<Resource, { km: string; en: string; color: string }> = {
  food: { km: 'ស្បៀង', en: 'Food', color: '#9fd05a' },
  wood: { km: 'ឈើ', en: 'Wood', color: '#c9874a' },
  stone: { km: 'ថ្ម', en: 'Stone', color: '#d8ccb0' },
  gold: { km: 'មាស', en: 'Gold', color: '#f1c24a' },
};

const CONFIDENCE: Record<Confidence, { km: string; en: string; cls: string }> = {
  HISTORICALLY_CONFIRMED: { km: 'មានភស្តុតាង', en: 'Confirmed', cls: 'c-ok' },
  HISTORICALLY_SUPPORTED: { km: 'គាំទ្រដោយភស្តុតាង', en: 'Supported', cls: 'c-ok' },
  HISTORICALLY_UNCERTAIN: { km: 'មិនច្បាស់', en: 'Uncertain', cls: 'c-unsure' },
  GAMEPLAY_ABSTRACTION: { km: 'សម្រាប់ហ្គេម', en: 'Gameplay', cls: 'c-game' },
  FICTIONAL: { km: 'ប្រឌិត', en: 'Fictional', cls: 'c-game' },
};

export function costHtml(cost: Cost): string {
  return RESOURCES.filter((r) => cost[r])
    .map((r) => `<span class="k-cost" style="--c:${RES_LABEL[r].color}"><i></i>${cost[r]}</span>`)
    .join('');
}

export interface Button {
  act: string;
  km: string;
  en: string;
  cost?: Cost;
  disabled?: boolean;
  hotkey?: string;
  /** Sprite sheet (IconAtlas) of the item's 3D model, shown above the label. */
  icon?: string | null;
  /** Hover hint: what it is and what it still needs. */
  tip?: string;
}

export interface MenuState {
  idle: number;
  army: number;
  autoWork: boolean;
  /** Sound effects on or off. */
  sound: boolean;
  /** Background music on or off, and its volume 0..1 (D76). */
  music?: boolean;
  musicVolume?: number;
}

export class KingdomHud {
  readonly root: HTMLDivElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly mini: HTMLCanvasElement;
  private readonly miniG: CanvasRenderingContext2D | null;
  private base: ImageData | null = null;
  private lastPanel = '';
  private buttonTip: { html: string; el: HTMLElement } | null = null;
  /** What each box last got (innerHTML reads back normalised, so it can't be compared). */
  private readonly shown: Record<string, string> = {};

  private setHtml(id: string, html: string): void {
    if (this.shown[id] === html) return;
    this.shown[id] = html;
    this.el[id]!.innerHTML = html;
  }
  private toastList: Array<{ html: string; until: number }> = [];
  /** The command bar folded down to its title line (PK: minimise the bottom bar, D67). */
  panelMin = false;
  /**
   * Command bar mode (PK: auto hide and pop up): 'auto' = shown only while something is
   * selected or being placed, slides away otherwise; 'open' = always shown; 'folded' = title
   * line only. The tab on the bar cycles auto → open → folded → auto.
   */
  panelMode: 'auto' | 'open' | 'folded' = 'auto';
  /** Phone layout (D72): the menu bar folds into a ☰ button. */
  mobile = false;
  menuOpen = false;
  /** Minimap pings (a watchman's find) until a time. */
  private pings: Array<{ at: [number, number]; until: number }> = [];
  onAct: (act: string) => void = () => undefined;
  onMinimap: (x: number, z: number, button: number) => void = () => undefined;

  constructor(
    parent: HTMLElement,
    private readonly data: KingdomData,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'k-ui';
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="k-top" data-ui>
        <div class="k-res" id="k-res"></div>
        <div class="k-year"><span class="k-year-km" id="k-yearkm"></span></div>
        <div class="k-objective" id="k-objective"></div>
        <div class="k-year-en" id="k-yearen"></div>
      </section>
      <div class="k-minibox" data-ui>
        <canvas class="k-minimap" id="k-minimap" width="226" height="226" data-tip="${'<b>ផែនទី</b> · Map: click to open the old map of the empire (M); right-click sends the selection'}"></canvas>
      </div>
      <section class="k-council" id="k-council" hidden data-ui></section>
      <div class="k-yearbar" id="k-yearbar" data-ui></div>
      <ol class="k-toasts" id="k-toasts"></ol>
      <section class="k-panel" id="k-panel" data-ui></section>
      <nav class="k-menubar" id="k-menubar" data-ui></nav>
      <div class="k-labels" id="k-labels"></div>
      <div class="k-floats" id="k-floats"></div>
      <div class="k-bubbles" id="k-bubbles"></div>
      <section class="k-orders k-glass" id="k-orders" hidden data-ui></section>
      <div class="k-radial" id="k-radial" hidden></div>
      <section class="k-outcome k-glass" id="k-outcome" hidden data-ui></section>
      <section class="k-card k-glass" id="k-card" hidden data-ui></section>
      <section class="k-history k-glass" id="k-history" hidden data-ui></section>
      <div class="k-tip k-glass" id="k-tip" hidden></div>
    `;
    parent.append(this.root);
    for (const id of [
      'yearbar',
      'res',
      'objective',
      'council',
      'toasts',
      'panel',
      'outcome',
      'card',
      'history',
      'yearkm',
      'yearen',
      'menubar',
      'labels',
      'floats',
      'bubbles',
      'orders',
      'radial',
      'tip',
    ])
      this.el[id] = this.root.querySelector(`#k-${id}`)!;
    this.mini = this.root.querySelector('#k-minimap')!;
    this.miniG = this.mini.getContext('2d');
    this.root.addEventListener('pointerdown', (e) => {
      // A right-click over the circle menu commands the selection, it does not press a button.
      if (e.button === 2 && (e.target as HTMLElement).closest('.k-radial')) return;
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (b && !(b as HTMLButtonElement).disabled && b.getAttribute('aria-disabled') !== 'true') {
        e.stopPropagation();
        this.onAct(b.dataset.act!);
      }
    });
    this.mini.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      // offsetX/Y are in the canvas's own (untransformed) pixels, so the CSS diamond
      // (rotate + squash, like the camera's diagonal view) needs no extra maths.
      const u = e.offsetX / this.mini.clientWidth;
      const v = e.offsetY / this.mini.clientHeight;
      if (u < 0 || v < 0 || u > 1 || v > 1) return;
      this.onMinimap(u, v, e.button);
    });
    this.mini.addEventListener('contextmenu', (e) => e.preventDefault());
    // Hints for buttons: what the item is and what it still needs.
    this.root.addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      this.buttonTip = b ? { html: b.dataset.tip!, el: b } : null;
    });
    this.root.addEventListener('pointerout', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      if (b && !b.contains(e.relatedTarget as Node)) this.buttonTip = null;
    });
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  toast(html: string, now: number, sec = 5): void {
    this.toastList.push({ html, until: now + sec * 1000 });
    if (this.toastList.length > 4) this.toastList.shift();
  }

  /** Year, era and ruler of the chapter being played. */
  renderHeader(sim: KingdomSim): void {
    const ch = sim.chapterData;
    const era = sim.era;
    const king = this.data.temples[ch.temple]?.king ?? era.ruler.en;
    const kmText = `${km(sim.year)} គ.ស. · ${era.km}`;
    const enText = `${sim.year} CE · ${era.en} · ${king}`;
    if (this.el.yearkm!.textContent !== kmText) this.el.yearkm!.textContent = kmText;
    if (this.el.yearen!.textContent !== enText) this.el.yearen!.textContent = enText;
  }

  /**
   * The year bar (PK: a timeline that runs with the temple age, its speed adjustable, and
   * what happened in the world): 800 to 1220 CE, the 13 temples as diamonds (built gold,
   * this chapter's pulsing), world events as dots, the year now, and the speed button.
   */
  renderYearBar(b: {
    year: number;
    speed: number;
    span: [number, number];
    temples: Array<{ year: number; name: { km: string; en: string }; state: 'done' | 'now' | 'later' }>;
    events: WorldEvent[];
    /** Music volume (0–1), when there is music (the 🔉 button next to the speed). */
    musicVolume?: number;
    /** The order board (Hay Day-style): buyers waiting, how many can be filled now, a junk in port. */
    orders?: { ready: number; canFill: number; boat: boolean };
  }): void {
    const [y0, y1] = YEARBAR_RANGE;
    const x = (y: number) => `${(((Math.max(y0, Math.min(y1, y)) - y0) / (y1 - y0)) * 100).toFixed(2)}%`;
    const span = `<i class="k-yb-span" style="left:${x(b.span[0])};width:calc(${x(b.span[1])} - ${x(b.span[0])})"></i>`;
    const temples = b.temples
      .map(
        (t) =>
          `<i class="k-yb-t k-yb-${t.state}" style="left:${x(t.year)}" data-tip="${esc(`<b>${t.name.km}</b> · ${t.name.en} · ${t.year} CE`)}"></i>`,
      )
      .join('');
    const events = b.events
      .map(
        (w) =>
          `<i class="k-yb-e${w.khmer ? ' k-yb-k' : ''}${w.year <= b.year ? ' k-yb-past' : ''}" style="left:${x(w.year)}" data-tip="${esc(`<b>${w.circa ? 'c. ' : ''}${w.year} · ${w.place.km} · ${w.place.en}</b><br>${w.km}<br>${w.en}`)}"></i>`,
      )
      .join('');
    this.setHtml(
      'yearbar',
      `<span class="k-yb-end">${km(y0)}</span><div class="k-yb-track">${span}${events}${temples}<b class="k-yb-pin" style="left:${x(b.year)}"><span>${km(b.year)}</span></b></div><span class="k-yb-end">${km(y1)}</span>` +
        `<button class="k-yb-speed" data-act="speed" data-tip="${esc('<b>ល្បឿន</b> · Game speed: press to go faster (the year runs on with the game; + and − keys)')}" data-ui>⏩ <b>${km(b.speed)}×</b></button>` +
        (b.musicVolume === undefined
          ? ''
          : `<button class="k-yb-speed" data-act="music-vol" data-tip="${esc('<b>កម្រិតតន្ត្រី</b> · Music volume: press for the next step')}" data-ui>🔉 <b>${km(Math.round(b.musicVolume * 100))}%</b></button>`) +
        (b.orders
          ? `<button class="k-yb-speed k-yb-orders${b.orders.canFill ? ' k-yb-hot' : ''}" data-act="orders" data-tip="${esc('<b>ការបញ្ជាទិញ</b> · Orders: buyers want your goods and pay in gold (O)')}" data-ui>${b.orders.boat ? '⛵' : '📜'} ការបញ្ជាទិញ · Orders <b>${km(b.orders.ready)}</b></button>`
          : ''),
    );
  }

  /** The order board (Hay Day-style), or null to close it. */
  renderOrders(html: string | null): void {
    this.el.orders!.hidden = !html;
    if (html) this.setHtml('orders', html);
  }

  /** Full baskets over the houses to click (Hay Day-style collecting). */
  renderBubbles(list: Array<{ x: number; y: number; id: number }>): void {
    this.setHtml(
      'bubbles',
      list
        .map(
          (b) =>
            `<button class="k-bubble" style="left:${b.x.toFixed(0)}px;top:${b.y.toFixed(0)}px" data-act="collect:${b.id}" data-tip="${esc('<b>កន្ត្រកពង</b> · A full basket: eggs from the hens, click to take the food')}" data-ui>🥚</button>`,
        )
        .join(''),
    );
  }

  /** A card in the middle of the screen (chapter intro, era end, a temple's history). */
  renderCard(html: string | null, side = false): void {
    this.el.card!.hidden = !html;
    this.el.card!.classList.toggle('k-side', side);
    // PK: every card can be closed at once with ✕ (the chapter card stays up a long time).
    if (html)
      this.setHtml(
        'card',
        `<button class="k-card-x" data-act="card-close" data-tip="${esc('<b>បិទ</b> · Close')}" data-ui>✕</button>${html}`,
      );
  }

  /** The history timeline: every temple of the campaign, its year and state. */
  renderHistory(html: string | null): void {
    this.el.history!.hidden = !html;
    if (html) this.setHtml('history', html);
  }

  /** Mark a point on the minimap for a few seconds (a watchman's report). */
  ping(at: [number, number], now: number): void {
    this.pings.push({ at, until: now + 6000 });
  }

  /**
   * The resource bar (AoE II-like, D67): the era shield, each resource with how many
   * villagers work on it, the people, and the clock of the game.
   */
  /** PK: flash what a build or an order still needs (red) on the resource bar for a moment. */
  need(res: readonly Resource[], now: number, sec: number): void {
    for (const k of res) this.needUntil[k] = now + sec * 1000;
  }
  private readonly needUntil: Partial<Record<Resource, number>> = {};

  renderTop(sim: KingdomSim, objective: string, extra = ''): void {
    const r = sim.res[PLAYER];
    const now = performance.now();
    const low = sim.data.rules.alerts.lowRes;
    // PK: light alerts on the bar: running out (soft red pulse), still needed (bright red flash).
    const alertOf = (k: Resource) =>
      (this.needUntil[k] ?? 0) > now ? ' k-need' : r[k] < low ? ' k-low' : '';
    const workers: Record<string, number> = { food: 0, wood: 0, stone: 0, gold: 0 };
    for (const u of sim.units.values())
      if (u.team === PLAYER && u.task.kind === 'gather') workers[u.task.res] = (workers[u.task.res] ?? 0) + 1;
      else if (u.team === PLAYER && u.task.kind === 'hunt') workers.food!++;
    const eraN = sim.data.eras.findIndex((e) => e.id === sim.era.id) + 1;
    const t = Math.floor(sim.time);
    const clock = `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const html =
      `<span class="k-age" title="${esc(sim.era.en)}"><b>${km(eraN)}</b></span>` +
      RESOURCES.map(
        (k) =>
          `<span class="k-pill k-r k-r-${k}${alertOf(k)}" style="--c:${RES_LABEL[k].color}" data-tip="${esc(`<b>${RES_LABEL[k].km}</b> · ${RES_LABEL[k].en}: ${workers[k] ?? 0} villagers at work<br>${RES_FROM[k]}`)}" data-ui><i></i><b>${Math.floor(r[k])}</b><em class="k-w">${km(workers[k] ?? 0)}</em></span>`,
      ).join('') +
      `<span class="k-pill k-pop" data-tip="${esc('<b>ប្រជាជន</b> · People / houses allow')}" data-ui><i></i><b>${sim.popUsed()}/${sim.popCap()}</b></span>` +
      `<span class="k-pill k-clock"><b>${clock}</b></span>`;
    this.setHtml('res', html);
    // The temple's progress and raid warnings sit on the objective line.
    this.setHtml('objective', `<span class="k-obj">${objective}</span>${extra}`);
  }

  renderToasts(now: number): void {
    this.toastList = this.toastList.filter((t) => t.until > now);
    const html = this.toastList.map((t) => `<li data-ui>${t.html}</li>`).join('');
    this.setHtml('toasts', html);
  }

  renderCouncil(html: string | null): void {
    this.el.council!.hidden = !html;
    if (html) this.setHtml('council', html);
  }

  renderOutcome(html: string | null): void {
    this.el.outcome!.hidden = !html;
    if (html) this.setHtml('outcome', html);
  }

  /**
   * The command panel: what is selected (name, health, historical label, queue) and its
   * buttons. Only rebuilt when something changes, so clicks are never lost.
   */
  renderPanel(p: {
    title: { km: string; en: string };
    count?: number;
    hp?: [number, number];
    confidence?: Confidence;
    note?: string;
    queue?: { label: string; frac: number; more: number } | null;
    buttons: Button[];
    hint?: string;
    /** Nothing selected or being placed: the bar may slide away (auto mode). */
    idle?: boolean;
  }): void {
    this.lastButtons = p.idle ? [] : p.buttons;
    this.lastTitle = p.title;
    const conf = p.confidence ? CONFIDENCE[p.confidence] : null;
    const away = this.panelMode === 'auto' && !!p.idle;
    this.panelMin = this.panelMode === 'folded';
    const tab =
      this.panelMode === 'auto'
        ? away
          ? ['▲', 'បើក · Keep the command bar open']
          : ['▲', 'បើកជានិច្ច · Keep the command bar open (it hides by itself when nothing is selected)']
        : this.panelMode === 'open'
          ? ['▼', 'បង្រួម · Fold the command bar down']
          : ['⇕', 'លាក់ស្វ័យប្រវត្តិ · Hide by itself when nothing is selected'];
    const html = `
      <button class="k-min" data-act="panel-min" data-tip="${esc(tab[1]!)}" data-ui>${tab[0]}</button>
      <div class="k-sel">
        <div class="k-sel-name">${esc(p.title.km)}${p.count && p.count > 1 ? ` ×${km(p.count)}` : ''}</div>
        <div class="k-sel-en">${esc(p.title.en)}</div>
        ${p.hp ? `<div class="k-hp"><i style="width:${Math.round((100 * p.hp[0]) / p.hp[1])}%"></i><span>${Math.ceil(p.hp[0])}/${p.hp[1]}</span></div>` : ''}
        ${conf ? `<div class="k-conf ${conf.cls}" title="${esc(p.note ?? '')}">${conf.km} · ${conf.en}</div>` : ''}
        ${p.queue ? `<div class="k-queue"><span>${esc(p.queue.label)}${p.queue.more ? ` +${p.queue.more}` : ''}</span><i><b style="width:${Math.round(p.queue.frac * 100)}%"></b></i></div>` : ''}
        ${p.hint ? `<div class="k-hint">${p.hint}</div>` : ''}
      </div>
      <div class="k-buttons">${p.buttons
        .map(
          (b) =>
            `<button class="k-btn${b.icon !== undefined ? ' has-icon' : ''}" data-act="${b.act}" ${b.disabled ? 'aria-disabled="true"' : ''} ${b.tip ? `data-tip="${esc(b.tip)}"` : ''} data-ui>${
              b.icon !== undefined
                ? `<span class="k-icon-pop"><span class="k-icon" ${b.icon ? `style="background-image:url(${b.icon})"` : ''}></span></span>`
                : ''
            }<span class="k-btn-km">${esc(b.km)}</span><span class="k-btn-cost">${b.cost ? costHtml(b.cost) : esc(b.en)}</span></button>`,
        )
        .join('')}</div>`;
    if (html !== this.lastPanel) {
      this.lastPanel = html;
      this.el.panel!.innerHTML = html;
    }
    this.el.panel!.classList.toggle('k-folded', this.panelMin);
    this.el.panel!.classList.toggle('k-away', away);
  }

  private lastButtons: Button[] = [];
  private lastTitle: { km: string; en: string } = { km: '', en: '' };

  /**
   * PK: a see-through circle menu round the clicked object, as in Hay Day: the same actions
   * as the command bar, on round glass buttons in a ring, the object's name in the middle.
   * `at` is the object's place on the stage (null closes it). Kept inside the stage.
   */
  renderRadial(
    at: { x: number; y: number } | null,
    stage: { w: number; h: number; top: number; bottom: number },
  ): void {
    const list = this.lastButtons.slice(0, 10);
    const el = this.el.radial!;
    if (!at || !list.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const R = list.length <= 4 ? 140 : list.length <= 8 ? 175 : 205;
    const pad = R + 70;
    const x = Math.max(pad, Math.min(stage.w - pad, at.x));
    const y = Math.max(stage.top + pad, Math.min(stage.bottom - pad, at.y));
    el.style.left = `${x.toFixed(0)}px`;
    el.style.top = `${y.toFixed(0)}px`;
    const n = list.length;
    // Start at the top and go round clockwise; a single button sits above the object.
    // PK (1.6.0): no hint box on hover, except on a button that cannot be pressed yet, where it
    // says what is missing (resources, a building first, a later era).
    const items = list
      .map((b, i) => {
        const a = -Math.PI / 2 + (i / Math.max(n, 1)) * Math.PI * 2;
        const bx = Math.cos(a) * R;
        const by = Math.sin(a) * R;
        return `<button class="k-rb${b.disabled ? ' k-rb-off' : ''}" style="left:${bx.toFixed(0)}px;top:${by.toFixed(0)}px" data-act="${b.act}" ${b.disabled ? 'aria-disabled="true"' : ''} ${b.tip && b.disabled ? `data-tip="${esc(b.tip)}"` : ''} data-ui>${
          b.icon ? `<span class="k-rb-icon" style="background-image:url(${b.icon})"></span>` : ''
        }<span class="k-rb-km">${esc(b.km)}</span></button>`;
      })
      .join('');
    this.setHtml(
      'radial',
      `<div class="k-rb-ring"></div><span class="k-rb-name">${esc(this.lastTitle.km)}</span>${items}`,
    );
  }

  /** The menu bar at the top right (PK): idle workers, army, automation, History, New game, weather. */
  renderMenu(m: MenuState): void {
    this.el.menubar!.classList.toggle('k-open', this.menuOpen);
    this.setHtml(
      'menubar',
      (this.mobile ? `<button class="k-mb k-menu-toggle" data-act="menu" data-ui>☰</button>` : '') +
        `<button class="k-mb" data-act="idle" data-tip="${esc('<b>អ្នកស្រុកទំនេរ</b> · Idle villagers: select the next one (press again for the next)')}" data-ui>ទំនេរ · Idle <b>${km(m.idle)}</b></button>` +
        `<button class="k-mb" data-act="find" data-tip="${esc('<b>រកធនធាន</b> · Find: the watchman (or an idle villager) goes to look for the resource you have least of')}" data-ui>🔍 រក · Find</button>` +
        `<button class="k-mb" data-act="call-workers" data-tip="${esc('<b>ហៅកម្មករ</b> · Call workers: every idle villager walks to the middle of the view and finds work there')}" data-ui>ហៅកម្មករ · Workers</button>` +
        `<button class="k-mb" data-act="army" data-tip="${esc('<b>ទ័ព</b> · Army: select every soldier')}" data-ui>ទ័ព · Army <b>${km(m.army)}</b></button>` +
        `<button class="k-mb" data-act="call-army" data-tip="${esc('<b>ហៅទ័ព</b> · Call the army: every soldier marches to the middle of the view, fighting on the way')}" data-ui>ហៅទ័ព · Call</button>` +
        `<button class="k-mb ${m.autoWork ? 'k-on' : 'k-off'}" data-act="auto" data-tip="${esc('<b>ការងារស្វ័យប្រវត្តិ</b> · Auto-work: idle villagers find work themselves (build, farm, gather what is short)')}" data-ui>ស្វ័យប្រវត្តិ <b>${m.autoWork ? 'ON' : 'OFF'}</b></button>` +
        `<button class="k-mb" data-act="map" data-tip="${esc('<b>ផែនទីបុរាណ</b> · The old map of the empire: drag, scroll to zoom, click to go (M)')}" data-ui>ផែនទី · Map</button>` +
        `<button class="k-mb" data-act="history" data-ui>ប្រវត្តិ · History</button>` +
        `<button class="k-mb" data-act="new" data-ui>ល្បែងថ្មី · New game</button>` +
        `<button class="k-mb" data-act="about" data-ui>អំពី · About</button>` +
        // One button for sound and music (PK's menu fits the 1920 bar at 26 px text): all on →
        // effects only → off. Music volume is on the year bar.
        (m.music === undefined
          ? `<button class="k-mb ${m.sound ? 'k-on' : 'k-off'}" data-act="sound" data-tip="${esc('<b>សំឡេង</b> · Sound effects on or off')}" data-ui>សំឡេង <b>${m.sound ? 'ON' : 'OFF'}</b></button>`
          : `<button class="k-mb ${m.sound ? 'k-on' : 'k-off'}" data-act="sound" data-tip="${esc('<b>សំឡេង និងតន្ត្រី</b> · Sound: press for music and effects → effects only → off')}" data-ui>${m.sound ? (m.music ? '🎵' : '🔊') : '🔇'} <b>${!m.sound ? 'OFF' : m.music ? 'ON' : 'FX'}</b></button>`),
    );
  }

  /** The hint box near the pointer (null hides it); button hints win over world hints. */
  renderTip(world: { x: number; y: number; html: string } | null): void {
    const tip = this.el.tip!;
    // Only while the pointer is still over that button (a re-rendered panel can swallow the
    // pointerout that would have cleared it).
    const b =
      this.buttonTip && this.buttonTip.el.isConnected && this.buttonTip.el.matches(':hover')
        ? this.buttonTip
        : null;
    if (!b && !world) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    if (b) {
      this.setHtml('tip', b.html);
      // Beside the button, inside the stage.
      const r = b.el.getBoundingClientRect();
      const st = this.root.getBoundingClientRect();
      const k = st.width / 1920;
      const x = (r.left + r.width / 2 - st.left) / k;
      const top = (r.top - st.top) / k;
      const bottom = (r.bottom - st.top) / k;
      tip.style.left = `${Math.max(10, Math.min(KSIZE.width - 540, x - 260))}px`;
      if (top > 540) {
        tip.style.top = 'auto';
        tip.style.bottom = `${KSIZE.height - top + 12}px`;
      } else {
        tip.style.bottom = 'auto';
        tip.style.top = `${bottom + 12}px`;
      }
      return;
    }
    this.setHtml('tip', world!.html);
    tip.style.bottom = 'auto';
    tip.style.left = `${Math.max(10, Math.min(KSIZE.width - 540, world!.x + 24))}px`;
    tip.style.top = `${Math.max(110, Math.min(KSIZE.height - 440, world!.y + 20))}px`;
  }

  /** Names over the empire's towns and temples, and neighbouring kingdoms, where they are on screen. */
  renderLabels(list: Array<{ x: number; y: number; html: string; cls: string }>): void {
    this.setHtml(
      'labels',
      list
        .map(
          (l) =>
            `<span class="k-label ${l.cls}" style="left:${l.x.toFixed(0)}px;top:${l.y.toFixed(0)}px">${l.html}</span>`,
        )
        .join(''),
    );
  }

  /** Floating words (+10 food, +meat) rising over the map. */
  renderFloats(list: Array<{ x: number; y: number; text: string; opacity: number; color: string }>): void {
    this.setHtml(
      'floats',
      list
        .map(
          (f) =>
            `<span class="k-float" style="left:${f.x.toFixed(0)}px;top:${f.y.toFixed(0)}px;opacity:${f.opacity.toFixed(2)};color:${f.color}">${esc(f.text)}</span>`,
        )
        .join(''),
    );
  }

  /** Minimap: terrain (drawn once), fog, buildings, units and the camera view. */
  renderMinimap(sim: KingdomSim, view: Array<[number, number]>): void {
    const g = this.miniG;
    if (!g) return;
    const N = sim.map.size;
    const W = this.mini.width;
    const k = W / N;
    if (!this.base) {
      const colors: Record<string, [number, number, number]> = {
        grass: [143, 174, 90],
        water: [70, 120, 140],
        ford: [180, 154, 106],
        forest: [70, 110, 50],
        rock: [160, 150, 130],
        ruin: [150, 110, 80],
        hill: [96, 122, 60],
      };
      const img = g.createImageData(W, W);
      for (let y = 0; y < W; y++)
        for (let x = 0; x < W; x++) {
          const t = sim.map.terrain[Math.floor(y / k) * N + Math.floor(x / k)]!;
          const c = colors[t] ?? colors.grass!;
          img.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
        }
      this.base = img;
    }
    // Terrain darkened by fog.
    const img = new ImageData(new Uint8ClampedArray(this.base.data), W, W);
    const f = sim.fog;
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const i = Math.floor(y / k) * N + Math.floor(x / k);
        const m = f.visible[i] ? 1 : f.explored[i] ? 0.55 : 0.08;
        if (m < 1) {
          const o = (y * W + x) * 4;
          img.data[o] = img.data[o]! * m;
          img.data[o + 1] = img.data[o + 1]! * m;
          img.data[o + 2] = img.data[o + 2]! * m;
        }
      }
    g.putImageData(img, 0, 0);
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    // Temple sites: finished (gold), this chapter's (blinking outline), later ones (faint).
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    for (const site of sim.map.sites) {
      const done = sim.completed.includes(site.temple);
      const now = site.chapter === sim.chapter && !sim.outcome;
      if (done) {
        g.fillStyle = '#f1cd78';
        g.fillRect(site.tx * k, site.tz * k, site.w * k, site.d * k);
      } else {
        g.strokeStyle = now ? (blink ? '#fff3c4' : '#f1cd78') : 'rgba(241,205,120,0.35)';
        g.lineWidth = now ? 2 : 1;
        g.strokeRect(site.tx * k, site.tz * k, site.w * k, site.d * k);
      }
    }
    // Empire places: gold when found, faint until then (explore to find them).
    for (const p of sim.places) {
      const found = sim.discovered.has(p.id);
      if (p.hidden && !found) continue; // hidden until found (PK)
      g.fillStyle = found ? '#ffd76a' : 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.arc(p.at[0] * k, p.at[1] * k, found ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const b of sim.buildings.values()) {
      if (b.team !== PLAYER && !sim.fog.explored[b.tz * N + b.tx]) continue;
      if (b.type === 'monument') continue;
      g.fillStyle = b.team === PLAYER ? hex(TEAM_COLOR[PLAYER]) : sim.opponent.color;
      g.fillRect(b.tx * k, b.tz * k, Math.max(3, b.w * k), Math.max(3, b.d * k));
    }
    const half = (N * sim.map.tile) / 2;
    const toMini = (x: number, z: number): [number, number] => [
      ((x + half) / (N * sim.map.tile)) * W,
      ((z + half) / (N * sim.map.tile)) * W,
    ];
    for (const u of sim.units.values()) {
      if (u.team !== PLAYER && !sim.isVisible(u.x, u.z)) continue;
      const [x, y] = toMini(u.x, u.z);
      g.fillStyle = u.team === PLAYER ? '#9fd0ff' : '#ff6a4a';
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Watchmen's finds: a pulsing gold circle.
    const nowMs = performance.now();
    this.pings = this.pings.filter((p) => p.until > nowMs);
    for (const p of this.pings) {
      const [x, y] = toMini(p.at[0], p.at[1]);
      g.strokeStyle = '#ffd76a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 4 + ((nowMs / 120) % 8), 0, Math.PI * 2);
      g.stroke();
    }
    // Camera view.
    if (view.length === 4) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      view.forEach(([x, z], i) => {
        const [px, py] = toMini(x, z);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      });
      g.closePath();
      g.stroke();
    }
  }
}
