/**
 * The keyboard, as each player likes it (PK 1.8.0: "button keyboard config for assign to play
 * game"). Every action of the kingdom view and of the 3D hero mode has up to two keys, named by
 * their place on the keyboard (KeyboardEvent.code), so a Khmer layout plays the same. The
 * defaults are config/kingdom/controls.json; the player's own choice is kept in the browser
 * (localStorage, if it is there) and Reset brings the defaults back.
 */
import type { Controls } from '@temples/shared';

export type KeyGroup = 'map' | 'hero';
export const KEY_GROUPS: readonly KeyGroup[] = ['map', 'hero'];
/** Each action has this many key slots. */
export const SLOTS = 2;
/** Esc stops the key wait, Backspace empties the slot: neither can be given to an action. */
export const RESERVED = new Set(['Escape', 'Backspace']);
export const STORE_KEY = 'temples.keys.v1';

type Binds = Record<KeyGroup, Record<string, string[]>>;
interface StoreLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** The browser's storage, or null where there is none (private window, blocked, tests). */
export function browserStore(): StoreLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const NAMED: Record<string, string> = {
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'Alt',
  AltRight: 'R-Alt',
  Equal: '=',
  Minus: '-',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
  NumpadMultiply: 'Num *',
  NumpadDivide: 'Num /',
  NumpadEnter: 'Num Enter',
  NumpadDecimal: 'Num .',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
  CapsLock: 'Caps',
};

/** A key's short name on screen: KeyW → W, Digit1 → 1, ArrowUp → ↑, Numpad4 → Num 4. */
export function keyLabel(code: string): string {
  if (NAMED[code]) return NAMED[code]!;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

export class Keymap {
  private binds: Binds;
  /** Bumped on every change (the panel redraws when it moves). */
  version = 0;

  constructor(
    readonly defaults: Controls,
    private readonly store: StoreLike | null = browserStore(),
  ) {
    this.binds = this.fresh();
    this.load();
  }

  private fresh(): Binds {
    const b = { map: {}, hero: {} } as Binds;
    for (const g of KEY_GROUPS) for (const a of this.defaults[g]) b[g][a.id] = [...a.keys];
    return b;
  }

  /** The actions of a group, in the order of the config. */
  actions(g: KeyGroup): Controls[KeyGroup] {
    return this.defaults[g];
  }

  keys(g: KeyGroup, id: string): readonly string[] {
    return this.binds[g][id] ?? [];
  }

  /** The action this key does in the group, or null. */
  action(g: KeyGroup, code: string): string | null {
    for (const a of this.defaults[g]) if (this.binds[g][a.id]!.includes(code)) return a.id;
    return null;
  }

  is(g: KeyGroup, id: string, code: string): boolean {
    return this.keys(g, id).includes(code);
  }

  /** Is one of the action's keys down (held = the codes now pressed)? */
  held(g: KeyGroup, id: string, held: ReadonlySet<string>): boolean {
    return this.keys(g, id).some((k) => held.has(k));
  }

  /**
   * Give `code` to an action's slot. If another action of the same group had that key, it takes
   * this slot's old key instead (a swap), so no key ever does two things. False = not allowed.
   */
  set(g: KeyGroup, id: string, slot: number, code: string): boolean {
    const mine = this.binds[g][id];
    if (!mine || slot < 0 || slot >= SLOTS || RESERVED.has(code)) return false;
    const old = mine[slot];
    for (const a of this.defaults[g]) {
      const ks = this.binds[g][a.id]!;
      const i = ks.indexOf(code);
      if (i < 0 || (a.id === id && i === slot)) continue;
      if (a.id === id) ks.splice(i, 1);
      else if (old && !ks.includes(old)) ks[i] = old;
      else ks.splice(i, 1);
    }
    const at = Math.min(slot, mine.length);
    if (at < mine.length) mine[at] = code;
    else mine.push(code);
    this.changed();
    return true;
  }

  /** Empty an action's slot. */
  clear(g: KeyGroup, id: string, slot: number): void {
    const mine = this.binds[g][id];
    if (!mine || slot >= mine.length) return;
    mine.splice(slot, 1);
    this.changed();
  }

  /** Back to config/kingdom/controls.json. */
  reset(): void {
    this.binds = this.fresh();
    this.changed();
    try {
      this.store?.removeItem(STORE_KEY);
    } catch {
      /* the defaults still hold for this visit */
    }
  }

  /** Only what differs from the defaults is kept (a new action in the config gets its keys). */
  private changed(): void {
    this.version++;
    const out: Partial<Binds> = {};
    for (const g of KEY_GROUPS)
      for (const a of this.defaults[g]) {
        const ks = this.binds[g][a.id]!;
        if (ks.join() !== a.keys.join()) ((out[g] ??= {}) as Record<string, string[]>)[a.id] = [...ks];
      }
    try {
      this.store?.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
      /* not kept, but it works for this visit */
    }
  }

  private load(): void {
    let raw: string | null = null;
    try {
      raw = this.store?.getItem(STORE_KEY) ?? null;
    } catch {
      return;
    }
    if (!raw) return;
    let saved: unknown;
    try {
      saved = JSON.parse(raw);
    } catch {
      return;
    }
    if (!saved || typeof saved !== 'object') return;
    for (const g of KEY_GROUPS) {
      const sg = (saved as Record<string, unknown>)[g];
      if (!sg || typeof sg !== 'object') continue;
      for (const [id, ks] of Object.entries(sg as Record<string, unknown>)) {
        if (!this.binds[g][id] || !Array.isArray(ks)) continue;
        const ok = ks.filter((k): k is string => typeof k === 'string' && !!k && !RESERVED.has(k)).slice(0, SLOTS);
        // Any key already taken in the group (an older save) stays with its first owner.
        const taken = new Set(
          Object.entries(this.binds[g])
            .filter(([o]) => o !== id && !(o in (sg as object)))
            .flatMap(([, v]) => v),
        );
        this.binds[g][id] = ok.filter((k) => !taken.has(k));
      }
      // Drop duplicates across saved actions (first in config order wins).
      const seen = new Set<string>();
      for (const a of this.defaults[g])
        this.binds[g][a.id] = this.binds[g][a.id]!.filter((k) => !seen.has(k) && (seen.add(k), true));
    }
  }
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The keyboard panel (year bar 🎮): a tab per group, two key buttons per action. */
export function keysPanelHtml(
  km: Keymap,
  tab: KeyGroup,
  waiting: { group: KeyGroup; id: string; slot: number } | null,
): string {
  const tabs = KEY_GROUPS.map(
    (g) =>
      `<button class="k-keys-tab${g === tab ? ' k-on' : ''}" data-act="keys-tab:${g}" data-ui>${g === 'map' ? 'នគរ · Kingdom' : 'វីរបុរស · Hero'}</button>`,
  ).join('');
  const rows = km
    .actions(tab)
    .map((a) => {
      const ks = km.keys(tab, a.id);
      const slots = Array.from({ length: SLOTS }, (_, i) => {
        const wait = waiting && waiting.group === tab && waiting.id === a.id && waiting.slot === i;
        const label = wait ? '…' : ks[i] ? esc(keyLabel(ks[i]!)) : '—';
        return `<button class="k-key${wait ? ' k-wait' : ''}${ks[i] ? '' : ' k-empty'}" data-act="keys-set:${tab}:${a.id}:${i}" data-ui>${label}</button>`;
      }).join('');
      return `<div class="k-keyrow"><span class="k-keyname">${esc(a.km)} <small>${esc(a.en)}</small></span>${slots}</div>`;
    })
    .join('');
  const hint = waiting
    ? 'ចុចគ្រាប់ចុចថ្មី · Press the new key (Esc: stop, Backspace: empty)'
    : 'ចុចលើគ្រាប់ចុច ដើម្បីប្តូរ · Click a key to change it';
  return (
    `<h3><span>🎮 ក្តារចុច · Keyboard</span><button data-act="keys-close" data-ui>✕</button></h3>` +
    `<div class="k-keys-tabs">${tabs}</div>` +
    `<div class="k-keys-list">${rows}</div>` +
    `<div class="k-keys-foot"><span class="k-keys-hint">${hint}</span><button class="k-keys-reset" data-act="keys-reset" data-ui>🔄 ដើម · Reset</button></div>`
  );
}
