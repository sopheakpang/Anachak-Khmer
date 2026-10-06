import * as THREE from 'three';
import type { Anachak, Cost, HeroKit, KingdomData } from '@temples/shared';
import { PLAYER, type KingdomSim, type Unit } from '../sim/sim';
import type { KingdomScene } from '../view/scene';
import type { KingdomSound } from '../view/sound';
import { tileToWorld, worldToTile, type XZ } from '../sim/map';
import { HeroCore, NO_INPUT, kitFor, type HeroAct, type HeroInput } from './heroCore';
import { HeroModel, lookFor } from './heroModel';
import { CelPass, animeSky } from './celPass';
import { Backdrop } from './backdrop';
import { PALETTE } from '../../engine/look';
import { GroundDetail, type GroundKind } from './ground';
import { Slashes } from './slash';
import { TigerModel } from './tiger';
import { heroModelFor, preloadModels } from './glbModel';
import { YantraFx, yantraFor } from './yantra';
import { tigerEncounter } from '../sim/anachak';
import {
  doWork,
  heal,
  heroOpen,
  hitFoe,
  nearestFoe,
  strike,
  workLabel,
  workTarget,
  type HeroBody,
  type WorkTarget,
} from './heroSim';
import './hero.css';

/**
 * The 3D hero mode (PK, Anachak Khmer D92): any character — a villager, a soldier, the
 * hunter and his dog, a rider, the war elephant, the commander, the king himself — is played
 * from behind in the live kingdom, drawn anime-style. WASD / stick to move, Shift to run,
 * Space to jump, Q to dash, click / J to strike (a three-blow combo), R / K for the kit's
 * skill, E to work (cut, dig, build, tend rice, put a load in a store), right-drag to turn the
 * camera, Esc to go back to the kingdom. The game goes on round the hero meanwhile.
 */

type Cfg = Anachak['hero'];
type Quest = Cfg['quests']['list'][number] & { have: number; need: number };

export interface HeroHost {
  readonly data: KingdomData;
  sim(): KingdomSim;
  view(): KingdomScene;
  readonly sound: KingdomSound;
  /** The HUD layer (scaled with the stage). */
  readonly hudRoot: HTMLElement;
  readonly stage: HTMLElement;
  toStage(e: { clientX: number; clientY: number }): { x: number; y: number };
  toast(html: string, sec?: number): void;
  /** Where the king stands before the hall, or null. */
  kingSpot(): XZ | null;
  kingName(): { km: string; en: string };
  /** The mode ended (Esc, the ✕, or the hero fell): who was played (null = the king), and where. */
  onExit(who: number | null, at: XZ): void;
  readonly mobile: boolean;
}

interface Shot {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  foe: ReturnType<typeof nearestFoe>;
  mul: number;
  arc: number;
}

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const KM_DIGITS = '០១២៣៤៥៦៧៨៩';
const km = (n: number) => String(Math.round(n)).replace(/\d/g, (d) => KM_DIGITS[Number(d)]!);
const RES_ICON: Record<string, string> = { food: '🍚', wood: '🪵', stone: '🪨', gold: '🪙' };

export class HeroMode {
  active = false;
  core: HeroCore | null = null;
  model: HeroModel | null = null;
  /** The sim unit played (null for the king). */
  unitId: number | null = null;
  /**
   * Watching (PK: "or just allow the flow of story life"): the camera follows the unit in 3D
   * while the AI keeps living its life; E, a move key or the 🎮 button takes control.
   */
  watching = false;
  /** Sword slashes (PK: the tiger fight). */
  readonly slashes = new Slashes();
  /** Yantra light for the skills (PK: Khmer yantra magic), in the air, never underfoot. */
  readonly yantra = new YantraFx();
  /** The tiger out of the forest (PK), and when the next may come (sim seconds). */
  tigerId: number | null = null;
  private tigerAt = 0;
  private kingBiteAt = 0;
  /** The nearest tiger drawn in the heroes' style (the map's crowd model is hidden for it). */
  private tigerModel: TigerModel | null = null;
  private tigerShown: {
    id: number;
    x: number;
    z: number;
    ready: number;
    attack: number;
    speed: number;
  } | null = null;
  private kit: HeroKit | null = null;
  private readonly cfg: Cfg;
  private readonly cel = new CelPass();
  private sky: THREE.Mesh | null = null;
  private hiddenSky: THREE.Object3D[] = [];
  /** Far mountains and motes of light (PK's reference image). */
  private backdrop: Backdrop | null = null;
  /** Grass, bare earth and falling leaves round the hero (PK's forest reference). */
  ground: GroundDetail | null = null;
  private readonly keys = new Set<string>();
  /** Presses waiting for the next step (edge-triggered actions). */
  private readonly press = new Set<'attack' | 'skill' | 'jump' | 'dash' | 'work'>();
  private stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
  private look: { id: number; x: number; y: number } | null = null;
  private kingHp = 0;
  private lastHp = 0;
  private shots: Shot[] = [];
  private readonly shotGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4).rotateX(Math.PI / 2);
  private readonly shotMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  private dogTask: { foe: NonNullable<ReturnType<typeof nearestFoe>>; t: number; mul: number } | null = null;
  private dogPos = new THREE.Vector3();
  private dogStride = 0;
  private floats: Array<{ x: number; y: number; z: number; text: string; cls: string; at: number }> = [];
  private shake = 0;
  private hitStop = 0;
  private flashHurt = 0;
  private target: WorkTarget | null = null;
  private targetAt = 0;
  private quest: Quest | null = null;
  private questDone = 0;
  private stats = { defeat: 0, hunt: 0, heal: 0, gather: 0, store: 0, build: 0 };
  private readonly el: HTMLDivElement;
  private prevFog: THREE.Scene['fog'] = null;
  private prevBg: THREE.Scene['background'] = null;
  private lastUi = 0;
  private autoCamAt = 0;

  constructor(private readonly host: HeroHost) {
    this.cfg = host.data.anachak.hero;
    void preloadModels(this.cfg.models); // PK's model files, if any (in the background)
    this.el = document.createElement('div');
    this.el.className = 'k-hero';
    this.el.hidden = true;
    host.hudRoot.append(this.el);
    this.bind();
  }

  // ------------------------------------------------------------------ enter and leave

  /** Play this unit (or the king) in 3D. Returns false if it cannot be played. */
  enter(who: { unit: number } | { king: true }, opts: { watch?: boolean } = {}): boolean {
    const sim = this.host.sim();
    const view = this.host.view();
    let x: number;
    let z: number;
    let heading = Math.PI;
    let type: string;
    if ('unit' in who) {
      const u = sim.units.get(who.unit);
      if (!u || u.team !== PLAYER) return false;
      x = u.x;
      z = u.z;
      heading = u.heading;
      type = u.type;
      this.watching = !!opts.watch;
      if (!this.watching) this.seize(u);
      this.unitId = u.id;
      this.lastHp = u.hp;
      view.hiddenUnit = u.id;
    } else {
      const spot = this.host.kingSpot();
      if (!spot) return false;
      [x, z] = spot;
      type = 'king';
      this.unitId = null;
      this.watching = false;
      this.kingHp = this.cfg.king.hp;
      this.lastHp = this.kingHp;
      view.hideKing = true;
    }
    if (!this.watching && !heroOpen(sim, x, z)) {
      // Step out onto open ground nearby (a unit can stand at a building's edge).
      for (let r = 1; r < 8; r++) {
        const p = [0, 1, 2, 3, 4, 5, 6, 7]
          .map((k) => [x + Math.cos(k) * r, z + Math.sin(k) * r] as XZ)
          .find(([a, b]) => heroOpen(sim, a, b));
        if (p) {
          [x, z] = p;
          break;
        }
      }
    }
    this.kit = kitFor(this.cfg, type);
    this.core = new HeroCore(this.cfg, this.kit, x, z, heading);
    if (this.watching) this.core.camDist = this.host.data.anachak.danger.watchDist;
    view.scene.add(this.slashes.group);
    view.scene.add(this.yantra.group);
    this.tigerId = null;
    // The first tiger may come soon after the hero walks into the forest.
    this.tigerAt = sim.time + Math.min(20, this.host.data.anachak.tiger.everySec);
    const eras = this.host.data.eras.map((e) => e.id);
    const tall = eras.indexOf(sim.era.id) >= eras.indexOf('suryavarman2');
    // PK's real model file for this kit, when one is loaded (else the built-in figure).
    this.model = new HeroModel(
      this.kit,
      lookFor(this.kit, type, tall),
      heroModelFor(this.cfg.models, this.kit.id),
    );
    view.scene.add(this.model.group);
    if (this.model.dog) {
      this.dogPos.set(x + 1, 0, z);
      view.scene.add(this.model.dog.root);
    }
    // The anime look: the RTS view's own sky dome and horizon walls give way to the painted sky
    // and mountains. The Build look (PK 1.6.0) keeps the Build tab's sky, hills and warm haze.
    const anime = this.anime;
    this.hiddenSky = anime
      ? view.scene.children.filter((o) => o.visible && (o.userData.followCamera || o.renderOrder === -10))
      : [];
    for (const o of this.hiddenSky) o.visible = false;
    if (anime) {
      if (!this.sky) this.sky = animeSky(view.sunDir);
      view.scene.add(this.sky);
      this.sky.visible = true;
      this.backdrop ??= new Backdrop();
      view.scene.add(this.backdrop.group);
      this.backdrop.group.visible = true;
    }
    this.ground ??= new GroundDetail();
    this.ground.reset();
    view.scene.add(this.ground.group);
    this.prevFog = view.scene.fog;
    this.prevBg = view.scene.background;
    const C = this.cfg.camera;
    // Haze the colour of the painted sky's horizon (linear), kept through the weather; the
    // Build look's warm golden haze otherwise.
    const haze = anime ? new THREE.Color().setRGB(0.4, 0.62, 0.86) : new THREE.Color(PALETTE.fog);
    view.scene.fog = new THREE.Fog(haze, C.fogNear, C.fogFar);
    view.weatherFx.heroFog = { near: C.fogNear, far: C.fogFar, color: haze };
    view.heroView = true;
    sim.heroEye = [x, z];
    sim.updateFog();
    this.active = true;
    this.el.hidden = false;
    this.host.hudRoot.classList.add('k-hero-on');
    this.press.clear();
    this.keys.clear();
    this.quest = null;
    this.nextQuest();
    this.parts.clear();
    this.host.sound.play('discover');
    return true;
  }

  /** The player takes this unit over: the AI lets go of it. */
  private seize(u: Unit): void {
    u.manual = true;
    u.task = { kind: 'idle' };
    u.path = null;
    u.waypoints = undefined;
  }

  /** From watching to playing (E, a move key, or the 🎮 button). */
  takeControl(): void {
    if (!this.active || !this.watching || this.unitId === null) return;
    const u = this.host.sim().units.get(this.unitId);
    if (!u) return;
    this.seize(u);
    this.watching = false;
    this.lastHp = u.hp;
    this.core!.camDist = this.cfg.camera.dist;
    this.parts.clear();
    this.host.sound.play('click');
    this.host.toast('🎮 <b>អ្នកកំពុងលេង</b> · You take control', 3);
  }

  exit(reason: 'player' | 'fallen' | 'gone' = 'player'): void {
    if (!this.active) return;
    const sim = this.host.sim();
    const view = this.host.view();
    const at: XZ = this.core ? [this.core.x, this.core.z] : [0, 0];
    if (this.unitId !== null && !this.watching) {
      const u = sim.units.get(this.unitId);
      if (u) {
        u.manual = undefined;
        u.task = { kind: 'idle' };
        u.path = null;
        u.anim = 'idle';
      }
    }
    view.hiddenUnit = null;
    view.hideKing = false;
    view.heroView = false;
    sim.heroEye = null;
    if (this.model) {
      view.scene.remove(this.model.group);
      if (this.model.dog) view.scene.remove(this.model.dog.root);
      this.model.dispose();
    }
    for (const s of this.shots) view.scene.remove(s.mesh);
    this.shots = [];
    this.slashes.clear();
    view.scene.remove(this.slashes.group);
    this.yantra.clear();
    view.scene.remove(this.yantra.group);
    if (this.tigerModel) view.scene.remove(this.tigerModel.group);
    this.tigerShown = null;
    view.hiddenAnimal = null;
    this.watching = false;
    if (this.sky) {
      view.scene.remove(this.sky);
      this.sky.visible = false;
    }
    if (this.backdrop) {
      view.scene.remove(this.backdrop.group);
      this.backdrop.group.visible = false;
    }
    if (this.ground) view.scene.remove(this.ground.group);
    for (const o of this.hiddenSky) o.visible = true;
    this.hiddenSky = [];
    view.scene.fog = this.prevFog;
    view.weatherFx.heroFog = null;
    view.scene.background = this.prevBg;
    view.rtsLens();
    this.model = null;
    this.core = null;
    this.active = false;
    this.el.hidden = true;
    this.host.hudRoot.classList.remove('k-hero-on');
    if (reason === 'fallen')
      this.host.toast('⚔️ <b>វីរជនបានដួល</b> · The hero has fallen; back to the kingdom', 6);
    const alive = this.unitId !== null && sim.units.has(this.unitId);
    this.host.onExit(alive ? this.unitId : null, at);
  }

  /** The scene was rebuilt (new game, load): leave the mode cleanly. */
  dropScene(): void {
    if (this.active) this.exit('gone');
  }

  // ------------------------------------------------------------------ input

  private bind(): void {
    // Keys by position (e.code), so a Khmer keyboard layout plays the same (UI review).
    const keyMap: Record<string, 'attack' | 'skill' | 'jump' | 'dash' | 'work'> = {
      space: 'jump',
      keyj: 'attack',
      keyk: 'skill',
      keyr: 'skill',
      keyq: 'dash',
      keye: 'work',
    };
    const codeOf = (e: KeyboardEvent) =>
      e.code === 'ShiftLeft' || e.code === 'ShiftRight' ? 'shift' : e.code.toLowerCase();
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.active) return;
        const k = codeOf(e);
        if (k === 'escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.exit('player');
          return;
        }
        if (this.watching && (k === 'keye' || k === 'keyw' || k === 'keya' || k === 'keys' || k === 'keyd')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.takeControl();
          return;
        }
        if (keyMap[k] && !e.repeat) this.press.add(keyMap[k]!);
        this.keys.add(k);
        if (k === 'space' || k.startsWith('arrow') || k === 'tab') e.preventDefault();
        e.stopImmediatePropagation();
      },
      { capture: true },
    );
    window.addEventListener(
      'keyup',
      (e) => {
        if (!this.active) return;
        this.keys.delete(codeOf(e));
        e.stopImmediatePropagation();
      },
      { capture: true },
    );
    window.addEventListener('blur', () => this.keys.clear());
    const st = this.host.stage;
    st.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.active) return;
        // Cards, the orders board and the old map keep their own buttons in hero mode.
        if ((e.target as HTMLElement).closest('[data-act], .am-backdrop')) return;
        const ui = (e.target as HTMLElement).closest('[data-hero]') as HTMLElement | null;
        e.stopImmediatePropagation();
        const p = this.host.toStage(e);
        if (ui) {
          e.preventDefault();
          const a = ui.dataset.hero!;
          if (a === 'exit') this.exit('player');
          else if (a === 'take') this.takeControl();
          else if (a === 'stick') this.stick = { x: 0, y: 0, id: e.pointerId, ox: p.x, oy: p.y };
          else this.press.add(a as 'attack');
          return;
        }
        if (e.pointerType === 'touch') {
          this.look = { id: e.pointerId, x: p.x, y: p.y };
          return;
        }
        if (e.button === 0) this.press.add('attack');
        else if (e.button === 2) this.look = { id: e.pointerId, x: p.x, y: p.y };
      },
      { capture: true },
    );
    window.addEventListener(
      'pointermove',
      (e) => {
        if (!this.active) return;
        const p = this.host.toStage(e);
        if (e.pointerId === this.stick.id) {
          const r = 90;
          this.stick.x = Math.max(-1, Math.min(1, (p.x - this.stick.ox) / r));
          this.stick.y = Math.max(-1, Math.min(1, -(p.y - this.stick.oy) / r));
          return;
        }
        if (this.look && e.pointerId === this.look.id && this.core) {
          this.core.orbit(-(p.x - this.look.x) * 0.006, (p.y - this.look.y) * 0.004);
          this.look.x = p.x;
          this.look.y = p.y;
          this.autoCamAt = performance.now() + 2500;
        }
      },
      { capture: true },
    );
    const up = (e: PointerEvent) => {
      if (!this.active) return;
      if (e.pointerId === this.stick.id) this.stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
      if (this.look && e.pointerId === this.look.id) this.look = null;
    };
    window.addEventListener('pointerup', up, { capture: true });
    window.addEventListener('pointercancel', up, { capture: true });
    st.addEventListener(
      'wheel',
      (e) => {
        if (!this.active || !this.core) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.core.orbit(0, 0, e.deltaY > 0 ? 1.1 : 1 / 1.1);
      },
      { capture: true, passive: false },
    );
  }

  private input(): HeroInput {
    const k = this.keys;
    let x = (k.has('keyd') ? 1 : 0) - (k.has('keya') ? 1 : 0) + this.stick.x;
    let y = (k.has('keyw') ? 1 : 0) - (k.has('keys') ? 1 : 0) + this.stick.y;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    const inp: HeroInput = {
      ...NO_INPUT,
      move: { x, y },
      run: k.has('shift') || Math.hypot(this.stick.x, this.stick.y) > 0.92,
    };
    for (const p of this.press) inp[p] = true;
    this.press.clear();
    return inp;
  }

  // ------------------------------------------------------------------ the frame

  /** One frame: move the hero, act on the world, place the camera. `dt` real seconds. */
  frame(dt: number, now: number): void {
    const core = this.core;
    const model = this.model;
    const kit = this.kit;
    if (!this.active || !core || !model || !kit) return;
    const sim = this.host.sim();
    const view = this.host.view();
    const u = this.unitId !== null ? sim.units.get(this.unitId) : null;
    if (this.unitId !== null && !u) {
      this.exit(sim.outcome ? 'gone' : 'fallen');
      return;
    }
    if (this.kingHp <= 0 && this.unitId === null) {
      this.exit('fallen');
      return;
    }
    // Arrow keys turn the camera.
    if (this.keys.has('arrowleft')) core.orbit(dt * 2, 0);
    if (this.keys.has('arrowright')) core.orbit(-dt * 2, 0);
    if (this.keys.has('arrowup')) core.orbit(0, dt);
    if (this.keys.has('arrowdown')) core.orbit(0, -dt);
    const step = this.hitStop > 0 ? dt * 0.15 : dt;
    this.hitStop = Math.max(0, this.hitStop - dt);
    let acts: HeroAct[] = [];
    if (this.watching && u) {
      // The story goes on: the AI moves the unit, the camera and the pose follow.
      this.input();
      core.follow(u.x, u.z, u.heading, u.anim ?? 'idle', dt);
    } else acts = core.step(step, this.input(), { open: (x, z) => heroOpen(sim, x, z) });
    // The camera drifts behind the hero while he runs and nobody turns it.
    if ((core.speed > 0.5 || this.watching) && now > this.autoCamAt) {
      let d = core.heading + Math.PI - core.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      core.camYaw += d * Math.min(1, dt * (this.watching ? 0.6 : 1.2));
    }
    if (u && !this.watching) {
      u.x = core.x;
      u.z = core.z;
      u.heading = core.heading;
      u.task = { kind: 'idle' };
      u.path = null;
      u.anim =
        core.state === 'attack' || core.state === 'skill'
          ? 'attack'
          : core.speed > 0.1
            ? 'walk'
            : core.state === 'work'
              ? 'gather'
              : 'idle';
      // Hurt: the unit lost HP since last frame.
      if (u.hp < this.lastHp - 0.01) this.hurt(this.lastHp - u.hp);
      this.lastHp = u.hp;
    }
    const body: HeroBody = { x: core.x, z: core.z, heading: core.heading, unit: u ?? null };
    sim.heroEye = [core.x, core.z];
    for (const a of acts) this.act(a, body, sim, now);
    this.updateShots(dt, body, sim, now);
    this.updateDog(dt, body, sim, now);
    this.slashes.update(dt);
    this.yantra.update(dt, view.camera);
    if (!this.watching) this.updateTiger(dt, body, sim);
    this.showTiger(dt, body, sim, now);
    // Pose and place the model.
    model.group.position.set(core.x, core.y, core.z);
    model.group.rotation.y = core.heading;
    model.pose({
      state: core.state,
      stateT: core.stateT,
      combo: core.combo,
      stride: core.stride,
      speed: core.speed,
      y: core.y,
      t: core.t,
      strikeSec: core.strikeSec(),
      skillKind: kit.skill.kind,
    });
    // Camera, with a little shake on hits.
    const C = this.cfg.camera;
    const { eye, look } = core.cameraPose();
    look[1] += model.lift;
    eye[1] += model.lift;
    if (this.shake > 0) {
      eye[0] += (Math.random() - 0.5) * this.shake;
      eye[1] += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    // Keep the camera out of the ground and out of buildings (it slides in toward the hero).
    eye[1] = Math.max(eye[1], 0.5);
    pullCamera(sim, look, eye);
    // Watching someone who shelters in a building: rather than inside their head, look down
    // from above the eaves.
    if (this.watching && Math.hypot(eye[0] - look[0], eye[2] - look[2]) < 2.4) {
      eye[0] = look[0] + Math.sin(core.camYaw) * 2.4;
      eye[2] = look[2] + Math.cos(core.camYaw) * 2.4;
      eye[1] = look[1] + 4.5;
    }
    view.setChase(eye, look, C.fov, 80); // trees load ~170 m round the hero
    if (this.sky) this.sky.position.set(eye[0], 0, eye[2]);
    this.backdrop?.update(eye[0], eye[2], core.x, core.z, now / 1000);
    // Worn earth (the diorama's wear map, PK 1.7.0) grows no grass in 3D either.
    const wear = this.host.view().wear;
    const soilAt = this.host.data.diorama.ground.soilFrom + 0.1;
    this.ground?.update(core.x, core.z, now / 1000, (x, z) => {
      const g = groundAt(sim, x, z);
      if (g !== 'grass' || !wear) return g;
      const [tx, tz] = worldToTile(sim.map, x, z);
      return wear.at(tx, tz) > soilAt ? 'none' : g;
    });
    if (this.sky) {
      const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
      u.uTime!.value = now / 1000;
      u.uNight!.value = view.night;
    }
    this.backdrop?.setNight(view.night);
    // What E would do here (checked a few times a second).
    if (now - this.targetAt > 200) {
      this.targetAt = now;
      this.target = workTarget(sim, this.cfg, body);
    }
    this.checkQuest(sim, now);
    if (now - this.lastUi > 66) {
      this.lastUi = now;
      this.renderHud(sim, u ?? null, now);
    }
  }

  private hurt(dmg: number): void {
    const core = this.core!;
    if (!core.hurt()) return;
    this.flashHurt = 1;
    this.shake = Math.max(this.shake, 0.25);
    this.float(core.x, 2.2 + core.y, core.z, `-${Math.round(dmg)}`, 'k-hf-hurt');
  }

  /** The world reacts to the hero's acts: strikes, the skill, work, jumps. */
  private act(a: HeroAct, body: HeroBody, sim: KingdomSim, now: number): void {
    const kit = this.kit!;
    const core = this.core!;
    const view = this.host.view();
    const fx = view.particles;
    if (this.watching) return;
    const ahead = (d: number): XZ => [
      body.x + Math.sin(body.heading) * d,
      body.z + Math.cos(body.heading) * d,
    ];
    if (a.kind === 'jump') this.host.sound.play('click', { gain: 0.4 });
    if (a.kind === 'land') fx.burst('dust', body.x, 0.1, body.z, 6);
    if (a.kind === 'dash') fx.burst('dust', body.x, 0.2, body.z, 8);
    if (a.kind === 'strike') {
      if (kit.weapon === 'bow') {
        const foe = nearestFoe(sim, body, kit.reach, this.cfg.tuning.aimCone);
        const [tx, tz] = foe ? [foe.x, foe.z] : ahead(kit.reach);
        this.fire(body, tx, tz, foe, a.mul, 1.2);
        this.host.sound.play('arrow');
        return;
      }
      const r = strike(
        sim,
        this.cfg,
        body,
        kit.reach + (core.combo === 2 ? this.cfg.tuning.thirdReach : 0),
        kit.arc,
        a.mul,
      );
      this.host.sound.play(kit.weapon === 'spear' || kit.weapon === 'lance' ? 'spear' : 'sword', {
        gain: 0.8,
      });
      this.slash(body, core.combo, a.mul > 1.4 ? 1.25 : 1);
      this.showHits(r.hits, sim);
      if (r.hits.length) {
        this.hitStop = 0.07;
        this.shake = Math.max(this.shake, a.mul > 1.4 ? 0.35 : 0.18);
      }
      return;
    }
    if (a.kind === 'work') {
      const t = this.target ?? workTarget(sim, this.cfg, body);
      if (!t) {
        // Nothing to work: a work swing is a light strike (a villager defends himself).
        const r = strike(sim, this.cfg, body, kit.reach, kit.arc, this.cfg.tuning.bareWork);
        this.showHits(r.hits, sim);
        return;
      }
      const got = doWork(sim, this.cfg, kit, body, t);
      this.afterWork(t, got, now);
      return;
    }
    if (a.kind !== 'skill') return;
    const S = kit.skill;
    this.yantraFor(S.kind, S.radius, body, ahead);
    switch (S.kind) {
      case 'spin': {
        const r = strike(sim, this.cfg, body, S.radius, Math.PI * 2, S.power);
        for (let i = 0; i < 3; i++)
          this.slash({ ...body, heading: body.heading + (i * Math.PI * 2) / 3 }, 0, S.radius / 1.6);
        this.showHits(r.hits, sim);
        fx.burst('dust', body.x, 0.3, body.z, 18);
        this.shake = 0.4;
        this.host.sound.play('hit');
        break;
      }
      case 'dash': {
        // Lunge forward (stopping at walls), then strike in front.
        for (let i = 0; i < 12; i++) {
          const [nx, nz] = [core.x + Math.sin(core.heading) * 0.3, core.z + Math.cos(core.heading) * 0.3];
          if (!heroOpen(sim, nx, nz)) break;
          core.x = nx;
          core.z = nz;
        }
        const r = strike(sim, this.cfg, { ...body, x: core.x, z: core.z }, S.radius, 1.8, S.power);
        this.slash({ ...body, x: core.x, z: core.z }, 2, 1.5);
        this.showHits(r.hits, sim);
        fx.burst('dust', core.x, 0.2, core.z, 12);
        this.shake = 0.35;
        this.host.sound.play('sword');
        break;
      }
      case 'volley': {
        const [cx, cz] = ahead(this.cfg.tuning.volleyAhead);
        const cap = this.cfg.tuning.volleyMax;
        let n = 0;
        for (const u of sim.units.values()) {
          if (n >= cap || u.team === PLAYER || Math.hypot(u.x - cx, u.z - cz) > S.radius) continue;
          this.fire(body, u.x, u.z, { x: u.x, z: u.z, unit: u }, S.power, 6);
          n++;
        }
        for (const an of sim.animals.values()) {
          if (n >= cap || Math.hypot(an.x - cx, an.z - cz) > S.radius) continue;
          this.fire(body, an.x, an.z, { x: an.x, z: an.z, animal: an }, S.power, 6);
          n++;
        }
        for (let i = n; i < 8; i++)
          this.fire(
            body,
            cx + (Math.random() - 0.5) * S.radius * 1.6,
            cz + (Math.random() - 0.5) * S.radius * 1.6,
            null,
            0,
            6,
          );
        this.host.sound.play('arrow');
        break;
      }
      case 'heal': {
        const n = heal(sim, body, S.radius, S.power);
        if (this.unitId === null)
          this.kingHp = Math.min(this.cfg.king.hp, this.kingHp + this.cfg.king.hp * S.power);
        this.stats.heal += n;
        fx.burst('gold', body.x, 1.6, body.z, 30);
        view.flash(body.x, body.z, S.radius * 0.6, now / 1000);
        this.float(body.x, 2.6, body.z, `✨ ${km(n)}`, 'k-hf-heal');
        this.host.sound.play('complete');
        break;
      }
      case 'dog': {
        const foe = nearestFoe(sim, body, S.radius);
        if (foe) {
          this.dogTask = { foe, t: 0, mul: S.power };
          this.host.sound.play('dog');
        } else {
          // Nothing to chase: the dog sniffs out the way to a place not yet found.
          let best: { p: (typeof sim.places)[number]; d: number } | null = null;
          for (const p of sim.places) {
            if (sim.discovered.has(p.id)) continue;
            const [px, pz] = tileToWorld(sim.map, p.at[0], p.at[1]);
            const d = Math.hypot(px - body.x, pz - body.z);
            if (!best || d < best.d) best = { p, d };
          }
          if (best) {
            const [px, pz] = tileToWorld(sim.map, best.p.at[0], best.p.at[1]);
            const dir = compass(Math.atan2(px - body.x, pz - body.z));
            this.host.toast(
              `🐕 <b>ឆ្កែធុំក្លិន</b> · The dog picks up a scent: ${esc(best.p.km)} · ${esc(best.p.en)} — ${dir.km} · ${dir.en}, ${km(best.d / 1000)} km`,
              6,
            );
          }
          this.host.sound.play('dog');
        }
        break;
      }
      case 'chop': {
        // Mighty chop: everything to work round him gives three times, foes are thrown back.
        let gave = 0;
        for (let i = 0; i < this.cfg.tuning.chopTimes; i++) {
          const t = workTarget(sim, this.cfg, body);
          if (!t || t.kind === 'store') break;
          const got = doWork(sim, this.cfg, kit, body, t, S.power);
          this.afterWork(t, got, now);
          gave++;
        }
        const r = strike(sim, this.cfg, body, S.radius, Math.PI * 2, this.cfg.tuning.chopKnock);
        this.showHits(r.hits, sim);
        fx.burst('chips', body.x, 0.6, body.z, 20);
        this.shake = 0.3;
        if (!gave && !r.hits.length) this.host.sound.play('deny');
        break;
      }
    }
  }

  /**
   * A skill's yantra: a halo opening behind the hero, and over the area it touches a canopy
   * (above head height: a yantra is never put under the feet). Gold for the king and for
   * blessings, moonlight blue for the others.
   */
  private yantraFor(skill: string, radius: number, body: HeroBody, ahead: (d: number) => XZ): void {
    const kit = this.kit!;
    const lift = this.model?.lift ?? 0;
    const color = kit.id === 'king' || skill === 'heal' ? 0xffcf6a : 0x9fd8ff;
    const kind = yantraFor(skill);
    const bx = body.x - Math.sin(body.heading) * 0.45;
    const bz = body.z - Math.cos(body.heading) * 0.45;
    this.yantra.spawn(kind, bx, 1.45 + lift, bz, kit.id === 'king' ? 3.2 : 2.6, color);
    if (skill === 'heal' || skill === 'spin' || skill === 'chop')
      this.yantra.spawn(kind, body.x, 3.4 + lift, body.z, Math.max(3, radius * 2), color, true);
    else if (skill === 'volley') {
      const [x, z] = ahead(this.cfg.tuning.volleyAhead);
      this.yantra.spawn('grid', x, 3.6, z, Math.max(4, radius * 2), color, true);
    }
  }

  /** A sword-slash crescent for this swing (gold for the king's sacred sword). */
  private slash(body: HeroBody, combo: number, size: number): void {
    const kit = this.kit!;
    if (kit.weapon === 'bow') return;
    const color = kit.id === 'king' ? 0xffd27a : kit.weapon === 'axe' ? 0xffe2b0 : 0xbfe4ff;
    this.slashes.spawn(
      body.x,
      1.15 + (this.model?.lift ?? 0) + this.core!.y,
      body.z,
      body.heading,
      combo,
      size,
      color,
    );
  }

  /**
   * The tiger (PK): near the forest, now and then a tiger comes out of the trees and stalks
   * the hero. The sim's predator rules chase and bite a played unit; the king (not a sim unit)
   * is chased and bitten here.
   */
  private updateTiger(dt: number, body: HeroBody, sim: KingdomSim): void {
    const T = this.host.data.anachak.tiger;
    if (this.tigerId !== null) {
      const a = sim.animals.get(this.tigerId);
      if (!a) {
        this.tigerId = null;
        this.host.toast('🐅 <b>ខ្លាត្រូវបានបង្ក្រាប</b> · The tiger is beaten!', 5);
        this.host.sound.play('complete');
        return;
      }
      if (this.unitId === null) {
        const k = sim.kindOf(a);
        const d = Math.hypot(body.x - a.x, body.z - a.z);
        if (d > 1.3) sim.stepAnimal(a, body.x, body.z, k.speed * dt);
        else if (sim.time >= this.kingBiteAt) {
          this.kingBiteAt = sim.time + T.kingBite;
          a.heading = Math.atan2(body.x - a.x, body.z - a.z);
          this.kingHp -= Math.max(1, k.attack - this.cfg.king.armor * 0.5);
          a.ready = sim.time + T.kingBite; // the swipe shows
          this.hurt(k.attack);
        }
        if (d > T.dist[1] * 3) this.tigerId = null; // it lost him
      }
      return;
    }
    if (sim.time < this.tigerAt) return;
    this.tigerAt = sim.time + T.everySec;
    // Only in or by the forest.
    let forest = false;
    for (let i = 0; i < 12 && !forest; i++) {
      const ang = (i / 12) * Math.PI * 2;
      forest =
        groundAt(sim, body.x + Math.sin(ang) * T.dist[0], body.z + Math.cos(ang) * T.dist[0]) === 'forest';
    }
    if (!forest || Math.random() > T.chance) return;
    const a = tigerEncounter(sim, body.x, body.z, this.unitId);
    if (!a) return;
    this.tigerId = a.id;
    this.host.sound.play('animal');
    this.shake = Math.max(this.shake, 0.2);
    const dir = compass(Math.atan2(a.x - body.x, a.z - body.z));
    this.host.toast(
      `🐅 <b>ខ្លា! ខ្លាចេញពីព្រៃ</b> · A tiger comes out of the forest — ${dir.km} · ${dir.en}`,
      5,
    );
  }

  /** Draw the nearest tiger (within 45 m) as a hero-style model, posed from the sim. */
  private showTiger(dt: number, body: HeroBody, sim: KingdomSim, now: number): void {
    const view = this.host.view();
    let best: { a: NonNullable<ReturnType<typeof sim.animals.get>>; d: number } | null = null;
    const pick = this.tigerId !== null ? sim.animals.get(this.tigerId) : undefined;
    if (pick) best = { a: pick, d: 0 };
    else
      for (const a of sim.animals.values()) {
        if (a.kind !== 'tiger') continue;
        const d = Math.hypot(a.x - body.x, a.z - body.z);
        if (d < 45 && (!best || d < best.d)) best = { a, d };
      }
    if (!best) {
      if (this.tigerModel) this.tigerModel.group.visible = false;
      view.hiddenAnimal = null;
      this.tigerShown = null;
      return;
    }
    const a = best.a;
    if (!this.tigerModel) this.tigerModel = new TigerModel();
    const m = this.tigerModel;
    if (m.group.parent !== view.scene) view.scene.add(m.group);
    m.group.visible = true;
    view.hiddenAnimal = a.id;
    let st = this.tigerShown;
    if (!st || st.id !== a.id)
      st = this.tigerShown = { id: a.id, x: a.x, z: a.z, ready: a.ready, attack: -1, speed: 0 };
    const v = dt > 0 ? Math.hypot(a.x - st.x, a.z - st.z) / dt : 0;
    st.speed += (Math.min(v, 12) - st.speed) * Math.min(1, dt * 6);
    // A bite (the sim pushes its next-ready time on): play the swipe.
    if (a.ready > st.ready + 0.5) st.attack = 0;
    st.ready = a.ready;
    if (st.attack >= 0) {
      st.attack += dt / 0.6;
      if (st.attack >= 1) st.attack = -1;
    }
    st.x = a.x;
    st.z = a.z;
    m.group.position.set(a.x, 0, a.z);
    let dh = a.heading - m.group.rotation.y;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    m.group.rotation.y += dh * Math.min(1, dt * 8);
    m.pose(st.speed, dt, st.attack, now / 1000);
  }

  private afterWork(t: WorkTarget, got: ReturnType<typeof doWork>, now: number): void {
    const fx = this.host.view().particles;
    const [x, z] = t.at;
    if (!got) {
      this.host.sound.play('deny', { gain: 0.5 });
      if (t.kind !== 'store') this.float(x, 2, z, 'ពេញដៃ · Hands full', 'k-hf-info');
      return;
    }
    if (t.kind === 'store') {
      this.stats.store++;
      this.float(x, 3, z, `+${km(got.n)} ${RES_ICON[got.res!] ?? ''}`, 'k-hf-gain');
      this.host.view().flash(x, z, 2, now / 1000);
      this.host.sound.play('complete');
      return;
    }
    if (t.kind === 'build') {
      this.stats.build++;
      fx.burst('dust', x, 1, z, 6);
      this.float(x, 3, z, `🔨 +${km(got.n)}%`, 'k-hf-gain');
      this.host.sound.play('hammer');
      return;
    }
    this.stats.gather += got.n;
    const node = t.kind === 'node' ? t.node.kind : 'farm';
    fx.burst(node === 'tree' ? 'chips' : node === 'farm' ? 'leaves' : 'sparks', x, 0.8, z, 8);
    this.float(x, 2.2, z, `+${km(got.n)} ${RES_ICON[got.res!] ?? ''}`, 'k-hf-gain');
    this.host.sound.play(node === 'tree' ? 'chop' : node === 'farm' ? 'farm' : 'mine');
  }

  private showHits(
    hits: Array<{ x: number; z: number; dmg: number; kill: boolean; what: string }>,
    sim: KingdomSim,
  ): void {
    const fx = this.host.view().particles;
    for (const h of hits) {
      fx.burst('hit', h.x, 1.2, h.z, 8);
      this.float(h.x, 2.2, h.z, `${km(h.dmg)}`, h.kill ? 'k-hf-crit' : 'k-hf-dmg');
      if (h.kill && h.what === 'unit') this.stats.defeat++;
      if (h.kill && h.what === 'animal') this.stats.hunt++;
    }
    if (hits.length) this.host.sound.play('hit');
    void sim;
  }

  /** An arrow on its way (it lands after its flight; a target hit takes the damage then). */
  private fire(
    body: HeroBody,
    tx: number,
    tz: number,
    foe: ReturnType<typeof nearestFoe>,
    mul: number,
    arc: number,
  ): void {
    const view = this.host.view();
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    const from = new THREE.Vector3(body.x, 1.5 + (this.model?.lift ?? 0), body.z);
    const to = new THREE.Vector3(tx, 1.0, tz);
    const dist = from.distanceTo(to);
    mesh.position.copy(from);
    view.scene.add(mesh);
    this.shots.push({ mesh, from, to, t: 0, dur: Math.max(0.15, dist / 38), foe, mul, arc });
  }

  private updateShots(dt: number, body: HeroBody, sim: KingdomSim, now: number): void {
    const view = this.host.view();
    for (const s of this.shots) {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const p = s.from.clone().lerp(s.to, k);
      p.y += Math.sin(k * Math.PI) * s.arc;
      const prev = s.mesh.position.clone();
      s.mesh.position.copy(p);
      s.mesh.lookAt(p.clone().add(p.clone().sub(prev)));
      if (k >= 1) {
        view.scene.remove(s.mesh);
        if (s.foe && s.mul > 0) {
          const r = hitFoe(sim, this.cfg, body, s.foe, s.mul);
          if (r)
            this.showHits(
              [{ x: s.to.x, z: s.to.z, dmg: r.dmg, kill: r.kill, what: s.foe.unit ? 'unit' : 'animal' }],
              sim,
            );
        } else view.particles.burst('dust', s.to.x, 0.1, s.to.z, 3);
      }
    }
    this.shots = this.shots.filter((s) => s.t < s.dur);
    void now;
  }

  /** The hunter's dog: at heel, or running down a foe and biting. */
  private updateDog(dt: number, body: HeroBody, sim: KingdomSim, now: number): void {
    const dog = this.model?.dog;
    if (!dog) return;
    const core = this.core!;
    let tx = body.x + Math.sin(body.heading + 1.9) * 1.3;
    let tz = body.z + Math.cos(body.heading + 1.9) * 1.3;
    let speed = Math.max(core.speed, 1) * 1.15;
    if (this.dogTask) {
      const f = this.dogTask.foe;
      const live = f.unit ? sim.units.get(f.unit.id) : f.animal ? sim.animals.get(f.animal.id) : null;
      if (!live) this.dogTask = null;
      else {
        tx = live.x;
        tz = live.z;
        speed = 11;
        this.dogTask.t += dt;
        if (Math.hypot(this.dogPos.x - tx, this.dogPos.z - tz) < 1.2 && this.dogTask.t > 0.2) {
          const r = hitFoe(sim, this.cfg, body, f, this.dogTask.mul);
          if (r)
            this.showHits(
              [{ x: tx, z: tz, dmg: r.dmg, kill: r.kill, what: f.unit ? 'unit' : 'animal' }],
              sim,
            );
          this.host.sound.play('dog');
          this.dogTask = null;
        } else if (this.dogTask.t > 6) this.dogTask = null;
      }
    }
    const dx = tx - this.dogPos.x;
    const dz = tz - this.dogPos.z;
    const d = Math.hypot(dx, dz);
    let v = 0;
    if (d > 0.3) {
      v = Math.min(d / Math.max(dt, 1e-3), speed);
      this.dogPos.x += (dx / d) * v * dt;
      this.dogPos.z += (dz / d) * v * dt;
      dog.root.rotation.y = Math.atan2(dx, dz);
    }
    if (d > 25) this.dogPos.set(tx, 0, tz);
    dog.root.position.set(this.dogPos.x, dog.root.position.y, this.dogPos.z);
    this.dogStride += v * dt * 4.1;
    this.model!.poseDog(this.dogStride, v);
    void now;
  }

  // ------------------------------------------------------------------ the king's tasks

  private nextQuest(): void {
    const Q = this.cfg.quests;
    const mine = Q.list.filter((q) => q.kits.includes(this.kit!.id));
    if (!mine.length) {
      this.quest = null;
      return;
    }
    const q = mine[this.questDone % mine.length]!;
    const grow = Math.pow(Q.grow, Math.floor(this.questDone / mine.length));
    this.quest = { ...q, need: Math.round(q.n * grow), have: this.stats[q.kind] };
  }

  private checkQuest(sim: KingdomSim, now: number): void {
    const q = this.quest;
    if (!q) return;
    const got = this.stats[q.kind] - q.have;
    if (got < q.need) return;
    const reward: Cost = {};
    for (const [r, n] of Object.entries(q.reward))
      reward[r as keyof Cost] = Math.round(
        (n ?? 0) * Math.pow(this.cfg.quests.grow, Math.floor(this.questDone / 3)),
      );
    sim.addResources(reward);
    const pay = Object.entries(reward)
      .map(([r, n]) => `+${km(n ?? 0)} ${RES_ICON[r] ?? r}`)
      .join(' ');
    this.host.toast(`📜 <b>${esc(q.km)}</b> · ${esc(q.en)} ✓ ${pay}`, 5);
    this.host.view().flash(this.core!.x, this.core!.z, 2.5, now / 1000);
    this.host.sound.play('complete');
    this.questDone++;
    this.nextQuest();
  }

  // ------------------------------------------------------------------ HUD

  private float(x: number, y: number, z: number, text: string, cls: string): void {
    this.floats.push({ x, y, z, text, cls, at: performance.now() });
    if (this.floats.length > 24) this.floats.shift();
  }

  /** The HUD's fixed parts (built once per hero, so buttons never change under a finger). */
  private buildHud(): void {
    const kit = this.kit!;
    const btn = (a: string, icon: string, kmT: string, en: string) =>
      `<button class="k-hb k-hb-${a}" data-hero="${a}" data-ui><span class="k-hb-i">${icon}</span><span class="k-hb-t">${kmT}<small>${en}</small></span><span class="k-hb-cd" hidden></span></button>`;
    const skillIcon: Record<string, string> = {
      chop: '🪓',
      spin: '🌀',
      dash: '💥',
      volley: '🏹',
      heal: '✨',
      dog: '🐕',
    };
    if (this.watching) {
      // Watching: the story goes on by itself; one button (or E / a move key) takes control.
      this.el.innerHTML =
        `<div class="k-hero-vig" data-part="vig"></div>` +
        `<div class="k-hero-card" data-part="card"></div>` +
        `<div class="k-hero-watch">🎥 <b>កំពុងមើល</b> · Watching — life goes on by itself</div>` +
        `<button class="k-hero-exit" data-hero="exit" data-ui>✕ ត្រឡប់ · Back <small>Esc</small></button>` +
        `<button class="k-hero-take" data-hero="take" data-ui>🎮 <b>លេងខ្លួនឯង</b> · Take control <small>E</small></button>` +
        `<div class="k-hero-floats" data-part="floats"></div>`;
      this.parts.clear();
      this.el.querySelectorAll<HTMLElement>('[data-part]').forEach((e) => this.parts.set(e.dataset.part!, e));
      this.partHtml.clear();
      return;
    }
    this.el.innerHTML =
      `<div class="k-hero-vig" data-part="vig"></div>` +
      `<div class="k-hero-card" data-part="card"></div>` +
      `<div data-part="quest"></div>` +
      `<button class="k-hero-exit" data-hero="exit" data-ui>✕ ត្រឡប់ · Back <small>Esc</small></button>` +
      `<div data-part="prompt"></div>` +
      `<div class="k-hero-acts">` +
      btn('work', '🛠️', 'ធ្វើការ', 'Work · E') +
      btn('skill', skillIcon[kit.skill.kind] ?? '⭐', esc(kit.skill.km), `${esc(kit.skill.en)} · R`) +
      btn('dash', '💨', 'គេច', 'Dash · Q') +
      btn('jump', '⤒', 'លោត', 'Jump · Space') +
      btn('attack', kit.weapon === 'bow' ? '🏹' : '⚔️', 'វាយ', 'Strike · Click') +
      `</div>` +
      (this.host.mobile
        ? `<div class="k-hero-stick" data-hero="stick" data-ui><i data-part="knob"></i></div>`
        : `<div class="k-hero-help">WASD ដើរ · move · Shift រត់ · run · ចុចស្ដាំ+អូស = មើលជុំវិញ · right-drag: turn the camera · Wheel: zoom</div>`) +
      `<div class="k-hero-floats" data-part="floats"></div>`;
    this.parts.clear();
    this.el.querySelectorAll<HTMLElement>('[data-part]').forEach((e) => this.parts.set(e.dataset.part!, e));
    this.partHtml.clear();
  }

  private readonly parts = new Map<string, HTMLElement>();
  private readonly partHtml = new Map<string, string>();
  private setPart(name: string, html: string): void {
    const e = this.parts.get(name);
    if (!e || this.partHtml.get(name) === html) return;
    this.partHtml.set(name, html);
    e.innerHTML = html;
  }

  private renderHud(sim: KingdomSim, u: Unit | null, now: number): void {
    const core = this.core!;
    const kit = this.kit!;
    const view = this.host.view();
    if (!this.parts.size) this.buildHud();
    const name = u ? (u.name ?? { km: sim.def(u.type).km, en: sim.def(u.type).en }) : this.host.kingName();
    const hp = u ? u.hp : this.kingHp;
    const max = u ? sim.def(u.type).hp : this.cfg.king.hp;
    const st = core.stamina / this.cfg.move.staminaMax;
    const lbl = workLabel(this.target);
    const carry =
      u?.carry && u.carry.n >= 1
        ? `${RES_ICON[u.carry.res]} ${km(Math.floor(u.carry.n))}/${km(sim.def(u.type).carry ?? 10)}`
        : '';
    const q = this.quest;
    const qGot = q ? Math.min(q.need, this.stats[q.kind] - q.have) : 0;
    this.flashHurt = Math.max(0, this.flashHurt - 0.12);
    this.parts.get('vig')!.style.opacity = this.flashHurt.toFixed(2);
    this.setPart(
      'card',
      `<div class="k-hero-name"><b>${esc(name.km)}</b> · ${esc(name.en)}</div>` +
        `<div class="k-hero-bar k-hero-hp"><i style="width:${Math.max(0, (hp / max) * 100).toFixed(1)}%"></i><span>${km(Math.max(0, hp))} / ${km(max)}</span></div>` +
        `<div class="k-hero-bar k-hero-st"><i style="width:${(st * 100).toFixed(0)}%"></i></div>` +
        (carry ? `<div class="k-hero-carry">${carry}</div>` : ''),
    );
    this.setPart(
      'quest',
      q
        ? `<div class="k-hero-quest"><b>📜 ${esc(q.km)}</b><span>${esc(q.en)}</span><em>${km(qGot)} / ${km(q.need)}</em></div>`
        : '',
    );
    this.setPart(
      'prompt',
      lbl ? `<div class="k-hero-prompt"><kbd>E</kbd> ${esc(lbl.km)} · ${esc(lbl.en)}</div>` : '',
    );
    // Cooldowns on their buttons.
    const cd = (a: string, left: number, total: number) => {
      const e = this.el.querySelector<HTMLElement>(`.k-hb-${a} .k-hb-cd`);
      if (!e) return;
      e.hidden = left <= 0;
      if (left > 0) {
        e.style.setProperty('--p', (left / total).toFixed(3));
        const t = km(Math.ceil(left));
        if (e.textContent !== t) e.textContent = t;
      }
    };
    cd('skill', core.skillLeft(), kit.skill.cd);
    cd('dash', Math.max(0, core.dashReady - core.t), this.cfg.move.dashCd);
    const knob = this.parts.get('knob');
    if (knob)
      knob.style.transform = `translate(${(this.stick.x * 60).toFixed(0)}px,${(-this.stick.y * 60).toFixed(0)}px)`;
    // Floating numbers, projected each update.
    this.floats = this.floats.filter((f) => now - f.at < 1100);
    this.setPart(
      'floats',
      this.floats
        .map((f) => {
          const k = (now - f.at) / 1100;
          const p = view.project(f.x, f.y + k * 1.2, f.z);
          return `<span class="k-hf ${f.cls}" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;opacity:${(1 - k * k).toFixed(2)}">${esc(f.text)}</span>`;
        })
        .join(''),
    );
  }

  // ------------------------------------------------------------------ drawing

  /** The 90s anime look (anachak.json look: 'anime'); otherwise the Build tab's look. */
  get anime(): boolean {
    return this.host.data.anachak.look === 'anime';
  }

  /** Draw the frame. Returns the scene's share for the budget meter. */
  draw(renderer: THREE.WebGLRenderer): { sceneCalls: number; sceneTriangles: number } {
    const view = this.host.view();
    if (this.anime) {
      this.cel.render(renderer, view.scene, view.camera);
      return this.cel.last;
    }
    renderer.render(view.scene, view.camera);
    const r = renderer.info.render;
    return { sceneCalls: r.calls, sceneTriangles: r.triangles };
  }
}

/**
 * Bring the camera in front of a building between it and the hero (so a wall never fills the
 * view): march from the hero out to the eye and stop before the first roof or wall.
 */
export function pullCamera(
  sim: KingdomSim,
  look: [number, number, number],
  eye: [number, number, number],
): void {
  const T = sim.map.tile;
  // Boxes the camera keeps out of: buildings, and the royal court's parasols before each hall.
  const boxes: Array<{ cx: number; cz: number; hw: number; hd: number; h: number }> = [];
  for (const b of sim.buildings.values()) {
    if (b.type === 'riceField') continue;
    const [cx, cz] = sim.center(b);
    if (Math.hypot(cx - look[0], cz - look[2]) > 30) continue;
    const hw = (b.w * T) / 2 + 0.4;
    const hd = (b.d * T) / 2 + 0.4;
    boxes.push({ cx, cz, hw, hd, h: Math.max(2.5, Math.min(b.w, b.d) * T * 0.75) });
    if (b.type === 'townCentre' && b.team === PLAYER && b.progress >= 1)
      boxes.push({ cx, cz: cz + 7.0, hw: 2.2, hd: 1.4, h: 3.6 });
  }
  // Tree trunks and crowns too (PK 1.7.0: a tree behind the hero filled the whole view).
  for (const n of sim.nodes.values()) {
    if (n.kind !== 'tree') continue;
    const [nx, nz] = sim.nodePos(n);
    if (Math.abs(nx - look[0]) > 14 || Math.abs(nz - look[2]) > 14) continue;
    boxes.push({ cx: nx, cz: nz, hw: 1.1, hd: 1.1, h: 9 });
  }
  if (!boxes.length) return;
  const dx = eye[0] - look[0];
  const dy = eye[1] - look[1];
  const dz = eye[2] - look[2];
  const len = Math.hypot(dx, dy, dz);
  let ok = 1;
  let free = 0.6;
  for (let d = 0.6; d <= len; d += 0.4) {
    const k = d / len;
    const x = look[0] + dx * k;
    const y = look[1] + dy * k;
    const z = look[2] + dz * k;
    const hit = boxes.some((b) => Math.abs(x - b.cx) < b.hw && Math.abs(z - b.cz) < b.hd && y < b.h);
    if (hit) {
      ok = Math.max(0.12, (free - 0.2) / len);
      break;
    }
    free = d;
  }
  if (ok >= 1) return;
  eye[0] = look[0] + dx * ok;
  eye[1] = look[1] + dy * ok;
  eye[2] = look[2] + dz * ok;
}

/** Eight compass words for a heading (0 = south, +x east in this world: z grows south). */
export function compass(a: number): { km: string; en: string } {
  // World +z is south on the map (tiles: z south), so heading 0 points south.
  const names = [
    { km: 'ខាងត្បូង', en: 'south' },
    { km: 'អាគ្នេយ៍', en: 'south-east' },
    { km: 'ខាងកើត', en: 'east' },
    { km: 'ឦសាន', en: 'north-east' },
    { km: 'ខាងជើង', en: 'north' },
    { km: 'ពាយព្យ', en: 'north-west' },
    { km: 'ខាងលិច', en: 'west' },
    { km: 'និរតី', en: 'south-west' },
  ];
  const k = Math.round(((((a / (Math.PI * 2)) % 1) + 1) % 1) * 8) % 8;
  return names[k]!;
}

/** What grows at a point: grass on open land, a thicker floor in the forest, none on water,
 * roads, rock or ruins. */
export function groundAt(sim: KingdomSim, x: number, z: number): GroundKind {
  const half = (sim.map.size * sim.map.tile) / 2;
  if (Math.abs(x) >= half || Math.abs(z) >= half) return 'none';
  if (sim.onRoad(x, z)) return 'none';
  const i = sim.tileIndex(x, z);
  const t = sim.map.terrain[i];
  // Buildings close their tiles (the grass stays out of floors and courts).
  if (t === 'grass' && !sim.grid.open[i]) return 'none';
  return t === 'grass' ? 'grass' : t === 'forest' ? 'forest' : t === 'hill' ? 'bare' : 'none';
}
