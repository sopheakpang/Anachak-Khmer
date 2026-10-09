import * as THREE from 'three';
import type { WeatherId } from '../sim/sim';

/**
 * Weather in the Kingdom tab (PK: changes every 30 minutes, D64): the light, the haze and
 * falling rain follow the simulation's weather. Everything is animated in vertex shaders
 * around the camera target, at most three Points draw calls, each hidden when unused:
 * rain streaks, ground splash rings (rain, storm) and blowing leaves (windy, half in a
 * storm). A storm adds lightning flashes. Unknown weather ids look clear.
 */

interface Look {
  sun: number;
  sky: number;
  fogNear: number;
  fogFar: number;
  fog: number;
  rain: number;
  /** Wind strength 0..1 (leaf drift, rain slant, tree sway, the sound bed). */
  wind: number;
  /** Share of the leaf cloud shown. */
  leaves: number;
}

const LOOKS: Record<WeatherId | 'windy', Look> = {
  clear: { sun: 1, sky: 1, fogNear: 150, fogFar: 520, fog: 0xf0dcb8, rain: 0, wind: 0.1, leaves: 0 },
  cloudy: { sun: 0.55, sky: 0.95, fogNear: 120, fogFar: 460, fog: 0xc9c6bc, rain: 0, wind: 0.25, leaves: 0 },
  rain: { sun: 0.35, sky: 0.8, fogNear: 70, fogFar: 330, fog: 0x9ea6a8, rain: 0.45, wind: 0.2, leaves: 0 },
  storm: { sun: 0.2, sky: 0.65, fogNear: 50, fogFar: 260, fog: 0x7c8488, rain: 0.7, wind: 0.6, leaves: 0.35 },
  mist: { sun: 0.6, sky: 0.95, fogNear: 25, fogFar: 180, fog: 0xe4e2dc, rain: 0, wind: 0.05, leaves: 0 },
  windy: { sun: 0.9, sky: 1, fogNear: 110, fogFar: 430, fog: 0xe6dcc4, rain: 0, wind: 0.65, leaves: 0.6 },
};

function lookFor(id: string): Look {
  return (LOOKS as Record<string, Look>)[id] ?? LOOKS.clear;
}

/** Wind blows along this ground direction (x, z), roughly across the screen. */
const WIND_DIR = new THREE.Vector2(1, 0.3).normalize();

const RAIN_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform float uWind;
  uniform vec3 uCenter;
  attribute float seed;
  void main() {
    vec3 p = position;
    // Fall 60 m in a loop, drift with the wind; drops beyond uAmount stay hidden.
    float y = mod(p.y - uTime * (22.0 + seed * 8.0), 60.0);
    vec3 w = vec3(uCenter.x + p.x + y * (0.12 + uWind * 0.3), y, uCenter.z + p.z + y * uWind * 0.09);
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = seed < uAmount ? 3.0 * (180.0 / -mv.z) : 0.0;
  }
`;

const RAIN_FRAGMENT = /* glsl */ `
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    // A thin streak: narrow across, long down.
    float a = smoothstep(0.12, 0.0, abs(c.x)) * smoothstep(0.5, 0.1, abs(c.y));
    gl_FragColor = vec4(0.82, 0.88, 0.95, a * 0.55);
  }
`;

/** Ripples: each point is one short-lived ring, re-placed by a hash every cycle. */
const SPLASH_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform vec3 uCenter;
  attribute float seed;
  varying float vPhase;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float cyc = uTime * (1.6 + seed * 1.2) + seed * 17.0;
    float n = floor(cyc);
    vPhase = fract(cyc);
    vec3 w = vec3(
      uCenter.x + (hash(n * 1.7 + seed * 91.0) - 0.5) * 90.0,
      0.05,
      uCenter.z + (hash(n * 2.3 + seed * 57.0) - 0.5) * 70.0 + 8.0);
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = seed < uAmount ? 1.2 * (1500.0 / -mv.z) : 0.0;
  }
`;

const SPLASH_FRAGMENT = /* glsl */ `
  varying float vPhase;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    c.y /= 0.62; // lying on the ground, seen from the RTS angle
    float r = length(c);
    float ring = vPhase * 0.46;
    float a = smoothstep(0.05, 0.0, abs(r - ring)) * (1.0 - vPhase);
    if (a < 0.02) discard;
    gl_FragColor = vec4(0.88, 0.93, 0.98, a * 0.85);
  }
`;

/**
 * Leaves (PK: they come off the trees, not out of the sky): each leaf belongs to one tree
 * crown near the view (`origin`, set from the CPU as the camera moves). It lets go of the
 * crown, falls and drifts down the wind, lands and fades, then starts again from its tree.
 */
const LEAF_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  uniform float uWind;
  uniform vec2 uWindDir;
  attribute float seed;
  attribute vec3 origin;
  varying float vSeed;
  varying float vSpin;
  varying float vFlip;
  void main() {
    float life = 5.0 + seed * 4.0;
    float ph = fract(uTime / life + seed * 7.0);
    float wob = sin(uTime * (2.0 + seed * 2.0) + seed * 40.0);
    // Start somewhere in the crown, then fall and blow downwind.
    vec3 p = origin + vec3(position.x, 0.0, position.z);
    p.xz += uWindDir * ph * life * (0.8 + 4.5 * uWind) + vec2(wob, cos(uTime * 1.7 + seed * 23.0)) * (0.3 + 0.6 * uWind);
    float fall = smoothstep(0.0, 0.85, ph);
    p.y = max(0.05, origin.y + position.y - (origin.y + position.y) * fall + wob * 0.25 * (1.0 - fall));
    vSeed = seed;
    vSpin = uTime * (1.5 + seed * 3.0) + seed * 6.28;
    vFlip = cos(uTime * (2.5 + seed * 2.5) + seed * 11.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fade = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.9, 1.0, ph));
    float on = (seed < uAmount && origin.y > 0.5) ? 1.0 : 0.0;
    gl_PointSize = on * fade * (0.7 + seed * 0.4) * (1500.0 / -mv.z);
  }
`;

const LEAF_FRAGMENT = /* glsl */ `
  varying float vSeed;
  varying float vSpin;
  varying float vFlip;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float cs = cos(vSpin), sn = sin(vSpin);
    c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
    c.x /= max(0.3, abs(vFlip)); // tumbling: the leaf turns edge-on and back
    // A pointed ellipse: width shrinks to a tip at both ends.
    float w = 0.2 * cos(c.y * 3.14159);
    float a = smoothstep(0.02, -0.02, abs(c.x) - w) * step(abs(c.y), 0.48);
    if (a < 0.05) discard;
    float k = fract(vSeed * 7.31);
    vec3 green = vec3(0.42, 0.62, 0.24);
    vec3 yellow = vec3(0.8, 0.72, 0.3);
    vec3 brown = vec3(0.72, 0.5, 0.28);
    vec3 col = k < 0.5 ? mix(green, yellow, k * 2.0) : mix(yellow, brown, k * 2.0 - 1.0);
    col *= 0.88 + 0.12 * sign(vFlip);                     // back of the leaf darker
    col *= 1.0 - 0.3 * smoothstep(0.03, 0.0, abs(c.x));      // midrib
    gl_FragColor = vec4(col, a);
  }
`;

function cloud(
  n: number,
  box: [number, number, number],
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform>,
  name: string,
): THREE.Points {
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box[0];
    pos[i * 3 + 1] = Math.random() * box[1];
    pos[i * 3 + 2] = (Math.random() - 0.5) * box[2];
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const p = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
    }),
  );
  p.name = name;
  p.frustumCulled = false;
  p.visible = false;
  return p;
}

export class WeatherFx {
  private readonly rainPts: THREE.Points;
  private readonly splashPts: THREE.Points;
  private readonly leafPts: THREE.Points;
  private readonly uniforms = {
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uWind: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
  };
  private readonly leafUniforms = {
    uTime: this.uniforms.uTime,
    uWind: this.uniforms.uWind,
    uCenter: this.uniforms.uCenter,
    uAmount: { value: 0 },
    uWindDir: { value: WIND_DIR.clone() },
  };
  private readonly sun: THREE.DirectionalLight | undefined;
  private readonly hemi: THREE.HemisphereLight | undefined;
  private sunBase: number;
  private hemiBase: number;
  /** Anachak Khmer's anime light: a stronger sun, less fill, a cool bounce from the ground. */
  animeLight(): void {
    this.sunBase *= 1.16;
    this.hemiBase *= 0.62;
    if (this.hemi) this.hemi.groundColor.setHex(0x5f6f8f);
  }

  /**
   * The 3D hero mode's haze (Anachak Khmer): near, far and colour for clear weather; rain and
   * mist still shorten it in proportion. Null = the weather's own fog.
   */
  heroFog: { near: number; far: number; color: THREE.Color } | null = null;
  /**
   * How far the camera stands back (m). The haze starts beyond what the view looks at, so a
   * zoomed-out view stays clear (PK: no grey filter when zoomed out).
   */
  zoom = 0;
  /** How dark the night is now, 0..1 (Anachak Khmer's day and night; 0 elsewhere). */
  night = 0;
  /** The moon's light now, 0 (none) .. 1 (full moon high); 0.5 = the night light as configured (PK 1.8.0). */
  moonlight = 0.5;
  /**
   * PK 1.8.0: sunrise and sunset 0..1 (the sun low), the sun's colour then and the glow of the
   * sky round it (linear colours; the season picks them: sim/sunPath.ts).
   */
  golden = 0;
  readonly goldenSun = new THREE.Color(1, 0.75, 0.45);
  readonly goldenSky = new THREE.Color(1, 0.7, 0.5);
  private goldenShown = -1;
  private nightLook: {
    sun: number;
    sky: number;
    zenith: THREE.Color;
    horizon: THREE.Color;
    fog: THREE.Color;
  } | null = null;
  private nightBase: Array<{ apply: (n: number) => void }> = [];
  private nightShown = -1;
  /**
   * Turn on the day and night (Anachak Khmer, PK): at night the sun and sky light fall to
   * their night share, the haze turns deep blue, and the sky dome, horizon hills and clouds
   * darken. Colours are display (sRGB) hex.
   */
  setNight(N: { sun: number; sky: number; zenith: string; horizon: string; fog: string }): void {
    const disp = (h: string) => new THREE.Color(h).convertLinearToSRGB();
    this.nightLook = {
      sun: N.sun,
      sky: N.sky,
      zenith: disp(N.zenith),
      horizon: disp(N.horizon),
      fog: new THREE.Color(N.fog),
    };
    this.nightBase = [];
    const NL = this.nightLook;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m) return;
      const sh = m as THREE.ShaderMaterial;
      if (o.renderOrder === -10 && sh.uniforms?.zenith && sh.uniforms.horizon) {
        const z0 = (sh.uniforms.zenith.value as THREE.Color).clone();
        const h0 = (sh.uniforms.horizon.value as THREE.Color).clone();
        const g0 = (sh.uniforms.ground?.value as THREE.Color | undefined)?.clone();
        const s0 = (sh.uniforms.sunColor?.value as THREE.Color | undefined)?.clone();
        this.nightBase.push({
          apply: (n) => {
            // Sunrise and sunset (PK 1.8.0): the horizon glows in the season's colours, the
            // sky above warms a little, the sun turns gold, orange or rose and burns brighter.
            const g = this.golden;
            const sky = this.goldenSky.clone().convertLinearToSRGB();
            (sh.uniforms.zenith!.value as THREE.Color).copy(z0).lerp(sky, g * 0.25).lerp(NL.zenith, n);
            (sh.uniforms.horizon!.value as THREE.Color).copy(h0).lerp(sky, g * 0.8).lerp(NL.horizon, n);
            if (g0) (sh.uniforms.ground!.value as THREE.Color).copy(g0).multiplyScalar(1 - 0.75 * n);
            if (s0)
              (sh.uniforms.sunColor!.value as THREE.Color)
                .copy(s0)
                .lerp(this.goldenSun.clone().convertLinearToSRGB(), g)
                .multiplyScalar((1 + 1.6 * g) * (1 - n * (1 - 0.85 * g)));
          },
        });
        return;
      }
      // Shared materials (the clouds) are set to the same value by each entry: harmless.
      let follow = false;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.followCamera) follow = true;
      if (!follow) return;
      if (m instanceof THREE.MeshBasicMaterial) {
        const c0 = m.color.clone();
        const dark = NL.horizon.clone();
        this.nightBase.push({ apply: (n) => m.color.copy(c0).lerp(dark, n * 0.85) });
      } else if (m instanceof THREE.MeshStandardMaterial) {
        // Clouds and far hills go dark and moonlit blue at night (PK 1.8.0: a real night sky).
        const e0 = m.emissiveIntensity;
        const c0 = m.color.clone();
        const dark = NL.horizon.clone().multiplyScalar(0.9);
        this.nightBase.push({
          apply: (n) => {
            m.emissiveIntensity = e0 * (1 - 0.88 * n);
            m.color.copy(c0).lerp(dark, n * 0.8);
          },
        });
      }
    });
  }
  private readonly look: Look = { ...LOOKS.clear };
  private readonly fogColor = new THREE.Color();
  private flash = 0;
  private nextFlash = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.rainPts = cloud(3000, [140, 60, 140], RAIN_VERTEX, RAIN_FRAGMENT, this.uniforms, 'weather-rain');
    this.splashPts = cloud(250, [1, 0, 1], SPLASH_VERTEX, SPLASH_FRAGMENT, this.uniforms, 'weather-splash');
    this.leafPts = cloud(500, [3, 1.5, 3], LEAF_VERTEX, LEAF_FRAGMENT, this.leafUniforms, 'weather-leaves');
    this.leafPts.geometry.setAttribute(
      'origin',
      new THREE.BufferAttribute(new Float32Array(500 * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    scene.add(this.rainPts, this.splashPts, this.leafPts);
    this.sun = scene.children.find((o) => o instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    this.hemi = scene.children.find((o) => o instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
    this.sunBase = this.sun?.intensity ?? 1;
    this.hemiBase = this.hemi?.intensity ?? 1;
  }

  /**
   * The tree crowns leaves fall from: [x, crownY, z] triples, nearest trees first. Each leaf
   * is given one crown (leaves spread over up to 80 trees); with no trees near, no leaves.
   */
  setLeafSources(crowns: ArrayLike<number>): void {
    const attr = this.leafPts.geometry.getAttribute('origin') as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    const n = Math.min(80, Math.floor(crowns.length / 3));
    for (let i = 0; i < attr.count; i++) {
      if (!n) {
        a[i * 3 + 1] = 0;
        continue;
      }
      const k = (i % n) * 3;
      a[i * 3] = crowns[k]!;
      a[i * 3 + 1] = crowns[k + 1]!;
      a[i * 3 + 2] = crowns[k + 2]!;
    }
    attr.needsUpdate = true;
  }

  /** Eased wind strength 0..1 (sway trees, drive the wind sound). */
  get wind(): number {
    return this.look.wind;
  }

  /** Eased rain amount 0..1 (the rain sound bed). */
  get rain(): number {
    return this.look.rain;
  }

  /** Ease toward the weather's look; t in seconds; (x, z) where the camera looks. */
  update(id: WeatherId | 'windy' | (string & {}), t: number, x: number, z: number, dt: number): void {
    const want = lookFor(id);
    const k = Math.min(1, dt * 0.5); // about two seconds to change over
    const L = this.look;
    L.sun += (want.sun - L.sun) * k;
    L.sky += (want.sky - L.sky) * k;
    L.fogNear += (want.fogNear - L.fogNear) * k;
    L.fogFar += (want.fogFar - L.fogFar) * k;
    L.rain += (want.rain - L.rain) * k;
    L.wind += (want.wind - L.wind) * k;
    L.leaves += (want.leaves - L.leaves) * k;
    // Lightning in a storm: a bright flash now and then.
    if (id === 'storm' && t > this.nextFlash) {
      this.flash = 1;
      this.nextFlash = t + 4 + Math.random() * 8;
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    const NL = this.nightLook;
    const n = NL ? this.night : 0;
    const sunK = NL ? 1 - (1 - Math.min(1, NL.sun * (0.5 + this.moonlight))) * n : 1;
    const skyK = NL ? 1 - (1 - NL.sky) * n : 1;
    if (this.sun) this.sun.intensity = this.sunBase * L.sun * sunK + this.flash * 2.5;
    if (this.hemi) this.hemi.intensity = this.hemiBase * L.sky * skyK + this.flash;
    // The image-based light (environment map) dims at night too.
    if (NL) this.scene.environmentIntensity = 1 - 0.8 * n;
    if (NL && (Math.abs(n - this.nightShown) > 0.004 || Math.abs(this.golden - this.goldenShown) > 0.004)) {
      this.nightShown = n;
      this.goldenShown = this.golden;
      for (const b of this.nightBase) b.apply(n);
    }
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog && this.heroFog) {
      const clear = LOOKS.clear!;
      fog.near = this.heroFog.near * (L.fogNear / clear.fogNear);
      fog.far = this.heroFog.far * (L.fogFar / clear.fogFar);
      this.fogColor.copy(this.heroFog.color).lerp(new THREE.Color(want.fog), id === 'clear' ? 0 : 0.6);
      // The haze takes the glow of sunrise and sunset (PK 1.8.0).
      this.fogColor.lerp(this.goldenSky, this.golden * 0.45);
      if (NL) this.fogColor.lerp(NL.fog, n);
      fog.color.lerp(this.fogColor, k);
    } else if (fog) {
      // Weather still thickens the haze (rain, mist), in proportion, but never over the view.
      const clear = LOOKS.clear!;
      const thick = L.fogFar / clear.fogFar;
      fog.near = Math.max(L.fogNear, this.zoom * 2.4 * thick);
      fog.far = Math.max(L.fogFar, fog.near + this.zoom * 4 * thick + 200);
      this.fogColor.setHex(want.fog);
      this.fogColor.lerp(this.goldenSky, this.golden * 0.3);
      if (NL) this.fogColor.lerp(NL.fog, n * 0.85);
      fog.color.lerp(this.fogColor, k);
    }
    this.uniforms.uTime.value = t;
    this.uniforms.uAmount.value = L.rain;
    this.uniforms.uWind.value = L.wind;
    this.uniforms.uCenter.value.set(x, 0, z);
    this.leafUniforms.uAmount.value = L.leaves;
    this.rainPts.visible = L.rain > 0.02;
    this.splashPts.visible = L.rain > 0.1;
    this.leafPts.visible = L.leaves > 0.02;
  }
}
