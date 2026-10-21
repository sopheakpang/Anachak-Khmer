import type { Anachak, HeroSkill } from '@temples/shared';
import type { ArtKey, FxWeapon, Guardian } from './yantraArt';

/**
 * PK 1.9.0 (D151): the heroes' skill effects planned as pieces (pure: no three.js, so the tests
 * can check them). `SkillFx` (skillFx.ts) plays the pieces. After the JX2-style effects of PK's
 * guide — flying sword rains, crescent waves, a guardian spirit rushing out, pillars of light,
 * rings of force — drawn as Khmer yantra (yantraArt.ts).
 *
 * Out of respect a piece carrying yantra art (a guardian, the script columns) never lies under
 * the hero's feet: guardians fly at or above head height, the script stands upright beside him.
 */

type Vfx = Anachak['hero']['vfx'];
export type XZ = readonly [number, number];

/** A textured card. `face`: camera = turns to the camera; up = stands upright, turning about
 * the vertical to the camera (falling weapons); flat = lies level, turned to `rot`. */
export interface SpritePiece {
  t: 'sprite';
  art: ArtKey;
  x: number;
  y: number;
  z: number;
  /** Width (m); tall art is 4 × as high. */
  size: number;
  color: number;
  delay: number;
  dur: number;
  vx: number;
  vy: number;
  vz: number;
  /** Size at the end as a share of the start. */
  grow: number;
  face: 'camera' | 'up' | 'flat';
  rot: number;
  /** Turns per second about the card's normal (wheel and canopy spin). */
  spin: number;
  /** Optional: circles a point (cx, cz) at radius r, angle a0 + w·t. */
  orbit?: { cx: number; cz: number; r: number; a0: number; w: number };
}

/** A ring of force on the ground, widening from r0 to r1. */
export interface RingPiece {
  t: 'ring';
  x: number;
  z: number;
  y: number;
  r0: number;
  r1: number;
  color: number;
  delay: number;
  dur: number;
}

/** A column of script rising from the ground (an open cylinder). */
export interface PillarPiece {
  t: 'pillar';
  x: number;
  z: number;
  h: number;
  r: number;
  color: number;
  delay: number;
  dur: number;
}

/** A bell of light over the hero. */
export interface DomePiece {
  t: 'dome';
  x: number;
  z: number;
  r: number;
  color: number;
  delay: number;
  dur: number;
}

/** A streak of light between two points at a height. */
export interface BeamPiece {
  t: 'beam';
  from: XZ;
  to: XZ;
  y: number;
  width: number;
  color: number;
  delay: number;
  dur: number;
}

/** D169: PK's energy beam (hero/energyBeam.ts), fired from (x, y, z) along `heading`. */
export interface EnergyPiece {
  t: 'energy';
  x: number;
  y: number;
  z: number;
  heading: number;
  length: number;
  color: number;
  delay: number;
  dur: number;
}

/** A particle burst of the scene's own kinds. */
export interface BurstPiece {
  t: 'burst';
  kind: 'gold' | 'dust' | 'sparks' | 'leaves';
  x: number;
  y: number;
  z: number;
  n: number;
  delay: number;
  ring?: boolean;
}

export type VfxPiece = SpritePiece | RingPiece | PillarPiece | DomePiece | BeamPiece | BurstPiece | EnergyPiece;

export interface VfxInput {
  skill: HeroSkill;
  guardian?: Guardian;
  weapon: FxWeapon;
  color: number;
  /** Where the hero stood when the skill began, and where he is now (a dash moves him). */
  from: XZ;
  to: XZ;
  heading: number;
  /** The model's lift (a rider's or elephant's seat height). */
  lift: number;
  /** The place a volley falls on. */
  area: XZ;
  cfg: Vfx;
  seed?: number;
}

/** A little hash for repeatable scatter. */
function rnd(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** n points over a disc of radius r, sunflower-spread (even, never two on one spot). */
export function rainPoints(cx: number, cz: number, r: number, n: number, seed = 1): XZ[] {
  const out: XZ[] = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  const j = rnd(seed);
  for (let i = 0; i < n; i++) {
    const d = r * Math.sqrt((i + 0.5) / n);
    const a = i * g + j() * 0.4;
    out.push([cx + Math.cos(a) * d, cz + Math.sin(a) * d]);
  }
  return out;
}

/** n points round a circle. */
export function ringPoints(cx: number, cz: number, r: number, n: number, a0 = 0): XZ[] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [cx + Math.sin(a) * r, cz + Math.cos(a) * r] as XZ;
  });
}

/** The weapon a kit's rains and wheels show. */
export function fxWeaponFor(weapon: string, set?: FxWeapon): FxWeapon {
  if (set) return set;
  return weapon === 'bow' ? 'arrow' : weapon === 'spear' || weapon === 'lance' || weapon === 'goad' || weapon === 'staff' ? 'spear' : 'sword';
}

const sprite = (p: Omit<SpritePiece, 't' | 'vx' | 'vy' | 'vz' | 'grow' | 'rot' | 'spin'> & Partial<SpritePiece>): SpritePiece => ({
  t: 'sprite',
  vx: 0,
  vy: 0,
  vz: 0,
  grow: 1,
  rot: 0,
  spin: 0,
  ...p,
});

/** Plan a skill's effects. */
export function planSkillVfx(i: VfxInput): VfxPiece[] {
  const S = i.skill;
  const out: VfxPiece[] = [];
  const [fx, fz] = i.from;
  const [tx, tz] = i.to;
  const r = S.radius;
  const big = S.kind === 'ultimate' || S.cd >= 30;
  const head = 1.9 + i.lift;
  const sin = Math.sin(i.heading);
  const cos = Math.cos(i.heading);
  const round = S.kind === 'spin' || S.kind === 'ultimate' || S.kind === 'chop';
  const rand = rnd(i.seed ?? 7);
  for (const v of S.vfx) {
    switch (v) {
      case 'wave': {
        // Round skills throw crescents all round; others a fan of three ahead.
        const n = round ? i.cfg.waves : 3;
        for (let k = 0; k < n; k++) {
          const a = round ? i.heading + (k / n) * Math.PI * 2 : i.heading + (k - 1) * 0.35;
          const sp = (r * 1.3) / 0.45;
          out.push(
            sprite({
              art: 'crescent',
              x: tx + Math.sin(a) * 0.6,
              y: 1 + i.lift,
              z: tz + Math.cos(a) * 0.6,
              size: Math.max(1.6, r * 0.7),
              color: i.color,
              delay: k * (round ? 0.03 : 0.07),
              dur: 0.45,
              vx: Math.sin(a) * sp,
              vz: Math.cos(a) * sp,
              grow: 1.7,
              face: 'flat',
              rot: a,
            }),
          );
        }
        break;
      }
      case 'rain': {
        // Spectral weapons fall from the sky onto the place, a burst where each lands.
        const [cx, cz] = S.kind === 'volley' ? i.area : i.to;
        const n = big ? i.cfg.rain : Math.max(4, Math.round(i.cfg.rain / 2));
        const fall = 0.38;
        const top = 10 + i.lift;
        rainPoints(cx, cz, Math.max(1.5, r), n, i.seed ?? 1).forEach(([x, z], k) => {
          const d = (k / n) * (big ? 0.9 : 0.5);
          out.push(
            sprite({
              art: `weapon:${i.weapon}`,
              x,
              y: top,
              z,
              size: i.weapon === 'arrow' ? 0.5 : 0.75,
              color: i.color,
              delay: d,
              dur: fall,
              vy: -(top - 0.4) / fall,
              face: 'up',
            }),
            { t: 'burst', kind: 'gold', x, y: 0.4, z, n: big ? 6 : 4, delay: d + fall },
            { t: 'ring', x, z, y: 0.14, r0: 0.2, r1: 1.4, color: i.color, delay: d + fall, dur: 0.35 },
          );
        });
        break;
      }
      case 'spirit': {
        if (!i.guardian) break;
        const art: ArtKey = `emblem:${i.guardian}`;
        if (S.kind === 'heal' || S.kind === 'ultimate') {
          // The guardian rises over the hero, great and slow.
          out.push(
            sprite({ art, x: tx, y: head + 1.6, z: tz, size: big ? 6 : 4, color: i.color, delay: 0.05, dur: 1.4, vy: 1.2, grow: 1.25, face: 'camera' }),
          );
        } else {
          // The guardian rushes out ahead along the skill's way.
          const d = Math.max(r * 1.6, Math.hypot(tx - fx, tz - fz) + r);
          out.push(
            sprite({
              art,
              x: fx + sin * 0.8,
              y: head,
              z: fz + cos * 0.8,
              size: 3.2,
              color: i.color,
              delay: 0,
              dur: 0.75,
              vx: (sin * d) / 0.75,
              vz: (cos * d) / 0.75,
              vy: 0.6,
              grow: 1.5,
              face: 'camera',
            }),
          );
        }
        break;
      }
      case 'pillars': {
        ringPoints(tx, tz, Math.max(2, r * 0.8), i.cfg.pillars, i.heading).forEach(([x, z], k) =>
          out.push({ t: 'pillar', x, z, h: big ? 5.5 : 3.5, r: 0.45, color: i.color, delay: k * 0.04, dur: 1.4 }),
        );
        break;
      }
      case 'shock': {
        for (let k = 0; k < 3; k++)
          out.push({ t: 'ring', x: tx, z: tz, y: 0.16, r0: 0.6, r1: r * (1 - k * 0.15), color: i.color, delay: k * 0.12, dur: 0.6 });
        out.push({ t: 'burst', kind: 'dust', x: tx, y: 0.3, z: tz, n: big ? 30 : 16, delay: 0, ring: true });
        break;
      }
      case 'dome':
        out.push({ t: 'dome', x: tx, z: tz, r: Math.min(Math.max(2.4, r * 0.5), 7), color: i.color, delay: 0, dur: 1.6 });
        break;
      case 'petals': {
        const n = i.cfg.petals;
        for (let k = 0; k < n; k++) {
          const a = rand() * Math.PI * 2;
          const d = Math.sqrt(rand()) * Math.min(r, 8);
          out.push(
            sprite({
              art: 'petal',
              x: tx + Math.sin(a) * d,
              y: 4 + rand() * 2.5,
              z: tz + Math.cos(a) * d,
              size: 0.32,
              color: i.color,
              delay: rand() * 0.6,
              dur: 1.6,
              vx: (rand() - 0.5) * 0.8,
              vy: -2.2,
              vz: (rand() - 0.5) * 0.8,
              face: 'camera',
              spin: (rand() - 0.5) * 2,
            }),
          );
        }
        break;
      }
      case 'orbit': {
        const n = i.cfg.orbit;
        for (let k = 0; k < n; k++)
          out.push(
            sprite({
              art: `weapon:${i.weapon}`,
              x: tx,
              y: 1 + i.lift,
              z: tz,
              size: 0.6,
              color: i.color,
              delay: 0,
              dur: 0.9,
              face: 'up',
              orbit: { cx: tx, cz: tz, r: Math.max(1.4, r * 0.6), a0: (k / n) * Math.PI * 2, w: 9 },
            }),
          );
        break;
      }
      case 'energyBeam': {
        // D169: along his heading, as long as the skill reaches (at least 6 m), with sparks
        // where it ends. D170: the core appears just past his palms at the thrust (beamAhead).
        const len = Math.max(6, r * 2.6);
        const ahead = i.cfg.beamAhead ?? 0.8;
        out.push({
          t: 'energy',
          x: tx + sin * ahead,
          y: 1.2 + i.lift,
          z: tz + cos * ahead,
          heading: i.heading,
          length: len,
          color: i.color,
          delay: 0.04,
          dur: 0.95,
        });
        out.push({
          t: 'burst',
          kind: 'sparks',
          x: tx + sin * (len + ahead),
          y: 1.2 + i.lift,
          z: tz + cos * (len + ahead),
          n: 14,
          delay: 0.18,
        });
        break;
      }
      case 'trail': {
        // Along the dash; for a shot, out to the place it flies to.
        const to: XZ = Math.hypot(tx - fx, tz - fz) > 0.5 ? i.to : S.kind === 'volley' ? i.area : [fx + sin * r * 3, fz + cos * r * 3];
        out.push({ t: 'beam', from: i.from, to, y: 1.15 + i.lift, width: big ? 1.4 : 0.9, color: i.color, delay: 0, dur: 0.5 });
        break;
      }
    }
  }
  return out;
}
