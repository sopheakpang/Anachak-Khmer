import type { TierName } from '@temples/shared';

/**
 * Counts stones per tier in the last 60 s (prompt 11: convoys scale with activity).
 * Pure and time-injected so it is testable.
 */
export class Activity {
  private events: Array<{ t: number; tier: TierName; n: number }> = [];

  constructor(private readonly windowMs = 60_000) {}

  add(t: number, tier: TierName, n = 1): void {
    this.events.push({ t, tier, n });
  }

  counts(now: number): Record<TierName, number> {
    const from = now - this.windowMs;
    while (this.events.length && this.events[0]!.t < from) this.events.shift();
    const out: Record<TierName, number> = { small: 0, medium: 0, large: 0, huge: 0 };
    for (const e of this.events) out[e.tier] += e.n;
    return out;
  }

  /** Convoys to show per transport, between `min` and the preset's cap. */
  convoys(now: number, cap: number): { workers: number; oxcart: number; elephants: number; raft: number } {
    const c = this.counts(now);
    const scale = (n: number, per: number, min: number, max: number) =>
      Math.max(min, Math.min(max, Math.ceil(n / per)));
    return {
      workers: scale(c.small, 5, 2, Math.max(2, Math.floor(cap / 4))),
      oxcart: scale(c.medium, 2, 1, 6),
      elephants: scale(c.large, 1, 1, 6),
      raft: scale(c.huge, 1, 1, 4),
    };
  }
}
