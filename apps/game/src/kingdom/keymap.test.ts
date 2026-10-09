import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { Keymap, keyLabel, keysPanelHtml, KEY_GROUPS, STORE_KEY } from './keymap';

const data = loadKingdom();
const memStore = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('keyboard config (PK 1.8.0)', () => {
  it('controls.json gives every action of both groups its keys, no key twice in a group', () => {
    for (const g of KEY_GROUPS) {
      const all = data.controls[g].flatMap((a) => a.keys);
      expect(new Set(all).size).toBe(all.length);
      for (const a of data.controls[g]) expect(a.km.length && a.en.length && a.keys.length).toBeTruthy();
    }
    const k = new Keymap(data.controls, null);
    expect(k.action('map', 'KeyW')).toBe('panUp');
    expect(k.action('hero', 'KeyW')).toBe('forward');
    expect(k.action('hero', 'KeyJ')).toBe('attack');
    expect(k.action('map', 'KeyJ')).toBeNull();
    expect(k.held('map', 'panRight', new Set(['ArrowRight']))).toBe(true);
    expect(k.held('hero', 'run', new Set(['ShiftRight']))).toBe(true);
  });

  it('assigning a key another action has swaps them, so no key does two things', () => {
    const k = new Keymap(data.controls, null);
    expect(k.set('hero', 'attack', 0, 'KeyE')).toBe(true);
    expect(k.keys('hero', 'attack')).toEqual(['KeyE']);
    expect(k.keys('hero', 'work')).toEqual(['KeyJ']); // took attack's old key
    // Moving a key to the action's other slot.
    k.set('map', 'panUp', 1, 'KeyW');
    expect(k.keys('map', 'panUp')).toEqual(['ArrowUp', 'KeyW']);
    // A second slot can be filled and emptied.
    k.set('hero', 'jump', 1, 'KeyX');
    expect(k.keys('hero', 'jump')).toEqual(['Space', 'KeyX']);
    k.clear('hero', 'jump', 1);
    expect(k.keys('hero', 'jump')).toEqual(['Space']);
    // Esc and Backspace stay for the panel.
    expect(k.set('hero', 'jump', 0, 'Escape')).toBe(false);
    for (const g of KEY_GROUPS) {
      const all = k.actions(g).flatMap((a) => [...k.keys(g, a.id)]);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('the choice is kept in the browser, Reset brings the defaults back, a bad save is ignored', () => {
    const s = memStore();
    const a = new Keymap(data.controls, s);
    a.set('hero', 'dash', 0, 'KeyC');
    expect(JSON.parse(s.m.get(STORE_KEY)!)).toEqual({ hero: { dash: ['KeyC'] } });
    const b = new Keymap(data.controls, s);
    expect(b.keys('hero', 'dash')).toEqual(['KeyC']);
    b.reset();
    expect(s.m.has(STORE_KEY)).toBe(false);
    expect(b.keys('hero', 'dash')).toEqual(['KeyQ']);
    // A save that clashes with a default key loses that key; junk is ignored; a throwing store is fine.
    s.m.set(STORE_KEY, JSON.stringify({ hero: { dash: ['KeyJ', 'Escape', 7] }, nope: 1 }));
    const c = new Keymap(data.controls, s);
    expect(c.keys('hero', 'dash')).toEqual([]);
    expect(c.keys('hero', 'attack')).toEqual(['KeyJ']);
    s.m.set(STORE_KEY, '{bad');
    expect(new Keymap(data.controls, s).keys('hero', 'dash')).toEqual(['KeyQ']);
    const boom = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const d = new Keymap(data.controls, boom);
    expect(d.set('hero', 'dash', 0, 'KeyC')).toBe(true);
    d.reset();
    expect(d.keys('hero', 'dash')).toEqual(['KeyQ']);
  });

  it('keys have short names and the panel lists every action with Khmer first', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('NumpadAdd')).toBe('Num +');
    expect(keyLabel('F5')).toBe('F5');
    const k = new Keymap(data.controls, null);
    const html = keysPanelHtml(k, 'hero', { group: 'hero', id: 'attack', slot: 0 });
    for (const a of data.controls.hero) {
      expect(html).toContain(`keys-set:hero:${a.id}:0`);
      expect(html).toContain(`keys-set:hero:${a.id}:1`);
      expect(html.indexOf(a.km)).toBeLessThan(html.indexOf(a.en, html.indexOf(a.km)));
    }
    expect(html).toContain('k-wait');
    expect(html).toContain('keys-reset');
    expect(html).toContain('keys-tab:map');
    expect(keysPanelHtml(k, 'map', null)).toContain('keys-set:map:panUp:0');
  });
});
