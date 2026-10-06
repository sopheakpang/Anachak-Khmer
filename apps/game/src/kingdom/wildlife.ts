import type { AnimalKind } from '@temples/shared';

/**
 * The hover-tip lines for a wild animal's behaviour (Cambodian wildlife, D75), in Khmer
 * and English: dangerous predators, animals that fight back, shy ones, night animals.
 * Fixed text only (no config strings), so it needs no escaping.
 */
export function animalTraits(k: AnimalKind): string {
  const out: string[] = [];
  if (k.behaviour === 'predator')
    out.push('<span class="k-need">គ្រោះថ្នាក់! វាយប្រហារមនុស្ស · Dangerous: attacks people</span>');
  else if (k.behaviour === 'defensive')
    out.push('<span class="k-need">វាយតបវិញ ពេលគេបរបាញ់ · Fights back when hunted</span>');
  else if (k.behaviour === 'shy') out.push('ខ្មាសមនុស្ស រត់ចេញ · Shy: runs from people');
  if (k.nocturnal) out.push('សត្វរកស៊ីពេលយប់ · Nocturnal');
  return out.map((l) => `<br>${l}`).join('');
}
