import type { KingdomData } from '@temples/shared';
import { PLAYER, type Building, type KingdomSim } from '../sim/sim';

/**
 * PK 2026-10-20 (D160): "change progress from light effects to a progress bar on the top of the
 * roofs instead, with pending items". Over every building of the player's that is going up,
 * training people or studying, a bar stands above its roof: how far the work is, what it is,
 * and what waits after it (the queue, by kind and count) — or, for a building going up, how many
 * builders are on it. The blue light columns are gone; the gold "finished" flash and the amber
 * "lumber camp full" light stay (view/alerts.ts).
 */

export interface RoofBar {
  id: number;
  x: number;
  z: number;
  /** World height of the roof top (m), from the drawn model. */
  y: number;
  /** 0–1 of the work in hand. */
  frac: number;
  /** What is in hand: building it, or the unit / study at the head of the queue. */
  km: string;
  en: string;
  /** What waits after it, in queue order, same kinds together. */
  pending: Array<{ km: string; en: string; n: number }>;
  /** A building going up: builders at work on it now. */
  builders?: number;
}

/** Same kinds next to each other, counted (a queue of spear, spear, archer → spear ×2, archer). */
function grouped(items: Array<{ km: string; en: string }>): Array<{ km: string; en: string; n: number }> {
  const out: Array<{ km: string; en: string; n: number }> = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.en === it.en) last.n++;
    else out.push({ ...it, n: 1 });
  }
  return out;
}

const NO_BAR = new Set(['riceField', 'monument']);

/** Every bar to draw, for the player's buildings with work in hand. */
export function roofBars(sim: KingdomSim, roofY: (type: string) => number): RoofBar[] {
  const D: KingdomData = sim.data;
  const name = (kind: 'unit' | 'tech', id: string) => {
    const d = kind === 'unit' ? D.units[id] : D.techs[id];
    return { km: d?.km ?? id, en: d?.en ?? id };
  };
  const builders = new Map<number, number>();
  for (const u of sim.units.values())
    if (u.team === PLAYER && u.task.kind === 'build')
      builders.set(u.task.building, (builders.get(u.task.building) ?? 0) + 1);
  const out: RoofBar[] = [];
  for (const b of sim.buildings.values()) {
    if (b.team !== PLAYER || NO_BAR.has(b.type) || b.temple) continue;
    const [x, z] = sim.center(b);
    const y = roofY(b.type) + 1.2;
    if (b.progress < 1) {
      const d = D.buildings[b.type];
      out.push({
        id: b.id,
        x,
        z,
        y,
        frac: b.progress,
        km: `សាងសង់${d?.km ? ` ${d.km}` : ''}`,
        en: `Building${d?.en ? ` ${d.en}` : ''}`,
        pending: [],
        builders: builders.get(b.id) ?? 0,
      });
      continue;
    }
    const q = b.queue[0];
    if (!q) continue;
    out.push({
      id: b.id,
      x,
      z,
      y,
      frac: Math.max(0, Math.min(1, 1 - q.left / q.total)),
      ...name(q.kind, q.id),
      pending: grouped(b.queue.slice(1).map((it) => name(it.kind, it.id))),
    });
  }
  return out;
}

/** Is this building busy with work that now shows as a roof bar (not as a light)? */
export function hasRoofBar(b: Building): boolean {
  return b.team === PLAYER && !NO_BAR.has(b.type) && !b.temple && (b.progress < 1 || b.queue.length > 0);
}
