import type { CameraConfig, SlotRef, TierName } from '@temples/shared';

export type ShotName = 'map' | 'quarry' | 'river' | 'hauling' | 'site';

export interface CutRequest {
  tier: TierName;
  slot: SlotRef | null;
  name: string | null;
  at: number;
}

export interface DirectorView {
  mode: 'loop' | 'cut' | 'idle';
  shot: ShotName;
  /** 0..1 progress through the current shot, for camera moves. */
  t: number;
  /** Full-screen cut target (a stone being set). */
  cut: CutRequest | null;
  /** Picture-in-picture: which slot to show, or null. */
  pip: { slot: SlotRef | null; name: string | null; until: number } | null;
}

const TIER_RANK: Record<TierName, number> = { small: 0, medium: 1, large: 2, huge: 3 };

/**
 * Camera director (prompt 12, spec: Camera director rules). Pure: every method takes `now`.
 * - Base loop: map → quarry → river → hauling → site, seconds from config/camera.json.
 * - Large/Huge stones cut to the site full screen for `cut.seconds`, at most one cut start
 *   per `cooldownSec`; extra cuts queue (max `queueMax`, biggest first), the rest go to PiP.
 * - Small/Medium stones never take the full screen: they show in PiP.
 * - After a cut the loop resumes where it left off.
 * - No events for `idleAfterSec` → idle tour (slow map/site alternation).
 * - While paused, time stands still.
 */
export class Director {
  private loopIndex = 0;
  private loopElapsed = 0; // ms into the current loop shot
  private lastTick: number;
  private cut: CutRequest | null = null;
  private cutStart = -Infinity;
  private lastCutStart = -Infinity;
  private queue: CutRequest[] = [];
  private pip: DirectorView['pip'] = null;
  private lastEvent: number;
  private idleStart = 0;
  private paused = false;
  locked: ShotName | null = null;

  constructor(
    private readonly cfg: CameraConfig,
    now: number,
  ) {
    this.lastTick = now;
    this.lastEvent = now;
  }

  setPaused(p: boolean, now: number): void {
    if (!p) this.lastTick = now;
    this.paused = p;
  }

  /** A stone was placed. */
  onStone(tier: TierName, slot: SlotRef | null, name: string | null, now: number): void {
    this.lastEvent = now;
    const req: CutRequest = { tier, slot, name, at: now };
    if (tier === 'large' || tier === 'huge') {
      if (!this.cut && now - this.lastCutStart >= this.cfg.cut.cooldownSec * 1000) {
        this.startCut(req, now);
      } else if (this.queue.length < this.cfg.cut.queueMax) {
        this.queue.push(req);
        this.queue.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || a.at - b.at);
      } else {
        this.showPip(slot, name, now, this.cfg.pip.seconds * 1000);
      }
    } else if (name) {
      this.showPip(slot, name, now, this.cfg.pip.seconds * 1000);
    }
  }

  /** A viewer asked "!mystone". */
  onMyStone(slot: SlotRef | null, name: string | null, now: number): void {
    this.lastEvent = now;
    this.showPip(slot, name, now, this.cfg.pip.myStoneSeconds * 1000);
  }

  /** Any viewer activity (likes, joins…) keeps the stream out of idle. */
  onActivity(now: number): void {
    this.lastEvent = now;
  }

  get queued(): number {
    return this.queue.length;
  }

  tick(now: number): DirectorView {
    let dt = this.paused ? 0 : Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (this.pip && now >= this.pip.until) this.pip = null;

    // Finish the current cut, then start the next queued one (respecting the cooldown).
    const cutMs = this.cfg.cut.seconds * 1000;
    if (this.cut && now - this.cutStart >= cutMs) {
      // Only the time after the cut ended counts for the loop, so it resumes where it left off.
      dt = this.paused ? 0 : Math.max(0, now - (this.cutStart + cutMs));
      this.cut = null;
    }
    if (!this.cut && this.queue.length && now - this.lastCutStart >= this.cfg.cut.cooldownSec * 1000) {
      this.startCut(this.queue.shift()!, now);
    }

    if (this.locked)
      return { mode: 'loop', shot: this.locked, t: ((now / 1000) % 20) / 20, cut: null, pip: this.pip };

    if (this.cut) {
      return {
        mode: 'cut',
        shot: 'site',
        t: Math.min(1, (now - this.cutStart) / cutMs),
        cut: this.cut,
        pip: this.pip,
      };
    }

    const idle = now - this.lastEvent >= this.cfg.idleAfterSec * 1000;
    if (idle) {
      if (this.idleStart === 0) this.idleStart = now;
      const period = 20_000;
      const k = Math.floor((now - this.idleStart) / period);
      return {
        mode: 'idle',
        shot: k % 2 === 0 ? 'map' : 'site',
        t: ((now - this.idleStart) % period) / period,
        cut: null,
        pip: this.pip,
      };
    }
    this.idleStart = 0;

    // Advance the base loop (only while it is on screen, so it resumes where it left off).
    this.loopElapsed += dt;
    for (;;) {
      const shot = this.cfg.loop[this.loopIndex]!;
      const len = shot.seconds * 1000;
      if (this.loopElapsed < len) break;
      this.loopElapsed -= len;
      this.loopIndex = (this.loopIndex + 1) % this.cfg.loop.length;
    }
    const shot = this.cfg.loop[this.loopIndex]!;
    return {
      mode: 'loop',
      shot: shot.shot,
      t: this.loopElapsed / (shot.seconds * 1000),
      cut: null,
      pip: this.pip,
    };
  }

  private startCut(req: CutRequest, now: number): void {
    this.cut = req;
    this.cutStart = now;
    this.lastCutStart = now;
  }

  private showPip(slot: SlotRef | null, name: string | null, now: number, ms: number): void {
    this.pip = { slot, name, until: now + ms };
  }
}
