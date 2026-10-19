import type { Joints } from '../hero/body';
import { ACT } from '../../engine/figures';

/**
 * D155 (PK: "reality logic human gesture behavior"): the crowd's work and fight motions
 * (engine/figures.ts LIMB_VERTEX, one per ACT) as turns of a figure's joints, so PK's Meshy
 * people near the camera hammer, chop, plant, reap, cast the net, thrust, cut, draw the bow and
 * stand guard exactly as the crowd around them does. Same numbers, same timing (w = t × 5 plus a
 * per-person offset), same sides: the tool or weapon is in the right hand.
 *
 * Signs (three.js, as the shader): shoulder `rotation.x` < 0 swings the arm forward and up;
 * elbow `rotation.x = -bend` bends the forearm forward; hip `rotation.x` swings the leg.
 */

export interface LimbPose {
  /** Shoulder swing and elbow bend, left and right arm. */
  armL: { ang: number; bend: number };
  armR: { ang: number; bend: number };
  /** Hip swing, left and right leg. */
  legL: number;
  legR: number;
  /** Does the act hold the legs too (a lunge, a braced stance, treading), or do they walk or stand? */
  legs: boolean;
  /** Does the act need the whole body (bent over, lying in the water)? */
  body: boolean;
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);

/** Acts that are the crowd's own walk or standing (the clips do these). */
export function clipOnly(act: number): boolean {
  return act === ACT.crowd || act === ACT.stand;
}

/** The limbs for an act at time t (s) for person `seed` (the crowd's per-instance offset). */
export function actPose(act: number, t: number, seed: number): LimbPose {
  const w = t * 5 + seed * 2.3;
  const ph = t * 6 + seed * 1.618;
  const out: LimbPose = {
    armL: { ang: 0, bend: 0.2 },
    armR: { ang: 0, bend: 0.2 },
    legL: 0,
    legR: 0,
    legs: false,
    body: false,
  };
  // side: +1 left, -1 right (the shader's limb.x); tool = the right hand.
  const arm = (side: 1 | -1, ang: number, bend: number) => {
    const a = side > 0 ? out.armL : out.armR;
    a.ang = ang;
    a.bend = bend;
  };
  const leg = (side: 1 | -1, ang: number) => {
    if (side > 0) out.legL = ang;
    else out.legR = ang;
  };
  for (const side of [1, -1] as const) {
    const tool = side < 0;
    switch (act) {
      case ACT.stand:
        arm(side, 0.06 * Math.sin(w * 0.2), 0.2);
        break;
      case ACT.hammer: {
        const k = fract(w * 0.18);
        const up = k < 0.75 ? sm(0, 0.75, k) : 1 - sm(0.75, 0.86, k);
        arm(side, -(0.35 + 2.1 * up), 0.3 + 0.9 * up);
        out.legs = true;
        break;
      }
      case ACT.lift:
        arm(side, -1.2 + 0.12 * Math.sin(w * 0.5), 0.5);
        out.legs = true;
        break;
      case ACT.pull:
        arm(side, -1.0 + 0.4 * side * Math.sin(w * 0.55), 0.6);
        leg(side, side * 0.22);
        out.legs = true;
        break;
      case ACT.lever:
        arm(side, -0.8 - 0.45 * (0.5 + 0.5 * Math.sin(w * 0.35)), 0.4);
        leg(side, side * 0.12);
        out.legs = true;
        break;
      case ACT.carry:
        arm(side, -2.5 + 0.06 * Math.sin(ph), 0.9);
        break;
      case ACT.thrust: {
        const k = fract(w * 0.2);
        const hit = sm(0.55, 0.66, k) * (1 - sm(0.78, 0.95, k));
        if (tool) arm(side, -0.55 + (-1.5 + 0.55) * hit, 1.6 + (0.05 - 1.6) * hit);
        else arm(side, -0.95, 1.35);
        leg(side, side * (0.12 + 0.28 * hit));
        out.legs = true;
        break;
      }
      case ACT.sword: {
        const k = fract(w * 0.19);
        const n = Math.floor(w * 0.19) % 2;
        const raise = sm(0, 0.5, k) * (1 - sm(0.55, 0.62, k));
        const cut = sm(0.55, 0.64, k) * (1 - sm(0.8, 0.98, k));
        if (n === 0) {
          arm(side, tool ? -0.3 - 2.3 * raise - 0.2 * cut : -1.1, tool ? 0.2 + 0.8 * raise : 1.8);
          leg(side, side * 0.2 * (raise + cut));
        } else {
          arm(side, tool ? -1.1 : -1.2 - 0.6 * cut, tool ? 1.9 : 1.9 + 0.5 * cut);
          leg(side, side > 0 ? -1.3 * cut : 0.15 * cut);
        }
        out.legs = true;
        break;
      }
      case ACT.draw: {
        const k = fract(w * 0.16);
        const dr = sm(0.1, 0.6, k) * (1 - sm(0.82, 0.86, k));
        arm(side, tool ? -1.45 : -1.55, tool ? 0.2 + 1.9 * dr : 0.05);
        leg(side, side * 0.1);
        out.legs = true;
        break;
      }
      case ACT.guard:
        arm(side, -1.05 + 0.06 * Math.sin(w * 0.8), 1.85 + 0.1 * Math.sin(w * 0.8 + side));
        leg(side, side * (0.22 + 0.04 * Math.sin(w * 0.8)));
        out.legs = true;
        break;
      case ACT.plant:
        arm(side, -0.45 - 0.35 * (0.5 + 0.5 * Math.sin(w * 0.6 + side * 1.6)), 0.35);
        leg(side, side * 0.18);
        out.legs = out.body = true;
        break;
      case ACT.sow: {
        const k = fract(w * 0.17);
        const fling = sm(0, 0.35, k) * (1 - sm(0.45, 0.9, k));
        arm(side, tool ? -0.3 - 1.4 * fling : -0.6, tool ? 0.9 - 0.8 * fling : 1.4);
        leg(side, side * 0.15 * Math.sin(w * 0.17 * 6.2832));
        out.legs = true;
        break;
      }
      case ACT.pedal:
        arm(side, -1.25, 0.9);
        leg(side, side * 0.55 * Math.sin(w * 0.9));
        out.legs = true;
        break;
      case ACT.reap: {
        const k = fract(w * 0.2);
        const cut = sm(0.1, 0.45, k) * (1 - sm(0.55, 0.95, k));
        arm(side, tool ? -0.5 - 0.9 * cut : -0.7 + 0.2 * cut, tool ? 0.4 + 0.6 * (1 - cut) : 0.8);
        leg(side, side * 0.2);
        out.legs = out.body = true;
        break;
      }
      case ACT.chop: {
        const k = fract(w * 0.21);
        const wind = sm(0, 0.6, k) * (1 - sm(0.6, 0.68, k));
        const bite = sm(0.62, 0.68, k) * (1 - sm(0.74, 0.98, k));
        arm(side, -0.55 - 1.85 * wind + 0.25 * bite, 0.25 + 0.75 * wind);
        leg(side, side * (0.2 + 0.06 * bite));
        out.legs = true;
        break;
      }
      case ACT.fish: {
        const k = fract(w * 0.11);
        const gather = 1 - sm(0.3, 0.38, k);
        const fling = sm(0.33, 0.4, k) * (1 - sm(0.52, 0.62, k));
        const haul = sm(0.55, 0.65, k);
        arm(
          side,
          0.35 * gather - 1.75 * fling + haul * (-0.85 + 0.4 * side * Math.sin(w * 1.3)),
          1.25 * gather + 0.1 * fling + haul * (0.9 + 0.3 * side * Math.cos(w * 1.3)),
        );
        leg(side, side * (0.22 + 0.1 * fling));
        out.legs = true;
        break;
      }
      case ACT.row: {
        const stroke = Math.sin(t * 1.6);
        arm(side, -1.0 + (tool ? 0.5 : 0.35) * stroke, 0.55 - 0.3 * stroke);
        leg(side, side * 0.25);
        out.legs = true;
        break;
      }
      case ACT.swim: {
        const k = fract(w * 0.13 + (side > 0 ? 0.5 : 0));
        arm(side, -6.2832 * k, 0.15 + 0.5 * sm(0.55, 0.8, k) * (1 - sm(0.85, 1, k)));
        leg(side, side * 0.3 * Math.sin(w * 1.7));
        out.legs = out.body = true;
        break;
      }
      case ACT.torch:
        if (tool) arm(side, -1.25 + 0.05 * Math.sin(ph), 1.1);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Turn a figure's joints to the pose (arms always; legs when the act holds them). */
export function applyActPose(j: Joints, p: LimbPose): void {
  j.shoulderL.rotation.set(p.armL.ang, 0, 0.12);
  j.shoulderR.rotation.set(p.armR.ang, 0, -0.12);
  j.elbowL.rotation.set(-p.armL.bend, 0, 0);
  j.elbowR.rotation.set(-p.armR.bend, 0, 0);
  j.spine.rotation.set(0, 0, 0);
  j.head.rotation.set(0, 0, 0);
  if (p.legs) {
    j.hipL.rotation.set(p.legL, 0, 0.04);
    j.hipR.rotation.set(p.legR, 0, -0.04);
    j.kneeL.rotation.set(Math.max(0, -p.legL) * 0.6, 0, 0);
    j.kneeR.rotation.set(Math.max(0, -p.legR) * 0.6, 0, 0);
  }
}
