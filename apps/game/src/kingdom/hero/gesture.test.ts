import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { HeroModel, lookFor } from './heroModel';
import { SKILL_SEC, kitFor } from './heroCore';
import { fakeRig } from './testRig';
import { gestureClock, gestureSec, gestureWeight, heroModelFor, modelUrl, registerModel, specFor, type GestureSpec } from './glbModel';

/** PK 2026-10-21 (D170): ពលលំពែង's energy-beam gesture, keyed in Blender, played on the Lunge. */
const H = loadKingdom().anachak.hero;
const spear = specFor(H.models, 'spear')!;
const G = spear.gestures!.lunge! as GestureSpec;

describe('the spearman’s energy-beam gesture (D170)', () => {
  it('the config names it for the Lunge, the skill that fires the beam', () => {
    const lunge = H.kits.find((k) => k.id === 'spear')!.skills!.find((s) => s.id === 'lunge')!;
    expect(lunge.vfx).toContain('energyBeam');
    expect(G.clip).toBe('Spear_EnergyBeam');
    expect(G.fire).toBeLessThan(G.hold);
    expect(G.hold).toBeLessThan(G.end);
  });

  it('runs on the skill’s clock: the thrust frame lands when the skill does, then the hold, then the recovery', () => {
    expect(gestureClock(G, 0)).toBe(0);
    expect(gestureClock(G, SKILL_SEC.strike / 2) * G.fps).toBeCloseTo(G.fire / 2);
    expect(gestureClock(G, SKILL_SEC.strike) * G.fps).toBeCloseTo(G.fire);
    expect(gestureClock(G, SKILL_SEC.strike + G.sustainSec) * G.fps).toBeCloseTo(G.hold);
    expect(gestureClock(G, gestureSec(G)) * G.fps).toBeCloseTo(G.end);
    expect(gestureClock(G, 99) * G.fps).toBe(G.end);
    // Never runs backwards.
    let last = -1;
    for (let t = 0; t < 2; t += 0.01) {
      const c = gestureClock(G, t);
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
    // The hold covers the beam (it lasts 0.95 s from the strike).
    expect(SKILL_SEC.strike + G.sustainSec).toBeGreaterThanOrEqual(SKILL_SEC.end);
  });

  it('takes the body at once, holds it through the thrust and hold, lets go over the recovery', () => {
    expect(gestureWeight(G, 0)).toBe(0);
    expect(gestureWeight(G, 0.1)).toBe(1);
    expect(gestureWeight(G, SKILL_SEC.strike + G.sustainSec)).toBe(1);
    expect(gestureWeight(G, gestureSec(G) - 0.01)).toBeLessThan(0.1);
    expect(gestureWeight(G, gestureSec(G) + 0.1)).toBe(0);
  });

  it('the clip is in spearman.glb: 81 frames, the hips lunge forward (+z) at the thrust and come back', async () => {
    const glb = await readGlb(spear.file);
    const anim = glb.json.animations.find((a) => a.name === G.clip)!;
    expect(anim, 'clip in the model').toBeTruthy();
    const hips = glb.json.nodes.findIndex((n) => n.name === 'mixamorig:Hips');
    const ch = anim.channels.find((c) => c.target.node === hips && c.target.path === 'translation')!;
    const s = anim.samplers[ch.sampler]!;
    const times = glb.floats(s.input);
    const pos = glb.floats(s.output);
    expect(times.length).toBe(G.end + 1);
    expect(times[times.length - 1]! * G.fps).toBeCloseTo(G.end, 3);
    const z = (f: number) => pos[f * 3 + 2]!;
    const y = (f: number) => pos[f * 3 + 1]!;
    expect(z(G.fire) - z(0)).toBeGreaterThan(0.3); // the lunge
    expect(y(15)).toBeLessThan(y(0) - 0.15); // sunk for the charge
    expect(Math.abs(z(G.end) - z(0))).toBeLessThan(0.02); // home again
    // Both arms and hands are keyed (the push), and the model's own clips are still there.
    for (const b of ['LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'Spine', 'Head'])
      expect(anim.channels.some((c) => glb.json.nodes[c.target.node]!.name === `mixamorig:${b}`), b).toBe(true);
    const names = glb.json.animations.map((a) => a.name).join(' ');
    expect(names).toMatch(/Idle/);
    expect(names).toMatch(/Walking/);
    expect(names).toMatch(/Running/);
  });

  it('in play: the Lunge starts it, the clip and not the game’s pose holds him, it ends by itself', () => {
    // Bone names as three's GLTFLoader leaves them (no ':' — a track path cannot hold one).
    const rig = fakeRig('mixamorig');
    const track = (name: string, bone: string, a: number, len = 1) =>
      new THREE.AnimationClip(name, len, [
        new THREE.QuaternionKeyframeTrack(
          `${bone}.quaternion`,
          [0, len],
          [...new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0)).toArray(), ...new THREE.Quaternion().toArray()],
        ),
      ]);
    rig.animations = [
      track('Idle', 'mixamorigSpine', 0.05),
      track('Walking', 'mixamorigLeftUpLeg', 0.5),
      track('Running', 'mixamorigLeftUpLeg', 0.9),
      new THREE.AnimationClip(G.clip, G.end / G.fps, [
        new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, G.fire / G.fps, G.end / G.fps], [0, 95, 0, 0, 80, 40, 0, 95, 0]),
      ]),
    ];
    registerModel(modelUrl(spear.file), rig);
    const kit = kitFor(H, 'spear');
    const m = new HeroModel(kit, lookFor(kit, 'spear'), heroModelFor(H.models, 'spear'));
    const pose = (state: 'idle' | 'skill' | 'run', stateT: number, t: number, speed = 0) =>
      m.pose({ state, stateT, combo: 0, stride: 0, speed, y: 0, t, strikeSec: 0.4, skillKind: 'dash', skillId: 'lunge' });
    for (let t = 0; t < 0.5; t += 0.05) pose('idle', t, t);
    expect(m.rig!.gestureNow()).toBeNull();
    // The Lunge: the gesture plays on the skill's clock; the game's pose gives way.
    let t = 0.5;
    for (let st = 0; st < SKILL_SEC.strike; st += 0.02, t += 0.02) pose('skill', st, t);
    pose('skill', SKILL_SEC.strike, (t += 0.02));
    const at = m.rig!.gestureNow()!;
    expect(at.clip).toBe(G.clip);
    expect(at.weight).toBe(1);
    expect(at.time * G.fps).toBeCloseTo(G.fire, 0);
    expect(m.rig!.gaitNow().upper).toBeGreaterThan(0.9); // the game would pose him, but…
    // …the clip has the hips: forward at the thrust.
    const hips = m.rig!.root.getObjectByName('mixamorigHips')!;
    expect(hips.position.z).toBeGreaterThan(30);
    // Standing still after the skill: it finishes and lets go.
    for (let st = 0; st < 2; st += 0.05) pose('idle', st, (t += 0.05));
    expect(m.rig!.gestureNow()).toBeNull();
    // A new Lunge, cut short by running off: it lets go at once.
    for (let st = 0; st < SKILL_SEC.end; st += 0.05) pose('skill', st, (t += 0.05));
    expect(m.rig!.gestureNow()).not.toBeNull();
    for (let st = 0; st < 0.3; st += 0.05) pose('run', st, (t += 0.05), 5);
    expect(m.rig!.gestureNow()).toBeNull();
    m.dispose();
  });
});

interface GlbJson {
  nodes: Array<{ name?: string }>;
  animations: Array<{
    name: string;
    channels: Array<{ sampler: number; target: { node: number; path: string } }>;
    samplers: Array<{ input: number; output: number }>;
  }>;
  accessors: Array<{ bufferView: number; byteOffset?: number; count: number; type: string }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
}

/** A .glb under public-mobile/: its JSON and its float accessors. */
async function readGlb(file: string): Promise<{ json: GlbJson; floats(i: number): Float32Array }> {
  const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as { readFileSync(p: URL): Uint8Array };
  const b = fs.readFileSync(new URL(`../../../public-mobile/${file}`, import.meta.url));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const jlen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jlen))) as GlbJson;
  const bin = 20 + jlen + 8;
  const size: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
  return {
    json,
    floats(i) {
      const a = json.accessors[i]!;
      const v = json.bufferViews[a.bufferView]!;
      const n = a.count * size[a.type]!;
      const out = new Float32Array(n);
      const at = bin + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
      for (let k = 0; k < n; k++) out[k] = dv.getFloat32(at + k * 4, true);
      return out;
    },
  };
}
