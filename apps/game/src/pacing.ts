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

/** Target FPS from the URL (?fps=60), else 30. Only 30 or 60 are allowed. */
export function targetFps(search: string): 30 | 60 {
  return new URLSearchParams(search).get('fps') === '60' ? 60 : 30;
}
