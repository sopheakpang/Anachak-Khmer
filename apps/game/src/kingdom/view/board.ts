/**
 * PK 2026-10-20 (D160): "add a board to turn on and off the top bar menu or message boxes". The
 * ⚙ button on the year bar opens a board listing every button of the top menu and year bar and
 * every message box, each with a switch. What is switched off is hidden (by CSS, so the game's
 * own drawing is untouched) and remembered in this browser. The ⚙ button itself always stays.
 * Which are off at the start: rules.json `board.off`.
 */

export type BoardGroup = 'menu' | 'yearbar' | 'box';

export interface BoardItem {
  id: string;
  group: BoardGroup;
  km: string;
  en: string;
  /** What to hide (inside the kingdom HUD). */
  sel: string;
}

const act = (a: string) => `.k-ui [data-act="${a}"]:not(.k-board *)`;

export const BOARD_ITEMS: readonly BoardItem[] = [
  { id: 'idle', group: 'menu', km: 'ទំនេរ', en: 'Idle villagers', sel: act('idle') },
  { id: 'find', group: 'menu', km: 'រក', en: 'Find', sel: act('find') },
  { id: 'callWorkers', group: 'menu', km: 'ហៅកម្មករ', en: 'Call workers', sel: act('call-workers') },
  { id: 'army', group: 'menu', km: 'ទ័ព', en: 'Army', sel: act('army') },
  { id: 'callArmy', group: 'menu', km: 'ហៅទ័ព', en: 'Call the army', sel: act('call-army') },
  { id: 'auto', group: 'menu', km: 'ស្វ័យប្រវត្តិ', en: 'Auto-work', sel: act('auto') },
  { id: 'map', group: 'menu', km: 'ផែនទី', en: 'Map', sel: act('map') },
  { id: 'history', group: 'menu', km: 'ប្រវត្តិ', en: 'History', sel: act('history') },
  { id: 'new', group: 'menu', km: 'ល្បែងថ្មី', en: 'New game', sel: act('new') },
  { id: 'about', group: 'menu', km: 'អំពី', en: 'About', sel: act('about') },
  { id: 'sound', group: 'menu', km: 'សំឡេង', en: 'Sound', sel: act('sound') },
  { id: 'fullscreen', group: 'menu', km: 'ពេញអេក្រង់', en: 'Full screen', sel: act('fullscreen') },
  { id: 'speed', group: 'yearbar', km: 'ល្បឿន', en: 'Speed', sel: act('speed') },
  { id: 'musicVol', group: 'yearbar', km: 'កម្រិតតន្ត្រី', en: 'Music volume', sel: act('music-vol') },
  { id: 'orders', group: 'yearbar', km: 'ការបញ្ជាទិញ', en: 'Orders (buyers)', sel: act('orders') },
  { id: 'inbox', group: 'yearbar', km: 'ព្រះរាជបញ្ជា', en: 'Royal Orders inbox', sel: act('inbox') },
  { id: 'keys', group: 'yearbar', km: 'ក្តារចុច', en: 'Keyboard', sel: act('keys') },
  { id: 'gfx', group: 'yearbar', km: 'ក្រាហ្វិក', en: 'Graphics', sel: act('gfx') },
  { id: 'objective', group: 'box', km: 'គោលដៅ', en: 'Chapter goal line', sel: '.k-ui #k-objective' },
  { id: 'minimap', group: 'box', km: 'ផែនទីតូច', en: 'Minimap', sel: '.k-ui .k-minibox' },
  { id: 'council', group: 'box', km: 'ក្រុមប្រឹក្សា', en: 'Council vote box', sel: '.k-ui #k-council' },
  { id: 'toasts', group: 'box', km: 'សារលោត', en: 'Pop-up messages', sel: '.k-ui #k-toasts' },
  {
    id: 'roofbars',
    group: 'box',
    km: 'របារវឌ្ឍនភាព',
    en: 'Progress bars on roofs',
    sel: '.k-ui #k-roofbars',
  },
  { id: 'labels', group: 'box', km: 'ឈ្មោះទីកន្លែង', en: 'Place names', sel: '.k-ui #k-labels' },
  { id: 'floats', group: 'box', km: 'លេខអណ្ដែត', en: 'Floating numbers (+10 food)', sel: '.k-ui #k-floats' },
  { id: 'bubbles', group: 'box', km: 'ពពុះនិយាយ', en: 'Speech bubbles', sel: '.k-ui #k-bubbles' },
];

const KEY = 'temples.board.off';

/** The switches: what is off, remembered in this browser (a blocked store just forgets). */
export class Board {
  readonly off: Set<string>;
  version = 0;

  constructor(
    defaults: readonly string[] = [],
    private readonly store: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(),
  ) {
    this.off = new Set(defaults);
    try {
      const saved = this.store?.getItem(KEY);
      if (saved) {
        const list = JSON.parse(saved) as unknown;
        if (Array.isArray(list)) {
          this.off.clear();
          for (const id of list)
            if (typeof id === 'string' && BOARD_ITEMS.some((b) => b.id === id)) this.off.add(id);
        }
      }
    } catch {
      /* a broken copy: keep the defaults */
    }
  }

  toggle(id: string): void {
    if (!BOARD_ITEMS.some((b) => b.id === id)) return;
    if (this.off.has(id)) this.off.delete(id);
    else this.off.add(id);
    this.version++;
    try {
      this.store?.setItem(KEY, JSON.stringify([...this.off]));
    } catch {
      /* not kept: fine */
    }
  }

  /** Turn everything back on. */
  reset(): void {
    this.off.clear();
    this.version++;
    try {
      this.store?.setItem(KEY, '[]');
    } catch {
      /* not kept */
    }
  }

  /** The CSS that hides what is off. */
  css(): string {
    return BOARD_ITEMS.filter((b) => this.off.has(b.id))
      .map((b) => `${b.sel}{display:none !important}`)
      .join('\n');
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const GROUP: Record<BoardGroup, string> = {
  menu: 'ម៉ឺនុយខាងលើ · Top menu',
  yearbar: 'របារឆ្នាំ · Year bar',
  box: 'ប្រអប់សារ · Message boxes',
};

/** The board's panel: a switch for every item, by group. */
export function boardHtml(off: ReadonlySet<string>): string {
  const groups = (['menu', 'yearbar', 'box'] as const)
    .map(
      (g) =>
        `<h4>${GROUP[g]}</h4><div class="k-bd-grid">` +
        BOARD_ITEMS.filter((b) => b.group === g)
          .map(
            (b) =>
              `<button class="k-bd-sw${off.has(b.id) ? ' k-bd-off' : ''}" data-act="board-toggle:${b.id}" data-ui><b>${off.has(b.id) ? 'OFF' : 'ON'}</b> ${b.km} · ${b.en}</button>`,
          )
          .join('') +
        `</div>`,
    )
    .join('');
  return (
    `<h3><span>⚙ ក្ដារបង្ហាញ · Show on screen</span><button data-act="board" data-ui>✕</button></h3>` +
    groups +
    `<button class="k-bd-reset" data-act="board-reset" data-ui>បើកទាំងអស់ · All on</button>`
  );
}
