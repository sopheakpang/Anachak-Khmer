/**
 * Full screen (PK 1.8.0): the ⛶ button (and F11) makes the game fill the whole monitor, so the
 * 1920×1080 Kingdom stage is shown at its own size on a 1080p screen, with no browser bars.
 * The stage already scales itself to the window (stage.ts), so nothing else has to change.
 */

/** The parts of `document` used here (a fake one in the tests). */
export interface FullscreenDoc {
  fullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  documentElement: { requestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
  exitFullscreen?: () => Promise<void>;
}

/** Can this browser go full screen? (Not on the iPhone, which only allows it for video.) */
export function canFullscreen(doc: FullscreenDoc = document): boolean {
  return !!doc.fullscreenEnabled && typeof doc.documentElement.requestFullscreen === 'function';
}

export function isFullscreen(doc: FullscreenDoc = document): boolean {
  return !!doc.fullscreenElement;
}

/**
 * Go full screen, or back. Must run inside a click or key press (browser rule). Returns
 * whether the game will be full screen afterwards; a refusal leaves it as it was.
 */
export async function toggleFullscreen(doc: FullscreenDoc = document): Promise<boolean> {
  if (!canFullscreen(doc)) return false;
  try {
    if (isFullscreen(doc)) {
      await doc.exitFullscreen?.();
      return false;
    }
    await doc.documentElement.requestFullscreen!({ navigationUI: 'hide' });
    return true;
  } catch {
    return isFullscreen(doc);
  }
}
