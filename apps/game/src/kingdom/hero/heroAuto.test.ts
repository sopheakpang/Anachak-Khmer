import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL, resourceOf } from '../sim/sim';
import { autoFoe, autoOrder, autoWorkSpot } from './heroAuto';
import type { HeroBody } from './heroSim';

/** PK decision k6 (D148): the 🤖 hero fights what comes, else works, else walks to the nearest work. */

const data = loadKingdom();
const H = data.anachak.hero;
const quiet = () => {
  const s = new KingdomSim(data, 'easy', true, data.campaign.map.seed, 'anachak');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const hall = (s: KingdomSim) => [...s.buildings.values()].find((b) => b.team === PLAYER && b.type === 'townCentre')!;
const villagerBody = (s: KingdomSim): HeroBody => {
  const u = [...s.units.values()].find((x) => x.team === PLAYER && x.type === 'villager')!;
  return { x: u.x, z: u.z, heading: 0, unit: u };
};

describe('the 🤖 auto hero', () => {
  it('config: fights within 14 m, looks for work within 45 m, a key of its own', () => {
    expect(H.auto.fightRange).toBe(14);
    expect(H.auto.searchRadius).toBe(45);
    expect(data.controls.hero.find((a) => a.id === 'auto')?.keys).toContain('KeyT');
  });

  it('a raider within range comes first, even with work at hand', () => {
    const s = quiet();
    const body = villagerBody(s);
    const r = s.spawnNear(hall(s), 'spearman', RIVAL);
    r.x = body.x + 5;
    r.z = body.z;
    const o = autoOrder(s, H, body);
    expect(o).toMatchObject({ kind: 'fight', id: r.id, animal: false });
  });

  it('a raider far away is left alone; a shy deer is never a foe', () => {
    const s = quiet();
    const body = villagerBody(s);
    const r = s.spawnNear(hall(s), 'spearman', RIVAL);
    r.x = body.x + H.auto.fightRange + 5;
    r.z = body.z;
    for (const a of s.animals.values()) {
      a.x = body.x + 3;
      a.z = body.z;
      if (s.dangerous(a)) s.animals.delete(a.id);
    }
    expect(autoFoe(s, body, H.auto.fightRange)).toBeNull();
  });

  it('with no foe he walks to the nearest work, then swings at it when there', () => {
    const s = quiet();
    for (const u of [...s.units.values()]) if (u.team === RIVAL) s.units.delete(u.id);
    for (const a of [...s.animals.values()]) if (s.dangerous(a)) s.animals.delete(a.id);
    const body = villagerBody(s);
    body.unit!.carry = null;
    const spot = autoWorkSpot(s, body, H.auto.searchRadius);
    expect(spot).not.toBeNull();
    const far = autoOrder(s, H, body);
    // Standing at the spot, he works it.
    const at: HeroBody = { ...body, x: spot!.x, z: spot!.z };
    const n = [...s.nodes.values()].find((x) => {
      const [nx, nz] = s.nodePos(x);
      return Math.hypot(nx - spot!.x, nz - spot!.z) < 0.01;
    });
    if (n) {
      const [nx, nz] = s.nodePos(n);
      at.x = nx - 1;
      at.z = nz;
    }
    const near = autoOrder(s, H, at);
    expect(['goto', 'work']).toContain(far.kind);
    expect(near.kind).toBe('work');
  });

  it('carrying a load he takes it to a store first', () => {
    const s = quiet();
    const body = villagerBody(s);
    const n = [...s.nodes.values()].find((x) => x.kind !== 'fish' && x.amount > 0)!;
    body.unit!.carry = { res: resourceOf(n.kind), n: 8 };
    const spot = autoWorkSpot(s, body, 500);
    expect(spot?.why).toBe('store');
  });
});
