import {
  type GameMode,
  cleanName,
  GameEventSchema,
  assignSlot,
  kitFor,
  parseComment,
  tierForEvent,
  unitsFor,
  type BridgeMessage,
  type Configs,
  type GameEvent,
  type GameState,
  type TierName,
} from '@temples/shared';
import { dayKey, type Guild, type WorldStore } from './store';

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}
export const silentLogger: Logger = { info() {}, warn() {} };

interface LikeBatch {
  userId: string;
  name: string;
  handle?: string;
  count: number;
  first: number;
}
interface Combo {
  userId: string;
  name: string;
  giftName: string;
  count: number;
  units: number;
  last: number;
}

/**
 * Turns raw source events into game messages (spec: Core loop; prompt 04).
 * validate → dedupe → likes batched per user → per-user limits → units/tier → temple → messages.
 * Time is passed in (`now`) so every rule is testable without waiting.
 */
export class Pipeline {
  private queue: GameEvent[] = [];
  private seen = new Set<string>();
  private seenOrder: string[] = [];
  private likes = new Map<string, LikeBatch>();
  private combos = new Map<string, Combo>();
  private followed = new Set<string>();
  private shareAt = new Map<string, number>();
  private myStoneAt = new Map<string, number>();
  private myStoneGlobalAt = -Infinity;
  private guildChanges = new Map<string, number>();
  private joins = 0;
  private dirty = true;
  private lastStateAt = -Infinity;
  paused = false;
  dropped = 0;
  invalid = 0;

  constructor(
    private readonly configs: Configs,
    private readonly store: WorldStore,
    private readonly blocklist: string[],
    private readonly emit: (m: BridgeMessage) => void,
    private readonly log: Logger = silentLogger,
  ) {}

  get queueLength(): number {
    return this.queue.length;
  }

  /** Accept a raw event from any source. Invalid events are logged and dropped (AC-05). */
  enqueue(raw: unknown): boolean {
    const parsed = GameEventSchema.safeParse(raw);
    if (!parsed.success) {
      this.invalid++;
      this.log.warn('invalid event dropped', {
        issues: parsed.error.issues.slice(0, 3).map((i) => i.message),
      });
      return false;
    }
    const e = parsed.data;
    if (this.isDuplicate(e.id)) return false; // AC-03
    if (e.type === 'like') {
      this.addLike(e);
      return true;
    }
    if (this.queue.length >= this.configs.giftMap.queue.max && e.type !== 'gift') {
      // Queue full: gifts are never dropped; other actions are (logged).
      this.dropped++;
      this.log.warn('queue full, dropped', { type: e.type });
      return false;
    }
    this.queue.push(e);
    return true;
  }

  /** Process queued events and due batches. Call every ~50 ms. */
  tick(now: number): void {
    const n = Math.min(this.queue.length, this.configs.giftMap.queue.drainPerTick);
    for (const e of this.queue.splice(0, n)) this.process(e, now);
    this.flushLikes(now, false);
    this.flushCombos(now, false);
    if (this.dirty && now - this.lastStateAt >= 250) this.emitState(now);
  }

  /** New stream: per-stream limits reset (follow once, guild changes, like milestones). */
  newStream(): void {
    this.followed.clear();
    this.guildChanges.clear();
    this.shareAt.clear();
    this.myStoneAt.clear();
    this.joins = 0;
    this.dirty = true;
  }

  /** Build or expedition (D28), saved across restarts. */
  get mode(): GameMode {
    const m = this.store.getMeta('mode');
    return m === 'expedition' || m === 'kingdom' || m === 'anachak' ? m : 'build';
  }

  setMode(mode: GameMode): void {
    this.store.setMeta('mode', mode);
    this.dirty = true;
  }

  setPaused(p: boolean, now: number): void {
    this.paused = p;
    this.emit({ kind: 'command', name: p ? 'pause' : 'resume', ts: now });
    this.dirty = true;
  }

  /** Force a full state message (e.g. when a client connects). */
  state(now: number): GameState {
    const p = this.store.progress();
    const t = this.configs.temples.temples.find((x) => x.id === p.templeId)!;
    const day = dayKey(now);
    return {
      kind: 'state',
      mode: this.mode,
      temple: { ...p, km: t.km, en: t.en, year: t.year, king: t.king, order: t.order },
      topTemple: this.store.top('temple', 5, day),
      topToday: this.store.top('today', 5, day),
      guilds: this.store.guildTotals(p.templeId),
      likesToday: this.store.likes(day),
      giftsToday: Number(this.store.getMeta(`gifts:${day}`)) || 0,
      paused: this.paused,
      ts: now,
    };
  }

  /** All carved names on the active temple (sent to clients on connect). */
  names(now: number): BridgeMessage {
    const templeId = this.store.progress().templeId;
    return { kind: 'names', templeId, names: this.store.namedSlots(templeId, 400), ts: now };
  }

  markDirty(): void {
    this.dirty = true;
  }

  // ---------- internals ----------

  private emitState(now: number): void {
    this.emit(this.state(now));
    this.lastStateAt = now;
    this.dirty = false;
  }

  private isDuplicate(id: string): boolean {
    if (this.seen.has(id)) return true;
    this.seen.add(id);
    this.seenOrder.push(id);
    if (this.seenOrder.length > 10_000) this.seen.delete(this.seenOrder.shift()!);
    return false;
  }

  private display(e: GameEvent): string {
    return cleanName(e.user.name, e.user.handle, this.configs.giftMap, this.blocklist).display;
  }

  private addLike(e: GameEvent): void {
    const b = this.likes.get(e.user.id);
    if (b) b.count += e.count;
    else
      this.likes.set(e.user.id, {
        userId: e.user.id,
        name: this.display(e),
        ...(e.user.handle ? { handle: e.user.handle } : {}),
        count: e.count,
        first: e.ts,
      });
  }

  private flushLikes(now: number, all: boolean): void {
    const wait = this.configs.giftMap.limits.likeBatchMs;
    for (const [id, b] of this.likes) {
      if (!all && now - b.first < wait) continue;
      this.likes.delete(id);
      const units = b.count * this.configs.giftMap.units.like;
      this.place(
        {
          id: `like-${id}-${now}`,
          userId: b.userId,
          name: null,
          tier: 'small',
          stones: b.count,
          units,
          source: 'like',
        },
        now,
      );
      this.contribute(b.userId, b.name, b.handle, units, 'like', now);
      this.store.addLikes(dayKey(now), b.count);
      this.emit({
        kind: 'feed',
        userId: b.userId,
        name: b.name,
        action: 'like',
        count: b.count,
        units,
        ts: now,
      });
    }
  }

  private flushCombos(now: number, all: boolean): void {
    const idle = this.configs.giftMap.limits.comboIdleMs;
    for (const [key, c] of this.combos) {
      if (!all && now - c.last < idle) continue;
      this.combos.delete(key);
      this.emitGiftFeed(c, now);
    }
  }

  private emitGiftFeed(c: Combo, now: number): void {
    this.emit({
      kind: 'feed',
      userId: c.userId,
      name: c.name,
      action: 'gift',
      giftName: c.giftName,
      count: c.count,
      units: c.units,
      ts: now,
    });
  }

  private process(e: GameEvent, now: number): void {
    const L = this.configs.giftMap.limits;
    const name = this.display(e);
    switch (e.type) {
      case 'follow': {
        if (L.followOncePerStream && this.followed.has(e.user.id)) return; // AC-08
        this.followed.add(e.user.id);
        break;
      }
      case 'share': {
        const last = this.shareAt.get(e.user.id);
        if (last !== undefined && now - last < L.shareCooldownSec * 1000) return;
        this.shareAt.set(e.user.id, now);
        break;
      }
      case 'join': {
        this.joins++;
        if (this.joins % L.joinShowEvery === 1 || L.joinShowEvery === 1) {
          this.emit({ kind: 'command', name: 'welcome', userId: e.user.id, displayName: name, ts: now });
        }
        return;
      }
      case 'comment': {
        this.handleComment(e, name, now);
        return;
      }
      case 'gift':
      case 'like':
        break;
    }

    const units = unitsFor(e, this.configs.giftMap);
    const tier = tierForEvent(e, this.configs.giftMap) ?? 'small';
    this.place(
      {
        id: e.id,
        userId: e.user.id,
        name,
        tier,
        stones: e.type === 'gift' ? e.count : 1,
        units,
        source: e.type,
      },
      now,
    );
    this.contribute(e.user.id, name, e.user.handle, units, e.type, now);

    if (e.type === 'gift') {
      // Gifts received today (shown as a resource counter at the top of the Build tab).
      const day = dayKey(now);
      const giftsKey = `gifts:${day}`;
      this.store.setMeta(
        giftsKey,
        String((Number(this.store.getMeta(giftsKey)) || 0) + Math.max(1, e.count || 1)),
      );
      this.dirty = true;
      const giftName = e.giftName ?? 'Gift';
      const key = `${e.user.id}|${giftName}`;
      const c = this.combos.get(key) ?? { userId: e.user.id, name, giftName, count: 0, units: 0, last: now };
      c.count += e.count;
      c.units += units;
      c.last = now;
      if (e.comboEnd === false) {
        this.combos.set(key, c); // streak continues: one feed line at the end (AC-02)
      } else {
        this.combos.delete(key);
        this.emitGiftFeed(c, now);
      }
    } else {
      this.emit({ kind: 'feed', userId: e.user.id, name, action: e.type, count: e.count, units, ts: now });
    }
  }

  private handleComment(e: GameEvent, name: string, now: number): void {
    const cmd = parseComment(e.text ?? '', this.configs.giftMap);
    if (!cmd) return;
    const L = this.configs.giftMap.limits;
    if (cmd.kind === 'heroVote') {
      // Hero vote (Expedition) or council vote (Kingdom); the game counts one vote per viewer.
      if (this.mode === 'build') return;
      this.emit({
        kind: 'command',
        name: 'heroVote',
        userId: e.user.id,
        displayName: name,
        choice: cmd.choice,
        ts: now,
      });
      return;
    }
    if (cmd.kind === 'guild') {
      const current = this.store.guildOf(e.user.id);
      if (current === cmd.guild) return;
      if (current !== null) {
        const used = this.guildChanges.get(e.user.id) ?? 0;
        if (used >= L.guildChangesPerStream) return;
        this.guildChanges.set(e.user.id, used + 1);
      }
      this.store.setGuild(e.user.id, cmd.guild as Guild);
      this.emit({
        kind: 'command',
        name: 'guildJoined',
        userId: e.user.id,
        displayName: name,
        guild: cmd.guild,
        ts: now,
      });
      this.dirty = true;
      return;
    }
    const last = this.myStoneAt.get(e.user.id);
    if (last !== undefined && now - last < L.myStoneUserCooldownSec * 1000) return;
    if (now - this.myStoneGlobalAt < L.myStoneGlobalCooldownSec * 1000) return;
    this.myStoneAt.set(e.user.id, now);
    this.myStoneGlobalAt = now;
    this.emit({ kind: 'command', name: 'myStone', userId: e.user.id, displayName: name, ts: now });
  }

  private place(
    p: {
      id: string;
      userId: string | null;
      name: string | null;
      tier: TierName;
      stones: number;
      units: number;
      source: GameEvent['type'];
    },
    now: number,
  ): void {
    const before = this.store.progress();
    const r = this.store.applyUnits(p.units);
    const kit = kitFor(before.templeId);
    const slot =
      kit && p.userId && p.name
        ? assignSlot(
            kit,
            before.target,
            before.progress,
            r.state.progress,
            p.tier,
            this.store.bigUsed(before.templeId),
          )
        : null;
    this.store.addStone({
      templeId: r.state.templeId,
      userId: p.userId,
      name: p.name,
      tier: p.tier,
      stones: p.stones,
      units: p.units,
      slot,
      ts: now,
    });
    this.emit({
      kind: 'stone',
      eventId: p.id,
      userId: p.userId,
      name: p.name,
      tier: p.tier,
      stones: p.stones,
      units: p.units,
      applied: r.applied,
      toStockpile: r.toStockpile,
      source: p.source,
      slot,
      ts: now,
    });
    this.dirty = true;
  }

  private contribute(
    userId: string,
    name: string,
    handle: string | undefined,
    units: number,
    kind: string,
    now: number,
  ): void {
    if (units <= 0) return;
    this.store.addContribution({ userId, name, ...(handle ? { handle } : {}), units, kind, ts: now });
  }
}
