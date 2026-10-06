import './fonts.css';
import './style.css';
import './mobile.css';
import * as THREE from 'three';
import { kitFor } from '@temples/shared';
import qualityJson from '../../../config/quality.json';
import { createStage, LANDSCAPE_SIZE, setLandscapeSize, setLayout } from './stage';
import { Meter } from './meter';
import { fontFor, loadFonts } from './khmerPanel';
import { paceFrame } from './pacing';
import { setLook, setupRenderer } from './engine/look';
import { CREDITS, Kingdom } from './kingdom/kingdom';
import type { KingdomGfx } from './kingdom/view/gfx';
import { landscapeSizeFor } from './screenShape';
import { isIos, isPortrait, shouldRegisterOffline, type OfflineHost } from './pwa/offline';

/**
 * The phone build of Khmer Kingdoms (Android app D72, iPhone web app D73): only the Kingdom tab, offline and
 * single-player (no TikTok bridge, gifts or council votes), with touch controls, the phone
 * quality preset, and the stage widened to the phone's shape. Capacitor wraps the built
 * page (apps/android); on iPhone it is added to the Home Screen from Safari and works offline
 * (sw.js). The same page runs in a desktop browser at /mobile.html for testing.
 */

declare global {
  interface Window {
    /** The Android back button (apps/android MainActivity): true when something was closed. */
    __kingdomBack?: () => boolean;
  }
}

/** iPhone web app (D73): offline cache, "turn your phone" when upright, no page zoom. */
function webAppSetup(): { standalone: boolean; ios: boolean } {
  const host = window as unknown as OfflineHost;
  if (shouldRegisterOffline(host)) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((err: unknown) => console.warn('[offline] not cached:', err));
  }
  // Safari still zooms on pinch in spite of user-scalable=no; the game uses pinch itself.
  for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  const rotate = document.createElement('div');
  rotate.className = 'm-rotate';
  rotate.innerHTML = `<div class="m-rotate-phone">📱</div><p>សូមបង្វិលទូរស័ព្ទ ឬ iPad ផ្ដេក<br><span>Turn your phone or iPad sideways</span></p>`;
  document.body.append(rotate);
  const check = (): void => {
    rotate.hidden = !isPortrait(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', check);
  check();
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches;
  return { standalone, ios: isIos(navigator.userAgent, navigator.maxTouchPoints, navigator.platform) };
}

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  document.title = `${CREDITS.game.km} · Khmer Kingdoms`;
  const params = new URLSearchParams(location.search);
  const web = webAppSetup();
  const size = landscapeSizeFor(window.innerWidth, window.innerHeight);
  setLandscapeSize(size.width, size.height);
  const { stage, canvasHost, overlay } = createStage(root);
  setLayout('landscape');
  const meter = new Meter(overlay, params.get('meter') === '1');
  window.__temples = { fontsReady: false, fontsOk: false, fps: 30, stats: meter.stats, mode: 'kingdom' };
  window.__temples.fontsOk = await loadFonts();
  window.__temples.fontsReady = true;

  const q = qualityJson.mobile;
  window.__temples.preset = 'mobile';
  setLook(q.look as Parameters<typeof setLook>[0]);
  const renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(LANDSCAPE_SIZE.width * q.renderScale, LANDSCAPE_SIZE.height * q.renderScale, false);
  setupRenderer(renderer);
  renderer.autoClear = false;
  canvasHost.append(renderer.domElement);

  // Kingdom, or Anachak Khmer (D92: the levy, the royal roads, the 3D hero mode), chosen on the
  // start screen; ?variant=anachak picks it at once (with ?autostart=1).
  let kingdom: Kingdom | null = null;
  const games: Partial<Record<'kingdom' | 'anachak', Kingdom>> = {};
  const makeGame = (variant: 'kingdom' | 'anachak'): Kingdom => {
    const k = new Kingdom(
      renderer,
      stage,
      overlay,
      kitFor('preah-ko') ?? null,
      (px) => fontFor('names', px),
      undefined,
      { mobile: true, gfx: q.kingdom as KingdomGfx, variant },
    );
    window.__temples[variant] = k;
    games[variant] = k;
    return k;
  };
  const play = (variant: 'kingdom' | 'anachak'): Kingdom => {
    const k = games[variant] ?? makeGame(variant);
    window.__temples.mode = variant;
    window.__kingdomBack = () => k.back();
    return k;
  };
  // The Kingdom is built while the start screen shows (the world takes a moment).
  makeGame(params.get('variant') === 'anachak' ? 'anachak' : 'kingdom');

  // Start screen: the game's name and its developer; a tap starts (and unlocks sound).
  const splash = document.createElement('div');
  splash.className = 'm-splash';
  splash.innerHTML = `
    <h1>${CREDITS.game.km}</h1>
    <p class="m-en">${CREDITS.game.en}</p>
    <p class="m-dev">${CREDITS.developer.km} · ${CREDITS.developer.en}<br><span class="k-credit-km">${CREDITS.developer.nameKm}</span><br><b>${CREDITS.developer.name}</b></p>
    <div class="m-starts">
      <button class="m-start" type="button" data-variant="kingdom">នគរ · Kingdom</button>
      <button class="m-start m-start-a" type="button" data-variant="anachak">អាណាចក្រខ្មែរ · Anachak Khmer <small>🎮 ៣D</small></button>
    </div>${
      web.ios && !web.standalone
        ? window.isSecureContext
          ? `<p class="m-install">iPhone / iPad: ចុច <b>Share ⬆︎</b> → <b>Add to Home Screen</b> ដើម្បីដំឡើង និងលេងគ្មានអ៊ីនធឺណិត<br>Tap Share → Add to Home Screen to install and play offline</p>`
          : `<p class="m-install">លេងតាម Wi-Fi ពីកុំព្យូទ័រ៖ ទុកកុំព្យូទ័របើក · Playing over Wi-Fi from the PC: keep the PC on<br>Share ⬆︎ → Add to Home Screen = full screen</p>`
        : ''
    }`;
  overlay.append(splash);
  let started = params.get('autostart') === '1';
  if (started) {
    splash.remove();
    kingdom = play(params.get('variant') === 'anachak' ? 'anachak' : 'kingdom');
  }
  splash.addEventListener('pointerup', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-variant]');
    if (!b || started) return;
    started = true;
    kingdom = play(b.dataset.variant === 'anachak' ? 'anachak' : 'kingdom');
    kingdom.sound.unlock();
    splash.remove();
  });

  // The phone sleeps the game in the background: save, and pick up again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) kingdom?.stop();
  });
  // iPhone closes a Home Screen app with pagehide rather than visibilitychange.
  window.addEventListener('pagehide', () => kingdom?.stop());

  let last = 0;
  renderer.setAnimationLoop((now) => {
    const pace = paceFrame(now, last, 30);
    if (!pace.render) return;
    last = pace.last;
    const t0 = performance.now();
    try {
      // Before the choice the built game shows (paused) behind the start screen.
      const k = kingdom ?? games.kingdom ?? games.anachak;
      if (!k) return;
      for (const g of Object.values(games)) if (g !== k && g.isActive) g.stop();
      k.start(now);
      k.frame(now, !started || document.hidden);
    } catch (err) {
      console.error('[kingdom] frame error (the game keeps running):', err);
    }
    meter.frame(renderer, performance.now() - t0);
  });
}

void start();
