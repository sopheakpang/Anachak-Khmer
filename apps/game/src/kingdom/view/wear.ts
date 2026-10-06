/**
 * The ground follows life (PK 1.7.0, after his reference of a living settlement): grass
 * gives way to bare brown earth where people live and work, and every walk wears it a
 * little, so paths appear between the houses, the store, the fields and the forest by
 * themselves. Where nobody goes any more, the grass grows back.
 *
 * One value per map tile (0 grass … 1 bare earth), kept in a texture the ground shader
 * reads. Numbers: config/kingdom/diorama.json → ground.
 */
import * as THREE from 'three';
import type { Diorama } from '@temples/shared';

export type GroundCfg = Diorama['ground'];

/** What the wear map needs to know about the world (a slice of the sim). */
export interface WearWorld {
  size: number;
  buildings: Iterable<{ type: string; tx: number; tz: number; w: number; d: number; team: number }>;
  /** Tile of each person on land, and whether they are at work (not walking). */
  walkers: Iterable<{ tx: number; tz: number; working: boolean }>;
}

export class WearMap {
  readonly n: number;
  readonly data: Float32Array;
  /** Tiles kept as earth by a building's yard (never grow back while it stands). */
  private yard: Uint8Array;
  readonly texture: THREE.DataTexture;
  private bytes: Uint8Array;
  private dirty = true;
  private sinceRegrow = 0;

  constructor(
    size: number,
    readonly cfg: GroundCfg,
  ) {
    this.n = size;
    this.data = new Float32Array(size * size);
    this.yard = new Uint8Array(size * size);
    this.bytes = new Uint8Array(size * size);
    this.texture = new THREE.DataTexture(this.bytes, size, size, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** Earth round every building (fields keep their own look: no yard). */
  setBuildings(buildings: WearWorld['buildings']): void {
    const n = this.n;
    this.yard.fill(0);
    const r = this.cfg.yardTiles;
    for (const b of buildings) {
      if (b.type === 'riceField') continue;
      for (let z = b.tz - r; z < b.tz + b.d + r; z++)
        for (let x = b.tx - r; x < b.tx + b.w + r; x++) {
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          // The yard thins out at its edge, so the earth meets the grass raggedly.
          const edge = Math.max(b.tx - x, x - (b.tx + b.w - 1), b.tz - z, z - (b.tz + b.d - 1), 0);
          const k = 1 - edge / (r + 1);
          const j = z * n + x;
          const v = Math.round(255 * k);
          if (v > this.yard[j]!) this.yard[j] = v;
        }
    }
    this.dirty = true;
  }

  /** Feet wear the grass; `dt` seconds of the world passed. Grass grows back every 10 s. */
  step(walkers: WearWorld['walkers'], dt: number): void {
    const n = this.n;
    const C = this.cfg;
    for (const w of walkers) {
      if (w.tx < 0 || w.tz < 0 || w.tx >= n || w.tz >= n) continue;
      const add = (w.working ? C.workWear : C.walkWear) * dt;
      const j = w.tz * n + w.tx;
      this.data[j] = Math.min(1, this.data[j]! + add);
      // A little on the tiles beside it, so a path is one joined band, not footprints.
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = w.tx + dx;
        const z = w.tz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const k = z * n + x;
        this.data[k] = Math.min(1, this.data[k]! + add * 0.35);
      }
      this.dirty = true;
    }
    this.sinceRegrow += dt;
    if (this.sinceRegrow >= 10) {
      const g = C.regrow * (this.sinceRegrow / 10);
      this.sinceRegrow = 0;
      for (let j = 0; j < this.data.length; j++) if (this.data[j]! > 0) this.data[j] = Math.max(0, this.data[j]! - g);
      this.dirty = true;
    }
  }

  /** How bare a tile is now (0 grass … 1 earth): worn by feet or kept by a yard. */
  at(tx: number, tz: number): number {
    if (tx < 0 || tz < 0 || tx >= this.n || tz >= this.n) return 0;
    const j = tz * this.n + tx;
    return Math.max(this.data[j]!, this.yard[j]! / 255);
  }

  /** Send the changes to the ground shader (call at most a few times a second). */
  upload(): boolean {
    if (!this.dirty) return false;
    this.dirty = false;
    for (let j = 0; j < this.bytes.length; j++)
      this.bytes[j] = Math.max(this.yard[j]!, Math.round(Math.min(1, this.data[j]!) * 255));
    this.texture.needsUpdate = true;
    return true;
  }
}
