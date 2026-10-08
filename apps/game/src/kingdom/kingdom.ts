import { canFullscreen, isFullscreen, toggleFullscreen } from '../fullscreen';
import * as THREE from 'three';
import {
  loadKingdom,
  type Cost,
  type KingdomData,
  type Resource,
  type TempleKit,
  type TierName,
} from '@temples/shared';
import { environmentFrom, styleScene } from '../engine/look';
import { LANDSCAPE_SIZE as KSIZE } from '../stage';

/** Height of the bottom command bar (stage px, 16:9 layout). */
/** The command bar's height (half the old one, PK: D67). */
export const PANEL_H = 190;
/** The king, in the selection (PK: click him for his royal orders). Not a unit id. */
export const KING_ID = -1;
import { KingdomScene, TEAM_COLOR, buildingGeometry, teamUnitGeometry, type HoverTarget } from './view/scene';
import { IconAtlas } from './view/icons';
import { landmarkGeometry } from './view/temples';
import { manuscriptGeometry } from './view/art';
import { basketReady, collectBasket } from './sim/market';
import { templeShortfall } from './sim/decree';
import { currentCeremony } from './sim/ceremony';
import { KingdomHud, RES_LABEL, km, type Button } from './view/hud';
import { AncientMap, mapViewOf } from './view/ancientMap';
import './view/ancientMap.css';
import { KingdomSound, panFor, sfxForEvent } from './view/sound';
import { MoodTracker, anyNear } from './view/music';
import { CAM_YAW } from './view/scene';
import { TouchGestures } from './touch';
import creditsJson from '../../../../config/credits.json';

/** Who made the game (config/credits.json; PK: credit the developer). */
export const CREDITS = creditsJson;

export interface KingdomOptions {
  /** The Android phone build (D72): touch controls, large touch layout, no LIVE council. */
  mobile?: boolean;
  /** Anno-style graphics for this quality preset (config/quality.json "kingdom", D79). */
  gfx?: KingdomGfx;
  /**
   * Anachak Khmer (D92): the same game in its own tab and save, with the king's levy, battle
   * order and overview, the royal roads, and the 3D hero mode.
   */
  variant?: 'kingdom' | 'anachak';
}
import { KingdomSim, PLAYER, RIVAL, type Building, type Unit } from './sim/sim';
import { animalTraits } from './wildlife';
import { KingdomPost, NO_GFX, type FrameSplit, type KingdomGfx } from './view/gfx';
import { tileToWorld, worldToTile, type XZ } from './sim/map';
import { SaveStore, browserStorage, type Slot } from './sim/save';
import {
  battle,
  canLevy,
  levy,
  levyChoices,
  overview,
  rallyPoint,
  recruits,
  restsActive,
  soldiers,
} from './sim/anachak';
import { GOODS, exchange, quote, trend } from './sim/exchange';
import { HeroMode } from './hero/heroMode';
import { edgePan } from './edgeScroll';
import { CelPass, RTS_LOOK } from './hero/celPass';
import { setToonLook } from './hero/toon';

/**
 * Khmer Kingdoms, the RTS tab (v0.1: Hariharalaya, 879 CE). An original strategy game in
 * the classic RTS mould: gather, build, train, research, fight, raise Preah Ko. This file
 * is the glue: input (mouse and keys), camera, the command panel, LIVE support and the
 * viewer council, saves. The rules are in sim/, the drawing in view/.
 */

type Difficulty = KingdomSim['difficulty'];

const FAIL_KM: Record<string, string> = {
  cost: 'មិនគ្រប់ធនធាន · Not enough resources',
  pop: 'ត្រូវការផ្ទះបន្ថែម · Build more houses',
  blocked: 'ដាក់ទីនេះមិនបាន · Can’t build here',
  requires: 'ត្រូវការអ្វីមួយមុនសិន · Needs something first',
  busy: 'កំពុងធ្វើរួចហើយ · Already busy',
  site: 'ប្រាសាទនេះមានទីតាំងជាក់លាក់ · This temple has its own site',
  era: 'មិនមែនសម័យនេះ · Not in this era',
  unknown: 'មិនអាច · Not possible',
  limit: 'មានម្នាក់រួចហើយ · Only one at a time',
  fixed: 'ប្រាសាទប្រវត្តិសាស្ត្រមិនអាចផ្លាស់ទីបាន · A historical temple stays on its site',
  shore: 'ត្រូវសាងនៅមាត់ទឹក · Must be built at the water’s edge',
};

export class Kingdom {
  readonly data: KingdomData;
  /** The old map of the empire (PK: opens from the minimap; drag and zoom, D67). */
  readonly ancient: AncientMap;
  /** Sound effects and the weather's sound bed (D68), and the background music (D76). */
  readonly sound: KingdomSound;
  /** Calm or tense music (raids), checked about once a second. */
  private readonly musicMood: MoodTracker;
  private nextMoodCheck = 0;
  /** Work sounds are spaced out so a busy village does not clatter (seconds, performance clock). */
  private nextWorkSound = 0;
  private readonly lastSfx = new Map<string, number>();
  sim: KingdomSim;
  view: KingdomScene;
  readonly hud: KingdomHud;
  readonly saves: SaveStore;
  readonly selected = new Set<number>();
  private active = false;
  /** Game speed (PK: the timeline speed can be adjusted): index into rules.speed.options. */
  private speedIdx = 0;
  /** The last in-game year whose world events were announced, and for which sim. */
  private yearSeen: { sim: KingdomSim | null; year: number } = { sim: null, year: 0 };
  private readonly cam = { x: 0, z: 0, dist: 100 };
  /** Post-processing for the current view (rebuilt with a new game's scene). */
  private post: { scene: THREE.Scene; post: KingdomPost } | null = null;
  private readonly keys = new Set<string>();
  private cursorPx: { x: number; y: number } | null = null;
  /** The mouse in window pixels, for edge scrolling past the stage (null: out of the window). */
  private edgeCursor: { x: number; y: number } | null = null;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private readonly dragEl: HTMLDivElement;
  private placing: string | null = null;
  /** PK 1.6.0: the building being moved while `placing` shows its ghost. */
  private moving: number | null = null;
  private last = 0;
  private autosaveAt = 0;
  private readonly env: THREE.Texture;
  private readonly stageRect: () => DOMRect;
  /** Viewer council: a vote every few minutes (!1 !2 !3). */
  private council = { openUntil: 0, nextAt: 0, votes: new Map<string, 1 | 2 | 3>() };
  private seenEvents = 0;
  /** Population milestones reached (PK: the king blesses the growing city). */
  private popMilestone = -1;
  /** The order board is open (Hay Day-style, PK). */
  private ordersOpen = false;
  private blessAt = 0;
  /** History timeline open, the card shown (chapter intro, era end, a temple's history). */
  private historyOpen = false;
  private card: { html: string; until: number; side?: boolean; sec?: number; kind?: 'overview' } | null =
    null;
  private flight: {
    x0: number;
    z0: number;
    d0: number;
    x1: number;
    z1: number;
    d1: number;
    t0: number;
  } | null = null;
  /** 3D icons for the command buttons, hover state, floating words, idle-worker cycling. */
  private readonly icons = new IconAtlas(TEAM_COLOR[0]);
  private hovered: { target: HoverTarget; html: string; at: number } = { target: null, html: '', at: 0 };
  private floats: Array<{ x: number; z: number; text: string; color: string; at: number }> = [];
  private idleIndex = 0;
  /** Touch gestures on phones (D72). */
  private readonly touch: TouchGestures;
  /** The 3D hero mode (Anachak Khmer, D92); null in the Kingdom tab. */
  readonly hero: HeroMode | null = null;
  private heroSplit: FrameSplit | null = null;
  /** Anachak Khmer's cel-shaded RTS view (null in the Kingdom tab). */
  private readonly anime: CelPass | null = null;
  /** The king's menu page (Anachak Khmer): his orders, or the levy's army types. */
  private kingMenu: 'main' | 'levy' = 'main';
  /** How many villagers one levy press calls up (anachak.json levy.steps). */
  private levyStep = 0;
  /** The market panel: the good to give and the lot size (Anachak Khmer, PK). */
  private marketGive: Resource = 'food';
  private marketLot = 1;
  /**
   * The danger call (PK): who is in danger, until when the choice waits (ms), the last call
   * (sim s), and whether to ask at all (the player can turn it off; kept per device).
   */
  private danger: { who: number; until: number; el: HTMLDivElement } | null = null;
  private dangerAt = -1e9;
  dangerAsk = true;
  private nightWas = 0;
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly stage: HTMLElement,
    overlay: HTMLElement,
    private readonly kit: TempleKit | null,
    private readonly font: (px: number) => string,
    difficulty?: Difficulty,
    readonly opts: KingdomOptions = {},
  ) {
    this.data = loadKingdom();
    // PK 1.7.0: the phone build houses fewer people (rules.start.mobileMaxPop).
    if (opts.mobile && this.data.rules.start.mobileMaxPop)
      this.data.rules.start.maxPop = this.data.rules.start.mobileMaxPop;
    this.sound = new KingdomSound({ mobile: opts.mobile });
    this.musicMood = new MoodTracker(this.sound.music.cfg.moodRules);
    this.saves = new SaveStore(
      browserStorage(),
      this.data.rules.save.backups,
      this.anachak ? this.data.anachak.tab.savePrefix : undefined,
    );
    const loaded = this.saves.load('autosave', this.data);
    this.sim =
      loaded?.sim ??
      new KingdomSim(this.data, difficulty ?? this.data.rules.ai.difficulty, true, newSeed(), this.variant);
    this.env = environmentFrom(renderer);
    this.view = this.makeView();
    this.hud = new KingdomHud(overlay, this.data);
    if (opts.mobile) {
      this.hud.mobile = true;
      this.hud.root.classList.add('k-mobile');
    }
    this.hud.onAct = (a) => this.act(a);
    this.hud.onMinimap = (u, v, button) => {
      const size = this.sim.map.size * this.sim.map.tile;
      const x = (u - 0.5) * size;
      const z = (v - 0.5) * size;
      if (button === 2 && this.selected.size) this.sim.cmdSmart(this.myUnits(), [x, z], {});
      // PK: pressing the minimap opens the old map; it can be dragged and zoomed there.
      else this.openMap({ x, z });
    };
    this.ancient = new AncientMap(this.hud.root, {
      onGo: (x, z) => this.panTo(x, z),
      onSend: (x, z) => {
        if (this.selected.size) this.sim.cmdSmart(this.myUnits(), [x, z], {});
      },
      onClose: () => undefined,
    });
    this.dragEl = document.createElement('div');
    this.dragEl.className = 'k-drag';
    this.dragEl.hidden = true;
    overlay.append(this.dragEl);
    this.stageRect = () => stage.getBoundingClientRect();
    this.touch = this.makeTouch();
    // Anachak's 90s anime look only when its config asks for it (PK 1.6.0: the Build look by default).
    if (this.anachak && this.data.anachak.look === 'anime') this.anime = new CelPass();
    if (this.anachak) {
      setToonLook(this.data.anachak.look);
      this.hud.root.classList.add('k-anachak');
      this.hero = new HeroMode({
        data: this.data,
        sim: () => this.sim,
        view: () => this.view,
        sound: this.sound,
        hudRoot: this.hud.root,
        stage,
        toStage: (e) => this.toStage(e),
        toast: (html, sec = 5) => this.hud.toast(html, performance.now(), sec),
        kingSpot: () => {
          const h = this.hall();
          if (!h) return null;
          const [cx, cz] = this.sim.center(h);
          return [cx, cz + 13]; // he steps out in front of his court
        },
        kingName: () => ({
          km: this.sim.era.ruler.km,
          en: `King ${this.data.temples[this.sim.chapterData.temple]?.king ?? this.sim.era.ruler.en}`,
        }),
        onExit: (who, at) => {
          this.selected.clear();
          this.selected.add(who ?? KING_ID);
          this.panTo(at[0], at[1] + 6);
        },
        mobile: !!opts.mobile,
      });
      try {
        this.dangerAsk = localStorage.getItem('anachak.dangerAsk') !== '0';
      } catch {
        /* no storage: ask */
      }
    }
    this.centreOnHall();
    this.bindInput();
    if (loaded?.recovered)
      this.hud.toast('បានស្ដារពីឯកសារបម្រុង · Restored from a backup save', performance.now(), 8);
    if (!loaded) this.showChapterIntro();
  }

  /** Anachak Khmer's extra features are on in this game (D92). */
  get anachak(): boolean {
    return this.opts.variant === 'anachak';
  }

  get variant(): 'kingdom' | 'anachak' {
    return this.anachak ? 'anachak' : 'kingdom';
  }

  private makeView(): KingdomScene {
    const v = new KingdomScene(this.sim, this.kit, this.font, this.opts.gfx);
    v.scene.environment = this.env;
    // Anachak Khmer: day and night; the anime light (a stronger sun, a cooler bounce) only in
    // the anime look (PK 1.6.0: the Build tab's soft light by default).
    if (this.opts.variant === 'anachak') {
      if (this.data.anachak.look === 'anime') v.weatherFx.animeLight();
      v.weatherFx.setNight(this.data.anachak.night);
    }
    return v;
  }

  get isActive(): boolean {
    return this.active;
  }

  start(now: number): void {
    if (this.active) return;
    this.active = true;
    this.last = now;
    this.hud.show(true);
    this.council.nextAt = now + 20_000;
    this.sound.startMusic();
  }

  stop(): void {
    this.hero?.exit('gone');
    this.active = false;
    this.hud.show(false);
    this.sound.stopMusic();
    this.placing = null;
    this.view.setGhost(null);
    this.saves.save('autosave', this.sim);
  }

  // ------------------------------------------------------------ helpers

  private myUnits(): number[] {
    return [...this.selected].filter((id) => this.sim.units.get(id)?.team === PLAYER);
  }

  private hall(): Building | undefined {
    return [...this.sim.buildings.values()].find((b) => b.team === PLAYER && b.type === 'townCentre');
  }

  centreOnHall(): void {
    const h = this.hall();
    const [x, z] = h ? this.sim.center(h) : [0, 0];
    this.panTo(x, z + 6);
  }

  /** Camera distance (zoom), 28–150 m. */
  zoom(dist: number): void {
    this.cam.dist = Math.max(28, Math.min(150, dist));
  }

  panTo(x: number, z: number): void {
    const lim = (this.sim.map.size * this.sim.map.tile) / 2 - 10;
    this.cam.x = Math.max(-lim, Math.min(lim, x));
    this.cam.z = Math.max(-lim, Math.min(lim, z));
  }

  /** Glide the camera to a point over about a second (the history timeline uses it). */
  flyTo(x: number, z: number, dist: number, now = performance.now()): void {
    this.flight = { x0: this.cam.x, z0: this.cam.z, d0: this.cam.dist, x1: x, z1: z, d1: dist, t0: now };
  }

  /** Centre (world) of a chapter's temple site. */
  siteCentre(i: number): XZ {
    const m = this.sim.map;
    const s = m.sites[i]!;
    const [x0, z0] = tileToWorld(m, s.tx, s.tz);
    return [x0 - m.tile / 2 + (s.w * m.tile) / 2, z0 - m.tile / 2 + (s.d * m.tile) / 2];
  }

  // ------------------------------------------------------------ campaign and history

  private esc(t: string): string {
    return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  }

  private templeName(id: string): { km: string; en: string } {
    const t = this.data.temples[id];
    return { km: t?.km ?? id, en: t?.en ?? id };
  }

  /** One chapter's story: temple, year, era, ruler, opponent, what happened, sources. */
  private chapterHtml(i: number, head: string): string {
    const D = this.data;
    const ch = D.campaign.chapters[i]!;
    const era = D.eras.find((e) => e.id === ch.era)!;
    const opp = D.campaign.opponents.find((o) => o.id === ch.opponent)!;
    const t = this.templeName(ch.temple);
    const king = D.temples[ch.temple]?.king ?? era.ruler.en;
    const src = ch.sources
      .map((id) => D.sources.find((x) => x.id === id))
      .filter(Boolean)
      .map((x) => `${x!.author} ${x!.year}`)
      .join('; ');
    const e = this.esc.bind(this);
    return `<h3>${head}</h3>
      <h2>${e(t.km)} · ${e(t.en)}</h2>
      <p class="k-meta"><span class="k-tag">${km(ch.year)} · ${ch.year} CE</span><span class="k-tag">${e(era.km)} · ${e(era.en)}</span><span class="k-tag">${e(king)}</span></p>
      <p>${e(ch.history.km)}</p>
      <p>${e(ch.history.en)}</p>
      ${ch.event ? `<p><b>${e(ch.event.km)}</b><br>${e(ch.event.en)}</p>` : ''}
      ${this.worldHtml(i)}
      <p class="k-meta">សត្រូវ · Opponent: <b>${e(opp.km)} · ${e(opp.en)}</b> (${opp.confidence.replace(/_/g, ' ').toLowerCase()})${src ? ` · ${e(src)}` : ''}</p>`;
  }

  /** What happened elsewhere in the world around this chapter's years (PK). */
  private worldHtml(i: number): string {
    const chs = this.data.campaign.chapters;
    const from = (chs[i - 1]?.year ?? chs[i]!.year - 80) + 1;
    const to = chs[i + 1]?.year ?? chs[i]!.year + this.data.rules.calendar.extraYearsAfterLast;
    const list = this.data.worldEvents.filter((w) => w.year >= from && w.year < to && !w.khmer).slice(0, 4);
    if (!list.length) return '';
    return `<p class="k-world"><b>ក្នុងពិភពលោក · Meanwhile in the world</b>${list
      .map(
        (w) =>
          `<br><span class="k-tag">${w.circa ? 'c. ' : ''}${w.year}</span> ${this.esc(w.place.en)}: ${this.esc(w.en)} <i>${this.esc(w.km)}</i>`,
      )
      .join('')}</p>`;
  }

  /** Game speed now (1×, 2×…). */
  get speed(): number {
    const o = this.data.rules.speed.options;
    return o[this.speedIdx % o.length] ?? 1;
  }

  /**
   * Find what is short (PK): send the watchman (or an idle villager) toward the nearest
   * unreported source of the scarcest resource.
   */
  findScarce(now = performance.now()): void {
    const r = this.sim.res[PLAYER];
    const res = (['food', 'wood', 'stone', 'gold'] as const).reduce((a, b) => (r[b] < r[a] ? b : a));
    const go = this.sim.scoutFor(res);
    const name = RES_LABEL[res];
    if (!go) {
      this.hud.toast(
        `🔍 គ្មានអ្នកទៅរក${name.km} · Nobody free to look for ${name.en}: train a watchman at the royal hall`,
        now,
        5,
      );
      return;
    }
    this.hud.toast(`🔍 ទៅរក${name.km} · Off to find ${name.en} (${go.units})`, now, 5);
    this.hud.ping(go.to, now);
  }

  /** The year bar: the calendar runs on; world events of past years are announced. */
  private updateYear(now: number): void {
    const s = this.sim;
    const y = s.year;
    if (this.yearSeen.sim !== s) this.yearSeen = { sim: s, year: y };
    if (y > this.yearSeen.year) {
      for (const w of this.data.worldEvents)
        if (w.year > this.yearSeen.year && w.year <= y)
          this.hud.toast(
            `${w.khmer ? '🏯' : '🌏'} ${w.circa ? 'c. ' : ''}${km(w.year)} · ${this.esc(w.km)} · ${this.esc(w.en)}`,
            now,
            8,
          );
      this.yearSeen.year = y;
    }
    const chs = this.data.campaign.chapters;
    this.hud.renderYearBar({
      year: y,
      speed: this.speed,
      span: [chs[Math.min(s.chapter, chs.length - 1)]!.year, chs[s.chapter + 1]?.year ?? y + 1],
      temples: chs.map((c) => ({
        year: c.year,
        name: this.templeName(c.temple),
        state: s.completed.includes(c.temple) ? 'done' : c === s.chapterData ? 'now' : 'later',
      })),
      events: this.data.worldEvents,
      musicVolume: this.opts.mobile ? undefined : this.sound.musicVolume,
      orders: {
        ready: s.market.ready().length,
        canFill: s.market.ready().filter((o) => s.market.canFill(o)).length,
        boat: s.market.orders.some((o) => o.buyer === 'boat'),
      },
    });
  }

  private showChapterIntro(): void {
    const i = this.sim.chapter;
    const n = this.data.campaign.chapters.length;
    this.card = {
      html:
        this.chapterHtml(
          i,
          `ជំពូក ${km(i + 1)}/${km(n)} · Chapter ${i + 1} of ${n} — សាងប្រាសាទនេះ · Build this temple`,
        ) +
        `<button class="k-btn" data-act="card-close" data-ui><span class="k-btn-km">ចាប់ផ្ដើម · Begin</span></button>` +
        `<p class="k-card-dev">${this.esc(CREDITS.developer.km)} · ${this.esc(CREDITS.developer.en)}: <span class="k-credit-km">${this.esc(CREDITS.developer.nameKm)}</span></p>`,
      // The clock starts when the card is first on screen (the tab may open later).
      until: Infinity,
      sec: 45,
    };
  }

  /** The timeline of every temple: finished ones can be visited, later ones are locked. */
  private historyHtml(): string {
    const s = this.sim;
    const items = this.data.campaign.chapters
      .map((ch, i) => {
        const t = this.templeName(ch.temple);
        const done = s.completed.includes(ch.temple);
        const now = i === s.chapter && !done;
        const cls = done ? 'done' : now ? 'now' : 'locked';
        const state = done ? '✓ សាងរួច · Built' : now ? '▶ កំពុងសាង · Building' : '🔒 ចាក់សោ · Locked';
        return `<button class="k-tl ${cls}" data-act="visit:${i}" ${cls === 'locked' ? 'disabled' : ''} data-ui><b>${this.esc(t.km)}</b><span>${this.esc(t.en)}</span><span>${km(ch.year)} · ${ch.year} CE</span><span>${state}</span></button>`;
      })
      .join('');
    return `<h2><span>ប្រវត្តិប្រាសាទ · Temples through history (${km(s.completed.length)}/${km(this.data.campaign.chapters.length)})</span><button class="k-btn" data-act="history" data-ui><span class="k-btn-km">បិទ · Close</span></button></h2><div class="k-timeline">${items}</div>`;
  }

  /** Visit a temple from the timeline: fly there and tell its story. */
  visit(i: number, now = performance.now()): void {
    const ch = this.data.campaign.chapters[i];
    if (!ch) return;
    const done = this.sim.completed.includes(ch.temple);
    if (!done && i !== this.sim.chapter) return;
    const [x, z] = this.siteCentre(i);
    const size = Math.max(...ch.footprint) * this.sim.map.tile;
    // Frame the temple left of centre: the story card is on the right.
    this.flyTo(x + size * 0.45, z + size * 0.3, Math.max(45, Math.min(150, size * 1.9)), now);
    this.historyOpen = false;
    this.card = {
      html:
        this.chapterHtml(
          i,
          done
            ? 'ប្រាសាទដែលបានសាងរួច · A temple of your kingdom'
            : 'ទីតាំងប្រាសាទបច្ចុប្បន្ន · This chapter’s site',
        ) +
        `<button class="k-btn" data-act="card-close" data-ui><span class="k-btn-km">បិទ · Close</span></button> <button class="k-btn" data-act="history" data-ui><span class="k-btn-km">ប្រវត្តិ · History</span></button>`,
      until: Infinity,
      sec: 60,
      side: true,
    };
  }

  private toStage(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.stageRect();
    return {
      x: ((e.clientX - r.left) / r.width) * KSIZE.width,
      y: ((e.clientY - r.top) / r.height) * KSIZE.height,
    };
  }

  /** What is under a stage pixel: our/their unit, a building, a resource. */
  pickAt(
    px: number,
    py: number,
  ): { unit?: number; building?: number; node?: number; animal?: number; king?: boolean; ground: XZ | null } {
    const s = this.sim;
    // PK: the king before his hall can be picked (hover shows his name; click, his orders).
    for (const b of s.buildings.values()) {
      if (b.team !== PLAYER || b.type !== 'townCentre' || b.progress < 1) continue;
      const [cx, cz] = s.center(b);
      const k = this.view.project(cx, 1.4, cz + 7.6);
      if (Math.hypot(k.x - px, k.y - py) < 34) return { king: true, ground: this.view.groundAt(px, py) };
    }
    let best: Unit | null = null;
    let bd = 44;
    let beast: number | undefined;
    let ad = 40;
    for (const a of s.animals.values()) {
      if (!s.isVisible(a.x, a.z)) continue;
      const p = this.view.project(a.x, 0.8, a.z);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < ad) {
        ad = d;
        beast = a.id;
      }
    }
    for (const u of s.units.values()) {
      if (u.team === RIVAL && !s.isVisible(u.x, u.z)) continue;
      const h = u.type === 'warElephant' ? 2.6 : 1.1;
      const p = this.view.project(u.x, h, u.z);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    const ground = this.view.groundAt(px, py);
    if (best && bd <= ad) return { unit: best.id, ground };
    if (beast !== undefined) return { animal: beast, ground };
    if (best) return { unit: best.id, ground };
    if (!ground) return { ground };
    const [tx, tz] = worldToTile(s.map, ground[0], ground[1]);
    for (const b of s.buildings.values())
      if (tx >= b.tx && tx < b.tx + b.w && tz >= b.tz && tz < b.tz + b.d) {
        if (b.team === RIVAL && !s.fog.explored[b.tz * s.fog.size + b.tx]) break;
        return { building: b.id, ground };
      }
    // Resources: the one drawn nearest the pointer (a tree's crown stands above its tile, so
    // pick on screen, among the nodes a few tiles around the ground under the pointer).
    let node: number | undefined;
    let nd = 38;
    for (const n of s.nodes.values()) {
      if (Math.abs(n.tx - tx) > 5 || Math.abs(n.tz - tz) > 6) continue;
      if (!s.fog.explored[n.tz * s.fog.size + n.tx]) continue;
      const [x, z] = s.nodePos(n);
      // Distance to the drawn upright (trunk base to crown), so the foot or the crown both pick it.
      const a = this.view.project(x, 0, z);
      const b = this.view.project(x, n.kind === 'tree' ? 3.2 : 0.6, z);
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const k = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / (vx * vx + vy * vy || 1)));
      const d = Math.hypot(a.x + vx * k - px, a.y + vy * k - py);
      if (d < nd) {
        nd = d;
        node = n.id;
      }
    }
    return node !== undefined ? { node, ground } : { ground };
  }

  // ------------------------------------------------------------ input

  /** What each touch gesture does (D72). */
  private makeTouch(): TouchGestures {
    return new TouchGestures({
      tap: (x, y) => {
        const p = { x, y };
        if (this.placing) return this.tryPlace(p);
        const pick = this.pickAt(x, y);
        const mine =
          (pick.unit !== undefined && this.sim.units.get(pick.unit)?.team === PLAYER) ||
          (pick.building !== undefined && this.sim.buildings.get(pick.building)?.team === PLAYER);
        // A tap on one of ours selects it; anywhere else, with units selected, sends them.
        if (!mine && this.myUnits().length) this.command(p);
        else this.clickSelect(x, y);
      },
      doubleTap: (x, y) => {
        // Every unit of that kind on screen.
        const pick = this.pickAt(x, y);
        const u = pick.unit !== undefined ? this.sim.units.get(pick.unit) : undefined;
        if (!u || u.team !== PLAYER) return this.clickSelect(x, y);
        this.selected.clear();
        for (const o of this.sim.units.values()) {
          if (o.team !== PLAYER || o.type !== u.type) continue;
          const q = this.view.project(o.x, 1, o.z);
          if (q.x >= 0 && q.x <= KSIZE.width && q.y >= 0 && q.y <= KSIZE.height) this.selected.add(o.id);
        }
      },
      pan: (dx, dy, x, y) => {
        if (this.placing) {
          // While placing, the finger moves the building's ghost.
          this.cursorPx = { x: x + dx, y: y + dy };
          return;
        }
        // The ground under the finger follows the finger.
        const a = this.view.groundAt(x, y);
        const b = this.view.groundAt(x + dx, y + dy);
        if (a && b) this.panTo(this.cam.x - (b[0] - a[0]), this.cam.z - (b[1] - a[1]));
        this.flight = null;
      },
      zoom: (k) => this.zoom(this.cam.dist / k),
      holdStart: (x, y) => {
        this.cursorPx = { x, y };
        this.hovered.at = 0;
      },
      holdMove: (x, y) => {
        this.cursorPx = { x, y };
      },
      holdEnd: () => {
        this.cursorPx = null;
      },
      boxStart: (x, y) => {
        this.drag = { x0: x, y0: y, x1: x, y1: y };
      },
      boxMove: (x, y) => {
        if (this.drag) [this.drag.x1, this.drag.y1] = [x, y];
      },
      boxEnd: (x0, y0, x1, y1) => {
        this.drag = null;
        this.dragEl.hidden = true;
        this.boxSelect({ x0, y0, x1, y1 });
      },
    });
  }

  private bindInput(): void {
    const st = this.stage;
    st.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });
    // Touch pointers go to the gesture recognizer (phones, D72); mouse and pen as before.
    const touchOf = (e: PointerEvent) => e.pointerType === 'touch' && this.active;
    st.addEventListener('pointercancel', (e) => {
      if (touchOf(e)) this.touch.cancel(e.pointerId);
    });
    window.addEventListener('pointerup', (e) => {
      if (!touchOf(e)) return;
      const p = this.toStage(e);
      this.touch.up(e.pointerId, p.x, p.y, performance.now());
    });
    st.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (e.pointerType === 'touch') {
        const p = this.toStage(e);
        this.touch.move(e.pointerId, p.x, p.y, performance.now());
        return;
      }
      const p = this.toStage(e);
      this.cursorPx = p;
      if (this.drag) {
        this.drag.x1 = p.x;
        this.drag.y1 = p.y;
      }
    });
    st.addEventListener('pointerleave', () => (this.cursorPx = null));
    st.addEventListener('pointerdown', (e) => {
      if (!this.active || this.sim.outcome) return;
      this.sound.unlock();
      if (e.pointerType === 'touch') {
        const p = this.toStage(e);
        this.touch.down(e.pointerId, p.x, p.y, performance.now());
        return;
      }
      const p = this.toStage(e);
      this.cursorPx = p;
      if (e.button === 0) {
        if (this.placing) return this.tryPlace(p);
        this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      } else if (e.button === 2) {
        if (this.placing) {
          this.placing = null;
          this.view.setGhost(null);
          return;
        }
        if (e.shiftKey) {
          // Shift + right-click: one more spot to walk to (scouting several places in turn).
          const g = this.view.groundAt(p.x, p.y);
          if (g) this.sim.cmdWaypoint(this.myUnits(), g);
          return;
        }
        this.command(p);
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (!this.active || !this.drag || e.button !== 0) return;
      const d = this.drag;
      this.drag = null;
      this.dragEl.hidden = true;
      if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 12) this.clickSelect(d.x1, d.y1, e.shiftKey);
      else this.boxSelect(d, e.shiftKey);
    });
    st.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.cam.dist = Math.max(28, Math.min(150, this.cam.dist * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      this.sound.unlock();
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
        e.preventDefault();
        this.keys.add(k);
      } else if (k === 'escape') {
        this.placing = null;
        this.view.setGhost(null);
        this.selected.clear();
      } else if (k === 'h') {
        const h = this.hall();
        if (h) {
          this.selected.clear();
          this.selected.add(h.id);
          this.centreOnHall();
        }
      } else if (k === 'f11' && canFullscreen()) {
        // The game's own full screen (PK 1.8.0): Esc or F11 again leaves it.
        e.preventDefault();
        void toggleFullscreen();
      } else if (k === 'f5') {
        e.preventDefault();
        this.save('quick');
      } else if (k === 'f9') {
        e.preventDefault();
        this.load('quick');
      } else if (k === 'delete') {
        for (const id of this.selected) this.sim.cancel(id);
      } else if (k === 'y') {
        this.act('history');
      } else if (k === 'm') {
        if (this.ancient.isOpen) this.ancient.close();
        else this.openMap();
      } else if (k === '+' || k === '=' || k === '-') {
        // Game speed up / down (PK: the timeline speed can be adjusted).
        const n = this.data.rules.speed.options.length;
        this.speedIdx = Math.max(0, Math.min(n - 1, this.speedIdx + (k === '-' ? -1 : 1)));
      } else if (k === 'f') {
        this.findScarce();
      } else if (k === 'o') {
        this.ordersOpen = !this.ordersOpen;
      } else if (k === ' ') {
        e.preventDefault();
        this.centreOnSelection();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.edgeCursor = null;
    });
    // Edge scroll (PK 1.6.0): follow the mouse in the whole window, not just over the stage.
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'mouse') this.edgeCursor = { x: e.clientX, y: e.clientY };
      },
      { passive: true },
    );
    document.documentElement.addEventListener('pointerleave', () => (this.edgeCursor = null));
    document.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget) this.edgeCursor = null;
    });
  }

  private centreOnSelection(): void {
    const pts: XZ[] = [];
    for (const id of this.selected) {
      const u = this.sim.units.get(id);
      const b = this.sim.buildings.get(id);
      if (u) pts.push([u.x, u.z]);
      else if (b) pts.push(this.sim.center(b));
    }
    if (!pts.length) return this.centreOnHall();
    this.panTo(
      pts.reduce((a, p) => a + p[0], 0) / pts.length,
      pts.reduce((a, p) => a + p[1], 0) / pts.length + 6,
    );
  }

  clickSelect(px: number, py: number, add = false): void {
    const pick = this.pickAt(px, py);
    if (!add) this.selected.clear();
    if (pick.king) {
      this.selected.clear();
      this.selected.add(KING_ID);
      return;
    }
    const id = pick.unit ?? pick.building;
    if (id !== undefined) this.selected.add(id);
  }

  boxSelect(d: { x0: number; y0: number; x1: number; y1: number }, add = false): void {
    const [xa, xb] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)];
    const [ya, yb] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
    if (!add) this.selected.clear();
    for (const u of this.sim.units.values()) {
      if (u.team !== PLAYER) continue;
      const p = this.view.project(u.x, 1, u.z);
      if (p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb) this.selected.add(u.id);
    }
  }

  /** Right click: move, gather, build, farm or attack, depending on what is under it. */
  command(p: { x: number; y: number }): void {
    const ids = this.myUnits();
    if (!ids.length) {
      // A building selected: right click sets nothing in v0.1 (rally points come later).
      return;
    }
    const pick = this.pickAt(p.x, p.y);
    if (!pick.ground && !pick.unit) return;
    const at: XZ =
      pick.ground ??
      (() => {
        const u = this.sim.units.get(pick.unit!)!;
        return [u.x, u.z] as XZ;
      })();
    this.sim.cmdSmart(ids, at, pick);
    this.view.courtLook(at[0], at[1], performance.now() / 1000); // the king points the way
  }

  private ghostTile(p: { x: number; y: number }): XZ | null {
    if (!this.placing) return null;
    const d = this.data.buildings[this.placing]!;
    if (d.fixedSite) return this.sim.monumentSpot();
    const g = this.view.groundAt(p.x, p.y);
    if (!g) return null;
    const [tx, tz] = worldToTile(this.sim.map, g[0], g[1]);
    return [tx - Math.floor(d.size[0] / 2), tz - Math.floor(d.size[1] / 2)];
  }

  /** The building being moved, when the ghost is for a move (not a new building). */
  private movingNow(): number | null {
    const b = this.moving === null ? undefined : this.sim.buildings.get(this.moving);
    return b && b.type === this.placing ? b.id : null;
  }

  private tryPlace(p: { x: number; y: number }): void {
    const type = this.placing!;
    const t = this.ghostTile(p);
    if (!t) return;
    const mv = this.movingNow();
    if (mv !== null) {
      const r = this.sim.moveBuilding(mv, t[0], t[1]);
      if (!r.ok) {
        this.hud.toast(FAIL_KM[r.reason] ?? r.reason, performance.now(), 3);
        return;
      }
      this.placing = null;
      this.moving = null;
      this.view.setGhost(null);
      return;
    }
    let builders = this.myUnits().filter((id) => this.sim.units.get(id)?.type === 'villager');
    if (!builders.length) builders = this.idleVillagers(type === 'monument' ? 4 : 2);
    const r = this.sim.place(type, t[0], t[1], builders);
    if (!r.ok) {
      this.hud.toast(FAIL_KM[r.reason] ?? r.reason, performance.now(), 3);
      if (r.reason === 'cost') this.flashNeeds(this.data.buildings[type]!.cost);
      return;
    }
    this.placing = null;
    this.view.setGhost(null);
    const site = this.sim.buildings.get(r.id);
    if (site) {
      const [sx, sz] = this.sim.center(site);
      this.view.courtLook(sx, sz, performance.now() / 1000);
    }
  }

  private idleVillagers(n: number): number[] {
    const list = [...this.sim.units.values()].filter((u) => u.team === PLAYER && u.type === 'villager');
    list.sort((a, b) => (a.task.kind === 'idle' ? 0 : 1) - (b.task.kind === 'idle' ? 0 : 1));
    return list.slice(0, n).map((u) => u.id);
  }

  // ------------------------------------------------------------ command panel

  act(a: string): void {
    const [kind, id] = a.split(':');
    this.sound.unlock();
    this.sound.play('click');
    if (kind === 'sound') {
      // One button (D79): music and effects → effects only → off → music and effects.
      if (this.opts.mobile || !this.sound.enabled) {
        this.sound.setEnabled(!this.sound.enabled);
        if (this.sound.enabled && !this.opts.mobile) this.sound.setMusicOn(true);
      } else if (this.sound.musicOn) this.sound.setMusicOn(false);
      else this.sound.setEnabled(false);
      return;
    }
    if (kind === 'fullscreen') {
      void toggleFullscreen();
      return;
    }
    if (kind === 'music') {
      this.sound.setMusicOn(!this.sound.musicOn);
      return;
    }
    if (kind === 'music-vol') {
      // Step to the next volume (config/kingdom/music.json volumeSteps), round to the first.
      const steps = this.sound.music.cfg.volumeSteps;
      const v = this.sound.musicVolume;
      this.sound.setMusicVolume(steps.find((x) => x > v + 1e-6) ?? steps[0]!);
      if (!this.sound.musicOn) this.sound.setMusicOn(true);
      return;
    }
    if (kind === 'map') return this.openMap();
    if (kind === 'speed') {
      const n = this.data.rules.speed.options.length;
      this.speedIdx = (this.speedIdx + (id === 'down' ? n - 1 : 1)) % n;
      return;
    }
    if (kind === 'find') return this.findScarce();
    if (this.anachak && this.anachakAct(kind!, id)) return;
    if (kind === 'decree') {
      this.sim.setDecree(id === 'temple');
      return;
    }
    if (kind === 'orders') {
      this.ordersOpen = !this.ordersOpen;
      return;
    }
    if (kind === 'order-deliver') {
      const r = this.sim.market.deliver(Number(id));
      if (!r.ok) this.hud.toast('មិនទាន់គ្រប់ · Not enough goods yet', performance.now(), 3);
      if (!r.ok && r.reason === 'short')
        this.flashNeeds(this.sim.market.orders.find((o) => o.id === Number(id))?.want);
      return;
    }
    if (kind === 'order-discard') {
      this.sim.market.discard(Number(id));
      return;
    }
    if (kind === 'collect') {
      collectBasket(this.sim, Number(id));
      return;
    }
    if (kind === 'about') {
      this.card = { html: this.creditsHtml(), until: performance.now() + 60_000 }; // time to read the About text
      this.historyOpen = false;
      return;
    }
    if (kind === 'menu') {
      this.hud.menuOpen = !this.hud.menuOpen;
      return;
    }
    if (kind === 'panel-min') {
      const h = this.hud;
      h.panelMode = h.panelMode === 'auto' ? 'open' : h.panelMode === 'open' ? 'folded' : 'auto';
      return;
    }
    const sel = [...this.selected].map((x) => this.sim.buildings.get(x)).find((b) => b && b.team === PLAYER);
    const now = performance.now();
    if (kind === 'move' && sel && this.sim.movable(sel.id)) {
      this.moving = sel.id;
      this.placing = sel.type;
      return;
    }
    if (kind === 'build') {
      this.moving = null;
      this.placing = id!;
      if (this.data.buildings[id!]!.fixedSite) {
        const [mx, mz] = this.sim.monumentSpot();
        const [x, z] = tileToWorld(this.sim.map, mx, mz);
        this.panTo(x + 14, z + 16);
      }
    } else if (kind === 'train' && sel) {
      const r = this.sim.train(sel.id, id!);
      if (!r.ok) this.hud.toast(FAIL_KM[r.reason] ?? r.reason, now, 3);
      if (!r.ok && r.reason === 'cost') this.flashNeeds(this.data.units[id!]!.cost);
    } else if (kind === 'research' && sel) {
      const r = this.sim.research(sel.id, id!);
      if (!r.ok) this.hud.toast(FAIL_KM[r.reason] ?? r.reason, now, 3);
      if (!r.ok && r.reason === 'cost') this.flashNeeds(this.data.techs[id!]!.cost);
    } else if (kind === 'unqueue' && sel) this.sim.unqueue(sel.id);
    else if (kind === 'cancel' && sel) this.sim.cancel(sel.id);
    else if (kind === 'stop') for (const u of this.myUnits()) this.sim.units.get(u)!.task = { kind: 'idle' };
    else if (kind === 'new') this.newGame(this.sim.difficulty);
    else if (kind === 'history') {
      this.historyOpen = !this.historyOpen;
      if (this.historyOpen) this.card = null;
    } else if (kind === 'visit') this.visit(Number(id), now);
    else if (kind === 'card-close') this.card = null;
    else if (kind === 'idle') this.nextIdle();
    else if (kind === 'army') this.selectArmy();
    else if (kind === 'call-army') {
      const ids = this.armyIds();
      if (ids.length) this.sim.cmdMove(ids, [this.cam.x, this.cam.z - 6], true);
      this.hud.toast(`<b>ហៅទ័ព</b> · The army marches here (${km(ids.length)})`, now, 3);
    } else if (kind === 'call-workers') {
      // Idle villagers come to where the player looks; auto-work then finds them a job there.
      const ids = this.sim.idleWorkers().map((u) => u.id);
      if (ids.length) this.sim.cmdMove(ids, [this.cam.x, this.cam.z - 6]);
      this.hud.toast(`<b>ហៅកម្មករ</b> · Idle villagers come here (${km(ids.length)})`, now, 3);
    } else if (kind === 'auto') {
      this.sim.autoWork = !this.sim.autoWork;
      this.hud.toast(
        this.sim.autoWork
          ? 'ការងារស្វ័យប្រវត្តិ បើក · Auto-work ON'
          : 'ការងារស្វ័យប្រវត្តិ បិទ · Auto-work OFF',
        now,
        3,
      );
    }
  }

  /** Empire places and neighbouring kingdoms whose names are on screen now. */
  private labels(): Array<{ x: number; y: number; html: string; cls: string }> {
    const out: Array<{ x: number; y: number; html: string; cls: string }> = [];
    const m = this.sim.map;
    const inView = (p: { x: number; y: number }) =>
      p.x > 40 && p.x < KSIZE.width - 40 && p.y > 120 && p.y < KSIZE.height - PANEL_H;
    for (const p of this.sim.places) {
      const [x, z] = tileToWorld(m, p.at[0], p.at[1]);
      if (Math.abs(x - this.cam.x) > this.cam.dist * 2 || Math.abs(z - this.cam.z) > this.cam.dist * 2)
        continue;
      const q = this.view.project(x, 12, z);
      if (!inView(q)) continue;
      const found = this.sim.discovered.has(p.id);
      if (p.hidden && !found) continue; // hidden until found (PK)
      out.push({ ...q, html: `${this.esc(p.km)} · ${this.esc(p.en)}`, cls: found ? 'found' : '' });
    }
    for (const n of this.data.world.neighbours) {
      const [x, z] = tileToWorld(m, n.at[0], n.at[1]);
      if (Math.abs(x - this.cam.x) > this.cam.dist * 2.5 || Math.abs(z - this.cam.z) > this.cam.dist * 2.5)
        continue;
      const q = this.view.project(x, 4, z);
      if (inView(q)) out.push({ ...q, html: `${this.esc(n.km)} · ${this.esc(n.en)}`, cls: 'neighbour' });
    }
    return out;
  }

  /** Pick what is under the pointer (throttled), mark it and write its hint. */
  private updateHover(now: number): void {
    if (now - this.hovered.at < 120) return;
    this.hovered.at = now;
    const c = this.cursorPx;
    if (!c || this.drag || c.y > KSIZE.height - PANEL_H || c.y < 100) {
      this.hovered.target = null;
      this.view.setHover(null);
      return;
    }
    const pick = this.pickAt(c.x, c.y);
    if (pick.king) {
      this.hovered.target = { kind: 'node', id: -1 };
      this.hovered.html = this.kingHint();
      this.view.setHover(null);
      return;
    }
    const target: HoverTarget =
      pick.unit !== undefined
        ? { kind: 'unit', id: pick.unit }
        : pick.animal !== undefined
          ? { kind: 'animal', id: pick.animal }
          : pick.building !== undefined
            ? { kind: 'building', id: pick.building }
            : pick.node !== undefined
              ? { kind: 'node', id: pick.node }
              : null;
    this.hovered.target = target;
    this.hovered.html = target ? this.hint(target) : this.placeHint(pick.ground);
    if (!target && this.hovered.html) this.hovered.target = { kind: 'node', id: -1 };
    this.view.setHover(target);
  }

  /** The hint for an empire place near the pointer, if any. */
  private placeHint(ground: XZ | null): string {
    if (!ground) return '';
    const [tx, tz] = worldToTile(this.sim.map, ground[0], ground[1]);
    const p = this.sim.places.find(
      (x) => Math.hypot(x.at[0] - tx, x.at[1] - tz) < 9 && (!x.hidden || this.sim.discovered.has(x.id)),
    );
    if (!p) return '';
    const found = this.sim.discovered.has(p.id);
    const e = this.esc.bind(this);
    return `<b>${e(p.km)}</b> · ${e(p.en)}<br>${e(p.note.km)}<br><small>${e(p.note.en)}</small><br>${
      found
        ? '✓ បានរកឃើញ · Found'
        : '<span class="k-do">ផ្ញើអ្នកណាម្នាក់ទៅរក · Send someone to find it (a gift awaits)</span>'
    }`;
  }

  /** What a thing is, how it is doing and what a right-click with the selection will do. */
  private hint(t: NonNullable<HoverTarget>): string {
    const s = this.sim;
    const e = this.esc.bind(this);
    const mine = this.myUnits().map((id) => s.units.get(id)!);
    const workers = mine.some((u) => s.def(u.type).gather);
    const fighters = mine.some((u) => s.def(u.type).role !== 'worker');
    if (t.kind === 'unit') {
      const u = s.units.get(t.id);
      if (!u) return '';
      const d = s.def(u.type);
      const doing =
        u.task.kind === 'gather'
          ? `${RES_LABEL[u.task.res].km} · gathering ${u.task.res}`
          : u.task.kind === 'build'
            ? 'សាងសង់ · building'
            : u.task.kind === 'attack'
              ? 'ប្រយុទ្ធ · fighting'
              : u.task.kind === 'hunt'
                ? 'បរបាញ់ · hunting'
                : u.task.kind === 'move'
                  ? 'ដើរ · walking'
                  : 'ទំនេរ · idle';
      const enemy = u.team !== PLAYER;
      return `<b>${e(d.km)}</b> · ${e(d.en)}${enemy ? ` · <span class="k-need">${e(s.opponent.km)}</span>` : ''}<br>♥ ${Math.ceil(u.hp)}/${d.hp} · ${doing}${
        enemy && mine.length ? '<br><span class="k-do">ចុចស្ដាំ = វាយ · Right-click: attack</span>' : ''
      }`;
    }
    if (t.kind === 'animal') {
      const a = s.animals.get(t.id);
      if (!a) return '';
      const k = s.kindOf(a);
      return `<b>${e(k.km)}</b> · ${e(k.en)}<br>♥ ${Math.ceil(a.hp)}/${k.hp}${
        k.huntable ? ` · ស្បៀង ${k.meat} food` : ''
      }${animalTraits(k)}<br><span class="k-do">${
        !k.huntable
          ? 'សត្វការពារ មិនបរបាញ់ · Protected: not hunted'
          : workers
            ? 'ចុចស្ដាំ = បរបាញ់ · Right-click: hunt'
            : 'ជ្រើសអ្នកស្រុក រួចចុចស្ដាំដើម្បីបរបាញ់ · Select villagers, then right-click to hunt'
      }</span>`;
    }
    if (t.kind === 'building') {
      const b = s.buildings.get(t.id);
      if (!b) return '';
      const d = s.bdef(b.type);
      const full = this.data.buildings[b.type];
      const lines = [
        `<b>${e(b.temple ? this.templeName(b.temple).km : d.km)}</b> · ${e(b.temple ? this.templeName(b.temple).en : d.en)}`,
      ];
      lines.push(
        `♥ ${Math.ceil(b.hp)}/${Math.ceil(b.maxHp)}${b.progress < 1 ? ` · សាងសង់ ${km(Math.floor(b.progress * 100))}% built` : ''}`,
      );
      if (b.team !== PLAYER) {
        if (fighters) lines.push('<span class="k-do">ចុចស្ដាំ = វាយ · Right-click: attack</span>');
      } else {
        if (b.progress < 1)
          lines.push(
            `<span class="k-need">ត្រូវការអ្នកសាង · Needs builders</span>${workers ? '<br><span class="k-do">ចុចស្ដាំ = សាង · Right-click: build</span>' : ''}`,
          );
        else if (b.type === 'riceField')
          lines.push(
            `ស្បៀងនៅសល់ ${Math.floor(b.food ?? 0)} · food left${workers ? '<br><span class="k-do">ចុចស្ដាំ = ធ្វើស្រែ · Right-click: farm</span>' : ''}`,
          );
        if (b.type === 'townCentre' && b.progress >= 1) {
          // The royal court on the terrace (D78): the king of this chapter's era.
          const king = this.data.temples[s.chapterData.temple]?.king ?? s.era.ruler.en;
          lines.push(
            `👑 ព្រះមហាក្សត្រ <b>${e(s.era.ruler.km)}</b> · King ${e(king)}, with the queens, the royal Brahmins (purohita) and parasol bearers`,
          );
        }
        if (d.dropOff.length)
          lines.push(
            `ទទួល · Takes: ${d.dropOff.map((r) => RES_LABEL[r as keyof typeof RES_LABEL].km).join(' ')}`,
          );
        if (d.trains.length)
          lines.push(
            `បណ្ដុះបណ្ដាល · Trains: ${d.trains
              .filter((x) => s.allows('units', x))
              .map((x) => this.data.units[x]!.km)
              .join(' ')}`,
          );
      }
      if (full?.notes) lines.push(`<small>${e(full.notes)}</small>`);
      return lines.join('<br>');
    }
    const n = s.nodes.get(t.id);
    if (!n) return '';
    const names: Record<string, [string, string]> = {
      tree: ['ដើមឈើ', 'Tree'],
      stone: ['ថ្ម', 'Stone'],
      gold: ['មាស', 'Gold'],
      gems: ['ត្បូង (ត្បូងកណ្ដៀង ត្បូងទទឹម)', 'Gems (sapphires, rubies)'],
      fruit: ['ដើមផ្លែឈើ', 'Fruit trees'],
      fish: ['ត្រី', 'Fish'],
      meat: ['សាច់', 'Meat'],
    };
    const [nk, ne] = names[n.kind] ?? [n.kind, n.kind];
    const res =
      n.kind === 'tree'
        ? 'wood'
        : n.kind === 'stone'
          ? 'stone'
          : n.kind === 'gold' || n.kind === 'gems'
            ? 'gold'
            : 'food';
    return `<b>${nk}</b> · ${ne}<br>${Math.floor(n.amount)} ${RES_LABEL[res as keyof typeof RES_LABEL].km} · ${res} left<br><span class="k-do">${
      workers
        ? 'ចុចស្ដាំ = ប្រមូល · Right-click: gather'
        : 'ជ្រើសអ្នកស្រុក រួចចុចស្ដាំ · Select villagers, then right-click'
    }</span>`;
  }

  /**
   * Music mood (D76): tense from `raidWarnSec` before a raid (while raids can come) until no
   * enemy is near the player's buildings, then calm again.
   */
  private updateMood(now: number): 'calm' | 'tense' {
    const s = this.sim;
    const rules = this.sound.music.cfg.moodRules;
    const mine = [...s.buildings.values()].filter((b) => b.team === PLAYER).map((b) => s.center(b));
    const enemies = [...s.units.values()]
      .filter((u) => u.team === RIVAL && u.wave)
      .map((u) => [u.x, u.z] as const);
    return this.musicMood.update(now / 1000, {
      secondsToRaid: s.ai.nextRaid - s.time,
      raidsWaiting: s.ai.state === 'WAITING' || !!s.outcome,
      enemyNear: anyNear(enemies, mine, rules.nearMetres),
    });
  }

  /** The sound of a simulation event: heard when it happens near the view (or always, for news). */
  private eventSound(e: KingdomSim['events'][number]): void {
    const name = sfxForEvent(e as unknown as { kind: string });
    if (!name) return;
    const at =
      e.kind === 'hit' || e.kind === 'found' || e.kind === 'hunted' || e.kind === 'delivered'
        ? e.at
        : e.kind === 'shot'
          ? e.from
          : e.kind === 'death'
            ? ([e.unit.x, e.unit.z] as XZ)
            : null;
    if (at) {
      const far = Math.hypot(at[0] - this.cam.x, at[1] - this.cam.z);
      if (far > this.cam.dist * 1.5) return;
      if (e.kind === 'delivered' && e.n <= 0) return;
    }
    const t = performance.now();
    if (t < (this.lastSfx.get(name) ?? 0)) return;
    this.lastSfx.set(name, t + 150);
    this.sound.play(name, at ? { pan: panFor(at[0] - at[1], this.cam.x - this.cam.z) } : undefined);
  }

  /**
   * The Android back button: close whatever is open (map, menu, card, History, placing,
   * the selection), one thing per press. False when nothing was open (the app may close).
   */
  back(): boolean {
    // Android back leaves the 3D hero mode first (never closes the app from it).
    if (this.hero?.active) {
      this.hero.exit('player');
      return true;
    }
    if (this.anachak && this.kingMenu !== 'main') {
      this.kingMenu = 'main';
      return true;
    }
    if (this.ancient.isOpen) {
      this.ancient.close();
      return true;
    }
    if (this.hud.menuOpen) {
      this.hud.menuOpen = false;
      return true;
    }
    if (this.card) {
      this.card = null;
      return true;
    }
    if (this.historyOpen) {
      this.historyOpen = false;
      return true;
    }
    if (this.placing) {
      this.placing = null;
      this.view.setGhost(null);
      return true;
    }
    if (this.selected.size) {
      this.selected.clear();
      return true;
    }
    return false;
  }

  /** The About card: the game and its developer (config/credits.json). */
  creditsHtml(): string {
    const c = CREDITS;
    const e = this.esc.bind(this);
    // PK 1.7.0: who made it, why, and that it is still a prototype.
    const para = (p: { km: string; en: string } | undefined) =>
      p ? `<p class="k-about">${e(p.km)}<br><small>${e(p.en)}</small></p>` : '';
    const st = c.status;
    return (
      `<h2>${e(c.game.km)}${st ? ` <span class="k-proto">${e(st.label.km)} · ${e(st.label.en)}</span>` : ''}</h2><p>${e(c.game.en)}</p>` +
      `<p class="k-credit">${e(c.developer.km)} · ${e(c.developer.en)}<br><span class="k-credit-km">${e(c.developer.nameKm)}</span><br><b>${e(c.developer.name)}</b></p>` +
      para(c.about) +
      para(c.purpose) +
      (st ? `<p class="k-about k-about-note">${e(st.km)}<br><small>${e(st.en)}</small></p>` : '') +
      `<p>${e(c.note.km)}<br>${e(c.note.en)}</p><button class="k-btn" data-act="card-close" data-ui><span class="k-btn-km">បិទ · Close</span></button>`
    );
  }

  /** Open the old map of the empire, centred on a point (world metres). */
  openMap(focus?: { x: number; z: number }): void {
    this.ancient.open(mapViewOf(this.sim), focus ?? { x: this.cam.x, z: this.cam.z });
  }

  /** Idle-worker button: select the next idle villager and look at it. */
  nextIdle(): void {
    const idle = this.sim.idleWorkers();
    if (!idle.length) {
      this.hud.toast('គ្មានអ្នកស្រុកទំនេរ · No idle villagers', performance.now(), 2);
      return;
    }
    const u = idle[this.idleIndex++ % idle.length]!;
    this.selected.clear();
    this.selected.add(u.id);
    this.flyTo(u.x, u.z + 6, Math.min(this.cam.dist, 70));
  }

  private armyIds(): number[] {
    return [...this.sim.units.values()]
      .filter((u) => u.team === PLAYER && !['worker', 'scout'].includes(this.sim.def(u.type).role))
      .map((u) => u.id);
  }

  /** Army button: select every soldier (and look at them). */
  selectArmy(): void {
    const ids = this.armyIds();
    this.selected.clear();
    for (const id of ids) this.selected.add(id);
    if (ids.length) this.centreOnSelection();
  }

  /** The 3D icon of an item (null while it is being drawn). */
  private icon(kind: 'building' | 'unit' | 'tech', id: string): string | null {
    const key = `${kind}:${id}`;
    const url = this.icons.url(key);
    if (url) return url;
    this.icons.want(key, () =>
      kind === 'tech'
        ? manuscriptGeometry()
        : kind === 'unit'
          ? teamUnitGeometry(id)
          : id === 'monument'
            ? landmarkGeometry('temple')
            : buildingGeometry(id),
    );
    return null;
  }

  /** Hover hint for a build / train / research button: what it is, cost, what is missing. */
  private buttonTip(
    name: { km: string; en: string },
    notes: string | undefined,
    cost: Cost | undefined,
    needs: string[],
  ): string {
    const e = this.esc.bind(this);
    const price = cost
      ? Object.entries(cost)
          .map(([r, n]) => `${n} ${RES_LABEL[r as keyof typeof RES_LABEL].km}`)
          .join(' · ')
      : '';
    return `<b>${e(name.km)}</b> · ${e(name.en)}${price ? `<br>${price}` : ''}${
      needs.length ? `<br><span class="k-need">${needs.map(e).join('<br>')}</span>` : ''
    }${notes ? `<br><small>${e(notes)}</small>` : ''}`;
  }

  /** What is missing for a building (requirements, era, resources). */
  private buildNeeds(type: string): string[] {
    const s = this.sim;
    const d = this.data.buildings[type]!;
    const out: string[] = [];
    if (!s.allows('buildings', type)) out.push('មិនទាន់ដល់សម័យ · Not in this era yet');
    for (const r of d.requires)
      if (!s.hasBuilt(r))
        out.push(`ត្រូវការ${this.data.buildings[r]!.km} · Needs a ${this.data.buildings[r]!.en}`);
    for (const [r, n] of Object.entries(d.cost)) {
      const have = Math.floor(s.res[PLAYER][r as keyof Cost & string] ?? 0);
      if (have < (n ?? 0))
        out.push(
          `ខ្វះ${RES_LABEL[r as keyof typeof RES_LABEL].km} ${(n ?? 0) - have} · ${(n ?? 0) - have} more ${r}`,
        );
    }
    return out;
  }

  private panel(): void {
    const s = this.sim;
    const units = [...this.selected].map((id) => s.units.get(id)).filter((u): u is Unit => !!u);
    const buildings = [...this.selected].map((id) => s.buildings.get(id)).filter((b): b is Building => !!b);
    if (this.selected.has(KING_ID)) return this.kingPanel();
    this.kingMenu = 'main'; // the levy page closes when the king is not selected
    for (const id of [...this.selected])
      if (!s.units.has(id) && !s.buildings.has(id)) this.selected.delete(id);
    const D = this.data;
    const mine = units.filter((u) => u.team === PLAYER);
    if (mine.some((u) => u.type === 'villager')) {
      const v = D.units.villager!;
      const buttons: Button[] = [
        'house',
        'nobleHouse',
        'riceField',
        'storehouse',
        'lumberCamp',
        'port',
        // Anachak Khmer: the market, to exchange goods (PK).
        ...(this.anachak ? ['market'] : []),
        'barracks',
        'monument',
      ].map((t) => {
        const b = D.buildings[t]!;
        if (t === 'monument') {
          // The temple button names this chapter's temple.
          const why = s.canPlace(t, ...s.monumentSpot());
          const name = this.templeName(s.chapterData.temple);
          const needs = this.buildNeeds(t);
          if (why === 'busy') needs.push('កំពុងសាង · Already being built');
          return {
            act: `build:${t}`,
            km: name.km,
            en: name.en,
            cost: b.cost,
            disabled: why === 'requires' || why === 'cost' || why === 'era' || why === 'busy' || !!s.outcome,
            icon: this.icon('building', t),
            tip: this.buttonTip(name, 'Built on its own site (golden stakes on the map).', b.cost, needs),
          };
        }
        const why = s.canPlace(t, ...(b.fixedSite ? s.monumentSpot() : ([-999, -999] as XZ)));
        const disabled =
          why === 'requires' || why === 'cost' || why === 'era' || (b.fixedSite && why === 'busy');
        return {
          act: `build:${t}`,
          km: b.km,
          en: b.en,
          cost: b.cost,
          disabled,
          icon: this.icon('building', t),
          tip: this.buttonTip(b, b.notes, b.cost, this.buildNeeds(t)),
        };
      });
      buttons.push({
        act: 'stop',
        km: 'ឈប់',
        en: 'Stop',
        tip: '<b>ឈប់</b> · Stop: the selection stands still',
      });
      if (this.anachak) buttons.unshift(this.heroButton(mine[0]!));
      const carrying = mine.find((u) => u.carry && u.carry.n > 0);
      return this.hud.renderPanel({
        title: { km: v.km, en: v.en },
        count: mine.length,
        hp: mine.length === 1 ? [mine[0]!.hp, v.hp] : undefined,
        confidence: v.confidence,
        note: v.notes,
        buttons,
        hint: this.placing
          ? 'ចុចដាក់ · Click to place · ចុចស្ដាំបោះបង់ · Right-click cancels'
          : carrying
            ? `${RES_LABEL[carrying.carry!.res].km} ${Math.floor(carrying.carry!.n)}`
            : 'ចុចស្ដាំលើដើមឈើ ថ្ម ស្រែ · Right-click trees, rocks, fields',
      });
    }
    if (mine.length) {
      const d = D.units[mine[0]!.type]!;
      return this.hud.renderPanel({
        title: { km: d.km, en: d.en },
        count: mine.length,
        hp: mine.length === 1 ? [mine[0]!.hp, d.hp] : undefined,
        confidence: d.confidence,
        note: d.notes,
        buttons: [
          ...(this.anachak ? [this.heroButton(mine[0]!)] : []),
          { act: 'stop', km: 'ឈប់', en: 'Stop' },
        ],
        hint: 'ចុចស្ដាំលើសត្រូវដើម្បីវាយ · Right-click an enemy to attack',
      });
    }
    const b = buildings[0];
    if (b) {
      const d = s.bdef(b.type);
      const full = D.buildings[b.type];
      const q = b.queue[0];
      const buttons: Button[] = [];
      if (b.team === PLAYER && b.progress >= 1) {
        for (const u of d.trains) {
          if (!s.allows('units', u)) continue;
          const U = D.units[u]!;
          const needs = U.requires
            .filter((t) => !s.techs.has(t))
            .map((t) => `ត្រូវរៀន${D.techs[t]!.km} · Needs ${D.techs[t]!.en}`);
          buttons.push({
            act: `train:${u}`,
            km: U.km,
            en: U.en,
            cost: U.cost,
            disabled: needs.length > 0,
            icon: this.icon('unit', u),
            tip: this.buttonTip(U, U.notes, U.cost, needs),
          });
        }
        for (const t of d.researches)
          if (!s.techs.has(t) && !s.isResearching(t) && s.allows('techs', t)) {
            const T = D.techs[t]!;
            const needs = T.requires
              .filter((r) => !s.techs.has(r))
              .map((r) => `ត្រូវរៀន${D.techs[r]!.km} មុន · Needs ${D.techs[r]!.en} first`);
            buttons.push({
              act: `research:${t}`,
              km: T.km,
              en: T.en,
              cost: T.cost,
              disabled: needs.length > 0,
              icon: this.icon('tech', t),
              tip: this.buttonTip(T, T.history, T.cost, needs),
            });
          }
        if (b.queue.length) buttons.push({ act: 'unqueue', km: 'បោះបង់', en: 'Cancel last' });
      }
      if (this.anachak && b.team === PLAYER && b.progress >= 1 && b.type === D.anachak.market.building)
        buttons.push(...this.marketButtons());
      if (b.team === PLAYER && b.progress < 1)
        buttons.push({ act: 'cancel', km: 'បោះបង់គ្រឹះ', en: 'Cancel' });
      // PK 1.6.0: move any of our buildings, except the historical temples.
      if (s.movable(b.id)) {
        const cost = s.moveCost(b.type);
        const short = !s.canAfford(cost);
        buttons.push({
          act: 'move',
          km: '✥ ផ្លាស់ទី',
          en: 'Move',
          cost,
          disabled: short || !!s.outcome,
          tip: this.buttonTip(
            { km: 'ផ្លាស់ទី', en: 'Move' },
            'Pick the building up and set it down somewhere else (right-click cancels).',
            cost,
            short ? ['មិនគ្រប់ធនធាន · Not enough resources'] : [],
          ),
        });
      }
      const label = q ? (q.kind === 'unit' ? D.units[q.id]!.km : D.techs[q.id]!.km) : '';
      return this.hud.renderPanel({
        title: { km: d.km, en: d.en },
        hp: [b.hp, b.maxHp],
        confidence: full?.confidence ?? 'FICTIONAL',
        note: full?.notes ?? 'The rival chiefdom is invented for this scenario.',
        queue: q
          ? { label, frac: 1 - q.left / q.total, more: b.queue.length - 1 }
          : b.progress < 1
            ? { label: `សាងសង់ ${km(Math.floor(b.progress * 100))}%`, frac: b.progress, more: 0 }
            : null,
        buttons: buttons.slice(0, 8),
        hint:
          b.type === 'riceField' && b.food !== undefined
            ? `ស្បៀងនៅសល់ ${Math.floor(b.food)} · Food left`
            : s.bdef(b.type).stockpile
              ? `ឈើរង់ចាំរទេះ ${km(Math.floor(b.stock ?? 0))} · Timber waiting for an ox-cart: ${Math.floor(b.stock ?? 0)}`
              : undefined,
      });
    }
    const idle = [...s.units.values()].filter(
      (u) => u.team === PLAYER && u.type === 'villager' && u.task.kind === 'idle',
    ).length;
    this.hud.renderPanel({
      title: { km: s.era.km, en: `Kingdom · ${s.era.en}` },
      buttons: [],
      idle: !this.placing,
      hint: `${
        this.opts.mobile
          ? 'ចុចដើម្បីជ្រើស ចុចដីដើម្បីបញ្ជា · Tap to select, tap the ground to send · អូស = រំកិល · Drag to move · ញែកម្រាមដៃ = ពង្រីក · Pinch to zoom · ចុចឱ្យយូរ = ព័ត៌មាន · Hold for hints'
          : 'ចុចឬអូសដើម្បីជ្រើស · Click or drag to select · Shift + ចុចស្ដាំ = ចំណុចដើរច្រើន · Shift + right-click: several spots'
      }${idle ? ` · អ្នកស្រុកទំនេរ ${km(idle)} idle` : ''}`,
    });
  }

  // ------------------------------------------------------------ LIVE, council, saves

  /** Gifts and likes from the LIVE become kingdom resources (config: rules.tiktok). */
  contribute(tier: TierName, stones: number, name: string | null, now: number): void {
    const per = this.data.rules.tiktok.perStone[tier];
    const give: Cost = {};
    for (const [r, n] of Object.entries(per)) give[r as keyof Cost] = (n ?? 0) * stones;
    this.sim.addResources(give);
    if (tier !== 'small' && name)
      this.hud.toast(
        `<b>${name.replace(/[<>&]/g, '')}</b> ${Object.entries(give)
          .map(([r, n]) => `+${n} ${RES_LABEL[r as keyof typeof RES_LABEL].km}`)
          .join(' ')}`,
        now,
      );
  }

  vote(userId: string, choice: 1 | 2 | 3): void {
    if (performance.now() < this.council.openUntil) this.council.votes.set(userId, choice);
  }

  private updateCouncil(now: number): string | null {
    const C = this.data.rules.council;
    const c = this.council;
    if (now >= c.nextAt && now >= c.openUntil) {
      c.openUntil = now + C.voteSec * 1000;
      c.nextAt = now + C.intervalSec * 1000;
      c.votes.clear();
    }
    if (now < c.openUntil) {
      const counts = [0, 0, 0];
      for (const v of c.votes.values()) counts[v - 1]!++;
      const left = Math.ceil((c.openUntil - now) / 1000);
      return `<h3>ក្រុមប្រឹក្សា · Council vote <span>${km(left)}s</span></h3><ol>${C.choices
        .map((ch, i) => `<li><span><b>!${i + 1}</b> ${ch.km} · ${ch.en}</span><b>${km(counts[i]!)}</b></li>`)
        .join('')}</ol>`;
    }
    if (c.votes.size && now >= c.openUntil) {
      // Voting closed: carry out the winner once.
      const counts = [0, 0, 0];
      for (const v of c.votes.values()) counts[v - 1]!++;
      const win = counts.indexOf(Math.max(...counts));
      const ch = C.choices[win]!;
      if (ch.give) this.sim.addResources(ch.give);
      const h = this.hall();
      if (ch.units && h)
        for (const [u, n] of Object.entries(ch.units)) for (let i = 0; i < n; i++) this.sim.spawnNear(h, u);
      this.hud.toast(`ក្រុមប្រឹក្សាជ្រើស <b>${ch.km}</b> · ${ch.en}`, now, 6);
      c.votes.clear();
    }
    return null;
  }

  save(slot: Slot): boolean {
    const ok = this.saves.save(slot, this.sim);
    this.hud.toast(ok ? `រក្សាទុក · Saved (${slot})` : 'រក្សាទុកមិនបាន · Save failed', performance.now(), 3);
    return ok;
  }

  load(slot: Slot): boolean {
    const r = this.saves.load(slot, this.data);
    if (!r) {
      this.hud.toast('គ្មានឯកសារ · No save', performance.now(), 3);
      return false;
    }
    this.replaceSim(r.sim);
    this.hud.toast(
      r.recovered ? 'បានស្ដារពីបម្រុង · Restored from a backup' : `បើក · Loaded (${slot})`,
      performance.now(),
      4,
    );
    return true;
  }

  newGame(difficulty: Difficulty): void {
    // Every new game gets its own layout of forests, stone, gold and fruit (PK).
    this.replaceSim(new KingdomSim(this.data, difficulty, true, newSeed(), this.variant));
    this.hud.toast('ល្បែងថ្មី · New game', performance.now(), 3);
    this.showChapterIntro();
  }

  private replaceSim(sim: KingdomSim): void {
    this.hero?.dropScene();
    this.kingMenu = 'main';
    this.sim = sim;
    this.selected.clear();
    this.seenEvents = sim.events.length;
    this.card = null;
    this.historyOpen = false;
    this.view = this.makeView();
    this.centreOnHall();
  }

  /**
   * A kingdom a few minutes in (?kingdomDemo=1): houses, fields, a store, a war camp,
   * Preah Ko rising, soldiers on guard. For screenshots and art review; not saved.
   */
  demo(): void {
    const s = this.sim;
    this.card = null;
    s.addResources({ food: 3000, wood: 3000, stone: 3000, gold: 1000 });
    const [tx, tz] = s.map.start;
    const vill = [...s.units.values()].filter((u) => u.type === 'villager').map((u) => u.id);
    const put = (type: string, x0: number, z0: number, progress = 1) => {
      // Resources are placed at random each game: look round the wanted spot for free ground.
      let [x, z] = [x0, z0];
      if (type !== 'monument')
        search: for (let r = 0; r < 12; r++)
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++)
              if (!s.canPlace(type, x0 + dx, z0 + dz)) {
                [x, z] = [x0 + dx, z0 + dz];
                break search;
              }
      const r = s.place(type, x, z, []);
      if (r.ok) {
        const b = s.buildings.get(r.id)!;
        b.progress = progress;
        b.hp = b.maxHp * Math.max(0.1, progress);
      }
      return r.ok ? r.id : -1;
    };
    for (const [x, z] of [
      [tx + 5, tz - 4],
      [tx + 5, tz - 1],
      [tx - 7, tz - 4],
      [tx - 7, tz - 1],
    ] as const)
      put('house', x, z);
    const field1 = put('riceField', tx - 3, tz + 5);
    const field2 = put('riceField', tx + 2, tz + 5);
    put('storehouse', tx + 8, tz - 9);
    put('barracks', tx + 9, tz + 2);
    // A lumber camp with timber waiting and its ox-cart (D77).
    const yard = s.buildings.get(put('lumberCamp', tx - 11, tz - 6));
    if (yard) {
      yard.stock = 45;
      s.spawnNear(yard, 'oxCart');
    }
    const [mx, mz] = s.monumentSpot();
    const mon = put('monument', mx, mz, 0.42);
    for (let i = 0; i < 6; i++) s.spawnNear(this.hall()!, 'villager');
    const all = [...s.units.values()].filter((u) => u.type === 'villager').map((u) => u.id);
    if (field1 > 0) s.cmdFarm([all[0]!], field1);
    if (field2 > 0) s.cmdFarm([all[1]!], field2);
    if (mon > 0) s.cmdBuild(all.slice(2, 7), mon);
    const tree = [...s.nodes.values()]
      .filter((n) => n.kind === 'tree')
      .sort((a, b) => Math.hypot(a.tx - tx, a.tz - tz) - Math.hypot(b.tx - tx, b.tz - tz))[0];
    if (tree) s.cmdGather(all.slice(7, 10), tree.id);
    const camp = [...s.buildings.values()].find((b) => b.type === 'barracks') ?? this.hall()!;
    for (let i = 0; i < 4; i++) s.spawnNear(camp, 'spearman');
    for (let i = 0; i < 3; i++) s.spawnNear(camp, 'archer');
    s.techs.add('bronzeSpearheads');
    s.techs.add('elephantTraining');
    s.spawnNear(camp, 'warElephant');
    s.update(8);
    void vill;
  }

  /** Host panel controls (through the bridge). */
  host(op: string, arg?: string): void {
    if (op === 'save') this.save('manual');
    else if (op === 'load') this.load('manual');
    else if (op === 'new') this.newGame((arg as Difficulty) || this.sim.difficulty);
  }

  // ------------------------------------------------------------ frame

  /**
   * PK: the king is happy when the city grows. A finished building or new people make him
   * bless the city (not more often than `rules.court.blessEverySec`); every
   * `rules.court.milestone` people he says so.
   */
  private cityGrew(now: number): void {
    const c = this.data.rules.court;
    const pop = this.sim.popUsed(PLAYER);
    const step = Math.floor(pop / c.milestone);
    if (step > this.popMilestone) {
      if (this.popMilestone >= 0)
        this.hud.toast(
          `👑 <b>ព្រះរាជាប្រទានពរ</b> · The king blesses the growing city: ${km(step * c.milestone)} people`,
          now,
          6,
        );
      this.popMilestone = step;
    } else if (now < this.blessAt) return;
    this.blessAt = now + c.blessEverySec * 1000;
    this.view.courtBless(now / 1000, c.blessSec);
  }

  /**
   * PK: where the see-through circle menu stands — round the clicked building, or round the
   * selected villagers — or null (nothing selected, placing, a card or the board open).
   */
  private radialAnchor(): { x: number; y: number } | null {
    if (!this.selected.size || this.placing || this.card || this.historyOpen || this.ordersOpen) return null;
    const items = [...this.selected];
    if (items[0] === KING_ID) {
      const hall = this.hall();
      if (!hall) return null;
      const [cx, cz] = this.sim.center(hall);
      return this.onScreen(this.view.project(cx, 1.4, cz + 7.6));
    }
    const b = items.length === 1 ? this.sim.buildings.get(items[0]!) : undefined;
    if (b) {
      if (b.team !== PLAYER) return null;
      const [x, z] = this.sim.center(b);
      return this.onScreen(this.view.project(x, 3, z));
    }
    const us = items.map((id) => this.sim.units.get(id)).filter((u) => u && u.team === PLAYER) as Unit[];
    // Villagers get the circle menu; in Anachak Khmer every character does (its 🎮 button).
    if (!us.length || (!this.anachak && us.some((u) => u.type !== 'villager'))) return null;
    const x = us.reduce((a, u) => a + u.x, 0) / us.length;
    const z = us.reduce((a, u) => a + u.z, 0) / us.length;
    return this.onScreen(this.view.project(x, 1.5, z));
  }

  /** The point if it is in the open part of the screen; the circle menu hides otherwise. */
  private onScreen(p: { x: number; y: number }): { x: number; y: number } | null {
    return p.x > 0 && p.x < KSIZE.width && p.y > 200 && p.y < KSIZE.height - PANEL_H ? p : null;
  }

  /** PK: the king's name and what he is doing, when the cursor is on him. */
  private kingHint(): string {
    const s = this.sim;
    const e = this.esc.bind(this);
    const king = this.data.temples[s.chapterData.temple]?.king ?? s.era.ruler.en;
    const c = currentCeremony(s);
    return (
      `👑 <b>${e(s.era.ruler.km)}</b><br>King ${e(king)}` +
      `<br>ព្រះបារមី · Royal power ${km(Math.floor(s.prestige))}` +
      (c ? `<br>🪔 ${e(c.km)} · ${e(c.en)}` : '') +
      (s.decree ? '<br>📜 រាជបញ្ជា៖ សាងប្រាសាទ · Decree: build the temple' : '') +
      '<br><span class="k-do">ចុច = រាជបញ្ជា · Click for his orders</span>'
    );
  }

  /** PK: the king's own menu — the decree to build the temple, and his helpers. */
  private kingPanel(): void {
    if (this.anachak && this.kingMenu === 'levy') return this.levyPanel();
    this.kingMenu = 'main';
    const s = this.sim;
    const king = this.data.temples[s.chapterData.temple]?.king ?? s.era.ruler.en;
    const short = templeShortfall(s);
    const lacks = Object.entries(short)
      .map(([r, n]) => `${km(Math.ceil(n ?? 0))} ${RES_LABEL[r as keyof typeof RES_LABEL].km}`)
      .join(' ');
    const C = s.data.rules.ceremonies;
    const nextIn = Math.max(0, Math.round((s.ceremonyAt < 0 ? C.firstSec : s.ceremonyAt) - s.time));
    const cer = currentCeremony(s);
    const buttons: Button[] = [
      s.decree
        ? {
            act: 'decree:stop',
            km: 'ឈប់បញ្ជា',
            en: 'End decree',
            tip: '<b>បញ្ឈប់រាជបញ្ជា</b> · End the decree: the people go back to their own work',
          }
        : {
            act: 'decree:temple',
            km: 'រាជបញ្ជា',
            en: 'Build temple',
            tip: '<b>រាជបញ្ជា</b> · Decree: everyone gathers what the temple still lacks, then builds it, until it stands (farmers stay on their fields)',
          },
      {
        act: 'find',
        km: 'រកធនធាន',
        en: 'Seek scarce',
        tip: '<b>រកធនធាន</b> · Send the hunter (or an idle villager) to find what the kingdom has least of',
      },
      {
        act: 'call-workers',
        km: 'ហៅកម្មករ',
        en: 'Call workers',
        tip: '<b>ហៅកម្មករ</b> · Every idle villager comes to the middle of the view and finds work',
      },
    ];
    if (this.anachak) buttons.push(...this.kingAnachakButtons());
    this.hud.renderPanel({
      title: { km: s.era.ruler.km, en: `King ${king}` },
      confidence: s.era.ruler.confidence,
      note: 'The king of this chapter, from the inscriptions.',
      buttons,
      hint:
        `👑 ព្រះបារមី ${km(Math.floor(s.prestige))} · Royal power` +
        (cer
          ? ` · 🪔 ${this.esc(cer.km)} · ${this.esc(cer.en)}`
          : ` · ពិធីបន្ទាប់ ${km(Math.floor(nextIn / 60))}:${km(nextIn % 60).padStart(2, '០')} · next ceremony`) +
        (lacks ? ` · ប្រាសាទខ្វះ ${lacks} · the temple lacks` : ''),
    });
  }

  // ------------------------------------------------------------ Anachak Khmer (D92)

  /** Play this character in 3D (PK: every character has the button). */
  private heroButton(u: Unit): Button {
    const d = this.data.units[u.type]!;
    return {
      act: `hero:${u.id}`,
      km: '🎮 លេង ៣D',
      en: 'Play in 3D',
      tip: `<b>លេង ៣D</b> · Play this ${this.esc(d.en.toLowerCase())} in 3D in the living kingdom (Esc to come back)`,
    };
  }

  /**
   * The market (PK: exchange goods): what to give (press to change), how much, and one button
   * per good to get at today's rate; an arrow shows a good that is cheap (▼) or dear (▲) now.
   */
  private marketButtons(): Button[] {
    const s = this.sim;
    const M = this.data.anachak.market;
    const lot = M.lots[this.marketLot % M.lots.length]!;
    const give = this.marketGive;
    const have = s.res[PLAYER][give];
    const arrow = (r: Resource) => {
      const t = trend(s, r);
      return t > 0.08 ? ' ▲' : t < -0.08 ? ' ▼' : '';
    };
    const buttons: Button[] = [
      {
        act: 'mk-give',
        km: `ឱ្យ ${RES_LABEL[give].km}`,
        en: `Give ${RES_LABEL[give].en}${arrow(give)}`,
        tip: '<b>ឱ្យ</b> · The good you give (press for the next one). ▲ dear now, ▼ cheap now',
      },
      {
        act: 'mk-lot',
        km: `× ${km(lot)}`,
        en: `${lot} at a time`,
        tip: '<b>ចំនួន</b> · How much you give in one trade (press for the next size)',
      },
    ];
    for (const get of GOODS) {
      if (get === give) continue;
      const n = quote(s, give, get, lot);
      buttons.push({
        act: `trade:${get}`,
        km: `+${km(n)} ${RES_LABEL[get].km}`,
        en: `Get ${n} ${RES_LABEL[get].en}${arrow(get)}`,
        cost: { [give]: lot },
        disabled: have < lot || n < 1,
        tip: `<b>ដូរ</b> · Give ${lot} ${RES_LABEL[give].en}, get ${n} ${RES_LABEL[get].en} (after the stall rent of ${Math.round(M.fee * 100)}% to the officials). Each trade makes what you sell cheaper and what you buy dearer; prices drift back with time.`,
      });
    }
    return buttons;
  }

  /** The king's extra orders in Anachak Khmer: call to arms, to battle, his book, play him. */
  private kingAnachakButtons(): Button[] {
    const army = soldiers(this.sim).length;
    return [
      {
        act: 'king:levy',
        km: 'កេណ្ឌទ័ព',
        en: 'Call to arms',
        tip: '<b>កេណ្ឌទ័ព</b> · Call villagers to arms: choose the kind of soldier; each recruit costs that soldier’s price',
      },
      {
        act: 'battle',
        km: 'ចេញច្បាំង',
        en: `To battle (${army})`,
        disabled: army === 0,
        tip: '<b>ចេញច្បាំង</b> · Every soldier marches on the nearest enemy you know of, fighting on the way',
      },
      {
        act: 'overview',
        km: 'សៀវភៅរាជ្យ',
        en: 'Overview',
        tip: '<b>សៀវភៅរាជ្យ</b> · The king’s book: resources, people at work, soldiers, houses, stores, what is being built and planned',
      },
      {
        act: this.dangerAsk ? 'danger:off' : 'danger:on',
        km: this.dangerAsk ? '🔔 ហៅពេលគ្រោះ' : '🔕 មិនហៅ',
        en: this.dangerAsk ? 'Danger calls: on' : 'Danger calls: off',
        tip: '<b>ហៅពេលមានគ្រោះ</b> · When danger comes, fly to the person in danger and choose: play them in 3D, watch in 3D, or let life go on',
      },
      {
        act: 'hero:king',
        km: '🎮 លេង ៣D',
        en: 'Play in 3D',
        tip: '<b>លេង ៣D</b> · Play the king himself in 3D, with the sacred sword Preah Khan (Esc to come back)',
      },
    ];
  }

  /** The levy page: one button per army type the era allows, the batch size, back. */
  private levyPanel(): void {
    const s = this.sim;
    const L = this.data.anachak.levy;
    const n = L.steps[this.levyStep % L.steps.length]!;
    const buttons: Button[] = [
      { act: 'king:main', km: '↩ ត្រឡប់', en: 'Back', tip: '<b>ត្រឡប់</b> · Back to the king’s orders' },
      {
        act: 'levy-step',
        km: `× ${km(n)}`,
        en: `${n} at a time`,
        tip: '<b>ចំនួន</b> · How many villagers one press calls up (press for the next step)',
      },
    ];
    for (const c of levyChoices(s)) {
      const d = this.data.units[c.type]!;
      const cost: Cost = {};
      for (const [k, v] of Object.entries(d.cost)) cost[k as keyof Cost] = (v ?? 0) * n;
      const why = canLevy(s, c.type, 1);
      const needs = why ? [FAIL_KM[why] ?? why] : [];
      buttons.push({
        act: `levy:${c.type}`,
        km: d.km,
        en: d.en,
        cost,
        disabled: why === 'era' || why === 'requires' || why === 'limit' || why === 'unknown',
        icon: this.icon('unit', c.type),
        tip: this.buttonTip(d, `${L.note.en} Each recruit costs this soldier’s price.`, cost, needs),
      });
    }
    const free = recruits(s).length;
    this.hud.renderPanel({
      title: { km: 'កេណ្ឌទ័ព', en: 'Call to arms' },
      confidence: L.confidence,
      note: L.note.en,
      buttons,
      hint: `អ្នកស្រុកអាចកេណ្ឌបាន ${km(free)} · villagers who can be called · ផ្ទះ ${km(s.popUsed())}/${km(s.popCap())}`,
    });
  }

  /** Anachak Khmer's own actions; true when handled. */
  /**
   * Danger is coming (PK): the camera flies to the person in most danger and the player
   * chooses — play them in 3D, watch them in 3D while life goes on, or let it be. The choice
   * waits `askSec`, then life goes on. At most one call every `everySec`; none while playing.
   */
  dangerCall(who: number, danger: 'raid' | 'animal', what: string, now = performance.now()): boolean {
    const D = this.data.anachak.danger;
    const s = this.sim;
    if (!this.dangerAsk || this.danger) return false;
    if (this.hero?.active && (!this.hero.watching || this.hero.unitId === who)) return false;
    if (s.time - this.dangerAt < D.everySec) return false;
    const u = s.units.get(who);
    if (!u) return false;
    this.dangerAt = s.time;
    if (!this.hero?.active) {
      this.flyTo(u.x, u.z + 8, 45, now);
      this.selected.clear();
      this.selected.add(u.id);
    }
    const name = u.name ?? { km: s.def(u.type).km, en: s.def(u.type).en };
    const title =
      danger === 'raid'
        ? '⚔️ <b>ចោរវាយលុក!</b> · Raiders!'
        : `${/tiger/i.test(what) ? '🐅' : '⚠️'} <b>សត្វសាហាវ!</b> · A ${this.esc(what.toLowerCase())}!`;
    const el = document.createElement('div');
    el.className = 'k-danger';
    el.dataset.ui = '';
    el.innerHTML =
      `<h3>${title}</h3>` +
      `<p><b>${this.esc(name.km)}</b> · ${this.esc(name.en)} ស្ថិតក្នុងគ្រោះថ្នាក់ · is in danger. What will you do?</p>` +
      `<div class="k-danger-acts">` +
      `<button class="k-danger-play" data-act="danger:play" data-ui>🎮 <b>លេងជា ៣D</b><small>Play in 3D</small></button>` +
      `<button data-act="danger:watch" data-ui>🎥 <b>មើលជា ៣D</b><small>Watch in 3D</small></button>` +
      `<button data-act="danger:let" data-ui>▶ <b>ទុកឱ្យដំណើរការ</b><small>Let life go on</small></button>` +
      `</div>` +
      `<div class="k-danger-bar"><i style="animation: k-danger-time ${D.askSec}s linear forwards"></i></div>` +
      `<button class="k-danger-off" data-act="danger:off" data-ui>🔕 កុំសួរទៀត · Don’t ask again</button>`;
    this.hud.root.append(el);
    this.danger = { who, until: now + D.askSec * 1000, el };
    this.sound.play('raid');
    return true;
  }

  private closeDanger(): void {
    this.danger?.el.remove();
    this.danger = null;
  }

  /** The danger call showing now: who it is for (the tests read it). */
  get dangerFor(): number | null {
    return this.danger?.who ?? null;
  }

  private anachakAct(kind: string, id: string | undefined): boolean {
    const now = performance.now();
    const s = this.sim;
    if (kind === 'mk-give') {
      this.marketGive = GOODS[(GOODS.indexOf(this.marketGive) + 1) % GOODS.length]!;
      return true;
    }
    if (kind === 'mk-lot') {
      this.marketLot++;
      return true;
    }
    if (kind === 'trade') {
      const M = this.data.anachak.market;
      const lot = M.lots[this.marketLot % M.lots.length]!;
      const r = exchange(s, this.marketGive, id as Resource, lot);
      if (!r.ok) {
        this.hud.toast(FAIL_KM[r.reason] ?? r.reason, now, 3);
        if (r.reason === 'cost') this.flashNeeds({ [this.marketGive]: lot });
      } else {
        this.hud.toast(
          `🧺 <b>ដូរនៅផ្សារ</b> · Traded ${lot} ${RES_LABEL[this.marketGive].en} for ${r.id} ${RES_LABEL[id as Resource].en}`,
          now,
          3,
        );
        this.sound.play('complete', { gain: 0.5 });
      }
      return true;
    }
    if (kind === 'danger') {
      const who = this.danger?.who;
      this.closeDanger();
      if (id === 'off' || id === 'on') {
        this.dangerAsk = id === 'on';
        try {
          localStorage.setItem('anachak.dangerAsk', this.dangerAsk ? '1' : '0');
        } catch {
          /* private window: for this session only */
        }
        this.hud.toast(
          this.dangerAsk
            ? '🔔 <b>ហៅពេលមានគ្រោះ</b> · Danger calls on: the camera flies to whoever is in danger'
            : '🔕 <b>ឈប់ហៅ</b> · Danger calls off (alarms still sound). Turn them on in the king’s orders',
          now,
          5,
        );
        return true;
      }
      if (who === undefined || !s.units.has(who) || id === 'let') return true;
      if (this.hero?.active) this.hero.exit('player');
      if (id === 'play') return this.anachakAct('hero', String(who));
      if (id === 'watch' && this.hero?.enter({ unit: who }, { watch: true })) {
        this.selected.clear();
        this.card = null;
        this.hud.toast(
          '🎥 <b>មើលជា ៣D</b> · Watching in 3D: life goes on · E or 🎮 to take control · Esc back',
          now,
          6,
        );
      }
      return true;
    }
    if (kind === 'king') {
      this.kingMenu = id === 'levy' ? 'levy' : 'main';
      return true;
    }
    if (kind === 'levy-step') {
      this.levyStep++;
      return true;
    }
    if (kind === 'levy') {
      const L = this.data.anachak.levy;
      const n = L.steps[this.levyStep % L.steps.length]!;
      const r = levy(s, id!, n);
      if (!r.ok) {
        this.hud.toast(FAIL_KM[r.reason] ?? r.reason, now, 3);
        if (r.reason === 'cost') this.flashNeeds(this.data.units[id!]!.cost);
      } else {
        const [x, z] = rallyPoint(s);
        this.view.courtLook(x, z, now / 1000);
      }
      return true;
    }
    if (kind === 'battle') {
      const b = battle(s);
      if (b.to) this.view.courtLook(b.to[0], b.to[1], now / 1000);
      return true;
    }
    if (kind === 'overview') {
      this.card =
        this.card?.kind === 'overview'
          ? null
          : { html: this.overviewHtml(), until: Infinity, kind: 'overview' };
      this.historyOpen = false;
      return true;
    }
    if (kind === 'hero') {
      const target =
        id === 'king' ? ({ king: true } as const) : { unit: id ? Number(id) : (this.myUnits()[0] ?? -1) };
      if (this.hero?.enter(target)) {
        this.selected.clear();
        this.card = null;
        this.placing = null;
        this.view.setGhost(null);
        this.hud.toast(
          this.opts.mobile
            ? '🎮 <b>របៀបលេង ៣D</b> · ដំបងឆ្វេង = ដើរ · អូស = មើលជុំវិញ · ✕ = ត្រឡប់ · 3D: stick to move, drag to look, ✕ to come back'
            : '🎮 <b>របៀបលេង ៣D</b> · 3D hero mode: WASD move · Shift run · Space jump · Click strike · R skill · E work · Q dash · Esc back',
          now,
          7,
        );
      }
      return true;
    }
    return false;
  }

  /** The king's book (PK): everything he has, at a glance. */
  private overviewHtml(): string {
    const s = this.sim;
    const o = overview(s);
    const e = this.esc.bind(this);
    const D = this.data;
    const row = (icon: string, k: string, en: string, v: string) =>
      `<div class="k-ov-row"><span>${icon} <b>${k}</b> · ${en}</span><em>${v}</em></div>`;
    const res = (Object.keys(RES_LABEL) as Array<keyof typeof RES_LABEL>)
      .map((r) => row('', RES_LABEL[r].km, RES_LABEL[r].en, km(Math.floor(o.res[r]))))
      .join('');
    const g = o.people.gathering;
    const people =
      row('👥', 'ប្រជាជន', 'Villagers', km(o.people.total)) +
      row('🌾', 'ធ្វើស្រែ', 'In the rice fields', km(o.people.farming)) +
      (Object.keys(g) as Array<keyof typeof RES_LABEL>)
        .map((r) =>
          row('⛏️', `ប្រមូល${RES_LABEL[r].km}`, `Gathering ${RES_LABEL[r].en.toLowerCase()}`, km(g[r] ?? 0)),
        )
        .join('') +
      row('🔨', 'សាងសង់', 'Building', km(o.people.building)) +
      row('🏹', 'បរបាញ់', 'Hunting', km(o.people.hunting)) +
      row('🐕', 'ព្រាន និងឆ្កែ', 'Hunter-scouts', km(o.people.scouts)) +
      row('💤', 'ទំនេរ', 'Idle', km(o.people.idle)) +
      row('🏠', 'ផ្ទះ', `Houses (room ${o.pop.used}/${o.pop.cap})`, km(o.houses));
    const army = Object.entries(o.soldiers)
      .map(([t, n]) => row('⚔️', e(D.units[t]!.km), e(D.units[t]!.en), km(n)))
      .join('');
    const stores = Object.entries(o.stores)
      .map(([t, n]) => row('🏛️', e(s.bdef(t).km), e(s.bdef(t).en), km(n)))
      .join('');
    const rising = o.rising
      .slice(0, 6)
      .map((b) =>
        row('🏗️', e(s.bdef(b.type).km), e(s.bdef(b.type).en), `${km(Math.floor(b.progress * 100))}%`),
      )
      .join('');
    const queued = o.queued
      .slice(0, 5)
      .map((q) => {
        const name = D.units[q.id] ?? D.techs[q.id];
        return row('⏳', e(name?.km ?? q.id), e(name?.en ?? q.id), `${km(Math.ceil(q.left))}s`);
      })
      .join('');
    const t = this.templeName(o.temple.id);
    const short = Object.entries(o.temple.short)
      .map(([r, n]) => `${km(Math.ceil(n ?? 0))} ${RES_LABEL[r as keyof typeof RES_LABEL].km}`)
      .join(' · ');
    const R = D.anachak.roads;
    const roadNote = `${km(o.roads.found)}/${km(o.roads.total)} ${o.roads.next !== null ? `· ក្បួនបន្ទាប់ ${km(Math.ceil(o.roads.next))}s · next caravan` : ''}`;
    const sec = (h: string, en: string, body: string) =>
      body ? `<section class="k-ov-sec"><h4>${h} · ${en}</h4>${body}</section>` : '';
    return `<h2>📖 សៀវភៅរាជ្យ · The king's overview</h2>
      <div class="k-ov">
        ${sec('ធនធាន', 'Resources', res)}
        ${sec('ប្រជាជន', 'People', people)}
        ${sec('កងទ័ព', `Soldiers (called up so far: ${o.levied})`, army || row('', 'គ្មាន', 'None yet', '—'))}
        ${sec('ឃ្លាំង', 'Stores', stores)}
        ${sec('កំពុងសាង', 'Being built', rising)}
        ${sec('ផែនការ', 'Planned (training, learning)', queued)}
        ${sec(
          'ប្រាសាទ',
          'The temple',
          row('🛕', e(t.km), e(t.en), `${km(Math.floor(o.temple.progress * 100))}%`) +
            (short ? row('📦', 'នៅខ្វះ', 'Still lacks', short) : '') +
            row('📜', 'រាជបញ្ជា', 'Decree', o.decree ? '✓' : '—') +
            row('👑', 'ព្រះបារមី', 'Royal power', km(Math.floor(o.prestige))),
        )}
        ${sec(
          'ផ្លូវរាជ',
          'Royal roads',
          row('🛤️', 'ផ្លូវដែលភ្ជាប់', 'Roads to places found', roadNote) +
            row(
              '🔥',
              'ផ្ទះសំណាក់',
              'Rest houses',
              restsActive(s) ? '✓' : `${e(D.eras.find((x) => x.id === R.restEra)!.en)}`,
            ),
        )}
      </div>
      <button class="k-btn" data-act="overview" data-ui><span class="k-btn-km">បិទ · Close</span></button>`;
  }

  /** PK: flash on the resource bar what this cost still needs. */
  private flashNeeds(cost: Partial<Record<keyof typeof RES_LABEL, number>> | undefined): void {
    if (!cost) return;
    const have = this.sim.res[PLAYER];
    const short = (Object.keys(cost) as Array<keyof typeof RES_LABEL>).filter(
      (k) => have[k] < (cost[k] ?? 0),
    );
    this.hud.need(short, performance.now(), this.data.rules.alerts.needSec);
  }

  /** The order board (Hay Day-style, PK): each buyer, what they want, what they pay. */
  private ordersHtml(): string {
    const m = this.sim.market;
    const R = this.data.rules.orders;
    const t = this.sim.time;
    const have = this.sim.res[PLAYER];
    const clock = (sec: number) => {
      const v = Math.max(0, Math.ceil(sec));
      return `${km(Math.floor(v / 60))}:${km(v % 60).padStart(2, '០')}`;
    };
    const rows = m.orders.map((o) => {
      if (t < o.readyAt)
        return `<div class="k-ord k-ord-wait">⏳ <b>${clock(o.readyAt - t)}</b> អ្នកទិញថ្មីកំពុងមក · A new buyer is coming</div>`;
      const boat = o.buyer === 'boat';
      const who = boat ? R.boat : R.buyers.find((b) => b.id === o.buyer)!;
      const want = Object.entries(o.want)
        .map(([r, n]) => {
          const res = r as keyof typeof RES_LABEL;
          return `<span class="${have[res] >= (n ?? 0) ? 'ok' : 'short'}">${km(n ?? 0)} ${RES_LABEL[res].km}</span>`;
        })
        .join('');
      const leaves =
        boat && o.leavesAt !== undefined ? ` · ចេញក្នុង ${clock(o.leavesAt - t)} · leaves in` : '';
      return (
        `<div class="k-ord"><div class="k-ord-who">${boat ? '⛵' : '🧺'} ${this.esc(who.km)} · ${this.esc(who.en)}${leaves}</div>` +
        `<div class="k-ord-want">${want}<span class="k-ord-pay">→ 🪙 +${km(o.gold)}</span></div>` +
        `<button data-act="order-deliver:${o.id}" ${m.canFill(o) ? '' : 'disabled'} data-ui>ដឹក · Deliver</button>` +
        `<button data-act="order-discard:${o.id}" data-tip="${this.esc('<b>បោះចោល</b> · Throw the order away: a new buyer comes later')}" data-ui>🗑</button></div>`
      );
    });
    return (
      `<h3><span>📜 ការបញ្ជាទិញ · Orders</span><button data-act="orders" data-ui>✕</button></h3>` +
      rows.join('')
    );
  }

  /** Full baskets over the houses near the view (Hay Day-style collecting, PK). */
  private bubbles(): Array<{ x: number; y: number; id: number }> {
    const out: Array<{ x: number; y: number; id: number }> = [];
    for (const b of this.sim.buildings.values()) {
      if (!basketReady(this.sim, b)) continue;
      const [cx, cz] = this.sim.center(b);
      const p = this.view.project(cx, b.type === 'townCentre' ? 11 : 7.5, cz);
      const underOrders = this.ordersOpen && p.x > KSIZE.width - 720 && p.y < 760;
      if (p.x > 60 && p.x < KSIZE.width - 60 && p.y > 300 && p.y < KSIZE.height - PANEL_H && !underOrders)
        out.push({ ...p, id: b.id });
    }
    return out.slice(0, 24);
  }

  /** The scene's share of the last frame's counters when post-processing is on (D79). */
  frameSplit(): FrameSplit | null {
    if (this.hero?.active || this.anime) return this.heroSplit;
    return this.post?.post.split() ?? null;
  }

  frame(now: number, paused: boolean): void {
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    // Camera: arrows / WASD, or the mouse at the window's (or the stage's) edge.
    const k = this.keys;
    let px = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    let pz = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
    if (this.hero?.active)
      px = pz = 0; // the hero's keys move the hero, not the map
    else if (!this.drag && !px && !pz && this.edgeCursor) {
      const r = this.stageRect();
      const p = edgePan(
        this.edgeCursor,
        { width: window.innerWidth, height: window.innerHeight },
        { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        this.data.rules.edgeScroll,
      );
      px = p.px;
      pz = p.pz;
    }
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (now - f.t0) / 1200);
      const k = t * t * (3 - 2 * t);
      this.panTo(f.x0 + (f.x1 - f.x0) * k, f.z0 + (f.z1 - f.z0) * k);
      this.zoom(f.d0 + (f.d1 - f.d0) * k);
      if (t >= 1 || px || pz) this.flight = null;
    }
    if (px || pz) {
      // The camera looks diagonally across the land (AoE II-like, D67): screen right and
      // screen down are rotated by the camera's yaw on the ground.
      const c = Math.cos(CAM_YAW);
      const sn = Math.sin(CAM_YAW);
      const dx = px * c + pz * sn;
      const dz = -px * sn + pz * c;
      this.panTo(this.cam.x + dx * dt * this.cam.dist * 0.9, this.cam.z + dz * dt * this.cam.dist * 0.9);
    }
    if (!paused) this.sim.update(dt * this.speed);
    // Events → messages.
    const ev = this.sim.events;
    for (let i = this.seenEvents; i < ev.length; i++) {
      const e = ev[i]!;
      this.eventSound(e);
      if (e.kind === 'raid')
        this.hud.toast(`<b>ចោរប្លន់មកដល់!</b> Raid! ${km(e.size)} ពួកអ្នកប្រឆាំង`, now, 7);
      if (e.kind === 'researched')
        this.hud.toast(
          `បានរកឃើញ <b>${this.data.techs[e.tech]!.km}</b> · ${this.data.techs[e.tech]!.en}`,
          now,
          5,
        );
      if (e.kind === 'built' && e.building.team === PLAYER) {
        const [bx, bz] = this.sim.center(e.building);
        this.view.flash(
          bx,
          bz,
          (Math.max(e.building.w, e.building.d) * this.sim.map.tile) / 2 + 0.6,
          now / 1000,
        );
        this.hud.toast(`សាងរួច <b>${this.sim.bdef(e.building.type).km}</b>`, now, 3);
        this.cityGrew(now);
      }
      if (e.kind === 'trained' && e.unit.team === PLAYER) {
        this.cityGrew(now);
        this.view.flash(e.unit.x, e.unit.z, 1.6, now / 1000); // a gold flash: ready
      }
      if (e.kind === 'ceremony') {
        const c = this.data.rules.ceremonies.list.find((x) => x.id === e.id);
        if (c) {
          this.hud.toast(
            `🪔 <b>${this.esc(c.km)}</b> · ${this.esc(c.en)}<br>${this.esc(c.note.km)}<br>${this.esc(c.note.en)}`,
            now,
            10,
          );
          this.view.courtBless(now / 1000, 8);
        }
      }
      if (e.kind === 'levy') {
        const d = this.data.units[e.unit]!;
        this.hud.toast(
          `⚔️ <b>កេណ្ឌទ័ព</b> · ${km(e.n)} ${this.esc(d.km)} · ${e.n} villagers take up arms as ${this.esc(d.en.toLowerCase())}`,
          now,
          5,
        );
      }
      if (e.kind === 'battle')
        this.hud.toast(
          e.to
            ? `🐘 <b>ចេញច្បាំង!</b> · To battle! ${km(e.n)} soldiers march on the enemy`
            : `🛡️ <b>គ្មានសត្រូវ</b> · No enemy in sight: ${km(e.n)} soldiers gather at the royal hall`,
          now,
          5,
        );
      if (e.kind === 'caravan') {
        const rt = this.data.anachak.roads.routes.find((x) => x.id === e.route)!;
        const got = Object.entries(e.cost)
          .map(([k, n]) => `+${km(n ?? 0)} ${RES_LABEL[k as keyof typeof RES_LABEL].km}`)
          .join(' ');
        this.hud.toast(
          `🐂 <b>ក្បួនរទេះតាម${this.esc(rt.km)}</b> · A caravan on the ${this.esc(rt.en.toLowerCase())}: ${got}`,
          now,
          5,
        );
      }
      if (e.kind === 'decree')
        this.hud.toast(
          e.what === 'begun'
            ? '📜 <b>រាជបញ្ជា៖ សាងប្រាសាទ</b> · The king decrees: everyone works for the temple until it stands'
            : e.what === 'founded'
              ? "📜 <b>ចាក់គ្រឹះប្រាសាទ</b> · By the king's decree the temple's foundation is laid"
              : '📜 រាជបញ្ជាបានបញ្ចប់ · The decree has ended',
          now,
          6,
        );
      if (e.kind === 'order') {
        const R = this.data.rules.orders;
        if (e.what === 'noport')
          this.hud.toast(
            `⛵ <b>${this.esc(R.boat.km)}ឆ្លងកាត់</b> · A ${this.esc(R.boat.en)} passed by: build a river landing (កំពង់ផែ) by the water so it can tie up`,
            now,
            8,
          );
        else if (e.what === 'filled') {
          this.hud.toast(`📜 <b>ដឹកជញ្ជូនរួច</b> · Order filled: +${km(e.order.gold)} មាស · gold`, now, 4);
          const h = this.hall();
          if (h) {
            const [hx, hz] = this.sim.center(h);
            this.floats.push({
              x: hx,
              z: hz,
              text: `+${e.order.gold} ${RES_LABEL.gold.km}`,
              color: RES_LABEL.gold.color,
              at: now,
            });
          }
        } else if (e.what === 'boat')
          this.hud.toast(
            `⛵ <b>${this.esc(R.boat.km)}មកដល់</b> · A ${this.esc(R.boat.en)} has come up the river with a big order (O)`,
            now,
            8,
          );
        else this.hud.toast(`⛵ ${this.esc(R.boat.km)}ចេញទៅវិញ · The junk has sailed`, now, 5);
      }
      if (e.kind === 'chapter') {
        // The temple stands: its era ends, the next temple (and era) opens.
        const done = this.templeName(e.done);
        if (e.next) {
          const i = this.sim.chapter;
          const n = this.data.campaign.chapters.length;
          this.card = {
            html:
              `<h3>✓ ${this.esc(done.km)} · ${this.esc(done.en)} សាងរួច · complete</h3>` +
              this.chapterHtml(
                i,
                `ជំពូក ${km(i + 1)}/${km(n)} · Chapter ${i + 1} of ${n} — ប្រាសាទបន្ទាប់ · Next temple`,
              ) +
              `<button class="k-btn" data-act="card-close" data-ui><span class="k-btn-km">បន្ត · Continue</span></button>`,
            until: Infinity,
            sec: 30,
          };
          const [x, z] = this.siteCentre(i);
          this.flyTo(x, z + 20, 110, now);
        }
        this.hud.toast(`<b>${this.esc(done.km)}</b> សាងរួច · ${this.esc(done.en)} complete`, now, 8);
      }
      if (e.kind === 'destroyed' && e.building.team === PLAYER)
        this.hud.toast(`<b>បាត់បង់</b> ${this.sim.bdef(e.building.type).km}`, now, 5);
      if (e.kind === 'discovered') {
        const p = this.sim.places.find((x) => x.id === e.place)!;
        const gift = Object.entries(p.reward)
          .map(([r, n]) => `+${n} ${RES_LABEL[r as keyof typeof RES_LABEL].km}`)
          .join(' ');
        this.hud.toast(`រកឃើញ <b>${this.esc(p.km)}</b> · Found ${this.esc(p.en)} ${gift}`, now, 8);
      }
      if (e.kind === 'alarm') {
        this.hud.toast(
          e.danger === 'raid'
            ? `⚠️ <b>ប្រុងប្រយ័ត្ន! ចោរ!</b> · Alarm: raiders! The people run, the soldiers are called`
            : `⚠️ <b>ប្រុងប្រយ័ត្ន! សត្វសាហាវ!</b> · Alarm: a ${this.esc(e.what.toLowerCase())}! The people run, the soldiers are called`,
          now,
          6,
        );
        this.hud.ping(e.at, now);
        if (this.anachak && e.who !== undefined) this.dangerCall(e.who, e.danger, e.what, now);
      }
      if (e.kind === 'found') {
        const what: Record<string, string> = {
          stone: 'ថ្ម · stone',
          gold: 'មាស · gold',
          gems: 'ត្បូង · gems',
          fruit: 'ផ្លែឈើ · fruit',
        };
        this.hud.toast(
          `🐕 ព្រានក្រាបទូលព្រះរាជា៖ រកឃើញ<b>${what[e.what] ?? e.what}</b> · The hunter tells the king: ${e.what} found`,
          now,
          6,
        );
        this.hud.ping(e.at, now);
        // PK: the news comes to the king, who points the way to the find.
        this.view.courtLook(e.at[0], e.at[1], now / 1000);
      }
      if (e.kind === 'trained' && e.unit.name && e.unit.team === PLAYER)
        this.hud.toast(
          `មេទ័ព <b>${this.esc(e.unit.name.km)}</b> · Commander ${this.esc(e.unit.name.en)}`,
          now,
          7,
        );
      if (e.kind === 'weather') {
        const w = this.sim.weatherDef;
        this.hud.toast(`អាកាសធាតុ៖ <b>${w.km}</b> · Weather: ${w.en}`, now, 6);
      }
      if (e.kind === 'hunted') {
        const a = this.data.world.animals.kinds.find((k) => k.id === e.animal);
        if (a)
          this.floats.push({
            x: e.at[0],
            z: e.at[1],
            text: `${a.km} · ${a.en} ✓`,
            color: '#ffe07a',
            at: now,
          });
      }
      if (e.kind === 'delivered' && e.n > 0)
        this.floats.push({
          x: e.at[0],
          z: e.at[1],
          text: `+${e.n} ${RES_LABEL[e.res].km}`,
          color: RES_LABEL[e.res].color,
          at: now,
        });
    }
    this.seenEvents = ev.length;
    if (ev.length > 2000) {
      ev.splice(0, 1000);
      this.seenEvents -= 1000;
    }
    if (now >= this.autosaveAt) {
      this.autosaveAt = now + this.data.rules.save.autosaveSec * 1000;
      if (this.sim.time > 5) this.saves.save('autosave', this.sim);
    }

    // Ghost and drag box.
    if (this.placing && this.cursorPx) {
      const t = this.ghostTile(this.cursorPx);
      const mv = this.movingNow();
      if (t)
        this.view.setGhost(
          this.placing,
          t[0],
          t[1],
          !(mv !== null ? this.sim.canMove(mv, t[0], t[1]) : this.sim.canPlace(this.placing, t[0], t[1])),
        );
    }
    if (this.drag) {
      const d = this.drag;
      // The overlay is inside the scaled stage: stage pixels, no extra scaling (the box
      // used to be scaled twice and drifted away from the mouse).
      Object.assign(this.dragEl.style, {
        left: `${Math.min(d.x0, d.x1)}px`,
        top: `${Math.min(d.y0, d.y1)}px`,
        width: `${Math.abs(d.x1 - d.x0)}px`,
        height: `${Math.abs(d.y1 - d.y0)}px`,
      });
      this.dragEl.hidden = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 12;
    }

    // Hover: what is under the pointer gets a marker and a hint (a few times a second).
    this.updateHover(now);
    // Draw (a queued button icon first, in a corner the scene then paints over).
    if (this.icons.pending) this.icons.step(this.renderer);
    const heroOn = !!this.hero?.active;
    if (heroOn) this.hero!.frame(dt, now);
    else this.view.setCamera(this.cam.x, this.cam.z, this.cam.dist);
    this.view.update(now / 1000, now, heroOn ? new Set() : this.selected);
    const r = this.renderer;
    r.setScissorTest(false);
    const size = r.getSize(new THREE.Vector2());
    r.setViewport(0, 0, size.x, size.y);
    r.clear();
    styleScene(this.view.scene);
    // Post-processing (D79): AO, glow, the miniature blur when zoomed in, the warm grade.
    if (this.post?.scene !== this.view.scene) {
      this.post?.post.dispose();
      this.post = {
        scene: this.view.scene,
        post: new KingdomPost(r, this.view.scene, this.view.camera, this.opts.gfx ?? NO_GFX, this.data.diorama.post),
      };
    }
    if (this.hero?.active) this.heroSplit = this.hero.draw(r);
    else if (this.anime) {
      // Anachak Khmer's anime look from above too (PK: modern 3D anime concept art, D98).
      this.anime.render(r, this.view.scene, this.view.camera, RTS_LOOK);
      this.heroSplit = this.anime.last;
    } else this.post.post.render(Math.max(0, Math.min(1, (90 - this.cam.dist) / 60)));

    // HUD.
    const s = this.sim;
    const next = Math.max(0, Math.round(s.ai.nextRaid - s.time));
    const mon = s.currentTemple();
    const name = this.templeName(s.chapterData.temple);
    const n = this.data.campaign.chapters.length;
    const objective = s.outcome
      ? `<b>${km(s.completed.length)}/${km(n)}</b> ប្រាសាទ · temples`
      : `<b>ជំពូក ${km(s.chapter + 1)}/${km(n)}: សាង${this.esc(name.km)}</b> · Chapter ${s.chapter + 1}/${n}: build ${this.esc(name.en)} on its site`;
    const extra =
      `<span class="k-pill k-mon"><small>${this.esc(name.km)}</small><b>${mon ? `${km(Math.floor(mon.progress * 100))}%` : '—'}</b></span>` +
      (next < 60
        ? `<span class="k-pill k-warn"><b>ចោរប្លន់ ${km(next)}s · Raid in ${next}s</b></span>`
        : '') +
      // PK: the royal power built by ceremonies, and the decree while it holds.
      `<span class="k-pill k-royal" data-tip="${this.esc('<b>ព្រះបារមី</b> · Royal power: it grows with every royal ceremony')}" data-ui>👑 <b>${km(Math.floor(s.prestige))}</b></span>` +
      (s.decree ? `<span class="k-pill k-decree"><b>📜 រាជបញ្ជា · Decree</b></span>` : '');
    this.hud.renderHeader(s);
    this.hud.renderTop(s, objective, extra);
    this.updateYear(now);
    if (this.card?.sec) {
      this.card.until = now + this.card.sec * 1000;
      this.card.sec = 0;
    }
    if (this.card && now > this.card.until) this.card = null;
    if (this.danger) {
      // The choice waits a while, then life goes on by itself.
      if (now > this.danger.until || !s.units.has(this.danger.who)) this.closeDanger();
    }
    if (this.anachak) {
      const n = this.view.night;
      if (this.nightWas < 0.5 && n >= 0.5)
        this.hud.toast('🌙 <b>យប់ចូលហើយ</b> · Night falls: the rest houses light their fires', now, 5);
      if (this.nightWas >= 0.5 && n < 0.5) this.hud.toast('🌅 <b>ព្រឹកហើយ</b> · Dawn', now, 4);
      this.nightWas = n;
    }
    // The king's book refreshes once a second while it is the card shown.
    if (this.card?.kind === 'overview' && Math.floor(now / 1000) !== Math.floor((now - dt * 1000) / 1000))
      this.card.html = this.overviewHtml();
    this.hud.renderCard(this.historyOpen || s.outcome ? null : (this.card?.html ?? null), !!this.card?.side);
    this.hud.renderHistory(this.historyOpen ? this.historyHtml() : null);
    this.touch.tick(now);
    this.hud.renderCouncil(this.opts.mobile ? null : this.updateCouncil(now));
    this.hud.renderToasts(now);
    this.panel();
    this.hud.renderRadial(this.radialAnchor(), {
      w: KSIZE.width,
      h: KSIZE.height,
      top: 240,
      bottom: KSIZE.height - PANEL_H - 20,
    });
    const view = (
      [
        [0, 0],
        [KSIZE.width, 0],
        [KSIZE.width, KSIZE.height - PANEL_H],
        [0, KSIZE.height - PANEL_H],
      ] as const
    )
      .map(([x, y]) => this.view.groundAt(x, y))
      .filter((p): p is XZ => !!p);
    this.hud.renderMinimap(s, view);
    this.hud.renderMenu({
      idle: s.idleWorkers().length,
      army: this.armyIds().length,
      autoWork: s.autoWork,
      sound: this.sound.enabled,
      music: this.sound.musicOn,
      musicVolume: this.sound.musicVolume,
      fullscreen: !this.opts.mobile && canFullscreen() ? isFullscreen() : undefined,
    });
    if (now >= this.nextMoodCheck) {
      this.nextMoodCheck = now + 1000;
      this.sound.setMood(this.updateMood(now));
    }
    // The weather is shown in the world, not in a menu (PK): rain, wind and birds are heard.
    const fx = this.view.weatherFx;
    this.sound.setAmbience({ rain: fx.rain, wind: fx.wind, birds: s.weather.id === 'clear' ? 0.6 : 0 });
    const w = this.view.sounds[0];
    if (w && now >= this.nextWorkSound) {
      this.nextWorkSound = now + 220;
      this.sound.play(w.name, { pan: panFor(w.x - w.z, this.cam.x - this.cam.z), gain: 0.5 });
    }
    if (this.ancient.isOpen) {
      const w = this.cam.dist * 1.6;
      this.ancient.render(mapViewOf(s), { x: this.cam.x, z: this.cam.z, w, h: w * 0.7 });
    }
    this.hud.renderTip(
      this.hovered.target && this.cursorPx && !this.drag
        ? { x: this.cursorPx.x, y: this.cursorPx.y, html: this.hovered.html }
        : null,
    );
    this.hud.renderLabels(this.labels());
    this.hud.renderOrders(this.ordersOpen && !this.historyOpen ? this.ordersHtml() : null);
    this.hud.renderBubbles(this.bubbles());
    this.floats = this.floats.filter((f) => now - f.at < 2200);
    this.hud.renderFloats(
      this.floats.map((f) => {
        const k = (now - f.at) / 2200;
        const p = this.view.project(f.x, 2.4 + k * 2.5, f.z);
        return { x: p.x, y: p.y, text: f.text, color: f.color, opacity: 1 - k * k };
      }),
    );
    this.hud.renderOutcome(
      s.outcome && !this.historyOpen
        ? `<h2>${s.outcome.result === 'victory' ? 'ជ័យជម្នះ · Victory' : 'បរាជ័យ · Defeat'}</h2><p>${s.outcome.how} · ${km(s.completed.length)}/${km(n)}</p><p>${this.data.rules.scenario.note.km}<br>${this.data.rules.scenario.note.en}</p><button class="k-btn" data-act="new" data-ui><span class="k-btn-km">ល្បែងថ្មី · New game</span></button> <button class="k-btn" data-act="history" data-ui><span class="k-btn-km">ប្រវត្តិ · History</span></button>`
        : null,
    );
  }
}

/** A random world seed for a new game. */
export function newSeed(): number {
  return 1 + Math.floor(Math.random() * 2_000_000_000);
}
