import * as THREE from 'three';

/**
 * Sword slashes (PK: a sword-slash effect for the tiger fight): a bright crescent that sweeps
 * through the swing and fades, white at its leading edge and the kit's colour in its tail,
 * drawn additively over the anime look. A small pool of meshes is reused; one draw each while
 * it shows.
 */

const VERT = /* glsl */ `
  attribute float aK;
  attribute float aR;
  varying float vK;
  varying float vR;
  void main() {
    vK = aK;
    vR = aR;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export const SLASH_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSweep;
  varying float vK;
  varying float vR;
  void main() {
    // Only the part of the arc the blade has passed shows; the newest part is brightest.
    float head = uSweep;
    if (vK > head) discard;
    float tail = smoothstep(head - 0.75, head, vK);
    float edge = 1.0 - abs(vR - 0.62) * 2.2;
    // A stepped dissolve as it fades (PK 1.6.0): the arc breaks up in blocky cells, four
    // hard steps, not a soft fade, so the slash stays sharp to its end.
    float cell = fract(sin(dot(floor(vec2(vK * 26.0, vR * 5.0)), vec2(12.9898, 78.233))) * 43758.5453);
    float gone = floor((1.0 - uOpacity) * 4.0 + 0.5) / 4.0;
    if (cell < gone) discard;
    float a = clamp(tail * edge, 0.0, 1.0) * (0.55 + 0.45 * uOpacity);
    vec3 c = mix(uColor, vec3(1.0), smoothstep(0.55, 1.0, tail) * smoothstep(0.4, 0.8, vR));
    gl_FragColor = vec4(c * a * 1.6, a);
  }`;

/** A crescent: inner and outer radius, the arc's length (radians), with k along and r across. */
export function crescentGeometry(inner = 0.7, outer = 1.9, arc = 2.7, seg = 28): THREE.BufferGeometry {
  const pos: number[] = [];
  const k: number[] = [];
  const r: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = -arc / 2 + t * arc;
    // The crescent is thin at both tips and full in the middle.
    const w = Math.sin(t * Math.PI) * 0.85 + 0.15;
    const ro = inner + (outer - inner) * w;
    for (const [rad, rr] of [
      [inner, 0],
      [ro, 1],
    ] as const) {
      pos.push(Math.sin(a) * rad, 0, Math.cos(a) * rad);
      k.push(t);
      r.push(rr);
    }
    if (i < seg) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(k, 1));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(r, 1));
  g.setIndex(idx);
  return g;
}

interface Live {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  grow: number;
}

export class Slashes {
  readonly group = new THREE.Group();
  private readonly geo = crescentGeometry();
  private readonly pool: Live[] = [];
  /** Live slashes now (for the tests). */
  get live(): number {
    return this.pool.filter((l) => l.mesh.visible).length;
  }

  constructor(size = 4) {
    for (let i = 0; i < size; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: SLASH_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(0xbfe4ff) },
          uOpacity: { value: 0 },
          uSweep: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, t: 0, dur: 0.22, grow: 1 });
    }
  }

  /**
   * A slash in front of (x, z) facing `heading`: `combo` 0 sweeps right to left, 1 left to
   * right, 2 comes down overhead; `size` scales it (a skill's spin is bigger); `color` its tint.
   */
  spawn(x: number, y: number, z: number, heading: number, combo: number, size = 1, color = 0xbfe4ff): void {
    const l = this.pool.find((p) => !p.mesh.visible) ?? this.pool[0]!;
    const m = l.mesh;
    m.visible = true;
    m.position.set(x + Math.sin(heading) * 0.35, y, z + Math.cos(heading) * 0.35);
    m.rotation.set(0, 0, 0);
    if (combo === 2) {
      // Overhead: the arc stands up in the facing plane.
      m.rotation.set(0, heading, 0);
      m.rotateZ(Math.PI / 2);
      m.rotateY(0.15);
    } else {
      // Flat and a little tilted, like a sword swung across the body.
      m.rotation.set(combo === 1 ? 0.28 : -0.28, heading, combo === 1 ? -0.2 : 0.2);
    }
    // The second blow comes back the other way: the arc is mirrored.
    m.scale.set(combo === 1 ? -size : size, size, size);
    l.mat.uniforms.uColor!.value.setHex(color);
    l.t = 0;
    l.dur = 0.2 + 0.06 * size;
    l.grow = size;
  }

  update(dt: number): void {
    for (const l of this.pool) {
      if (!l.mesh.visible) continue;
      l.t += dt;
      const k = l.t / l.dur;
      if (k >= 1) {
        l.mesh.visible = false;
        continue;
      }
      l.mat.uniforms.uSweep!.value = Math.min(1, k * 2.4);
      l.mat.uniforms.uOpacity!.value = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
      const s = l.grow * (0.9 + k * 0.25);
      l.mesh.scale.set(Math.sign(l.mesh.scale.x) * s, s, s);
    }
  }

  clear(): void {
    for (const l of this.pool) l.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    for (const l of this.pool) l.mat.dispose();
  }
}
