import { describe, expect, it } from 'vitest';
import { assignSlot, filledSlots, frontierY, kitFor, unitsPerSlot } from './kit';

const kit = kitFor('preah-ko')!;

describe('Preah Ko kit (prompt 09)', () => {
  it('exists; other temples have no kit yet', () => {
    expect(kit.templeId).toBe('preah-ko');
    expect(kitFor('angkor-wat')).toBeNull();
  });

  it('has six towers, a platform, door frames, lintels, finials and three Nandi', () => {
    const towers = new Set(
      kit.slots.filter((s) => s.part.startsWith('tower')).map((s) => s.part.slice(0, 6)),
    );
    expect(towers.size).toBe(6);
    expect(kit.slots.some((s) => s.part === 'platform')).toBe(true);
    const kinds = kit.bigPieces.map((b) => b.kind);
    expect(kinds.filter((k) => k === 'doorFrame')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'lintel')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'finial')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'nandi')).toHaveLength(3);
  });

  it('about 2,000 blocks, so 3,000 units = 2 units per block', () => {
    expect(kit.slots.length).toBeGreaterThan(1500);
    expect(kit.slots.length).toBeLessThanOrEqual(3000);
    expect(unitsPerSlot(kit, 3000)).toBe(2);
  });

  it('build order never places a block above an empty course', () => {
    for (let i = 1; i < kit.slots.length; i++)
      expect(kit.slots[i]!.y).toBeGreaterThanOrEqual(kit.slots[i - 1]!.y);
    kit.slots.forEach((s, i) => expect(s.i).toBe(i));
  });

  it('front towers are taller than back towers', () => {
    const finials = kit.bigPieces.filter((b) => b.kind === 'finial');
    const front = finials.filter((f) => f.z > 0).map((f) => f.y);
    const back = finials.filter((f) => f.z < 0).map((f) => f.y);
    expect(Math.min(...front)).toBeGreaterThan(Math.max(...back));
  });

  it('leaves a doorway in each front wall for the sandstone door frame', () => {
    for (const door of kit.bigPieces.filter((b) => b.kind === 'doorFrame')) {
      const blocked = kit.slots.filter(
        (s) =>
          s.material === 'brick' &&
          Math.abs(s.x - door.x) < 0.4 &&
          Math.abs(s.z - door.z) < 0.5 &&
          s.y >= door.y &&
          s.y < door.y + door.h - 0.01,
      );
      expect(blocked).toHaveLength(0);
    }
  });

  it('materials: laterite base, brick towers, sandstone carvings', () => {
    expect(kit.slots.find((s) => s.part === 'platform')?.material).toBe('laterite');
    expect(kit.slots.find((s) => s.part.includes('body'))?.material).toBe('brick');
    expect(kit.bigPieces.every((b) => b.material === 'sandstone')).toBe(true);
  });
});

describe('filling and slot assignment (prompt 10)', () => {
  it('filled slots follow progress and reach all at 100%', () => {
    expect(filledSlots(kit, 3000, 0)).toBe(0);
    expect(filledSlots(kit, 3000, 3)).toBe(1);
    expect(filledSlots(kit, 3000, 2999)).toBeLessThanOrEqual(kit.slots.length);
    expect(filledSlots(kit, 3000, 3000)).toBe(kit.slots.length);
    expect(frontierY(kit, kit.slots.length)).toBe(Infinity);
  });

  it('a small stone is carved on the top-most block it filled', () => {
    expect(assignSlot(kit, 3000, 0, 10, 'small', 0)).toEqual({ kind: 'normal', index: 4 });
  });

  it('a stone that only filled half a block, or went to the stockpile, has no slot', () => {
    expect(assignSlot(kit, 3000, 0, 1, 'small', 0)).toBeNull();
    expect(assignSlot(kit, 3000, 500, 500, 'medium', 0)).toBeNull();
  });

  it('a large stone takes the next big piece once its support is built (Nandi first)', () => {
    expect(kit.bigPieces[0]!.kind).toBe('nandi');
    expect(assignSlot(kit, 3000, 0, 150, 'large', 0)).toEqual({ kind: 'big', index: 0 });
  });

  it('a door frame waits until the platform and plinth are built', () => {
    const doorIndex = kit.bigPieces.findIndex((b) => b.kind === 'doorFrame');
    expect(assignSlot(kit, 3000, 0, 150, 'huge', doorIndex)?.kind).toBe('normal');
    expect(assignSlot(kit, 3000, 1400, 1850, 'huge', doorIndex)).toEqual({ kind: 'big', index: doorIndex });
  });

  it('when all big pieces are used, large stones carve normal blocks', () => {
    expect(assignSlot(kit, 3000, 100, 250, 'large', kit.bigPieces.length)?.kind).toBe('normal');
  });
});
