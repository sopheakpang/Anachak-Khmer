import * as THREE from 'three';
import {
  FOREARM,
  SHIN,
  THIGH,
  UPPER_ARM,
  footGeometry,
  handGeometries,
  headGeometry,
  limbGeometry,
  paintFace,
  torsoGeometry,
} from './anatomy';
import { ink, toonGradient } from './toon';

/**
 * Adult figures for the 3D hero mode (PK's character sheet: "make it look much more human"):
 * real proportions (about 7½ heads, 1.78 m), a mature anime face, and Angkorian dress drawn
 * with painted textures — the king's gold chest armour with crossed straps, engraved bracers
 * and armlets, a patterned silk sampot with a gold front panel, anklets, long earrings and the
 * crown (a low tiered diadem before the Angkor Wat era, the tall Mokot after). Textures are
 * painted on canvases at start (no image files). Joints are groups, posed by HeroModel.
 */

export interface Dress {
  skin: number;
  hair: number;
  eyes: number;
  /** Sampot base and its pattern (silk for the court, plain cotton for villagers). */
  cloth: number;
  pattern: number;
  trim: number;
  /** Sampot length: knee for work and war, mid-calf for the king. */
  long: boolean;
  /**
   * How it is worn: a wrapped skirt (the king, the court), or sampot chang kben — the end drawn
   * between the legs and tucked at the back, full at the thighs, to the knee (PK's reference
   * for soldiers and commoners).
   */
  cut: 'skirt' | 'kben';
  /** Gold chest armour (king), a lighter collar and straps (commander), or none. */
  armor: 'royal' | 'general' | null;
  crown: 'mokot' | 'diadem' | 'band' | 'helmet' | null;
  /**
   * The cloth by rank (Zhou Daguan: only the ruler wears cloth with dense flowers, the great
   * officials sparse flowers, the people plain cloth).
   */
  weave: 'dense' | 'sparse' | 'plain';
  /** Gold by rank: the king's full set, a soldier's armlets, or none for commoners. */
  jewels: 'royal' | 'some' | 'none';
  /** The tall pointed Mokot (Angkor Wat era on) or the low tiered crown before it. */
  tallCrown: boolean;
  bracers: boolean;
}

export interface Joints {
  body: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  gripR: THREE.Group;
  gripL: THREE.Group;
}

// ---------------------------------------------------------------- painted textures

const texCache = new Map<string, THREE.CanvasTexture>();
function canvasTex(
  key: string,
  w: number,
  h: number,
  paint: (g: CanvasRenderingContext2D) => void,
): THREE.Texture | null {
  const hit = texCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null; // tests in Node: plain colours
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The painted face for a dress (skin, eyes, hair), one texture per colour set. */
function faceTexture(d: Dress): THREE.Texture | null {
  const shade = new THREE.Color(d.skin).multiplyScalar(0.8).getHex();
  return canvasTex(`face|${d.skin}|${d.eyes}|${d.hair}`, 512, 256, (g) =>
    paintFace(g, 512, 256, {
      skin: hex(d.skin),
      skinShade: hex(shade),
      eyes: hex(d.eyes),
      hair: hex(d.hair),
      lips: '#8a4a3a',
    }),
  );
}

/** Silk sampot: a lattice of small diamonds and four-petal flowers, a gold border at the hem. */
export function sampotTexture(
  base: number,
  pattern: number,
  trim: number,
  weave: Dress['weave'] = 'dense',
): THREE.Texture | null {
  return canvasTex(`sampot|${base}|${pattern}|${trim}|${weave}`, 256, 256, (g) => {
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = hex(pattern);
    g.fillStyle = hex(pattern);
    g.lineWidth = 2;
    if (weave === 'plain') {
      // Plain cotton: only the weave shows, faint threads across, and a narrow dyed border.
      g.globalAlpha = 0.35;
      for (let y = 0; y < 236; y += 6) g.fillRect(0, y, 256, 1);
      g.globalAlpha = 1;
      g.fillRect(0, 238, 256, 18);
      return;
    }
    // Flowers: a dense lattice for the king, scattered flowers for the great officials.
    const step = weave === 'dense' ? 32 : 64;
    for (let y = 0; y < 220; y += step)
      for (let x = 0; x < 256; x += step) {
        const ox = (y / step) % 2 ? step / 2 : 0;
        const cx = x + ox;
        const cy = y + step / 2;
        g.beginPath();
        g.moveTo(cx, cy - 12);
        g.lineTo(cx + 12, cy);
        g.lineTo(cx, cy + 12);
        g.lineTo(cx - 12, cy);
        g.closePath();
        g.stroke();
        for (const [dx, dy] of [
          [0, -4],
          [4, 0],
          [0, 4],
          [-4, 0],
        ] as const)
          g.fillRect(cx + dx - 1.5, cy + dy - 1.5, 3, 3);
      }
    // The hem: red and green woven stripes over a gold band with a row of small triangles
    // (the reliefs' bordered hems; PK's reference).
    if (weave === 'dense') {
      g.fillStyle = '#b8322a';
      g.fillRect(0, 206, 256, 6);
      g.fillStyle = '#3f7a34';
      g.fillRect(0, 214, 256, 5);
    }
    g.fillStyle = hex(trim);
    g.fillRect(0, 222, 256, 34);
    g.fillStyle = hex(base);
    for (let x = 0; x < 256; x += 16) {
      g.beginPath();
      g.moveTo(x, 256);
      g.lineTo(x + 8, 240);
      g.lineTo(x + 16, 256);
      g.fill();
    }
  });
}

/** Engraved gold: scrolls (kbach-like curls) in a frame, for armour, bracers, belt and crown. */
export function goldTexture(): THREE.Texture | null {
  return canvasTex('gold', 256, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#f6d77a');
    grad.addColorStop(0.5, '#d9a83a');
    grad.addColorStop(1, '#f2c95c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#8a5a14';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 244, 244);
    g.lineWidth = 2.2;
    for (let y = 24; y < 256; y += 48)
      for (let x = 24; x < 256; x += 48) {
        g.beginPath();
        g.arc(x, y, 14, Math.PI * 0.2, Math.PI * 1.6);
        g.stroke();
        g.beginPath();
        g.arc(x + 6, y - 2, 6, Math.PI, Math.PI * 2.4);
        g.stroke();
        g.beginPath();
        g.moveTo(x - 14, y + 10);
        g.quadraticCurveTo(x, y + 22, x + 16, y + 8);
        g.stroke();
      }
    g.fillStyle = '#fff4c0';
    for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 250, (i * 97) % 250, 2, 2);
  });
}

// ---------------------------------------------------------------- parts

const toonTex = new Map<string, THREE.MeshToonMaterial>();
function texToon(tex: THREE.Texture | null, color: number): THREE.MeshToonMaterial {
  const key = `${tex?.uuid ?? 'none'}|${color}`;
  let m = toonTex.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: tex ? 0xffffff : color, map: tex, gradientMap: toonGradient() });
    toonTex.set(key, m);
  }
  return m;
}
const plain = new Map<number, THREE.MeshToonMaterial>();
function toonOf(color: number): THREE.MeshToonMaterial {
  let m = plain.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    plain.set(color, m);
  }
  return m;
}

/** A flat-coloured part with an ink outline (merged per joint later). */
function part(geo: THREE.BufferGeometry, color: number, outline = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, toonOf(color));
  m.castShadow = true;
  if (outline) m.add(new THREE.Mesh(geo, ink()));
  return m;
}

/** A textured part (kept as its own mesh: the baking merges only flat colours). */
function texPart(
  geo: THREE.BufferGeometry,
  tex: THREE.Texture | null,
  color: number,
  outline = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, texToon(tex, color));
  m.castShadow = true;
  m.userData.keep = true;
  if (outline) m.add(new THREE.Mesh(geo, ink()));
  return m;
}

const ball = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
function put<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
function scaled<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.scale.set(x, y, z);
  return o;
}

// ---------------------------------------------------------------- head

function head(d: Dress): THREE.Group {
  const h = new THREE.Group();
  // The head: a skull with a V jaw and a chin, the face painted on it (90s anime: almond
  // eyes with a heavy lash line, angled brows, a shadow for the nose, a short mouth).
  const face = faceTexture(d);
  const skull = texPart(headGeometry(0.105), face, d.skin);
  h.add(skull);
  // A small nose bridge (the painted shadow does the rest), and the ears.
  h.add(put(scaled(part(ball(0.013, 8, 6), d.skin, false), 0.8, 1.4, 1), 0, -0.012, 0.094));
  for (const s of [-1, 1])
    h.add(put(scaled(part(ball(0.022, 10, 8), d.skin), 0.45, 1.25, 0.85), s * 0.093, -0.005, -0.008));
  // Hair: a cap and a topknot (hidden under a crown, which sits on it).
  // The hair swept back from a clear forehead (the cap tilts back so the hairline sits high).
  const capGeo = new THREE.SphereGeometry(0.108, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
  h.add(put(scaled(part(capGeo, d.hair), 0.92, 1.08, 1.06), 0, 0.02, -0.012, -0.45));
  if (!d.crown || d.crown === 'band') h.add(put(part(ball(0.045), d.hair), 0, 0.13, -0.02));
  // Long gold earrings (stretched lobes are shown on royal and divine figures).
  if (d.crown === 'mokot' || d.crown === 'diadem')
    for (const s of [-1, 1]) {
      const ear = texPart(new THREE.CylinderGeometry(0.01, 0.022, 0.07, 8), goldTexture(), 0xe0b040, false);
      ear.position.set(s * 0.098, -0.06, 0);
      h.add(ear);
    }
  // Crowns.
  const gold = goldTexture();
  if (d.crown === 'mokot') {
    const band = texPart(new THREE.CylinderGeometry(0.112, 0.118, 0.05, 24, 1, true), gold, 0xe0b040);
    band.position.y = 0.07;
    h.add(band);
    const tiers = d.tallCrown ? 5 : 3;
    for (let i = 0; i < tiers; i++) {
      const r = 0.1 - i * (d.tallCrown ? 0.016 : 0.022);
      h.add(
        put(
          texPart(new THREE.CylinderGeometry(r * 0.85, r, 0.045, 18), gold, 0xe0b040),
          0,
          0.115 + i * 0.045,
          -0.005,
        ),
      );
      h.add(
        put(
          part(new THREE.TorusGeometry(r, 0.008, 6, 18), 0xb8862a, false),
          0,
          0.095 + i * 0.045,
          -0.005,
          Math.PI / 2,
        ),
      );
    }
    // The spire.
    const spire = d.tallCrown ? 0.22 : 0.08;
    h.add(
      put(
        texPart(new THREE.ConeGeometry(0.03, spire, 10), gold, 0xe0b040),
        0,
        0.1 + tiers * 0.045 + spire / 2,
        -0.005,
      ),
    );
    // Side flames (the crown's back-swept ear ornaments) and the front jewel.
    for (const s of [-1, 1]) {
      const flame = new THREE.Shape();
      flame.moveTo(0, 0);
      flame.quadraticCurveTo(0.05, 0.04, 0.03, 0.14);
      flame.quadraticCurveTo(0.012, 0.08, 0, 0.06);
      flame.lineTo(0, 0);
      const fg = new THREE.ExtrudeGeometry(flame, { depth: 0.006, bevelEnabled: false });
      const f = texPart(fg, gold, 0xe0b040);
      f.position.set(s * 0.1, 0.02, -0.02);
      f.rotation.set(0, s > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3, 0);
      h.add(f);
    }
    h.add(put(part(new THREE.OctahedronGeometry(0.018), 0xc0283a, false), 0, 0.085, 0.112));
  } else if (d.crown === 'diadem') {
    h.add(
      put(texPart(new THREE.CylinderGeometry(0.112, 0.116, 0.045, 24, 1, true), gold, 0xe0b040), 0, 0.07, 0),
    );
    h.add(put(texPart(new THREE.ConeGeometry(0.035, 0.1, 8), gold, 0xe0b040), 0, 0.15, -0.02));
  } else if (d.crown === 'band') {
    h.add(put(part(new THREE.CylinderGeometry(0.113, 0.115, 0.03, 20, 1, true), d.trim, false), 0, 0.06, 0));
  } else if (d.crown === 'helmet') {
    // The soldiers' round helmet (PK's character reference; Angkor Wat era on): a polished
    // metal dome, a narrow brim all round, a ridge over the top from front to back.
    const cap = new THREE.SphereGeometry(0.124, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    h.add(put(scaled(part(cap, 0xa4acb4), 1, 1.0, 1.06), 0, 0.05, -0.008));
    h.add(
      put(
        part(new THREE.TorusGeometry(0.124, 0.014, 6, 22), 0x7c848c, false),
        0,
        0.062,
        -0.006,
        Math.PI / 2 + 0.12,
      ),
    );
    h.add(put(part(new THREE.BoxGeometry(0.018, 0.03, 0.2), 0x8a929a, false), 0, 0.168, -0.008));
    h.add(put(part(ball(0.02, 8, 6), 0xc8a050, false), 0, 0.185, 0));
  }
  return h;
}

// ---------------------------------------------------------------- body

/** An adult Khmer figure in the dress given. */
export function adultFigure(d: Dress): { root: THREE.Group; j: Joints } {
  const gold = goldTexture();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pelvis = put(new THREE.Group(), 0, 0.94, 0);
  body.add(pelvis);

  // Hips and the sampot: wrapped at the waist, fuller at the thighs, to the knee or calf.
  pelvis.add(put(scaled(part(ball(0.13, 18, 12), d.skin), 1.15, 0.8, 0.85), 0, -0.02, 0));
  const hem = d.long ? -0.62 : -0.44;
  const skirtPts = [
    new THREE.Vector2(0.15, 0.06),
    new THREE.Vector2(0.168, 0.0),
    new THREE.Vector2(0.19, -0.14),
    new THREE.Vector2(0.2, hem * 0.6),
    new THREE.Vector2(0.19, hem),
  ];
  // Points from the hem up, so the lathe's faces (and the ink behind them) look outward.
  const tex = sampotTexture(d.cloth, d.pattern, d.trim, d.weave);
  if (d.cut === 'skirt') {
    const skirtGeo = new THREE.LatheGeometry(skirtPts.reverse(), 24);
    skirtGeo.scale(1, 1, 0.82);
    pelvis.add(texPart(skirtGeo, tex, d.cloth));
  } else {
    // Chang kben: a full wrap over the hips; each leg's cloth goes with the leg (below).
    const wrap = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.15, 0.06),
        new THREE.Vector2(0.172, 0.0),
        new THREE.Vector2(0.2, -0.1),
        new THREE.Vector2(0.205, -0.16),
      ].reverse(),
      24,
    );
    wrap.scale(1, 1, 0.84);
    pelvis.add(texPart(wrap, tex, d.cloth));
  }
  // The front fold (sampot pleat) or, for the court, a gold front panel to the knees.
  const panel = new THREE.Shape();
  panel.moveTo(-0.06, 0);
  panel.lineTo(0.06, 0);
  panel.lineTo(0.05, hem * 0.75);
  panel.lineTo(0, hem * 0.75 - 0.06);
  panel.lineTo(-0.05, hem * 0.75);
  panel.closePath();
  const pg = new THREE.ExtrudeGeometry(panel, { depth: 0.012, bevelEnabled: false });
  // The king's long gold apron to below the knees (PK's reference); a short fold for others.
  if (d.armor === 'royal') pg.scale(1.35, 1.05, 1);
  else if (d.cut === 'kben') pg.scale(1, 0.55, 1);
  if (d.armor === 'royal')
    for (const s of [-1, 1]) {
      // Gold hip flaps over the silk, flaring out.
      const flap = new THREE.Shape();
      flap.moveTo(-0.055, 0);
      flap.lineTo(0.055, 0);
      flap.lineTo(0.06, -0.17);
      flap.lineTo(0, -0.21);
      flap.lineTo(-0.06, -0.17);
      flap.closePath();
      const f = texPart(
        new THREE.ExtrudeGeometry(flap, { depth: 0.01, bevelEnabled: false }),
        gold,
        0xe0b040,
      );
      f.position.set(s * 0.15, 0.03, 0.03);
      f.rotation.set(-0.05, s * 1.15, s * 0.22);
      pelvis.add(f);
    }
  const front = d.armor ? texPart(pg, gold, 0xe0b040) : part(pg, d.trim);
  front.position.set(0, 0.03, 0.155);
  front.rotation.x = -0.08;
  pelvis.add(front);
  // The belt: a gold band with a round clasp.
  const belt = d.armor
    ? texPart(new THREE.CylinderGeometry(0.163, 0.163, 0.05, 24, 1, true), gold, 0xe0b040)
    : part(new THREE.CylinderGeometry(0.162, 0.162, 0.035, 24, 1, true), d.trim, false);
  belt.scale.z = 0.84;
  belt.position.y = 0.05;
  pelvis.add(belt);
  if (d.armor)
    pelvis.add(
      put(
        texPart(
          new THREE.CylinderGeometry(
            d.armor === 'royal' ? 0.052 : 0.035,
            d.armor === 'royal' ? 0.052 : 0.035,
            0.016,
            20,
          ),
          gold,
          0xe0b040,
        ),
        0,
        0.05,
        0.145,
        Math.PI / 2,
      ),
    );

  // Legs.
  const kbenHem = d.long ? -0.66 : -0.55;
  const legCloth =
    d.cut === 'kben'
      ? new THREE.LatheGeometry(
          [
            // Baggy, to below the knee (PK's reference sheet); the king's silk to mid-calf.
            new THREE.Vector2(0.108, 0.02),
            new THREE.Vector2(0.13, -0.12),
            new THREE.Vector2(0.134, -0.3),
            new THREE.Vector2(0.12, kbenHem * 0.84),
            new THREE.Vector2(0.1, kbenHem),
          ].reverse(),
          16,
        )
      : null;
  const leg = (side: 1 | -1) => {
    const hip = put(new THREE.Group(), side * 0.095, -0.04, 0);
    hip.add(put(part(limbGeometry(0.44, THIGH), d.skin), 0, 0, 0));
    // The chang kben's full leg of cloth to just below the knee, with a little fold at the hem.
    if (legCloth) {
      hip.add(texPart(legCloth, tex, d.cloth));
      hip.add(
        put(
          part(new THREE.TorusGeometry(0.1, 0.013, 5, 14), d.trim, false),
          0,
          kbenHem + 0.01,
          0,
          Math.PI / 2,
        ),
      );
    }
    const knee = put(new THREE.Group(), 0, -0.44, 0);
    hip.add(knee);
    // The shin and the calf (flattened a little front to back), the foot.
    knee.add(part(limbGeometry(0.42, SHIN, 0.92), d.skin));
    const foot = put(new THREE.Group(), 0, -0.44, 0);
    knee.add(foot);
    foot.add(part(footGeometry(), d.skin));
    // Anklets (the king and the great).
    if (d.jewels === 'royal')
      foot.add(
        put(
          texPart(new THREE.TorusGeometry(0.048, 0.012, 6, 16), gold, 0xe0b040, false),
          0,
          0.035,
          0,
          Math.PI / 2,
        ),
      );
    return { hip, knee };
  };
  const L = leg(1);
  const R = leg(-1);
  pelvis.add(L.hip, R.hip);

  // Torso: abdomen and a broad chest, shoulders, neck.
  const spine = put(new THREE.Group(), 0, 0.03, 0);
  pelvis.add(spine);
  // One sculpted torso: the waist, a broad chest and pectorals, the shoulders sloping into the
  // neck, the back flatter (a human V, not stacked capsules).
  spine.add(part(torsoGeometry(), d.skin));
  spine.add(
    put(
      part(
        limbGeometry(0.11, [
          [0, 0.05],
          [1, 0.057],
        ]),
        d.skin,
      ),
      0,
      0.645,
      0.005,
    ),
  );
  if (d.armor) {
    // A broad gold collar over the shoulders, the chest plate, crossed straps front and back.
    const collarPts = [
      new THREE.Vector2(0.06, 0.06),
      new THREE.Vector2(0.12, 0.04),
      new THREE.Vector2(0.21, -0.03),
      new THREE.Vector2(0.22, -0.05),
    ];
    const collar = texPart(new THREE.LatheGeometry(collarPts.reverse(), 28), gold, 0xe0b040);
    collar.scale.set(1, 1, 0.75);
    collar.position.y = 0.5;
    spine.add(collar);
    if (d.armor === 'royal') {
      // The gold cuirass over the whole chest and belly, following the body (PK's reference),
      // its lower edge on the belt, a scalloped collar edge, a diamond where the straps cross.
      // Finely engraved: the scroll pattern repeated small round the body.
      let fine: THREE.Texture | null = null;
      if (gold) {
        fine = gold.clone();
        fine.wrapS = fine.wrapT = THREE.RepeatWrapping;
        fine.repeat.set(6, 3);
        fine.needsUpdate = true;
      }
      const cuirass = texPart(torsoGeometry({ grow: 0.012, from: 0.04, to: 0.515 }), fine, 0xe0b040);
      spine.add(cuirass);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const tip = part(new THREE.ConeGeometry(0.018, 0.04, 4), 0xe0b040, false);
        tip.position.set(Math.sin(a) * 0.2, 0.455, Math.cos(a) * 0.14);
        tip.rotation.set(Math.PI + Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
        spine.add(tip);
      }
      const gem = part(new THREE.OctahedronGeometry(0.035), 0xc89a2a);
      gem.scale.set(1, 1.3, 0.35);
      gem.position.set(0, 0.3, 0.135);
      spine.add(gem);
      // Shoulder guards.
      for (const s of [-1, 1]) {
        const sh = texPart(
          new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          gold,
          0xe0b040,
        );
        sh.position.set(s * 0.215, 0.47, 0);
        sh.rotation.z = -s * 0.5;
        spine.add(sh);
      }
    }
    for (const z of [1, -1])
      for (const s of [-1, 1]) {
        const strap = texPart(new THREE.BoxGeometry(0.03, 0.36, 0.012), gold, 0xe0b040, false);
        strap.position.set(0, 0.3, z * (d.armor === 'royal' ? 0.132 : 0.112));
        strap.rotation.z = s * 0.62;
        spine.add(strap);
      }
  } else if (d.jewels !== 'none') {
    // A plain gold necklace for the ranks that wear gold (not commoners: costume review).
    spine.add(
      put(
        part(new THREE.TorusGeometry(0.075, 0.009, 6, 18), 0xe0b040, false),
        0,
        0.53,
        0.02,
        Math.PI / 2 + 0.3,
      ),
    );
  }
  const hd = head(d);
  hd.position.y = 0.672;
  spine.add(hd);

  // Arms.
  const arm = (side: 1 | -1) => {
    const sh = put(new THREE.Group(), side * 0.215, 0.48, 0);
    // The deltoid caps the shoulder; the upper arm (biceps), the forearm, the hand.
    sh.add(put(scaled(part(ball(0.06, 16, 12), d.skin), 1, 1.05, 0.95), 0, -0.015, 0));
    sh.add(part(limbGeometry(0.28, UPPER_ARM), d.skin));
    const el = put(new THREE.Group(), 0, -0.29, 0);
    sh.add(el);
    el.add(part(limbGeometry(0.26, FOREARM, 0.86), d.skin));
    const hand = put(new THREE.Group(), 0, -0.27, 0);
    el.add(hand);
    const hg = handGeometries(side);
    hand.add(part(hg.palm, d.skin));
    hand.add(part(hg.fingers, d.skin, false));
    // Armlet above the elbow (soldiers and above), bracer at the wrist.
    if (d.jewels !== 'none')
      sh.add(
        put(
          texPart(new THREE.CylinderGeometry(0.054, 0.054, 0.035, 16, 1, true), gold, 0xe0b040, false),
          0,
          -0.2,
          0,
        ),
      );
    if (d.bracers) {
      const br = texPart(new THREE.CylinderGeometry(0.044, 0.04, 0.11, 16, 1, true), gold, 0xe0b040);
      br.position.y = -0.2;
      el.add(br);
    }
    return { sh, el, hand };
  };
  const AL = arm(1);
  const AR = arm(-1);
  spine.add(AL.sh, AR.sh);
  const gripR = new THREE.Group();
  gripR.position.y = -0.04;
  gripR.rotation.x = Math.PI / 2;
  AR.hand.add(gripR);
  const gripL = new THREE.Group();
  gripL.position.y = -0.04;
  AL.hand.add(gripL);
  return {
    root,
    j: {
      body,
      pelvis,
      spine,
      head: hd,
      shoulderL: AL.sh,
      shoulderR: AR.sh,
      elbowL: AL.el,
      elbowR: AR.el,
      hipL: L.hip,
      hipR: R.hip,
      kneeL: L.knee,
      kneeR: R.knee,
      gripR,
      gripL,
    },
  };
}
