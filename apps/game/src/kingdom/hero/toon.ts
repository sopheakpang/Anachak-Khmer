import * as THREE from 'three';
import { lowPoly } from '../../engine/look';

/** Toon shading pieces shared by the hero figures: three light bands and ink outlines. */

let gradient: THREE.DataTexture | null = null;

/**
 * Which look the hero figures wear (PK 1.6.0): 'anime' = hard cel tones and ink outlines;
 * 'build' = the Build and Expedition tabs' look: a soft light ramp (like plain diffuse light),
 * low-poly facets and no outlines. The materials stay toon materials either way, so nothing
 * that builds or bakes the figures changes.
 */
export type ToonLook = 'anime' | 'build';
let toonLook: ToonLook = 'anime';
const inks = new Set<THREE.Material>();

export function toonLookNow(): ToonLook {
  return toonLook;
}

/** Facets for the figures in the Build look (the low-poly style, D41). */
export function toonFlat(): boolean {
  return toonLook === 'build' && lowPoly();
}

/**
 * Facet a toon material. three.js's toon shader honours flatShading (FLAT_SHADED) though its
 * types leave the property off MeshToonMaterial.
 */
export function setFlat(m: THREE.Material, on: boolean): void {
  const f = m as THREE.Material & { flatShading?: boolean };
  if (f.flatShading === on) return;
  f.flatShading = on;
  m.needsUpdate = true;
}

function fillGradient(t: THREE.DataTexture): void {
  // Anime: two hard tones. Build: a soft ramp from a lit shadow side to full light.
  const v = toonLook === 'anime' ? [150, 150, 255, 255] : [120, 165, 210, 255];
  const d = t.image.data as Uint8Array;
  for (let i = 0; i < 4; i++) d.set([v[i]!, v[i]!, v[i]!, 255], i * 4);
  const f = toonLook === 'anime' ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = f;
  t.magFilter = f;
  t.needsUpdate = true;
}

/** Switch the figures' look; materials made earlier follow. */
export function setToonLook(l: ToonLook): void {
  toonLook = l;
  if (gradient) fillGradient(gradient);
  for (const m of toonCache.values()) setFlat(m, toonFlat());
  for (const m of inks) m.visible = l === 'anime';
}

/** Mark an outline material so it hides in the Build look. */
export function asInk<T extends THREE.Material>(m: T): T {
  inks.add(m);
  m.visible = toonLook === 'anime';
  return m;
}

/**
 * Two hard tones, as 90s anime cels were painted (PK: 90s anime concept-sheet style): one flat
 * shadow colour and one flat light colour, with a hard edge between them. In the Build look,
 * a soft ramp instead.
 */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array(16), 4, 1, THREE.RGBAFormat);
  gradient.generateMipmaps = false;
  fillGradient(gradient);
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: number, emissive = 0): THREE.MeshToonMaterial {
  const key = `${color}|${emissive}`;
  let m = toonCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      emissive,
      emissiveIntensity: emissive ? 0.6 : 0,
    });
    setFlat(m, toonFlat());
    toonCache.set(key, m);
  }
  return m;
}

let inkMat: THREE.MeshBasicMaterial | null = null;
/** Ink outline: the back faces pushed out along their normals, drawn dark and crisp (90s line art). */
export function ink(): THREE.MeshBasicMaterial {
  if (inkMat) return inkMat;
  inkMat = asInk(new THREE.MeshBasicMaterial({ color: 0x140c10, side: THREE.BackSide }));
  inkMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normalize(normal) * 0.016;',
    );
  };
  return inkMat;
}
