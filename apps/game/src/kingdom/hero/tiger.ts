import * as THREE from 'three';
import { ink, toon } from './toon';

/**
 * The tiger of the hero mode's encounter (PK: a tiger in the forest), drawn like the heroes:
 * cel-shaded with ink outlines, a striped orange coat (canvas texture), white belly, muzzle
 * and cheek ruffs, amber eyes, a long striped tail with a black tip. It prowls with a
 * diagonal walking gait, trots faster, and rears and swipes when it attacks. About 30 parts.
 */

let coat: THREE.CanvasTexture | null = null;
/** The coat: orange with wavy black stripes across the body (v runs along it). */
function coatTexture(): THREE.Texture | null {
  if (coat) return coat;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#d97a26';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#1a120c';
  for (let y = 10; y < 250; y += 22) {
    // A stripe goes most of the way round, wavy, thinner at its ends.
    g.beginPath();
    for (let x = 0; x <= 128; x += 4) {
      const w = 4 + 3 * Math.sin((x / 128) * Math.PI);
      g.lineTo(x, y + Math.sin(x * 0.11 + y) * 4 - w / 2);
    }
    for (let x = 128; x >= 0; x -= 4) {
      const w = 4 + 3 * Math.sin((x / 128) * Math.PI);
      g.lineTo(x, y + Math.sin(x * 0.11 + y) * 4 + w / 2);
    }
    g.fill();
  }
  coat = new THREE.CanvasTexture(c);
  coat.colorSpace = THREE.SRGBColorSpace;
  coat.wrapS = coat.wrapT = THREE.RepeatWrapping;
  return coat;
}

const coatMats = new Map<number, THREE.MeshToonMaterial>();
function coatMat(): THREE.Material {
  const base = toon(0xffffff);
  const tex = coatTexture();
  if (!tex) return toon(0xd97a26);
  let m = coatMats.get(0);
  if (!m) {
    m = base.clone();
    m.map = tex;
    coatMats.set(0, m);
  }
  return m;
}

function piece(geo: THREE.BufferGeometry, mat: THREE.Material, outline = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, ink());
    o.raycast = () => undefined;
    m.add(o);
  }
  return m;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T => {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
};
const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 12);
const ball = (r: number) => new THREE.SphereGeometry(r, 14, 10);

export class TigerModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legs: Array<{ hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }> = [];
  private readonly tail: THREE.Group[] = [];
  private stride = 0;

  constructor() {
    const fur = coatMat();
    const white = toon(0xf4ead8);
    const dark = toon(0x1a120c);
    this.group.add(this.body);
    this.body.position.y = 0.82;
    // Torso along +z (the head end), deep at the chest.
    const torso = piece(cap(0.3, 1.0), fur);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1, 1, 0.92);
    this.body.add(torso);
    this.body.add(at(piece(ball(0.34), fur), 0, 0.02, 0.42)); // shoulders
    this.body.add(at(piece(ball(0.3), fur), 0, 0.0, -0.45)); // haunches
    // The white belly, lying along the body (at() sets the rotation too).
    const belly = piece(cap(0.2, 0.95), white, false);
    belly.scale.set(1.15, 1, 0.6);
    this.body.add(at(belly, 0, -0.17, 0, Math.PI / 2));
    // Head: a broad skull, white muzzle and cheek ruffs, amber eyes, round ears.
    this.head.position.set(0, 0.2, 0.86);
    this.body.add(this.head);
    const skull = piece(ball(0.25), fur);
    skull.scale.set(1.05, 0.92, 1.0);
    this.head.add(skull);
    this.head.add(at(piece(ball(0.13), white), 0, -0.08, 0.17));
    for (const s of [-1, 1]) {
      this.head.add(at(piece(ball(0.12), white), s * 0.18, -0.08, 0.04));
      const ear = piece(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), fur);
      this.head.add(at(ear, s * 0.16, 0.2, -0.04, Math.PI / 2 - 0.3, 0, s * 0.3));
      this.head.add(
        at(
          piece(new THREE.CylinderGeometry(0.035, 0.035, 0.045, 10), white, false),
          s * 0.16,
          0.2,
          -0.035,
          Math.PI / 2 - 0.3,
          0,
          s * 0.3,
        ),
      );
      const eye = piece(ball(0.04), toon(0xf0b030, 0x553300), false);
      eye.scale.set(1.2, 0.8, 0.6);
      this.head.add(at(eye, s * 0.1, 0.06, 0.2));
      const pupil = new THREE.Mesh(ball(0.018), dark);
      pupil.scale.set(0.5, 1.4, 0.6);
      this.head.add(at(pupil, s * 0.1, 0.06, 0.225));
    }
    this.head.add(at(piece(new THREE.SphereGeometry(0.04, 8, 6), toon(0x5a2a2a), false), 0, -0.02, 0.29));
    // Legs: shoulders and hips, a jointed knee, a big paw.
    for (const [z, front] of [
      [0.48, true],
      [-0.48, false],
    ] as const)
      for (const side of [-1, 1]) {
        const hip = at(new THREE.Group(), side * 0.19, -0.05, z);
        this.body.add(hip);
        hip.add(at(piece(cap(0.1, 0.3), fur), 0, -0.2, 0));
        const knee = at(new THREE.Group(), 0, -0.4, 0);
        hip.add(knee);
        knee.add(at(piece(cap(0.075, 0.25), fur), 0, -0.15, 0));
        knee.add(at(piece(ball(0.09), white), 0, -0.33, 0.04));
        this.legs.push({ hip, knee, front, side });
      }
    // The tail: five links, striped, a black tip.
    let parent: THREE.Object3D = this.body;
    let pz = -0.72;
    for (let i = 0; i < 5; i++) {
      const link = at(new THREE.Group(), 0, i === 0 ? 0.08 : 0, pz);
      parent.add(link);
      const seg = piece(cap(0.05 - i * 0.004, 0.16), i === 4 ? dark : fur);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -0.1;
      link.add(seg);
      this.tail.push(link);
      parent = link;
      pz = -0.2;
    }
  }

  /**
   * Pose for this frame: `speed` m/s, `dt` s, `attack` 0..1 through a swipe (or -1), `t` s.
   * The gait is a walk (diagonal pairs); faster it becomes a bounding run.
   */
  pose(speed: number, dt: number, attack: number, t: number): void {
    const run = Math.min(1, speed / 6);
    this.stride += dt * (2.2 + speed * 1.4);
    const ph = this.stride;
    for (const l of this.legs) {
      // Walk: diagonal pairs; run: the forelegs together, then the hind legs.
      const off =
        run > 0.6 ? (l.front ? 0 : Math.PI) + (l.side > 0 ? 0.25 : 0) : l.front === l.side > 0 ? 0 : Math.PI;
      const k = Math.min(1, speed / 1.5);
      const sw = Math.sin(ph + off);
      l.hip.rotation.x = sw * (0.45 + run * 0.35) * k;
      l.knee.rotation.x = Math.max(0, -Math.cos(ph + off)) * 0.7 * k;
    }
    this.body.position.y = 0.82 + Math.abs(Math.sin(ph)) * 0.04 * Math.min(1, speed / 2) + run * 0.03;
    this.body.rotation.x = Math.sin(ph * 2) * 0.03 * run;
    // A low, stalking head while it walks; up when it runs.
    this.head.rotation.x = 0.18 - run * 0.15 + Math.sin(t * 1.3) * 0.03;
    this.head.rotation.y = Math.sin(t * 0.7) * 0.15 * (1 - run);
    if (attack >= 0) {
      // Rear up and swipe with a forepaw, the mouth toward the prey.
      const up = Math.sin(Math.min(1, attack) * Math.PI);
      this.body.rotation.x = -0.45 * up;
      this.body.position.y = 0.82 + 0.25 * up;
      this.head.rotation.x = -0.25 * up;
      for (const l of this.legs) {
        if (l.front) {
          l.hip.rotation.x = -1.2 * up + (l.side > 0 ? Math.sin(attack * 12) * 0.4 * up : 0);
          l.knee.rotation.x = 0.6 * up;
        } else l.hip.rotation.x = 0.4 * up;
      }
    }
    this.tail.forEach((s, i) => {
      s.rotation.x = (i === 0 ? 0.6 : -0.15) + Math.sin(t * 2 - i * 0.6) * 0.05;
      s.rotation.y = Math.sin(t * 1.6 - i * 0.7) * (0.18 + run * 0.1);
    });
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
