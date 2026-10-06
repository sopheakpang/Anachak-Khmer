import * as THREE from 'three';

/**
 * Human anatomy for the hero figures (PK: "the model still does not look like a human"): one
 * sculpted torso instead of stacked capsules, limbs turned on anatomical profiles (deltoid,
 * biceps, forearm; thigh, knee, calf, ankle), hands with fingers and a thumb, shaped feet, and a
 * head with a jaw and chin carrying a painted 90s-anime face. Pure geometry: the figure in
 * body.ts places and dresses it.
 */

/** Smooth step 0..1 between a and b. */
const ss = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * The torso from the hips (y = 0) to the base of the neck (y ≈ 0.57), in the spine's frame:
 * an ellipse at each height, narrow at the waist, broad over the chest (a V shape), the
 * pectorals and the shoulder blades raised, the shoulders sloping into the neck.
 */
export function torsoGeometry(shell?: { grow: number; from: number; to: number }): THREE.BufferGeometry {
  // [y, half width, half depth]
  const rings: Array<[number, number, number]> = [
    [-0.04, 0.142, 0.106],
    [0.04, 0.138, 0.102],
    [0.12, 0.13, 0.098], // waist
    [0.2, 0.142, 0.104],
    [0.28, 0.162, 0.112],
    [0.36, 0.18, 0.118], // chest
    [0.42, 0.192, 0.116],
    [0.47, 0.196, 0.106], // shoulder line
    [0.515, 0.16, 0.088],
    [0.545, 0.1, 0.07], // trapezius into the neck
    [0.57, 0.058, 0.055],
  ];
  const seg = 28;
  const pos: number[] = [];
  const uv: number[] = [];
  // A shell (armour) follows the body a little outside it, over part of its height.
  const use = shell
    ? rings
        .filter(([y]) => y >= shell.from - 1e-6 && y <= shell.to + 1e-6)
        .map(([y, w, d]) => [y, w + shell.grow, d + shell.grow] as [number, number, number])
    : rings;
  const all = use;
  all.forEach(([y, w, d], i) => {
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2; // 0 = front (+z)
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      let rx = w;
      let rz = d;
      // Pectorals: two swellings on the upper front, a groove between them.
      const front = Math.max(0, cz);
      const pec = ss(0.28, 0.36, y) * (1 - ss(0.43, 0.49, y));
      const between = Math.exp(-((sx * 4.2) ** 2));
      rz += front * pec * (0.026 - 0.014 * between);
      // The belly a little flat, the back flatter, shoulder blades raised.
      const back = Math.max(0, -cz);
      rz -= back * 0.012;
      rz += back * Math.abs(sx) * ss(0.3, 0.4, y) * (1 - ss(0.46, 0.52, y)) * 0.018;
      // Lats: the sides flare under the arms.
      rx += Math.abs(sx) * ss(0.22, 0.34, y) * (1 - ss(0.44, 0.5, y)) * 0.008;
      pos.push(sx * rx, y, cz * rz);
      uv.push(j / seg, i / (all.length - 1));
    }
  });
  const idx: number[] = [];
  for (let i = 0; i < all.length - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  // Close the bottom (the hips sit in the sampot) and the top (under the neck).
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A limb turned on a profile: [t 0..1 along the limb, radius] from the joint down; the limb
 * hangs along −y from its joint. `flat` < 1 flattens it front to back (forearms, shins).
 */
export function limbGeometry(len: number, profile: Array<[number, number]>, flat = 1): THREE.BufferGeometry {
  const r0 = profile[0]![1];
  const r1 = profile[profile.length - 1]![1];
  const pts = [
    new THREE.Vector2(0.0001, r0 * 0.9),
    new THREE.Vector2(r0 * 0.7, r0 * 0.65),
    ...profile.map(([t, r]) => new THREE.Vector2(r, -t * len)),
    new THREE.Vector2(r1 * 0.7, -len - r1 * 0.6),
    new THREE.Vector2(0.0001, -len - r1 * 0.85),
  ];
  // Lathe points run top to bottom: reversed so the faces (and the ink behind them) look out.
  const g = new THREE.LatheGeometry(pts.reverse(), 16);
  if (flat !== 1) g.scale(1, 1, flat);
  g.computeVertexNormals();
  return g;
}

/** Upper arm: the deltoid's swell, the biceps, narrowing to the elbow. */
export const UPPER_ARM: Array<[number, number]> = [
  [0, 0.05],
  [0.2, 0.052],
  [0.45, 0.047],
  [0.75, 0.041],
  [1, 0.035],
];
/** Forearm: full below the elbow, slim at the wrist. */
export const FOREARM: Array<[number, number]> = [
  [0, 0.037],
  [0.2, 0.041],
  [0.55, 0.033],
  [1, 0.025],
];
/** Thigh: full at the hip, the quadriceps, narrowing to the knee. */
export const THIGH: Array<[number, number]> = [
  [0, 0.078],
  [0.25, 0.076],
  [0.6, 0.064],
  [0.9, 0.05],
  [1, 0.047],
];
/** Shin and calf: the calf swells high at the back, the ankle slim. */
export const SHIN: Array<[number, number]> = [
  [0, 0.046],
  [0.2, 0.053],
  [0.4, 0.049],
  [0.75, 0.032],
  [1, 0.028],
];

/**
 * A hand at the wrist (hanging along −y): the palm, four fingers a little curled, the thumb
 * across. `side` +1 left, −1 right (the thumb toward the front-inside).
 */
export function handGeometries(side: 1 | -1): { palm: THREE.BufferGeometry; fingers: THREE.BufferGeometry } {
  const palm = new THREE.SphereGeometry(0.03, 12, 10);
  palm.scale(0.9, 1.25, 0.5);
  palm.translate(0, -0.034, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const len = [0.032, 0.036, 0.034, 0.028][i]!;
    const f = new THREE.CapsuleGeometry(0.0075, len, 3, 6);
    // Each finger bends forward a little toward its tip.
    f.translate(0, -len / 2, 0);
    f.rotateX(0.35);
    f.translate(side * (-0.016 + i * 0.0105) * -1, -0.068, 0.002);
    parts.push(f);
  }
  const t = new THREE.CapsuleGeometry(0.0085, 0.026, 3, 6);
  t.translate(0, -0.013, 0);
  t.rotateZ(side * 0.6);
  t.rotateX(0.5);
  t.translate(side * 0.022, -0.03, 0.012);
  parts.push(t);
  const fingers = mergeAll(parts);
  return { palm, fingers };
}

/** A foot: heel, arch and the ball of the foot, toes forward (+z). */
export function footGeometry(): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(0.036, 0.11, 4, 10);
  g.rotateX(Math.PI / 2);
  g.scale(0.95, 0.62, 1);
  // Lower the toes, raise the arch a little.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z > 0.03) p.setY(i, p.getY(i) - (z - 0.03) * 0.15);
  }
  g.translate(0, -0.012, 0.045);
  g.computeVertexNormals();
  return g;
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ni = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of ni) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of ni) {
    g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/**
 * The head: a skull narrowing to a V jaw and a small firm chin (an anime face), the cheeks and
 * the back of the skull full. Radius `r`; the face (+z) is where the texture's u = 0.25 is.
 */
export function headGeometry(r = 0.105): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 36, 28);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const ny = y / r;
    if (ny < 0) {
      // The jaw narrows toward the chin, the chin comes a little forward.
      const k = Math.pow(-ny, 1.4);
      const front = Math.max(0, z / r);
      x *= 1 - 0.42 * k;
      z *= 1 - 0.18 * k * (1 - front);
      z += front * k * r * 0.12;
      y *= 1 + 0.12 * k;
    }
    // A flatter face, a fuller back of the head.
    if (z > 0) z *= 0.93;
    else z *= 1.06;
    p.setXYZ(i, x * 0.9, y * 1.1, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * The painted face (90s anime): almond eyes with a heavy upper lash line, a large iris with
 * two highlights, angled brows, a nose drawn as a small shadow, a short mouth. Drawn on the
 * head sphere's texture: u = 0.25 is the front. `w`×`h` canvas.
 */
export function paintFace(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: { skin: string; skinShade: string; eyes: string; hair: string; lips: string },
): void {
  g.fillStyle = c.skin;
  g.fillRect(0, 0, w, h);
  const cx = w * 0.25;
  // Polar angle → canvas y (0 = top of the head).
  const Y = (deg: number) => (deg / 180) * h;
  const X = (deg: number) => cx + (deg / 360) * w;
  // A soft shade under the jaw line and the cheeks (cel shadow, 2 tones).
  g.fillStyle = c.skinShade;
  g.beginPath();
  g.ellipse(cx, Y(150), w * 0.11, h * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  for (const s of [-1, 1]) {
    const ex = X(s * 21);
    const ey = Y(88);
    const ew = (26 / 360) * w;
    const eh = h * 0.05;
    // White of the eye: an almond, the outer corner lifted.
    g.fillStyle = '#fbf7ef';
    g.beginPath();
    g.moveTo(ex - ew * 0.55 * s, ey + eh * 0.15);
    g.quadraticCurveTo(ex, ey - eh * 0.95, ex + ew * 0.55 * s, ey - eh * 0.35);
    g.quadraticCurveTo(ex + ew * 0.2 * s, ey + eh * 0.85, ex - ew * 0.55 * s, ey + eh * 0.15);
    g.fill();
    // The iris, cut by the upper lid; the pupil; two highlights.
    g.save();
    g.clip();
    g.fillStyle = c.eyes;
    g.beginPath();
    g.ellipse(ex + ew * 0.05 * s, ey, ew * 0.3, eh * 0.95, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#120a08';
    g.beginPath();
    g.ellipse(ex + ew * 0.05 * s, ey + eh * 0.05, ew * 0.13, eh * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ex - ew * 0.06 * s, ey - eh * 0.35, Math.max(1.2, eh * 0.22), 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ex + ew * 0.16 * s, ey + eh * 0.35, Math.max(0.8, eh * 0.11), 0, Math.PI * 2);
    g.fill();
    // The upper lash line: heavy, sweeping out to a point.
    g.strokeStyle = '#1a100c';
    g.lineCap = 'round';
    g.lineWidth = Math.max(2, h * 0.012);
    g.beginPath();
    g.moveTo(ex - ew * 0.58 * s, ey + eh * 0.2);
    g.quadraticCurveTo(ex, ey - eh * 1.05, ex + ew * 0.62 * s, ey - eh * 0.45);
    g.stroke();
    // A fine lower lid.
    g.lineWidth = Math.max(1, h * 0.004);
    g.beginPath();
    g.moveTo(ex - ew * 0.3 * s, ey + eh * 0.75);
    g.quadraticCurveTo(ex + ew * 0.15 * s, ey + eh * 0.85, ex + ew * 0.5 * s, ey + eh * 0.15);
    g.stroke();
    // The brow: heavy and straight, low over the eye, angled down toward the nose (a stern,
    // kingly look; PK's reference).
    g.strokeStyle = c.hair;
    g.lineWidth = Math.max(3, h * 0.022);
    g.beginPath();
    g.moveTo(ex - ew * 0.55 * s, Y(79.5));
    g.quadraticCurveTo(ex + ew * 0.05 * s, Y(75), ex + ew * 0.66 * s, Y(76.5));
    g.stroke();
  }
  // The nose: a short shadow on one side and a hint of the nostril.
  g.strokeStyle = c.skinShade;
  g.lineWidth = Math.max(1.5, h * 0.008);
  g.beginPath();
  g.moveTo(X(3), Y(92));
  g.lineTo(X(4.5), Y(104));
  g.lineTo(X(1), Y(106));
  g.stroke();
  // The mouth: a short line, the lower lip a soft tone below.
  g.strokeStyle = c.lips;
  g.lineWidth = Math.max(1.5, h * 0.009);
  g.beginPath();
  g.moveTo(X(-6.5), Y(118.5));
  g.quadraticCurveTo(X(0), Y(118), X(6.5), Y(118.5));
  g.stroke();
  g.fillStyle = c.skinShade;
  g.globalAlpha = 0.6;
  g.beginPath();
  g.ellipse(X(0), Y(122), (5 / 360) * w, h * 0.008, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}
