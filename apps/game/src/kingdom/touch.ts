/**
 * Touch gestures for the Kingdom on phones (the Android build, D72). A pure recognizer:
 * feed it pointer events (stage pixels, milliseconds) and a tick; it calls back with
 * RTS actions. No DOM here, so it is unit-tested.
 *
 * - tap: select, or send the selection (the game decides from what is under the finger)
 * - double tap: every unit of that kind on screen
 * - one-finger drag: move the view
 * - two fingers: pinch to zoom, drag to move the view
 * - hold (without moving): the hint for what is under the finger
 * - hold, then drag: a selection box
 */

export interface TouchHandlers {
  tap(x: number, y: number): void;
  doubleTap(x: number, y: number): void;
  /** The finger(s) moved by (dx, dy) stage pixels from (x, y). */
  pan(dx: number, dy: number, x: number, y: number): void;
  /** Pinch: > 1 = fingers apart (zoom in). */
  zoom(scale: number): void;
  holdStart(x: number, y: number): void;
  holdMove(x: number, y: number): void;
  holdEnd(): void;
  boxStart(x: number, y: number): void;
  boxMove(x: number, y: number): void;
  boxEnd(x0: number, y0: number, x1: number, y1: number): void;
}

export const TOUCH = {
  /** Movement that turns a touch into a drag (stage px; the stage is ~3× the CSS px). */
  slop: 30,
  holdMs: 450,
  doubleMs: 320,
  doubleSlop: 70,
};

type Mode = 'idle' | 'pending' | 'pan' | 'hold' | 'box' | 'pinch' | 'done';

export class TouchGestures {
  private readonly pts = new Map<number, { x: number; y: number }>();
  private mode: Mode = 'idle';
  private start = { x: 0, y: 0, t: 0 };
  private last = { x: 0, y: 0 };
  private pinch = { dist: 1, mx: 0, my: 0 };
  private lastTap = { x: -1e9, y: -1e9, t: -1e9 };

  constructor(private readonly on: TouchHandlers) {}

  get state(): Mode {
    return this.mode;
  }

  down(id: number, x: number, y: number, t: number): void {
    this.pts.set(id, { x, y });
    if (this.pts.size === 1) {
      this.mode = 'pending';
      this.start = { x, y, t };
      this.last = { x, y };
    } else if (this.pts.size === 2) {
      // A second finger: pinch (whatever the first was doing is dropped, a box is cancelled).
      if (this.mode === 'hold') this.on.holdEnd();
      this.mode = 'pinch';
      this.pinch = this.measure();
    }
  }

  move(id: number, x: number, y: number, t: number): void {
    const p = this.pts.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    switch (this.mode) {
      case 'pending': {
        this.tick(t);
        if (this.mode !== 'pending') return this.move(id, x, y, t);
        if (Math.hypot(x - this.start.x, y - this.start.y) > TOUCH.slop) {
          this.mode = 'pan';
          this.on.pan(x - this.start.x, y - this.start.y, this.start.x, this.start.y);
          this.last = { x, y };
        }
        return;
      }
      case 'pan':
        this.on.pan(x - this.last.x, y - this.last.y, this.last.x, this.last.y);
        this.last = { x, y };
        return;
      case 'hold':
        if (Math.hypot(x - this.start.x, y - this.start.y) > TOUCH.slop) {
          this.on.holdEnd();
          this.mode = 'box';
          this.on.boxStart(this.start.x, this.start.y);
          this.on.boxMove(x, y);
        } else this.on.holdMove(x, y);
        return;
      case 'box':
        this.on.boxMove(x, y);
        return;
      case 'pinch': {
        const m = this.measure();
        if (this.pinch.dist > 0 && m.dist > 0) this.on.zoom(m.dist / this.pinch.dist);
        this.on.pan(m.mx - this.pinch.mx, m.my - this.pinch.my, this.pinch.mx, this.pinch.my);
        this.pinch = m;
        return;
      }
    }
  }

  up(id: number, x: number, y: number, t: number): void {
    if (!this.pts.has(id)) return;
    this.pts.delete(id);
    if (this.mode === 'pinch') {
      // Lifting one finger of two ends the pinch; the other finger is ignored until lifted.
      this.mode = this.pts.size ? 'done' : 'idle';
      return;
    }
    if (this.pts.size) return;
    const mode = this.mode;
    this.mode = 'idle';
    if (mode === 'pending') {
      const double =
        t - this.lastTap.t < TOUCH.doubleMs &&
        Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < TOUCH.doubleSlop;
      if (double) {
        this.lastTap = { x: -1e9, y: -1e9, t: -1e9 };
        this.on.doubleTap(x, y);
      } else {
        this.lastTap = { x, y, t };
        this.on.tap(x, y);
      }
    } else if (mode === 'hold') this.on.holdEnd();
    else if (mode === 'box') this.on.boxEnd(this.start.x, this.start.y, x, y);
  }

  cancel(id: number): void {
    this.pts.delete(id);
    if (this.mode === 'hold') this.on.holdEnd();
    if (!this.pts.size) this.mode = 'idle';
  }

  /** Call every frame: a still finger becomes a hold after TOUCH.holdMs. */
  tick(t: number): void {
    if (this.mode === 'pending' && this.pts.size === 1 && t - this.start.t >= TOUCH.holdMs) {
      this.mode = 'hold';
      this.on.holdStart(this.start.x, this.start.y);
    }
  }

  private measure(): { dist: number; mx: number; my: number } {
    const [a, b] = [...this.pts.values()];
    if (!a || !b) return { dist: 0, mx: 0, my: 0 };
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}
