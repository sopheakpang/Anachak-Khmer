/**
 * Work you can see (PK 1.7.0): people cross water in a dugout boat (ទូក) and paddle it;
 * woodcutters bring their tree down with the last cut and leave a stump. (The arm motions
 * are in the figures' shader: ACT.chop, ACT.fish, ACT.row.)
 */
import * as THREE from 'three';
import { paddleSwing } from '../../engine/figures';

/**
 * A dugout boat, 3.4 m long along +z (the way its rower faces): a half-pipe hull narrowing to
 * pointed, slightly raised ends, dark inside, with a thwart across the middle.
 */
export function boatGeometry(): THREE.BufferGeometry {
  const L = 3.4;
  const hull = new THREE.CylinderGeometry(0.42, 0.42, L, 12, 8, true, Math.PI / 2, Math.PI);
  // The pipe runs along y: lay it along z, open side up.
  hull.rotateX(Math.PI / 2);
  hull.rotateZ(Math.PI);
  const p = hull.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const e = Math.abs(z) / (L / 2); // 0 middle … 1 ends
    const narrow = 1 - 0.85 * e * e;
    p.setX(i, p.getX(i) * narrow);
    // Bow and stern rise a little; the hull floats with its rim 0.25 m above the water.
    p.setY(i, p.getY(i) * (0.55 + 0.45 * narrow) + 0.25 + 0.12 * e * e * e);
  }
  hull.computeVertexNormals();
  const thwart = new THREE.BoxGeometry(0.7, 0.05, 0.16).translate(0, 0.2, -0.5);
  const parts: Array<[THREE.BufferGeometry, number]> = [
    [hull, 0x7a4f2e],
    [thwart, 0x9b6a3e],
  ];
  return paint(parts, true);
}

/** A paddle, 1.6 m: a pole and a leaf-shaped blade at the lower end (pivot at the top hand). */
export function paddleGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5).translate(0, -0.65, 0);
  const blade = new THREE.SphereGeometry(0.16, 6, 4).scale(0.55, 1.4, 0.12).translate(0, -1.4, 0);
  return paint(
    [
      [pole, 0xa57a48],
      [blade, 0x8a5e34],
    ],
    false,
  );
}

function paint(parts: Array<[THREE.BufferGeometry, number]>, doubleSide: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    c.set(hex);
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    if (doubleSide) {
      // The inside of the hull: the same faces turned round, darker.
      for (let i = 0; i < P.count; i += 3)
        for (const j of [i + 2, i + 1, i]) {
          pos.push(P.getX(j), P.getY(j), P.getZ(j));
          nor.push(-N.getX(j), -N.getY(j), -N.getZ(j));
          col.push(c.r * 0.55, c.g * 0.5, c.b * 0.45);
        }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/**
 * Where a rower's paddle is: held at the chest on his right, swinging fore and aft in time
 * with the stroke (paddleSwing), the blade dipping out from the hull.
 */
export function paddleMatrix(
  m: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  heading: number,
  t: number,
): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(paddleSwing(t), heading, -0.35, 'YXZ'));
  const side = new THREE.Vector3(0.34, 1.05, 0.15).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
  return m.compose(new THREE.Vector3(x + side.x, y + side.y, z + side.z), q, new THREE.Vector3(1, 1, 1));
}

interface Fall {
  x: number;
  z: number;
  dir: number;
  t0: number;
  scale: number;
}

/** How far a felled tree has tipped (radians) s seconds after the last cut: slow, then fast. */
export function fallAngle(s: number, sec = 1.4): number {
  const k = Math.min(1, Math.max(0, s / sec));
  return (Math.PI / 2) * k * k * k;
}

/**
 * Felled trees: the tree tips over away from the woodcutter (1.4 s), lies a while, then is
 * gone (hauled off as timber); a stump stays where it stood.
 */
export class FallenTrees {
  readonly group = new THREE.Group();
  private readonly trees: THREE.InstancedMesh;
  private readonly stumps: THREE.InstancedMesh;
  private readonly falls: Fall[] = [];
  private readonly stumpsAt: Array<{ x: number; z: number; t0: number }> = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    treeGeometry: THREE.BufferGeometry,
    material: THREE.Material,
    /** How long a fallen trunk lies, and a stump stays (s). */
    private readonly lieSec = 6,
    private readonly stumpSec = 240,
  ) {
    this.trees = new THREE.InstancedMesh(treeGeometry, material, 16);
    const stump = new THREE.CylinderGeometry(0.28, 0.36, 0.38, 7).translate(0, 0.19, 0);
    const top = new THREE.CylinderGeometry(0.27, 0.27, 0.02, 7).translate(0, 0.385, 0);
    this.stumps = new THREE.InstancedMesh(
      paint(
        [
          [stump, 0x6b4a2e],
          [top, 0xd9b77e],
        ],
        false,
      ),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      64,
    );
    for (const m of [this.trees, this.stumps]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  /** Follow the living trees' shape (it changes when PK's model loads). */
  setTree(geometry: THREE.BufferGeometry, material: THREE.Material): void {
    if (this.trees.geometry !== geometry) this.trees.geometry = geometry;
    if (this.trees.material !== material) this.trees.material = material;
  }

  fell(x: number, z: number, dir: number, t: number, scale = 1): void {
    if (this.falls.length >= this.trees.instanceMatrix.count) this.falls.shift();
    this.falls.push({ x, z, dir, t0: t, scale });
    if (this.stumpsAt.length >= this.stumps.instanceMatrix.count) this.stumpsAt.shift();
    this.stumpsAt.push({ x, z, t0: t });
  }

  /** How many trees are falling or lying now (for the tests). */
  get falling(): number {
    return this.falls.length;
  }

  update(t: number): void {
    for (let i = this.falls.length - 1; i >= 0; i--)
      if (t - this.falls[i]!.t0 > 1.4 + this.lieSec + 1) this.falls.splice(i, 1);
    for (let i = this.stumpsAt.length - 1; i >= 0; i--)
      if (t - this.stumpsAt[i]!.t0 > this.stumpSec) this.stumpsAt.splice(i, 1);
    this.falls.forEach((f, i) => {
      const s = t - f.t0;
      const tip = fallAngle(s);
      // Gone into the ground at the end (the trunk is carried away as timber).
      const sink = Math.max(0, s - 1.4 - this.lieSec);
      // Tip over away from the woodcutter: the tree's up axis turns toward the heading.
      this.q.setFromEuler(this.e.set(tip, f.dir, 0, 'YXZ'));
      this.m.compose(this.v.set(f.x, -sink * 1.2, f.z), this.q, this.s.setScalar(f.scale));
      this.trees.setMatrixAt(i, this.m);
    });
    this.trees.count = this.falls.length;
    this.trees.instanceMatrix.needsUpdate = true;
    this.stumpsAt.forEach((st, i) => {
      this.m.makeRotationY(st.x * 1.3 + st.z);
      this.m.setPosition(st.x, 0, st.z);
      this.stumps.setMatrixAt(i, this.m);
    });
    this.stumps.count = this.stumpsAt.length;
    this.stumps.instanceMatrix.needsUpdate = true;
  }
}
