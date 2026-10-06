import type { Building, KingdomSim } from './sim';

/**
 * The rice year in a field (PK): the farmer sows the seed (ព្រោះស្រូវ), treads the rahat
 * water wheel to bring water in (ដាក់ទឹកស្រែ ដោយរហាត់ទឹក), transplants the seedlings
 * (ស្ទូងស្រូវ), tends the growing rice and reaps it (ច្រូតស្រូវ). Stages and times are in
 * rules.json `rice`.
 */
export type RiceStageId = 'sow' | 'water' | 'transplant' | 'grow' | 'harvest';

export function riceStage(
  sim: KingdomSim,
  f: Building,
): { id: RiceStageId; km: string; en: string; until: number; at: number } {
  const g = f.grow ?? 0;
  const stages = sim.data.rules.rice.stages;
  const i = stages.findIndex((s) => g < s.until);
  const s = stages[i < 0 ? stages.length - 1 : i]!;
  const from = i <= 0 ? 0 : stages[i - 1]!.until;
  // `at`: how far through this stage (0–1).
  return { ...s, at: Math.min(1, Math.max(0, (g - from) / Math.max(1e-6, s.until - from))) };
}

/** Where the rahat water wheel stands: on the field's west bund, halfway along. */
export function rahatSpot(sim: KingdomSim, f: Building): [number, number] {
  const [cx, cz] = sim.center(f);
  return [cx - (f.w * sim.map.tile) / 2 - 0.3, cz];
}

/** How tall the rice stands (0 = bare mud … 1 = full grown) and how ripe (0 green … 1 gold). */
export function riceLook(
  sim: KingdomSim,
  f: Building,
): { height: number; ripe: number; rows: boolean; cut: number } {
  const s = riceStage(sim, f);
  switch (s.id) {
    case 'sow':
      return { height: 0.05 + 0.1 * s.at, ripe: 0, rows: false, cut: 0 }; // seedling bed
    case 'water':
      return { height: 0.15, ripe: 0, rows: false, cut: 0 };
    case 'transplant':
      return { height: 0.25, ripe: 0, rows: true, cut: 0 }; // planted out in rows
    case 'grow':
      return { height: 0.3 + 0.7 * s.at, ripe: Math.max(0, s.at - 0.75) * 2, rows: true, cut: 0 };
    default:
      // Golden, then reaped row by row (`cut` = the share already cut).
      return {
        height: 1,
        ripe: 0.5 + 0.5 * Math.min(1, s.at * 3),
        rows: true,
        cut: Math.max(0, (s.at - 0.25) / 0.75),
      };
  }
}
