import { RENDER_SIZE } from '@temples/shared';

/**
 * The stage is 1080x1920 inside (9:16, Build and Expedition) or 1920x1080 (16:9, the
 * Kingdom tab, D51). It is scaled with CSS to fit the window, so capture software sees
 * the whole picture at any window size.
 */
export type Layout = 'portrait' | 'landscape';
export const LANDSCAPE_SIZE: { width: number; height: number } = { width: 1920, height: 1080 };

/**
 * Widen the 16:9 stage to the screen's own shape (the Android build on 20:9 phones, D72).
 * Call before the Kingdom is built: its camera and HUD read LANDSCAPE_SIZE once.
 */
export function setLandscapeWidth(width: number): void {
  setLandscapeSize(width, LANDSCAPE_SIZE.height);
}

/**
 * Fit the landscape stage to the screen's shape: wider on long phones (D72), taller on
 * iPads (4:3 → 1920 × 1440, D74). Call before the Kingdom is built.
 */
export function setLandscapeSize(width: number, height: number): void {
  LANDSCAPE_SIZE.width = Math.round(width);
  LANDSCAPE_SIZE.height = Math.round(height);
  const root = document.documentElement.style;
  root.setProperty('--landscape-w', `${LANDSCAPE_SIZE.width}px`);
  root.setProperty('--landscape-h', `${LANDSCAPE_SIZE.height}px`);
  fitNow();
}

let current: Layout = 'portrait';
let fitNow: () => void = () => undefined;
let stageEl: HTMLDivElement | null = null;

export function stageSize(layout: Layout = current): { width: number; height: number } {
  return layout === 'landscape' ? LANDSCAPE_SIZE : RENDER_SIZE;
}

export function currentLayout(): Layout {
  return current;
}

export function createStage(root: HTMLElement): {
  stage: HTMLDivElement;
  canvasHost: HTMLDivElement;
  overlay: HTMLDivElement;
} {
  const stage = document.createElement('div');
  stage.className = 'stage';
  const canvasHost = document.createElement('div');
  canvasHost.className = 'stage-canvas';
  const overlay = document.createElement('div');
  overlay.className = 'stage-overlay';
  stage.append(canvasHost, overlay);
  root.append(stage);
  stageEl = stage;

  const fit = (): void => {
    const { width, height } = stageSize();
    const s = Math.min(window.innerWidth / width, window.innerHeight / height);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  };
  fitNow = fit;
  window.addEventListener('resize', fit);
  fit();
  return { stage, canvasHost, overlay };
}

interface DesktopBridge {
  setLayout?: (layout: Layout) => void;
}

/**
 * Switch between 9:16 and 16:9. The desktop app (if present) turns its window to match;
 * in a browser the stage simply letterboxes into the window.
 */
export function setLayout(layout: Layout): boolean {
  if (layout === current) return false;
  current = layout;
  stageEl?.classList.toggle('landscape', layout === 'landscape');
  fitNow();
  (window as unknown as { templesDesktop?: DesktopBridge }).templesDesktop?.setLayout?.(layout);
  return true;
}
