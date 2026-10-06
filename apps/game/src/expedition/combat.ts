import type { ExpeditionConfig, HeroConfig } from '@temples/shared';
import type { HeroState } from './hero';
import type { XZ } from './kulenMap';

/**
 * Combat rules, pure (no 3D): targets, basic attacks and the four skills, with range,
 * energy and cooldowns from config/expedition.json. Training posts at camp are the first
 * targets; the animals and Yeak of prompt E06 use the same Target shape.
 */

export interface Target {
  id: string;
  kind: 'post' | 'enemy';
  km: string;
  en: string;
  x: number;
  z: number;
  radius: number;
  hp: number;
  maxHp: number;
  /** Time (ms) when a broken target comes back; 0 = standing. */
  downUntil: number;
}

export interface Hit {
  target: Target;
  damage: number;
  broke: boolean;
}

export type Failure = 'cooldown' | 'energy' | 'range' | 'noTarget' | 'dead';

export type ActionResult =
  | {
      ok: true;
      action: 'attack' | 'skill';
      skill?: string;
      center: XZ;
      from: XZ;
      hits: Hit[];
      healed: number;
    }
  | { ok: false; reason: Failure };

const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Combat {
  readonly targets: Target[] = [];
  /** Cooldown end times (ms) per key: 'attack', 'dash' or a skill id. */
  private readonly until = new Map<string, number>();
  private readonly started = new Map<string, number>();

  constructor(readonly cfg: ExpeditionConfig) {
    cfg.trainingPosts.at.forEach(([x, z], i) =>
      this.targets.push({
        id: `post${i}`,
        kind: 'post',
        km: 'បង្គោលហ្វឹកហាត់',
        en: 'Training post',
        x,
        z,
        radius: 0.6,
        hp: cfg.trainingPosts.health,
        maxHp: cfg.trainingPosts.health,
        downUntil: 0,
      }),
    );
  }

  alive(t: Target): boolean {
    return t.downUntil === 0;
  }

  /** The standing target under the cursor (nearest within its radius + pick slack). */
  targetAt(x: number, z: number, slack = 1.2): Target | null {
    let best: Target | null = null;
    let d = Infinity;
    for (const t of this.targets) {
      if (!this.alive(t)) continue;
      const k = dist(x, z, t.x, t.z);
      if (k <= t.radius + slack && k < d) {
        d = k;
        best = t;
      }
    }
    return best;
  }

  /** Edge-to-edge distance from the hero to a target is within reach. */
  inRange(hero: HeroState, t: Target, range: number): boolean {
    return dist(hero.x, hero.z, t.x, t.z) - t.radius <= range;
  }

  /** 0..1 of a cooldown still to run (for the skill bar veil). */
  cooldownLeft(key: string, now: number): number {
    const end = this.until.get(key) ?? 0;
    const start = this.started.get(key) ?? 0;
    if (now >= end || end <= start) return 0;
    return (end - now) / (end - start);
  }

  ready(key: string, now: number): boolean {
    return now >= (this.until.get(key) ?? 0);
  }

  private startCooldown(key: string, sec: number, now: number): void {
    this.started.set(key, now);
    this.until.set(key, now + sec * 1000);
  }

  /** Click on an enemy: basic attack if it is in reach. */
  attack(hero: HeroState, heroCfg: HeroConfig, target: Target | null, now: number): ActionResult {
    if (!hero.alive) return { ok: false, reason: 'dead' };
    if (!target || !this.alive(target)) return { ok: false, reason: 'noTarget' };
    if (!this.inRange(hero, target, heroCfg.attack.range)) return { ok: false, reason: 'range' };
    if (!this.ready('attack', now)) return { ok: false, reason: 'cooldown' };
    this.startCooldown('attack', heroCfg.attack.cooldownSec, now);
    hero.heading = Math.atan2(target.x - hero.x, target.z - hero.z);
    const hit = this.damage(target, heroCfg.attack.damage, now);
    return {
      ok: true,
      action: 'attack',
      center: [target.x, target.z],
      from: [hero.x, hero.z],
      hits: [hit],
      healed: 0,
    };
  }

  /** Q W E R: cast a skill at the cursor (or around the hero for range-0 skills). */
  cast(
    skillId: string,
    hero: HeroState,
    aim: XZ | null,
    target: Target | null,
    now: number,
    canStand: (x: number, z: number) => boolean = () => true,
  ): ActionResult {
    const s = this.cfg.skills[skillId];
    if (!s) return { ok: false, reason: 'noTarget' };
    if (!hero.alive) return { ok: false, reason: 'dead' };
    if (!this.ready(skillId, now)) return { ok: false, reason: 'cooldown' };
    if (hero.energy < s.energy) return { ok: false, reason: 'energy' };
    let center: XZ = [hero.x, hero.z];
    const from: XZ = [hero.x, hero.z];
    if (s.effect === 'blast' || s.effect === 'dashStrike') {
      const point: XZ | null = target ? [target.x, target.z] : aim;
      if (!point) return { ok: false, reason: 'noTarget' };
      const d = dist(hero.x, hero.z, point[0], point[1]) - (target ? target.radius : 0);
      if (d > s.range) return { ok: false, reason: 'range' };
      center = point;
      hero.heading = Math.atan2(point[0] - hero.x, point[1] - hero.z);
      if (s.effect === 'dashStrike') {
        // Leap to just before the point (stops early if the ground is blocked).
        const len = Math.hypot(point[0] - hero.x, point[1] - hero.z);
        const stop = Math.max(0, len - 1.4);
        const ux = (point[0] - hero.x) / (len || 1);
        const uz = (point[1] - hero.z) / (len || 1);
        let moved = 0;
        while (moved + 0.25 <= stop && canStand(hero.x + ux * (moved + 0.25), hero.z + uz * (moved + 0.25)))
          moved += 0.25;
        hero.x += ux * moved;
        hero.z += uz * moved;
        hero.path = [];
      }
    }
    hero.energy -= s.energy;
    this.startCooldown(skillId, s.cooldownSec, now);
    const hits: Hit[] = [];
    let healed = 0;
    if (s.effect === 'heal') {
      const before = hero.health;
      hero.health = Math.min(hero.cfg.health, hero.health + hero.cfg.health * 0.3);
      healed = hero.health - before;
    } else if (s.damage > 0) {
      for (const t of this.targets) {
        if (!this.alive(t)) continue;
        if (dist(center[0], center[1], t.x, t.z) - t.radius <= s.radius)
          hits.push(this.damage(t, s.damage, now));
      }
    }
    return { ok: true, action: 'skill', skill: skillId, center, from, hits, healed };
  }

  private damage(t: Target, amount: number, now: number): Hit {
    t.hp = Math.max(0, t.hp - amount);
    const broke = t.hp === 0;
    if (broke) t.downUntil = now + this.cfg.trainingPosts.respawnSec * 1000;
    return { target: t, damage: amount, broke };
  }

  /** Space: dash cooldown check (the hero moves itself). */
  useDash(heroCfg: HeroConfig, now: number): boolean {
    if (!this.ready('dash', now)) return false;
    this.startCooldown('dash', heroCfg.dash.cooldownSec, now);
    return true;
  }

  /** Broken training posts stand up again. */
  update(now: number): void {
    for (const t of this.targets) {
      if (t.downUntil && now >= t.downUntil) {
        t.downUntil = 0;
        t.hp = t.maxHp;
      }
    }
  }
}
