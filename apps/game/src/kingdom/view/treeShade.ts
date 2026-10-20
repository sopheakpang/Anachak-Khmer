import * as THREE from 'three';

/**
 * PK 2026-10-20 (D166, "fixed forest trees and grass shade effect"): where there are no real
 * shadows (the phone), a soft round shade is painted on the ground under every tree — one flat
 * disc a tree, all in one instanced mesh, so a whole forest costs one draw call and 2 triangles a
 * tree. The trees stand still there (no wind), so the shade never has to move with them.
 * Settings: config/quality.json `kingdom.shade` (strength 0-1, size × the crown's half-width,
 * minHeight m = smaller plants get none, color = the shade's colour).
 */
export interface ShadeCfg {
  strength: number;
  size: number;
  minHeight: number;
  color: string;
}

/** The shade's opacity across the disc: dark in the middle, fading to nothing at the edge. */
export function shadeAlpha(r: number, strength: number): number {
  if (r >= 1) return 0;
  const k = 1 - r * r;
  return strength * k * k;
}

/** The disc's picture: `px` × `px` RGBA, the shade colour with the falloff in alpha. */
export function shadePixels(px: number, strength: number, color: readonly [number, number, number]): Uint8Array {
  const out = new Uint8Array(px * px * 4);
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const dx = ((x + 0.5) / px) * 2 - 1;
      const dy = ((y + 0.5) / px) * 2 - 1;
      const i = (y * px + x) * 4;
      out[i] = color[0];
      out[i + 1] = color[1];
      out[i + 2] = color[2];
      out[i + 3] = Math.round(255 * shadeAlpha(Math.hypot(dx, dy), strength));
    }
  return out;
}

/** The shade a tree throws: its radius (m) from the crown's width, or none for small plants. */
export function shadeRadius(height: number, width: number, cfg: ShadeCfg): number {
  return height < cfg.minHeight ? 0 : (width / 2) * cfg.size;
}

export class TreeShade {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    readonly cfg: ShadeCfg,
    capacity: number,
  ) {
    const c = new THREE.Color(cfg.color);
    const px = 32;
    const tex = new THREE.DataTexture(
      shadePixels(px, cfg.strength, [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]),
      px,
      px,
      THREE.RGBAFormat,
    );
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    // After the ground's own see-through layers (worn paths, ground detail), which would cover it.
    this.mesh.renderOrder = 2;
    this.mesh.name = 'treeShade';
  }

  begin(): void {
    this.n = 0;
  }

  /** One tree's shade, `r` m round its foot at (x, y, z). */
  add(x: number, y: number, z: number, r: number): void {
    if (r <= 0 || this.n >= this.mesh.instanceMatrix.count) return;
    this.m.compose(this.p.set(x, y + 0.06, z), this.q, this.s.set(r, r, 1));
    this.mesh.setMatrixAt(this.n++, this.m);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
