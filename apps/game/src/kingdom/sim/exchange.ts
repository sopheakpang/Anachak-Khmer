import type { Resource } from '@temples/shared';
import { PLAYER, type KingdomSim, type Result } from './sim';

/**
 * The market (PK: a market to exchange goods; Anachak Khmer). Zhou Daguan saw the women of
 * Angkor trading on mats laid on the ground, paying the officials for their places, small
 * trades in rice and goods, large ones in gold and silver. Here the king's people give a lot of
 * one good and get another at today's rate, less the stall rent; each trade makes what was sold
 * cheaper and what was bought dearer, and prices drift back to their value with time. Rules in
 * config/kingdom/anachak.json `market`.
 */

export const GOODS: readonly Resource[] = ['food', 'wood', 'stone', 'gold'];

/** Today's prices (in "value" units): they move with trade, between min and max × value. */
export type Prices = Record<Resource, number>;

export function basePrices(sim: KingdomSim): Prices {
  return { ...sim.data.anachak.market.value };
}

/** Is there a finished market of the player's? */
export function hasMarket(sim: KingdomSim): boolean {
  const id = sim.data.anachak.market.building;
  for (const b of sim.buildings.values())
    if (b.team === PLAYER && b.type === id && b.progress >= 1) return true;
  return false;
}

/** How much of `get` a lot of `give` buys now (after the stall rent). */
export function quote(sim: KingdomSim, give: Resource, get: Resource, lot: number): number {
  if (give === get) return 0;
  const M = sim.data.anachak.market;
  const p = sim.prices;
  return Math.floor(((lot * p[give]) / p[get]) * (1 - M.fee) + 1e-6); // (rounding: 59.99999 is 60)
}

/**
 * Trade a lot of `give` for `get` at the market. Needs a finished market and the goods; returns
 * how much was got. Prices move: what was given falls, what was got rises.
 */
export function exchange(sim: KingdomSim, give: Resource, get: Resource, lot: number): Result<number> {
  const M = sim.data.anachak.market;
  if (give === get || !GOODS.includes(give) || !GOODS.includes(get)) return { ok: false, reason: 'unknown' };
  if (!hasMarket(sim)) return { ok: false, reason: 'requires' };
  const res = sim.res[PLAYER]!;
  if (res[give] < lot) return { ok: false, reason: 'cost' };
  const n = quote(sim, give, get, lot);
  if (n < 1) return { ok: false, reason: 'limit' };
  res[give] -= lot;
  res[get] += n;
  const k = M.step * (lot / 100);
  const v = M.value;
  sim.prices[give] = Math.max(v[give] * M.min, sim.prices[give] * (1 - k));
  sim.prices[get] = Math.min(v[get] * M.max, sim.prices[get] * (1 + k));
  sim.traded += lot;
  sim.events.push({ kind: 'traded', give, get, lot, got: n, t: sim.time });
  return { ok: true, id: n };
}

/** Prices drift back toward value (called once a second). */
export function updateExchange(sim: KingdomSim, dt: number): void {
  const M = sim.data.anachak.market;
  const k = Math.min(1, M.recoverPerSec * dt);
  for (const r of GOODS) sim.prices[r] += (M.value[r] - sim.prices[r]) * k;
}

/** Price against value, for the panel: -1 (cheap) .. +1 (dear). */
export function trend(sim: KingdomSim, r: Resource): number {
  const v = sim.data.anachak.market.value[r];
  return Math.max(-1, Math.min(1, (sim.prices[r] - v) / v));
}
