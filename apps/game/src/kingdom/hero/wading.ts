import * as THREE from 'three';

/**
 * PK 2026-10-20 (D156): the 3D hero in water — he stands in it instead of on top of it, and the
 * water answers: rings spread from his legs, running throws drops.
 */

export interface WaterFx {
  sink: number;
  ringSec: number;
  idleRingSec: number;
  splashSec: number;
  splash: number;
  ringSize: number;
}

/**
 * Water depth (m) at a point, smoothed between tile centres so the hero eases in and out of a
 * ford instead of dropping a step at each tile edge. `depthAt` is the sim's per-tile depth.
 */
export function smoothDepth(depthAt: (x: number, z: number) => number, x: number, z: number, tile: number): number {
  const fx = x / tile - 0.5;
  const fz = z / tile - 0.5;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const at = (i: number, k: number) => depthAt((x0 + i + 0.5) * tile, (z0 + k + 0.5) * tile);
  const a = at(0, 0) * (1 - tx) + at(1, 0) * tx;
  const b = at(0, 1) * (1 - tx) + at(1, 1) * tx;
  return Math.max(0, a * (1 - tz) + b * tz);
}

/**
 * How far below the land (y = 0) his feet stand: the water's surface (`waterY`) less `sink` ×
 * the depth, never deeper than the chest; 0 on dry land.
 */
export function wadeDrop(depth: number, waterY: number, chest: number, sink: number): number {
  if (depth <= 0.02) return 0;
  // Ease in from the bank: the first few cm of depth bring him down to the waterline.
  const bank = Math.min(1, depth / 0.15);
  return Math.min(0, bank * (waterY - Math.min(depth, chest) * sink));
}

/** When the next ring and splash are due, by how he moves. */
export function wakeDue(fx: WaterFx, moving: boolean, running: boolean): { ring: number; splash: number } {
  return { ring: moving ? fx.ringSec : fx.idleRingSec, splash: running ? fx.splashSec : Infinity };
}

/** A small pool of rings on the water's surface, growing and fading. */
export class Ripples {
  readonly group = new THREE.Group();
  private readonly rings: Array<{ mesh: THREE.Mesh; age: number; life: number; size: number }> = [];
  private next = 0;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor(count = 14) {
    this.group.name = 'hero-ripples';
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xe8f4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const geo = new THREE.RingGeometry(0.42, 0.5, 40);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, this.mat.clone());
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 0, life: 1, size: 1 });
    }
  }

  /** A new ring at (x, y, z), `size` m across at its widest. */
  spawn(x: number, y: number, z: number, size: number, life = 1.1): void {
    const r = this.rings[this.next]!;
    this.next = (this.next + 1) % this.rings.length;
    r.age = 0;
    r.life = life;
    r.size = size;
    r.mesh.position.set(x, y + 0.02, z);
    r.mesh.visible = true;
  }

  /** How many are showing (tests). */
  get live(): number {
    return this.rings.filter((r) => r.mesh.visible).length;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = 0.4 + (r.size / 1) * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }
  }

  dispose(): void {
    this.rings[0]?.mesh.geometry.dispose();
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
