import type { GameEvent, TierName } from './schemas';
import type { TempleProgress } from './rules';
import type { SlotRef } from './kit';

/** One carved stone placed on the temple (or into the stockpile). */
export interface StonePlaced {
  kind: 'stone';
  eventId: string;
  userId: string | null; // null for unnamed like-stones
  name: string | null;
  tier: TierName;
  /** Number of stones of this tier (e.g. a combo of 12 Roses sends 12). */
  stones: number;
  units: number;
  applied: number;
  toStockpile: number;
  source: GameEvent['type'];
  /** Where the name is carved on the temple (null: unnamed, or only went to the stockpile). */
  slot: SlotRef | null;
  ts: number;
}

/** Every carved name on the active temple, sent when a client connects (newest last). */
export interface NamesMessage {
  kind: 'names';
  templeId: string;
  names: Array<{ slot: SlotRef; name: string; tier: TierName; userId: string }>;
  ts: number;
}

/** One line in the live feed. Gift combos become one line with ×N when the combo ends (AC-02). */
export interface FeedLine {
  kind: 'feed';
  userId: string;
  name: string;
  action: GameEvent['type'];
  giftName?: string;
  count: number;
  units: number;
  ts: number;
}

export interface BuilderSummary {
  userId: string;
  name: string;
  units: number;
  rankKm: string;
  rankEn: string;
  guild: '1' | '2' | '3' | '4' | null;
}

/**
 * Build = the automatic temple loop; expedition = the host plays in the Kulen jungle (D28);
 * kingdom = Khmer Kingdoms, the RTS tab (D46); anachak = Anachak Khmer, the same game with the
 * levy, the royal roads and the 3D hero mode (D92).
 */
export type GameMode = 'build' | 'expedition' | 'kingdom' | 'anachak';
export const GAME_MODES: readonly GameMode[] = ['build', 'expedition', 'kingdom', 'anachak'];

export interface GameState {
  kind: 'state';
  mode: GameMode;
  temple: TempleProgress & { km: string; en: string; year: string; king: string; order: number };
  topTemple: BuilderSummary[];
  topToday: BuilderSummary[];
  guilds: Record<'1' | '2' | '3' | '4', number>;
  likesToday: number;
  /** Gifts received today (each gift in a combo counts). */
  giftsToday: number;
  paused: boolean;
  ts: number;
}

export interface StatusMessage {
  kind: 'status';
  source: 'simulator' | 'tiktok' | 'tikfinity';
  connection: 'connected' | 'reconnecting' | 'offline';
  queue: number;
  dropped: number;
  ts: number;
}

export interface CommandMessage {
  kind: 'command';
  name: 'myStone' | 'guildJoined' | 'welcome' | 'safeZones' | 'pause' | 'resume' | 'heroVote' | 'kingdom';
  userId?: string;
  displayName?: string;
  guild?: '1' | '2' | '3' | '4';
  /** Expedition hero vote (1 warrior, 2 sage, 3 rider), or the Kingdom council vote. */
  choice?: 1 | 2 | 3;
  /** Kingdom host control: save, load or new (with a difficulty). */
  op?: 'save' | 'load' | 'new';
  difficulty?: 'easy' | 'normal' | 'hard' | 'expert';
  on?: boolean;
  ts: number;
}

/** Everything the bridge sends to the game and host panel. */
export type BridgeMessage =
  StonePlaced | FeedLine | GameState | StatusMessage | CommandMessage | NamesMessage;

/** Messages the host panel sends to the bridge. */
export type HostMessage =
  | { kind: 'simulate'; event: unknown }
  | { kind: 'control'; action: 'pause' | 'resume' | 'resetTemple' | 'skipTo99' | 'newStream' }
  | { kind: 'control'; action: 'safeZones'; on: boolean }
  | { kind: 'control'; action: 'removeName'; userId: string }
  | { kind: 'control'; action: 'setMode'; mode: GameMode }
  | {
      kind: 'control';
      action: 'kingdom';
      op: 'save' | 'load' | 'new';
      difficulty?: 'easy' | 'normal' | 'hard' | 'expert';
    };
