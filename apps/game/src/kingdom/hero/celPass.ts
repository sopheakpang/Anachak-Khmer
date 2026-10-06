import * as THREE from 'three';

/**
 * The anime look for the 3D hero mode (PK: cel-shaded, like Genshin Impact): the live world
 * is drawn into a texture, then one full-screen pass bands the light into flat tones, lifts
 * the colours, and inks dark lines where the depth jumps (silhouettes) or the colour does
 * (inner lines), fading the ink with distance. Two draws on top of the scene.
 */

export const CEL_SHADER = {
  uniforms: {
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uNear: { value: 0.3 },
    uFar: { value: 1000 },
    uInk: { value: new THREE.Color(0x1c1420) },
    uBands: { value: 0.55 },
    /** Ink fades out between these distances (m): close for the hero, far for the RTS view. */
    uInkFade: { value: new THREE.Vector2(60, 180) },
    /** Colour lift (anime grade) and a warm glow on the brightest parts. */
    uSat: { value: 1.28 },
    uGlow: { value: 0.0 },
    /** Aerial haze (PK 1.6.0, stylised open-world look): far land fades into warm air. */
    uHaze: { value: new THREE.Color(0xf3dcb4) },
    uHazeRange: { value: new THREE.Vector2(200, 600) },
    uHazeMax: { value: 0.0 },
    /** 1 = show the ink only, 2 = the depth (for checking the pass). */
    uDebug: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes;
    uniform float uNear; uniform float uFar; uniform vec3 uInk; uniform float uBands; uniform float uDebug; uniform vec2 uInkFade; uniform float uSat; uniform float uGlow; uniform vec3 uHaze; uniform vec2 uHazeRange; uniform float uHazeMax;
    varying vec2 vUv;
    float depthAt(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(z, uNear, uFar);
    }
    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 px = max(1.0, uRes.y / 1080.0) * 2.0 / uRes; // line width follows the screen (crisp 90s line)
      vec3 c = texture2D(tColor, vUv).rgb;
      float d = depthAt(vUv);
      // Silhouettes: the depth jumps against the neighbours (relative to the distance).
      float dd = 0.0;
      float cl = 0.0;
      float l0 = lum(c);
      for (int i = 0; i < 4; i++) {
        vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
        float dn = depthAt(vUv + o);
        dd = max(dd, (dn - d) / max(d, 0.001));
        cl = max(cl, abs(lum(texture2D(tColor, vUv + o).rgb) - l0));
      }
      float edge = smoothstep(0.012, 0.04, dd) + smoothstep(0.1, 0.22, cl) * 0.5;
      edge *= 1.0 - smoothstep(uInkFade.x, uInkFade.y, d);
      edge = clamp(edge, 0.0, 1.0);
      // Flat tones: the light falls into bands, colour stays.
      float l = max(l0, 1e-4);
      // Two main tones (shadow, light) and a highlight, as cel art paints them.
      float band = l < 0.12 ? 0.08 : l < 0.45 ? 0.3 : l < 1.4 ? 0.85 : 1.25;
      vec3 toon = c * (band / l);
      c = mix(c, toon, uBands * (1.0 - smoothstep(uInkFade.y, uInkFade.y * 2.5, d)));
      // Concept-art light: cool blue shadows, warm sunlit tops.
      float lb = lum(c);
      c *= mix(vec3(0.72, 0.82, 1.15), vec3(1.04, 1.0, 0.9), smoothstep(0.12, 0.6, lb));
      // Brighter, cleaner colours (anime grade).
      float g = lum(c);
      c = mix(vec3(g), c, uSat);

      c *= 1.03;
      // Soft glow on the brightest parts (sunlit roofs, water, gold), cel-style.
      c += vec3(1.0, 0.86, 0.62) * smoothstep(0.75, 1.2, g) * uGlow;
      // A painted vignette.
      c *= mix(1.0, smoothstep(1.05, 0.35, length(vUv - 0.5)), uGlow);
      // Coloured ink: a dark shade of the surface, not plain black.
      c = mix(c, mix(uInk, c * 0.35, 0.6), edge * 0.85);
      // Aerial haze: distance washes into warm light, like a painted landscape.
      c = mix(c, uHaze, smoothstep(uHazeRange.x, uHazeRange.y, d) * uHazeMax);
      // The painted sky skips the grade and keeps its blue through the filmic tone curve
      // (which greys strong blues).
      vec3 raw = texture2D(tColor, vUv).rgb;
      float skyK = smoothstep(uFar * 0.6, uFar * 0.75, d);
      c = mix(c, raw, skyK);
      if (uDebug > 2.5) c = texture2D(tColor, vUv).rgb;
      else if (uDebug > 1.5) c = vec3(fract(d / 20.0));
      else if (uDebug > 0.5) c = vec3(1.0 - edge);
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** How the anime look is tuned: the hero's close camera, or the RTS view from above. */
export interface CelLook {
  inkFade: [number, number];
  bands: number;
  sat: number;
  glow: number;
  /** Warm aerial haze: colour, where it starts and is fullest (m), and how strong at most. */
  haze?: { color: number; near: number; far: number; max: number };
}
// 90s anime concept look (PK): strong flat bands, richer colour, crisp ink.
export const HERO_LOOK: CelLook = {
  inkFade: [60, 180],
  bands: 0.82,
  sat: 1.2,
  glow: 0.12,
  // PK 1.6.0: far hills and trees fade into warm air, like a painted open world.
  haze: { color: 0xf0dcbc, near: 70, far: 380, max: 0.38 },
};
export const RTS_LOOK: CelLook = { inkFade: [260, 700], bands: 0.62, sat: 1.14, glow: 0.08 };

export class CelPass {
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly quad: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();
  /** Scene draw calls and triangles of the last frame (the budget meter's split). */
  last = { sceneCalls: 0, sceneTriangles: 0 };

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CEL_SHADER.uniforms),
      vertexShader: CEL_SHADER.vertexShader,
      fragmentShader: CEL_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.mat.toneMapped = true;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
  }

  private ensure(w: number, h: number): THREE.WebGLRenderTarget {
    if (this.rt && this.rt.width === w && this.rt.height === h) return this.rt;
    this.rt?.dispose();
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthTexture: depth,
      depthBuffer: true,
    });
    return this.rt;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    look: CelLook = HERO_LOOK,
  ): void {
    renderer.getSize(this.size);
    const rt = this.ensure(this.size.x, this.size.y);
    const u = this.mat.uniforms;
    u.uInkFade!.value.set(look.inkFade[0], look.inkFade[1]);
    u.uBands!.value = look.bands;
    u.uSat!.value = look.sat;
    u.uGlow!.value = look.glow;
    u.uHazeMax!.value = look.haze?.max ?? 0;
    if (look.haze) {
      (u.uHaze!.value as THREE.Color).setHex(look.haze.color);
      u.uHazeRange!.value.set(look.haze.near, look.haze.far);
    }
    u.tColor!.value = rt.texture;
    u.tDepth!.value = rt.depthTexture;
    u.uRes!.value.set(this.size.x, this.size.y);
    u.uNear!.value = camera.near;
    u.uFar!.value = camera.far;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    const r = renderer.info.render;
    this.last = { sceneCalls: r.calls, sceneTriangles: r.triangles };
    renderer.setRenderTarget(null);
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.info.autoReset = false;
    renderer.render(this.quad, this.cam);
    renderer.info.autoReset = true;
    renderer.autoClear = auto;
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}

/** An anime sky: deep blue above, pale at the horizon, soft cumulus, a warm sun. */
export function animeSky(sunDir: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uSun: { value: sunDir.clone().normalize() }, uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uTime; uniform float uNight; varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        // Values chosen for the filmic tone curve: it lifts and greys bright blues.
        vec3 top = vec3(0.03, 0.17, 0.62);
        vec3 hor = vec3(0.4, 0.62, 0.86);
        vec3 c = mix(hor, top, pow(max(h, 0.0), 0.55));
        // Cumulus on a dome: flat bands of white with a soft blue shadow (cel clouds).
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + 0.25) * 1.6 + vec2(uTime * 0.01, 0.0);
          float n = fbm(uv);
          float cloud = smoothstep(0.6, 0.64, n);
          float shade = smoothstep(0.55, 0.75, fbm(uv + vec2(0.06, 0.05)));
          vec3 cc = mix(vec3(0.42, 0.5, 0.7), vec3(1.15), step(0.5, shade));
          c = mix(c, cc, cloud * smoothstep(0.02, 0.15, d.y));
        }
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.85, 0.55) * (smoothstep(0.9985, 0.9992, s) * 1.4 + pow(s, 48.0) * 0.25) * (1.0 - uNight);
        // Night (PK: firelight at night): a deep blue sky, dim clouds, stars and a moon.
        if (uNight > 0.001) {
          vec3 nc = mix(vec3(0.05, 0.08, 0.2), vec3(0.004, 0.012, 0.06), pow(max(h, 0.0), 0.5));
          vec2 sp = floor(d.xz / (d.y + 0.35) * 260.0);
          float star = step(0.9965, hash(sp)) * smoothstep(0.05, 0.3, d.y);
          nc += vec3(0.9, 0.92, 1.0) * star * (0.6 + 0.4 * sin(uTime * 2.0 + hash(sp) * 40.0));
          vec3 m = normalize(vec3(-uSun.x, max(0.35, uSun.y), -uSun.z));
          float ms = max(dot(d, m), 0.0);
          nc += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9990, 0.9994, ms) * 1.2 + pow(ms, 60.0) * 0.12);
          c = mix(c, nc + c * 0.08, uNight);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.visible = false;
  return m;
}
