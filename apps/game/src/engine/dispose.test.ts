import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeAndRemove, disposeNode } from './dispose';

/** Count dispose() calls on a resource. */
function watch<T extends THREE.EventDispatcher<{ dispose: object }>>(r: T, log: unknown[]): T {
  r.addEventListener('dispose', () => log.push(r));
  return r;
}

describe('1.8.0 optimisation: freeing GPU memory', () => {
  it('frees every geometry and material under a node once, and takes it out of its parent', () => {
    const log: unknown[] = [];
    const geo = watch(new THREE.BoxGeometry(), log);
    const mat = watch(new THREE.MeshBasicMaterial(), log);
    const group = new THREE.Group();
    // Two meshes share one geometry and one material: each is freed once.
    group.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat));
    const inst = watch(
      new THREE.InstancedMesh(
        watch(new THREE.PlaneGeometry(), log),
        [watch(new THREE.MeshBasicMaterial(), log), watch(new THREE.MeshBasicMaterial(), log)],
        4,
      ),
      log,
    );
    const depth = watch(new THREE.MeshDepthMaterial(), log);
    inst.customDepthMaterial = depth;
    const lod = new THREE.LOD();
    lod.addLevel(
      new THREE.Mesh(watch(new THREE.SphereGeometry(), log), watch(new THREE.MeshBasicMaterial(), log)),
      0,
    );
    group.add(inst, lod);
    const scene = new THREE.Scene().add(group);
    disposeNode(group);
    // 2 shared + plane + 2 instanced materials + depth + the instanced mesh itself + sphere + its material
    expect(log.length).toBe(9);
    expect(new Set(log).size).toBe(log.length);
    expect(log).toContain(depth);
    expect(group.parent).toBeNull();
    expect(scene.children.length).toBe(0);
  });

  it('keeps shared resources and textures unless asked', () => {
    const log: unknown[] = [];
    const map = watch(new THREE.Texture(), log);
    const cached = watch(new THREE.MeshBasicMaterial({ map }), log);
    cached.userData.shared = true;
    const own = watch(new THREE.MeshBasicMaterial({ map }), log);
    const kept = watch(new THREE.BoxGeometry(), log);
    const root = new THREE.Group().add(
      new THREE.Mesh(kept, own),
      new THREE.Mesh(new THREE.BoxGeometry(), cached),
    );
    disposeNode(root, { keep: new Set([kept]) });
    expect(log).toEqual([own]);
    log.length = 0;
    const tex = watch(new THREE.Texture(), log);
    const shader = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex } } });
    disposeNode(new THREE.Mesh(new THREE.BoxGeometry(), shader), { textures: true });
    expect(log).toEqual([tex]);
  });

  it('frees a skinned mesh bone texture, is safe with nothing, and disposeAndRemove leaves the scene', () => {
    const bone = new THREE.Bone();
    const sk = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    sk.add(bone);
    sk.bind(new THREE.Skeleton([bone]));
    let freed = false;
    const was = sk.skeleton.dispose.bind(sk.skeleton);
    sk.skeleton.dispose = () => {
      freed = true;
      was();
    };
    const scene = new THREE.Scene().add(sk);
    disposeAndRemove(scene, sk);
    expect(freed).toBe(true);
    expect(scene.children.length).toBe(0);
    expect(() => disposeNode(null)).not.toThrow();
    expect(() => disposeAndRemove(scene, undefined)).not.toThrow();
    // Twice is harmless.
    expect(() => disposeNode(sk)).not.toThrow();
  });
});
