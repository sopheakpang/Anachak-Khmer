/**
 * The landscape stage in the screen's own shape, whichever way the device is held:
 * long phones get a wider stage (up to 21:9, 2560 × 1080, D72); iPads and other squarer
 * screens a taller one (down to 4:3, 1920 × 1440, D74), so there are no black bars.
 */
export function landscapeSizeFor(w: number, h: number): { width: number; height: number } {
  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
  if (aspect >= 16 / 9) return { width: Math.round(Math.min(2560, 1080 * aspect)), height: 1080 };
  return { width: 1920, height: Math.round(Math.min(1440, 1920 / Math.max(aspect, 4 / 3))) };
}
