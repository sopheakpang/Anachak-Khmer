import * as THREE from 'three';
import type { Particles } from '../view/vfx';
import { artTexture } from './yantra';
import { TALL } from './yantraArt';
import type { VfxPiece } from './skillVfx';

/**
 * PK 1.9.0 (D151): plays the skills' effects planned by `planSkillVfx` — additive light cards,
 * rings, pillars of script, a bell of light, streaks. Everything is short-lived, shares one card
 * geometry and is capped at `maxLive` pieces (the oldest go first), so it fits the frame budget.
 */

interface Live {
  p: VfxPiece;
  obj: THREE.Object3D | null;
  mat: THREE.MeshBasicMaterial | null;
  t: number;
}

const card = new THREE.PlaneGeometry(1, 1);
const tallCard = new THREE.PlaneGeometry(0.25, 1);
const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0);
const domeGeo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
for (const g of [card, tallCard, ringGeo, pillarGeo, domeGeo]) g.userData.shared = true;

function lightMat(color: number, map: THREE.Texture | null): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

export class SkillFx {
  readonly group = new THREE.Group();
  private live: Live[] = [];
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly particles: () => Particles,
    private readonly maxLive: number,
  ) {
    this.group.name = 'skillFx';
  }

  /** How many pieces are playing or waiting (for the tests). */
  get count(): number {
    return this.live.length;
  }

  play(pieces: readonly VfxPiece[]): void {
    for (const p of pieces) this.live.push({ p, obj: null, mat: null, t: 0 });
    while (this.live.length > this.maxLive) this.drop(this.live.shift()!);
  }

  private make(l: Live): void {
    const p = l.p;
    if (p.t === 'burst') return;
    let obj: THREE.Mesh;
    if (p.t === 'sprite') {
      const mat = lightMat(p.color, artTexture(p.art));
      obj = new THREE.Mesh(TALL.has(p.art) ? tallCard : card, mat);
      obj.position.set(p.x, p.y, p.z);
      // Lying level, the crescent's bulge (the canvas top) toward its way `rot`.
      if (p.face === 'flat') obj.rotation.set(-Math.PI / 2, p.rot + Math.PI, 0, 'YXZ');
      l.mat = mat;
    } else if (p.t === 'ring') {
      l.mat = lightMat(p.color, null);
      obj = new THREE.Mesh(ringGeo, l.mat);
      obj.rotation.x = -Math.PI / 2;
      obj.position.set(p.x, p.y, p.z);
    } else if (p.t === 'pillar') {
      const tex = artTexture('rows');
      l.mat = lightMat(p.color, tex);
      obj = new THREE.Mesh(pillarGeo, l.mat);
      obj.position.set(p.x, 0.05, p.z);
      obj.scale.set(p.r, 0.01, p.r);
    } else if (p.t === 'dome') {
      l.mat = lightMat(p.color, artTexture('yantra:sun'));
      obj = new THREE.Mesh(domeGeo, l.mat);
      obj.position.set(p.x, 0.05, p.z);
      obj.scale.setScalar(p.r * 0.6);
    } else {
      l.mat = lightMat(p.color, artTexture('streak'));
      obj = new THREE.Mesh(card, l.mat);
      const [ax, az] = p.from;
      const [bx, bz] = p.to;
      const len = Math.max(0.5, Math.hypot(bx - ax, bz - az));
      obj.position.set((ax + bx) / 2, p.y, (az + bz) / 2);
      // Lie it level along the way.
      obj.rotation.set(-Math.PI / 2, Math.atan2(bx - ax, bz - az), 0, 'YXZ');
      obj.scale.set(p.width, len, 1);
    }
    obj.renderOrder = 7;
    obj.frustumCulled = false;
    this.group.add(obj);
    l.obj = obj;
  }

  /** Each frame. */
  update(dt: number, camera: THREE.Camera): void {
    for (const l of this.live) {
      const p = l.p;
      l.t += dt;
      const t = l.t - p.delay;
      if (t < 0) continue;
      if (p.t === 'burst') {
        if (!l.obj) {
          this.particles().burst(p.kind, p.x, p.y, p.z, p.n, { ring: p.ring });
          l.obj = this.group; // played
        }
        continue;
      }
      if (!l.obj) this.make(l);
      const k = Math.min(1, t / p.dur);
      const o = l.obj!;
      const m = l.mat!;
      // Fade in fast, out over the last 40 %.
      const fade = Math.min(1, k / 0.12) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      if (p.t === 'sprite') {
        m.opacity = fade;
        const s = p.size * (1 + (p.grow - 1) * k);
        o.scale.set(s, TALL.has(p.art) ? s * 4 : s, s);
        if (p.orbit) {
          const a = p.orbit.a0 + p.orbit.w * t;
          // The wheel opens out as it turns.
          const r = p.orbit.r * (0.6 + 0.6 * k);
          o.position.set(p.orbit.cx + Math.sin(a) * r, p.y, p.orbit.cz + Math.cos(a) * r);
        } else o.position.set(p.x + p.vx * t, p.y + p.vy * t, p.z + p.vz * t);
        if (p.face === 'camera') {
          o.quaternion.copy(camera.quaternion);
          if (p.spin) o.rotateZ(p.spin * t);
        } else if (p.face === 'up') {
          // Upright, point down, turned about the vertical toward the camera.
          camera.getWorldPosition(this.v);
          o.rotation.set(0, Math.atan2(this.v.x - o.position.x, this.v.z - o.position.z), 0, 'YXZ');
        }
      } else if (p.t === 'ring') {
        const r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 2));
        o.scale.set(r, r, r);
        m.opacity = (1 - k) * 0.9;
      } else if (p.t === 'pillar') {
        const rise = Math.min(1, k / 0.35);
        o.scale.set(p.r, p.h * (1 - Math.pow(1 - rise, 3)), p.r);
        o.rotation.y += dt * 1.2;
        m.opacity = fade * 0.85;
      } else if (p.t === 'dome') {
        o.scale.setScalar(p.r * (0.6 + 0.4 * Math.min(1, k / 0.2)));
        o.rotation.y += dt * 0.5;
        m.opacity = fade * 0.55;
      } else {
        m.opacity = fade;
      }
    }
    const done = (l: Live): boolean => (l.p.t === 'burst' ? l.obj !== null : l.t - l.p.delay >= l.p.dur);
    for (const l of this.live) if (done(l)) this.drop(l);
    this.live = this.live.filter((l) => !done(l));
  }

  private drop(l: Live): void {
    if (l.obj && l.obj !== this.group) this.group.remove(l.obj);
    l.mat?.dispose();
    l.mat = null;
  }

  clear(): void {
    for (const l of this.live) this.drop(l);
    this.live = [];
  }
}
