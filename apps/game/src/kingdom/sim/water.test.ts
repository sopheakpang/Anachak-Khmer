import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { KingdomSim, PLAYER } from './sim';
import { shoreDistance, waterDepth, waterSpeed, waterWay } from './water';
import { tileToWorld } from './map';

const data = loadKingdom();
const W = data.rules.water;

describe('crossing water (PK 1.8.0)', () => {
  it('rules: chest depth, swimming slower than boats, boats from the river landing', () => {
    expect(W.chestDepth).toBeGreaterThan(1);
    expect(W.swimSpeed).toBeLessThan(data.rules.rafts.speed);
    expect(W.wadeSpeed).toBeGreaterThan(W.swimSpeed);
    for (const b of W.boatsFrom) expect(data.buildings[b]).toBeDefined();
  });

  it('shore distance grows away from the bank', () => {
    // A 7-wide strip of water between land on both sides.
    const n = 9;
    const water = new Uint8Array(n * n);
    for (let z = 0; z < n; z++) for (let x = 1; x < 8; x++) water[z * n + x] = 1;
    const d = shoreDistance(water, n);
    expect(d[4 * n + 0]).toBe(0);
    expect(d[4 * n + 1]).toBe(1);
    expect(d[4 * n + 2]).toBe(2);
    expect(d[4 * n + 4]).toBe(4); // the middle
    expect(d[4 * n + 7]).toBe(1);
  });

  it('depth: 0 on land, grows by the slope, capped', () => {
    expect(waterDepth(0, 2, W)).toBe(0);
    expect(waterDepth(1, 2, W)).toBeCloseTo(0.5 * 2 * W.shoreSlope);
    expect(waterDepth(200, 2, W)).toBe(W.maxDepth);
  });

  it('wade below the chest, swim without a boat, boat or raft with one', () => {
    const shallow = W.chestDepth * 0.5;
    const deep = W.chestDepth + 0.5;
    expect(waterWay(0, 'worker', false, null, W)).toBe('land');
    expect(waterWay(shallow, 'worker', false, null, W)).toBe('wade');
    expect(waterWay(deep, 'worker', false, null, W)).toBe('swim');
    expect(waterWay(deep, 'worker', true, null, W)).toBe('boat');
    expect(waterWay(deep, 'worker', true, 'stone', W)).toBe('raft');
    expect(waterWay(deep, 'elephant', false, null, W)).toBe('wade');
    expect(waterSpeed('swim', W, 0.55)).toBe(W.swimSpeed);
    expect(waterSpeed('boat', W, 0.55)).toBe(0.55);
    expect(waterSpeed('land', W, 0.55)).toBe(1);
  });

  it('in the sim: a villager in deep water swims until his side builds a landing', () => {
    const s = new KingdomSim(data, 'easy');
    s.ai.nextRaid = 1e9;
    s.autoWork = false;
    const v = [...s.units.values()].find((u) => u.team === PLAYER && u.type === 'villager')!;
    // Find the deepest water tile on the map.
    let best = 0;
    let at: [number, number] = [0, 0];
    for (let z = 0; z < s.map.size; z += 3)
      for (let x = 0; x < s.map.size; x += 3) {
        const d = s.grid.shore(x, z);
        if (d > best) {
          best = d;
          at = [x, z];
        }
      }
    [v.x, v.z] = tileToWorld(s.map, at[0], at[1]);
    expect(s.depthAt(v.x, v.z)).toBeGreaterThan(W.chestDepth);
    expect(s.waterWay(v)).toBe('swim');
    const port = s.addBuilding('port', PLAYER, 2, 2, 1);
    s.update(0.1);
    expect(s.hasBoats(PLAYER)).toBe(true);
    expect(s.waterWay(v)).toBe('boat');
    v.carry = { res: 'wood', n: 5 };
    expect(s.waterWay(v)).toBe('raft');
    s.buildings.delete(port.id);
  });
});
