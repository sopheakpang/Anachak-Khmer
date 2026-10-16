import * as THREE from 'three';

/**
 * Yantra light for the heroes' skills (PK: special magic effects in the style of Khmer yantra,
 * យ័ន្ត). Drawn by the game in the yantra manner — fine line art, an eight-petal lotus round a
 * circle, unalom spirals, rings of Khmer letters, rays and corner grids — but original designs,
 * not copies of real yantra: the letters are the Khmer consonants in their alphabet order, not
 * an incantation. Out of respect a yantra is never put under the feet: it shines in the air,
 * as a halo behind the hero or a canopy over the place the skill touches.
 */

import { artSize, drawArt, type ArtKey, type YantraKind } from './yantraArt';

export type { YantraKind } from './yantraArt';

const cache = new Map<string, THREE.CanvasTexture | null>();
/** Any of the skills' line art (yantraArt.ts) as a white texture, or null without a canvas. */
export function artTexture(key: ArtKey, size = 512): THREE.Texture | null {
  const id = `${key}@${size}`;
  if (cache.has(id)) return cache.get(id)!;
  if (typeof document === 'undefined') {
    cache.set(id, null);
    return null;
  }
  const cv = document.createElement('canvas');
  [cv.width, cv.height] = artSize(key, size);
  const g = cv.getContext('2d');
  if (!g) {
    cache.set(id, null);
    return null;
  }
  drawArt(g, key, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(id, t);
  return t;
}

/** The yantra drawn white on clear (tinted by the material), or null without a canvas. */
export function yantraTexture(kind: YantraKind, size = 512): THREE.Texture | null {
  return artTexture(`yantra:${kind}`, size);
}

/** Which yantra a skill shows. */
export function yantraFor(skill: string): YantraKind {
  return skill === 'heal' ? 'lotus' : skill === 'volley' || skill === 'dog' ? 'grid' : 'spiral';
}

interface Live {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  size: number;
  spin: number;
  rise: number;
  y0: number;
}

/**
 * Shining yantra: a halo that opens behind the hero (facing the camera) and, for skills that
 * touch an area, a canopy over it; both turn slowly, rise a little and fade.
 */
export class YantraFx {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly live: Live[] = [];

  /** How many yantra shine now (for the tests). */
  get shining(): number {
    return this.live.length;
  }

  /**
   * Open a yantra: `kind`, at (x, y, z); `size` its width (m); `flat` lies it over an area
   * (seen from below and above), else it stands as a halo; `color` its light.
   */
  spawn(kind: YantraKind, x: number, y: number, z: number, size: number, color: number, flat = false): void {
    const mat = new THREE.MeshBasicMaterial({
      map: yantraTexture(kind),
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, y, z);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.live.push({
      mesh,
      mat,
      t: 0,
      dur: flat ? 1.8 : 1.4,
      size,
      spin: flat ? 0.6 : 0.35,
      rise: flat ? 0.3 : 0.6,
      y0: y,
    });
  }

  /** Each frame: halos turn to face the camera; all open, turn, rise and fade. */
  update(dt: number, camera: THREE.Camera): void {
    for (const l of this.live) {
      l.t += dt;
      const k = l.t / l.dur;
      // Open fast, hold, fade.
      const open = Math.min(1, k / 0.18);
      l.mat.opacity = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) * 0.95;
      const s = l.size * (0.55 + 0.45 * (1 - Math.pow(1 - open, 3)));
      l.mesh.scale.set(s, s, s);
      l.mesh.position.y = l.y0 + l.rise * k;
      if (l.mesh.rotation.x !== 0) l.mesh.rotation.z += l.spin * dt;
      else {
        l.mesh.quaternion.copy(camera.quaternion);
        l.mesh.rotateZ(l.t * l.spin);
      }
    }
    for (const l of this.live.filter((x) => x.t >= x.dur)) {
      this.group.remove(l.mesh);
      l.mat.dispose();
    }
    for (let i = this.live.length - 1; i >= 0; i--)
      if (this.live[i]!.t >= this.live[i]!.dur) this.live.splice(i, 1);
  }

  clear(): void {
    for (const l of this.live) {
      this.group.remove(l.mesh);
      l.mat.dispose();
    }
    this.live.length = 0;
  }
}
