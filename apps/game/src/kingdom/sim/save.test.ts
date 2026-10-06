import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';
import { migrate, restore, SaveStore, serialize, type KeyValue } from './save';

const data = loadKingdom();

function memory(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

/** A kingdom that has done some work: a house, cut trees, a tech, explored land. */
function played(): KingdomSim {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.addResources({ wood: 500, food: 500 });
  const [tx, tz] = s.map.start;
  const v = [...s.units.values()].filter((u) => u.team === PLAYER).map((u) => u.id);
  s.place('house', tx + 5, tz - 2, v.slice(0, 3));
  const tree = [...s.nodes.values()].find((n) => n.kind === 'tree')!;
  s.cmdGather(v.slice(3), tree.id);
  s.update(90);
  return s;
}

describe('Kingdom save / load', () => {
  it('keeps the campaign: chapter, finished temples, the era and the temple buildings', () => {
    const a = new KingdomSim(data, 'easy');
    a.ai.nextRaid = 1e9;
    const [x, z] = a.monumentSpot();
    a.addBuilding('monument', PLAYER, x, z, 1, 'preah-ko');
    a.monumentDoneAt = a.time;
    a.update(data.rules.victory.monumentHoldSec + 1);
    expect(a.chapter).toBe(1);
    const b = restore(data, JSON.parse(JSON.stringify(serialize(a))));
    expect(b.chapter).toBe(1);
    expect(b.completed).toEqual(['preah-ko']);
    expect(b.chapterData.temple).toBe('bakong');
    expect(b.opponent.id).toBe(a.opponent.id);
    const t = [...b.buildings.values()].find((x) => x.type === 'monument')!;
    expect(t.temple).toBe('preah-ko');
    expect(b.monumentSpot()).toEqual([b.site.tx, b.site.tz]);
    expect(b.site.temple).toBe('bakong');
  });

  it('a restored kingdom matches the saved one and keeps running', () => {
    const a = played();
    const b = restore(data, JSON.parse(JSON.stringify(serialize(a))));
    expect(b.time).toBe(a.time);
    expect(b.res).toEqual(a.res);
    expect([...b.techs]).toEqual([...a.techs]);
    expect(b.buildings.size).toBe(a.buildings.size);
    expect(b.units.size).toBe(a.units.size);
    expect(b.nodes.size).toBe(a.nodes.size);
    expect(b.seed).toBe(a.seed);
    const same = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
    expect(same(b.fog.explored, a.fog.explored)).toBe(true);
    // Blocked tiles (buildings, trees) are the same.
    expect(same(b.grid.open, a.grid.open)).toBe(true);
    expect(b.animals.size).toBe(a.animals.size);
    expect(b.weather).toEqual(a.weather);
    b.update(30);
    expect(b.time).toBeGreaterThan(a.time);
  });

  it('keeps rotating backups; a corrupted save falls back to the newest intact backup', () => {
    const kv = memory();
    const store = new SaveStore(kv, 3);
    const sim = played();
    expect(store.save('autosave', sim)).toBe(true);
    sim.update(20);
    expect(store.save('autosave', sim)).toBe(true);
    expect(kv.map.has('kingdom.autosave.bak1')).toBe(true);
    // Damage the newest save (a crash mid-write, a bad edit).
    kv.map.set('kingdom.autosave', kv.map.get('kingdom.autosave')!.slice(0, 200));
    const back = store.load('autosave', data);
    expect(back?.recovered).toBe(true);
    expect(back!.sim.time).toBeCloseTo(sim.time - 20, 3);
  });

  it('a failed write never destroys the previous save', () => {
    const kv = memory();
    const store = new SaveStore(kv, 2);
    const sim = played();
    store.save('quick', sim);
    const before = kv.map.get('kingdom.quick');
    // Storage that silently drops writes to the temporary key (full disk).
    const broken: KeyValue = { ...kv, set: (k, v) => (k.endsWith('.tmp') ? undefined : kv.set(k, v)) };
    expect(new SaveStore(broken, 2).save('quick', sim)).toBe(false);
    expect(kv.map.get('kingdom.quick')).toBe(before);
  });

  it('three slots are independent; saves from other games or newer versions are refused', () => {
    const kv = memory();
    const store = new SaveStore(kv);
    const sim = played();
    store.save('manual', sim);
    expect(store.info('manual')?.time).toBeCloseTo(sim.time, 3);
    expect(store.info('quick')).toBeNull();
    expect(() => migrate({ version: 99 } as never)).toThrow(/newer/);
    // v0.1 saves (one small map, Preah Ko only) can't be carried into the campaign.
    expect(() => migrate({ version: 1 } as never)).toThrow(/campaign/);
    expect(() => migrate({} as never)).toThrow();
  });
});
