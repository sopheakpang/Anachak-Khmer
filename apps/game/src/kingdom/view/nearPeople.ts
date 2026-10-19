import * as THREE from 'three';
import type { KingdomData } from '@temples/shared';
import { adultFigure, type Dress, type Joints } from '../hero/body';
import { HeroRig, loadModel, modelNow, type ModelSpec } from '../hero/glbModel';
import { ACT } from '../../engine/figures';
import { actPose, applyActPose, clipOnly } from './actPose';

/**
 * D155 (PK: "reality logic human gesture behavior"): the villagers and soldiers nearest the
 * middle of the view, zoomed in, are PK's Meshy people on the PC look. Each stands, walks and
 * runs with the model's own motion capture; work and fights put the crowd's own motions
 * (actPose) on the arms, and on the legs and body where the act needs them, through the same
 * rig as the 3D hero (a hidden figure's joints drive the bones). The rest stay in the crowd.
 */

export type PeopleCfg = NonNullable<KingdomData['props']['people']>;

/** The model file for a unit (null: it stays in the crowd). */
export function personFile(cfg: PeopleCfg, type: string, job: string, id: number): string | null {
  const list = cfg.byType[type] ?? (type === 'villager' ? (cfg.byJob[job] ?? cfg.byJob.idle) : undefined);
  if (!list?.length) return null;
  return `${cfg.dir}${list[Math.abs(id) % list.length]}.glb`;
}

/** The units to show as people: nearest the point, within the radius, at most `max`. */
export function pickNear<T extends { id: number; x: number; z: number }>(
  units: Iterable<T>,
  cx: number,
  cz: number,
  cfg: Pick<PeopleCfg, 'max' | 'radius'>,
): Set<number> {
  const r2 = cfg.radius * cfg.radius;
  const near: Array<[number, number]> = [];
  for (const u of units) {
    const d2 = (u.x - cx) ** 2 + (u.z - cz) ** 2;
    if (d2 <= r2) near.push([d2, u.id]);
  }
  near.sort((a, b) => a[0] - b[0]);
  return new Set(near.slice(0, cfg.max).map((n) => n[1]));
}

/** What the scene knows of a person this frame. */
export interface PersonPlace {
  x: number;
  y: number;
  z: number;
  heading: number;
  act: number;
  lean?: number;
  /** Walking speed (m/s; 0 standing). */
  speed: number;
}

interface Person {
  file: string;
  holder: THREE.Group;
  fig: { root: THREE.Group; j: Joints };
  rig: HeroRig;
}

export class NearPeople {
  readonly group = new THREE.Group();
  private readonly active = new Map<number, Person>();
  private readonly free = new Map<string, Person[]>();
  private seen = new Set<number>();
  /** People built so far (each file keeps its own pool; never more than twice `max`). */
  private created = 0;
  private readonly spec: (file: string) => ModelSpec;

  constructor(
    readonly cfg: PeopleCfg,
    private readonly url: (file: string) => string,
    private readonly dress: Dress,
  ) {
    this.group.name = 'nearPeople';
    this.spec = (file) => ({ file, hips: cfg.hips });
  }

  /** How many are drawn now (tests). */
  get shown(): number {
    return this.active.size;
  }

  /** Start a frame. */
  begin(): void {
    this.seen = new Set();
  }

  /**
   * Draw unit `id` as a person this frame. False while its model is still loading (the crowd
   * draws him till then).
   */
  place(id: number, file: string, p: PersonPlace, t: number): boolean {
    let person = this.active.get(id);
    if (person && person.file !== file) {
      this.release(id);
      person = undefined;
    }
    if (!person) {
      person = this.take(file) ?? undefined;
      if (!person) return false;
      this.active.set(id, person);
    }
    this.seen.add(id);
    const { holder, fig, rig } = person;
    holder.visible = true;
    holder.position.set(p.x, p.y, p.z);
    holder.rotation.set(p.lean ?? 0, p.heading, 0, 'YXZ');
    // The figure's joints: at rest, then the act (the crowd's motion for this person).
    const j = fig.j;
    for (const g of [j.spine, j.head, j.shoulderL, j.shoulderR, j.elbowL, j.elbowR, j.hipL, j.hipR, j.kneeL, j.kneeR])
      g.rotation.set(0, 0, 0);
    const walking = p.act === ACT.crowd || p.act === ACT.carry || p.act === ACT.torch;
    const speed = walking ? p.speed : 0;
    if (clipOnly(p.act)) {
      rig.drive({ state: speed > 0.1 ? 'run' : 'idle', speed, t, mounted: false });
    } else {
      const pose = actPose(p.act, t, id);
      applyActPose(j, pose);
      rig.drive({ state: 'work', speed, t, mounted: false, own: { arms: true, body: pose.legs || pose.body } });
    }
    return true;
  }

  /** End a frame: people no longer near go back to the pool. */
  end(): void {
    for (const id of [...this.active.keys()]) if (!this.seen.has(id)) this.release(id);
  }

  /** Load the models this config can use (in the background). */
  preload(): void {
    const files = new Set<string>();
    for (const list of [...Object.values(this.cfg.byType), ...Object.values(this.cfg.byJob)])
      for (const f of list) files.add(`${this.cfg.dir}${f}.glb`);
    for (const f of files) void loadModel(this.url(f));
  }

  private take(file: string): Person | null {
    const pool = this.free.get(file);
    if (pool?.length) return pool.pop()!;
    if (this.active.size >= this.cfg.max || this.created >= this.cfg.max * 2) return null;
    const source = modelNow(this.url(file));
    if (!source) {
      void loadModel(this.url(file));
      return null;
    }
    const holder = new THREE.Group();
    const fig = adultFigure(this.dress);
    fig.root.visible = false; // the hidden figure only drives the bones
    holder.add(fig.root);
    const rig = new HeroRig(source, this.spec(file), fig.j);
    rig.root.position.copy(fig.root.position);
    holder.add(rig.root);
    this.group.add(holder);
    this.created++;
    return { file, holder, fig, rig };
  }

  private release(id: number): void {
    const p = this.active.get(id);
    if (!p) return;
    this.active.delete(id);
    p.holder.visible = false;
    const pool = this.free.get(p.file) ?? [];
    pool.push(p);
    this.free.set(p.file, pool);
  }

  dispose(): void {
    const all = [...this.active.values(), ...[...this.free.values()].flat()];
    for (const p of all) {
      p.rig.dispose();
      p.fig.root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    }
    this.active.clear();
    this.free.clear();
    this.group.clear();
  }
}
