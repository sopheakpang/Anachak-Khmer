import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER, RIVAL, type Animal, type Building, type Unit } from './sim';
import { restore, serialize } from './save';

/**
 * PK's upgrade (D77): timber goes to the store by ox-cart from a lumber camp, and villagers
 * run from raiders and dangerous animals while the alarm calls the soldiers.
 */

const data = loadKingdom();
const quiet = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false;
  return s;
};
const mine = (s: KingdomSim, type: string) =>
  [...s.units.values()].filter((u) => u.team === PLAYER && u.type === type);
const hall = (s: KingdomSim) => [...s.buildings.values()].find((b) => b.type === 'townCentre')!;

/** A finished building of this type on free ground near the hall. */
function finished(s: KingdomSim, type: string, progress = 1): Building {
  const h = hall(s);
  for (let r = 6; r < 40; r++)
    for (let k = 0; k < 16; k++) {
      const tx = Math.round(h.tx + Math.cos((k / 16) * Math.PI * 2) * r);
      const tz = Math.round(h.tz + Math.sin((k / 16) * Math.PI * 2) * r);
      if (!s.canPlace(type, tx, tz)) return s.addBuilding(type, PLAYER, tx, tz, progress);
    }
  throw new Error(`no room for ${type}`);
}

function animal(s: KingdomSim, kind: string, x: number, z: number): Animal {
  const k = data.world.animals.kinds.find((a) => a.id === kind)!;
  const a: Animal = {
    id: 990000 + s.animals.size,
    kind,
    x,
    z,
    hp: k.hp,
    heading: 0,
    home: [x, z],
    target: null,
    fleeUntil: 0,
    fleeFrom: null,
    ready: 0,
    moving: false,
  };
  s.animals.set(a.id, a);
  return a;
}

describe('lumber camp and ox-carts (PK: wood goes to the store by cart)', () => {
  it('is in the config: a wood drop-off that keeps its timber, and comes with an ox-cart', () => {
    const d = data.buildings.lumberCamp!;
    expect(d.dropOff).toEqual(['wood']);
    expect(d.stockpile).toBe(true);
    expect(d.freeUnit).toBe('oxCart');
    expect(data.eras[0]!.buildings).toContain('lumberCamp');
  });

  it('comes with its own ox-cart when it is finished', () => {
    const s = quiet();
    const before = mine(s, 'oxCart').length;
    const v = mine(s, 'villager')[0]!;
    const h = hall(s);
    let placed = false;
    for (let r = 6; r < 40 && !placed; r++) placed = s.place('lumberCamp', h.tx + r, h.tz, [v.id]).ok;
    expect(placed).toBe(true);
    s.update(120);
    expect(mine(s, 'oxCart').length).toBe(before + 1);
  });

  it('keeps the wood woodcutters bring until a cart takes it to the store', () => {
    const s = quiet();
    const camp = finished(s, 'lumberCamp');
    const cart = s.spawnNear(camp, 'oxCart');
    const wood0 = s.res[PLAYER].wood;
    camp.stock = 100;
    s.update(1.1); // the cart is sent at the next once-a-second check
    expect(cart.task.kind).toBe('haul');
    let t = 0;
    while (s.res[PLAYER].wood === wood0 && t < 180) {
      s.update(1);
      t++;
    }
    expect(s.res[PLAYER].wood).toBe(wood0 + data.rules.haul.capacity);
    expect(camp.stock).toBe(100 - data.rules.haul.capacity);
  });

  it('a villager dropping wood at the camp adds to its stock, not to the kingdom', () => {
    const s = quiet();
    const camp = finished(s, 'lumberCamp');
    for (const b of s.buildings.values()) if (b.type === 'townCentre') b.progress = 1;
    const v = mine(s, 'villager')[0]!;
    const [cx, cz] = s.center(camp);
    v.x = cx + 2;
    v.z = cz + 2;
    v.carry = { res: 'wood', n: 10 };
    v.task = { kind: 'gather', node: null, field: null, res: 'wood', phase: 'return', near: [cx, cz] };
    const wood0 = s.res[PLAYER].wood;
    for (let i = 0; i < 40 && !camp.stock; i++) s.update(0.25);
    expect(camp.stock).toBe(10);
    expect(s.res[PLAYER].wood).toBe(wood0);
  });

  it('keeps the stock in saves', () => {
    const s = quiet();
    const camp = finished(s, 'lumberCamp');
    camp.stock = 37;
    const back = restore(data, JSON.parse(JSON.stringify(serialize(s))));
    expect(back.buildings.get(camp.id)!.stock).toBe(37);
  });
});

describe('the alarm (PK: villagers run from danger, the soldiers are called)', () => {
  const R = data.rules.alarm.radiusTiles;

  it('villagers drop their work and run from a tiger, then go back to work', () => {
    const s = quiet();
    const v = mine(s, 'villager')[0]!;
    const site = finished(s, 'house', 0.1);
    const job = { kind: 'build', building: site.id } as const;
    v.task = { ...job };
    const tiger = animal(s, 'tiger', v.x + R * s.map.tile * 0.5, v.z);
    s.update(0.6);
    expect(v.task.kind).toBe('move');
    expect(v.fleeUntil).toBeDefined();
    expect(s.events.some((e) => e.kind === 'alarm' && e.danger === 'animal')).toBe(true);
    s.animals.delete(tiger.id);
    s.update(data.rules.alarm.safeSec + 1);
    expect(v.fleeUntil).toBeUndefined();
    expect(v.task).toEqual(job);
  });

  it('runs from raiders too, and idle soldiers go for the danger', () => {
    const s = quiet();
    const v = mine(s, 'villager')[0]!;
    const h = hall(s);
    const spear = s.spawnNear(h, 'spearman');
    const raider: Unit = s.spawnNear(h, 'spearman', RIVAL);
    raider.x = v.x + 3;
    raider.z = v.z;
    raider.task = { kind: 'idle' };
    s.update(0.6);
    expect(v.task.kind).toBe('move');
    expect(spear.task.kind).toBe('attack');
    expect(s.events.some((e) => e.kind === 'alarm' && e.danger === 'raid')).toBe(true);
  });

  it('a calm animal far away raises no alarm', () => {
    const s = quiet();
    const v = mine(s, 'villager')[0]!;
    v.task = { kind: 'idle' };
    animal(s, 'deer', v.x + 3, v.z);
    animal(s, 'tiger', v.x + R * s.map.tile * 3, v.z + R * s.map.tile * 3);
    s.update(0.6);
    expect(v.fleeUntil).toBeUndefined();
    expect(s.events.some((e) => e.kind === 'alarm')).toBe(false);
  });
});
