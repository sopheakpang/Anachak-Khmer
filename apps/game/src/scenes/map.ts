import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TemplesConfig } from '@temples/shared';
import mapJson from '../../../../config/map.json';
import { palmGeometry, leafMaterial, scatter, seeded, treeGeometry } from '../engine/figures';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { shadows, soft, seg as lpSeg } from '../engine/look';
import { along, type XZ } from './along';

export { along };
import { baseScene, camera, lerp, type FrameContext, type GameScene } from './base';

const M = mapJson as unknown as {
  kulen: { x: number; z: number; radius: number; height: number };
  quarry: { x: number; z: number };
  kilns: { x: number; z: number };
  river: XZ[];
  canal: XZ[];
  tonleSap: { z: number };
  angkorThom: { x: number; z: number; size: number };
  angkorWat: { x: number; z: number; size: number };
  westBaray: { x: number; z: number; w: number; d: number };
  eastBaray: { x: number; z: number; w: number; d: number };
  indratataka: { x: number; z: number; w: number; d: number };
  sites: Record<string, XZ>;
  labels: Array<{ km: string; en: string; x: number; z: number }>;
};

const SIZE = 100; // world units
const PX = 2048; // texture pixels
const toPx = (v: number) => ((v + SIZE / 2) / SIZE) * PX;

/** Height of the terrain: flat plain with the Kulen plateau rising in the north-east. */
export function terrainHeight(x: number, z: number): number {
  const d = Math.hypot(x - M.kulen.x, z - M.kulen.z) / M.kulen.radius;
  const plateau = d < 1 ? M.kulen.height * (1 - Math.pow(d, 4)) : 0;
  return plateau + 0.15 * Math.sin(x * 0.3) * Math.cos(z * 0.25);
}

/** Route stones take from the Kulen quarry (or the riverside kilns) to a temple site. */
export function routeTo(templeId: string, material: string): XZ[] {
  const site = M.sites[templeId] ?? [0, 0];
  if (material === 'brick') return [[M.kilns.x, M.kilns.z], [site[0] + 3, site[1] + 2], site];
  return [...M.canal.slice(0, 3), [site[0] + 2, site[1] - 2], site];
}

/** The illustrated map, painted once (flat colours like the reference map). */
function paintMap(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = PX;
  c.height = PX;
  const g = c.getContext('2d')!;
  const r = seeded(3);
  g.fillStyle = '#a9c07f';
  g.fillRect(0, 0, PX, PX);
  // Rice paddies: soft rectangles.
  for (let i = 0; i < 260; i++) {
    g.fillStyle = ['#b7cb8a', '#c3d198', '#9fb874', '#cfd8a2'][i % 4]!;
    g.fillRect(r() * PX, r() * PX, 40 + r() * 80, 30 + r() * 60);
  }
  // Forest dots.
  for (let i = 0; i < 2600; i++) {
    const x = r() * PX;
    const y = r() * PX;
    g.fillStyle = ['#6f9450', '#5f8444', '#7ea45c'][i % 3]!;
    g.beginPath();
    g.arc(x, y, 5 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  // Kulen plateau with contour lines.
  const kx = toPx(M.kulen.x);
  const kz = toPx(M.kulen.z);
  const rpx = (M.kulen.radius / SIZE) * PX;
  for (let k = 6; k >= 1; k--) {
    g.fillStyle = `rgba(${150 - k * 10},${170 - k * 8},${100 - k * 6},0.5)`;
    g.beginPath();
    g.ellipse(kx, kz, (k / 6) * rpx * 1.15, (k / 6) * rpx * 0.9, 0.4, 0, Math.PI * 2);
    g.fill();
  }
  // Tonle Sap lake.
  g.fillStyle = '#7fb4d0';
  g.beginPath();
  g.moveTo(0, toPx(M.tonleSap.z));
  for (let x = 0; x <= PX; x += 64) g.lineTo(x, toPx(M.tonleSap.z) + Math.sin(x * 0.01) * 30);
  g.lineTo(PX, PX);
  g.lineTo(0, PX);
  g.fill();
  const water = (pts: XZ[], width: number, color = '#7fb4d0') => {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
    g.stroke();
  };
  water(M.river, 22);
  water(M.canal, 12, '#8cc0d6');
  const rect = (x: number, z: number, w: number, d: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(toPx(x - w / 2), toPx(z - d / 2), (w / SIZE) * PX, (d / SIZE) * PX);
  };
  for (const b of [M.westBaray, M.eastBaray, M.indratataka]) rect(b.x, b.z, b.w, b.d, '#7fb4d0');
  // Angkor Thom and Angkor Wat moats.
  for (const s of [M.angkorThom, M.angkorWat]) {
    rect(s.x, s.z, s.size + 1.6, s.size + 1.6, '#7fb4d0');
    rect(s.x, s.z, s.size, s.size, '#b9c98c');
  }
  // Roads (pale).
  g.strokeStyle = 'rgba(245,232,200,0.9)';
  g.lineWidth = 6;
  g.setLineDash([]);
  const road = (pts: XZ[]) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
    g.stroke();
  };
  road([
    [M.angkorThom.x, M.angkorThom.z],
    [M.angkorWat.x, M.angkorWat.z],
    [M.angkorWat.x, 30],
  ]);
  road([
    [M.angkorThom.x, M.angkorThom.z],
    [20, -9],
    [16, 20],
  ]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function label(
  km: string,
  en: string,
  font: (px: number, role: 'title' | 'small') => string,
  big = false,
): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,248,230,0.85)';
  g.beginPath();
  g.roundRect(16, 20, 480, 150, 30);
  g.fill();
  g.fillStyle = '#3b2a18';
  g.font = font(big ? 64 : 58, 'title');
  g.fillText(km, 256, 98);
  g.font = font(34, 'small');
  g.fillStyle = '#6a5236';
  g.fillText(en, 256, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false }));
  s.scale.set(big ? 13 : 10, big ? 4.9 : 3.75, 1);
  s.renderOrder = 5;
  return s;
}

/** Sky view of the campaign map (spec: Scenes → Sky map). */
export class MapScene implements GameScene {
  readonly name = 'map';
  readonly scene = baseScene(130, 340, { center: [0, 0, 0], extent: 55 });
  readonly camera = camera(40);
  private readonly markers = new Map<string, THREE.Mesh>();
  private readonly labels = new Map<string, THREE.Sprite>();
  private readonly convoy: THREE.InstancedMesh;
  private active = '';
  private done = new Set<string>();
  private readonly m = new THREE.Matrix4();
  private route: XZ[] = [];

  constructor(
    private readonly temples: TemplesConfig,
    private readonly font: (px: number, role: 'title' | 'small') => string,
  ) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 128, 128);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const land = shadows(new THREE.Mesh(geo, soft({ map: paintMap(), roughness: 1 }, 0)), false, true);
    this.scene.add(land);

    // A diorama touch: small 3D trees dotted over the painted forest, denser on Kulen.
    const r = seeded(77);
    const trees: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 200; i++) {
      const onKulen = i < 70;
      const a = r() * Math.PI * 2;
      const d = r() * M.kulen.radius * 0.9;
      const x = onKulen ? M.kulen.x + Math.cos(a) * d : -48 + r() * 96;
      const z = onKulen ? M.kulen.z + Math.sin(a) * d : -48 + r() * 96;
      if (z > M.tonleSap.z - 2) continue;
      trees.push([x, terrainHeight(x, z), z, 0.28 + r() * 0.14]);
    }
    this.scene.add(scatter(treeGeometry(1), trees.slice(0, Math.floor(trees.length * 0.8))));
    this.scene.add(
      scatter(
        palmGeometry(),
        trees
          .slice(Math.floor(trees.length * 0.8))
          .map(([x, y, z, sc]) => [x, y, z, sc * 0.8] as [number, number, number, number]),
        leafMaterial,
      ),
    );

    // Temple markers: small stepped pyramids.
    const step = (w: number, y: number) => new RoundedBoxGeometry(w, 0.6, w, 2, 0.12).translate(0, y, 0);
    const bud = new THREE.SphereGeometry(0.32, lpSeg(12, 4), lpSeg(10, 3))
      .scale(1, 1.5, 1)
      .translate(0, 2.1, 0);
    const merged = mergeGeometries(
      [step(2.2, 0.3), step(1.6, 0.9), step(1, 1.5), bud].map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        n.deleteAttribute('uv');
        return n;
      }),
    )!;
    for (const t of temples.temples) {
      const [x, z] = M.sites[t.id] ?? [0, 0];
      const mk = shadows(new THREE.Mesh(merged, soft({ color: 0x9a9486, roughness: 0.8 }, 0.3)), true, false);
      mk.position.set(x, terrainHeight(x, z), z);
      this.scene.add(mk);
      this.markers.set(t.id, mk);
      const lb = label(t.km, t.en, font);
      lb.position.set(x, terrainHeight(x, z) + 5, z);
      lb.visible = false;
      this.scene.add(lb);
      this.labels.set(t.id, lb);
    }
    for (const l of M.labels) {
      const lb = label(l.km, l.en, font);
      lb.position.set(l.x, terrainHeight(l.x, l.z) + 3, l.z);
      lb.scale.multiplyScalar(0.8);
      this.scene.add(lb);
    }

    // Convoy dots moving along the active route.
    this.convoy = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.45, lpSeg(12, 4), lpSeg(8, 3)),
      soft({ color: 0xc0452e, roughness: 0.5 }, 0.3),
      40,
    );
    this.convoy.count = 0;
    this.convoy.frustumCulled = false;
    this.scene.add(this.convoy);
  }

  /** Mark the active temple (glowing) and finished ones (gold). */
  setCampaign(activeId: string, completed: boolean): void {
    if (activeId === this.active && !completed) return;
    const order = this.temples.temples.find((t) => t.id === activeId)?.order ?? 1;
    this.done = new Set(
      this.temples.temples
        .filter((t) => t.order < order || (completed && t.id === activeId))
        .map((t) => t.id),
    );
    this.active = activeId;
    for (const t of this.temples.temples) {
      const mk = this.markers.get(t.id)!;
      const mat = mk.material as THREE.MeshStandardMaterial;
      const isActive = t.id === activeId;
      mat.color.set(this.done.has(t.id) ? 0xd9b777 : isActive ? 0xe8c070 : 0x9a9486);
      mat.emissive.set(isActive ? 0x5a3a10 : 0x000000);
      mk.scale.setScalar(isActive ? 1.6 : 1);
      this.labels.get(t.id)!.visible = isActive || this.done.has(t.id);
    }
    const t = this.temples.temples.find((x) => x.id === activeId);
    this.route = routeTo(activeId, t?.material ?? 'sandstone');
    this.drawRoute();
  }

  private routeLine: THREE.Line | null = null;
  private drawRoute(): void {
    if (this.routeLine) this.scene.remove(this.routeLine);
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const [x, z] = along(this.route, i / 80);
      pts.push(new THREE.Vector3(x, terrainHeight(x, z) + 0.3, z));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.routeLine = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color: 0x7a3a22, dashSize: 1, gapSize: 0.7 }),
    );
    this.routeLine.computeLineDistances();
    this.scene.add(this.routeLine);
  }

  update(ctx: FrameContext): void {
    const site = M.sites[this.active] ?? [0, 0];
    const t = ctx.view.t;
    // Slow drift from the Kulen hills toward the active temple.
    const fx = lerp(M.quarry.x, site[0], t);
    const fz = lerp(M.quarry.z, site[1], t);
    // The top ~40% of the screen is UI, so aim a little north of the point of interest
    // to place it in the main view (spec: Screen layout).
    this.camera.position.set(fx - 2, 84 - t * 10, fz + 40);
    this.camera.lookAt(fx, 0, fz - 10);

    // Convoys: count follows recent activity.
    const n = Math.min(
      40,
      ctx.convoys.workers + ctx.convoys.oxcart + ctx.convoys.elephants + ctx.convoys.raft * 2,
    );
    const time = ctx.now / 1000;
    for (let i = 0; i < n; i++) {
      const [x, z] = along(this.route, (time * 0.012 + i / n) % 1);
      this.m.makeTranslation(x, terrainHeight(x, z) + 0.5, z);
      this.convoy.setMatrixAt(i, this.m);
    }
    this.convoy.count = n;
    this.convoy.instanceMatrix.needsUpdate = true;
    const mk = this.markers.get(this.active);
    if (mk) (mk.material as THREE.MeshStandardMaterial).emissive.setScalar(0.25 + 0.15 * Math.sin(time * 3));
  }
}
