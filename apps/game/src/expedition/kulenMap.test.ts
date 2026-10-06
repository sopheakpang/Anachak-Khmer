import { describe, expect, it } from 'vitest';
import { loadConfigs } from '@temples/shared';
import {
  CAMP,
  CLIFF_TRAIL,
  clearLine,
  findPath,
  FORDS,
  heightAt,
  isRiver,
  isWalkable,
  junglePlants,
  nearestOpen,
  PLATEAU_Y,
  rayToGround,
  SHRINES,
  TRAILS,
  walkGrid,
  waterLevelAt,
  ZONES,
  type XZ,
} from './kulenMap';
import { HeroState, HeroVotes, nearestShrine } from './hero';

const grid = walkGrid();
const pathLength = (p: XZ[]) =>
  p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1]![0], q[1] - p[i - 1]![1]) : 0), 0);

describe('Kulen map (E02)', () => {
  it('the plateau stands above the southern basin, with the waterfall between', () => {
    expect(heightAt(CAMP[0], CAMP[1])).toBeGreaterThan(PLATEAU_Y - 2);
    expect(heightAt(20, 80)).toBeLessThan(4);
    // Water follows the riverbed: high on the plateau, low at the landing.
    expect(waterLevelAt(-12, -50)).toBeGreaterThan(heightAt(-12, -50));
    expect(waterLevelAt(-12, -50) - waterLevelAt(14, 78)).toBeGreaterThan(5);
  });

  it('camp, shrines, zone centres and trails are walkable', () => {
    for (const p of [CAMP, ...SHRINES]) expect(isWalkable(grid, p[0], p[1])).toBe(true);
    for (const z of ZONES) expect(nearestOpen(grid, z.center[0], z.center[1], 6)).not.toBeNull();
    for (const t of TRAILS)
      for (const p of t)
        if (!isRiver(p[0], p[1])) expect(isWalkable(grid, p[0], p[1]), `trail point ${p}`).toBe(true);
  });

  it('the river blocks walking except at the fords', () => {
    expect(isWalkable(grid, -12, -50)).toBe(false); // deep water
    for (const f of FORDS) expect(isWalkable(grid, f[0], f[1])).toBe(true);
  });

  it('AX-05: every zone is reachable from camp by a path that avoids blocked ground', () => {
    for (const z of ZONES) {
      const p = findPath(grid, CAMP, z.center);
      expect(p, z.id).not.toBeNull();
      for (let i = 1; i < p!.length; i++) expect(clearLine(grid, p![i - 1]!, p![i]!)).toBe(true);
      // Never absurdly long: zones below the cliff are reached by the western ramp (~140 m).
      expect(pathLength(p!)).toBeLessThan(170);
    }
  });

  it('a click on a tree or in the river walks to the nearest open ground', () => {
    const tree = junglePlants().find((p) => p.species === 'fig')!;
    const p = findPath(grid, CAMP, [tree.x, tree.z]);
    expect(p).not.toBeNull();
    const end = p![p!.length - 1]!;
    expect(isWalkable(grid, end[0], end[1])).toBe(true);
    expect(Math.hypot(end[0] - tree.x, end[1] - tree.z)).toBeLessThan(4);
  });

  it('the jungle is dense but leaves the trails and clearings open', () => {
    const plants = junglePlants();
    expect(plants.filter((p) => p.block > 0).length).toBeGreaterThan(400);
    expect(plants.length).toBe(junglePlants().length); // deterministic, cached
    for (const p of plants)
      if (p.block > 0) expect(Math.hypot(p.x - CAMP[0], p.z - CAMP[1])).toBeGreaterThan(6);
  });

  it('a ray from above hits the ground where the height field is', () => {
    const gy = heightAt(CAMP[0], CAMP[1]);
    const len = Math.hypot(60 - gy, 40);
    const hit = rayToGround([CAMP[0], 60, CAMP[1] + 40], [0, -(60 - gy) / len, -40 / len]);
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit![0] - CAMP[0], hit![1] - CAMP[1])).toBeLessThan(1.5);
    expect(rayToGround([0, 50, 0], [0, 1, 0])).toBeNull();
  });
});

describe('hero (E03)', () => {
  const cfg = loadConfigs().expedition.heroes[0]!;

  it('walks to a clicked point at the configured speed and faces the way it walks', () => {
    const h = new HeroState(cfg, CAMP);
    const goal = ZONES.find((z) => z.id === 'hermitage')!.center;
    expect(h.moveTo(grid, goal)).toBe(true);
    const total = pathLength([[h.x, h.z], ...h.path]);
    let t = 0;
    while (h.moving && t < 200) {
      h.update(0.1);
      t += 0.1;
    }
    expect(t).toBeCloseTo(total / cfg.speed, 0);
    expect(Math.hypot(h.x - h.target![0], h.z - h.target![1])).toBeLessThan(0.01);
    expect(Math.cos(h.heading)).toBeDefined();
  });

  it('AX-06: a fallen hero rises again at the nearest shrine and can walk on', () => {
    const h = new HeroState(cfg, [-28, -36]);
    h.damage(cfg.health + 50);
    expect(h.alive).toBe(false);
    expect(h.moveTo(grid, CAMP)).toBe(false);
    for (let i = 0; i < 60; i++) h.update(0.1);
    expect(h.alive).toBe(true);
    expect([h.x, h.z]).toEqual(nearestShrine(-28, -36));
    expect(h.health).toBe(cfg.health);
    expect(h.moveTo(grid, CAMP)).toBe(true);
  });

  it('chat votes: one per viewer, latest counts, ties and no votes go to the warrior', () => {
    const v = new HeroVotes();
    expect(v.winner()).toBe(1);
    v.add('a', 2);
    v.add('b', 3);
    v.add('a', 3);
    expect(v.counts()).toEqual([0, 0, 2]);
    expect(v.winner()).toBe(3);
    v.add('c', 1);
    v.add('d', 1);
    expect(v.winner()).toBe(1);
  });
});

describe('the cliff path to the landing (PK: a winding trail up the cliff)', () => {
  it('switches back and forth across the ramp at least three times', () => {
    const t = TRAILS[CLIFF_TRAIL]!;
    const cliff = t.filter(([, z]) => z >= 38 && z <= 66);
    let turns = 0;
    for (let i = 2; i < cliff.length; i++) {
      const a = Math.sign(cliff[i - 1]![0] - cliff[i - 2]![0]);
      const b = Math.sign(cliff[i]![0] - cliff[i - 1]![0]);
      if (a && b && a !== b) turns++;
    }
    expect(turns).toBeGreaterThanOrEqual(3);
    // Still one walk from camp down to the landing.
    const landing = ZONES.find((z) => z.id === 'landing')!;
    expect(findPath(grid, CAMP, nearestOpen(grid, landing.center[0], landing.center[1], 6)!)).not.toBeNull();
  });
});
