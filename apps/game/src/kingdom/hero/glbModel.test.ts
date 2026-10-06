import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { HeroModel, lookFor } from './heroModel';
import { kitFor } from './heroCore';
import { heroModelFor, mapBones, normBone, registerModel, modelUrl, specFor } from './glbModel';

/** PK: real rigged models made from the concept sheets, the king first. */

const data = loadKingdom();
const H = data.anachak.hero;

/** A small humanoid rig in a T-pose, Mixamo names, 100× scale (as Mixamo exports). */
function fakeRig(prefix = 'mixamorig:', armsDown = false): THREE.Object3D {
  const b = (name: string, x: number, y: number, z = 0) => {
    const bone = new THREE.Bone();
    bone.name = prefix + name;
    bone.position.set(x, y, z);
    return bone;
  };
  const hips = b('Hips', 0, 95);
  const spine = b('Spine', 0, 12);
  const spine1 = b('Spine1', 0, 12);
  const neck = b('Neck', 0, 25);
  const head = b('Head', 0, 10);
  const lArm = b('LeftArm', 18, 20);
  const lFore = armsDown ? b('LeftForeArm', 12, -28) : b('LeftForeArm', 28, 0);
  const lHand = armsDown ? b('LeftHand', 1, -26) : b('LeftHand', 26, 0);
  const rArm = b('RightArm', -18, 20);
  const rFore = armsDown ? b('RightForeArm', -12, -28) : b('RightForeArm', -28, 0);
  const rHand = armsDown ? b('RightHand', -1, -26) : b('RightHand', -26, 0);
  const lUp = b('LeftUpLeg', 9, -5);
  const lLeg = b('LeftLeg', 0, -44);
  const lFoot = b('LeftFoot', 0, -42);
  const rUp = b('RightUpLeg', -9, -5);
  const rLeg = b('RightLeg', 0, -44);
  const rFoot = b('RightFoot', 0, -42);
  hips.add(spine, lUp, rUp);
  spine.add(spine1);
  spine1.add(neck, lArm, rArm);
  neck.add(head);
  lArm.add(lFore);
  lFore.add(lHand);
  rArm.add(rFore);
  rFore.add(rHand);
  lUp.add(lLeg);
  lLeg.add(lFoot);
  rUp.add(rLeg);
  rLeg.add(rFoot);
  const bones: THREE.Bone[] = [];
  hips.traverse((o) => bones.push(o as THREE.Bone));
  const geo = new THREE.BoxGeometry(40, 180, 20);
  geo.translate(0, 90, 0);
  const n = geo.getAttribute('position').count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n).fill([1, 0, 0, 0]).flat(), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xc8a050 }));
  const root = new THREE.Group();
  root.add(hips, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  return root;
}

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
