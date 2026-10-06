/**
 * Edge scrolling (PK, 1.6.0): when the mouse goes to the edge of the window, the map follows
 * it. The cursor is tracked at window level, so the pan keeps going while it is over a HUD
 * panel or the letterbox bars beside the 16:9 stage; it stops only when the mouse leaves the
 * window (or the window loses focus).
 */
export interface EdgeScrollCfg {
  enabled: boolean;
  /** The band at each edge, in screen (CSS) pixels. */
  marginPx: number;
  /** The pan at the band's inner edge, as a share of the full (arrow-key) speed. */
  minSpeed: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** -1..1 on each screen axis: how hard the map pans toward the cursor's edge. */
export function edgePan(
  cursor: { x: number; y: number } | null,
  win: { width: number; height: number },
  stage: Box,
  cfg: EdgeScrollCfg,
): { px: number; pz: number } {
  if (!cfg.enabled || !cursor) return { px: 0, pz: 0 };
  const m = cfg.marginPx;
  // The edge is the nearer of the window's edge and the stage's edge (letterboxed stage).
  const left = Math.max(0, stage.left) + m;
  const right = Math.min(win.width, stage.right) - m;
  const top = Math.max(0, stage.top) + m;
  const bottom = Math.min(win.height, stage.bottom) - m;
  const axis = (v: number, lo: number, hi: number): number => {
    const k = (d: number) => cfg.minSpeed + (1 - cfg.minSpeed) * Math.min(1, Math.max(0, d / m));
    if (v < lo) return -k(lo - v);
    if (v > hi) return k(v - hi);
    return 0;
  };
  return { px: axis(cursor.x, left, right), pz: axis(cursor.y, top, bottom) };
}
