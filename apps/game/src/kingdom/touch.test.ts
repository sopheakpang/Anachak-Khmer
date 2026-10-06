import { describe, expect, it } from 'vitest';
import { TOUCH, TouchGestures, type TouchHandlers } from './touch';

function rec() {
  const log: string[] = [];
  const h: TouchHandlers = {
    tap: (x, y) => log.push(`tap ${x},${y}`),
    doubleTap: (x, y) => log.push(`double ${x},${y}`),
    pan: (dx, dy) => log.push(`pan ${Math.round(dx)},${Math.round(dy)}`),
    zoom: (s) => log.push(`zoom ${s.toFixed(2)}`),
    holdStart: (x, y) => log.push(`hold ${x},${y}`),
    holdMove: () => log.push('holdmove'),
    holdEnd: () => log.push('holdend'),
    boxStart: (x, y) => log.push(`box ${x},${y}`),
    boxMove: () => log.push('boxmove'),
    boxEnd: (x0, y0, x1, y1) => log.push(`boxend ${x0},${y0} ${x1},${y1}`),
  };
  return { g: new TouchGestures(h), log };
}

describe('touch gestures (Android, D72)', () => {
  it('a short touch is a tap; two quick taps are a double tap', () => {
    const { g, log } = rec();
    g.down(1, 100, 100, 0);
    g.up(1, 102, 101, 120);
    g.down(1, 110, 105, 250);
    g.up(1, 110, 105, 330);
    g.down(1, 110, 105, 2000);
    g.up(1, 110, 105, 2050);
    expect(log).toEqual(['tap 102,101', 'double 110,105', 'tap 110,105']);
  });

  it('dragging one finger moves the view, not a tap', () => {
    const { g, log } = rec();
    g.down(1, 100, 100, 0);
    g.move(1, 100 + TOUCH.slop + 5, 100, 50);
    g.move(1, 160, 120, 80);
    g.up(1, 160, 120, 100);
    expect(log).toEqual([`pan ${TOUCH.slop + 5},0`, `pan ${160 - 100 - TOUCH.slop - 5},20`]);
  });

  it('holding still shows the hint; hold then drag draws a selection box', () => {
    const { g, log } = rec();
    g.down(1, 300, 300, 0);
    g.tick(TOUCH.holdMs + 10);
    g.up(1, 300, 300, 900);
    expect(log).toEqual(['hold 300,300', 'holdend']);
    log.length = 0;
    g.down(1, 300, 300, 5000);
    g.tick(5000 + TOUCH.holdMs + 1);
    g.move(1, 420, 380, 5600);
    g.move(1, 500, 400, 5700);
    g.up(1, 500, 400, 5800);
    expect(log).toEqual([
      'hold 300,300',
      'holdend',
      'box 300,300',
      'boxmove',
      'boxmove',
      'boxend 300,300 500,400',
    ]);
  });

  it('two fingers pinch to zoom and never tap', () => {
    const { g, log } = rec();
    g.down(1, 100, 100, 0);
    g.down(2, 300, 100, 10);
    g.move(2, 500, 100, 50); // fingers twice as far apart
    g.up(2, 500, 100, 90);
    g.up(1, 100, 100, 100);
    expect(log[0]).toBe('zoom 2.00');
    expect(log.some((l) => l.startsWith('tap'))).toBe(false);
  });
});
