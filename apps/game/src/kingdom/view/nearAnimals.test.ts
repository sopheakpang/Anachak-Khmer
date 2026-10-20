import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { registerModel } from '../hero/glbModel';
import { NearAnimals, animalFile, walkRate, type AnimalsCfg } from './nearAnimals';

/** PK 2026-10-20 (D160, D155 step 3): PK's animals near the view, round the hero in 3D. */

const data = loadKingdom();
const AC = data.props.animals!;

/** A 2 m long, 1 m tall "animal" with a walk clip that swings one part. */
function fakeAnimal(): THREE.Object3D {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1, 2).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial(),
  );
  body.name = 'body';
  root.add(body);
  const track = new THREE.NumberKeyframeTrack('body.position[x]', [0, 0.5, 1], [0, 0.2, 0]);
  root.animations = [new THREE.AnimationClip('Walking', 1, [track])];
  return root;
}

describe('PK’s animals near the view', () => {
  it('every kind with a model has its file; the primates keep their figures', () => {
    const shipped = Object.keys(import.meta.glob('../../../public-mobile/models/real/**/*.glb'));
    for (const [kind, k] of Object.entries(AC.byKind)) {
      expect(
        shipped.some((f) => f.endsWith(k.file)),
        kind,
      ).toBe(true);
      expect(k.size).toBeGreaterThan(0.2);
    }
    for (const kind of ['tiger', 'elephant', 'deer', 'crocodile', 'python', 'peafowl'])
      expect(animalFile(AC, kind)).not.toBeNull();
    expect(animalFile(AC, 'gibbon')).toBeNull();
    // More round the hero in the 3D mode.
    expect(AC.hero!.max).toBeGreaterThanOrEqual(AC.max);
    expect(data.props.people!.hero!.max).toBeGreaterThan(data.props.people!.max);
  });

  it('the walk clip runs at the animal’s pace and stops when it stands', () => {
    expect(walkRate(0, AC)).toBe(0);
    expect(walkRate(AC.walkSpeed, AC)).toBeCloseTo(1);
    expect(walkRate(100, AC)).toBe(2.5);
    expect(walkRate(0.2, AC)).toBe(0.4);
  });

  it('waits for the model, then draws it at its real size, walking, from a shared pool', () => {
    const cfg: AnimalsCfg = {
      ...AC,
      max: 2,
      byKind: { deer: { file: 'x/deer.glb', fit: 'length', size: 1.6 } },
    };
    const url = (f: string) => `test:${f}`;
    const na = new NearAnimals(cfg, url);
    na.begin();
    registerModel(url('x/deer.glb'), null);
    expect(na.place(1, 'deer', { x: 0, y: 0, z: 0, heading: 0, speed: 0 }, 0.1)).toBe(false);
    registerModel(url('x/deer.glb'), fakeAnimal());
    expect(na.place(1, 'deer', { x: 5, y: 0, z: 2, heading: 1, speed: 1.4 }, 0.1)).toBe(true);
    expect(na.place(2, 'deer', { x: 9, y: 0, z: 2, heading: 1, speed: 0 }, 0.1)).toBe(true);
    // At most `max`.
    expect(na.place(3, 'deer', { x: 9, y: 0, z: 2, heading: 1, speed: 0 }, 0.1)).toBe(false);
    na.end();
    expect(na.shown).toBe(2);
    const holder = na.group.children[0]!;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeCloseTo(1.6, 1);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(holder.position.x).toBe(5);
    expect(holder.rotation.y).toBe(1);
    // Next frame only one is near: the other goes back to the pool and is reused.
    na.begin();
    na.place(1, 'deer', { x: 5, y: 0, z: 2, heading: 1, speed: 1 }, 0.1);
    na.end();
    expect(na.shown).toBe(1);
    na.begin();
    expect(na.place(7, 'deer', { x: 1, y: 0, z: 1, heading: 0, speed: 0 }, 0.1)).toBe(true);
    na.end();
    expect(na.group.children.length).toBe(2);
    expect(na.place(1, 'nope', { x: 0, y: 0, z: 0, heading: 0, speed: 0 }, 0.1)).toBe(false);
    na.dispose();
  });
});
