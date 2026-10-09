/**
 * The diorama terrain (PK 1.7.0, docs/VISUAL_BIBLE.md): stylised PBR ground that splats its
 * colours by slope and height, the way the land of Angkor looks from the air:
 *
 * - inclines, river and canal banks and the foot of the Kulen hills show warm laterite red;
 * - flat green lowland is lifted to a bright emerald, with dry paddy-earth patches;
 * - block-shadow ambient occlusion: hollows and the foot of slopes darken in a few hard
 *   steps (painted, not the noisy screen-space AO), baked once per vertex from the heights.
 *
 * Colours and thresholds: config/kingdom/diorama.json → terrain.
 */
import * as THREE from 'three';
import type { Diorama } from '@temples/shared';

export type TerrainCfg = Diorama['terrain'];

/**
 * Block AO per vertex of a square grid of heights (n × n): how far the ground lies below its
 * neighbourhood (within `r` vertices), 0 open … 1 deep in a hollow, in `steps` hard steps.
 */
export function blockAo(heights: Float32Array, n: number, steps: number, r = 2): Float32Array {
  const out = new Float32Array(heights.length);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const h = heights[z * n + x]!;
      let sum = 0;
      let k = 0;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (!dx && !dz) continue;
          const xx = Math.min(n - 1, Math.max(0, x + dx));
          const zz = Math.min(n - 1, Math.max(0, z + dz));
          sum += Math.max(0, heights[zz * n + xx]! - h);
          k++;
        }
      // About a metre of ground above on average = fully in shade.
      const occ = Math.min(1, (sum / k) * 1.1);
      out[z * n + x] = Math.floor(occ * steps + 0.25) / steps;
    }
  return out;
}

/** Where the laterite comes in by slope (0 flat … 1 wall): smooth between the thresholds. */
export function lateriteAt(slope: number, cfg: Pick<TerrainCfg, 'slopeFrom' | 'slopeTo'>): number {
  const t = (slope - cfg.slopeFrom) / Math.max(1e-4, cfg.slopeTo - cfg.slopeFrom);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

const lin = (hex: string) => new THREE.Color(hex);

/**
 * Add the splat to the ground's material (a soft MeshStandardMaterial with vertex colours).
 * The geometry needs an `aoBlock` attribute (blockAo). `wear` is the WearMap's texture over
 * the whole map (`worldSize` m wide): where it is high the grass gives way to bare earth.
 */
export function splatTerrain(
  m: THREE.MeshStandardMaterial,
  cfg: TerrainCfg,
  ground?: Diorama['ground'],
  wear?: THREE.Texture,
  worldSize = 1,
  wet?: Diorama['wet'],
): SplatUniforms {
  const prev = m.onBeforeCompile;
  const G = ground;
  const u = {
    uLaterite: { value: lin(cfg.laterite) },
    uSlope: { value: new THREE.Vector2(cfg.slopeFrom, cfg.slopeTo) },
    uAoSteps: { value: cfg.aoSteps },
    uAo: { value: cfg.aoStrength },
    uMeadowDark: { value: lin(G?.meadowDark ?? cfg.emerald) },
    uMeadowLight: { value: lin(G?.meadowLight ?? cfg.lowland) },
    uMeadowDry: { value: lin(G?.meadowDry ?? cfg.earth) },
    uForest: { value: lin(G?.forestFloor ?? cfg.emerald) },
    uSoil: { value: lin(G?.soil ?? cfg.earth) },
    uSoilDark: { value: lin(G?.soilDark ?? cfg.earth) },
    uSoilLight: { value: lin(G?.soilLight ?? cfg.earth) },
    uSoilRange: { value: new THREE.Vector2(G?.soilFrom ?? 0.2, G?.soilTo ?? 0.55) },
    uWear: { value: wear ?? null },
    uHasWear: { value: wear ? 1 : 0 },
    uWorld: { value: worldSize },
    // PK 1.8.0: dead leaves on the forest floor; wet ground and puddles on the mud after rain.
    uLitter: { value: lin(G?.litter ?? '#7a5532') },
    uWet: { value: 0 },
    uRain: { value: 0 },
    uTime: { value: 0 },
    uSky: { value: lin(wet?.sky ?? '#9fb6c8') },
    uPuddle: { value: new THREE.Vector3(wet?.puddleScale ?? 0.3, wet?.puddleCover ?? 0.35, wet?.darken ?? 0.35) },
  };
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aoBlock;\nattribute float aForest;\nvarying float vAoBlock;\nvarying float vForest;\nvarying vec3 vSplatPos;\nvarying vec3 vSplatN;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vAoBlock = aoBlock;
        vForest = aForest;
        vSplatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSplatN = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vAoBlock; varying float vForest; varying vec3 vSplatPos; varying vec3 vSplatN;
        uniform vec3 uLaterite; uniform vec2 uSlope; uniform float uAoSteps; uniform float uAo;
        uniform vec3 uMeadowDark; uniform vec3 uMeadowLight; uniform vec3 uMeadowDry; uniform vec3 uForest;
        uniform vec3 uSoil; uniform vec3 uSoilDark; uniform vec3 uSoilLight; uniform vec2 uSoilRange;
        uniform sampler2D uWear; uniform float uHasWear; uniform float uWorld;
        uniform vec3 uLitter; uniform float uWet; uniform float uRain; uniform float uTime; uniform vec3 uSky; uniform vec3 uPuddle;
        float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) { return sNoise(p) * 0.5 + sNoise(p * 2.07 + 13.1) * 0.27 + sNoise(p * 4.13 + 7.7) * 0.15 + sNoise(p * 8.3 + 3.3) * 0.08; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sPuddle = 0.0;
        {
          vec3 base = diffuseColor.rgb;
          vec2 p = vSplatPos.xz;
          float slope = 1.0 - clamp(normalize(vSplatN).y, 0.0, 1.0);
          float green = smoothstep(0.0, 0.06, base.g - max(base.r, base.b));
          // Forest floor: the built-in forest tiles are the darker greens.
          float forest = green * (1.0 - smoothstep(0.16, 0.24, dot(base, vec3(0.3, 0.55, 0.15))));
          // A natural lawn: broad meadow patches, finer mottling, and streaks of blades.
          float broad = fbm(p * 0.018);
          float mid = fbm(p * 0.11);
          float fine = sNoise(vec2(p.x * 1.9, p.y * 0.55)) * 0.5 + sNoise(vec2(p.x * 0.6, p.y * 2.3)) * 0.5;
          vec3 lawn = mix(uMeadowDark, uMeadowLight, smoothstep(0.32, 0.72, broad * 0.7 + mid * 0.3));
          lawn = mix(lawn, uMeadowDry, smoothstep(0.66, 0.88, broad) * 0.4);
          lawn *= 0.86 + 0.24 * fine;
          lawn = mix(lawn, uForest * (0.85 + 0.3 * mid), forest);
          // Dead leaves on the forest floor (PK 1.8.0): drifts of brown, single leaves in between.
          float drift = smoothstep(0.55, 0.75, fbm(p * 0.35));
          float leaves = max(drift * 0.55, smoothstep(0.7, 0.82, sNoise(p * 3.7)) * 0.7);
          lawn = mix(lawn, uLitter * (0.8 + 0.4 * sNoise(p * 5.3)), leaves * smoothstep(0.3, 0.9, vForest));
          vec3 c = mix(base, lawn, green);
          // Bare earth where people live, walk and work (the wear map), with a ragged edge.
          if (uHasWear > 0.5) {
            float w = texture2D(uWear, p / uWorld + 0.5).r;
            // A ragged, organic edge, only where the ground is worn at all (never speckles
            // on untouched meadow).
            float worn = smoothstep(0.01, 0.12, w);
            float edge = ((fbm(p * 0.22) - 0.5) * 0.55 + (sNoise(p * 1.7) - 0.5) * 0.2) * worn;
            float soil = smoothstep(uSoilRange.x, uSoilRange.y, w + edge) * green;
            vec3 earth = mix(uSoilDark, uSoil, smoothstep(0.25, 0.75, fbm(p * 0.6)));
            earth = mix(earth, uSoilLight, smoothstep(0.55, 0.9, sNoise(p * 3.1)) * 0.6);
            // Clods and footprints: small dark specks.
            earth *= 0.88 + 0.2 * smoothstep(0.2, 0.8, sNoise(p * 7.0));
            c = mix(c, earth, soil);
            // After rain (PK 1.8.0): puddles in the hollows of the mud paths, mirroring the sky,
            // rings where the drops fall.
            float hollow = smoothstep(1.0 - uPuddle.y, 1.0 - uPuddle.y + 0.06, fbm(p * uPuddle.x + 3.7));
            sPuddle = soil * hollow * smoothstep(0.25, 0.8, uWet);
            float drops = uRain * smoothstep(0.75, 0.95, sNoise(p * 4.0 + vec2(uTime * 3.1, -uTime * 2.3)));
            // Muddy water: the sky's colour, dimmed, over the dark mud, a lighter rim of wet clay.
            vec3 pool = mix(earth * 0.32, uSky * 0.62, 0.5) * (1.0 + drops * 0.3);
            float rimP = soil * smoothstep(1.0 - uPuddle.y - 0.05, 1.0 - uPuddle.y, fbm(p * uPuddle.x + 3.7)) * (1.0 - hollow);
            c = mix(c, earth * 0.7, rimP * smoothstep(0.25, 0.8, uWet) * 0.6);
            c = mix(c, pool, sPuddle);
            // A thin worn rim of yellowed grass round the earth.
            float rim = smoothstep(uSoilRange.x - 0.15, uSoilRange.x, w + edge) * (1.0 - soil) * green * worn;
            c = mix(c, mix(c, uMeadowDry, 0.5), rim * 0.35);
          }
          // Wet ground is darker, the mud most of all.
          if (uHasWear > 0.5) c *= 1.0 - uPuddle.z * uWet * (0.35 + 0.65 * smoothstep(uSoilRange.x, uSoilRange.y, texture2D(uWear, p / uWorld + 0.5).r));
          else c *= 1.0 - uPuddle.z * uWet * 0.35;
          // Laterite on the inclines and banks.
          float lat = smoothstep(uSlope.x, uSlope.y, slope + (sNoise(p * 0.6) - 0.5) * 0.05);
          c = mix(c, uLaterite * (0.85 + 0.3 * sNoise(p * 0.35)), lat);
          // Block-shadow AO: hard steps, a cool shade (never black).
          float ao = floor(vAoBlock * uAoSteps + 0.5) / uAoSteps;
          c *= mix(vec3(1.0), vec3(0.72, 0.76, 0.92), ao * uAo / 0.32);
          diffuseColor.rgb = c;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, sPuddle);`,
      );
  };
  const key = m.customProgramCacheKey();
  m.customProgramCacheKey = () => `${key}-splat-${wear ? 'w' : ''}`;
  return u;
}

/** The ground's uniforms the scene sets each frame (PK 1.8.0: wetness, rain, time, sky). */
export interface SplatUniforms {
  uWet: THREE.IUniform<number>;
  uRain: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uSky: THREE.IUniform<THREE.Color>;
}

/**
 * How wet the ground is after `dt` seconds: it soaks up quickly in rain or storm and dries
 * slowly after (rates per second from diorama.json → wet).
 */
export function wetness(wet: number, raining: boolean, dt: number, W: Pick<Diorama['wet'], 'soak' | 'dry'>): number {
  return Math.min(1, Math.max(0, wet + (raining ? W.soak : -W.dry) * dt));
}
