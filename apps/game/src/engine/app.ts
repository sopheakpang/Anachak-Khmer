import * as THREE from 'three';
import layoutJson from '../../../../config/layout.json';
import qualityJson from '../../../../config/quality.json';
import { RENDER_SIZE, type Configs, type TempleKit } from '@temples/shared';
import type { FrameContext, GameScene } from '../scenes/base';
import { SiteScene } from '../scenes/site';
import { MapScene } from '../scenes/map';
import { HaulingScene, QuarryScene, RiverScene } from '../scenes/journey';
import type { ShotName } from '../logic/director';
import { camera } from '../scenes/base';
import { environmentFrom, setLook, setupRenderer, styleScene } from './look';

export type Quality = (typeof qualityJson)['low'];

export type PresetName = 'low' | 'pc1660' | 'high' | 'ultra' | 'lite';
export const PRESETS: readonly PresetName[] = ['low', 'pc1660', 'high', 'ultra', 'lite'];
/** The player's own choice of graphics (🖥 on the year bar, D149), kept in the browser. */
export const PRESET_KEY = 'temples.preset.v1';

/** The preset the player chose in the game, if any (storage may be missing or blocked). */
export function storedPreset(): PresetName | null {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(PRESET_KEY);
    return PRESETS.includes(v as PresetName) ? (v as PresetName) : null;
  } catch {
    return null;
  }
}

/**
 * The graphics preset: the player's own choice in the game wins over the desktop window's
 * default (?preset= from config/window.json), except `?presetLock=1` (tests) which takes the URL.
 */
export function qualityFrom(
  search: string,
  stored: PresetName | null = storedPreset(),
): { name: PresetName; q: Quality } {
  const params = new URLSearchParams(search);
  const asked = params.get('preset');
  const fromUrl = PRESETS.includes(asked as PresetName) ? (asked as PresetName) : 'low';
  const name: PresetName = stored && params.get('presetLock') !== '1' ? stored : fromUrl;
  const style = new URLSearchParams(search).get('style');
  const q = (qualityJson as unknown as Record<PresetName, Quality>)[name];
  // ?style=film | lowpoly lets the host compare the two looks without editing config.
  return { name, q: style === 'film' || style === 'lowpoly' ? { ...q, look: { ...q.look, style } } : q };
}

const PIP = (layoutJson.zones as Record<string, { x: number; y: number; w: number; h: number }>).pip!;

/**
 * Owns the renderer and the scenes. Only the scene on screen is rendered;
 * the PiP window renders the site scene into its own viewport.
 */
export class GameApp {
  readonly renderer: THREE.WebGLRenderer;
  readonly scenes: Record<ShotName, GameScene>;
  readonly site: SiteScene;
  readonly map: MapScene;
  private readonly pipCam = camera(40);
  private readonly pipFrame: HTMLDivElement;

  constructor(
    host: HTMLElement,
    overlay: HTMLElement,
    configs: Configs,
    kit: TempleKit,
    font: (px: number, role: 'title' | 'small' | 'names') => string,
    readonly quality: Quality,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      RENDER_SIZE.width * quality.renderScale,
      RENDER_SIZE.height * quality.renderScale,
      false,
    );
    setLook(quality.look);
    setupRenderer(this.renderer);
    this.renderer.autoClear = false;
    host.append(this.renderer.domElement);

    this.site = new SiteScene(kit, (px) => font(px, 'names'), quality);
    this.map = new MapScene(configs.temples, (px, role) => font(px, role));
    this.scenes = {
      map: this.map,
      quarry: new QuarryScene(quality.maxCharacters),
      river: new RiverScene(quality.maxCharacters),
      hauling: new HaulingScene(quality.maxCharacters),
      site: this.site,
    };
    const env = environmentFrom(this.renderer);
    for (const s of Object.values(this.scenes)) {
      s.scene.environment = env;
      s.scene.environmentIntensity = quality.look.envIntensity;
    }

    this.pipFrame = document.createElement('div');
    this.pipFrame.className = 'pip-frame';
    Object.assign(this.pipFrame.style, {
      left: `${PIP.x}px`,
      top: `${PIP.y}px`,
      width: `${PIP.w}px`,
      height: `${PIP.h}px`,
    });
    this.pipFrame.hidden = true;
    overlay.append(this.pipFrame);
  }

  render(ctx: FrameContext): void {
    const view = ctx.view;
    const main = this.scenes[view.shot];
    main.update(ctx);
    // The site keeps animating landings even when off screen, so PiP and cuts are current.
    if (main !== this.site) this.site.temple.update(ctx.now);

    const s = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, s.x, s.y);
    this.renderer.clear();
    followCamera(main.scene, main.camera);
    styleScene(main.scene);
    this.renderer.render(main.scene, main.camera);

    const pip = view.pip && !(view.mode === 'cut') ? view.pip : null;
    this.pipFrame.hidden = !pip;
    if (pip) {
      const k = s.x / RENDER_SIZE.width;
      const x = PIP.x * k;
      const y = (RENDER_SIZE.height - PIP.y - PIP.h) * k;
      this.pipCam.aspect = PIP.w / PIP.h;
      this.pipCam.updateProjectionMatrix();
      const left = Math.max(0, (pip.until - ctx.now) / 5000);
      this.site.aimAt(this.pipCam, pip.slot, pip.slot?.kind === 'big' ? 6 : 4, 1 - left);
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(x, y, PIP.w * k, PIP.h * k);
      this.renderer.setViewport(x, y, PIP.w * k, PIP.h * k);
      this.renderer.clearDepth();
      followCamera(this.site.scene, this.pipCam);
      styleScene(this.site.scene);
      this.renderer.render(this.site.scene, this.pipCam);
      this.renderer.setScissorTest(false);
    }
  }
}

/** Clouds and horizon hills stay centred on the camera so they always frame the shot. */
function followCamera(scene: THREE.Scene, cam: THREE.Camera): void {
  for (const o of scene.children)
    if (o.userData.followCamera) o.position.set(cam.position.x, 0, cam.position.z);
}
