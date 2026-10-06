import * as THREE from 'three';
import type { ExpeditionConfig } from '@temples/shared';
import { addRim, currentLook, environmentFrom, shadows, SUN_DIR, seg as lpSeg } from '../engine/look';
import { ACT, Crowd, raftGeometry, hutGeometry, type Motion } from '../engine/figures';
import { baseScene, ASPECT } from '../scenes/base';
import {
  CAMP,
  CLIFF_TRAIL,
  TRAILS,
  TRAIL_HALF_WIDTH,
  distToPolyline,
  HALF,
  heightAt,
  junglePlants,
  onTrail,
  POOL,
  RIVER,
  RIVER_HALF_WIDTH,
  SHRINES,
  slopeAt,
  waterLevelAt,
  ZONES,
  FORDS,
  type Species,
  type XZ,
} from './kulenMap';
import {
  dockGeometry,
  fernGeometry,
  figGeometry,
  HERO_CLOTH,
  heroGeometry,
  lingaGeometry,
  outcropGeometry,
  rainTreeGeometry,
  rockGeometry,
  ruinGeometry,
  shrineGeometry,
  trainingPostGeometry,
} from './jungleArt';
import { Effects } from './effects';
import type { Target } from './combat';
import { bushGeometry, palmGeometry } from '../engine/figures';
import type { HeroState } from './hero';

/** See-through: foliage between the camera and the hero is dithered away (RTS style). */
export interface SeeThrough {
  uHeroPx: { value: THREE.Vector2 };
  uHoleR: { value: number };
  uHeroDepth: { value: number };
  /** Foliage closer to the camera than this (metres) is dithered away, so it never covers the view. */
  uNear: { value: number };
}

function jungleMaterial(hole: SeeThrough, doubleSide: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  addRim(m, 0.18, 2.6, (sh) => {
    Object.assign(sh.uniforms, hole);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec2 uHeroPx;\nuniform float uHoleR;\nuniform float uHeroDepth;\nuniform float uNear;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float dh = distance(gl_FragCoord.xy, uHeroPx);
          if (uHoleR > 0.0 && dh < uHoleR && gl_FragCoord.z < uHeroDepth - 0.002) {
            float n = fract(sin(dot(floor(gl_FragCoord.xy / 3.0), vec2(12.9898, 78.233))) * 43758.5453);
            if (n < 0.9 * (1.0 - smoothstep(uHoleR * 0.55, uHoleR, dh))) discard;
          }
          float vd = length(vViewPosition);
          if (vd < uNear) {
            float n2 = fract(sin(dot(floor(gl_FragCoord.xy / 3.0), vec2(39.3467, 11.135))) * 24634.6345);
            if (n2 > smoothstep(uNear * 0.65, uNear, vd)) discard;
          }
        }`,
      );
  });
  m.customProgramCacheKey = () => `jungle-${doubleSide ? 2 : 1}`;
  return m;
}

function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Neutral grain so vertex colours carry the hue (moss, dirt, rock). */
function grainTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#d9d9d9';
    g.fillRect(0, 0, 256, 256);
    const r = rand(71);
    for (let i = 0; i < 2600; i++) {
      const v = 170 + Math.floor(r() * 85);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      const s = 1 + r() * 3;
      g.fillRect(r() * 256, r() * 256, s, s);
    }
  });
  t.userData.detail = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  t.anisotropy = 4;
  return t;
}

function softDot(color: string): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));

/** Ground colour: forest floor, moss, dirt trails, mud banks, rock on steep ground. */
function groundColor(x: number, z: number): THREE.Color {
  const moss = new THREE.Color(0x4a7a30);
  const floor = new THREE.Color(0x6a7d3a);
  const grass = new THREE.Color(0x7ea64a);
  const dirt = new THREE.Color(0xb48c5a);
  const mud = new THREE.Color(0x7d6a48);
  const rock = new THREE.Color(0x8b8272);
  const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.13 - x * 0.05);
  let c = mix(moss, floor, n);
  if (heightAt(x, z) < 3) c = mix(c, grass, 0.6);
  const river = distToPolyline(x, z, RIVER).d;
  if (river < RIVER_HALF_WIDTH + 2.5) c = mix(c, mud, 1 - (river - RIVER_HALF_WIDTH) / 2.5);
  if (onTrail(x, z, 3.2)) {
    const trailD = onTrail(x, z, 1.8) ? 1 : 0.55;
    c = mix(c, dirt, trailD);
  }
  if (SHRINES.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 6)) c = mix(c, dirt, 0.7);
  const s = slopeAt(x, z);
  if (s > 0.55) c = mix(c, rock, (s - 0.55) * 2);
  return c;
}

const CHUNK = 30;

export class JungleScene {
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(42, ASPECT, 0.5, 700);
  readonly hole: SeeThrough = {
    uHeroPx: { value: new THREE.Vector2(-9999, -9999) },
    uHoleR: { value: 170 },
    uHeroDepth: { value: 1 },
    uNear: { value: 22 },
  };
  private readonly sun: THREE.DirectionalLight;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly leafMat: THREE.MeshStandardMaterial;
  private hero: Crowd | null = null;
  private heroId: 'warrior' | 'sage' | 'rider' | null = null;
  private readonly ring: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  /** A block on the hero's head (Old Quarry), and the stone pile at camp. */
  private readonly carried: THREE.Mesh;
  private readonly pile: THREE.InstancedMesh;
  private pileShown = -1;
  private markerAt = -1e9;
  private readonly water: THREE.Mesh;
  private readonly fireflies: THREE.Points;
  /** Fog of war: 90 × 90 cells of 2 m; 0 = unexplored, 255 = seen. */
  readonly explored = new Uint8Array(90 * 90);
  private readonly fogData = new Uint8Array(90 * 90 * 4);
  private readonly fogTex: THREE.DataTexture;
  private readonly fogNoise = new Float32Array(90 * 90);
  private fogDirty = true;
  readonly minimapBase: HTMLCanvasElement;
  readonly effects = new Effects();
  private readonly posts = new Map<string, { mesh: THREE.Mesh; hitAt: number; fall: number }>();
  private readonly aimRing: THREE.Mesh;
  private readonly rangeRing: THREE.Mesh;

  constructor(
    renderer: THREE.WebGLRenderer,
    readonly cfg: ExpeditionConfig,
  ) {
    this.scene = baseScene(70, 260, { center: [CAMP[0], 8, CAMP[1]], extent: 42 });
    this.scene.environment = environmentFrom(renderer);
    this.scene.environmentIntensity = currentLook().envIntensity;
    this.sun = this.scene.children.find(
      (o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight,
    )!;
    this.mat = jungleMaterial(this.hole, false);
    this.leafMat = jungleMaterial(this.hole, true);

    this.buildTerrain();
    this.water = this.buildWater();
    this.buildFoliage();
    this.buildLandmarks();
    this.fireflies = this.buildAtmosphere();

    // Hero selection ring and the click marker.
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, lpSeg(40, 4)), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 3;
    this.scene.add(this.ring);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, lpSeg(32, 4)),
      new THREE.MeshBasicMaterial({
        color: 0x9ff0c8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);
    // Quarried sandstone: the block the hero carries, and the pile it goes to at camp.
    const blockMat = addRim(new THREE.MeshStandardMaterial({ color: 0xc8b68e, roughness: 0.9 }), 0.15);
    this.carried = shadows(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.65), blockMat), true, false);
    this.carried.visible = false;
    this.scene.add(this.carried);
    this.pile = shadows(
      new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.55, 0.8).translate(0, 0.275, 0), blockMat, 18),
      true,
      true,
    );
    this.pile.count = 0;
    this.pile.frustumCulled = false; // instances move in after the bounds would be cached
    this.scene.add(this.pile);

    // Fog of war as a soft cloud layer above the canopy.
    const r = rand(41);
    for (let i = 0; i < this.fogNoise.length; i++) this.fogNoise[i] = 0.78 + r() * 0.22;
    this.fogTex = new THREE.DataTexture(this.fogData, 90, 90, THREE.RGBAFormat);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    const fog = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 40, HALF * 2 + 40),
      new THREE.MeshBasicMaterial({
        color: 0xe9eeea,
        alphaMap: this.fogTex,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    fog.rotation.x = -Math.PI / 2;
    fog.position.y = 17;
    fog.renderOrder = 4;
    fog.scale.set((HALF * 2) / (HALF * 2 + 40), (HALF * 2) / (HALF * 2 + 40), 1);
    fog.name = 'fog-of-war';
    this.scene.add(fog);
    this.refreshFog();

    this.minimapBase = this.paintMinimap();
    this.scene.add(this.effects.group);

    // Aim marker under the cursor and the reach ring around the hero.
    const flat = (inner: number, outer: number, color: number, opacity: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, lpSeg(48, 4)),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.aimRing = flat(0.55, 0.75, 0xffffff, 0.85);
    this.rangeRing = flat(0.97, 1, 0xffd36a, 0.55);
  }

  /** Training posts (and later, enemies) standing in the world. */
  setTargets(targets: Target[]): void {
    const geo = trainingPostGeometry();
    for (const t of targets) {
      if (this.posts.has(t.id)) continue;
      const mesh = shadows(new THREE.Mesh(geo, this.mat), true, true);
      mesh.position.set(t.x, heightAt(t.x, t.z), t.z);
      this.scene.add(mesh);
      this.posts.set(t.id, { mesh, hitAt: -1e9, fall: 0 });
    }
  }

  onHit(id: string, now: number): void {
    const p = this.posts.get(id);
    if (p) p.hitAt = now;
  }

  updateTargets(targets: Target[], now: number): void {
    for (const t of targets) {
      const p = this.posts.get(t.id);
      if (!p) continue;
      const down = t.downUntil !== 0;
      p.fall += ((down ? 1 : 0) - p.fall) * 0.15;
      const k = (now - p.hitAt) / 300;
      const wobble = k >= 0 && k < 1 ? Math.sin(k * 18) * 0.25 * (1 - k) : 0;
      p.mesh.rotation.set(wobble, 0, (Math.PI / 2 - 0.1) * p.fall);
      p.mesh.position.y = heightAt(t.x, t.z) + (down ? 0.25 * p.fall : 0);
    }
  }

  /** Cursor aim point; state colours it: gold = in reach, red = too far, white = ground. */
  setAim(p: XZ | null, state: 'ground' | 'inRange' | 'far'): void {
    this.aimRing.visible = !!p;
    if (!p) return;
    this.aimRing.position.set(p[0], heightAt(p[0], p[1]) + 0.1, p[1]);
    (this.aimRing.material as THREE.MeshBasicMaterial).color.set(
      state === 'inRange' ? 0xffd36a : state === 'far' ? 0xff5a4a : 0xffffff,
    );
    this.aimRing.scale.setScalar(state === 'ground' ? 0.8 : 1.4);
  }

  /** Reach ring around the hero (attack or skill range), or hidden. */
  setRange(hero: XZ | null, radius: number): void {
    this.rangeRing.visible = !!hero && radius > 0;
    if (!hero || radius <= 0) return;
    this.rangeRing.position.set(hero[0], heightAt(hero[0], hero[1]) + 0.12, hero[1]);
    this.rangeRing.scale.setScalar(radius);
  }

  /** World point → stage pixels (1080 × 1920). */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * 1080,
      y: ((1 - v.y) / 2) * 1920,
      visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1,
    };
  }

  /** A ground point (x, z) → stage pixels. */
  projectGround(x: number, z: number): { x: number; y: number; visible: boolean } {
    return this.project(x, heightAt(x, z), z);
  }

  // ------------------------------------------------------------ world building

  private buildTerrain(): void {
    const N = lpSeg(180); // 2 m facets in the low-poly style
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, N, N);
    geo.rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, heightAt(x, z));
      const c = groundColor(x, z);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: grainTexture(), roughness: 1 });
    const ground = shadows(new THREE.Mesh(geo, m), false, true);
    ground.name = 'terrain';
    this.scene.add(ground);
  }

  private buildWater(): THREE.Mesh {
    // River ribbon sampled every metre along the centre line; foam where it falls.
    const pts: THREE.Vector2[] = [];
    for (let i = 1; i < RIVER.length; i++) {
      const [ax, az] = RIVER[i - 1]!;
      const [bx, bz] = RIVER[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 1)
        pts.push(new THREE.Vector2(ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len));
    }
    pts.push(new THREE.Vector2(...RIVER[RIVER.length - 1]!));
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const w = RIVER_HALF_WIDTH + 0.9;
    let along = 0;
    pts.forEach((c, i) => {
      const next = pts[Math.min(pts.length - 1, i + 1)]!;
      const prev = pts[Math.max(0, i - 1)]!;
      const t = next.clone().sub(prev).normalize();
      const nx = -t.y;
      const nz = t.x;
      const y = heightAt(c.x, c.y) + 1.15;
      const yNext = heightAt(next.x, next.y) + 1.15;
      const foam = Math.min(1, Math.abs(y - yNext) * 2.2);
      if (i > 0) along += c.distanceTo(prev);
      for (const s of [-1, 1]) {
        pos.push(c.x + nx * w * s, y, c.y + nz * w * s);
        col.push(0.19 + 0.81 * foam, 0.52 + 0.48 * foam, 0.5 + 0.5 * foam);
        uv.push(s < 0 ? 0 : 1, along / 6);
      }
      if (i > 0) {
        const b = i * 2;
        idx.push(b - 2, b - 1, b, b - 1, b + 1, b);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const ripple = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 128, 128);
      const r = rand(9);
      g.strokeStyle = 'rgba(190,230,225,0.9)';
      g.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const x = r() * 128;
        const y = r() * 128;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 6, y - 2, x + 14, y);
        g.stroke();
      }
    });
    ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map: ripple,
      vertexColors: true,
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.3,
    });
    const river = new THREE.Mesh(geo, mat);
    river.receiveShadow = currentLook().shadows;
    river.renderOrder = 1;
    this.scene.add(river);
    const poolMat = mat.clone();
    poolMat.vertexColors = false;
    poolMat.color.setRGB(0.19, 0.52, 0.5);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(POOL.radius + 1.4, lpSeg(40, 4)), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(POOL.center[0], waterLevelAt(POOL.center[0], POOL.center[1]), POOL.center[1]);
    pool.renderOrder = 1;
    this.scene.add(pool);
    // White foam where the waterfall lands in the pool.
    const foam = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softDot('rgba(255,255,255,0.95)'),
        transparent: true,
        depthWrite: false,
      }),
    );
    foam.scale.set(7, 3, 1);
    foam.position.set(7.5, waterLevelAt(POOL.center[0], POOL.center[1]) + 0.6, POOL.center[1] - 5.5);
    this.scene.add(foam);
    // Stepping stones at the fords.
    const stone = rockGeometry();
    for (const [fx, fz] of FORDS) {
      for (let k = -2; k <= 2; k++) {
        const { p } = distToPolyline(fx, fz, RIVER);
        const d = distToPolyline(fx + 1, fz, RIVER).p;
        const tx = d[0] - p[0];
        const tz = d[1] - p[1];
        const tl = Math.hypot(tx, tz) || 1;
        const x = fx + (-tz / tl) * k * 1.3;
        const z = fz + (tx / tl) * k * 1.3;
        const m = new THREE.Mesh(stone, this.mat);
        m.scale.set(0.8, 0.6, 0.8);
        m.position.set(x, waterLevelAt(fx, fz) - 0.25, z);
        this.scene.add(m);
      }
    }
    return river;
  }

  private buildFoliage(): void {
    const geos: Record<Species, THREE.BufferGeometry> = {
      rainTree: rainTreeGeometry(),
      fig: figGeometry(),
      palm: palmGeometry(),
      fern: fernGeometry(),
      bush: bushGeometry(),
      rock: rockGeometry(),
    };
    const chunks = new Map<string, Map<Species, typeof plants>>();
    const plants = junglePlants();
    for (const p of plants) {
      const key = `${Math.floor((p.x + HALF) / CHUNK)},${Math.floor((p.z + HALF) / CHUNK)}`;
      if (!chunks.has(key)) chunks.set(key, new Map());
      const bySpecies = chunks.get(key)!;
      if (!bySpecies.has(p.species)) bySpecies.set(p.species, []);
      bySpecies.get(p.species)!.push(p);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const look = currentLook();
    for (const bySpecies of chunks.values()) {
      for (const [species, list] of bySpecies) {
        const leafy = species === 'fern' || species === 'palm';
        const mesh = new THREE.InstancedMesh(geos[species], leafy ? this.leafMat : this.mat, list.length);
        list.forEach((p, i) => {
          q.setFromAxisAngle(up, p.rot);
          m.compose(
            new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.1, p.z),
            q,
            new THREE.Vector3(p.scale, p.scale, p.scale),
          );
          mesh.setMatrixAt(i, m);
          const k = 0.85 + ((((p.x * 7.3 + p.z * 3.1) % 1) + 1) % 1) * 0.3;
          mesh.setColorAt(i, c.setRGB(k, k * (0.97 + (0.06 * (i % 3)) / 2), k * 0.95));
        });
        mesh.computeBoundingSphere();
        mesh.castShadow = look.shadows && species !== 'fern';
        mesh.receiveShadow = look.shadows;
        this.scene.add(mesh);
      }
    }
  }

  private buildLandmarks(): void {
    const add = (geo: THREE.BufferGeometry, x: number, z: number, rotY = 0, s = 1, y?: number) => {
      const mesh = shadows(new THREE.Mesh(geo, this.mat), true, true);
      mesh.position.set(x, y ?? heightAt(x, z) - 0.05, z);
      mesh.rotation.y = rotY;
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      return mesh;
    };
    // Shrines where a fallen hero rises again, with a soft golden glow.
    const shrine = shrineGeometry();
    const glow = new THREE.SpriteMaterial({
      map: softDot('rgba(255,214,120,0.9)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (const [x, z] of SHRINES) {
      add(shrine, x, z - 3.5, 0);
      const s = new THREE.Sprite(glow);
      s.scale.set(2.2, 2.2, 1);
      s.position.set(x, heightAt(x, z - 3.5) + 3.9, z - 3.5);
      this.scene.add(s);
    }
    // Camp: stilt houses around the fire.
    const hut = hutGeometry();
    for (const [x, z, r] of [
      [CAMP[0] - 7, CAMP[1] + 3, 0.6],
      [CAMP[0] + 7, CAMP[1] + 4, -0.5],
      [CAMP[0] + 1, CAMP[1] + 8.5, 0],
    ] as const)
      add(hut, x, z, r, 0.75);
    const fire = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softDot('rgba(255,150,60,1)'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    fire.scale.set(1.1, 1.4, 1);
    fire.position.set(CAMP[0] + 1, heightAt(CAMP[0] + 1, CAMP[1] + 3) + 0.55, CAMP[1] + 3);
    // Logs under the fire.
    for (let k = 0; k < 3; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, lpSeg(6, 3)), this.mat);
      const n = log.geometry.getAttribute('position').count;
      log.geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(
          Array.from({ length: n * 3 }, (_, i) => [0.16, 0.08, 0.04][i % 3]!),
          3,
        ),
      );
      log.rotation.set(Math.PI / 2 - 0.35, (k / 3) * Math.PI * 2, 0);
      log.position.set(CAMP[0] + 1, heightAt(CAMP[0] + 1, CAMP[1] + 3) + 0.2, CAMP[1] + 3);
      this.scene.add(log);
    }
    fire.name = 'campfire';
    this.scene.add(fire);

    // Riverbed of a Thousand Lingas: carvings under the clear water.
    const linga = lingaGeometry();
    const lz = ZONES.find((z) => z.id === 'lingas')!;
    const r = rand(1000);
    for (let i = 0; i < 46; i++) {
      const t = (i / 46) * 34 - 17;
      const along = distToPolyline(lz.center[0], lz.center[1] + t, RIVER).p;
      const x = along[0] + (r() - 0.5) * (RIVER_HALF_WIDTH * 1.4);
      const z = along[1] + (r() - 0.5) * 1.2;
      add(linga, x, z, r() * 0.3, 0.8 + r() * 0.3, heightAt(x, z) - 0.02);
    }
    // Hermitage ruins.
    const ruin = ruinGeometry();
    const hz = ZONES.find((z) => z.id === 'hermitage')!;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add(ruin, hz.center[0] + Math.cos(a) * 6.5, hz.center[1] + Math.sin(a) * 6.5, -a + Math.PI / 2, 0.9);
    }
    // Old quarry outcrops.
    const out = outcropGeometry();
    const qz = ZONES.find((z) => z.id === 'quarry')!;
    for (const [dx, dz, rot] of [
      [-6, -7, 0.2],
      [5, -9, -0.3],
      [10, 1, -1.2],
      [-9, 4, 1.4],
    ] as const)
      add(out, qz.center[0] + dx, qz.center[1] + dz, rot, 1);
    // The cliff path: stone steps where the switchbacks climb, and edging stones.
    this.scene.add(...cliffSteps());
    // River landing: dock and rafts waiting.
    const ld = ZONES.find((z) => z.id === 'landing')!;
    const wl = waterLevelAt(ld.center[0] - 4, ld.center[1]);
    add(dockGeometry(), ld.center[0] - 5.5, ld.center[1], Math.PI / 2 + 0.2, 1, wl - 0.7);
    const raft = raftGeometry();
    add(raft, ld.center[0] - 4.5, ld.center[1] + 5, 0.2, 0.8, wl - 0.1);
    add(raft, ld.center[0] - 5, ld.center[1] - 5, -0.1, 0.8, wl - 0.1);
  }

  private buildAtmosphere(): THREE.Points {
    // Mist over the waterfall pool and along the lower river.
    const mist = new THREE.SpriteMaterial({
      map: softDot('rgba(255,255,255,0.55)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    const r = rand(17);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(mist);
      const a = r() * Math.PI * 2;
      const d = r() * 9;
      const x = POOL.center[0] + Math.cos(a) * d;
      const z = POOL.center[1] - 6 + Math.sin(a) * d;
      s.position.set(x, waterLevelAt(x, z) + 1.5 + r() * 4, z);
      s.scale.set(9 + r() * 6, 5 + r() * 3, 1);
      this.scene.add(s);
    }
    // Light shafts falling into the clearings.
    const shaftTex = canvasTexture(8, 128, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, 'rgba(255,236,190,0)');
      grad.addColorStop(0.35, 'rgba(255,236,190,0.35)');
      grad.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 128);
    });
    const shaftMat = new THREE.MeshBasicMaterial({
      map: shaftTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
      opacity: 0.55,
    });
    const tilt = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      SUN_DIR.clone().normalize(),
    );
    for (const [x, z] of [CAMP, ...ZONES.map((zn) => zn.center)]) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.4, 22, lpSeg(16, 3), 1, true), shaftMat);
      shaft.quaternion.copy(tilt);
      const base = new THREE.Vector3(x, heightAt(x, z), z);
      shaft.position.copy(base.add(SUN_DIR.clone().multiplyScalar(11)));
      this.scene.add(shaft);
    }
    // Fireflies around the pool and the hermitage.
    const pts: number[] = [];
    for (const [cx, cz, n] of [
      [POOL.center[0], POOL.center[1], 40],
      [ZONES[2]!.center[0], ZONES[2]!.center[1], 40],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 22;
        const z = cz + (r() - 0.5) * 22;
        pts.push(x, heightAt(x, z) + 0.6 + r() * 2.2, z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const flies = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.35,
        map: softDot('rgba(255,240,150,1)'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xfff2a0,
        toneMapped: false,
      }),
    );
    this.scene.add(flies);
    return flies;
  }

  // ------------------------------------------------------------ fog of war + minimap

  /** Uncover the cloud cover around a point (radius in metres). Returns true if anything changed. */
  reveal(x: number, z: number, radius = 18): boolean {
    let changed = false;
    const c0 = Math.floor((x + HALF) / 2);
    const r0 = Math.floor((z + HALF) / 2);
    const R = Math.ceil(radius / 2);
    for (let r = r0 - R; r <= r0 + R; r++) {
      if (r < 0 || r >= 90) continue;
      for (let c = c0 - R; c <= c0 + R; c++) {
        if (c < 0 || c >= 90) continue;
        const d = Math.hypot((c - c0) * 2, (r - r0) * 2);
        if (d > radius) continue;
        const v = Math.round(255 * Math.min(1, (radius - d) / (radius * 0.35)));
        const i = r * 90 + c;
        if (v > this.explored[i]!) {
          this.explored[i] = v;
          changed = true;
        }
      }
    }
    if (changed) this.fogDirty = true;
    return changed;
  }

  exploredShare(): number {
    let s = 0;
    for (const v of this.explored) s += v;
    return s / (this.explored.length * 255);
  }

  private refreshFog(): void {
    for (let i = 0; i < this.explored.length; i++) {
      const a = Math.round((255 - this.explored[i]!) * this.fogNoise[i]!);
      // DataTexture rows run south→north in texture space; plane rows are flipped by the rotation.
      const r = Math.floor(i / 90);
      const c = i % 90;
      const j = ((89 - r) * 90 + c) * 4;
      this.fogData[j] = 255;
      this.fogData[j + 1] = a;
      this.fogData[j + 2] = 255;
      this.fogData[j + 3] = 255;
    }
    this.fogTex.needsUpdate = true;
    this.fogDirty = false;
  }

  /** Terrain colours for the minimap (1 px = 1 m), painted once. */
  private paintMinimap(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 180;
    const g = c.getContext('2d');
    if (!g) return c;
    const img = g.createImageData(180, 180);
    for (let zz = 0; zz < 180; zz++)
      for (let xx = 0; xx < 180; xx++) {
        const x = xx - HALF + 0.5;
        const z = zz - HALF + 0.5;
        const river =
          distToPolyline(x, z, RIVER).d < RIVER_HALF_WIDTH ||
          Math.hypot(x - POOL.center[0], z - POOL.center[1]) < POOL.radius;
        const col = river
          ? new THREE.Color(0x4f9fc8)
          : groundColor(x, z).multiplyScalar(0.9 + heightAt(x, z) * 0.02);
        col.convertLinearToSRGB();
        const i = (zz * 180 + xx) * 4;
        img.data[i] = col.r * 255;
        img.data[i + 1] = col.g * 255;
        img.data[i + 2] = col.b * 255;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ------------------------------------------------------------ hero + frame

  setHero(id: 'warrior' | 'sage' | 'rider'): void {
    if (this.heroId === id) return;
    if (this.hero) this.scene.remove(this.hero.mesh);
    const motion: Motion =
      id === 'rider'
        ? { speed: 2.4, leg: 0.3, arm: 0, armSync: 0 }
        : { speed: 6.5, leg: 0.5, arm: 0.35, armSync: 0 };
    this.hero = new Crowd(heroGeometry(id), 1, 1, motion, [HERO_CLOTH[id]]);
    this.hero.mesh.receiveShadow = currentLook().shadows;
    this.heroId = id;
    this.scene.add(this.hero.mesh);
    this.ring.scale.setScalar(id === 'rider' ? 2.4 : 1);
  }

  /** The carried block rides on the hero's head (on the elephant for the rider); the pile grows. */
  private syncStone(hero: HeroState | null, work: { carrying: boolean; delivered: number }, t: number): void {
    const show = !!hero && hero.alive && work.carrying;
    this.carried.visible = show;
    if (show && hero) {
      const up = this.heroId === 'rider' ? 3.5 : 2.2;
      this.carried.position.set(hero.x, heightAt(hero.x, hero.z) + up + Math.sin(t * 6) * 0.03, hero.z);
      this.carried.rotation.y = hero.heading;
    }
    const n = Math.min(this.pile.instanceMatrix.count, work.delivered);
    if (n === this.pileShown) return;
    this.pileShown = n;
    const [px, pz] = this.cfg.quarry.pile;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      // Three by two on the ground, then smaller layers on top.
      const layer = i < 6 ? 0 : i < 10 ? 1 : i < 13 ? 2 : 3;
      const k = layer === 0 ? i : layer === 1 ? i - 6 : layer === 2 ? i - 10 : i - 13;
      const cols = [3, 2, 2, 1][layer]!;
      const x = px + ((k % cols) - (cols - 1) / 2) * 1.15 + layer * 0.1;
      const z = pz + (Math.floor(k / cols) - 0.5) * 0.85;
      m.makeRotationY(((i * 37) % 7) * 0.03);
      m.setPosition(x, heightAt(px, pz) + layer * 0.55, z);
      this.pile.setMatrixAt(i, m);
    }
    this.pile.count = n;
    this.pile.instanceMatrix.needsUpdate = true;
  }

  showClick(x: number, z: number, now: number): void {
    this.marker.position.set(x, heightAt(x, z) + 0.08, z);
    this.markerAt = now;
  }

  /** Aim the camera: target point, distance and pitch (RTS view looking north). */
  aim(tx: number, tz: number, dist: number, pitchDeg: number): void {
    const p = THREE.MathUtils.degToRad(pitchDeg);
    const ty = heightAt(tx, tz) + 1;
    this.camera.position.set(tx, ty + Math.sin(p) * dist, tz + Math.cos(p) * dist);
    this.camera.lookAt(tx, ty, tz);
  }

  update(
    now: number,
    hero: HeroState | null,
    renderer: THREE.WebGLRenderer,
    work: { cutting: boolean; carrying: boolean; delivered: number } = {
      cutting: false,
      carrying: false,
      delivered: 0,
    },
  ): void {
    const t = now / 1000;
    this.syncStone(hero, work, t);
    if (this.hero && hero) {
      const u = this.hero.material.userData.uniforms as { uLeg: { value: number }; uArm: { value: number } };
      const moving = hero.moving;
      u.uLeg.value += ((moving ? (this.heroId === 'rider' ? 0.3 : 0.5) : 0) - u.uLeg.value) * 0.2;
      u.uArm.value += ((moving ? 0.35 : 0.04) - u.uArm.value) * 0.2;
      const y = heightAt(hero.x, hero.z);
      this.hero.agents = [
        {
          place: () => ({
            x: hero.x,
            y,
            z: hero.z,
            heading: hero.heading,
            bob: hero.alive ? 0 : -3,
            // Cutting stone: the chisel-and-mallet swing; carrying: arms up to the load.
            act: work.cutting ? ACT.hammer : work.carrying && this.heroId !== 'rider' ? ACT.carry : undefined,
          }),
        },
      ];
      this.hero.mesh.count = 1;
      this.hero.update(t);
      this.hero.mesh.visible = hero.alive;
      this.ring.position.set(hero.x, y + 0.06, hero.z);
      this.ring.visible = hero.alive;
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.25 * Math.sin(t * 3);
      // Sun and its shadow follow the hero.
      this.sun.position.set(hero.x + SUN_DIR.x * 120, y + SUN_DIR.y * 120, hero.z + SUN_DIR.z * 120);
      this.sun.target.position.set(hero.x, y, hero.z);
      // See-through hole in the foliage around the hero.
      const v = new THREE.Vector3(hero.x, y + 1.3, hero.z).project(this.camera);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      this.hole.uHeroPx.value.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
      this.hole.uHeroDepth.value = v.z * 0.5 + 0.5;
      this.hole.uHoleR.value = 190 * (size.x / 1080);
      // Fade foliage in the front part of the view (the bottom of the screen).
      this.hole.uNear.value = this.camera.position.distanceTo(new THREE.Vector3(hero.x, y, hero.z)) * 0.72;
    }
    const k = (now - this.markerAt) / 600;
    const mm = this.marker.material as THREE.MeshBasicMaterial;
    mm.opacity = k >= 0 && k < 1 ? 0.9 * (1 - k) : 0;
    this.marker.scale.setScalar(1 + k * 1.2);
    const wm = (this.water.material as THREE.MeshStandardMaterial).map;
    if (wm) wm.offset.y = -(t * 0.25) % 1;
    (this.fireflies.material as THREE.PointsMaterial).opacity = 0.55 + 0.45 * Math.sin(t * 2.3);
    this.effects.update(now);
    if (this.fogDirty) this.refreshFog();
  }
}

/**
 * Steps and edging along the switchback path down the cliff (TRAILS[CLIFF_TRAIL]): a
 * sandstone step wherever the path climbs, laterite kerb stones along both sides.
 */
export function cliffSteps(): THREE.InstancedMesh[] {
  const path = TRAILS[CLIFF_TRAIL]!;
  const steps: THREE.Matrix4[] = [];
  const kerbs: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let sinceKerb = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]!;
    const [bx, bz] = path[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    const heading = Math.atan2(bx - ax, bz - az);
    q.setFromAxisAngle(up, heading);
    for (let d = 0; d < len; d += 1.1) {
      const x = ax + ((bx - ax) * d) / len;
      const z = az + ((bz - az) * d) / len;
      if (z < 36 || z > 70) continue; // only where the path goes down the cliff
      const h0 = heightAt(x, z);
      const h1 = heightAt(x + ((bx - ax) / len) * 1.1, z + ((bz - az) / len) * 1.1);
      if (Math.abs(h1 - h0) > 0.14)
        steps.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, Math.max(h0, h1) - 0.06, z),
            q,
            new THREE.Vector3(1, 1, 1),
          ),
        );
      sinceKerb += 1.1;
      if (sinceKerb >= 2.2 && Math.abs(h1 - h0) > 0.05) {
        sinceKerb = 0;
        const nx = Math.cos(heading);
        const nz = -Math.sin(heading);
        for (const side of [-1, 1]) {
          const kx = x + nx * side * (TRAIL_HALF_WIDTH + 0.2);
          const kz = z + nz * side * (TRAIL_HALF_WIDTH + 0.2);
          kerbs.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(kx, heightAt(kx, kz) + 0.1, kz),
              q,
              new THREE.Vector3(1, 1, 1),
            ),
          );
        }
      }
    }
  }
  const mk = (geo: THREE.BufferGeometry, color: number, list: THREE.Matrix4[]) => {
    const mesh = new THREE.InstancedMesh(
      geo,
      addRim(new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), 0.1),
      Math.max(1, list.length),
    );
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.count = list.length;
    return shadows(mesh, true, true);
  };
  return [
    mk(new THREE.BoxGeometry(TRAIL_HALF_WIDTH * 1.7, 0.22, 0.55), 0xb8a57c, steps),
    mk(new THREE.BoxGeometry(0.5, 0.45, 0.9), 0x9a5a3a, kerbs),
  ];
}
