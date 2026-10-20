import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { ACT } from '../../engine/figures';
import { actPose, clipOnly } from './actPose';
import { NearPeople, personFile, pickNear } from './nearPeople';
import { fakeRig } from '../hero/testRig';
import { modelUrl, registerModel } from '../hero/glbModel';
import { dressOf, lookFor } from '../hero/heroModel';
import { kitFor } from '../hero/heroCore';

/** PK 1.9.0 (D155): the units nearest the middle of the view are PK's Meshy people. */

const data = loadKingdom();
const PC = data.props.people!;

/** A clip turning one bone a little over 1 s. */
function clip(name: string, bone: string): THREE.AnimationClip {
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
  return new THREE.AnimationClip(name, 1, [
    new THREE.QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      [0, 0.5, 1],
      [0, 0, 0, 1, ...q1.toArray(), 0, 0, 0, 1],
    ),
  ]);
}

describe('the crowd’s motions as joint turns', () => {
  const ALL = Object.values(ACT);

  it('every act gives finite turns; walking and standing are left to the clips', () => {
    for (const a of ALL)
      for (const t of [0, 0.37, 1.9, 7.3]) {
        const p = actPose(a, t, 5);
        for (const v of [p.armL.ang, p.armL.bend, p.armR.ang, p.armR.bend, p.legL, p.legR])
          expect(Number.isFinite(v)).toBe(true);
      }
    expect(clipOnly(ACT.crowd)).toBe(true);
    expect(clipOnly(ACT.stand)).toBe(true);
    expect(clipOnly(ACT.hammer)).toBe(false);
  });

  it('work swings the arms; the spear arm drives forward while the shield arm stays up', () => {
    // A hammer blow raises the arms over the head at some point in its cycle.
    const highest = Math.min(
      ...Array.from({ length: 60 }, (_, i) => actPose(ACT.hammer, i * 0.05, 0).armR.ang),
    );
    expect(highest).toBeLessThan(-2);
    // Thrust: the right (spear) arm moves a lot over a cycle, the left (shield) one does not.
    const r = Array.from({ length: 60 }, (_, i) => actPose(ACT.thrust, i * 0.05, 0).armR.ang);
    const l = Array.from({ length: 60 }, (_, i) => actPose(ACT.thrust, i * 0.05, 0).armL.ang);
    expect(Math.max(...r) - Math.min(...r)).toBeGreaterThan(0.5);
    expect(Math.max(...l) - Math.min(...l)).toBeLessThan(0.01);
  });

  it('fights and field work hold the legs; planting and reaping bend the whole body', () => {
    for (const a of [ACT.thrust, ACT.sword, ACT.draw, ACT.guard, ACT.chop])
      expect(actPose(a, 1, 0).legs).toBe(true);
    expect(actPose(ACT.plant, 1, 0).body).toBe(true);
    expect(actPose(ACT.reap, 1, 0).body).toBe(true);
    expect(actPose(ACT.carry, 1, 0).legs).toBe(false); // he walks with the load on his head
  });
});

describe('who is drawn as one of PK’s people', () => {
  it('soldiers by type, villagers by job, shared out by id; riders and the cart stay in the crowd', () => {
    expect(personFile(PC, 'spearman', 'idle', 3)).toBe(`${PC.dir}spearman.glb`);
    expect(personFile(PC, 'villager', 'woodcutter', 1)).toBe(`${PC.dir}woodcutter.glb`);
    const farmers = new Set([0, 1, 2, 3].map((id) => personFile(PC, 'villager', 'farmer', id)));
    expect(farmers.size).toBe(2);
    for (const t of ['horseman', 'warElephant', 'buffaloRider', 'oxCart'])
      expect(personFile(PC, t, 'idle', 1)).toBeNull();
  });

  it('every file the table names is in the game with idle, walk and run clips', async () => {
    const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
      existsSync(p: URL): boolean;
      readFileSync(p: URL): Uint8Array;
    };
    // D158: the royal court's models too (king, queens, Brahmins, parasol bearers).
    const files = new Set(
      [...Object.values(PC.byType), ...Object.values(PC.byJob), ...Object.values(PC.court ?? {})].flat(),
    );
    expect(Object.keys(PC.court ?? {}).sort()).toEqual(['brahmin', 'king', 'parasol', 'queen']);
    const first = new URL(`../../../public-mobile/${PC.dir}${[...files][0]}.glb`, import.meta.url);
    if (!fs.existsSync(first)) return; // a checkout without the PC models
    for (const f of files) {
      const url = new URL(`../../../public-mobile/${PC.dir}${f}.glb`, import.meta.url);
      expect(fs.existsSync(url), f).toBe(true);
      const b = fs.readFileSync(url);
      const len = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(12, true);
      const j = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + len))) as {
        animations?: Array<{ name: string }>;
      };
      const names = (j.animations ?? []).map((a) => a.name).join(' ');
      // The court only stands: a model without an idle clip is posed by the game (the parasol bearer).
      if (!Object.values(PC.court ?? {}).includes(f)) expect(names, f).toMatch(/idle|stance/i);
      expect(names, f).toMatch(/walk/i);
    }
  });

  it('the nearest within the radius, at most max', () => {
    const units = Array.from({ length: 40 }, (_, i) => ({ id: i, x: i * 2, z: 0 }));
    const near = pickNear(units, 0, 0, { max: 5, radius: 30 });
    expect([...near].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(pickNear(units, 500, 0, { max: 5, radius: 30 }).size).toBe(0);
  });

  it('a person shows once the model is in, works with the crowd’s motion, and goes back to the pool when no longer near', () => {
    const file = personFile(PC, 'villager', 'builder', 0)!;
    const dress = dressOf(lookFor(kitFor(data.anachak.hero, 'worker'), 'villager'));
    const np = new NearPeople({ ...PC, max: 4 }, modelUrl, dress);
    np.begin();
    // Not loaded yet: the crowd keeps drawing him.
    registerModel(modelUrl(file), null);
    expect(np.place(1, file, { x: 0, y: 0, z: 0, heading: 0, act: ACT.hammer, speed: 0 }, 0)).toBe(false);
    np.end();
    const rig = fakeRig();
    rig.animations = [
      clip('Idle', 'mixamorig:Spine'),
      clip('Walking', 'mixamorig:LeftUpLeg'),
      clip('Running', 'mixamorig:LeftUpLeg'),
    ];
    registerModel(modelUrl(file), rig);
    // Hammering: the game holds his arms (the idle clip the rest).
    let px = 0;
    for (let t = 0; t < 1.5; t += 0.05) {
      np.begin();
      expect(np.place(1, file, { x: 3, y: 0, z: 4, heading: 1, act: ACT.hammer, speed: 0 }, t)).toBe(true);
      np.end();
      px = Math.max(px, np.group.children[0]!.position.x);
    }
    expect(np.shown).toBe(1);
    expect(px).toBe(3); // placed where the unit stands
    // He walks out of the near set: back to the pool, hidden; the next one reuses him.
    np.begin();
    np.end();
    expect(np.shown).toBe(0);
    expect(np.group.children[0]!.visible).toBe(false);
    np.begin();
    expect(np.place(2, file, { x: 0, y: 0, z: 0, heading: 0, act: ACT.crowd, speed: 2.2 }, 2)).toBe(true);
    np.end();
    expect(np.group.children).toHaveLength(1);
    expect(np.group.children[0]!.visible).toBe(true);
    np.dispose();
  });
});
