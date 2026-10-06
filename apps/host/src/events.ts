/** Test-event builders for the host panel (prompt 06). Pure functions: easy to test. */

export interface SimUser {
  id: string;
  name: string;
  handle: string;
}

export const TEST_GIFTS = [
  { name: 'Rose', coins: 1 },
  { name: 'Finger Heart', coins: 5 },
  { name: 'Doughnut', coins: 30 },
  { name: 'Hand Hearts', coins: 100 },
  { name: 'Galaxy', coins: 1000 },
  { name: 'Lion', coins: 29999 },
] as const;

/** Mostly Khmer and English viewers, plus a few Thai / emoji names to test the @handle fallback. */
export const TEST_USERS: SimUser[] = [
  { id: 'sim-dara', name: 'Dara', handle: 'dara.kh' },
  { id: 'sim-sokha', name: 'សុខា', handle: 'sokha99' },
  { id: 'sim-sreymom', name: 'ស្រីមុំ', handle: 'sreymom' },
  { id: 'sim-vannak', name: 'Vannak', handle: 'vannak_pp' },
  { id: 'sim-pich', name: 'ពេជ្រ', handle: 'pich.angkor' },
  { id: 'sim-bopha', name: 'Bopha 🌸', handle: 'bopha' },
  { id: 'sim-rithy', name: 'Rithy', handle: 'rithy855' },
  { id: 'sim-kanha', name: 'កញ្ញា', handle: 'kanha' },
  { id: 'sim-nimol', name: 'និមល', handle: 'nimol_' },
  { id: 'sim-chanthy', name: 'Chanthy', handle: 'chanthy' },
  { id: 'sim-somchai', name: 'สมชาย', handle: 'somchai_bkk' },
  { id: 'sim-fire', name: '🔥🔥🔥', handle: 'firefan' },
];

export type SimKind =
  | { type: 'like'; count?: number }
  | { type: 'follow' }
  | { type: 'share' }
  | { type: 'join' }
  | { type: 'comment'; text: string }
  | { type: 'gift'; name: string; coins: number; count?: number; comboEnd?: boolean };

let seq = 0;

/** A normalized event exactly like the TikTok adapter will produce. */
export function makeEvent(kind: SimKind, user: SimUser, now: number): Record<string, unknown> {
  const base = {
    id: `sim-${now}-${++seq}`,
    type: kind.type,
    user: { id: user.id, name: user.name, handle: user.handle },
    ts: now,
    count: 1,
  };
  switch (kind.type) {
    case 'like':
      return { ...base, count: kind.count ?? 1 };
    case 'comment':
      return { ...base, text: kind.text };
    case 'gift':
      return {
        ...base,
        giftName: kind.name,
        giftCoins: kind.coins,
        count: kind.count ?? 1,
        ...(kind.comboEnd === undefined ? {} : { comboEnd: kind.comboEnd }),
      };
    default:
      return base;
  }
}

/** Small seeded random generator so demo runs are repeatable in tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Demo mode: a realistic mix. Most viewers tap likes, some follow/share/chat,
 * few send gifts, and big gifts are rare.
 */
export function demoKind(r: () => number): SimKind {
  const x = r();
  if (x < 0.62) return { type: 'like', count: 1 + Math.floor(r() * 5) };
  if (x < 0.68) return { type: 'join' };
  if (x < 0.71) return { type: 'follow' };
  if (x < 0.73) return { type: 'share' };
  if (x < 0.77) return { type: 'comment', text: String(1 + Math.floor(r() * 4)) };
  if (x < 0.78) return { type: 'comment', text: '!mystone' };
  if (x < 0.9) return { type: 'gift', name: 'Rose', coins: 1 };
  if (x < 0.96) return { type: 'gift', name: 'Finger Heart', coins: 5 };
  if (x < 0.985) return { type: 'gift', name: 'Doughnut', coins: 30 };
  if (x < 0.995) return { type: 'gift', name: 'Hand Hearts', coins: 100 };
  if (x < 0.999) return { type: 'gift', name: 'Galaxy', coins: 1000 };
  return { type: 'gift', name: 'Lion', coins: 29999 };
}

export function pickUser(r: () => number): SimUser {
  return TEST_USERS[Math.floor(r() * TEST_USERS.length)]!;
}

/**
 * Stress mode pacing: how many events are due at `elapsedMs` for a target rate,
 * given how many were already sent. Keeps the total exact over any duration.
 */
export function dueEvents(ratePerMin: number, elapsedMs: number, sent: number): number {
  return Math.max(0, Math.floor((ratePerMin * elapsedMs) / 60_000) - sent);
}

/** Combo test: N Roses as one streak, last one ends the combo (AC-02). */
export function roseCombo(n: number, user: SimUser, now: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) =>
    makeEvent({ type: 'gift', name: 'Rose', coins: 1, comboEnd: i === n - 1 }, user, now + i * 50),
  );
}
