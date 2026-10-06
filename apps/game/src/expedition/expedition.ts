import * as THREE from 'three';
import type { Configs, FeedLine, GameState, HeroConfig } from '@temples/shared';
import { RENDER_SIZE } from '@temples/shared';
import { JungleScene } from './jungleScene';
import { ExpeditionHud, GameCursor } from './hud';
import { HeroState, HeroVotes } from './hero';
import { CAMP, HALF, heightAt, isWalkable, rayToGround, walkGrid, type XZ } from './kulenMap';
import { Combat, type ActionResult, type Target } from './combat';
import { styleScene } from '../engine/look';
import { Quarry } from './quarry';

/** Seconds viewers get to vote before the hero is chosen automatically. */
export const SELECT_SECONDS = 30;

/**
 * Kulen Expedition mode (prompts E01–E03, PK's controls):
 * - Arrow keys walk the hero (up = north, away from the camera).
 * - The mouse aims: the hero faces the cursor; a gold ring = target in reach, red = too far.
 * - Click an enemy (or training post) in reach: strike. Q W E R: blessing at the cursor.
 * - Space: dash. Wheel: zoom. Right-click on the ground: walk there. Minimap click: look there.
 */
export class Expedition {
  readonly jungle: JungleScene;
  readonly hud: ExpeditionHud;
  readonly cursor: GameCursor;
  hero: HeroState | null = null;
  heroCfg: HeroConfig | null = null;
  readonly votes = new HeroVotes();
  private selectUntil = 0;
  private active = false;
  private readonly cam = { x: CAMP[0], z: CAMP[1], dist: 26, follow: true };
  private last = 0;
  private readonly grid = walkGrid();
  private readonly ray = new THREE.Raycaster();
  private stageRect: () => DOMRect;
  private readonly stage: HTMLElement;
  readonly combat: Combat;
  /** The Old Quarry: cut blocks and carry them to the camp pile. */
  readonly quarry: Quarry;
  /** When the hero was chosen (the how-to card shows for the first seconds). */
  private heroAt = 0;
  /** Arrow keys held right now. */
  private readonly keys = new Set<string>();
  /** Cursor in stage pixels (null = off the game). */
  private cursorPx: { x: number; y: number } | null = null;
  aim: XZ | null = null;
  hovered: Target | null = null;
  private floats: Array<{ text: string; x: number; y: number; z: number; at: number; color: string }> = [];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    stage: HTMLElement,
    overlay: HTMLElement,
    private readonly configs: Configs,
    /** Seconds for the hero vote (tests on slow machines pass a longer time). */
    private readonly selectSeconds = SELECT_SECONDS,
  ) {
    this.jungle = new JungleScene(renderer, configs.expedition);
    this.hud = new ExpeditionHud(overlay, configs.expedition);
    this.cursor = new GameCursor(overlay);
    this.cam.dist = configs.expedition.camera.startDistance;
    this.stageRect = () => stage.getBoundingClientRect();
    this.stage = stage;
    this.hud.onPickHero = (i) => this.chooseHero(i);
    this.hud.onMinimap = (x, z, button) => {
      if (button === 2 && this.hero) this.order([x, z], performance.now());
      else this.panTo(x, z);
    };
    this.hud.onSkill = (k) => this.skill(k);
    this.combat = new Combat(configs.expedition);
    this.quarry = new Quarry(configs.expedition.quarry);
    this.jungle.setTargets(this.combat.targets);
    this.bindInput(stage);
  }

  /** Enter Expedition mode (from the host panel): hero choice first. */
  start(now: number): void {
    if (this.active) return;
    this.active = true;
    this.hud.show(true);
    this.cursor.show(true);
    this.stage.style.cursor = 'none';
    if (!this.hero) {
      this.selectUntil = now + this.selectSeconds * 1000;
      this.votes.clear();
    }
  }

  stop(): void {
    this.active = false;
    this.hud.show(false);
    this.cursor.show(false);
    this.stage.style.cursor = '';
  }

  get isActive(): boolean {
    return this.active;
  }

  get selecting(): boolean {
    return this.active && !this.hero;
  }

  chooseHero(index: 0 | 1 | 2): void {
    const cfg = this.configs.expedition.heroes[index];
    if (!cfg) return;
    this.heroCfg = cfg;
    const at: XZ = this.hero ? [this.hero.x, this.hero.z] : CAMP;
    this.hero = new HeroState(cfg, at);
    this.jungle.setHero(cfg.id);
    this.cam.follow = true;
    this.heroAt = performance.now();
  }

  vote(userId: string, choice: 1 | 2 | 3): void {
    if (this.selecting) this.votes.add(userId, choice);
  }

  /** Right-click order. */
  order(to: XZ, now: number): void {
    if (!this.hero) return;
    if (this.hero.moveTo(this.grid, to)) {
      const t = this.hero.target ?? to;
      this.jungle.showClick(t[0], t[1], now);
      this.cam.follow = true;
    }
  }

  panTo(x: number, z: number): void {
    this.cam.x = Math.max(-HALF, Math.min(HALF, x));
    this.cam.z = Math.max(-HALF, Math.min(HALF, z));
    this.cam.follow = false;
  }

  centre(): void {
    this.cam.follow = true;
  }

  /** Q W E R: cast the hero's skill at the cursor. */
  skill(key: 'Q' | 'W' | 'E' | 'R'): void {
    const hero = this.hero;
    const hc = this.heroCfg;
    if (!hero || !hc) return;
    const id = hc.skills.find((sid) => this.configs.expedition.skills[sid]?.key === key);
    if (!id) return;
    const now = performance.now();
    const r = this.combat.cast(id, hero, this.aim, this.hovered, now, (x, z) => isWalkable(this.grid, x, z));
    this.show(r, now);
  }

  /** Left-click: strike the enemy under the cursor if it is in reach. */
  strike(): void {
    const hero = this.hero;
    const hc = this.heroCfg;
    if (!hero || !hc) return;
    const now = performance.now();
    if (!this.hovered) {
      // A rock face at the Old Quarry under the cursor: cut a block from it.
      const face = this.aim ? this.quarry.faceAt(this.aim[0], this.aim[1], 3.5) : -1;
      if (face >= 0) this.cutStone(face);
      return; // clicking empty ground does nothing: move with the arrow keys
    }
    this.show(this.combat.attack(hero, hc, this.hovered, now), now);
  }

  /** Cut a block at the Old Quarry (click a rock face, or F for the nearest one). */
  cutStone(face?: number): void {
    const hero = this.hero;
    if (!hero || !hero.alive) return;
    const now = performance.now();
    const r = this.quarry.cut([hero.x, hero.z], now, face);
    const y = heightAt(hero.x, hero.z) + 2.6;
    if (r.ok) {
      const [fx, fz] = this.configs.expedition.quarry.faces[r.face]!;
      hero.faceToward(fx, fz, 10);
      hero.stop();
      return;
    }
    const words = {
      far: 'ឆ្ងាយពេក · Too far',
      busy: '',
      carrying: 'កំពុងសែងថ្ម · Already carrying',
    }[r.reason];
    if (words) this.floats.push({ text: words, x: hero.x, y, z: hero.z, at: now, color: '#ffd9c8' });
  }

  /** Space: dash along the arrow direction (or where the hero faces). */
  dash(): void {
    const hero = this.hero;
    const hc = this.heroCfg;
    if (!hero || !hc) return;
    const now = performance.now();
    if (!this.combat.useDash(hc, now)) return;
    const [dx, dz] = this.arrowDir();
    const dir: XZ = dx || dz ? [dx, dz] : [Math.sin(hero.heading), Math.cos(hero.heading)];
    const from: XZ = [hero.x, hero.z];
    hero.dash(dir[0], dir[1], hc.dash.distance, this.grid);
    this.jungle.effects.skill(
      'garudaDash',
      { ...this.configs.expedition.skills.garudaDash!, effect: 'dashStrike', radius: 0 },
      from,
      [hero.x, hero.z],
      now,
    );
  }

  private arrowDir(): XZ {
    let dx = 0;
    let dz = 0;
    if (this.keys.has('ARROWLEFT')) dx -= 1;
    if (this.keys.has('ARROWRIGHT')) dx += 1;
    if (this.keys.has('ARROWUP')) dz -= 1;
    if (this.keys.has('ARROWDOWN')) dz += 1;
    return [dx, dz];
  }

  /** Effects and floating words for an action's result. */
  private show(r: ActionResult, now: number): void {
    const hero = this.hero;
    if (!hero) return;
    const y = heightAt(hero.x, hero.z) + 2.6;
    if (!r.ok) {
      const words = {
        range: 'ឆ្ងាយពេក · Too far',
        energy: 'អស់កម្លាំង · No energy',
        cooldown: 'រង់ចាំ · Not ready',
        noTarget: 'គ្មានគោលដៅ · No target',
        dead: '',
      }[r.reason];
      if (words) this.floats.push({ text: words, x: hero.x, y, z: hero.z, at: now, color: '#ffd9c8' });
      return;
    }
    const fx = this.jungle.effects;
    if (r.action === 'attack') {
      const ranged = this.heroCfg?.attack.kind === 'ranged';
      if (ranged) fx.bolt(r.from, r.center, now, '#ffd166');
      else fx.slash(r.from, r.center, now);
    } else if (r.skill) {
      fx.skill(r.skill, this.configs.expedition.skills[r.skill]!, r.from, r.center, now);
    }
    for (const h of r.hits) {
      this.jungle.onHit(h.target.id, now);
      this.floats.push({
        text: `-${h.damage}`,
        x: h.target.x,
        y: heightAt(h.target.x, h.target.z) + 2.4,
        z: h.target.z,
        at: now,
        color: '#ffe07a',
      });
      if (h.broke)
        this.floats.push({
          text: 'បាក់! · Broken!',
          x: h.target.x,
          y: heightAt(h.target.x, h.target.z) + 3.2,
          z: h.target.z,
          at: now + 150,
          color: '#ffffff',
        });
    }
    if (r.healed > 0)
      this.floats.push({
        text: `+${Math.round(r.healed)}`,
        x: hero.x,
        y,
        z: hero.z,
        at: now,
        color: '#9ff0c8',
      });
  }

  private toStage(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.stageRect();
    return {
      x: ((e.clientX - r.left) / r.width) * RENDER_SIZE.width,
      y: ((e.clientY - r.top) / r.height) * RENDER_SIZE.height,
    };
  }

  /** Stage pixel (1080 × 1920 space) → ground point. */
  pick(px: number, py: number): XZ | null {
    const ndc = new THREE.Vector2((px / RENDER_SIZE.width) * 2 - 1, -((py / RENDER_SIZE.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.jungle.camera);
    const o = this.ray.ray.origin;
    const d = this.ray.ray.direction;
    return rayToGround([o.x, o.y, o.z], [d.x, d.y, d.z]);
  }

  /** Mouse = aim and strike, arrows = walk, Q W E R = blessings, Space = dash, wheel = zoom. */
  private bindInput(stage: HTMLElement): void {
    stage.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const p = this.toStage(e);
      this.cursorPx = p;
      this.cursor.move(p.x, p.y);
    });
    stage.addEventListener('pointerleave', () => {
      this.cursorPx = null;
    });
    stage.addEventListener('pointerdown', (e) => {
      if (!this.active || this.selecting) return;
      const p = this.toStage(e);
      this.cursorPx = p;
      if (e.button === 0) {
        this.updateAim();
        this.strike();
      } else if (e.button === 2) {
        const hit = this.pick(p.x, p.y);
        if (hit) this.order(hit, performance.now());
      }
    });
    stage.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        const c = this.configs.expedition.camera;
        this.cam.dist = Math.max(
          c.minDistance,
          Math.min(c.maxDistance, this.cam.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1)),
        );
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toUpperCase();
      if (k.startsWith('ARROW')) {
        e.preventDefault();
        this.keys.add(k);
        this.cam.follow = true;
      } else if (k === ' ') {
        e.preventDefault();
        if (!e.repeat) this.dash();
      } else if (k === 'Q' || k === 'W' || k === 'E' || k === 'R') {
        if (!e.repeat) this.skill(k);
      } else if (k === 'F') {
        if (!e.repeat) this.cutStone();
      } else if (k === 'C') this.centre();
      else if (this.selecting && (k === '1' || k === '2' || k === '3'))
        this.chooseHero((Number(k) - 1) as 0 | 1 | 2);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toUpperCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Work out the aim point and the target under the cursor. */
  private updateAim(): void {
    this.aim = this.cursorPx ? this.pick(this.cursorPx.x, this.cursorPx.y) : null;
    this.hovered = this.aim ? this.combat.targetAt(this.aim[0], this.aim[1]) : null;
  }

  /** Test hook: press or release an arrow key (same as the keyboard). */
  holdArrow(key: 'ARROWUP' | 'ARROWDOWN' | 'ARROWLEFT' | 'ARROWRIGHT', down: boolean): void {
    if (down) this.keys.add(key);
    else this.keys.delete(key);
  }

  /** One frame of Expedition mode. */
  frame(now: number, model: { state: GameState | null; feed: FeedLine[] }): void {
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0);
    this.last = now;
    if (this.selecting && now >= this.selectUntil) this.chooseHero((this.votes.winner() - 1) as 0 | 1 | 2);

    const hero = this.hero;
    this.combat.update(now);
    if (hero) {
      const [dx, dz] = this.arrowDir();
      this.updateAim();
      if (dx || dz) hero.steer(dx, dz, dt, this.grid, !this.aim);
      else hero.steering = false;
      if (this.aim) hero.faceToward(this.aim[0], this.aim[1], dt);
      hero.speedFactor = this.quarry.speedFactor;
      hero.update(dt);
      if (!hero.alive) this.quarry.drop();
      const q = this.quarry.update([hero.x, hero.z], hero.moving, now);
      if (q === 'cut' || q === 'delivered') {
        const y = heightAt(hero.x, hero.z) + 3;
        this.floats.push({
          text: q === 'cut' ? 'បានដុំថ្ម! · Block cut!' : `+១ ថ្ម · +1 block (${this.quarry.delivered})`,
          x: hero.x,
          y,
          z: hero.z,
          at: now,
          color: '#fff3c4',
        });
      }
      if (hero.moving) this.cam.follow = true;
      this.jungle.reveal(hero.x, hero.z);
      if (this.cam.follow) {
        this.cam.x += (hero.x - this.cam.x) * Math.min(1, dt * 5);
        this.cam.z += (hero.z - this.cam.z) * Math.min(1, dt * 5);
      }
    } else {
      // Choosing: slow drift around camp.
      this.jungle.reveal(CAMP[0], CAMP[1], 22);
      this.cam.x = CAMP[0] + Math.sin(now / 6000) * 4;
      this.cam.z = CAMP[1] - 4;
    }
    const pitch = this.configs.expedition.camera.pitchDeg;
    this.jungle.aim(this.cam.x, this.cam.z, this.cam.dist, pitch);
    this.jungle.update(now, hero, this.renderer, {
      cutting: this.quarry.progress(now) !== null,
      carrying: this.quarry.carrying,
      delivered: this.quarry.delivered,
    });
    this.jungle.updateTargets(this.combat.targets, now);
    // Aim marker and reach ring.
    const hc = this.heroCfg;
    const face = hero && this.aim && !this.hovered ? this.quarry.faceAt(this.aim[0], this.aim[1], 3.5) : -1;
    if (hero && face >= 0) {
      // A rock face under the cursor: gold ring when the hero can cut it from here.
      const f = this.configs.expedition.quarry.faces[face]!;
      const reach = Math.hypot(hero.x - f[0], hero.z - f[1]) <= this.configs.expedition.quarry.reach;
      this.jungle.setAim(f, reach ? 'inRange' : 'far');
      this.jungle.setRange(null, 0);
      this.cursor.setState(reach ? 'attack' : 'far');
    } else if (hero && hc && this.aim) {
      const inReach = this.hovered ? this.combat.inRange(hero, this.hovered, hc.attack.range) : false;
      this.jungle.setAim(
        this.hovered ? [this.hovered.x, this.hovered.z] : this.aim,
        this.hovered ? (inReach ? 'inRange' : 'far') : 'ground',
      );
      this.jungle.setRange(
        this.hovered ? [hero.x, hero.z] : null,
        hc.attack.range + (this.hovered?.radius ?? 0),
      );
      this.cursor.setState(this.hovered ? (inReach ? 'attack' : 'far') : 'normal');
    } else {
      this.jungle.setAim(null, 'ground');
      this.jungle.setRange(null, 0);
      this.cursor.setState('normal');
    }

    const r = this.renderer;
    r.setScissorTest(false);
    const s = r.getSize(new THREE.Vector2());
    r.setViewport(0, 0, s.x, s.y);
    r.clear();
    for (const o of this.jungle.scene.children)
      if (o.userData.followCamera)
        o.position.set(this.jungle.camera.position.x, 0, this.jungle.camera.position.z);
    styleScene(this.jungle.scene);
    r.render(this.jungle.scene, this.jungle.camera);

    const st = model.state;
    const per = this.configs.expedition.expeditionsPerTemple;
    const share = st ? st.temple.progress / st.temple.target : 0;
    const expedition = Math.min(per, Math.floor(share * per) + 1);
    const quarterShare = Math.min(1, share * per - (expedition - 1));
    const giftWord = (f: FeedLine) =>
      f.action === 'gift'
        ? `${f.giftName ?? ''}${f.count > 1 ? ` ×${f.count}` : ''}`
        : f.action === 'like'
          ? `❤ ${f.count}`
          : f.action;
    const viewH = this.cam.dist * 1.6;
    this.hud.render(
      {
        hero,
        heroCfg: this.heroCfg,
        select: this.selecting
          ? {
              secondsLeft: Math.max(0, Math.ceil((this.selectUntil - now) / 1000)),
              votes: this.votes.counts(),
            }
          : null,
        expedition,
        of: per,
        quarterShare,
        feed: model.feed.map((f) => ({ name: f.name, what: giftWord(f) })),
        explored: this.jungle.explored,
        minimapBase: this.jungle.minimapBase,
        camView: { x: this.cam.x, z: this.cam.z - viewH * 0.1, w: viewH * 0.62, h: viewH },
        quarry: {
          delivered: this.quarry.delivered,
          carrying: this.quarry.carrying,
          cutting: this.quarry.progress(now),
        },
        howTo: !!hero && now - this.heroAt < 14_000,
        cooldowns: Object.fromEntries(
          (hc?.skills ?? []).map((id) => [id, this.combat.cooldownLeft(id, now)]),
        ),
      },
      now,
    );
    // Floating words (damage, "too far"…) and the hovered target's health.
    this.floats = this.floats.filter((f) => now - f.at < 1200);
    this.hud.renderFloats(
      this.floats
        .filter((f) => now >= f.at)
        .map((f) => {
          const k = (now - f.at) / 1200;
          const p = this.jungle.project(f.x, f.y + k * 1.5, f.z);
          return { text: f.text, x: p.x, y: p.y, opacity: 1 - k * k, color: f.color };
        }),
    );
    const t = this.hovered;
    if (t) {
      const p = this.jungle.project(t.x, heightAt(t.x, t.z) + 2.5, t.z);
      this.hud.renderTarget({ x: p.x, y: p.y, name: `${t.km} · ${t.en}`, share: t.hp / t.maxHp });
    } else this.hud.renderTarget(null);
  }

  /** Ground height under the camera target (tests). */
  get cameraTarget(): { x: number; z: number; y: number } {
    return { x: this.cam.x, z: this.cam.z, y: heightAt(this.cam.x, this.cam.z) };
  }
}
