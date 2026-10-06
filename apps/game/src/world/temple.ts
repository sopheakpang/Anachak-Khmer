import * as THREE from 'three';
import { zebuGeometry } from '../engine/animals';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { filledSlots, type BigPiece, type Slot, type SlotRef, type TempleKit } from '@temples/shared';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { textures } from '../engine/textures';
import { shadows, soft, seg as lpSeg } from '../engine/look';
import { NameAtlas, NamePlates, type PlateSpec } from './nameplates';
import { TempleOrnaments } from './ornaments';
import { currentLook } from '../engine/look';
import type { CarvedName } from '../logic/store';

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Flyer {
  slot: Slot | BigPiece;
  big: boolean;
  start: number;
  dur: number;
  hoist: boolean;
}

/**
 * A temple built from its kit (prompts 09–10). Every block of a material is one
 * InstancedMesh, so the whole temple is a handful of draw calls. Blocks appear as
 * progress fills them; newly filled blocks drop (small/medium) or are hoisted with a
 * rope (large/huge). Carved names sit on the blocks' front faces.
 */
export class TempleView {
  readonly group = new THREE.Group();
  private readonly meshes: Record<'brick' | 'laterite' | 'sandstone', THREE.InstancedMesh>;
  private readonly indexIn: Array<{ mat: 'brick' | 'laterite' | 'sandstone'; i: number }> = [];
  private readonly bigMeshes: THREE.Mesh[] = [];
  private shownNormal = 0;
  private targetNormal = 0;
  private bigShown = new Set<number>();
  private flyers: Flyer[] = [];
  private readonly flyerMesh: THREE.InstancedMesh;
  private readonly rope: THREE.LineSegments;
  readonly plates: NamePlates;
  private names = new Map<string, CarvedName>();
  private platesDirty = true;
  private readonly m = new THREE.Matrix4();

  constructor(
    readonly kit: TempleKit,
    atlasFont: (px: number) => string,
    private readonly maxPlates: number,
  ) {
    const tx = textures();
    // Soft rounded edges catch the light like hand-cut stone (D25).
    const unit = new RoundedBoxGeometry(1, 1, 1, 1, 0.08);
    unit.translate(0, 0.5, 0); // origin at the bottom face
    const count = { brick: 0, laterite: 0, sandstone: 0 };
    for (const s of kit.slots) count[s.material]++;
    const mk = (mat: THREE.Material, n: number) => {
      const im = new THREE.InstancedMesh(unit, mat, Math.max(1, n));
      im.frustumCulled = false;
      const c = new THREE.Color();
      for (let i = 0; i < im.count; i++) {
        im.setMatrixAt(i, HIDDEN);
        // Every stone a slightly different shade.
        const k = 0.86 + ((i * 0.618) % 1) * 0.22;
        im.setColorAt(i, c.setRGB(k, k * (0.97 + ((i * 0.37) % 1) * 0.05), k * 0.97));
      }
      shadows(im, true, true);
      im.count = 0;
      this.group.add(im);
      return im;
    };
    this.meshes = {
      brick: mk(soft({ map: tx.brick, roughness: 0.92 }, 0.12), count.brick),
      laterite: mk(soft({ map: tx.laterite, roughness: 0.95 }, 0.12), count.laterite),
      sandstone: mk(soft({ map: tx.sandstoneGold, roughness: 0.85 }, 0.15), count.sandstone),
    };
    const next = { brick: 0, laterite: 0, sandstone: 0 };
    for (const s of kit.slots) this.indexIn.push({ mat: s.material, i: next[s.material]++ });

    // Big carved pieces: simple shapes, hidden until a Large/Huge stone claims them.
    const gold = soft({ map: tx.sandstoneGold, color: 0xd8b582, roughness: 0.7 }, 0.25);
    for (const b of kit.bigPieces) {
      const mesh = shadows(new THREE.Mesh(bigGeometry(b), gold), true, true);
      mesh.position.set(b.x, b.y, b.z);
      mesh.visible = false;
      this.group.add(mesh);
      this.bigMeshes.push(mesh);
    }

    const flyGeo = unit.clone();
    this.flyerMesh = new THREE.InstancedMesh(flyGeo, soft({ map: tx.sandstoneFresh }, 0.2), 24);
    shadows(this.flyerMesh, true, false);
    this.flyerMesh.count = 0;
    this.flyerMesh.frustumCulled = false;
    this.group.add(this.flyerMesh);

    const ropeGeo = new THREE.BufferGeometry();
    ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(24 * 6).fill(0), 3));
    this.rope = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: 0x5a4028 }));
    this.rope.frustumCulled = false;
    this.group.add(this.rope);

    this.plates = new NamePlates(new NameAtlas(atlasFont));

    // Architectural detail (pilasters, cornices, false doors, guardians, lions…).
    this.ornaments = new TempleOrnaments(
      kit,
      gold,
      this.meshes.brick.material as THREE.Material,
      currentLook().shadows,
    );
    this.group.add(this.ornaments.group);
    this.platformSlots = kit.slots.filter((s) => s.y < 1 - 1e-6).length;
    this.group.add(this.plates.mesh);
  }

  /** Jump straight to a progress (on connect, or when many stones arrive at once). */
  setProgress(target: number, progress: number): void {
    this.targetNormal = filledSlots(this.kit, target, progress);
    if (this.targetNormal < this.shownNormal) {
      for (let i = this.shownNormal - 1; i >= this.targetNormal; i--) this.hide(i);
      this.shownNormal = this.targetNormal;
      this.platesDirty = true;
    }
  }

  /** Show filled blocks instantly (no animation), e.g. after (re)connecting. */
  snap(): void {
    for (let i = this.shownNormal; i < this.targetNormal; i++) this.show(i);
    this.shownNormal = this.targetNormal;
    this.flyers = [];
    this.platesDirty = true;
  }

  setNames(names: Map<string, CarvedName>): void {
    this.names = names;
    for (const [key] of names) {
      const [kind, idx] = key.split(':');
      if (kind === 'big') this.showBig(Number(idx), false, 0);
    }
    this.platesDirty = true;
  }

  /** A stone arrived with a slot: animate it into place. */
  place(slot: SlotRef | null, tier: string, now: number): void {
    if (slot?.kind === 'big') {
      this.showBig(slot.index, true, now);
      return;
    }
    const hoist = tier === 'large' || tier === 'huge';
    // Newly filled blocks fly in; if many arrive at once, only the last few animate.
    const from = Math.max(this.shownNormal, this.targetNormal - 12);
    for (let i = this.shownNormal; i < from; i++) this.show(i);
    for (let i = from; i < this.targetNormal; i++) {
      this.flyers.push({
        slot: this.kit.slots[i]!,
        big: false,
        start: now + (i - from) * 90,
        dur: hoist ? 1800 : 900,
        hoist,
      });
    }
    this.shownNormal = this.targetNormal;
  }

  /** World position (temple-local) of a slot's front face, for cameras and PiP. */
  slotFront(ref: SlotRef | null): THREE.Vector3 {
    if (!ref) return new THREE.Vector3(0, this.kit.size.h * 0.4, this.kit.size.d / 2);
    const s = ref.kind === 'big' ? this.kit.bigPieces[ref.index] : this.kit.slots[ref.index];
    if (!s) return new THREE.Vector3(0, 3, 10);
    return new THREE.Vector3(s.x, s.y + s.h / 2, s.z + s.d / 2);
  }

  /** Current build height per tower (for scaffolding). */
  towerHeights(): number[] {
    const h: number[] = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < this.shownNormal; i++) {
      const s = this.kit.slots[i]!;
      const m = /^tower(\d)/.exec(s.part);
      if (m) h[Number(m[1])] = Math.max(h[Number(m[1])]!, s.y + s.h);
    }
    return h;
  }

  get filled(): number {
    return this.shownNormal;
  }

  readonly ornaments: TempleOrnaments;
  private readonly platformSlots: number;
  private ornamentsAt = -1;

  update(now: number): void {
    if (this.ornamentsAt !== this.shownNormal) {
      this.ornamentsAt = this.shownNormal;
      this.ornaments.update(this.towerHeights(), this.shownNormal >= this.platformSlots);
    }
    // Flyers: drop from above, or hoist up on a rope.
    const live: Flyer[] = [];
    const ropePos = this.rope.geometry.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    for (const f of this.flyers) {
      const k = (now - f.start) / f.dur;
      if (k < 0) {
        live.push(f);
        continue;
      }
      const s = f.slot;
      const idx = this.kit.slots.indexOf(s as Slot);
      if (k >= 1) {
        if (idx >= 0) this.show(idx);
        this.platesDirty = true;
        continue;
      }
      live.push(f);
      if (n >= 24) continue;
      const e = f.hoist ? easeInOut(k) : easeOutBounce(k);
      const lift = f.hoist ? 6 * (1 - e) : 10 * (1 - e);
      this.m.makeScale(s.w, s.h, s.d);
      this.m.setPosition(s.x, s.y + lift, s.z);
      this.flyerMesh.setMatrixAt(n, this.m);
      if (f.hoist) ropePos.setXYZ(n * 2, s.x, s.y + lift + s.h, s.z);
      if (f.hoist) ropePos.setXYZ(n * 2 + 1, s.x, s.y + lift + 12, s.z);
      n++;
    }
    for (let i = n; i < 24; i++) {
      ropePos.setXYZ(i * 2, 0, -100, 0);
      ropePos.setXYZ(i * 2 + 1, 0, -100, 0);
    }
    ropePos.needsUpdate = true;
    this.flyerMesh.count = n;
    this.flyerMesh.instanceMatrix.needsUpdate = true;
    this.flyers = live;

    // Big pieces being hoisted.
    for (const mesh of this.bigMeshes) {
      const a = mesh.userData as { start?: number };
      if (a.start === undefined) continue;
      const k = Math.min(1, (now - a.start) / 2200);
      const b = this.kit.bigPieces[this.bigMeshes.indexOf(mesh)]!;
      mesh.position.y = b.y + 8 * (1 - easeInOut(k));
      if (k >= 1) delete a.start;
    }

    if (this.platesDirty) this.rebuildPlates();
  }

  private show(i: number): void {
    const s = this.kit.slots[i]!;
    const at = this.indexIn[i]!;
    const mesh = this.meshes[at.mat];
    this.m.makeScale(s.w * 0.97, s.h * 0.96, s.d * 0.97);
    this.m.setPosition(s.x, s.y, s.z);
    mesh.setMatrixAt(at.i, this.m);
    mesh.instanceMatrix.needsUpdate = true;
    // Slots fill in order, so each material's shown blocks are a prefix: draw only those.
    mesh.count = Math.max(mesh.count, at.i + 1);
  }

  private hide(i: number): void {
    const at = this.indexIn[i]!;
    const mesh = this.meshes[at.mat];
    mesh.setMatrixAt(at.i, HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;
    if (at.i + 1 >= mesh.count) mesh.count = Math.max(0, at.i);
  }

  private showBig(index: number, animate: boolean, now: number): void {
    const mesh = this.bigMeshes[index];
    if (!mesh || this.bigShown.has(index)) return;
    this.bigShown.add(index);
    mesh.visible = true;
    if (animate) (mesh.userData as { start?: number }).start = now;
    this.platesDirty = true;
  }

  private rebuildPlates(): void {
    this.platesDirty = false;
    const plates: PlateSpec[] = [];
    const normal: PlateSpec[] = [];
    for (const [key, v] of this.names) {
      const [kind, idxS] = key.split(':');
      const idx = Number(idxS);
      if (kind === 'big') {
        const b = this.kit.bigPieces[idx];
        if (!b || !this.bigShown.has(idx)) continue;
        const face =
          b.kind === 'nandi' ? { y: b.y + 0.35, h: 0.6 } : { y: b.y + b.h / 2, h: Math.min(b.h, 0.7) };
        plates.push({ key, name: v.name, x: b.x, y: face.y, z: b.z + b.d / 2 + 0.03, w: b.w, h: face.h });
      } else {
        const s = this.kit.slots[idx];
        if (!s || idx >= this.shownNormal) continue;
        normal.push({ key, name: v.name, x: s.x, y: s.y + s.h / 2, z: s.z + s.d / 2 + 0.02, w: s.w, h: s.h });
      }
    }
    // Newest normal names win when there are more than the preset allows.
    this.plates.set(plates.concat(normal.slice(-this.maxPlates)));
  }
}

function bigGeometry(b: BigPiece): THREE.BufferGeometry {
  switch (b.kind) {
    case 'doorFrame': {
      // Two carved posts and a threshold.
      const post = Math.min(0.45, b.w * 0.18);
      const parts: THREE.BufferGeometry[] = [
        new RoundedBoxGeometry(post, b.h, b.d, 2, 0.06).translate(-b.w / 2 + post / 2, b.h / 2, 0),
        new RoundedBoxGeometry(post, b.h, b.d, 2, 0.06).translate(b.w / 2 - post / 2, b.h / 2, 0),
        new RoundedBoxGeometry(b.w, 0.2, b.d * 1.1, 2, 0.05).translate(0, 0.1, 0),
      ];
      for (const x of [-b.w / 2 + post / 2, b.w / 2 - post / 2])
        for (let k = 1; k < 5; k++)
          parts.push(
            new THREE.TorusGeometry(post * 0.52, 0.035, lpSeg(6, 3), lpSeg(12, 4))
              .rotateX(Math.PI / 2)
              .translate(x, (b.h * k) / 5, 0),
          );
      return merge(parts);
    }
    case 'lintel': {
      const parts: THREE.BufferGeometry[] = [
        new RoundedBoxGeometry(b.w, b.h, b.d, 3, 0.08).translate(0, b.h / 2, 0),
      ];
      // A row of carved lotus bumps along the front.
      const n = Math.max(3, Math.round(b.w / 0.6));
      for (let i = 0; i < n; i++)
        parts.push(
          new THREE.SphereGeometry(Math.min(0.16, b.h * 0.3), lpSeg(10, 4), lpSeg(8, 3))
            .scale(1, 1, 0.5)
            .translate(-b.w / 2 + (i + 0.5) * (b.w / n), b.h / 2, b.d / 2),
        );
      return merge(parts);
    }
    case 'finial': {
      // Lotus-bud finial: a lathe profile.
      const r = b.w / 2;
      const pts = [
        [0, 0],
        [r, 0],
        [r * 0.95, b.h * 0.12],
        [r * 0.7, b.h * 0.2],
        [r * 0.85, b.h * 0.32],
        [r * 0.8, b.h * 0.5],
        [r * 0.55, b.h * 0.72],
        [r * 0.25, b.h * 0.9],
        [0, b.h],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      return new THREE.LatheGeometry(pts, lpSeg(16, 4));
    }
    case 'nandi': {
      // Nandi, Shiva's bull, kneeling on a plinth and facing the sanctuary (gives Preah Ko,
      // "sacred bull", its name). Same model family as the living zebu (engine/animals).
      const bull = zebuGeometry({ kneeling: true });
      const k = (b.d * 0.92) / 2.3;
      bull.scale(k, k, k).rotateY(Math.PI).translate(0, 0.3, 0);
      const plinth = new RoundedBoxGeometry(b.w, 0.3, b.d, 1, 0.05).translate(0, 0.15, 0);
      return merge([plinth, bull]);
    }
  }
}

/** Merge parts that may differ in attributes (keep position/normal/uv only). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!parts.every((q) => q.getAttribute('uv'))) g.deleteAttribute('uv');
    return g;
  });
  return mergeGeometries(clean)!;
}

const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
function easeOutBounce(k: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}
