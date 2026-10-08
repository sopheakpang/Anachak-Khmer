import * as THREE from 'three';
import type { Diorama } from '@temples/shared';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * The Kingdom's Anno 1800-inspired graphics (PK's upgrade plan, D79), switched per quality
 * preset in config/quality.json ("kingdom"): soft contact shadows (ambient occlusion), a
 * gentle glow, the miniature close-up blur (tilt-shift) and a warm golden-hour grade.
 */
export interface KingdomGfx {
  ao: boolean;
  /** Ambient occlusion render size (0.5 = half: cheaper on the stream laptop). */
  aoScale: number;
  bloom: boolean;
  tiltShift: boolean;
  grade: boolean;
  water: 'shader' | 'flat';
  /** 1–5 tree kinds (common tree, banyan, bamboo, sugar palm, mango). */
  treeKinds: number;
  wind: boolean;
  /** Birds over the fields, cooking smoke, garden plots, palms on the paddy dikes. */
  life: boolean;
  /** Most egrets in the air at once near the view (PK: not too many birds). */
  birds: number;
  /** PK 1.6.0: real 3D models for trees, palms, rocks and banana plants (config/kingdom/props.json). */
  props?: boolean;
  /**
   * PK 1.7.0: the Angkor Cel-Diorama look (config/kingdom/diorama.json): NPR toon units with
   * ink outlines over stylised PBR land, the HD-2D long lens, tilt-shift and a warm/cool grade,
   * the laterite/emerald terrain splat and the Prek canal water, ground detail.
   */
  diorama?: boolean;
  /** PK 1.8.0: tall elephant grass rolling in the wind (diorama.json elephantGrass); its shadows. */
  elephantGrass?: boolean;
  grassShadows?: boolean;
  /** PK 1.8.0: real lights from the nearest night torches (0 = glow only). */
  torchLights?: number;
  /** PK 1.8.0: zoomed in, cover turns see-through round the people (diorama.json seeThrough). */
  seeThrough?: boolean;
}

export const NO_GFX: KingdomGfx = {
  ao: false,
  aoScale: 0.5,
  bloom: false,
  tiltShift: false,
  grade: false,
  water: 'flat',
  treeKinds: 1,
  wind: false,
  life: false,
  birds: 0,
  props: false,
  diorama: false,
};

/** The passes after the scene render, in order (empty = render straight to the screen). */
export function postChain(g: KingdomGfx): Array<'ao' | 'bloom' | 'output' | 'grade'> {
  const out: Array<'ao' | 'bloom' | 'output' | 'grade'> = [];
  // The diorama look (PK 1.7.0) has no screen-space AO (noisy, realistic): its block shadows
  // are painted into the terrain instead.
  if (g.ao && !g.diorama) out.push('ao');
  if (g.bloom) out.push('bloom');
  if (!out.length && !g.grade && !g.tiltShift && !g.diorama) return [];
  out.push('output');
  if (g.grade || g.tiltShift || g.diorama) out.push('grade');
  return out;
}

/** Tilt-shift blur (sharp band across the middle) and the warm grade with a light vignette. */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uFocus: { value: 0.5 },
    uBand: { value: 0.22 },
    uBlur: { value: 0 },
    uGrade: { value: 1 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    /** PK 1.7.0, the diorama grade: warm golden highlights against cool blue shadows. */
    uDiorama: { value: 0 },
    uHi: { value: new THREE.Color(0xffd27a) },
    uSh: { value: new THREE.Color(0x5f86c8) },
    uSplit: { value: 0.16 },
    uContrast: { value: 1.1 },
    uSat: { value: 1.12 },
    uVig: { value: 0.12 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uFocus; uniform float uBand; uniform float uBlur; uniform float uGrade; uniform vec2 uRes;
    uniform float uDiorama; uniform vec3 uHi; uniform vec3 uSh; uniform float uSplit; uniform float uContrast; uniform float uSat; uniform float uVig;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    varying vec2 vUv;
    void main() {
      float k = smoothstep(uBand, uBand + 0.3, abs(vUv.y - uFocus)) * uBlur;
      vec3 c;
      if (k < 0.05) c = texture2D(tDiffuse, vUv).rgb;
      else {
        c = vec3(0.0); float ws = 0.0;
        for (int i = -3; i <= 3; i++) for (int j = -3; j <= 3; j++) {
          float w = exp(-float(i * i + j * j) / 6.0);
          c += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * k / uRes).rgb * w; ws += w;
        }
        c /= ws;
      }
      if (uDiorama > 0.5) {
        // Split toning: the shadows lean to the cool sky blue, the lights to warm gold (hue
        // only, the brightness stays), then contrast and saturation, and a soft vignette.
        float l = luma(c);
        vec3 sh = uSh / max(luma(uSh), 0.01);
        vec3 hi = uHi / max(luma(uHi), 0.01);
        c *= mix(mix(vec3(1.0), sh, uSplit), mix(vec3(1.0), hi, uSplit), smoothstep(0.18, 0.75, l));
        c = mix(vec3(luma(c)), c, uSat);
        c = (c - 0.5) * uContrast + 0.5;
        c *= mix(1.0 - uVig, 1.0, smoothstep(0.95, 0.35, length(vUv - 0.5)));
        c = max(c, 0.0);
      } else if (uGrade > 0.5) {
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 1.08);
        c = (c - 0.5) * 1.05 + 0.5;
        c += vec3(0.03, 0.015, -0.01) * (1.0 - l);
        c *= vec3(1.025, 1.0, 0.96);
        c *= mix(0.86, 1.0, smoothstep(0.95, 0.35, length(vUv - 0.5)));
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** The post-processing chain for the Kingdom view; render() replaces renderer.render(). */
/** Draw calls and triangles of one frame, split into the scene (shadows + view) and post. */
export interface FrameSplit {
  sceneCalls: number;
  sceneTriangles: number;
}

/**
 * The view pass. It counts like a plain `renderer.render` (three resets the counters after
 * the shadow maps, so the scene number means what it always did: the view, without shadows),
 * then freezes the shadow maps so the AO normal pass does not draw them a second time.
 */
class CountedRenderPass extends RenderPass {
  after: FrameSplit = { sceneCalls: 0, sceneTriangles: 0 };
  shadowsWereAuto = true;
  override render(...args: Parameters<RenderPass['render']>): void {
    const renderer = args[0];
    renderer.info.autoReset = true;
    super.render(...args);
    renderer.info.autoReset = false;
    const r = renderer.info.render;
    this.after = { sceneCalls: r.calls, sceneTriangles: r.triangles };
    this.shadowsWereAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
  }
}

export class KingdomPost {
  private composer: EffectComposer | null = null;
  private view: CountedRenderPass | null = null;
  private grade: ShaderPass | null = null;
  private ao: GTAOPass | null = null;
  private readonly size = new THREE.Vector2();
  private built = new THREE.Vector2();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly gfx: KingdomGfx,
    /** The diorama look's tilt-shift and grade (config/kingdom/diorama.json post). */
    private readonly diorama?: Diorama['post'],
  ) {}

  get enabled(): boolean {
    return postChain(this.gfx).length > 0;
  }

  private build(w: number, h: number): void {
    this.composer?.dispose();
    const c = new EffectComposer(this.renderer);
    c.setPixelRatio(1);
    c.setSize(w, h);
    this.view = new CountedRenderPass(this.scene, this.camera);
    c.addPass(this.view);
    for (const step of postChain(this.gfx)) {
      if (step === 'ao') {
        const s = this.gfx.aoScale;
        this.ao = new GTAOPass(this.scene, this.camera, Math.round(w * s), Math.round(h * s));
        this.ao.updateGtaoMaterial({ radius: 2.0, distanceExponent: 1.4, thickness: 2, scale: 1.1 });
        this.ao.blendIntensity = 0.75;
        c.addPass(this.ao);
      } else if (step === 'bloom') c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.18, 0.5, 0.88));
      else if (step === 'output') c.addPass(new OutputPass());
      else {
        this.grade = new ShaderPass(GRADE_SHADER);
        this.grade.uniforms.uGrade!.value = this.gfx.grade ? 1 : 0;
        this.grade.uniforms.uRes!.value = new THREE.Vector2(w, h);
        const D = this.gfx.diorama ? this.diorama : undefined;
        if (D) {
          const u = this.grade.uniforms;
          u.uDiorama!.value = 1;
          u.uBand!.value = D.focusBand;
          (u.uHi!.value as THREE.Color).set(D.highlight);
          (u.uSh!.value as THREE.Color).set(D.shadow);
          u.uSplit!.value = D.split;
          u.uContrast!.value = D.contrast;
          u.uSat!.value = D.saturation;
          u.uVig!.value = D.vignette;
        }
        c.addPass(this.grade);
      }
    }
    this.composer = c;
    this.built.set(w, h);
  }

  /**
   * Draw the view. `close` (0 far … 1 zoomed right in) sets the miniature blur: the closer
   * the camera, the stronger the tilt-shift, as in a model village.
   */
  /**
   * The scene's share of the last frame. The budget (600k triangles, 120 calls on Low) is for
   * the view as before post-processing; the AO normal pass and the full-screen passes are the
   * rest of `renderer.info` and are reported as post (D79).
   */
  split(): FrameSplit | null {
    return this.enabled && this.view ? this.view.after : null;
  }

  render(close: number): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.renderer.getSize(this.size);
    if (!this.composer || !this.size.equals(this.built)) this.build(this.size.x, this.size.y);
    if (this.grade) {
      const D = this.gfx.diorama ? this.diorama : undefined;
      // The diorama blurs at every zoom (a model village always looks small); more up close.
      this.grade.uniforms.uBlur!.value = D
        ? D.blur + (D.blurClose - D.blur) * close
        : this.gfx.tiltShift
          ? 0.6 + 2.2 * close
          : 0;
    }
    // Count the whole frame (scene, AO normals, glow, grade) for the budget meter, not just
    // the last full-screen pass.
    const info = this.renderer.info;
    info.autoReset = false;
    try {
      this.composer!.render();
    } finally {
      info.autoReset = true;
      if (this.view) this.renderer.shadowMap.autoUpdate = this.view.shadowsWereAuto;
    }
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}
