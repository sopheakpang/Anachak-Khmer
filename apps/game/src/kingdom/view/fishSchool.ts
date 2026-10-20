import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Fish in the water (PK): small schools swim round every fishing spot that has fish, just under
 * the surface, their dark backs showing; now and then one leaps out in an arc and drops back.
 * Only spots near the view are filled. One instanced draw call.
 */

export interface FishSpot {
  x: number;
  z: number;
  /** 0..1: how full the spot is (more fish when full). */
  full: number;
}

const PER_SPOT = 7;
const MAX_SPOTS = 34;
/** Water surface height (scene.ts makeWater). */
const SURFACE = -0.12;

function rand(i: number, k: number): number {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** A little fish along +z: a slim body, darker back, a forked tail. */
export function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 10, 6);
  body.scale(0.07, 0.055, 0.22);
  const tail = new THREE.ConeGeometry(0.07, 0.12, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(0.25, 1, 1);
  tail.translate(0, 0, -0.26);
  const g = mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  // Silver fish with a blue-grey back, bright enough to read on the dark water from above.
  const back = new THREE.Color(0x6f8fa4);
  const belly = new THREE.Color(0xf2f6f4);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(belly).lerp(back, THREE.MathUtils.smoothstep(pos.getY(i), -0.02, 0.03));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** D160: one kind of fish drawn: its shape and how often it swims in a school. */
export interface FishKind {
  geometry: THREE.BufferGeometry;
  weight: number;
}

export class FishSchools {
  /** D160: every kind of fish is its own instanced draw (PK's Blender fish on the PC). */
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private weights: number[] = [1];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.35,
    metalness: 0.1,
    emissive: 0x223038,
    side: THREE.DoubleSide,
  });

  constructor() {
    this.setKinds([{ geometry: fishGeometry(), weight: 1 }]);
  }

  /** The first kind's draw (the built-in fish until the models are in). */
  get mesh(): THREE.InstancedMesh {
    return this.meshes[0]!;
  }

  /**
   * D160 (PK: "ត្រី 3D models"): swim these kinds instead (each fish keeps its kind, picked by
   * the weights from its number).
   */
  setKinds(kinds: readonly FishKind[]): void {
    if (!kinds.length) return;
    for (const m of this.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes = kinds.map((k) => {
      const mesh = new THREE.InstancedMesh(k.geometry, this.material, PER_SPOT * MAX_SPOTS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
    this.weights = kinds.map((k) => k.weight);
  }

  /** Which kind fish number `id` is (fixed, by the weights). */
  kindOf(id: number): number {
    const total = this.weights.reduce((a, b) => a + b, 0);
    let r = rand(id, 11) * total;
    for (let k = 0; k < this.weights.length; k++) {
      r -= this.weights[k]!;
      if (r < 0) return k;
    }
    return this.weights.length - 1;
  }

  /** How many fish swim now (for the tests). */
  get swimming(): number {
    return this.meshes.reduce((a, m) => a + m.count, 0);
  }

  /** Place every fish for time t (s) round the spots given (nearest first). */
  update(spots: readonly FishSpot[], t: number): void {
    const n = this.meshes.map(() => 0);
    spots.slice(0, MAX_SPOTS).forEach((sp, si) => {
      const fish = Math.max(2, Math.round(PER_SPOT * Math.min(1, sp.full)));
      for (let i = 0; i < fish; i++) {
        const id = si * 31 + i;
        const r = 1.2 + rand(id, 1) * 2.6;
        const dir = rand(id, 2) < 0.5 ? 1 : -1;
        const speed = (0.5 + rand(id, 3) * 0.6) * dir;
        const a = rand(id, 4) * Math.PI * 2 + (t * speed) / r;
        const wob = Math.sin(t * 1.3 + id) * 0.35;
        const x = sp.x + Math.cos(a) * (r + wob);
        const z = sp.z + Math.sin(a) * (r + wob);
        // Swimming along the circle: the heading is its tangent; the body sways.
        let heading = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
        heading += Math.sin(t * 9 + id * 2) * 0.12;
        // Just at the surface: the back breaks the water.
        let y = SURFACE - 0.01 - rand(id, 5) * 0.03;
        let pitch = 0;
        // A leap now and then: an arc out of the water, nose up then down.
        const cycle = 7 + rand(id, 6) * 9;
        const ph = (t + rand(id, 7) * cycle) % cycle;
        if (ph < 0.8 && rand(id, 8) < 0.35) {
          const k = ph / 0.8;
          y = SURFACE + Math.sin(k * Math.PI) * 0.9;
          pitch = (0.5 - k) * 1.6;
        }
        const size = 1.8 + rand(id, 9) * 1.0;
        this.q.setFromEuler(this.e.set(-pitch, heading, 0, 'YXZ'));
        this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size, size, size));
        const k = this.kindOf(id);
        this.meshes[k]!.setMatrixAt(n[k]!++, this.m);
      }
    });
    this.meshes.forEach((m, k) => {
      m.count = n[k]!;
      m.instanceMatrix.needsUpdate = true;
    });
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * A fish model (D160, scripts/models/blender/make_fish.py: 1 m long, nose to glTF −z) as the
 * schools' shape: nose to +z like the built-in fish, `length` m long, centred.
 */
export function fishModelGeometry(src: THREE.BufferGeometry, length = 0.5): THREE.BufferGeometry {
  const g = src.clone();
  for (const k of Object.keys(g.attributes))
    if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  g.rotateY(Math.PI);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const k = length / Math.max(1e-6, b.max.z - b.min.z);
  g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);
  g.scale(k, k, k);
  if (!g.getAttribute('color')) {
    const c = new Float32Array(g.getAttribute('position').count * 3).fill(0.75);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}
