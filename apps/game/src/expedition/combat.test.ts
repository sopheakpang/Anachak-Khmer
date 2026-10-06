import { describe, expect, it } from 'vitest';
import { loadConfigs } from '@temples/shared';
import { Combat } from './combat';
import { HeroState } from './hero';
import { CAMP, isWalkable, walkGrid } from './kulenMap';

const cfg = loadConfigs().expedition;
const grid = walkGrid();
const warrior = cfg.heroes.find((h) => h.id === 'warrior')!;
const sage = cfg.heroes.find((h) => h.id === 'sage')!;

describe('arrow keys, aim and dash', () => {
  it('arrow keys walk at the hero speed and slide along blocked ground', () => {
    const h = new HeroState(warrior, CAMP);
    for (let i = 0; i < 10; i++) h.steer(0, -1, 0.1, grid); // up = north
    expect(h.z).toBeCloseTo(CAMP[1] - warrior.speed, 0);
    expect(h.moving).toBe(true);
    // Walking into the river never ends in the water.
    const r = new HeroState(warrior, [-20, -50]);
    for (let i = 0; i < 80; i++) r.steer(1, 0, 0.1, grid);
    expect(isWalkable(grid, r.x, r.z)).toBe(true);
  });

  it('the mouse turns the hero toward the aim point', () => {
    const h = new HeroState(warrior, CAMP);
    for (let i = 0; i < 30; i++) h.faceToward(CAMP[0] + 10, CAMP[1], 0.05);
    expect(Math.sin(h.heading)).toBeCloseTo(1, 1); // facing east (+X)
  });

  it('Space dashes forward and stops at blocked ground; it has a cooldown', () => {
    const c = new Combat(cfg);
    const h = new HeroState(warrior, CAMP);
    expect(c.useDash(warrior, 0)).toBe(true);
    expect(h.dash(0, -1, warrior.dash.distance, grid)).toBeGreaterThan(0);
    expect(isWalkable(grid, h.x, h.z)).toBe(true);
    expect(c.useDash(warrior, 1000)).toBe(false);
    expect(c.useDash(warrior, warrior.dash.cooldownSec * 1000 + 1)).toBe(true);
  });
});

describe('targeting and attacks', () => {
  it('clicking a training post in reach strikes it; out of reach says "range"', () => {
    const c = new Combat(cfg);
    const post = c.targets[0]!;
    const far = new HeroState(warrior, [post.x + 10, post.z]);
    expect(c.targetAt(post.x + 0.5, post.z)).toBe(post);
    expect(c.attack(far, warrior, post, 0)).toEqual({ ok: false, reason: 'range' });
    const near = new HeroState(warrior, [post.x + 2, post.z]);
    const r = c.attack(near, warrior, post, 0);
    expect(r.ok).toBe(true);
    expect(post.hp).toBe(cfg.trainingPosts.health - warrior.attack.damage);
    // Attack cooldown.
    expect(c.attack(near, warrior, post, 100)).toEqual({ ok: false, reason: 'cooldown' });
    expect(c.attack(near, warrior, post, warrior.attack.cooldownSec * 1000 + 1).ok).toBe(true);
  });

  it('the sage strikes from far away (ranged)', () => {
    const c = new Combat(cfg);
    const post = c.targets[1]!;
    const h = new HeroState(sage, [post.x + 9, post.z]);
    expect(c.attack(h, sage, post, 0).ok).toBe(true);
  });

  it('a skill needs energy and range, hits everything in its area and starts its cooldown', () => {
    const c = new Combat(cfg);
    const [p0, p1] = c.targets;
    const h = new HeroState(warrior, [p0!.x + 4, p0!.z]);
    const vajra = cfg.skills.vajra!;
    const r = c.cast('vajra', h, [p0!.x, p0!.z], p0!, 0);
    expect(r.ok).toBe(true);
    expect(h.energy).toBe(warrior.energy - vajra.energy);
    expect(c.cooldownLeft('vajra', 1)).toBeGreaterThan(0.9);
    expect(c.cast('vajra', h, [p0!.x, p0!.z], p0!, 100)).toEqual({ ok: false, reason: 'cooldown' });
    if (r.ok)
      for (const hit of r.hits)
        expect(Math.hypot(hit.target.x - p0!.x, hit.target.z - p0!.z)).toBeLessThanOrEqual(
          vajra.radius + hit.target.radius,
        );
    void p1;
    // Out of energy.
    const tired = new HeroState(warrior, [p0!.x + 4, p0!.z]);
    tired.energy = 1;
    expect(c.cast('ramaArrows', tired, [p0!.x, p0!.z], p0!, 0)).toEqual({ ok: false, reason: 'energy' });
    // Out of range.
    const far = new HeroState(warrior, [p0!.x + 40, p0!.z]);
    expect(c.cast('ramaArrows', far, [p0!.x, p0!.z], p0!, 0)).toEqual({ ok: false, reason: 'range' });
  });

  it('heal skills restore health; Garuda Dash leaps the hero to the target', () => {
    const c = new Combat(cfg);
    const h = new HeroState(warrior, CAMP);
    h.health = 100;
    const r = c.cast('nagaShield', h, null, null, 0);
    expect(r.ok && r.healed).toBeGreaterThan(0);
    const post = c.targets[0]!;
    const d = new HeroState(warrior, [post.x + 6, post.z]);
    expect(c.cast('garudaDash', d, [post.x, post.z], post, 0).ok).toBe(true);
    expect(Math.hypot(d.x - post.x, d.z - post.z)).toBeLessThan(2);
  });

  it('a broken post stands up again after the respawn time', () => {
    const c = new Combat(cfg);
    const post = c.targets[0]!;
    const h = new HeroState(warrior, [post.x + 2, post.z]);
    let t = 0;
    while (c.alive(post) && t < 100_000) {
      c.attack(h, warrior, post, t);
      t += warrior.attack.cooldownSec * 1000 + 1;
    }
    expect(c.alive(post)).toBe(false);
    expect(c.targetAt(post.x, post.z)).toBeNull();
    c.update(post.downUntil + 1);
    expect(c.alive(post)).toBe(true);
    expect(post.hp).toBe(post.maxHp);
  });
});
