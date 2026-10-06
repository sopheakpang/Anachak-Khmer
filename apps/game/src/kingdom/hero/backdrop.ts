import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The hero mode's painted distance (PK's reference image: green mountains fading into blue
 * haze behind the rice fields, motes of light drifting in the air). Two rings of low peaks far
 * beyond the haze, drawn without fog in their own aerial colours, and a cloud of glowing motes
 * round the hero. Two draw calls together, about 1,000 triangles.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One ring of peaks at radius r: colours from the foot to the summit. */
function ring(
  r: number,
  n: number,
  h: [number, number],
  foot: number,
  top: number,
  seed: number,
): THREE.BufferGeometry {
  const rand = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const cf = new THREE.Color(foot);
  const ct = new THREE.Color(top);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2;
    const height = h[0] + rand() * (h[1] - h[0]);
    const base = height * (1.3 + rand() * 0.9);
    const g = new THREE.ConeGeometry(base, height, 6 + Math.floor(rand() * 3), 2).toNonIndexed();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v) + height / 2;
      // A craggy summit: inner rings jitter.
      if (y > 0.01 && y < height - 0.01) {
        pos.setX(v, pos.getX(v) * (0.85 + rand() * 0.3));
        pos.setZ(v, pos.getZ(v) * (0.85 + rand() * 0.3));
      }
      // Clamped both ways: a foot vertex can sit a hair below 0, and pow() of that is NaN
      // (drawn as black triangles across the sky).
      const k = Math.min(1, Math.max(0, y / height));
      const c = cf.clone().lerp(ct, Math.pow(k, 0.8));
      col.set([c.r, c.g, c.b], v * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.translate(Math.sin(a) * r, height / 2 - 6, Math.cos(a) * r);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

export class Backdrop {
  readonly group = new THREE.Group();
  private readonly motes: THREE.Points;
  private readonly seeds: Float32Array;
  private readonly box = { w: 46, h: 7 };

  constructor() {
    const near = ring(420, 22, [55, 120], 0x4f7f62, 0x9cc7a4, 7);
    const far = ring(700, 26, [110, 230], 0x7ea6c4, 0xd2e6f2, 11);
    const geo = mergeGeometries([far, near])!;
    const hills = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: true }),
    );
    hills.frustumCulled = false;
    hills.renderOrder = -5;
    this.group.add(hills);
    // Motes of light (fireflies by the paddies, pollen in the sun).
    const n = 180;
    const pos = new Float32Array(n * 3);
    this.seeds = new Float32Array(n * 3);
    const r = rng(3);
    for (let i = 0; i < n; i++) {
      this.seeds.set([r() * this.box.w, r() * this.box.h, r() * this.box.w], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xfff1b0,
        size: 0.22,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.group.visible = false;
  }

  /** Night (0..1): the hills go dark blue, the motes become fireflies (brighter, greener). */
  setNight(n: number): void {
    const hills = (this.group.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    hills.color.setRGB(1 - 0.82 * n, 1 - 0.78 * n, 1 - 0.62 * n);
    const motes = this.motes.material as THREE.PointsMaterial;
    motes.color.setHex(n > 0.5 ? 0xd8ff8a : 0xfff1b0);
    this.nightK = n;
  }
  private nightK = 0;

  /** Follow the camera (the hills) and the hero (the motes); the motes drift and twinkle. */
  update(eyeX: number, eyeZ: number, heroX: number, heroZ: number, t: number): void {
    this.group.children[0]!.position.set(eyeX, 0, eyeZ);
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const { w, h } = this.box;
    for (let i = 0; i < pos.count; i++) {
      const sx = this.seeds[i * 3]!;
      const sy = this.seeds[i * 3 + 1]!;
      const sz = this.seeds[i * 3 + 2]!;
      // Wrap round the hero so the cloud never runs out.
      const x = ((((sx + Math.sin(t * 0.3 + i) * 1.5 - heroX) % w) + w) % w) - w / 2;
      const z = ((((sz + Math.cos(t * 0.25 + i * 1.3) * 1.5 - heroZ) % w) + w) % w) - w / 2;
      const y = 0.4 + ((sy + t * 0.25) % h);
      pos.setXYZ(i, heroX + x, y, heroZ + z);
    }
    pos.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).opacity =
      (0.55 + Math.sin(t * 2.3) * 0.25) * (1 + this.nightK * 0.6);
  }

  dispose(): void {
    for (const c of this.group.children) {
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
