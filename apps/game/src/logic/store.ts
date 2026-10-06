import type {
  BridgeMessage,
  CommandMessage,
  FeedLine,
  GameState,
  NamesMessage,
  SlotRef,
  StatusMessage,
  StonePlaced,
  TierName,
} from '@temples/shared';

export interface CarvedName {
  name: string;
  tier: TierName;
  userId: string;
}

export interface Toast {
  id: number;
  name: string;
  units: number;
  tier: TierName;
  at: number;
}

export interface GameModel {
  connected: boolean;
  state: GameState | null;
  status: StatusMessage | null;
  /** key = "normal:12" / "big:3" */
  names: Map<string, CarvedName>;
  feed: FeedLine[];
  toasts: Toast[];
  safeZones: boolean;
  paused: boolean;
}

export const slotKey = (s: SlotRef) => `${s.kind}:${s.index}`;

export function emptyModel(): GameModel {
  return {
    connected: false,
    state: null,
    status: null,
    names: new Map(),
    feed: [],
    toasts: [],
    safeZones: false,
    paused: false,
  };
}

let toastId = 0;

/**
 * Pure reducer: apply one bridge message to the model (prompt 07).
 * Returns the same model object, mutated, plus what changed — so the renderer and UI
 * can react without re-reading everything.
 */
export function reduce(
  m: GameModel,
  msg: BridgeMessage,
  now: number,
): { stone?: StonePlaced; command?: CommandMessage; stateChanged?: boolean; namesReset?: boolean } {
  switch (msg.kind) {
    case 'state': {
      const templeChanged = m.state?.temple.templeId !== msg.temple.templeId;
      m.state = msg;
      m.paused = msg.paused;
      if (templeChanged) m.names.clear();
      return { stateChanged: true };
    }
    case 'names':
      applyNames(m, msg);
      return { namesReset: true };
    case 'status':
      m.status = msg;
      return {};
    case 'feed':
      m.feed.unshift(msg);
      m.feed.length = Math.min(m.feed.length, 4);
      return {};
    case 'stone':
      if (msg.slot && msg.name && msg.userId) {
        m.names.set(slotKey(msg.slot), { name: msg.name, tier: msg.tier, userId: msg.userId });
      }
      if (msg.name) {
        m.toasts.push({ id: ++toastId, name: msg.name, units: msg.units, tier: msg.tier, at: now });
        m.toasts = m.toasts.filter((t) => now - t.at < 4000).slice(-3);
      }
      return { stone: msg };
    case 'command':
      if (msg.name === 'safeZones') m.safeZones = Boolean(msg.on);
      if (msg.name === 'pause') m.paused = true;
      if (msg.name === 'resume') m.paused = false;
      return { command: msg };
  }
}

function applyNames(m: GameModel, msg: NamesMessage): void {
  m.names.clear();
  for (const n of msg.names) m.names.set(slotKey(n.slot), { name: n.name, tier: n.tier, userId: n.userId });
}

/** Biggest carved stone of a viewer, for "!mystone". */
export function biggestStoneOf(m: GameModel, userId: string): SlotRef | null {
  const rank: Record<TierName, number> = { small: 0, medium: 1, large: 2, huge: 3 };
  let best: { ref: SlotRef; r: number } | null = null;
  for (const [key, v] of m.names) {
    if (v.userId !== userId) continue;
    const [kind, index] = key.split(':') as ['normal' | 'big', string];
    const r = rank[v.tier] + (kind === 'big' ? 10 : 0);
    if (!best || r >= best.r) best = { ref: { kind, index: Number(index) }, r };
  }
  return best?.ref ?? null;
}

/** The newest distinct carved names, newest first (for the carving yard). */
export function newestNames(names: Map<string, CarvedName>, n: number): string[] {
  const out: string[] = [];
  for (const v of [...names.values()].reverse()) {
    if (!out.includes(v.name)) out.push(v.name);
    if (out.length >= n) break;
  }
  return out;
}
