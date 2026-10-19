import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { HeroModel, lookFor } from './heroModel';
import { kitFor } from './heroCore';
import { fakeRig } from './testRig';
import { gaitWeights, heroModelFor, mapBones, normBone, registerModel, modelUrl, specFor } from './glbModel';

/** PK: real rigged models made from the concept sheets, the king first. */

const data = loadKingdom();
const H = data.anachak.hero;

describe('real 3D models (rigged .glb)', () => {
  it('reads the bone names of the usual rigs', () => {
    expect(normBone('mixamorig:LeftForeArm')).toBe('leftforearm');
    expect(normBone('mixamorig_RightUpLeg')).toBe('rightupleg');
    expect(normBone('DEF-upper_arm.L')).toBe('upper_arm_l');
    expect(normBone('Hips')).toBe('hips');
    const m = mapBones(fakeRig());
    expect(Object.keys(m).sort()).toEqual([
      'elbowL',
      'elbowR',
      'head',
      'hipL',
      'hipR',
      'kneeL',
      'kneeR',
      'pelvis',
      'shoulderL',
      'shoulderR',
      'spine',
    ]);
  });

  it('the king has a model file in the config; with no file loaded the built-in figure stays', () => {
    expect(specFor(H.models, 'king')?.file).toMatch(/\.glb$/);
    expect(heroModelFor(H.models, 'spear')).toBeNull();
    const kit = kitFor(H, 'king');
    expect(new HeroModel(kit, lookFor(kit, 'king')).rig).toBeNull();
  });

  it('a rigged model replaces the figure: scaled by the hips, arms down, driven by the poses', () => {
    const spec = specFor(H.models, 'king')!;
    registerModel(modelUrl(spec.file), fakeRig());
    const loaded = heroModelFor(H.models, 'king')!;
    expect(loaded).toBeTruthy();
    const kit = kitFor(H, 'king');
    const m = new HeroModel(kit, lookFor(kit, 'king'), loaded);
    expect(m.rig).toBeTruthy();
    expect(m.rig!.mapped).toBe(11);
    const bones = mapBones(m.rig!.root);
    const w = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3());
    m.group.updateMatrixWorld(true);
    // Scaled so the hips stand at the figure's hip height; feet on the ground.
    expect(w(bones.pelvis!).y).toBeGreaterThan(0.85);
    expect(w(bones.pelvis!).y).toBeLessThan(1.05);
    // Arms let down from the T-pose: the forearm below the shoulder.
    m.pose({
      state: 'idle',
      stateT: 0,
      combo: 0,
      stride: 0,
      speed: 0,
      y: 0,
      t: 0.4,
      strikeSec: 0.4,
      skillKind: kit.skill.kind,
    });
    m.group.updateMatrixWorld(true);
    const restElbow = w(bones.elbowR!);
    expect(restElbow.y).toBeLessThan(w(bones.shoulderR!).y - 0.15);
    // A strike swings the right arm: the elbow moves.
    m.pose({
      state: 'attack',
      stateT: 0.15,
      combo: 0,
      stride: 0,
      speed: 0,
      y: 0,
      t: 1,
      strikeSec: 0.4,
      skillKind: kit.skill.kind,
    });
    m.group.updateMatrixWorld(true);
    expect(w(bones.elbowR!).distanceTo(restElbow)).toBeGreaterThan(0.03);
    // The built-in body is hidden; the sword stays.
    let shown = 0;
    let hidden = 0;
    m.group.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh || o.parent?.parent === m.rig!.root) return;
      if (o.visible) shown++;
      else hidden++;
    });
    expect(hidden).toBeGreaterThan(5);
    expect(shown).toBeGreaterThan(0);
    registerModel(modelUrl(spec.file), null);
  });

  it('a model rigged with its arms already down (TRELLIS king, auto-rigged) keeps them as they are', () => {
    const spec = specFor(H.models, 'king')!;
    registerModel(modelUrl(spec.file), fakeRig('mixamorig:', true));
    const kit = kitFor(H, 'king');
    const m = new HeroModel(kit, lookFor(kit, 'king'), heroModelFor(H.models, 'king')!);
    expect(m.rig!.armsAsModeled).toBe(true);
    const bones = mapBones(m.rig!.root);
    m.pose({
      state: 'idle',
      stateT: 0,
      combo: 0,
      stride: 0,
      speed: 0,
      y: 0,
      t: 0,
      strikeSec: 0.4,
      skillKind: kit.skill.kind,
    });
    m.group.updateMatrixWorld(true);
    const w = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3());
    // At idle the upper arm keeps its own angle (an A-pose, 23° out), not turned to the T-pose fix's 7°.
    const d = w(bones.elbowL!).sub(w(bones.shoulderL!)).normalize();
    expect(d.y).toBeLessThan(-0.85);
    expect(d.x).toBeGreaterThan(0.3);
    expect(d.x).toBeLessThan(0.5);
    registerModel(modelUrl(spec.file), null);
  });
});

/** A clip that turns one bone a little round x over 1 s (stands for the Meshy idle, walk, run). */
function clip(name: string, bone: string, amp: number): THREE.AnimationClip {
  const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), amp);
  return new THREE.AnimationClip(name, 1, [
    new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, [0, 0.5, 1], [...q0.toArray(), ...q1.toArray(), ...q0.toArray()]),
  ]);
}

describe('D155: PK’s heroes stand, walk and run by their own clips; the game poses strikes and work', () => {
  const pose = (state: 'idle' | 'run' | 'attack' | 'jump', speed: number, t: number) => ({
    state,
    stateT: 0.15,
    combo: 0,
    stride: t * 6,
    speed,
    y: 0,
    t,
    strikeSec: 0.4,
    skillKind: 'spin' as const,
  });

  it('the gait blends idle → walk → run by speed, always adding up to 1', () => {
    expect(gaitWeights(0)).toEqual({ idle: 1, walk: 0, run: 0 });
    expect(gaitWeights(1.4).walk).toBe(1);
    expect(gaitWeights(6).run).toBe(1);
    for (const v of [0, 0.1, 0.5, 1, 2, 2.5, 3, 3.5, 5, 9]) {
      const g = gaitWeights(v);
      expect(g.idle + g.walk + g.run).toBeCloseTo(1, 6);
      for (const w of Object.values(g)) expect(w).toBeGreaterThanOrEqual(0);
    }
  });

  it('a model with clips: the run plays while running, a strike hands the arms to the game, a jump the whole body; the sword moves to the model’s hand', () => {
    const rig = fakeRig();
    rig.animations = [
      clip('Idle', 'mixamorig:Spine', 0.05),
      clip('Walking', 'mixamorig:LeftUpLeg', 0.5),
      clip('Running', 'mixamorig:LeftUpLeg', 0.9),
    ];
    const spec = specFor(H.models, 'sword')!;
    registerModel(modelUrl(spec.file), rig);
    const kit = kitFor(H, 'sword');
    const m = new HeroModel(kit, lookFor(kit, 'sword'), heroModelFor(H.models, 'sword'));
    expect(m.rig!.clips).toBe(true);
    // Standing: the idle, the clips hold the body.
    for (let t = 0; t < 1; t += 0.05) m.pose(pose('idle', 0, t));
    let g = m.rig!.gaitNow();
    expect(g.idle).toBeGreaterThan(0.95);
    expect(g.upper).toBeLessThan(0.05);
    expect(g.lower).toBeLessThan(0.05);
    // Running: the run clip.
    for (let t = 1; t < 2; t += 0.05) m.pose(pose('run', 5, t));
    g = m.rig!.gaitNow();
    expect(g.run).toBeGreaterThan(0.95);
    // A strike while standing: the game poses the arms, the legs stay the clip's.
    for (let t = 2; t < 2.6; t += 0.05) m.pose(pose('attack', 0, t));
    g = m.rig!.gaitNow();
    expect(g.upper).toBeGreaterThan(0.95);
    expect(g.lower).toBeLessThan(0.05);
    // A jump: the game poses all of him.
    for (let t = 2.6; t < 3.2; t += 0.05) m.pose(pose('jump', 3, t));
    expect(m.rig!.gaitNow().lower).toBeGreaterThan(0.95);
    // The drawn sword is in the model's right hand, not the hidden figure's.
    m.pose(pose('attack', 0, 3.3));
    expect(m.drawn).toBe(true);
    let p: THREE.Object3D | null = m.rig!.anchors.gripR!;
    let onBone = false;
    for (; p; p = p.parent) if ((p as THREE.Bone).isBone && /RightHand/.test(p.name)) onBone = true;
    expect(onBone).toBe(true);
    m.dispose();
  });
});

describe('PK 1.9.0 (D146 ខ១): Meshy heroes on the PC, the phone keeps its own', () => {
  it('every hero on foot has a Meshy model; the phone table drops the PC-only models and swaps the king', async () => {
    const { loadKingdom } = await import('@temples/shared');
    const { phoneModels } = await import('./glbModel');
    const models = loadKingdom().anachak.hero.models!;
    for (const k of ['king', 'worker', 'spear', 'sword', 'bow', 'commander', 'hunter'])
      expect(typeof models[k] === 'object' && /^models\/(heroes|real\/people)\//.test(models[k].file)).toBe(true);
    const phone = phoneModels(models)!;
    expect(Object.keys(phone).filter((k) => !k.startsWith('$'))).toEqual(['king']);
    expect((phone.king as { file: string }).file).toBe('models/king-guardian.glb');
  });

  it('the model files are in the game, rigged; the PC heroes carry idle, walk and run clips (D155)', async () => {
    const { loadKingdom } = await import('@temples/shared');
    const models = loadKingdom().anachak.hero.models!;
    for (const [k, m] of Object.entries(models)) {
      if (k.startsWith('$') || typeof m !== 'object') continue;
      const json = await glbJson(m.file);
      expect(json, m.file).not.toBeNull();
      expect(json!.skins?.length ?? 0).toBeGreaterThan(0);
      if (m.file.startsWith('models/real/people/')) {
        const names = (json!.animations as Array<{ name: string }>).map((a) => a.name).join(' ');
        expect(names, m.file).toMatch(/idle|stance/i);
        expect(names, m.file).toMatch(/walk/i);
        expect(names, m.file).toMatch(/run/i);
      }
    }
  });
});

/** The JSON chunk of a .glb under public-mobile/ (null when the file is not there). */
async function glbJson(file: string): Promise<{ meshes?: unknown[]; textures?: unknown[]; skins?: unknown[]; animations?: unknown[] } | null> {
  const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
    existsSync(p: URL): boolean;
    readFileSync(p: URL): Uint8Array;
  };
  const url = new URL(`../../../public-mobile/${file}`, import.meta.url);
  if (!fs.existsSync(url)) return null;
  const b = fs.readFileSync(url);
  const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len)));
}
