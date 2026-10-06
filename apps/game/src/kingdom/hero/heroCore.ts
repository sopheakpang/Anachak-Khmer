import type { Anachak, HeroKit } from '@temples/shared';

/**
 * The 3D hero mode's own rules (Anachak Khmer, D92), free of three.js and the DOM so they can
 * be tested: moving relative to the camera, running on stamina, jumping, a quick dash, the
 * three-step attack combo, the skill's cooldown and the work swing. The game world is asked
 * only "can I stand here?".
 */

export type HeroState = 'idle' | 'run' | 'jump' | 'attack' | 'skill' | 'dash' | 'work' | 'hurt';

export interface HeroInput {
  /** Stick or keys: x right, y forward, each −1…1 (relative to the camera). */
  move: { x: number; y: number };
  run: boolean;
  jump: boolean;
  attack: boolean;
  skill: boolean;
  dash: boolean;
  work: boolean;
}

export const NO_INPUT: HeroInput = {
  move: { x: 0, y: 0 },
  run: false,
  jump: false,
  attack: false,
  skill: false,
  dash: false,
  work: false,
};

/** What happened this step, for the game to act on (hits, the skill, a work swing). */
export type HeroAct =
  | { kind: 'strike'; step: number; mul: number }
  | { kind: 'skill' }
  | { kind: 'work' }
  | { kind: 'jump' }
  | { kind: 'dash' }
  | { kind: 'land' };

export interface HeroWorld {
  /** Can the hero stand at this world point (ground he may walk on)? */
  open(x: number, z: number): boolean;
}

type Cfg = Anachak['hero'];

export class HeroCore {
  x: number;
  z: number;
  y = 0;
  vy = 0;
  heading: number;
  /** Camera orbit: yaw round the hero, pitch up from level, distance. */
  camYaw: number;
  camPitch: number;
  camDist: number;
  state: HeroState = 'idle';
  /** Seconds in the current state (animations read it). */
  stateT = 0;
  /** 0, 1, 2: which strike of the combo is playing (or played last). */
  combo = 0;
  /** Strike pressed during a strike: it follows on. */
  private queued = false;
  /** Strike damage already dealt for this swing. */
  private struck = false;
  stamina: number;
  skillReady = 0;
  dashReady = 0;
  /** Running clock (seconds). */
  t = 0;
  /** Run cycle phase (radians) for the legs. */
  stride = 0;
  speed = 0;
  /** Grounded last step (to report landings). */
  private grounded = true;

  constructor(
    private readonly cfg: Cfg,
    readonly kit: HeroKit,
    x: number,
    z: number,
    heading: number,
  ) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.camYaw = heading + Math.PI;
    this.camDist = cfg.camera.dist;
    this.camPitch = cfg.camera.pitch;
    this.stamina = cfg.move.staminaMax;
  }

  get busy(): boolean {
    return (
      this.state === 'attack' || this.state === 'skill' || this.state === 'work' || this.state === 'dash'
    );
  }

  get airborne(): boolean {
    return this.y > 0.001 || this.vy > 0;
  }

  /** Seconds the skill still needs. */
  skillLeft(): number {
    return Math.max(0, this.skillReady - this.t);
  }

  /** The current strike's length (seconds). */
  strikeSec(step = this.combo): number {
    const s = this.cfg.combo.sec;
    return s[Math.min(step, s.length - 1)]!;
  }

  private enter(s: HeroState): void {
    this.state = s;
    this.stateT = 0;
  }

  /** The direction the stick asks for, on the ground (radians), or null. */
  wantHeading(input: HeroInput): number | null {
    const { x, y } = input.move;
    const m = Math.hypot(x, y);
    if (m < 0.15) return null;
    // Camera forward is from the camera toward the hero: yaw + π.
    const fwd = this.camYaw + Math.PI;
    return fwd + Math.atan2(-x, y);
  }

  step(dt: number, input: HeroInput, world: HeroWorld): HeroAct[] {
    const M = this.cfg.move;
    const C = this.cfg.combo;
    const out: HeroAct[] = [];
    this.t += dt;
    this.stateT += dt;
    // Actions start (one at a time; a strike may queue the next).
    if (input.attack) {
      if (this.state === 'attack') this.queued = true;
      else if (!this.busy) {
        this.combo = this.stateT < C.window && this.lastWasStrike ? (this.combo + 1) % C.steps : 0;
        this.enter('attack');
        this.struck = false;
      }
    }
    if (input.skill && !this.busy && this.t >= this.skillReady) {
      this.skillReady = this.t + this.kit.skill.cd;
      this.enter('skill');
      this.struck = false;
    }
    if (input.dash && this.t >= this.dashReady && this.stamina >= M.staminaDash && this.state !== 'skill') {
      this.stamina -= M.staminaDash;
      this.dashReady = this.t + M.dashCd;
      const h = this.wantHeading(input);
      if (h !== null) this.heading = h;
      this.enter('dash');
      out.push({ kind: 'dash' });
    }
    if (input.work && !this.busy && !this.airborne) {
      this.enter('work');
      this.struck = false;
    }
    if (input.jump && !this.airborne && this.state !== 'skill' && this.state !== 'work') {
      this.vy = M.jump;
      out.push({ kind: 'jump' });
    }
    // Strikes land half-way through the swing; the skill a third of the way.
    if (this.state === 'attack') {
      const len = this.strikeSec();
      if (!this.struck && this.stateT >= len * C.hitAt) {
        this.struck = true;
        out.push({ kind: 'strike', step: this.combo, mul: C.mul[Math.min(this.combo, C.mul.length - 1)]! });
      }
      if (this.stateT >= len) {
        if (this.queued) {
          this.queued = false;
          this.combo = (this.combo + 1) % C.steps;
          this.enter('attack');
          this.struck = false;
        } else {
          this.lastWasStrike = true;
          this.enter('idle');
        }
      }
    } else if (this.state === 'skill') {
      if (!this.struck && this.stateT >= 0.3) {
        this.struck = true;
        out.push({ kind: 'skill' });
      }
      if (this.stateT >= 0.9) this.enter('idle');
    } else if (this.state === 'work') {
      if (!this.struck && this.stateT >= 0.35) {
        this.struck = true;
        out.push({ kind: 'work' });
      }
      if (this.stateT >= 0.6) this.enter('idle');
    } else if (this.state === 'dash' && this.stateT >= M.dashSec) this.enter('idle');
    if (this.state !== 'attack' && this.state !== 'idle') this.lastWasStrike = false;
    if (this.state === 'idle' && this.stateT > C.window) this.lastWasStrike = false;

    // Moving: the stick turns the hero toward camera-relative directions.
    const want = this.wantHeading(input);
    let speed = 0;
    if (this.state === 'dash') speed = M.dash;
    else if (want !== null && this.state !== 'skill' && this.state !== 'work') {
      const m = Math.min(1, Math.hypot(input.move.x, input.move.y));
      const canRun = input.run && this.stamina > 1;
      speed = (canRun ? M.run : M.walk) * m * (this.state === 'attack' ? 0.25 : 1);
      if (canRun && speed > 0) this.stamina = Math.max(0, this.stamina - M.staminaRun * dt);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, M.turn * dt);
    }
    if (!(input.run && speed > 0) && this.state !== 'dash')
      this.stamina = Math.min(M.staminaMax, this.stamina + M.staminaRegen * dt);
    this.speed = speed;
    if (speed > 0) {
      const nx = this.x + Math.sin(this.heading) * speed * dt;
      const nz = this.z + Math.cos(this.heading) * speed * dt;
      // Slide along walls: try both axes, then each alone.
      if (world.open(nx, nz)) {
        this.x = nx;
        this.z = nz;
      } else if (world.open(nx, this.z)) this.x = nx;
      else if (world.open(this.x, nz)) this.z = nz;
      this.stride += speed * dt * 2.1;
    }
    // Gravity.
    if (this.airborne) {
      this.vy -= M.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    const grounded = !this.airborne;
    if (grounded && !this.grounded) out.push({ kind: 'land' });
    this.grounded = grounded;
    if (!this.busy && this.state !== 'hurt') {
      const s: HeroState = this.airborne ? 'jump' : speed > 0.1 ? 'run' : 'idle';
      if (s !== this.state) this.enter(s);
    } else if (this.state === 'hurt' && this.stateT > 0.3) this.enter('idle');
    return out;
  }

  private lastWasStrike = false;

  /** A hit taken: a short flinch unless he is mid-skill or dashing (dodging is safe). */
  hurt(): boolean {
    if (this.state === 'dash' && this.stateT < this.cfg.move.dashSec) return false;
    if (this.state !== 'skill') this.enter('hurt');
    return true;
  }

  /**
   * Watching (PK: let the story's life flow): the body follows a unit the AI still moves, and
   * the pose follows what it does. `anim` is the unit's animation ('walk', 'attack', 'gather'...).
   */
  follow(x: number, z: number, heading: number, anim: string, dt: number): void {
    const d = Math.hypot(x - this.x, z - this.z);
    const speed = dt > 0 && d < 5 ? d / dt : 0;
    this.speed += (speed - this.speed) * Math.min(1, dt * 8);
    this.x = x;
    this.z = z;
    let dh = heading - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 10);
    this.y = 0;
    this.t += dt;
    const want: HeroState =
      anim === 'attack'
        ? 'attack'
        : anim === 'gather' || anim === 'build'
          ? 'work'
          : this.speed > 0.3
            ? 'run'
            : 'idle';
    // A swing or a work stroke loops: start it again when it has played through.
    if (want !== this.state || ((want === 'attack' || want === 'work') && this.stateT > 0.9)) {
      this.state = want;
      this.stateT = 0;
      if (want === 'attack') this.combo = (this.combo + 1) % 3;
    } else this.stateT += dt;
    if (this.state === 'run') this.stride += this.speed * dt * 2.1;
  }

  /** Turn the camera (drag or keys) and zoom. */
  orbit(dyaw: number, dpitch: number, zoom = 1): void {
    const C = this.cfg.camera;
    this.camYaw += dyaw;
    this.camPitch = Math.max(C.pitchMin, Math.min(C.pitchMax, this.camPitch + dpitch));
    this.camDist = Math.max(C.minDist, Math.min(C.maxDist, this.camDist * zoom));
  }

  /** The camera's eye and the point it looks at. */
  cameraPose(): { eye: [number, number, number]; look: [number, number, number] } {
    const C = this.cfg.camera;
    const look: [number, number, number] = [this.x, this.y + C.lookHeight, this.z];
    const h = Math.cos(this.camPitch) * this.camDist;
    const eye: [number, number, number] = [
      this.x + Math.sin(this.camYaw) * h,
      Math.max(
        0.6,
        this.y + C.lookHeight + Math.sin(this.camPitch) * this.camDist + (C.height - C.lookHeight),
      ),
      this.z + Math.cos(this.camYaw) * h,
    ];
    return { eye, look };
  }
}

/** Which targets a swing reaches: within `reach` and inside the arc in front. */
export function inArc(
  from: { x: number; z: number; heading: number },
  to: { x: number; z: number },
  reach: number,
  arc: number,
  pad = 0,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > reach + pad) return false;
  if (d < 0.6) return true;
  let a = Math.atan2(dx, dz) - from.heading;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) <= arc / 2 + Math.atan2(pad, Math.max(d, 0.01));
}

/** The hero kit for a unit type (the king has his own). */
export function kitFor(cfg: Cfg, type: string | 'king'): HeroKit {
  const k =
    type === 'king' ? cfg.kits.find((x) => x.id === 'king') : cfg.kits.find((x) => x.units.includes(type));
  return k ?? cfg.kits[0]!;
}
