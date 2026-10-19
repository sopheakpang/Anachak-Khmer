import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { asInk, toonGradient } from './toon';
import type { Joints } from './body';
import { realLook } from '../../engine/look';

/**
 * Real 3D character models (PK: sculpted, rigged .glb files made from his concept sheets, the
 * king first). A model file replaces the hero's built-in figure in the 3D mode and on the
 * character sheet; the game still poses it — every frame the built-in figure's joints are
 * posed as before (hidden) and their turns are carried over to the model's bones, so any
 * humanoid rig works (Mixamo, Meshy, Tripo, Rodin, Blender's Rigify names). The model is
 * drawn in the game's look: cel-shaded with an ink outline. With no file, nothing changes.
 */

export interface ModelSpec {
  file: string;
  /** Hip height in metres the model is scaled to (the built-in figure's is 0.94). */
  hips: number;
  /** The phone build's own file (it has no models/heroes/). */
  phone?: string;
}

/** The joints the game poses, and the bone names that may stand for them in a rig. */
export const BONE_NAMES: Record<keyof Pick<Joints, RigJoint>, string[]> = {
  pelvis: ['hips', 'pelvis', 'root_hips', 'hip'],
  spine: ['spine', 'spine1', 'spine_01', 'spine01', 'chest'],
  head: ['head'],
  shoulderL: ['leftarm', 'upperarm_l', 'upper_arm_l', 'l_upperarm', 'arm_l', 'leftupperarm'],
  shoulderR: ['rightarm', 'upperarm_r', 'upper_arm_r', 'r_upperarm', 'arm_r', 'rightupperarm'],
  elbowL: ['leftforearm', 'lowerarm_l', 'forearm_l', 'l_forearm', 'leftlowerarm'],
  elbowR: ['rightforearm', 'lowerarm_r', 'forearm_r', 'r_forearm', 'rightlowerarm'],
  hipL: ['leftupleg', 'thigh_l', 'upperleg_l', 'l_thigh', 'leftupperleg'],
  hipR: ['rightupleg', 'thigh_r', 'upperleg_r', 'r_thigh', 'rightupperleg'],
  kneeL: ['leftleg', 'calf_l', 'lowerleg_l', 'l_calf', 'shin_l', 'leftlowerleg'],
  kneeR: ['rightleg', 'calf_r', 'lowerleg_r', 'r_calf', 'shin_r', 'rightlowerleg'],
};
type RigJoint =
  | 'pelvis'
  | 'spine'
  | 'head'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'hipL'
  | 'hipR'
  | 'kneeL'
  | 'kneeR';
const ORDER: RigJoint[] = [
  'pelvis',
  'spine',
  'head',
  'shoulderL',
  'elbowL',
  'shoulderR',
  'elbowR',
  'hipL',
  'kneeL',
  'hipR',
  'kneeR',
];

/** A bone's name without the rig's prefix ("mixamorig:LeftArm" → "leftarm"). */
export function normBone(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/^.*[:|]/, '')
      // A rig's prefix: "mixamorig" always, the others only before a separator ("rightarm"
      // starts with "rig" too).
      .replace(/^mixamorig\d*[_\s.-]*/, '')
      .replace(/^(armature|rig|def|bip0?1|character)[_\s.-]+/, '')
      .replace(/[\s.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .replace(/^(left|right)_/, '$1')
  );
}

/** Find the rig's bone for each joint the game poses (the first bone that matches). */
export function mapBones(root: THREE.Object3D): Partial<Record<RigJoint, THREE.Bone>> {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const out: Partial<Record<RigJoint, THREE.Bone>> = {};
  for (const j of ORDER)
    for (const want of BONE_NAMES[j]) {
      const b = bones.find((x) => normBone(x.name) === want);
      if (b) {
        out[j] = b;
        break;
      }
    }
  return out;
}

/** An upper arm within this angle (radians) of straight down already hangs at rest. */
const ARMS_DOWN = 0.5;

const loaded = new Map<string, THREE.Object3D | null>();
const pending = new Map<string, Promise<THREE.Object3D | null>>();

/** Load a model file once (null when there is none, or it cannot be read). */
export function loadModel(url: string): Promise<THREE.Object3D | null> {
  if (loaded.has(url)) return Promise.resolve(loaded.get(url)!);
  let p = pending.get(url);
  if (!p) {
    p = new GLTFLoader()
      .loadAsync(url)
      .then((g) => {
        // The clips go with the scene (Object3D.animations), for the walk, run and idle (D155).
        g.scene.animations = g.animations;
        return g.scene;
      })
      .catch(() => null)
      .then((s) => {
        loaded.set(url, s);
        return s;
      });
    pending.set(url, p);
  }
  return p;
}

/** A model already loaded (or null), without waiting. */
export function modelNow(url: string): THREE.Object3D | null {
  return loaded.get(url) ?? null;
}

/** For the tests and the sheet: register a model built in code. */
export function registerModel(url: string, scene: THREE.Object3D | null): void {
  loaded.set(url, scene);
}

const inkCache = new Map<number, THREE.MeshBasicMaterial>();
/** An ink outline for skinned meshes: the back faces pushed out by `w` model units. */
function inkFor(w: number): THREE.MeshBasicMaterial {
  const key = Math.round(w * 1e5);
  let m = inkCache.get(key);
  if (!m) {
    m = asInk(new THREE.MeshBasicMaterial({ color: 0x1c1218, side: THREE.BackSide }));
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  transformed += normalize(objectNormal) * ${w.toFixed(5)};`,
      );
    };
    m.customProgramCacheKey = () => `ink-${key}`;
    inkCache.set(key, m);
  }
  return m;
}

/** The hands' bones (for the weapon and the bow when the model plays its own clips). */
const HAND_NAMES = {
  handR: ['righthand', 'hand_r', 'r_hand'],
  handL: ['lefthand', 'hand_l', 'l_hand'],
} as const;

/** How fast (m/s) PK's Meshy walk and run clips move the feet (in place, 1.04 s and 0.67 s a cycle). */
export const GAIT = { walk: 1.4, run: 4.2 };

/**
 * D155 (PK: "reality logic human gesture behavior"): how much of each clip plays at a speed —
 * standing still is the idle, then the walk, and from a jog up the run; between them the two
 * blend so the step never jumps. The weights add up to 1.
 */
export function gaitWeights(speed: number): { idle: number; walk: number; run: number } {
  const v = Math.max(0, speed);
  const idle = Math.max(0, 1 - v / 0.3);
  const run = Math.min(1, Math.max(0, (v - 2.2) / 1.4));
  return { idle, walk: Math.max(0, 1 - idle - run), run };
}

/** Joints the game's own poses take over from the clips (upper body: strikes, skills, work). */
const UPPER: ReadonlySet<RigJoint> = new Set(['spine', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR']);
/** States the game poses the arms in, and states it poses the whole body in. */
const OWN_ARMS = new Set(['attack', 'skill', 'work', 'hurt', 'jump', 'dash']);
const OWN_BODY = new Set(['skill', 'work', 'hurt', 'jump', 'dash']);

/** What the rig needs to know each frame to blend its clips with the game's poses. */
export interface DriveInfo {
  state: string;
  speed: number;
  t: number;
  mounted: boolean;
  /** Say outright which parts the game poses (the near crowd's work acts, D155); else by state. */
  own?: { arms: boolean; body: boolean };
}

/**
 * The model in the game: scaled to the hero's size, feet on the ground, facing +z, drawn
 * cel-shaded with an ink outline, its arms let down from the rig's T-pose, its bones driven by
 * the built-in figure's joints.
 */
export class HeroRig {
  readonly root = new THREE.Group();
  private readonly bones: Partial<Record<RigJoint, THREE.Bone>>;
  /** Each joint's rest turn (world) and its bone's rest turn (world). */
  private readonly rest = new Map<RigJoint, { joint: THREE.Quaternion; bone: THREE.Quaternion }>();
  private readonly hipsRestY: number;
  private readonly pelvisRestY: number;
  /** How many of the game's joints the rig has (11 is a full humanoid). */
  readonly mapped: number;
  /** The rig's arms already hang down as modelled (not a T-pose): calibrate them to the idle. */
  readonly armsAsModeled: boolean;
  /** The toon materials made for this copy of the model (freed by dispose). */
  private readonly ownMats: THREE.Material[] = [];
  /** D155: the model's own idle, walk and run clips (PC: PK's Meshy people), or null. */
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly gait: Partial<Record<'idle' | 'walk' | 'run', THREE.AnimationAction>> = {};
  /** How much the game's own pose holds the arms (upper) and the legs (lower), 0–1, eased. */
  private readonly own = { upper: 1, lower: 1 };
  private lastT = Number.NaN;
  /** Does the model walk, run and stand with its own clips? */
  readonly clips: boolean;
  /**
   * Where the game's joints sit on the model's bones (gear hangs here when the clips play, so
   * the sword stays in the model's hand): same place as the joint at rest, carried by the bone.
   */
  readonly anchors: Partial<Record<'gripR' | 'gripL' | 'spine' | 'elbowL' | 'pelvis', THREE.Group>> = {};

  constructor(
    source: THREE.Object3D,
    spec: ModelSpec,
    private readonly j: Joints,
  ) {
    const model = cloneSkinned(source);
    this.bones = mapBones(model);
    this.mapped = Object.keys(this.bones).length;
    // Scale by the hips (a crown or a spear must not change the body's size), else by height.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const hips = this.bones.pelvis?.getWorldPosition(new THREE.Vector3());
    const k =
      hips && hips.y - box.min.y > 1e-4 ? spec.hips / (hips.y - box.min.y) : 1.75 / (box.max.y - box.min.y);
    model.scale.multiplyScalar(k);
    model.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(model);
    model.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    this.root.add(model);
    // The game's look: toon shading (keeping the model's own textures) and an ink outline.
    const outlines: Array<[THREE.Mesh, THREE.Mesh]> = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      const real = realLook();
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((src) => {
        const s = src as THREE.MeshStandardMaterial;
        // The PC's semi-realistic look (D152): the model's own PBR material, no ink outline.
        if (real) {
          const r = s.clone();
          r.roughness = Math.max(0.55, s.roughness ?? 1);
          return r;
        }
        return new THREE.MeshToonMaterial({
          color: s.color ?? new THREE.Color(0xffffff),
          map: s.map ?? null,
          gradientMap: toonGradient(),
          transparent: s.transparent,
          alphaTest: s.alphaTest,
          side: s.side,
        });
      });
      this.ownMats.push(...mats);
      m.material = Array.isArray(m.material) ? mats : mats[0]!;
      if (real) return;
      const w = 0.012 / Math.max(1e-6, k * worldScale(m.parent));
      const ink = (m as THREE.SkinnedMesh).isSkinnedMesh
        ? new THREE.SkinnedMesh(m.geometry, inkFor(w))
        : new THREE.Mesh(m.geometry, inkFor(w));
      outlines.push([m, ink]);
    });
    for (const [m, ink] of outlines) {
      ink.frustumCulled = false;
      m.parent!.add(ink);
      ink.position.copy(m.position);
      ink.quaternion.copy(m.quaternion);
      ink.scale.copy(m.scale);
      const sm = m as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) (ink as THREE.SkinnedMesh).bind(sm.skeleton, sm.bindMatrix);
    }
    // Arms down: rigs come in a T-pose; turn each upper arm so it hangs a little out from the
    // body, as the built-in figure's arms do at rest.
    this.root.updateMatrixWorld(true);
    let asModeled = 0;
    for (const [arm, fore, side] of [
      ['shoulderL', 'elbowL', 1],
      ['shoulderR', 'elbowR', -1],
    ] as const) {
      const a = this.bones[arm];
      const f = this.bones[fore];
      if (!a || !f) continue;
      const pa = a.getWorldPosition(new THREE.Vector3());
      const pf = f.getWorldPosition(new THREE.Vector3());
      const from = pf.sub(pa).normalize();
      // A rig whose arms already hang down (an A-pose, or a model rigged as it stands) is
      // left as it is: turning it would pull the hands off the body.
      if (from.y < -Math.cos(ARMS_DOWN)) {
        asModeled++;
        continue;
      }
      const to = new THREE.Vector3(side * 0.12, -1, 0).normalize();
      turnWorld(a, new THREE.Quaternion().setFromUnitVectors(from, to));
    }
    this.armsAsModeled = asModeled === 2;
    this.root.updateMatrixWorld(true);
    // Rest turns: the figure's joints now (unposed) and the bones now.
    j.body.updateMatrixWorld(true);
    for (const jn of ORDER) {
      const bone = this.bones[jn];
      if (!bone) continue;
      this.rest.set(jn, {
        joint: (j[jn] as THREE.Object3D).getWorldQuaternion(new THREE.Quaternion()),
        bone: bone.getWorldQuaternion(new THREE.Quaternion()),
      });
    }
    this.hipsRestY = this.bones.pelvis?.position.y ?? 0;
    this.pelvisRestY = j.pelvis.position.y;
    // Anchors: each joint's rest place, carried by its bone.
    const all: THREE.Bone[] = [];
    model.traverse((o) => (o as THREE.Bone).isBone && all.push(o as THREE.Bone));
    const byName = (names: readonly string[]) => all.find((b) => names.includes(normBone(b.name)));
    const pairs: Array<[keyof HeroRig['anchors'], THREE.Object3D, THREE.Bone | undefined]> = [
      ['gripR', j.gripR, byName(HAND_NAMES.handR)],
      ['gripL', j.gripL, byName(HAND_NAMES.handL)],
      ['spine', j.spine, this.bones.spine],
      ['elbowL', j.elbowL, this.bones.elbowL],
      ['pelvis', j.pelvis, this.bones.pelvis],
    ];
    const inv = new THREE.Matrix4();
    for (const [name, joint, bone] of pairs) {
      if (!bone) continue;
      const g = new THREE.Group();
      g.name = `anchor:${name}`;
      inv.copy(bone.matrixWorld).invert().multiply(joint.matrixWorld);
      inv.decompose(g.position, g.quaternion, g.scale);
      bone.add(g);
      this.anchors[name] = g;
    }
    // The clips: idle, walk and run, in place (D155). Rigs without them are posed as before.
    const clips = source.animations ?? [];
    const find = (re: RegExp) => clips.find((c) => re.test(c.name));
    // Soldiers' Meshy rigs stand in a combat stance in place of an idle.
    const idle = find(/idle/i) ?? find(/stance/i);
    const walk = find(/walk/i);
    const run = find(/run/i);
    this.clips = !!(idle && walk && this.mapped >= 11);
    if (this.clips) {
      const mixer = new THREE.AnimationMixer(model);
      for (const [k, c] of [
        ['idle', idle],
        ['walk', walk],
        ['run', run ?? walk],
      ] as const) {
        const a = mixer.clipAction(c!);
        a.setEffectiveWeight(k === 'idle' ? 1 : 0);
        a.play();
        this.gait[k] = a;
      }
      this.mixer = mixer;
    }
  }

  /**
   * Carry the figure's pose over to the bones (call after the figure is posed). With clips
   * (D155) the model walks, runs and stands by its own motion capture, and the game's pose takes
   * over the arms for strikes, skills and work, and the whole body for jumps, dodges, falls,
   * skills, work and riding — eased in and out so nothing snaps.
   */
  drive(h?: DriveInfo): void {
    const j = this.j;
    let wUp = 1;
    let wLow = 1;
    if (this.mixer && h) {
      const dt = Number.isNaN(this.lastT) ? 0 : Math.min(0.1, Math.max(0, h.t - this.lastT));
      this.lastT = h.t;
      const gw = gaitWeights(h.speed);
      const ease = Math.min(1, dt * 10);
      for (const k of ['idle', 'walk', 'run'] as const) {
        const a = this.gait[k]!;
        a.setEffectiveWeight(a.getEffectiveWeight() + (gw[k] - a.getEffectiveWeight()) * (dt ? ease : 1));
      }
      // The feet keep pace with the ground (no skating).
      this.gait.walk!.timeScale = Math.min(1.6, Math.max(0.6, h.speed / GAIT.walk));
      this.gait.run!.timeScale = Math.min(1.5, Math.max(0.7, h.speed / GAIT.run));
      const up = (h.own ? h.own.arms : OWN_ARMS.has(h.state)) || h.mounted ? 1 : 0;
      const low = (h.own ? h.own.body : OWN_BODY.has(h.state)) || h.mounted ? 1 : 0;
      const e2 = Math.min(1, dt * 12);
      this.own.upper += (up - this.own.upper) * (dt ? e2 : 1);
      this.own.lower += (low - this.own.lower) * (dt ? e2 : 1);
      this.mixer.update(dt);
      wUp = this.own.upper;
      wLow = this.own.lower;
    }
    j.body.updateMatrixWorld(true);
    const qj = new THREE.Quaternion();
    const qp = new THREE.Quaternion();
    for (const jn of ORDER) {
      const bone = this.bones[jn];
      const r = this.rest.get(jn);
      if (!bone || !r) continue;
      const w = this.mixer && h ? (UPPER.has(jn) ? wUp : wLow) : 1;
      if (w <= 0.001) {
        bone.updateMatrixWorld(true);
        continue;
      }
      // The joint's turn since rest (in the world), applied to the bone's rest turn.
      (j[jn] as THREE.Object3D).getWorldQuaternion(qj);
      const delta = qj.multiply(r.joint.clone().invert());
      const want = delta.multiply(r.bone);
      const parent = bone.parent!;
      parent.updateMatrixWorld(true);
      parent.getWorldQuaternion(qp);
      const local = qp.invert().multiply(want);
      if (w >= 0.999) bone.quaternion.copy(local);
      else bone.quaternion.slerp(local, w);
      bone.updateMatrixWorld(true);
    }
    // The body's bob, crouch and jump.
    const hips = this.bones.pelvis;
    if (hips) {
      const k = hips.parent ? worldScale(hips.parent) : 1;
      const own = this.hipsRestY + (j.pelvis.position.y - this.pelvisRestY) / Math.max(1e-6, k);
      const w = this.mixer && h ? wLow : 1;
      hips.position.y += (own - hips.position.y) * w;
    }
  }

  /** The clips' weights now (for the tests). */
  gaitNow(): { idle: number; walk: number; run: number; upper: number; lower: number } {
    return {
      idle: this.gait.idle?.getEffectiveWeight() ?? 0,
      walk: this.gait.walk?.getEffectiveWeight() ?? 0,
      run: this.gait.run?.getEffectiveWeight() ?? 0,
      upper: this.own.upper,
      lower: this.own.lower,
    };
  }

  /**
   * Take the figure's arms as they are now (posed at idle) as the arms' rest, so a model whose
   * arms hang as sculpted stands at idle exactly as modelled; strikes and swings still move them.
   */
  calibrateArms(): void {
    this.j.body.updateMatrixWorld(true);
    for (const jn of ['shoulderL', 'shoulderR', 'elbowL', 'elbowR'] as const) {
      const r = this.rest.get(jn);
      if (r) (this.j[jn] as THREE.Object3D).getWorldQuaternion(r.joint);
    }
  }

  /** Where the head is (the sheet's close-up). */
  headWorld(): THREE.Vector3 | null {
    return this.bones.head?.getWorldPosition(new THREE.Vector3()) ?? null;
  }

  /**
   * Free this copy of the model (1.8.0): its toon materials and bone textures. The geometry and
   * colour maps are the loaded model's, shared by every copy, and the ink materials are cached,
   * so those stay.
   */
  dispose(): void {
    this.mixer?.stopAllAction();
    for (const m of this.ownMats) m.dispose();
    this.ownMats.length = 0;
    this.root.traverse(
      (o) => (o as THREE.SkinnedMesh).isSkinnedMesh && (o as THREE.SkinnedMesh).skeleton?.dispose(),
    );
    this.root.removeFromParent();
  }
}

function worldScale(o: THREE.Object3D | null): number {
  if (!o) return 1;
  o.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixScale(o.matrixWorld).x;
}

/** Turn an object by a world-space rotation, keeping its parent. */
function turnWorld(o: THREE.Object3D, q: THREE.Quaternion): void {
  const parent = o.parent!;
  parent.updateMatrixWorld(true);
  const pw = parent.getWorldQuaternion(new THREE.Quaternion());
  const w = o.getWorldQuaternion(new THREE.Quaternion());
  const nw = q.clone().multiply(w);
  o.quaternion.copy(pw.invert().multiply(nw));
  o.updateMatrixWorld(true);
}

type ModelTable = Record<string, string | ModelSpec> | undefined;

/** Where a model file is served (the game's base path, so the phone build finds it too). */
export function modelUrl(file: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}${file}`;
}

/** The phone build has no models/heroes/ or models/real/ (vite.mobile.config.ts PC_ONLY): those kits keep the built-in figure. */
export function phoneModels(models: ModelTable): ModelTable {
  if (!models) return models;
  const out: Record<string, string | ModelSpec> = {};
  for (const [k, m] of Object.entries(models)) {
    if (typeof m === 'object' && m.phone) out[k] = { ...m, file: m.phone };
    else if (!/^models\/(heroes|real)\//.test(typeof m === 'object' ? m.file : m)) out[k] = m;
  }
  return out;
}

/** The model spec for a kit, if the config names one. */
export function specFor(models: ModelTable, kitId: string): ModelSpec | null {
  const m = models?.[kitId];
  return m && typeof m === 'object' ? m : null;
}

/** Load every model the config names (missing files are fine: the built-in figure stays). */
export function preloadModels(models: ModelTable): Promise<void> {
  const all = Object.keys(models ?? {})
    .map((k) => specFor(models, k))
    .filter((m): m is ModelSpec => !!m)
    .map((m) => loadModel(modelUrl(m.file)));
  return Promise.all(all).then(() => undefined);
}

/** The loaded model for a kit, ready for HeroModel (null when there is none). */
export function heroModelFor(
  models: ModelTable,
  kitId: string,
): { source: THREE.Object3D; spec: ModelSpec } | null {
  const spec = specFor(models, kitId);
  if (!spec) return null;
  const source = modelNow(modelUrl(spec.file));
  return source ? { source, spec } : null;
}
