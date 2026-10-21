/**
 * Frame limiter for the stream target (30 FPS locked). Returns whether to render at `now`
 * and the new "last" timestamp. Keeps phase so frames don't drift on 60/144 Hz monitors.
 */
export function paceFrame(now: number, last: number, fps: number): { render: boolean; last: number } {
  const interval = 1000 / fps;
  const elapsed = now - last;
  // 1 ms tolerance: rAF timestamps jitter around the display refresh.
  if (elapsed < interval - 1) return { render: false, last };
  // Inside the tolerance window there is nothing to carry. Past one interval, keep only the
  // remainder so whole missed intervals are skipped instead of bursting to catch up.
  const carry = elapsed >= interval ? elapsed % interval : 0;
  return { render: true, last: now - carry };
}

/** PK 2026-10-21 ("ok all"): the player's frame-rate choice (🖥 Graphics), kept in the browser. */
export const FPS_KEY = 'temples.fps.v1';

/** The frame rate the player chose in the game, if any (storage may be missing or blocked). */
export function storedFps(): 30 | 60 | null {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(FPS_KEY);
    return v === '60' ? 60 : v === '30' ? 30 : null;
  } catch {
    return null;
  }
}

/** Keep the player's choice (false when the browser has no storage). */
export function storeFps(fps: 30 | 60): boolean {
  try {
    localStorage.setItem(FPS_KEY, String(fps));
    return true;
  } catch {
    return false;
  }
}

/**
 * Target FPS: the URL (?fps=30 or ?fps=60, the host's and the tests'), else the player's own
 * choice in 🖥 Graphics, else 30 — the stream's locked rate (D16). Only 30 or 60 are allowed.
 */
export function targetFps(search: string, stored: 30 | 60 | null = storedFps()): 30 | 60 {
  const asked = new URLSearchParams(search).get('fps');
  if (asked === '60') return 60;
  if (asked === '30') return 30;
  return stored ?? 30;
}
