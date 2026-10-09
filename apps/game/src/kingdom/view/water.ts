import * as THREE from 'three';
import type { Diorama } from '@temples/shared';

/**
 * Living water for the Kingdom (PK's Anno-style plan, D79): the colour deepens with the
 * depth below (read from the ground's own heights), two layers of moving ripples catch the
 * sun and the sky, and white foam laps where the water meets the shore. Brown Mekong silt
 * is mixed in, as on the Tonle Sap. One plane over the whole map.
 */
export function heightTexture(heights: Float32Array, n: number): THREE.DataTexture {
  const t = new THREE.DataTexture(heights, n, n, THREE.RedFormat, THREE.FloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export interface Water {
  mesh: THREE.Mesh;
  update(t: number): void;
}

export function makeWater(
  heights: THREE.DataTexture,
  size: number,
  level: number,
  sunDir: THREE.Vector3,
): Water {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uHeight: { value: heights },
      uSize: { value: size },
      uTime: { value: 0 },
      uSun: { value: sunDir.clone().normalize() },
      uShallow: { value: new THREE.Color(0x4f9c8a) },
      uDeep: { value: new THREE.Color(0x173f4b) },
      uSilt: { value: new THREE.Color(0x8a7349) },
      uSky: { value: new THREE.Color(0xbfd8e8) },
    },
  ]);
  uniforms.uHeight!.value = heights;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uHeight; uniform float uSize; uniform float uTime; uniform vec3 uSun;
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSilt; uniform vec3 uSky;
      varying vec3 vWorld;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float waves(vec2 p) {
        return vnoise(p * 0.35 + vec2(uTime * 0.3, uTime * 0.2)) * 0.6
             + vnoise(p * 0.9 - vec2(uTime * 0.25, -uTime * 0.4)) * 0.3
             + vnoise(p * 2.3 + uTime * 0.6) * 0.1;
      }
      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        float ground = texture2D(uHeight, uv).r;
        float depth = max(0.0, vWorld.y - ground);
        if (depth < 0.01) discard;
        float e = 0.15, h0 = waves(vWorld.xz);
        vec3 n = normalize(vec3(h0 - waves(vWorld.xz + vec2(e, 0.0)), e * 2.2, h0 - waves(vWorld.xz + vec2(0.0, e))));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 body = mix(mix(uShallow, uDeep, smoothstep(0.05, 0.55, depth)), uSilt, 0.2);
        vec3 col = mix(body, uSky, 0.06 + fres * 0.45);
        vec3 hv = normalize(uSun + v);
        col += vec3(1.0, 0.86, 0.6) * pow(max(dot(n, hv), 0.0), 220.0) * 2.0;
        float foam = smoothstep(0.09, 0.0, depth) * smoothstep(0.45, 0.7, vnoise(vWorld.xz * 1.6 + uTime));
        foam += smoothstep(0.03, 0.0, depth) * 0.5;
        col = mix(col, vec3(0.97, 0.96, 0.9), clamp(foam, 0.0, 0.85));
        gl_FragColor = vec4(col, mix(0.6, 0.95, smoothstep(0.0, 0.7, depth)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  mesh.position.y = level;
  mesh.renderOrder = 1;
  return {
    mesh,
    update(t: number) {
      uniforms.uTime!.value = t;
    },
  };
}

/**
 * The time of day's sky for the water's fake reflection (PK 1.7.0): four stepped colours
 * (noon, dawn or dusk, night), picked by how dark the night is (0 day … 1 full night) and
 * whether the sun is rising.
 */
export function skyStep(
  cfg: Pick<PrekCfg, 'skyDawn' | 'skyNoon' | 'skyDusk' | 'skyNight'>,
  night: number,
  rising = false,
): string {
  if (night >= 0.8) return cfg.skyNight;
  if (night >= 0.2) return rising ? cfg.skyDawn : cfg.skyDusk;
  return cfg.skyNoon;
}

export type PrekCfg = Diorama['water'];

/**
 * Prek canal water for the HD-2D diorama (PK 1.7.0, docs/VISUAL_BIBLE.md). No mirror: real
 * reflections (screen-space or a second camera) would smear at this angle, cost a second
 * draw of the world, and turn shallow silty canals into alpine lakes. Instead:
 *
 * 1. depth fade from shallow jade over the silt bed to deep teal (the ground's own heights
 *    give the depth, steadier than the depth buffer);
 * 2. a Fresnel sky tint, pow(1 − N·V, power), in the time of day's stepped sky colour;
 * 3. a quantised cel sun glint: Blinn-Phong cut into a sharp 2-step band;
 * 4. a crisp off-white foam line where the water meets the bank;
 * 5. two slow ripple layers drifting in opposite directions (a gentle current).
 *
 * Every number: config/kingdom/diorama.json → water.
 */
export function makePrekWater(
  heights: THREE.DataTexture,
  size: number,
  level: number,
  sunDir: THREE.Vector3,
  cfg: PrekCfg,
): Water & { setSky(hex: string): void } {
  const col = (h: string) => new THREE.Color(h);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uHeight: { value: heights },
      uSize: { value: size },
      uTime: { value: 0 },
      uSun: { value: sunDir.clone().normalize() },
      uShallow: { value: col(cfg.shallow) },
      uDeep: { value: col(cfg.deep) },
      uSilt: { value: col(cfg.silt) },
      uSky: { value: col(cfg.skyNoon) },
      uFoam: { value: col(cfg.foam) },
      uDepths: { value: new THREE.Vector2(cfg.shallowDepth, cfg.deepDepth) },
      uClarity: { value: new THREE.Vector3(cfg.clarity?.[0] ?? 0.72, cfg.clarity?.[1] ?? 0.96, cfg.caustics ?? 0) },
      uFresnel: { value: cfg.fresnelPower },
      uSpec: { value: new THREE.Vector3(cfg.specSize, cfg.specBand, cfg.specStrength) },
      uFoamDepth: { value: cfg.foamDepth },
      uRipple: { value: new THREE.Vector3(cfg.rippleSpeed, cfg.rippleScale, cfg.rippleStrength) },
    },
  ]);
  uniforms.uHeight!.value = heights;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uHeight; uniform float uSize; uniform float uTime; uniform vec3 uSun;
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSilt; uniform vec3 uSky; uniform vec3 uFoam;
      uniform vec3 uClarity;
      uniform vec2 uDepths; uniform float uFresnel; uniform vec3 uSpec; uniform float uFoamDepth; uniform vec3 uRipple;
      varying vec3 vWorld;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // Two low-frequency ripple layers panned against each other (the canal's current).
      float ripples(vec2 p) {
        vec2 a = p / uRipple.y + vec2(uTime * uRipple.x, uTime * uRipple.x * 0.4);
        vec2 b = p / (uRipple.y * 0.63) - vec2(uTime * uRipple.x * 0.8, -uTime * uRipple.x * 0.55);
        return vnoise(a) * 0.6 + vnoise(b) * 0.4;
      }
      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        float ground = texture2D(uHeight, uv).r;
        float depth = max(0.0, vWorld.y - ground);
        if (depth < 0.005) discard;
        float e = 0.2, h0 = ripples(vWorld.xz);
        vec3 n = normalize(vec3((h0 - ripples(vWorld.xz + vec2(e, 0.0))) * uRipple.z, e * 1.6,
                                (h0 - ripples(vWorld.xz + vec2(0.0, e))) * uRipple.z));
        vec3 v = normalize(cameraPosition - vWorld);
        // 1. Depth fade: jade over the silt bed, then deep teal.
        float k = smoothstep(uDepths.x, uDepths.y, depth);
        vec3 body = mix(mix(uShallow, uSilt, 0.25 * (1.0 - k)), uDeep, k);
        // 2. Fresnel sky tint (no reflection of the world), in two hard steps.
        float fres = pow(1.0 - max(dot(n, v), 0.0), uFresnel);
        fres = floor(fres * 3.0 + 0.35) / 3.0;
        vec3 col = mix(body, uSky, clamp(0.06 + fres * 0.6, 0.0, 0.7));
        // 2b. Crystal-clear shallows (PK 1.8.0): sunlight dancing on the bed (caustics), bright
        // where the water is shallow, gone in the deep.
        vec2 cp = vWorld.xz * 0.9;
        float ca = abs(sin(cp.x * 2.1 + uTime * 0.9 + sin(cp.y * 1.7 + uTime * 0.6) * 1.6))
                 * abs(sin(cp.y * 2.3 - uTime * 0.7 + sin(cp.x * 1.3 - uTime * 0.5) * 1.6));
        col += vec3(0.85, 1.0, 0.95) * smoothstep(0.55, 0.95, ca) * uClarity.z * (1.0 - k);
        // 3. Cel sun glint: Blinn-Phong cut into a sharp band.
        vec3 hv = normalize(uSun + v);
        float sp = dot(n, hv);
        float glint = smoothstep(uSpec.x - uSpec.y, uSpec.x + uSpec.y, sp);
        glint += 0.5 * smoothstep(uSpec.x - uSpec.y * 4.0, uSpec.x - uSpec.y * 2.0, sp) * (1.0 - glint);
        col += vec3(1.0, 0.93, 0.74) * glint * uSpec.z;
        // 4. A crisp foam line where the water meets the bank (no soft blur).
        float foam = step(depth, uFoamDepth);
        foam = max(foam, step(depth, uFoamDepth * 2.5) * step(0.7, vnoise(vWorld.xz * 3.1 + uTime * 0.6)) * 0.7);
        col = mix(col, uFoam, foam);
        // Clear in the shallows (the bed shows through), denser in the deep; foam is opaque.
        gl_FragColor = vec4(col, max(foam, mix(uClarity.x, uClarity.y, k)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  mesh.position.y = level;
  mesh.renderOrder = 1;
  mesh.userData.prek = true;
  return {
    mesh,
    update(t: number) {
      uniforms.uTime!.value = t;
    },
    setSky(hex: string) {
      (uniforms.uSky!.value as THREE.Color).set(hex);
    },
  };
}
