import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { BOARD_ITEMS, Board, boardHtml } from './board';

/** PK 2026-10-20 (D160): the ⚙ board switches top-bar buttons and message boxes on and off. */

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('the ⚙ board', () => {
  it('lists the top menu, the year bar and the message boxes, never its own button', () => {
    const groups = new Set(BOARD_ITEMS.map((b) => b.group));
    expect([...groups].sort()).toEqual(['box', 'menu', 'yearbar']);
    expect(new Set(BOARD_ITEMS.map((b) => b.id)).size).toBe(BOARD_ITEMS.length);
    expect(BOARD_ITEMS.some((b) => b.sel.includes('"board"'))).toBe(false);
    for (const b of BOARD_ITEMS) expect(b.sel.startsWith('.k-ui')).toBe(true);
  });

  it('a switch hides its item by CSS and is remembered; all on brings everything back', () => {
    const store = mem();
    const b = new Board([], store);
    expect(b.css()).toBe('');
    b.toggle('history');
    b.toggle('toasts');
    expect(b.css()).toContain('[data-act="history"]');
    expect(b.css()).toContain('#k-toasts');
    // The board's own copy of the button stays visible.
    expect(b.css()).toContain(':not(.k-board *)');
    const again = new Board([], store);
    expect([...again.off].sort()).toEqual(['history', 'toasts']);
    again.toggle('history');
    expect(again.off.has('history')).toBe(false);
    again.reset();
    expect(again.off.size).toBe(0);
    expect(new Board([], store).off.size).toBe(0);
  });

  it('unknown ids and a broken saved copy are ignored; the rules give the start', () => {
    const store = mem();
    store.setItem('temples.board.off', '{oops');
    expect([...new Board(['map'], store).off]).toEqual(['map']);
    store.setItem('temples.board.off', JSON.stringify(['nope', 'find']));
    expect([...new Board([], store).off]).toEqual(['find']);
    const b = new Board([], null);
    b.toggle('nope');
    expect(b.off.size).toBe(0);
    expect(loadKingdom().rules.board.off).toEqual([]);
  });

  it('the panel shows each switch ON or OFF', () => {
    const html = boardHtml(new Set(['map']));
    expect(html).toContain('data-act="board-toggle:map"');
    expect(html).toMatch(/k-bd-off[^>]*board-toggle:map/);
    expect(html).toContain('data-act="board-reset"');
  });
});
