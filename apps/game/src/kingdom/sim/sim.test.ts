import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { findPath, generateMap, Grid, tileToWorld, worldToTile } from './map';
import { KingdomSim, PLAYER, RIVAL, type Unit } from './sim';

const data = loadKingdom();
const R = data.rules;
const start = (s: KingdomSim) => s.map.start;

/** Run the simulation for `sec` seconds. */
const run = (sim: KingdomSim, sec: number) => sim.update(sec);
const villagers = (sim: KingdomSim) =>
  [...sim.units.values()].filter((u) => u.team === PLAYER && u.type === 'villager');
const tc = (sim: KingdomSim) => [...sim.buildings.values()].find((b) => b.type === 'townCentre')!;
const camp = (sim: KingdomSim) => [...sim.buildings.values()].find((b) => b.team === RIVAL)!;
const rich = (sim: KingdomSim) => sim.addResources({ food: 5000, wood: 5000, stone: 5000, gold: 5000 });
/** A calm sim for economy tests: the first raid comes much later. */
const calm = () => {
  const s = new KingdomSim(data, 'easy');
  s.ai.nextRaid = 1e9;
  s.autoWork = false; // economy tests give every order themselves
  return s;
};

describe('Greater Angkor map (campaign)', () => {
  it('is the same every time, keeps the royal centre clear and has fords over the river', () => {
    const a = generateMap(data);
    const b = generateMap(data);
    expect(a.terrain).toEqual(b.terrain);
    expect(a.nodes.length).toBe(b.nodes.length);
    expect(a.sites).toEqual(b.sites);
    const [tx, tz] = a.start;
    for (let z = tz - 4; z <= tz + 4; z++)
      for (let x = tx - 4; x <= tx + 4; x++) expect(a.terrain[z * a.size + x]).toBe('grass');
    expect(a.terrain.filter((t) => t === 'ford').length).toBeGreaterThan(0);
    expect(a.terrain.filter((t) => t === 'hill').length).toBeGreaterThan(0);
    expect(a.nodes.filter((n) => n.kind === 'stone').length).toBeGreaterThan(3);
    expect(a.nodes.filter((n) => n.kind === 'gold').length).toBeGreaterThan(3);
    expect(a.nodes.filter((n) => n.kind === 'tree').length).toBeGreaterThan(200);
  });

  it('puts every temple of the campaign on its own site, in the Build map layout, never overlapping', () => {
    const m = generateMap(data);
    expect(m.sites.map((x) => x.temple)).toEqual(data.campaign.chapters.map((c) => c.temple));
    for (const [i, s] of m.sites.entries()) {
      const ch = data.campaign.chapters[i]!;
      expect([s.w, s.d]).toEqual(ch.footprint);
      expect(s.tx).toBeGreaterThanOrEqual(0);
      expect(s.tz + s.d).toBeLessThanOrEqual(m.size);
      // The site is clear, buildable ground (islands and moats around it are water).
      for (let z = s.tz; z < s.tz + s.d; z++)
        for (let x = s.tx; x < s.tx + s.w; x++) expect(m.terrain[z * m.size + x], ch.temple).toBe('grass');
      for (const o of m.sites.slice(i + 1)) {
        const apart = s.tx + s.w <= o.tx || o.tx + o.w <= s.tx || s.tz + s.d <= o.tz || o.tz + o.d <= s.tz;
        expect(apart, `${s.temple} / ${o.temple}`).toBe(true);
      }
    }
    // Same arrangement as the Build map: Angkor Wat south of the Bayon, Bakong south-east of
    // the Bakheng (Roluos lies south-east of Angkor), East Mebon east of Ta Prohm's west side.
    const at = (id: string) => m.sites.find((x) => x.temple === id)!;
    expect(at('angkor-wat').tz).toBeGreaterThan(at('bayon').tz);
    expect(at('bakong').tx).toBeGreaterThan(at('phnom-bakheng').tx);
    expect(at('bakong').tz).toBeGreaterThan(at('phnom-bakheng').tz);
  });

  it('island temples and Angkor Wat stand in water but a causeway reaches them', () => {
    const m = generateMap(data);
    const g = Grid.fromMap(m);
    for (const [i, ch] of data.campaign.chapters.entries()) {
      if (!ch.island && !ch.moat) continue;
      const s = m.sites[i]!;
      // Water right outside the footprint…
      let wet = 0;
      for (let x = s.tx; x < s.tx + s.w; x++) if (m.terrain[(s.tz - 4) * m.size + x] === 'water') wet++;
      expect(wet, ch.temple).toBeGreaterThan(s.w / 2);
    }
    // …and every site can be reached on foot from the first royal hall.
    const from: [number, number] = [m.start[0], m.start[1] + 4];
    for (const s of m.sites) {
      const p = findPath(g, from, { x0: s.tx, z0: s.tz, x1: s.tx + s.w - 1, z1: s.tz + s.d - 1 }, 200000);
      expect(p, s.temple).not.toBeNull();
      for (const [px, pz] of p!) expect(g.ok(px, pz)).toBe(true);
    }
  });

  it('finds paths from the royal hall to stone, gold and across the river to the rival camp', () => {
    const s = calm();
    const g = s.grid;
    const [cx, cz] = s.center(tc(s));
    const from: [number, number] = [s.map.start[0], s.map.start[1] + 4];
    const near = (kind: string) =>
      [...s.nodes.values()]
        .filter((n) => n.kind === kind)
        .sort((a, b) => {
          const [ax, az] = s.nodePos(a);
          const [bx, bz] = s.nodePos(b);
          return Math.hypot(ax - cx, az - cz) - Math.hypot(bx - cx, bz - cz);
        })[0]!;
    const c = camp(s);
    for (const [x, z] of [
      [near('stone').tx, near('stone').tz],
      [near('gold').tx, near('gold').tz],
      [c.tx, c.tz],
    ] as const) {
      const p = findPath(g, from, { x0: x, z0: z, x1: x, z1: z }, 200000, 1);
      expect(p, `${x},${z}`).not.toBeNull();
      for (const [px, pz] of p!) expect(g.ok(px, pz)).toBe(true);
    }
  });
});

describe('economy', () => {
  it('starts with the royal hall, six villagers and the scenario resources', () => {
    const s = calm();
    expect(tc(s).progress).toBe(1);
    expect(villagers(s).length).toBe(R.start.villagers);
    expect(s.res[PLAYER]).toMatchObject(R.start.resources);
    expect(s.popUsed()).toBe(6);
    expect(s.popCap()).toBe(data.buildings.townCentre!.pop);
  });

  it('villagers cut wood, carry it home and repeat; the tree runs out and they move on', () => {
    const s = calm();
    const v = villagers(s).slice(0, 3);
    const tree = [...s.nodes.values()]
      .filter((n) => n.kind === 'tree')
      .sort((a, b) => {
        const [ax, az] = s.nodePos(a);
        const [bx, bz] = s.nodePos(b);
        const [cx, cz] = s.center(tc(s));
        return Math.hypot(ax - cx, az - cz) - Math.hypot(bx - cx, bz - cz);
      })[0]!;
    const wood0 = s.res[PLAYER].wood;
    s.cmdGather(
      v.map((u) => u.id),
      tree.id,
    );
    run(s, 360);
    expect(s.res[PLAYER].wood).toBeGreaterThan(wood0 + 60);
    expect(s.nodes.has(tree.id)).toBe(false); // all 120 wood cut
    expect(v.every((u) => u.task.kind === 'gather')).toBe(true); // moved on to the next tree
  });

  it('mines stone and gold at the quarry and the gold source', () => {
    const s = calm();
    const [a, b] = villagers(s);
    const stone = [...s.nodes.values()].find((n) => n.kind === 'stone')!;
    const gold = [...s.nodes.values()].find((n) => n.kind === 'gold')!;
    s.cmdGather([a!.id], stone.id);
    s.cmdGather([b!.id], gold.id);
    const st0 = s.res[PLAYER].stone;
    const g0 = s.res[PLAYER].gold;
    run(s, 240);
    expect(s.res[PLAYER].stone).toBeGreaterThan(st0);
    expect(s.res[PLAYER].gold).toBeGreaterThan(g0);
  });

  it('builds a stilt house in stages, raises the population room, and a foundation can be cancelled', () => {
    const s = calm();
    const [tx, tz] = start(s);
    const v = villagers(s)
      .slice(0, 2)
      .map((u) => u.id);
    const cap0 = s.popCap();
    const wood0 = s.res[PLAYER].wood;
    const r = s.place('house', tx + 5, tz - 2, v);
    expect(r.ok).toBe(true);
    expect(s.res[PLAYER].wood).toBe(wood0 - data.buildings.house!.cost.wood!);
    const house = s.buildings.get((r as { id: number }).id)!;
    const stages = new Set<number>();
    for (let i = 0; i < 400 && house.progress < 1; i++) {
      run(s, 0.25);
      stages.add(Math.floor(house.progress * 4));
    }
    expect(house.progress).toBe(1);
    expect([0, 1, 2, 3].every((k) => stages.has(k))).toBe(true); // 0 %, 25 %, 50 %, 75 %
    expect(s.popCap()).toBe(cap0 + data.buildings.house!.pop);
    // A second foundation, cancelled: 75 % back.
    const wood1 = s.res[PLAYER].wood;
    const r2 = s.place('house', tx + 5, tz + 4);
    expect(s.cancel((r2 as { id: number }).id)).toBe(true);
    expect(s.res[PLAYER].wood).toBe(wood1 - 40 + Math.floor(40 * R.economy.refundShare));
  });

  it('refuses bad placements: on water, on the royal hall, the war camp before a house, a later era, the temple off its site', () => {
    const s = calm();
    rich(s);
    const w = s.map.terrain.indexOf('water');
    expect(s.canPlace('house', w % s.map.size, Math.floor(w / s.map.size))).toBe('blocked');
    const t = tc(s);
    expect(s.canPlace('house', t.tx + 1, t.tz + 1)).toBe('blocked');
    const [tx, tz] = start(s);
    expect(s.canPlace('barracks', tx + 6, tz - 6)).toBe('requires');
    expect(s.canPlace('monument', tx + 6, tz - 6)).toBe('requires'); // needs a storehouse first
    expect(s.canPlace('nobleHouse', tx + 6, tz - 6)).toBe('era'); // Suryavarman II's era
    expect(s.canPlace('townCentre', tx + 6, tz - 6)).toBe('unknown'); // not buildable by hand
  });

  it('never builds over another thing: a rice field, a fruit bush or a carcass (PK)', () => {
    const s = calm();
    rich(s);
    const [tx, tz] = start(s);
    // Find an open 6x6 patch near the start for the test.
    let spot: [number, number] | null = null;
    for (let r = 6; r < 60 && !spot; r += 2)
      for (let dz = -r; dz <= r && !spot; dz += 2)
        for (let dx = -r; dx <= r && !spot; dx += 2) {
          const x = tx + dx;
          const z = tz + dz;
          if (s.canPlace('house', x, z) === null && s.canPlace('riceField', x, z) === null) spot = [x, z];
        }
    expect(spot).not.toBeNull();
    const [x, z] = spot!;
    expect(s.place('riceField', x, z).ok).toBe(true);
    expect(s.canPlace('house', x + 1, z + 1)).toBe('blocked'); // over the paddy
    expect(s.canPlace('riceField', x + 2, z)).toBe('blocked');
    const n = { id: 999_999, kind: 'fruit' as const, tx: x + 20, tz: z, amount: 50 };
    s.nodes.set(n.id, n);
    expect(s.canPlace('house', x + 19, z)).toBe('blocked'); // over the fruit bush
  });

  it('the royal hall trains villagers (costs food, needs population room)', () => {
    const s = calm();
    const food0 = s.res[PLAYER].food;
    expect(s.train(tc(s).id, 'villager').ok).toBe(true);
    expect(s.res[PLAYER].food).toBe(food0 - 50);
    run(s, data.units.villager!.trainSec + 0.2);
    expect(villagers(s).length).toBe(R.start.villagers + 1);
    // Fill the room: 10 at the hall.
    rich(s);
    let refused = false;
    for (let i = 0; i < 6; i++) if (!s.train(tc(s).id, 'villager').ok) refused = true;
    expect(refused).toBe(true);
    expect(s.train(tc(s).id, 'spearman').ok).toBe(false); // not trained at the hall
  });

  it('rice fields feed a farmer; bunded paddies make farming faster', () => {
    const run2 = (withTech: boolean) => {
      const s = calm();
      rich(s);
      const [tx, tz] = start(s);
      const v = villagers(s)[0]!;
      if (withTech) s.techs.add('irrigatedRice');
      const r = s.place('riceField', tx - 3, tz + 4, [v.id]);
      expect(r.ok).toBe(true);
      const food0 = s.res[PLAYER].food;
      run(s, 120);
      expect(v.task.kind).toBe('gather'); // the builder became its farmer
      return s.res[PLAYER].food - food0;
    };
    const plain = run2(false);
    const bunded = run2(true);
    expect(plain).toBeGreaterThan(10);
    expect(bunded).toBeGreaterThan(plain);
  });

  it('research takes time, needs its prerequisite and changes the game (elephants unlock)', () => {
    const s = calm();
    rich(s);
    const [tx, tz] = start(s);
    const v = villagers(s).map((u) => u.id);
    s.place('house', tx + 5, tz - 2, v);
    run(s, 40);
    const camp0 = s.place('barracks', tx + 8, tz + 4, v);
    expect(camp0.ok).toBe(true);
    run(s, 60);
    const barracks = s.buildings.get((camp0 as { id: number }).id)!;
    expect(barracks.progress).toBe(1);
    expect(s.train(barracks.id, 'warElephant')).toEqual({ ok: false, reason: 'requires' });
    expect(s.research(barracks.id, 'elephantTraining')).toEqual({ ok: false, reason: 'requires' });
    expect(s.research(barracks.id, 'bronzeSpearheads').ok).toBe(true);
    run(s, data.techs.bronzeSpearheads!.researchSec + 1);
    expect(s.techs.has('bronzeSpearheads')).toBe(true);
    expect(s.research(barracks.id, 'elephantTraining').ok).toBe(true);
    run(s, data.techs.elephantTraining!.researchSec + 1);
    expect(s.train(barracks.id, 'warElephant').ok).toBe(true);
  });
});

describe('combat, the rival chiefdom and victory', () => {
  const army = (s: KingdomSim, type: string, n: number, team: 0 | 1, near: 'tc' | 'camp'): Unit[] => {
    const b = near === 'tc' ? tc(s) : camp(s);
    return Array.from({ length: n }, () => s.spawnNear(b, type, team));
  };

  it('soldiers fight: spearmen beat a smaller band, archers shoot from range', () => {
    const s = calm();
    const mine = army(s, 'spearman', 6, PLAYER, 'tc');
    const theirs = army(s, 'spearman', 3, RIVAL, 'tc');
    for (const u of theirs) u.task = { kind: 'attack', unit: mine[0]!.id };
    run(s, 40);
    expect(theirs.every((u) => !s.units.has(u.id))).toBe(true);
    expect(mine.filter((u) => s.units.has(u.id)).length).toBeGreaterThan(2);
    const archers = army(s, 'archer', 2, PLAYER, 'tc');
    const foe = army(s, 'spearman', 1, RIVAL, 'tc')[0]!;
    s.cmdAttack(
      archers.map((a) => a.id),
      { unit: foe.id },
    );
    run(s, 10);
    expect(s.events.some((e) => e.kind === 'shot')).toBe(true);
  });

  it('armor and bonuses count: a spearman hurts an elephant more; metal spearheads add attack', () => {
    const s = calm();
    const sp = army(s, 'spearman', 1, PLAYER, 'tc')[0]!;
    const el = army(s, 'warElephant', 1, RIVAL, 'tc')[0]!;
    const vil = army(s, 'villager', 1, RIVAL, 'tc')[0]!;
    expect(s.attackOf(sp, el)).toBeGreaterThan(s.attackOf(sp, vil));
    const base = s.attackOf(sp);
    s.techs.add('bronzeSpearheads');
    expect(s.attackOf(sp)).toBe(base + 2);
  });

  it('the rival sends a raid at the configured time, logs its plan, and retreats when beaten', () => {
    const s = new KingdomSim(data, 'normal');
    // Raids only come once the kingdom has a war camp (PK); build one at once.
    s.addBuilding('barracks', PLAYER, s.map.start[0] + 6, s.map.start[1] - 8, 1);
    const L = R.ai.levels.normal;
    run(s, L.firstRaidSec - 1);
    expect(s.ai.wave).toBe(0);
    run(s, 2);
    expect(s.ai.wave).toBe(1);
    expect(s.events.some((e) => e.kind === 'raid')).toBe(true);
    expect(s.aiLog.some((l) => l.includes('ATTACKING'))).toBe(true);
    const raiders = [...s.units.values()].filter((u) => u.team === RIVAL && u.wave === 1);
    expect(raiders.length).toBe(L.wave);
    // Knock most of them out: the rest fall back.
    raiders.slice(0, raiders.length - 1).forEach((u) => s.units.delete(u.id));
    run(s, 1);
    expect(s.aiLog.some((l) => l.includes('RETREATING'))).toBe(true);
  });

  it('fog of war: the royal centre is seen, the rival camp is hidden until someone gets close', () => {
    const s = calm();
    const [cx, cz] = s.center(tc(s));
    expect(s.isVisible(cx, cz)).toBe(true);
    const [ex, ez] = s.center(camp(s));
    expect(s.isVisible(ex, ez)).toBe(false);
    // The chapter's temple site is known ground from the start.
    expect(s.fog.explored[s.site.tz * s.fog.size + s.site.tx]).toBe(1);
    const scout = army(s, 'archer', 1, PLAYER, 'tc')[0]!;
    [scout.x, scout.z] = [ex + 6, ez + 8];
    s.updateFog();
    expect(s.isVisible(ex, ez)).toBe(true);
    // Explored stays explored after the scout leaves.
    s.units.delete(scout.id);
    s.updateFog();
    const [tx, tz] = worldToTile(s.map, ex, ez);
    expect(s.fog.explored[tz * s.fog.size + tx]).toBe(1);
    expect(s.isVisible(ex, ez)).toBe(false);
  });

  it('defeat when the royal hall falls; destroying the rival camp alone does not end the campaign', () => {
    const s = calm();
    camp(s).hp = 1;
    const sp = army(s, 'spearman', 1, PLAYER, 'camp')[0]!;
    for (const u of [...s.units.values()]) if (u.team === RIVAL) s.units.delete(u.id);
    s.cmdAttack([sp.id], { building: camp(s).id });
    run(s, 10);
    expect([...s.buildings.values()].some((b) => b.team === RIVAL)).toBe(false);
    expect(s.outcome).toBeNull();

    const d = calm();
    tc(d).hp = 1;
    const foe = army(d, 'spearman', 1, RIVAL, 'tc')[0]!;
    foe.task = { kind: 'attack', building: tc(d).id };
    run(d, 10);
    expect(d.outcome?.result).toBe('defeat');
  });

  it('Preah Ko finished on its site ends the era and unlocks Bakong, the next temple', () => {
    const s = calm();
    rich(s);
    const [tx, tz] = start(s);
    const v = villagers(s).map((u) => u.id);
    const store = s.place('storehouse', tx + 6, tz - 3, v);
    expect(store.ok).toBe(true);
    run(s, 40);
    expect(s.chapterData.temple).toBe('preah-ko');
    const [mx, mz] = s.monumentSpot();
    expect([mx, mz]).toEqual([s.site.tx, s.site.tz]);
    expect(s.canPlace('monument', mx + 1, mz)).toBe('site');
    const m = s.place('monument', mx, mz, v);
    expect(m.ok).toBe(true);
    const temple = s.buildings.get((m as { id: number }).id)!;
    expect(temple.temple).toBe('preah-ko');
    expect([temple.w, temple.d]).toEqual(data.campaign.chapters[0]!.footprint);
    expect(s.canPlace('monument', mx, mz)).not.toBeNull(); // one at a time
    temple.progress = 0.999; // skip most of the long build
    run(s, 90);
    expect(temple.progress).toBe(1);
    run(s, R.victory.monumentHoldSec + 1);
    expect(s.outcome).toBeNull();
    expect(s.completed).toEqual(['preah-ko']);
    expect(s.chapter).toBe(1);
    expect(s.chapterData.temple).toBe('bakong');
    expect(s.year).toBe(881);
    expect(s.events.some((e) => e.kind === 'chapter' && e.done === 'preah-ko' && e.next === 'bakong')).toBe(
      true,
    );
    // The finished temple stays, can't be harmed, and the new site is elsewhere.
    expect(s.buildings.has(temple.id)).toBe(true);
    expect(s.monumentSpot()).not.toEqual([mx, mz]);
    expect(s.canPlace('monument', ...s.monumentSpot())).toBeNull();
  });

  it('each chapter brings its era: the capital moves at Bakheng, Champa comes with Ta Prohm, all 13 end the campaign', () => {
    const s = calm();
    const hall0 = [...s.buildings.values()].filter((b) => b.type === 'townCentre').length;
    const finish = () => {
      const [x, z] = s.monumentSpot();
      const b = s.addBuilding('monument', PLAYER, x, z, 1, s.chapterData.temple);
      s.monumentDoneAt = s.time;
      run(s, R.victory.monumentHoldSec + 1);
      return b;
    };
    expect(s.opponent.id).toBe('chiefdom');
    expect(s.allows('buildings', 'nobleHouse')).toBe(false);
    expect(s.allows('techs', 'yasodharatataka')).toBe(false);
    finish(); // Preah Ko
    finish(); // Bakong
    finish(); // Lolei
    expect(s.chapterData.temple).toBe('phnom-bakheng');
    expect(s.allows('techs', 'yasodharatataka')).toBe(true);
    // Yasodharapura: a second royal hall with villagers.
    expect([...s.buildings.values()].filter((b) => b.type === 'townCentre').length).toBe(hall0 + 1);
    while (s.chapterData.temple !== 'angkor-wat') finish();
    expect(s.opponent.id).toBe('daiviet');
    expect(s.allows('buildings', 'nobleHouse')).toBe(true);
    expect(camp(s)).toBeDefined(); // the new rival's camp
    finish();
    expect(s.chapterData.temple).toBe('ta-prohm');
    expect(s.opponent.id).toBe('champa');
    expect(s.allows('techs', 'hospitals')).toBe(true);
    while (!s.outcome) finish();
    expect(s.outcome).toEqual({ result: 'victory', how: 'Every temple of the campaign stands' });
    expect(s.completed).toEqual(data.campaign.chapters.map((c) => c.temple));
  });

  it('rest houses make the people faster; hospitals heal them', () => {
    const s = calm();
    const v = villagers(s)[0]!;
    const walk = (sim: KingdomSim, u: Unit) => {
      const x0 = u.x;
      sim.cmdMove([u.id], [u.x + 30, u.z]);
      run(sim, 3);
      return u.x - x0;
    };
    const plain = walk(s, v);
    const t = calm();
    t.techs.add('restHouses');
    const fast = walk(t, villagers(t)[0]!);
    expect(fast).toBeGreaterThan(plain * 1.05);
    const h = calm();
    h.techs.add('hospitals');
    const u = villagers(h)[1]!;
    u.hp = 5;
    run(h, 10);
    expect(u.hp).toBeGreaterThan(8);
  });

  it('LIVE support adds resources', () => {
    const s = calm();
    const f = s.res[PLAYER].food;
    s.addResources(R.tiktok.perStone.small);
    expect(s.res[PLAYER].food).toBe(f + R.tiktok.perStone.small.food!);
  });
});

describe('coordinates', () => {
  it('tile centres map to the middle of the 2 m tiles around the map centre', () => {
    const m = { size: 128, tile: 2 };
    expect(tileToWorld(m, 0, 0)).toEqual([-127, -127]);
    expect(tileToWorld(m, 64, 64)).toEqual([1, 1]);
  });
});
