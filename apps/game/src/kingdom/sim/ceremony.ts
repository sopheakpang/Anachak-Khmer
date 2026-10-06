import type { KingdomSim } from './sim';

/**
 * Royal ceremonies (PK): the king holds them by himself, one every `everySec` game seconds,
 * to build his royal power (ព្រះបារមី). Each is from the record (rules.json `ceremonies`):
 * the devaraja rite, royal consecration, a temple's consecration, and the festivals Zhou
 * Daguan saw at Angkor. While one lasts the people gather and build a little faster.
 */

export type CeremonyDef = KingdomSim['data']['rules']['ceremonies']['list'][number];

/** The ceremonies this era allows, in their order. */
export function ceremoniesFor(sim: KingdomSim): CeremonyDef[] {
  return sim.data.rules.ceremonies.list.filter((c) => !c.eras || c.eras.includes(sim.era.id));
}

/** The ceremony under way now, if any. */
export function currentCeremony(sim: KingdomSim): CeremonyDef | null {
  const c = sim.ceremony;
  if (!c || sim.time >= c.until) return null;
  return sim.data.rules.ceremonies.list.find((x) => x.id === c.id) ?? null;
}

/** Once a second: start the next ceremony when its time comes. */
export function updateCeremonies(sim: KingdomSim): void {
  const C = sim.data.rules.ceremonies;
  if (sim.ceremonyAt < 0) sim.ceremonyAt = sim.time + C.firstSec;
  if (sim.time < sim.ceremonyAt || sim.outcome) return;
  const list = ceremoniesFor(sim);
  if (!list.length) return;
  const def = list[sim.ceremoniesHeld % list.length]!;
  sim.ceremoniesHeld++;
  sim.ceremony = { id: def.id, until: sim.time + C.durSec };
  sim.prestige += def.prestige;
  sim.ceremonyAt = sim.time + C.everySec;
  sim.events.push({ kind: 'ceremony', id: def.id, t: sim.time });
}

/** The ceremony's lift to gathering or building (1 when none). */
export function ceremonyBuff(sim: KingdomSim, kind: 'gather' | 'build'): number {
  return currentCeremony(sim) ? sim.data.rules.ceremonies.buff[kind] : 1;
}
