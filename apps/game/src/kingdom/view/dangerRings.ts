import * as THREE from 'three';
import type { DangerZone } from '../sim/danger';
import { disposeNode } from '../../engine/dispose';

/**
 * PK 1.9.0 (D146 ខ៦): red rings on the ground round each danger (sim/danger.ts). One instanced
 * draw for the edges and one for a faint fill, both pulsing; no shadows, no depth writes.
 */
export class DangerRings {
  readonly group = new THREE.Group();
  private readonly edge: THREE.InstancedMesh;
  private readonly fill: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly edgeMat: THREE.MeshBasicMaterial;
  private readonly fillMat: THREE.MeshBasicMaterial;

  constructor(readonly max: number) {
    this.edgeMat = new THREE.MeshBasicMaterial({
      color: 0xff2a1a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0xd0140a,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Unit radius: a band 6 % wide at the edge, and the disc inside it.
    this.edge = new THREE.InstancedMesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), this.edgeMat, max);
    this.fill = new THREE.InstancedMesh(new THREE.CircleGeometry(0.94, 48).rotateX(-Math.PI / 2), this.fillMat, max);
    for (const mesh of [this.edge, this.fill]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
    this.group.name = 'danger-rings';
  }

  /** Draw these zones (already chosen and capped), lifted `lift` m over the ground. */
  update(zones: DangerZone[], groundY: (x: number, z: number) => number, t: number, lift = 0.15): void {
    const n = Math.min(this.max, zones.length);
    for (let i = 0; i < n; i++) {
      const zn = zones[i]!;
      // A raider's ring breathes faster than a beast's; a camp's is steady.
      const beat = zn.kind === 'camp' ? 1 : 1 + 0.04 * Math.sin(t * (zn.kind === 'raid' ? 6 : 3.5) + zn.id);
      const r = zn.r * beat;
      this.m.makeScale(r, 1, r);
      this.m.setPosition(zn.x, groundY(zn.x, zn.z) + lift, zn.z);
      this.edge.setMatrixAt(i, this.m);
      this.fill.setMatrixAt(i, this.m);
    }
    this.edge.count = n;
    this.fill.count = n;
    this.edge.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    this.edgeMat.opacity = 0.65 + 0.25 * Math.sin(t * 4);
    this.group.visible = n > 0;
  }

  hide(): void {
    this.edge.count = 0;
    this.fill.count = 0;
    this.group.visible = false;
  }

  dispose(): void {
    disposeNode(this.group);
  }
}
