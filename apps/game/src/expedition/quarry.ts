import type { ExpeditionConfig } from '@temples/shared';
import type { XZ } from './kulenMap';

type QuarryConfig = ExpeditionConfig['quarry'];

/**
 * The Old Quarry (PK: "heroes gather massive stone blocks from a quarry"), pure rules:
 * stand within reach of a rock face and cut (click it, or F) for a few seconds; the block
 * then rides on the hero's head (walking a little slower) until the hero reaches the stone
 * pile at camp, where it is laid down and counted. Moving away stops the cutting.
 */
export type QuarryState =
  { kind: 'idle' } | { kind: 'cutting'; face: number; until: number; total: number } | { kind: 'carrying' };

export type CutResult = { ok: true; face: number } | { ok: false; reason: 'far' | 'busy' | 'carrying' };

export class Quarry {
  state: QuarryState = { kind: 'idle' };
  /** Blocks laid on the camp pile this expedition. */
  delivered = 0;

  constructor(readonly cfg: QuarryConfig) {}

  /** The rock face nearest (x, z) within `within` metres, or -1. */
  faceAt(x: number, z: number, within: number): number {
    let best = -1;
    let bd = within;
    this.cfg.faces.forEach(([fx, fz], i) => {
      const d = Math.hypot(x - fx, z - fz);
      if (d <= bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Start cutting the face nearest the hero (or the one asked for). */
  cut(hero: XZ, now: number, face = this.faceAt(hero[0], hero[1], this.cfg.reach)): CutResult {
    if (this.state.kind === 'carrying') return { ok: false, reason: 'carrying' };
    if (this.state.kind === 'cutting') return { ok: false, reason: 'busy' };
    const f = this.cfg.faces[face];
    if (!f || Math.hypot(hero[0] - f[0], hero[1] - f[1]) > this.cfg.reach)
      return { ok: false, reason: 'far' };
    this.state = {
      kind: 'cutting',
      face,
      until: now + this.cfg.cutSec * 1000,
      total: this.cfg.cutSec * 1000,
    };
    return { ok: true, face };
  }

  /** How far the current cut is (0..1), or null. */
  progress(now: number): number | null {
    const s = this.state;
    if (s.kind !== 'cutting') return null;
    return Math.min(1, 1 - (s.until - now) / s.total);
  }

  get carrying(): boolean {
    return this.state.kind === 'carrying';
  }

  /** Speed factor for the hero (a block on the head is heavy). */
  get speedFactor(): number {
    return this.carrying ? this.cfg.carrySpeed : 1;
  }

  /**
   * Each frame: finish a cut, stop it if the hero walked away, lay the block at the pile.
   * Returns what happened this frame (for effects and messages).
   */
  update(hero: XZ, moving: boolean, now: number): 'cut' | 'delivered' | 'stopped' | null {
    const s = this.state;
    if (s.kind === 'cutting') {
      if (moving) {
        this.state = { kind: 'idle' };
        return 'stopped';
      }
      if (now >= s.until) {
        this.state = { kind: 'carrying' };
        return 'cut';
      }
      return null;
    }
    if (s.kind === 'carrying') {
      const [px, pz] = this.cfg.pile;
      if (Math.hypot(hero[0] - px, hero[1] - pz) <= this.cfg.deliverRadius) {
        this.state = { kind: 'idle' };
        this.delivered++;
        return 'delivered';
      }
    }
    return null;
  }

  /** A fallen hero drops the block. */
  drop(): void {
    this.state = { kind: 'idle' };
  }
}
