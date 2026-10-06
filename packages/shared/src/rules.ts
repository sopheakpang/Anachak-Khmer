import type { GameEvent, GiftMap, TemplesConfig, TierName } from './schemas';

/** Tier of one gift by its coin value (spec: Stone tiers). Unknown gifts work because only coins matter (AC-04). */
export function tierForCoins(coins: number, map: GiftMap): TierName {
  let tier: TierName = 'small';
  for (const t of map.tiers) if (coins >= t.minCoins) tier = t.name;
  return tier;
}

/** Tier of the stone an event places, or null when the event places no stone. */
export function tierForEvent(event: GameEvent, map: GiftMap): TierName | null {
  switch (event.type) {
    case 'gift':
      return tierForCoins(event.giftCoins ?? 0, map);
    case 'like':
    case 'follow':
    case 'share':
      return 'small';
    default:
      return null;
  }
}

/** Progress units an event is worth, before caps (spec: Actions). */
export function unitsFor(event: GameEvent, map: GiftMap): number {
  const u = map.units;
  switch (event.type) {
    case 'like':
      return u.like * event.count;
    case 'follow':
      return u.follow;
    case 'share':
      return u.share;
    case 'gift':
      return (event.giftCoins ?? 0) * event.count * u.giftMultiplier;
    case 'comment':
      return u.comment;
    case 'join':
      return u.join;
  }
}

export interface TempleProgress {
  templeId: string;
  target: number;
  progress: number;
  stockpile: number;
  completed: boolean;
}

export interface ApplyResult {
  state: TempleProgress;
  applied: number;
  toStockpile: number;
}

/**
 * Add one event's units to the active temple (spec: Caps and balance, AC-07).
 * One event moves the temple at most `perEventTempleShare` of its target; the rest,
 * and anything past 100%, goes to the Kulen stockpile. Nothing is lost.
 */
export function applyToTemple(state: TempleProgress, units: number, map: GiftMap): ApplyResult {
  if (units <= 0) return { state, applied: 0, toStockpile: 0 };
  const cap = Math.max(1, Math.floor(state.target * map.caps.perEventTempleShare));
  const room = state.completed ? 0 : state.target - state.progress;
  const applied = Math.min(units, cap, room);
  const toStockpile = units - applied;
  const progress = state.progress + applied;
  return {
    applied,
    toStockpile,
    state: {
      ...state,
      progress,
      stockpile: state.stockpile + toStockpile,
      completed: progress >= state.target,
    },
  };
}

/** Target of a temple: base x size (spec: Caps and balance). */
export function templeTarget(templeId: string, temples: TemplesConfig): number {
  const t = temples.temples.find((x) => x.id === templeId);
  if (!t) throw new Error(`Unknown temple: ${templeId}`);
  return Math.round(temples.baseTarget * t.size);
}

/**
 * Start a temple, feeding it from the stockpile. The stockpile may fill at most
 * `stockpileMaxStartShare` of the new temple so every round still needs the room.
 */
export function startTemple(
  templeId: string,
  stockpile: number,
  temples: TemplesConfig,
  map: GiftMap,
): TempleProgress {
  const target = templeTarget(templeId, temples);
  const fromStock = Math.min(stockpile, Math.floor(target * map.caps.stockpileMaxStartShare));
  return { templeId, target, progress: fromStock, stockpile: stockpile - fromStock, completed: false };
}

/** Lifetime rank (spec: Recognition). */
export function rankFor(lifetimeUnits: number, map: GiftMap): { km: string; en: string; level: number } {
  let level = 0;
  map.ranks.forEach((r, i) => {
    if (lifetimeUnits >= r.minUnits) level = i;
  });
  const r = map.ranks[level]!;
  return { km: r.km, en: r.en, level };
}

/** Parse a comment: guild join ("1"–"4") or a "!mystone" command. */
export function parseComment(
  text: string,
  map: GiftMap,
):
  | { kind: 'guild'; guild: '1' | '2' | '3' | '4' }
  | { kind: 'myStone' }
  | { kind: 'heroVote'; choice: 1 | 2 | 3 }
  | null {
  const t = text.trim().toLowerCase();
  // Expedition hero vote: !1 !2 !3 (Khmer digits too).
  const vote = /^!\s*([1-3១-៣])$/.exec(t);
  if (vote)
    return {
      kind: 'heroVote',
      choice: ('123'.includes(vote[1]!) ? Number(vote[1]) : '១២៣'.indexOf(vote[1]!) + 1) as 1 | 2 | 3,
    };
  if (t === '1' || t === '2' || t === '3' || t === '4') return { kind: 'guild', guild: t };
  if (map.commands.myStone.some((c) => t === c.toLowerCase())) return { kind: 'myStone' };
  return null;
}
