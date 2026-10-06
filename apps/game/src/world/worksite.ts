import { ACT, type Act } from '../engine/figures';

/**
 * The work crew at the temple site (PK: "AI actions for workers, make them busy with
 * building construction"). Pure rules, no 3D, so they are unit-tested; the site scene
 * draws them. Each worker has a job and a small state machine:
 *
 * - hauler: walk to the stockpile (or the gate when the pile is empty), lift a block,
 *   carry it on the head to the tower that is furthest behind, set it down, go back.
 * - carver: hammer and chisel a block in the carving yard, then move to the next block.
 * - lever: two per tower still being built, levering blocks into place with bamboo poles.
 * - puller: a rope team hauling a block up the side of the tallest tower still growing;
 *   they lean back and step back as it rises, then walk in for the next one.
 *
 * With every tower finished the crew keeps the site alive: haulers carry to the stairs,
 * levers rest at the towers, pullers become haulers.
 */

export type Role = 'hauler' | 'carver' | 'lever' | 'puller';
export type XZ = [number, number];

export interface Tower {
  x: number;
  z: number;
  /** Current top of the masonry (m above ground). */
  height: number;
  /** Height when finished (finial). */
  top: number;
}

export interface Worker {
  id: number;
  role: Role;
  x: number;
  z: number;
  heading: number;
  act: Act;
  lean: number;
  carrying: boolean;
  state: 'toSource' | 'pickup' | 'toTower' | 'drop' | 'carve' | 'shift' | 'lever' | 'pull' | 'rest';
  until: number;
  target: XZ;
  spot: number;
}

export interface Lift {
  /** Tower being served by the rope team. */
  tower: number;
  /** Pulley at the top edge of the masonry. */
  pulley: [number, number, number];
  /** The block on the rope. */
  block: [number, number, number];
  /** Where the team holds the rope (first puller's hands). */
  hands: [number, number, number];
  /** +1 when the team stands on the +z side of the tower, −1 on the −z side. */
  dir: 1 | -1;
}

export const SITE = {
  pile: [-17, 23] as XZ,
  gate: [0, 32] as XZ,
  stairs: [0, 12.5] as XZ,
  /** The raised platform (y = 1) around the towers. */
  platform: { x: 15, z: 11, y: 1 },
  /** Workers keep this far from a tower centre (scaffolding). */
  towerRadius: 3.0,
  carvingYard: Array.from({ length: 8 }, (_, i) => [-10.5 + i * 3, 20] as XZ),
  walk: 1.4,
  carry: 1.05,
  pickupSec: 1.3,
  dropSec: 1.5,
  liftSec: 8,
};

export const CREW: Record<Role, number> = { hauler: 12, carver: 8, lever: 6, puller: 5 };

const rand = (i: number, k: number) => {
  const h = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

export function groundY(x: number, z: number): number {
  const p = SITE.platform;
  return Math.abs(x) < p.x && Math.abs(z) < p.z ? p.y : 0;
}

export class WorkSite {
  readonly workers: Worker[] = [];
  lift: Lift | null = null;
  private last = -1;
  private liftStart = 0;

  constructor(total: number) {
    const roles: Role[] = [];
    for (const r of ['hauler', 'carver', 'lever', 'puller'] as Role[])
      for (let i = 0; i < CREW[r]; i++) roles.push(r);
    // A smaller crew on weak presets: keep the mix, drop from the end of each group.
    const keep = Math.min(total, roles.length);
    const scale = keep / roles.length;
    const counts = Object.fromEntries(
      (Object.keys(CREW) as Role[]).map((r) => [r, Math.max(1, Math.round(CREW[r] * scale))]),
    ) as Record<Role, number>;
    let id = 0;
    for (const r of ['hauler', 'carver', 'lever', 'puller'] as Role[])
      for (let i = 0; i < counts[r] && id < keep; i++) {
        const w: Worker = {
          id,
          role: r,
          x: -12 + rand(id, 1) * 24,
          z: 13 + rand(id, 2) * 8,
          heading: 0,
          act: ACT.stand,
          lean: 0,
          carrying: false,
          state: r === 'carver' ? 'carve' : 'toSource',
          until: r === 'carver' ? 6 + rand(id, 3) * 8 : rand(id, 3) * 6,
          target: [0, 0],
          spot: i,
        };
        if (r === 'carver') {
          const spot = SITE.carvingYard[i % SITE.carvingYard.length]!;
          w.x = spot[0];
          w.z = spot[1] + 0.9;
        }
        this.workers.push(w);
        id++;
      }
  }

  count(role: Role): number {
    return this.workers.filter((w) => w.role === role).length;
  }

  /** Advance the crew to time t (seconds). */
  update(t: number, towers: Tower[], stock: number): void {
    if (this.last < 0) {
      // First frame: let the crew work for a minute off screen, so the site opens busy
      // (people spread along their routes) instead of everyone starting in one spot.
      this.last = t - 60;
      for (let k = t - 60; k < t; k += 0.1) this.step(k, towers, stock);
    }
    this.step(t, towers, stock);
  }

  private step(t: number, towers: Tower[], stock: number): void {
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    const open = towers
      .map((tw, i) => ({ tw, i }))
      .filter(({ tw }) => tw.height < tw.top - 0.01)
      .sort((a, b) => a.tw.height / a.tw.top - b.tw.height / b.tw.top);
    this.updateLift(t, towers, open);
    let lever = 0;
    let puller = 0;
    for (const w of this.workers) {
      switch (w.role) {
        case 'carver':
          this.carver(w, t, dt);
          break;
        case 'lever':
          this.lever(w, t, dt, towers, open, lever++);
          break;
        case 'puller':
          if (this.lift) this.puller(w, t, dt, puller++);
          else this.hauler(w, t, dt, towers, open, stock);
          break;
        default:
          this.hauler(w, t, dt, towers, open, stock);
      }
    }
  }

  // ------------------------------------------------------------ jobs

  private hauler(
    w: Worker,
    t: number,
    dt: number,
    towers: Tower[],
    open: Array<{ tw: Tower; i: number }>,
    stock: number,
  ): void {
    if (!['toSource', 'pickup', 'toTower', 'drop'].includes(w.state)) {
      w.state = 'toSource';
      w.carrying = false;
    }
    switch (w.state) {
      case 'toSource': {
        const src = stock > 0 ? SITE.pile : SITE.gate;
        w.target = [src[0] + (rand(w.id, 4) - 0.5) * 5, src[1] + (rand(w.id, 5) - 0.5) * 3];
        w.lean = 0;
        if (t < w.until) {
          w.act = ACT.stand;
          return;
        }
        w.act = ACT.crowd;
        if (this.walk(w, dt, SITE.walk, towers)) {
          w.state = 'pickup';
          w.until = t + SITE.pickupSec;
          w.act = ACT.lift;
          w.lean = 0.35;
        }
        return;
      }
      case 'pickup':
        w.act = ACT.lift;
        w.lean = 0.35;
        if (t >= w.until) {
          w.carrying = true;
          w.lean = 0;
          w.state = 'toTower';
          w.act = ACT.carry;
          w.target = this.dropPoint(w, towers, open);
        }
        return;
      case 'toTower':
        w.act = ACT.carry;
        if (this.walk(w, dt, SITE.carry, towers)) {
          w.state = 'drop';
          w.until = t + SITE.dropSec;
          w.act = ACT.lift;
          w.lean = 0.3;
        }
        return;
      case 'drop':
        w.act = ACT.lift;
        if (t >= w.until) {
          w.carrying = false;
          w.lean = 0;
          w.state = 'toSource';
          w.until = t + rand(w.id, Math.floor(t)) * 1.5;
        }
        return;
    }
  }

  /** Beside the tower that is furthest behind, on the side facing the stockpile. */
  private dropPoint(w: Worker, towers: Tower[], open: Array<{ tw: Tower; i: number }>): XZ {
    if (!open.length) return [SITE.stairs[0] + (rand(w.id, 6) - 0.5) * 6, SITE.stairs[1]];
    // Spread haulers over the two or three towers most behind.
    const pick = open[w.id % Math.min(3, open.length)]!.tw;
    const a = Math.atan2(SITE.pile[1] - pick.z, SITE.pile[0] - pick.x) + (rand(w.id, 7) - 0.5) * 1.6;
    const r = SITE.towerRadius + 0.5;
    return [pick.x + Math.cos(a) * r, pick.z + Math.sin(a) * r];
  }

  private carver(w: Worker, t: number, dt: number): void {
    if (w.state === 'carve') {
      w.act = ACT.hammer;
      w.lean = 0.28;
      w.heading = Math.PI; // facing the block (north)
      if (t >= w.until) {
        // Move along to a neighbouring block.
        const n = SITE.carvingYard.length;
        w.spot = (w.spot + (rand(w.id, t) < 0.5 ? n - 1 : 1)) % n;
        const next = SITE.carvingYard[w.spot]!;
        w.target = [next[0] + (rand(w.id, 8) - 0.5) * 0.8, next[1] + 0.9];
        w.state = 'shift';
      }
      return;
    }
    w.lean = 0;
    w.act = ACT.crowd;
    if (this.walk(w, dt, SITE.walk, [])) {
      w.state = 'carve';
      w.until = t + 8 + rand(w.id, t) * 6;
    }
  }

  private lever(
    w: Worker,
    t: number,
    dt: number,
    towers: Tower[],
    open: Array<{ tw: Tower; i: number }>,
    n: number,
  ): void {
    const list = open.length ? open : towers.map((tw, i) => ({ tw, i }));
    const { tw, i } = list[Math.floor(n / 2) % list.length]!;
    const a = i * 1.3 + (n % 2 ? 0.7 : -0.7) + Math.PI / 2;
    const r = SITE.towerRadius + 0.2;
    w.target = [tw.x + Math.cos(a) * r, tw.z + Math.sin(a) * r];
    const busy = open.length > 0;
    if (w.state !== 'lever' && w.state !== 'rest') w.state = 'rest';
    if (Math.hypot(w.x - w.target[0], w.z - w.target[1]) > 0.3) {
      w.act = ACT.crowd;
      w.lean = 0;
      this.walk(w, dt, SITE.walk, []);
      return;
    }
    w.heading = Math.atan2(tw.x - w.x, tw.z - w.z);
    w.state = busy ? 'lever' : 'rest';
    w.act = busy ? ACT.lever : ACT.stand;
    w.lean = busy ? 0.2 : 0;
    void t;
  }

  private puller(w: Worker, t: number, dt: number, k: number): void {
    const lift = this.lift!;
    const [px, , pz] = lift.pulley;
    const dir = lift.dir;
    // Line up outward from the tower, stepping back as the block rises.
    const phase = ((t - this.liftStart) % SITE.liftSec) / SITE.liftSec;
    const back = phase < 0.8 ? phase / 0.8 : 1 - (phase - 0.8) / 0.2;
    const d = 2.2 + k * 0.95 + back * 1.6;
    w.target = [px + (k % 2 ? 0.3 : -0.3), pz + d * dir];
    w.state = 'pull';
    if (Math.hypot(w.x - w.target[0], w.z - w.target[1]) > 0.6) {
      w.act = ACT.crowd;
      w.lean = 0;
      this.walk(w, dt, SITE.walk * 1.3, []);
      return;
    }
    // Close enough: stay with the rope, step with it.
    w.x = w.target[0];
    w.z = w.target[1];
    w.heading = dir > 0 ? Math.PI : 0; // facing the tower
    const pulling = phase < 0.8;
    w.act = pulling ? ACT.pull : ACT.crowd;
    w.lean = pulling ? -0.3 : 0;
  }

  private updateLift(t: number, towers: Tower[], open: Array<{ tw: Tower; i: number }>): void {
    if (!open.length) {
      this.lift = null;
      return;
    }
    // The tallest tower still growing gets the rope team (the most visible work).
    const best = [...open].sort((a, b) => b.tw.height - a.tw.height)[0]!;
    if (!this.lift || this.lift.tower !== best.i) this.liftStart = t;
    const tw = towers[best.i]!;
    const dir: 1 | -1 = tw.z >= 0 ? 1 : -1; // outward, away from the other row
    const topY = Math.max(2.4, tw.height + 0.6);
    const pulley: [number, number, number] = [tw.x, topY, tw.z + 2.7 * dir];
    const phase = ((t - this.liftStart) % SITE.liftSec) / SITE.liftSec;
    const rise = phase < 0.8 ? phase / 0.8 : 1;
    const base = groundY(tw.x, tw.z + 2.9 * dir);
    const y = base + 0.2 + (topY - base - 0.8) * rise;
    const handZ = tw.z + (2.7 + 2.2 + 1.6 * rise) * dir;
    this.lift = {
      tower: best.i,
      dir,
      pulley,
      block: [tw.x, Math.min(y, topY - 0.6), tw.z + 2.9 * dir],
      hands: [tw.x, groundY(tw.x, handZ) + 1.3, handZ],
    };
  }

  // ------------------------------------------------------------ movement

  /** Step toward the target, sliding around towers. True when arrived. */
  private walk(w: Worker, dt: number, speed: number, towers: Tower[]): boolean {
    const dx = w.target[0] - w.x;
    const dz = w.target[1] - w.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    const step = Math.min(d, speed * dt);
    let nx = w.x + (dx / d) * step;
    let nz = w.z + (dz / d) * step;
    for (const tw of towers) {
      const ox = nx - tw.x;
      const oz = nz - tw.z;
      const r = Math.hypot(ox, oz);
      if (r < SITE.towerRadius && r > 1e-6) {
        // Push out to the scaffolding edge and slide around it toward the target side.
        const tx = -oz / r;
        const tz = ox / r;
        const side = tx * dx + tz * dz >= 0 ? 1 : -1;
        nx = tw.x + (ox / r) * SITE.towerRadius + tx * side * step * 0.9;
        nz = tw.z + (oz / r) * SITE.towerRadius + tz * side * step * 0.9;
      }
    }
    if (step > 1e-6) w.heading = Math.atan2(nx - w.x, nz - w.z);
    w.x = nx;
    w.z = nz;
    return false;
  }
}
