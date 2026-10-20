import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { KingdomData } from '@temples/shared';
import { loadModel, modelNow } from '../hero/glbModel';

/**
 * PK 2026-10-20 (D160, the third step of D155): "3D hero mode: all people and animals update to
 * 3D models". The wild animals nearest the middle of the view (the hero in the 3D mode) are PK's
 * Meshy animals: deer, boar, banteng, gaur, kouprey, serow, tiger, leopards, bears, dhole,
 * elephants, peafowl, junglefowl, ibis, hornbill, crocodile, cobra and python. Those with a walk
 * clip walk it at their pace and stand still when they stop; the others (snakes, the crocodile,
 * the birds) glide. Sized to the animal's real height or length (props.json `animals`). The rest
 * of the herd stays in the crowd, and the primates keep their figures until they have models.
 */

export type AnimalsCfg = NonNullable<KingdomData['props']['animals']>;

/** The model file for an animal kind (null: it stays a crowd figure). */
export function animalFile(cfg: AnimalsCfg, kind: string): string | null {
  return cfg.byKind[kind]?.file ?? null;
}

/** How far through the walk clip to go this frame: the clip's own pace scaled to the animal's. */
export function walkRate(speed: number, cfg: Pick<AnimalsCfg, 'walkSpeed'>): number {
  if (speed < 0.05) return 0;
  return Math.min(2.5, Math.max(0.4, speed / cfg.walkSpeed));
}

export interface AnimalPlace {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** m/s over the last frame. */
  speed: number;
}

interface Beast {
  file: string;
  holder: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
}

/** Scale and lift so the model stands on the ground at its real size. */
function fit(obj: THREE.Object3D, how: 'height' | 'length', size: number): void {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj, true);
  const s = b.getSize(new THREE.Vector3());
  const k = size / Math.max(1e-6, how === 'height' ? s.y : Math.max(s.x, s.z));
  obj.scale.multiplyScalar(k);
  obj.position.y -= b.min.y * k;
}

export class NearAnimals {
  readonly group = new THREE.Group();
  private readonly active = new Map<number, Beast>();
  private readonly free = new Map<string, Beast[]>();
  private seen = new Set<number>();
  private created = 0;

  constructor(
    readonly cfg: AnimalsCfg,
    private readonly url: (file: string) => string,
  ) {
    this.group.name = 'nearAnimals';
  }

  get shown(): number {
    return this.active.size;
  }

  begin(): void {
    this.seen = new Set();
  }

  /** Draw animal `id` (of `kind`) as its model; false while it loads (the crowd draws it). */
  place(id: number, kind: string, p: AnimalPlace, dt: number): boolean {
    const spec = this.cfg.byKind[kind];
    if (!spec) return false;
    let b = this.active.get(id);
    if (b && b.file !== `${spec.file}|${kind}`) {
      this.release(id);
      b = undefined;
    }
    if (!b) {
      b = this.take(kind) ?? undefined;
      if (!b) return false;
      this.active.set(id, b);
    }
    this.seen.add(id);
    b.holder.visible = true;
    b.holder.position.set(p.x, p.y, p.z);
    b.holder.rotation.set(0, p.heading, 0);
    if (b.mixer && b.walk) {
      const rate = walkRate(p.speed, this.cfg);
      b.walk.paused = rate === 0;
      b.walk.timeScale = rate || 1;
      b.mixer.update(rate ? dt : 0);
    }
    return true;
  }

  end(): void {
    for (const id of [...this.active.keys()]) if (!this.seen.has(id)) this.release(id);
  }

  preload(): void {
    for (const f of new Set(Object.values(this.cfg.byKind).map((k) => k.file))) void loadModel(this.url(f));
  }

  private take(kind: string): Beast | null {
    const spec = this.cfg.byKind[kind]!;
    const key = `${spec.file}|${kind}`;
    const pool = this.free.get(key);
    if (pool?.length) return pool.pop()!;
    if (this.active.size >= this.cfg.max || this.created >= this.cfg.max * 2) return null;
    const source = modelNow(this.url(spec.file));
    if (!source) {
      void loadModel(this.url(spec.file));
      return null;
    }
    const model = cloneSkinned(source);
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    const clip = source.animations.find((a) => /walk/i.test(a.name)) ?? source.animations[0] ?? null;
    const mixer = clip ? new THREE.AnimationMixer(model) : null;
    const walk = clip && mixer ? mixer.clipAction(clip) : null;
    walk?.play();
    mixer?.update(0);
    fit(model, spec.fit, spec.size);
    const holder = new THREE.Group();
    holder.add(model);
    holder.userData.kind = kind;
    this.group.add(holder);
    this.created++;
    return { file: key, holder, mixer, walk };
  }

  private release(id: number): void {
    const b = this.active.get(id);
    if (!b) return;
    this.active.delete(id);
    b.holder.visible = false;
    const pool = this.free.get(b.file) ?? [];
    pool.push(b);
    this.free.set(b.file, pool);
  }

  dispose(): void {
    for (const b of [...this.active.values(), ...[...this.free.values()].flat()]) b.mixer?.stopAllAction();
    this.active.clear();
    this.free.clear();
    this.group.clear();
  }
}
