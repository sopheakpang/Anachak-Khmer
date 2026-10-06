import type { Resource } from '@temples/shared';
import { PLAYER, type KingdomSim, type Unit } from './sim';

/**
 * The king's decree (PK): "everyone works for the temple until it stands". While it holds,
 * every few seconds the villagers are set to work: before the foundation is laid they gather
 * what the temple still lacks, in proportion to the shortfall; when enough is in the store the
 * foundation is laid on the temple's site; then builders go to it and the rest keep the store
 * full. Farmers stay on their fields (the kingdom must eat). Rules: rules.json `decree`.
 */

/** What the temple still lacks in the store (zero for what is enough). */
export function templeShortfall(sim: KingdomSim): Partial<Record<Resource, number>> {
  const cost = sim.data.buildings.monument?.cost ?? {};
  const have = sim.res[PLAYER];
  const out: Partial<Record<Resource, number>> = {};
  for (const [r, n] of Object.entries(cost)) {
    const short = (n ?? 0) - have[r as Resource];
    if (short > 0) out[r as Resource] = short;
  }
  return out;
}

const working = (sim: KingdomSim): Unit[] =>
  [...sim.units.values()].filter(
    (u) =>
      u.team === PLAYER &&
      sim.def(u.type).gather &&
      u.fleeUntil === undefined &&
      !u.manual &&
      !(u.task.kind === 'gather' && u.task.field !== null && sim.data.rules.decree.keepFarmers),
  );

export function runDecree(sim: KingdomSim): void {
  if (sim.decree !== 'temple' || sim.outcome) return;
  const D = sim.data.rules.decree;
  const reach = Infinity; // the decree sends people as far as the temple needs
  const people = working(sim);
  if (!people.length) return;
  let site = sim.currentTemple();
  if (site && site.progress >= 1) return;
  // First what the temple needs built before it (a storehouse): lay it out and build it.
  if (!site) {
    for (const req of sim.data.buildings.monument?.requires ?? []) {
      if (sim.hasBuilt(req)) continue;
      let b = [...sim.buildings.values()].find((x) => x.team === PLAYER && x.type === req);
      const crew = people.slice(0, 3);
      if (!b) {
        const hall = [...sim.buildings.values()].find((x) => x.team === PLAYER && x.type === 'townCentre');
        if (!hall || !sim.canAfford(sim.data.buildings[req]!.cost)) break;
        for (let r = 6; r < 30 && !b; r++)
          for (let k = 0; k < 12 && !b; k++) {
            const tx = Math.round(hall.tx + Math.cos((k / 12) * Math.PI * 2) * r);
            const tz = Math.round(hall.tz + Math.sin((k / 12) * Math.PI * 2) * r);
            const res = sim.place(
              req,
              tx,
              tz,
              crew.map((u) => u.id),
            );
            if (res.ok) b = sim.buildings.get(res.id);
          }
      }
      if (b)
        for (const u of crew)
          if (!(u.task.kind === 'build' && u.task.building === b.id)) {
            u.task = { kind: 'build', building: b.id };
            u.path = null;
          }
      break;
    }
  }
  const short = templeShortfall(sim);
  if (!site && Object.keys(short).length === 0) {
    // Enough in the store: lay the foundation on the temple's site.
    const [tx, tz] = sim.monumentSpot();
    const r = sim.place(
      'monument',
      tx,
      tz,
      people.slice(0, D.maxBuilders).map((u) => u.id),
    );
    if (r.ok) sim.events.push({ kind: 'decree', what: 'founded', t: sim.time });
    site = sim.currentTemple();
    if (!site) return;
  }
  if (site) {
    // Builders to the temple; the rest gather what is lowest in the store.
    const building = people.filter((u) => u.task.kind === 'build' && u.task.building === site!.id);
    for (const u of people) {
      if (building.length >= D.maxBuilders) break;
      if (building.includes(u)) continue;
      u.task = { kind: 'build', building: site.id };
      u.path = null;
      building.push(u);
    }
    return;
  }
  // Gather what the temple lacks, in proportion to each shortfall.
  const total = Object.values(short).reduce((a, b) => a + (b ?? 0), 0);
  const quota = new Map<Resource, number>();
  for (const [r, n] of Object.entries(short))
    quota.set(r as Resource, Math.ceil((people.length * (n ?? 0)) / total));
  const free: Unit[] = [];
  for (const u of people) {
    if (u.task.kind === 'build') continue; // building what the temple needs first
    const r = u.task.kind === 'gather' ? u.task.res : null;
    const left = r ? (quota.get(r) ?? 0) : 0;
    if (r && left > 0) quota.set(r, left - 1);
    else free.push(u);
  }
  // Smallest shortfalls first, so every lacking resource gets someone.
  for (const u of free)
    for (const [r, left] of [...quota].sort((a, b) => a[1] - b[1])) {
      if (left <= 0) continue;
      const job = sim.gatherJob(u, r, reach);
      if (!job) continue;
      u.task = job;
      u.path = null;
      quota.set(r, left - 1);
      break;
    }
}
