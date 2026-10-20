import * as THREE from 'three';
import type { RealWater } from '@temples/shared';
import type { Water } from './water';

/**
 * PK 2026-10-20 (D158) "shade stylized water look much reality": the PC look's water. It mirrors
 * the world — a planar reflection drawn from below the water's plane at a fraction of the
 * screen (as three.js's Reflector: mirrored camera, oblique near plane at the surface) — bent by
 * layered waves and fine ripples; Fresnel decides how much is mirror and how much you see into
 * the water; light is absorbed with depth (red first), the bed shows through the shallows; the
 * sun breaks into glitter; soft foam where it thins out at the bank. One plane over the map.
 */

/** Schlick's Fresnel: how much of the light is mirrored at this angle (cos = view · normal). */
export function fresnel(cos: number, f0: number): number {
  const c = Math.min(1, Math.max(0, cos));
  return f0 + (1 - f0) * Math.pow(1 - c, 5);
}

/** The colour left after `depth` m of water (Beer–Lambert, per-channel absorption per metre). */
export function transmit(depth: number, absorb: readonly [number, number, number]): [number, number, number] {
  return [Math.exp(-absorb[0] * depth), Math.exp(-absorb[1] * depth), Math.exp(-absorb[2] * depth)];
}

const hex = (h: string) => new THREE.Color(h);

export function makeRealWater(
  heights: THREE.DataTexture,
  size: number,
  level: number,
  sunDir: THREE.Vector3,
  cfg: RealWater,
): Water & {
  setSky(hex: string): void;
  setSun(dir: THREE.Vector3, color: THREE.Color, golden: number): void;
  /** Reflections drawn so far (tests, the 🖥 panel). */
  readonly reflections: number;
  /** Free the mirror's render target. */
  dispose(): void;
} {
  const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 });
  rt.texture.generateMipmaps = false;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uHeight: { value: heights },
      uSize: { value: size },
      uTime: { value: 0 },
      uSun: { value: sunDir.clone().normalize() },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uSky: { value: new THREE.Color(0xa9cfe0) },
      uDeep: { value: hex(cfg.deep) },
      uShallow: { value: hex(cfg.shallow) },
      uFoam: { value: hex(cfg.foam) },
      uAbsorb: { value: new THREE.Vector3(...cfg.absorb) },
      uClarity: { value: new THREE.Vector2(...cfg.clarity) },
      uF0: { value: cfg.f0 },
      uWave: { value: new THREE.Vector3(cfg.waveScale, cfg.waveStrength, cfg.rippleStrength) },
      uDistort: { value: cfg.distort },
      uShine: { value: new THREE.Vector2(cfg.sunShine, cfg.sunSharp) },
      uFoamDepth: { value: cfg.foamDepth },
      uMirror: { value: rt.texture },
      uMirrorOn: { value: 0 },
      uTexMat: { value: new THREE.Matrix4() },
    },
  ]);
  uniforms.uHeight!.value = heights;
  uniforms.uMirror!.value = rt.texture;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform mat4 uTexMat;
      varying vec3 vWorld;
      varying vec4 vMirror;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vMirror = uTexMat * w;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uHeight; uniform float uSize; uniform float uTime;
      uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uAbsorb;
      uniform vec2 uClarity; uniform float uF0; uniform vec3 uWave; uniform float uDistort;
      uniform vec2 uShine; uniform float uFoamDepth;
      uniform sampler2D uMirror; uniform float uMirrorOn;
      varying vec3 vWorld;
      varying vec4 vMirror;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // Slopes of four travelling waves (analytic) plus two layers of wind ripples (noise).
      vec2 slope(vec2 p) {
        vec2 s = vec2(0.0);
        float L = uWave.x;
        vec2 dirs[4];
        dirs[0] = normalize(vec2(1.0, 0.35)); dirs[1] = normalize(vec2(-0.6, 1.0));
        dirs[2] = normalize(vec2(0.25, -1.0)); dirs[3] = normalize(vec2(-1.0, -0.45));
        for (int i = 0; i < 4; i++) {
          float k = 6.2831853 / (L * (1.0 - 0.18 * float(i)));
          float w = sqrt(9.8 * k) * 0.35;
          float a = uWave.y / k * (1.0 - 0.2 * float(i));
          s += dirs[i] * a * k * cos(dot(dirs[i], p) * k - uTime * w);
        }
        float e = 0.08;
        vec2 q = p * 1.7 + vec2(uTime * 0.45, uTime * 0.3);
        float r0 = vnoise(q), rx = vnoise(q + vec2(e, 0.0)), rz = vnoise(q + vec2(0.0, e));
        vec2 q2 = p * 4.3 - vec2(uTime * 0.7, -uTime * 0.55);
        float t0 = vnoise(q2), tx = vnoise(q2 + vec2(e, 0.0)), tz = vnoise(q2 + vec2(0.0, e));
        s += uWave.z * (vec2(rx - r0, rz - r0) / e * 0.12 + vec2(tx - t0, tz - t0) / e * 0.05);
        return s;
      }
      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        float ground = texture2D(uHeight, uv).r;
        float depth = max(0.0, vWorld.y - ground);
        if (depth < 0.005) discard;
        // Waves calm down in the very shallows (no swell over a bed a hand deep).
        vec2 s = slope(vWorld.xz) * smoothstep(0.0, 0.35, depth);
        vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float cosv = max(dot(n, v), 0.0);
        float F = uF0 + (1.0 - uF0) * pow(1.0 - cosv, 5.0);
        // What the water mirrors: the world (planar reflection, bent by the waves), else the sky.
        vec3 refl = uSky;
        if (uMirrorOn > 0.5) {
          vec2 m = vMirror.xy / vMirror.w + n.xz * uDistort;
          refl = texture2D(uMirror, clamp(m, 0.001, 0.999)).rgb;
        }
        // What you see into the water: light absorbed with depth, the bed through the shallows.
        vec3 tr = exp(-uAbsorb * depth);
        vec3 body = mix(uDeep, uShallow, tr);
        vec3 col = mix(body, refl, F);
        // The sun on the waves: a sharp glint and a softer sheen (Blinn–Phong on the wave normal).
        vec3 h = normalize(uSun + v);
        float nh = max(dot(n, h), 0.0);
        col += uSunCol * (pow(nh, uShine.y) * uShine.x + pow(nh, uShine.y * 0.08) * 0.06) * step(0.0, uSun.y);
        // Soft foam where the water thins out at the bank, broken up by the ripples.
        float foam = smoothstep(uFoamDepth, 0.0, depth) * smoothstep(0.35, 0.75, vnoise(vWorld.xz * 2.4 + uTime * 0.3));
        col = mix(col, uFoam, foam * 0.75);
        float a = mix(uClarity.x, uClarity.y, 1.0 - (tr.g + tr.b) * 0.5);
        a = max(a, F * 0.9);
        a = max(a, foam);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
  mesh.position.y = level;
  mesh.renderOrder = 1;
  mesh.userData.realWater = true;

  // The mirror (three.js Reflector's maths): the camera reflected in the water's plane, its near
  // plane tilted onto the surface so nothing under the water is mirrored.
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const mirrorPos = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const rot = new THREE.Matrix4();
  const lookAt = new THREE.Vector3(0, 0, -1);
  const clip = new THREE.Vector4();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const q = new THREE.Vector4();
  const mirrorCam = new THREE.PerspectiveCamera();
  const texMat = uniforms.uTexMat!.value as THREE.Matrix4;
  let lastFrame = -1;
  let busy = false;
  let count = 0;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const frame = renderer.info.render.frame;
    // Once a frame (the AO pass draws the scene again), never from inside itself.
    if (busy || frame === lastFrame || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    lastFrame = frame;
    const cam = camera as THREE.PerspectiveCamera;
    const size2 = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size2.x * cfg.reflectScale));
    const hgt = Math.max(64, Math.round(size2.y * cfg.reflectScale));
    if (rt.width !== w || rt.height !== hgt) rt.setSize(w, hgt);
    mirrorPos.setFromMatrixPosition(mesh.matrixWorld);
    camPos.setFromMatrixPosition(cam.matrixWorld);
    rot.extractRotation(mesh.matrixWorld);
    normal.set(0, 1, 0);
    view.subVectors(mirrorPos, camPos);
    if (view.dot(normal) > 0) return; // under the water: nothing to mirror
    view.reflect(normal).negate();
    view.add(mirrorPos);
    rot.extractRotation(cam.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(mirrorPos, lookAt);
    target.reflect(normal).negate();
    target.add(mirrorPos);
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    mirrorCam.lookAt(target);
    mirrorCam.far = cam.far;
    mirrorCam.near = cam.near;
    mirrorCam.fov = cam.fov;
    mirrorCam.aspect = cam.aspect;
    mirrorCam.layers.mask = cam.layers.mask;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(cam.projectionMatrix);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    // The oblique near plane on the water's surface (a hair above, so the bank's foot shows).
    plane.setFromNormalAndCoplanarPoint(normal, mirrorPos.clone().setY(mirrorPos.y + 0.02));
    plane.applyMatrix4(mirrorCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = mirrorCam.projectionMatrix;
    q.x = (Math.sign(clip.x) + P.elements[8]!) / P.elements[0]!;
    q.y = (Math.sign(clip.y) + P.elements[9]!) / P.elements[5]!;
    q.z = -1.0;
    q.w = (1.0 + P.elements[10]!) / P.elements[14]!;
    clip.multiplyScalar(2.0 / clip.dot(q));
    P.elements[2] = clip.x;
    P.elements[6] = clip.y;
    P.elements[10] = clip.z + 1.0;
    P.elements[14] = clip.w;
    // Draw the mirror: no shadows recomputed, the water itself hidden.
    busy = true;
    mesh.visible = false;
    const prevRt = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(prevRt);
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.xr.enabled = prevXr;
    const vp = (cam as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }).viewport;
    if (vp) renderer.state.viewport(vp);
    mesh.visible = true;
    busy = false;
    uniforms.uMirrorOn!.value = 1;
    count++;
  };

  return {
    mesh,
    get reflections() {
      return count;
    },
    dispose() {
      rt.dispose();
    },
    update(t: number) {
      uniforms.uTime!.value = t;
    },
    setSky(h: string) {
      (uniforms.uSky!.value as THREE.Color).set(h);
    },
    setSun(dir: THREE.Vector3, color: THREE.Color, golden: number) {
      (uniforms.uSun!.value as THREE.Vector3).copy(dir).normalize();
      (uniforms.uSunCol!.value as THREE.Color).copy(color).multiplyScalar(1 + golden * 0.4);
    },
  };
}
