import type { HeroConfig } from '@temples/shared';
import { findPath, isWalkable, SHRINES, type WalkGrid, type XZ } from './kulenMap';

/**
 * The hero's rules (prompt E03), pure: walking a path at the configured speed, turning
 * toward where they walk, health and energy, falling and rising again at the nearest
 * shrine. The 3D model only reads this state.
 */
export class HeroState {
  x: number;
  z: number;
  heading = Math.PI; // facing north (−Z)
  health: number;
  energy: number;
  path: XZ[] = [];
  /** Seconds left before a fallen hero rises again (0 = alive). */
  downFor = 0;
  /** Last move order target (for the click marker). */
  target: XZ | null = null;
  readonly regenPerSec = { health: 4, energy: 6 };
  /** Walking speed factor (1 = normal; a block carried on the head slows the hero). */
  speedFactor = 1;
  readonly respawnSec = 5;

  constructor(
    readonly cfg: HeroConfig,
    start: XZ,
  ) {
    this.x = start[0];
    this.z = start[1];
    this.health = cfg.health;
    this.energy = cfg.energy;
  }

  get alive(): boolean {
    return this.downFor <= 0;
  }

  /** True while the arrow keys are driving the hero this frame. */
  steering = false;

  get moving(): boolean {
    return this.alive && (this.path.length > 0 || this.steering);
  }

  /**
   * Arrow keys: walk in direction (dx, dz) for dt seconds, sliding along trees, water
   * and cliffs instead of stopping dead. Cancels any click-walk path.
   */
  steer(dx: number, dz: number, dt: number, grid: WalkGrid, faceMovement = true): void {
    this.steering = false;
    if (!this.alive) return;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    this.path = [];
    const ux = dx / len;
    const uz = dz / len;
    const step = this.cfg.speed * this.speedFactor * dt;
    const nx = this.x + ux * step;
    const nz = this.z + uz * step;
    let moved = false;
    if (isWalkable(grid, nx, this.z)) {
      this.x = nx;
      moved = true;
    }
    if (isWalkable(grid, this.x, nz)) {
      this.z = nz;
      moved = true;
    }
    this.steering = moved;
    if (faceMovement) this.turnToward(Math.atan2(ux, uz), dt);
  }

  /** Mouse aim: turn smoothly toward a point. */
  faceToward(x: number, z: number, dt: number): void {
    if (!this.alive) return;
    if (Math.hypot(x - this.x, z - this.z) < 0.3) return;
    this.turnToward(Math.atan2(x - this.x, z - this.z), dt);
  }

  private turnToward(want: number, dt: number): void {
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * Math.min(1, dt * 12);
  }

  /** Space: a quick dash along (dx, dz), stopping at blocked ground. */
  dash(dx: number, dz: number, distance: number, grid: WalkGrid): number {
    if (!this.alive) return 0;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    let d = 0;
    while (d + 0.25 <= distance && isWalkable(grid, this.x + ux * (d + 0.25), this.z + uz * (d + 0.25)))
      d += 0.25;
    this.x += ux * d;
    this.z += uz * d;
    this.path = [];
    return d;
  }

  /** Right-click order: walk to (x, z). Returns false when there is no way there. */
  moveTo(grid: WalkGrid, to: XZ): boolean {
    if (!this.alive) return false;
    const p = findPath(grid, [this.x, this.z], to);
    if (!p) return false;
    this.path = p.slice(1);
    this.target = p[p.length - 1] ?? null;
    return true;
  }

  stop(): void {
    this.path = [];
  }

  damage(amount: number): void {
    if (!this.alive || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) {
      this.downFor = this.respawnSec;
      this.path = [];
    }
  }

  /** Advance by dt seconds. */
  update(dt: number): void {
    if (!this.alive) {
      this.downFor -= dt;
      if (this.downFor <= 0) this.respawn();
      return;
    }
    this.health = Math.min(this.cfg.health, this.health + this.regenPerSec.health * dt);
    this.energy = Math.min(this.cfg.energy, this.energy + this.regenPerSec.energy * dt);
    let step = this.cfg.speed * this.speedFactor * dt;
    while (step > 0 && this.path.length > 0) {
      const [tx, tz] = this.path[0]!;
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        // Turn smoothly toward the walking direction.
        const want = Math.atan2(dx, dz);
        let diff = want - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += diff * Math.min(1, dt * 10);
      }
      if (d <= step) {
        this.x = tx;
        this.z = tz;
        step -= d;
        this.path.shift();
      } else {
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        step = 0;
      }
    }
  }

  /** Rise again at the shrine nearest to where the hero fell, with full health. */
  respawn(): void {
    const [sx, sz] = nearestShrine(this.x, this.z);
    this.x = sx;
    this.z = sz;
    this.health = this.cfg.health;
    this.energy = this.cfg.energy;
    this.downFor = 0;
    this.path = [];
  }
}

export function nearestShrine(x: number, z: number): XZ {
  let best = SHRINES[0]!;
  let d = Infinity;
  for (const s of SHRINES) {
    const k = Math.hypot(s[0] - x, s[1] - z);
    if (k < d) {
      d = k;
      best = s;
    }
  }
  return best;
}

/**
 * Hero choice by chat vote: one vote per viewer (their latest counts). Ties go to the
 * lower number; no votes → the warrior.
 */
export class HeroVotes {
  private readonly votes = new Map<string, 1 | 2 | 3>();

  add(userId: string, choice: 1 | 2 | 3): void {
    this.votes.set(userId, choice);
  }

  counts(): [number, number, number] {
    const c: [number, number, number] = [0, 0, 0];
    for (const v of this.votes.values()) c[v - 1] = (c[v - 1] ?? 0) + 1;
    return c;
  }

  winner(): 1 | 2 | 3 {
    const c = this.counts();
    let best = 0;
    for (let i = 1; i < 3; i++) if (c[i]! > c[best]!) best = i;
    return (best + 1) as 1 | 2 | 3;
  }

  clear(): void {
    this.votes.clear();
  }
}
