/**
 * NPR for the units (PK 1.7.0, the Angkor Cel-Diorama look, docs/VISUAL_BIBLE.md): people,
 * animals and the royal court are drawn flat and illustrative, like Genshin Impact's
 * characters, so they read clearly against the painted PBR land:
 *
 * - a 1D toon look-up table (LUT) steps the sunlight into a few flat bands (the dark band
 *   tinted cool), instead of a smooth gradient;
 * - an inverted-hull ink outline: the back faces drawn again in ink, pushed out along the
 *   normals by a constant number of screen pixels (so the line is as thick far away as near);
 * - a warm rim light on the silhouette, and a little extra saturation.
 *
 * The figures keep their GPU limb animation: the same vertex code runs in the toon pass and
 * in the outline pass, so the outline moves with the arms and legs. Every knob is in
 * config/kingdom/diorama.json → units (the three.js twin of Godot's inspector).
 */
import * as THREE from 'three';
import type { Diorama } from '@temples/shared';
import { LIMB_VERTEX } from '../../engine/figures';

export type NprCfg = Diorama['units'];

/** The crowd's per-vertex limb attributes and motion uniforms (as in crowdMaterial). */
const LIMB_DECL = /* glsl */ `
  attribute vec4 limb;
  attribute float limbZ;
  attribute float act;
  uniform float uTime; uniform float uSpeed; uniform float uLeg; uniform float uArm; uniform float uArmSync;`;

/**
 * The toon LUT as a 64-texel strip: light 0 → 1 left to right, each band a flat colour.
 * Below the second band the light is tinted toward `shadowTint` (cool shadows).
 */
export function toonRamp(cfg: Pick<NprCfg, 'ramp' | 'shadowTint'>, width = 64): THREE.DataTexture {
  const bands = [...cfg.ramp].sort((a, b) => a.from - b.from);
  const tint = new THREE.Color(cfg.shadowTint);
  const data = new Uint8Array(width * 4);
  const top = Math.max(...bands.map((b) => b.level));
  for (let i = 0; i < width; i++) {
    const x = (i + 0.5) / width;
    let band = 0;
    for (let k = 0; k < bands.length; k++) if (x >= bands[k]!.from) band = k;
    const level = bands[band]!.level;
    // The darkest band takes the full cool tint, the middle ones part of it, the lit one none.
    const cool = bands.length > 1 ? 1 - band / (bands.length - 1) : 0;
    const c = new THREE.Color(level, level, level).lerp(tint.clone().multiplyScalar(level), cool * 0.85);
    data.set(
      [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, v / Math.max(1, top)) * 255)).concat(255),
      i * 4,
    );
  }
  const t = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  // Crisp steps: no blending between the bands.
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Which band a light value falls in (for the tests and the sheet). */
export function bandOf(cfg: Pick<NprCfg, 'ramp'>, light: number): number {
  const bands = [...cfg.ramp].sort((a, b) => a.from - b.from);
  let band = 0;
  for (let k = 0; k < bands.length; k++) if (light >= bands[k]!.from) band = k;
  return band;
}

type Uniforms = Record<string, { value: unknown }>;

/**
 * A toon material for an animated crowd: vertex colours, instancing, the same limb motion
 * (sharing the crowd's `uniforms`, so time and speed keep flowing), the LUT read in colour
 * (three's toon shading reads only its red channel), rim light and saturation.
 */
export function toonCrowdMaterial(uniforms: Uniforms, ramp: THREE.DataTexture, cfg: NprCfg): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const extra = {
    uRim: { value: cfg.rim },
    uRimPower: { value: cfg.rimPower },
    uRimColor: { value: new THREE.Color(0xffe2b8) },
    uSat: { value: cfg.saturation },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, extra);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LIMB_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LIMB_VERTEX}`)
      .replace(
        '#include <color_vertex>',
        `vColor = color;
        #ifdef USE_INSTANCING_COLOR
          vColor = mix(vColor * (0.92 + 0.16 * fract(float(gl_InstanceID) * 0.618)), instanceColor, limb.w);
        #endif`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uRim; uniform float uRimPower; uniform vec3 uRimColor; uniform float uSat;',
      )
      .replace(
        '#include <gradientmap_pars_fragment>',
        THREE.ShaderChunk.gradientmap_pars_fragment.replace(
          'texture2D( gradientMap, coord ).r',
          'texture2D( gradientMap, coord ).rgb',
        ),
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          float g = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
          outgoingLight = mix(vec3(g), outgoingLight, uSat);
          float rim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), uRimPower);
          // A hard-edged rim (cel), brighter on the upper side of the figure.
          outgoingLight += uRimColor * step(0.45, rim) * uRim * (0.5 + 0.5 * saturate(normal.y + 0.5));
        }
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `npr-toon-${cfg.rim}-${cfg.rimPower}-${cfg.saturation}`;
  m.userData.uniforms = uniforms;
  return m;
}

/** World units per screen pixel per metre of distance (2·tan(fov/2) / screen height in px). */
export function pxScale(camera: THREE.PerspectiveCamera, heightPx: number): number {
  return (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, heightPx);
}

/**
 * The inverted-hull outline material: back faces only, in ink, each vertex pushed out along
 * its normal by `outlinePx` screen pixels, before the limb motion (so the hull bends with
 * the body).
 */
export function outlineMaterial(uniforms: Uniforms, cfg: NprCfg, px: { value: number }): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.outline), side: THREE.BackSide });
  const extra = { uOutlinePx: { value: cfg.outlinePx }, uPxScale: px };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, extra);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LIMB_DECL}\nuniform float uOutlinePx; uniform float uPxScale;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec4 eyeP = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          #else
            vec4 eyeP = modelViewMatrix * vec4(position, 1.0);
          #endif
          transformed += normalize(normal) * uOutlinePx * uPxScale * max(1.0, -eyeP.z);
        }
        ${LIMB_VERTEX}`,
      );
  };
  m.customProgramCacheKey = () => `npr-outline-${cfg.outlinePx}`;
  return m;
}

/**
 * The NPR pass for one scene: turns animated instanced meshes into toon figures with an
 * ink outline that follows them (same geometry, same instance matrices, same count).
 */
export class NprUnits {
  readonly ramp: THREE.DataTexture;
  /** Shared by every outline: updated once a frame from the camera. */
  readonly px = { value: 0.001 };
  private readonly done = new WeakSet<THREE.InstancedMesh>();
  private readonly hulls: THREE.InstancedMesh[] = [];

  constructor(readonly cfg: NprCfg) {
    this.ramp = toonRamp(cfg);
  }

  /** Make a crowd mesh NPR (once): toon material, and an outline mesh added beside it. */
  apply(mesh: THREE.InstancedMesh, parent: THREE.Object3D): THREE.InstancedMesh | null {
    if (this.done.has(mesh)) return null;
    this.done.add(mesh);
    const base = mesh.material as THREE.Material;
    const uniforms = (base.userData.uniforms as Uniforms | undefined) ?? {
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uLeg: { value: 0 },
      uArm: { value: 0 },
      uArmSync: { value: 0 },
    };
    mesh.material = toonCrowdMaterial(uniforms, this.ramp, this.cfg);
    if (this.cfg.outlinePx <= 0) return null;
    const hull = new THREE.InstancedMesh(mesh.geometry, outlineMaterial(uniforms, this.cfg, this.px), 1);
    hull.instanceMatrix = mesh.instanceMatrix;
    hull.count = mesh.count;
    hull.frustumCulled = false;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.userData.outlineOf = mesh;
    parent.add(hull);
    this.hulls.push(hull);
    return hull;
  }

  /** Keep the outline the same width on screen at any zoom, and on the same figures. */
  update(camera: THREE.PerspectiveCamera, heightPx: number): void {
    this.px.value = pxScale(camera, heightPx);
    for (let i = this.hulls.length - 1; i >= 0; i--) {
      const hull = this.hulls[i]!;
      const of = hull.userData.outlineOf as THREE.InstancedMesh;
      if (!of.parent) {
        // The figures were removed (e.g. the court redressed for a new era): so is the ink.
        hull.removeFromParent();
        this.hulls.splice(i, 1);
        continue;
      }
      hull.count = of.count;
      hull.visible = of.visible;
      if (hull.instanceMatrix !== of.instanceMatrix) hull.instanceMatrix = of.instanceMatrix;
    }
  }

  /** How many outlines follow figures now (for the tests). */
  get outlines(): number {
    return this.hulls.length;
  }
}
