import './fonts.css';
import './style.css';
import './ui/overlay.css';
import './expedition/hud.css';
import { GAME_NAME, RENDER_SIZE, kitFor, loadConfigs, type BridgeMessage } from '@temples/shared';
import { createStage, LANDSCAPE_SIZE, setLayout } from './stage';
import { Meter, type FrameStats } from './meter';
import { createKhmerPanel, fontFor, loadFonts } from './khmerPanel';
import { paceFrame, targetFps } from './pacing';
import { playTestTone } from './tone';
import { GameApp, qualityFrom } from './engine/app';
import { Director, type DirectorView, type ShotName } from './logic/director';
import { Activity } from './logic/activity';
import { biggestStoneOf, emptyModel, newestNames, reduce, type GameModel } from './logic/store';
import { BridgeClient } from './net/client';
import { Overlay } from './ui/overlay';
import { Expedition } from './expedition/expedition';
import { Kingdom } from './kingdom/kingdom';
import type { KingdomGfx } from './kingdom/view/gfx';

declare global {
  interface Window {
    __temples: {
      fontsReady: boolean;
      fontsOk: boolean;
      fps: 30 | 60;
      stats: FrameStats;
      model?: GameModel;
      view?: DirectorView;
      preset?: string;
      mode?: 'build' | 'expedition' | 'kingdom' | 'anachak';
      expedition?: Expedition;
      kingdom?: Kingdom;
      /** Anachak Khmer, the second Kingdom tab (D92). */
      anachak?: Kingdom;
    };
  }
}

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  document.title = GAME_NAME.en;
  const params = new URLSearchParams(location.search);
  const { stage, canvasHost, overlay } = createStage(root);
  const fps = targetFps(location.search);
  const meter = new Meter(overlay, params.get('meter') === '1');
  window.__temples = { fontsReady: false, fontsOk: false, fps, stats: meter.stats };

  // Canvas text (carved names, map labels) must wait for the fonts.
  const fontsOk = await loadFonts();
  window.__temples.fontsOk = fontsOk;
  window.__temples.fontsReady = true;

  const configs = loadConfigs();
  const kit = kitFor('preah-ko')!;
  const { name: presetName, q } = qualityFrom(location.search);
  window.__temples.preset = presetName;
  const app = new GameApp(canvasHost, overlay, configs, kit, (px, role) => fontFor(role, px), q);
  const ui = new Overlay(overlay);
  ui.offline = params.get('offline') === '1';
  if (params.get('fonts') === '1') createKhmerPanel(overlay, playTestTone);

  const model = emptyModel();
  window.__temples.model = model;
  // ?cutSeconds=N / ?pipSeconds=N (tests on slow machines): longer so screenshots catch them.
  const cutSeconds = Number(params.get('cutSeconds')) || configs.camera.cut.seconds;
  const pipSeconds = Number(params.get('pipSeconds')) || configs.camera.pip.seconds;
  const director = new Director(
    {
      ...configs.camera,
      cut: { ...configs.camera.cut, seconds: cutSeconds },
      pip: { ...configs.camera.pip, seconds: pipSeconds },
    },
    performance.now(),
  );
  // Kulen Expedition (D28) is built on first use; ?mode=expedition forces it (tests, offline);
  // ?selectSeconds=N lengthens the hero vote for slow test machines.
  let expedition: Expedition | null = null;
  const asked = params.get('mode');
  const forcedMode = asked === 'expedition' || asked === 'kingdom' || asked === 'anachak' ? asked : null;
  // Khmer Kingdoms (the RTS tab, D46) is also built on first use.
  // Anachak Khmer (D92) is the same game in its own tab and save, with the new features on.
  const games: { kingdom: Kingdom | null; anachak: Kingdom | null } = { kingdom: null, anachak: null };
  const makeKingdom = (variant: 'kingdom' | 'anachak'): Kingdom => {
    const d = params.get('difficulty');
    const k = new Kingdom(
      app.renderer,
      stage,
      overlay,
      kit,
      (px) => fontFor('names', px),
      d === 'easy' || d === 'normal' || d === 'hard' || d === 'expert' ? d : undefined,
      { gfx: q.kingdom as KingdomGfx, variant },
    );
    if (params.get('kingdomDemo') === '1') k.demo();
    window.__temples[variant] = k;
    return k;
  };
  const getKingdom = (variant: 'kingdom' | 'anachak' = 'kingdom'): Kingdom =>
    (games[variant] ??= makeKingdom(variant));
  /** The Kingdom-like game on screen now (Kingdom or Anachak Khmer), if any. */
  const liveKingdom = (mode: string | undefined): Kingdom | null =>
    mode === 'kingdom' ? games.kingdom : mode === 'anachak' ? games.anachak : null;
  let loading: HTMLDivElement | null = null;
  const getExpedition = (): Expedition => {
    if (!expedition) {
      expedition = new Expedition(
        app.renderer,
        stage,
        overlay,
        configs,
        Number(params.get('selectSeconds')) || undefined,
      );
      window.__temples.expedition = expedition;
    }
    return expedition;
  };
  const lock = params.get('shot') as ShotName | null;
  if (lock && lock in app.scenes) director.locked = lock;
  const activity = new Activity();
  let localProgress = 0;
  let firstState = true;

  const onMessage = (msg: BridgeMessage): void => {
    const now = performance.now();
    const r = reduce(model, msg, now);
    const s = model.state;
    if (r.stateChanged && s) {
      app.map.setCampaign(s.temple.templeId, s.temple.completed);
      if (s.temple.progress !== localProgress) {
        const grew = s.temple.progress > localProgress;
        localProgress = s.temple.progress;
        app.site.temple.setProgress(s.temple.target, localProgress);
        if (firstState || !grew) app.site.temple.snap();
        else app.site.temple.place(null, 'small', now);
      }
      firstState = false;
      director.setPaused(model.paused, now);
    }
    if (r.namesReset) {
      app.site.temple.setNames(model.names);
      app.site.setYardNames(newestNames(model.names, 8));
    }
    if (r.stone && s) {
      const st = r.stone;
      // In the Kingdom tab, LIVE support also becomes kingdom resources (rules.tiktok).
      // The tab on screen gets the LIVE support (?mode= forces it on tests and offline).
      liveKingdom(forcedMode ?? s.mode)?.contribute(st.tier, st.stones, st.name, now);
      activity.add(now, st.tier, st.stones);
      director.onActivity(now);
      if (st.applied > 0) {
        localProgress = Math.min(s.temple.target, localProgress + st.applied);
        app.site.temple.setProgress(s.temple.target, localProgress);
      }
      app.site.temple.setNames(model.names);
      app.site.setYardNames(newestNames(model.names, 8));
      app.site.temple.place(st.slot, st.tier, now);
      director.onStone(st.tier, st.slot, st.name, now);
      if (st.name) ui.banner(st.name, st.tier, st.units, now, Math.max(5000, (cutSeconds - 1) * 1000));
    }
    if (r.command) {
      const c = r.command;
      director.onActivity(now);
      if (c.name === 'myStone' && c.userId)
        director.onMyStone(biggestStoneOf(model, c.userId), c.displayName ?? null, now);
      if (c.name === 'pause' || c.name === 'resume') director.setPaused(model.paused, now);
      if (c.name === 'heroVote' && c.userId && c.choice) {
        const k = liveKingdom(forcedMode ?? model.state?.mode);
        if (k) k.vote(c.userId, c.choice);
        else expedition?.vote(c.userId, c.choice);
      }
      if (c.name === 'kingdom' && c.op) {
        const k = getKingdom((forcedMode ?? model.state?.mode) === 'anachak' ? 'anachak' : 'kingdom');
        if (c.op === 'new') k.newGame(c.difficulty ?? 'normal');
        else k.host(c.op);
      }
      ui.command(c, now);
    }
  };

  const client = new BridgeClient(onMessage, (up) => {
    model.connected = up;
    if (up) firstState = true;
  });
  if (params.get('offline') !== '1') client.start();
  else if (params.get('progress')) {
    // Offline preview of a half-built temple (screenshots, art review): ?offline=1&progress=0.4
    const target = kit.slots.length;
    app.site.temple.setProgress(
      target,
      Math.round(target * Math.min(1, Number(params.get('progress')) || 0)),
    );
    app.site.temple.snap();
  }

  let last = 0;
  let prev = performance.now();
  const errors = new Map<string, number>();
  app.renderer.setAnimationLoop((now) => {
    const pace = paceFrame(now, last, fps);
    if (!pace.render) return;
    last = pace.last;
    // A bug in one frame must never freeze the stream: log it (once per minute) and keep going.
    try {
      frame(now);
    } catch (err) {
      const key = String(err);
      if (now - (errors.get(key) ?? -Infinity) > 60_000) {
        errors.set(key, now);
        console.error('[game] frame error (the game keeps running):', err);
      }
    }
  });

  function frame(now: number): void {
    const t0 = performance.now();
    const mode = forcedMode ?? model.state?.mode ?? 'build';
    window.__temples.mode = mode;
    ui.root.classList.toggle('mode-expedition', mode === 'expedition');
    const kingdomLike = mode === 'kingdom' || mode === 'anachak';
    ui.root.classList.toggle('mode-kingdom', kingdomLike);
    ui.root.classList.toggle('mode-anachak', mode === 'anachak');
    if (kingdomLike) {
      // The Kingdom tab is 16:9 (D51): turn the stage and the render target.
      if (setLayout('landscape'))
        app.renderer.setSize(
          LANDSCAPE_SIZE.width * q.renderScale,
          LANDSCAPE_SIZE.height * q.renderScale,
          false,
        );
      if (expedition?.isActive) expedition.stop();
      const other = mode === 'anachak' ? games.kingdom : games.anachak;
      if (other?.isActive) other.stop();
      const k = getKingdom(mode);
      k.start(now);
      k.frame(now, model.paused);
      ui.render(model, now);
      meter.frame(app.renderer, performance.now() - t0, k.frameSplit());
      return;
    }
    if (games.kingdom?.isActive) games.kingdom.stop();
    if (games.anachak?.isActive) games.anachak.stop();
    if (setLayout('portrait'))
      app.renderer.setSize(RENDER_SIZE.width * q.renderScale, RENDER_SIZE.height * q.renderScale, false);
    if (mode === 'expedition' && !expedition) {
      // Building the jungle takes a moment: say so, then build on the next tick.
      if (!loading) {
        loading = document.createElement('div');
        loading.className = 'exp-loading';
        loading.textContent = 'កំពុងរៀបចំព្រៃភ្នំគូលែន… · Preparing the Kulen jungle…';
        overlay.append(loading);
        setTimeout(() => {
          try {
            getExpedition();
            loading?.remove();
            loading = null;
          } catch (err) {
            // Show the reason on screen so it can be reported (the Build scene keeps running).
            console.error('[game] Expedition failed to load:', err);
            if (loading) loading.textContent = `Expedition failed to load: ${String(err).slice(0, 160)}`;
          }
        }, 60);
      }
    } else if (mode === 'expedition') {
      const ex = getExpedition();
      ex.start(now);
      ex.frame(now, model);
      ui.render(model, now);
      meter.frame(app.renderer, performance.now() - t0);
      return;
    }
    if (expedition?.isActive) expedition.stop();
    const view = director.tick(now);
    window.__temples.view = view;
    const s = model.state;
    app.render({
      now,
      dt: now - prev,
      view,
      convoys: activity.convoys(now, q.maxCharacters),
      stockpile: s?.temple.stockpile ?? 0,
      progress01: s ? s.temple.progress / s.temple.target : 0,
      paused: model.paused,
    });
    prev = now;
    ui.maybeCard(now, configs.camera.historyCardEverySec * 1000, view.mode === 'idle');
    ui.render(model, now);
    meter.frame(app.renderer, performance.now() - t0);
  }
}

void start();
