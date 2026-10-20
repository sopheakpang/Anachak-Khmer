/**
 * PK's real 3D props (1.6.0): Meshy models, shrunk by scripts/models/props.mjs, take the place
 * of the built-in shapes (trees, palms, rocks, banana plants) when the graphics preset has
 * props on. Each model is fitted to the size of the shape it replaces, so the map, the
 * clicks and the shadows stay where they were. A missing or broken file keeps the built-in
 * shape: the game never waits for a model.
 */
import * as THREE from 'three';
import type { PropSlot } from '@temples/shared';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { lowPoly, realLook, soft } from '../../engine/look';

/** The first mesh's geometry in the model's own space (its node transforms applied). */
export function meshOf(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

/**
 * Scale and place a model's geometry like the built-in one: the same height (`fit: height`)
 * or the same widest side (`width`), centred on the trunk, the base `sink` × height below
 * the ground. Faceted in the low-poly style, smooth-shaded in the stylised mid-poly look.
 */
export function fitGeometry(
  src: THREE.BufferGeometry,
  like: THREE.BufferGeometry,
  slot: Pick<PropSlot, 'fit' | 'sink' | 'scaleY' | 'scale'>,
  /** Faceted (low-poly style) or smooth (the stylised mid-poly look, PK 1.6.0). */
  faceted = lowPoly(),
): THREE.BufferGeometry {
  const g = faceted && src.index ? src.toNonIndexed() : src.clone();
  // The semi-realistic look keeps the model's own normals (smooth edges, normal maps; D152).
  const keepNormals = !faceted && realLook() && !!g.getAttribute('normal');
  for (const k of Object.keys(g.attributes))
    if (k !== 'position' && k !== 'color' && k !== 'uv' && !(keepNormals && k === 'normal')) g.deleteAttribute(k);
  g.computeBoundingBox();
  like.computeBoundingBox();
  const a = g.boundingBox!;
  const b = like.boundingBox!;
  const sa = a.getSize(new THREE.Vector3());
  const sb = b.getSize(new THREE.Vector3());
  const k =
    (slot.fit === 'height'
      ? sb.y / Math.max(1e-6, sa.y)
      : Math.max(sb.x, sb.z) / Math.max(1e-6, sa.x, sa.z)) * (slot.scale ?? 1);
  const cx = (a.min.x + a.max.x) / 2;
  const cz = (a.min.z + a.max.z) / 2;
  g.translate(-cx, -a.min.y, -cz);
  g.scale(k, k * (slot.scaleY ?? 1), k);
  g.translate(0, b.min.y - (slot.sink ?? 0) * sa.y * k, 0);
  if (!keepNormals) g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Brighten, saturate and tint a vertex-coloured plant (linear colours, clamped to 1). */
export function gradeColours(g: THREE.BufferGeometry, light: number, sat: number, tint?: string): void {
  const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!c) return;
  const t = new THREE.Color(tint ?? '#ffffff');
  for (let i = 0; i < c.count; i++) {
    const r = c.getX(i);
    const gr = c.getY(i);
    const b = c.getZ(i);
    const y = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    const f = (v: number, k: number) => Math.min(1, Math.max(0, (y + (v - y) * sat) * light * k));
    c.setXYZ(i, f(r, t.r), f(gr, t.g), f(b, t.b));
  }
  c.needsUpdate = true;
}

/**
 * The model's own PBR material for the semi-realistic look (D152): its colour, normal and
 * roughness maps kept, tinted; a missing roughness map gets a matte, weathered value.
 */
/** D156: how a building's colours blend with the land (props.json → blend). */
export interface Blend {
  color: string;
  amount: number;
  saturation: number;
  dust: string;
  dustHeight: number;
  dustAmount: number;
}

/**
 * D156: pull a material's colours toward the land and dust the foot of the walls with earth
 * (instanced buildings: the height is measured from each instance's base).
 */
export function addBlend(m: THREE.MeshStandardMaterial, b: Blend): THREE.MeshStandardMaterial {
  const env = new THREE.Color(b.color);
  const lum = Math.max(0.05, env.r * 0.299 + env.g * 0.587 + env.b * 0.114);
  const u = {
    uEnv: { value: new THREE.Vector3(env.r / lum, env.g / lum, env.b / lum) },
    uAmount: { value: b.amount },
    uSat: { value: b.saturation },
    uDust: { value: new THREE.Color(b.dust) },
    uDustH: { value: Math.max(0.01, b.dustHeight) },
    uDustA: { value: b.dustAmount },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBaseH;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vBaseH = (instanceMatrix * vec4(position, 1.0)).y - instanceMatrix[3].y;
        #else
          vBaseH = position.y;
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vBaseH;
        uniform vec3 uEnv; uniform float uAmount; uniform float uSat; uniform vec3 uDust; uniform float uDustH; uniform float uDustA;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float bl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(bl), diffuseColor.rgb, uSat);
        diffuseColor.rgb = mix(diffuseColor.rgb, bl * uEnv, uAmount);
        float dustF = (1.0 - smoothstep(0.0, uDustH, vBaseH)) * uDustA;
        diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.75 + 0.5 * bl), dustF);`,
      );
  };
  m.customProgramCacheKey = () => 'blend-land';
  m.userData.blend = u;
  return m;
}

export function realMaterial(own: THREE.Material, tint?: string): THREE.MeshStandardMaterial {
  const src = own as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    map: src.map ?? null,
    normalMap: src.normalMap ?? null,
    roughnessMap: src.roughnessMap ?? null,
    metalnessMap: src.metalnessMap ?? null,
    aoMap: src.aoMap ?? null,
    color: new THREE.Color(tint ?? '#ffffff'),
    roughness: src.roughnessMap ? 1 : 0.88,
    metalness: src.metalnessMap ? 1 : 0,
    side: src.side,
    alphaTest: src.alphaTest,
    transparent: false,
    // D164: models painted with vertex colours (the repainted fantasy plants) keep them.
    vertexColors: !!src.vertexColors,
  });
  if (src.normalMap) m.normalScale.copy(src.normalScale);
  return m;
}

const loads = new Map<string, Promise<THREE.Object3D | null>>();

/** Load a prop file once (null when it is missing or broken). */
export function loadProp(url: string): Promise<THREE.Object3D | null> {
  let p = loads.get(url);
  if (!p) {
    p = new GLTFLoader()
      .loadAsync(url)
      .then((g) => g.scene as THREE.Object3D)
      .catch(() => null);
    loads.set(url, p);
  }
  return p;
}

/**
 * Put a loaded prop on an instanced mesh. Baked plants keep the mesh's own (vertex-colour,
 * maybe wind-swayed) material; textured props (rocks) get the game's soft material with
 * their colour map and the slot's tint. Instance colours are reset to white so an old tint
 * (the built-in fruit bush's orange) does not paint the model.
 */
export function applyProp(mesh: THREE.InstancedMesh, model: THREE.Object3D, slot: PropSlot, blend?: Blend): boolean {
  const src = meshOf(model);
  if (!src) return false;
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);
  // Baked plants are always smooth-shaded: their many small leaves look crumpled when faceted.
  const fitted = fitGeometry(geo, mesh.geometry, slot, slot.bake === 'vertex' ? false : undefined);
  geo.dispose();
  const old = mesh.geometry;
  mesh.geometry = fitted;
  old.dispose();
  if (slot.bake !== 'vertex') {
    const own = src.material as THREE.MeshStandardMaterial;
    const map = own.map ?? null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    const was = mesh.material as THREE.Material;
    mesh.material = realLook()
      ? blend
        ? addBlend(realMaterial(own, slot.tint), blend)
        : realMaterial(own, slot.tint)
      : soft({ map, color: new THREE.Color(slot.tint ?? '#ffffff'), roughness: 0.9 }, 0.15);
    // The built-in shape's material is no longer drawn (1.8.0: freed, unless a cache shares it).
    if (!was.userData.shared) was.dispose();
  } else if (!fitted.getAttribute('color')) {
    return false;
  } else {
    gradeColours(fitted, slot.light ?? 1, slot.sat ?? 1, slot.tint);
  }
  if (mesh.instanceColor) {
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < mesh.instanceMatrix.count; i++) mesh.setColorAt(i, white);
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.userData.prop = slot.file;
  return true;
}
