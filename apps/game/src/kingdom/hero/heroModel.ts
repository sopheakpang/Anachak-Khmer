import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HeroKit } from '@temples/shared';
import type { HeroState } from './heroCore';
import { ink, setFlat, toon, toonFlat, toonGradient } from './toon';
import { adultFigure, type Dress, type Joints } from './body';
import { HeroRig, type ModelSpec } from './glbModel';

/**
 * The played character, drawn anime-style (PK: "cel-shaded, like Genshin Impact"): toon
 * shading in three bands, dark ink outlines, a large head with big eyes, and Angkorian dress
 * from the reliefs — a sampot wrapped at the hips, bare chest, hair tied up in a chignon,
 * gold for the king (his tiered crown, the sacred sword Preah Khan) and the commander.
 * Joints are groups, posed every frame from the hero's state (no skinning, no files).
 */

export interface HeroLook {
  /** Sampot (hip cloth) colour. */
  cloth: number;
  /** Second colour: belt, headband, sash. */
  trim: number;
  skin: number;
  hair: number;
  /** Eyes' iris colour. */
  eyes: number;
  crown?: 'king' | 'diadem' | 'band' | 'helmet';
  weave?: 'dense' | 'sparse' | 'plain';
  jewels?: 'royal' | 'some' | 'none';
  /** Before the Angkor Wat era the royal crown is a low tiered diadem, not the tall mukuta. */
  lowCrown?: boolean;
  mount?: 'horse' | 'buffalo' | 'elephant';
  shield?: boolean;
  quiver?: boolean;
  dog?: boolean;
  /** The sampot's woven pattern colour (silk lattice for the court, stripes for others). */
  pattern: number;
  long?: boolean;
  /** Skirt (court) or chang kben (drawn up between the legs: soldiers, commoners). */
  cut?: 'skirt' | 'kben';
  armor?: 'royal' | 'general';
  bracers?: boolean;
}

/**
 * Dress by kit (PK's character reference sheet, 90s anime concept style): the king in purple
 * and gold silk, gold armour, bracers and crown; the commander in red and gold; soldiers and
 * commoners in sampot chang kben (drawn up between the legs, to the knee) in the reference's
 * colours — the villager red, the spearman green, the swordsman blue, the archer brown, the
 * riders red, the hunter green, the cart driver tan; soldiers' round metal helmets from the
 * Angkor Wat era. Cloth weave and gold follow rank (Zhou Daguan; costume review D104).
 */
export function lookFor(kit: HeroKit, unitType: string | 'king', tallCrown = true): HeroLook {
  const base = { skin: 0xb87a50, hair: 0x15100c, eyes: 0x4a2a12 };
  const plain = { weave: 'plain' as const, cut: 'kben' as const };
  const soldier = {
    ...plain,
    jewels: 'some' as const,
    crown: tallCrown ? ('helmet' as const) : undefined,
  };
  switch (kit.id) {
    case 'king':
      return {
        ...base,
        cloth: 0x6a2a7a,
        pattern: 0xe0b040,
        trim: 0xe0b040,
        eyes: 0x6a3a10,
        crown: 'king',
        weave: 'dense',
        jewels: 'royal',
        cut: 'kben', // the royal sampot draped and drawn up, to mid-calf (PK's reference)
        lowCrown: !tallCrown,
        long: true,
        armor: 'royal',
        bracers: true,
      };
    case 'commander':
      return {
        ...base,
        cloth: 0xa82a2a,
        pattern: 0xe0b040,
        trim: 0xe0b040,
        crown: 'diadem',
        weave: 'sparse',
        jewels: 'royal',
        long: true,
        armor: 'general',
        bracers: true,
      };
    case 'sword':
      return {
        ...base,
        ...soldier,
        cloth: 0x2e4aa0,
        pattern: 0x4a64b8,
        trim: 0x22336e,
        shield: true,
        bracers: true,
      };
    case 'spear':
      return { ...base, ...soldier, cloth: 0x3f7a34, pattern: 0x5a944a, trim: 0x2a5424, shield: true };
    case 'bow':
      return {
        ...base,
        ...soldier,
        crown: undefined, // the archer keeps his topknot (reference)
        cloth: 0x7a5434,
        pattern: 0x946a48,
        trim: 0x5a3a22,
        quiver: true,
      };
    case 'hunter':
      return {
        ...base,
        ...plain,
        cloth: 0x3f6e3a,
        pattern: 0x5a8a50,
        trim: 0x2a4a26,
        jewels: 'none',
        quiver: true,
        dog: true,
      };
    case 'rider':
      return {
        ...base,
        ...soldier,
        cloth: 0xa83228,
        pattern: 0xc04a3a,
        trim: 0x6a1e18,
        mount: unitType === 'buffaloRider' ? 'buffalo' : 'horse',
      };
    case 'elephant':
      // The mahout sits plain on the neck with his goad (reliefs): bare head, plain cloth.
      return {
        ...base,
        ...plain,
        cloth: 0xa83228,
        pattern: 0xc04a3a,
        trim: 0x6a1e18,
        jewels: 'some',
        mount: 'elephant',
      };
    case 'cart':
      return { ...base, ...plain, cloth: 0xb89a6a, pattern: 0xccb084, trim: 0x8a6e44, jewels: 'none' };
    default:
      return { ...base, ...plain, cloth: 0xb0302a, pattern: 0xc84a3a, trim: 0x7a1e18, jewels: 'none' };
  }
}

export { ink, toon, toonGradient };

/** The adult figure's dress for a look (PK's character sheet). */
export function dressOf(look: HeroLook): Dress {
  return {
    skin: look.skin,
    hair: look.hair,
    eyes: look.eyes,
    cloth: look.cloth,
    pattern: look.pattern,
    trim: look.trim,
    long: !!look.long,
    cut: look.cut ?? 'skirt',
    armor: look.armor ?? null,
    crown: look.crown === 'king' ? 'mokot' : (look.crown ?? null),
    weave: look.weave ?? 'plain',
    jewels: look.jewels ?? 'none',
    tallCrown: !look.lowCrown,
    bracers: !!look.bracers,
  };
}

function part(geo: THREE.BufferGeometry, color: number, outline = true, emissive = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color, emissive));
  m.castShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, ink());
    o.raycast = () => undefined;
    m.add(o);
  }
  return m;
}

const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
const ball = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

// ---------------------------------------------------------------- weapons

/**
 * A sword worn at the left hip (PK 1.8.0): in the pelvis's frame (+x is the figure's left),
 * hilt up and forward by the hip, the blade slanting down and back; drawn for `keepDrawn`
 * seconds after the last strike.
 */
export const SHEATH = { at: [0.19, 0.06, 0.1] as const, rot: [Math.PI + 0.5, 0, -0.18] as const, keepDrawn: 1.5 };

function weapon(kind: HeroKit['weapon']): THREE.Group {
  const g = new THREE.Group();
  const wood = 0x6e4a2c;
  const iron = 0xc8ccd2;
  const gold = 0xe0b040;
  switch (kind) {
    case 'axe':
      g.add(at(part(cap(0.022, 0.62), wood), 0, 0.22, 0));
      g.add(at(part(new THREE.BoxGeometry(0.03, 0.14, 0.2), iron), 0, 0.5, 0.08));
      break;
    case 'sword':
    case 'preahKhan': {
      const holy = kind === 'preahKhan';
      g.add(at(part(cap(0.022, 0.14), holy ? gold : 0x3a2a1a), 0, 0.02, 0));
      g.add(at(part(new THREE.BoxGeometry(0.16, 0.035, 0.05), gold), 0, 0.12, 0));
      const blade = part(
        new THREE.BoxGeometry(0.055, 0.72, 0.014),
        holy ? 0xfff2c0 : iron,
        true,
        holy ? 0xffd060 : 0,
      );
      g.add(at(blade, 0, 0.5, 0));
      g.add(
        at(
          part(new THREE.ConeGeometry(0.028, 0.08, 4), holy ? 0xfff2c0 : iron, false, holy ? 0xffd060 : 0),
          0,
          0.9,
          0,
        ),
      );
      break;
    }
    case 'spear':
    case 'lance': {
      const L = kind === 'lance' ? 2.4 : 1.9;
      g.add(at(part(cap(0.02, L), wood), 0, L / 2 - 0.55, 0));
      g.add(at(part(new THREE.ConeGeometry(0.045, 0.28, 6), iron), 0, L - 0.4, 0));
      g.add(at(part(new THREE.TorusGeometry(0.035, 0.012, 5, 10), 0xb8322a, false), 0, L - 0.56, 0));
      break;
    }
    case 'goad':
      g.add(at(part(cap(0.02, 0.7), wood), 0, 0.3, 0));
      g.add(at(part(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), iron), 0.06, 0.68, 0));
      break;
    case 'staff':
      g.add(at(part(cap(0.022, 1.3), wood), 0, 0.45, 0));
      break;
    case 'bow':
      break; // the bow is in the left hand
  }
  return g;
}

function bow(): THREE.Group {
  const g = new THREE.Group();
  const arc = part(new THREE.TorusGeometry(0.6, 0.018, 5, 18, Math.PI * 0.85), 0x5a3a1e);
  arc.rotation.z = Math.PI / 2 - (Math.PI * 0.85) / 2;
  g.add(arc);
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.1, 3), toon(0xf0e6d0));
  s.position.x = 0.11;
  g.add(s);
  return g;
}

// ---------------------------------------------------------------- mounts and the dog

interface Beast {
  root: THREE.Group;
  legs: THREE.Group[];
  /** Saddle height (m) where the rider's hips sit. */
  seat: number;
  /** Stride length scale. */
  gait: number;
  head?: THREE.Group;
}

function quadruped(o: {
  len: number;
  girth: number;
  height: number;
  color: number;
  legR: number;
  headR: number;
  neck: number;
  horns?: boolean;
  trunk?: boolean;
  ears?: boolean;
  tail?: boolean;
  cloth?: number;
  /** A horse's long head: a neck rising to it and a muzzle (the reference's horse). */
  muzzle?: number;
  /** A howdah on the back (the war elephant): red with a gold rail. */
  howdah?: boolean;
}): Beast {
  const root = new THREE.Group();
  const bodyY = o.height;
  const torso = part(cap(o.girth, o.len), o.color);
  torso.rotation.x = Math.PI / 2;
  torso.position.y = bodyY;
  root.add(torso);
  if (o.cloth !== undefined) {
    // A saddle cloth draped over the back and down the sides, with a gold border (reference).
    const w = o.girth * 2.15;
    const cloth = part(new THREE.BoxGeometry(w, o.girth * 0.12, o.len * 0.5), o.cloth);
    cloth.position.set(0, bodyY + o.girth * 0.96, -o.len * 0.05);
    root.add(cloth);
    for (const s of [-1, 1]) {
      const side = part(new THREE.BoxGeometry(0.03, o.girth * 0.9, o.len * 0.5), o.cloth);
      side.position.set((s * w) / 2, bodyY + o.girth * 0.5, -o.len * 0.05);
      root.add(side);
      const hem = part(new THREE.BoxGeometry(0.04, o.girth * 0.1, o.len * 0.52), 0xe0b040, false);
      hem.position.set((s * w) / 2, bodyY + o.girth * 0.07, -o.len * 0.05);
      root.add(hem);
    }
    if (o.howdah) {
      // The howdah: a red box with a gold rail and corner posts.
      const hw = o.girth * 1.5;
      const hl = o.len * 0.42;
      const box = part(new THREE.BoxGeometry(hw, o.girth * 0.5, hl), o.cloth);
      box.position.set(0, bodyY + o.girth * 1.25, -o.len * 0.08);
      root.add(box);
      const rail = part(new THREE.BoxGeometry(hw + 0.08, 0.07, hl + 0.08), 0xe0b040, false);
      rail.position.set(0, bodyY + o.girth * 1.52, -o.len * 0.08);
      root.add(rail);
      for (const [x, z] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const post = part(new THREE.CylinderGeometry(0.035, 0.035, o.girth * 0.35, 6), 0xe0b040, false);
        post.position.set((x * hw) / 2, bodyY + o.girth * 1.7, -o.len * 0.08 + (z * hl) / 2);
        root.add(post);
      }
    }
  }
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [o.girth * 0.6, o.len * 0.42],
    [-o.girth * 0.6, o.len * 0.42],
    [o.girth * 0.6, -o.len * 0.42],
    [-o.girth * 0.6, -o.len * 0.42],
  ] as const) {
    const g = new THREE.Group();
    g.position.set(x, bodyY - o.girth * 0.3, z);
    const L = bodyY - o.girth * 0.3;
    g.add(at(part(cap(o.legR, L - o.legR * 2), o.color), 0, -L / 2, 0));
    root.add(g);
    legs.push(g);
  }
  const head = new THREE.Group();
  head.position.set(0, bodyY + o.neck * 0.6, o.len / 2 + o.girth * 0.6);
  const h = part(ball(o.headR), o.color);
  h.scale.set(0.85, 0.95, 1.25);
  head.add(h);
  if (o.muzzle) {
    // A long horse head: the muzzle reaching forward and down, a neck down to the chest, a mane.
    const m = part(cap(o.headR * 0.55, o.muzzle), o.color);
    m.rotation.x = Math.PI / 2 + 0.55;
    m.position.set(0, -o.headR * 0.45, o.headR * 0.95);
    head.add(m);
    const nose = part(ball(o.headR * 0.5), 0x3a2a20);
    nose.scale.set(1, 0.8, 0.9);
    nose.position.set(0, -o.headR * 0.95, o.headR * 1.6);
    head.add(nose);
    const neck = part(cap(o.girth * 0.5, o.neck * 0.8), o.color);
    neck.rotation.x = -0.75;
    neck.position.set(0, bodyY + o.neck * 0.25, o.len / 2 + o.girth * 0.25);
    root.add(neck);
    const mane = part(new THREE.BoxGeometry(0.05, o.neck * 0.9, 0.12), 0x2a1a12, false);
    mane.rotation.x = -0.75;
    mane.position.set(0, bodyY + o.neck * 0.38 + o.girth * 0.35, o.len / 2 + o.girth * 0.12);
    root.add(mane);
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(ball(o.headR * 0.12), new THREE.MeshBasicMaterial({ color: 0x120a08 }));
    eye.position.set(s * o.headR * 0.6, o.headR * 0.25, o.headR * 0.65);
    head.add(eye);
    const hi = new THREE.Mesh(ball(o.headR * 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hi.position.set(s * o.headR * 0.62, o.headR * 0.3, o.headR * 0.76);
    head.add(hi);
    if (o.horns) {
      const horn = part(
        new THREE.TorusGeometry(o.headR * 0.9, o.headR * 0.12, 5, 12, Math.PI * 0.7),
        0xd8ccb0,
      );
      horn.position.set(s * o.headR * 0.5, o.headR * 0.5, -o.headR * 0.1);
      horn.rotation.set(0, s > 0 ? 0 : Math.PI, 0.3);
      head.add(horn);
    }
    if (o.ears) {
      // Asian elephant: smaller ears than the African (costume review), set low on the head.
      const ear = part(new THREE.CylinderGeometry(o.headR * 0.62, o.headR * 0.62, 0.04, 12), o.color);
      ear.rotation.z = Math.PI / 2;
      ear.scale.set(1, 1, 0.85);
      ear.position.set(s * o.headR * 0.92, -o.headR * 0.05, -o.headR * 0.25);
      head.add(ear);
    } else {
      const ear = part(new THREE.ConeGeometry(o.headR * 0.18, o.headR * 0.4, 5), o.color);
      ear.position.set(s * o.headR * 0.45, o.headR * 0.85, -o.headR * 0.1);
      head.add(ear);
    }
  }
  if (o.trunk) {
    const t = part(new THREE.CylinderGeometry(o.headR * 0.18, o.headR * 0.32, o.headR * 2.2, 8), o.color);
    t.position.set(0, -o.headR * 1.0, o.headR * 1.0);
    t.rotation.x = 0.35;
    head.add(t);
    for (const s of [-1, 1]) {
      const tusk = part(new THREE.ConeGeometry(o.headR * 0.08, o.headR * 0.9, 6), 0xf3ead8);
      tusk.position.set(s * o.headR * 0.35, -o.headR * 0.55, o.headR * 0.95);
      tusk.rotation.x = 1.9;
      head.add(tusk);
    }
  }
  root.add(head);
  if (o.tail) {
    const t = part(cap(o.legR * 0.35, o.len * 0.35), o.color);
    t.position.set(0, bodyY - o.girth * 0.1, -o.len / 2 - o.girth * 0.7);
    t.rotation.x = 0.4;
    root.add(t);
  }
  // Feet must not slide: stride per leg swing follows the leg's length (gesture review).
  const L = bodyY - o.girth * 0.3;
  return { root, legs, seat: bodyY + o.girth * 0.95, gait: 1.43 / L, head };
}

function mount(kind: NonNullable<HeroLook['mount']>): Beast {
  if (kind === 'elephant')
    return {
      ...quadruped({
        len: 2.2,
        girth: 1.0,
        height: 2.0,
        color: 0x7d746e,
        legR: 0.3,
        headR: 0.75,
        neck: 0.8,
        trunk: true,
        ears: true,
        tail: true,
        cloth: 0xa8322a,
        howdah: true,
      }),
    };
  if (kind === 'buffalo')
    return quadruped({
      len: 1.5,
      girth: 0.5,
      height: 1.0,
      color: 0x3d3a3a,
      legR: 0.11,
      headR: 0.32,
      neck: 0.1,
      horns: true,
      tail: true,
      cloth: 0xa8322a,
    });
  return quadruped({
    len: 1.25,
    girth: 0.36,
    height: 1.15,
    color: 0x8a5a34,
    legR: 0.075,
    headR: 0.2,
    neck: 0.65,
    muzzle: 0.34,
    tail: true,
    // PK's character reference: a red saddle cloth (the reliefs show bareback riders: a
    // game choice, D107).
    cloth: 0xb8322a,
  });
}

/** The hunter's dog, an anime-cute companion. */
export function dogModel(): Beast {
  const d = quadruped({
    len: 0.5,
    girth: 0.16,
    height: 0.42,
    color: 0xc89a5a,
    legR: 0.04,
    headR: 0.15,
    neck: 0.25,
    tail: true,
  });
  return d;
}

// ---------------------------------------------------------------- baking

let bakedToon: THREE.MeshToonMaterial | null = null;
let bakedFlat: THREE.MeshBasicMaterial | null = null;

/**
 * Few draw calls (the Low budget): every joint's parts are merged into one toon mesh with
 * vertex colours, one ink outline and one flat mesh (eyes), so a figure is ~40 draws, not 200.
 */
export function bakeModel(root: THREE.Object3D): void {
  bakedToon ??= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  setFlat(bakedToon, toonFlat());
  bakedFlat ??= new THREE.MeshBasicMaterial({ vertexColors: true });
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.children.some((c) => c instanceof THREE.Mesh && !c.userData.baked)) groups.push(o);
  });
  const c = new THREE.Color();
  const prep = (m: THREE.Mesh, col: THREE.Color): THREE.BufferGeometry => {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  };
  for (const grp of groups) {
    const toonG: THREE.BufferGeometry[] = [];
    const inkG: THREE.BufferGeometry[] = [];
    const flatG: THREE.BufferGeometry[] = [];
    // Painted parts (silk, engraved gold) merge too, one mesh per texture, keeping their uvs.
    const painted = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const m of [...grp.children]) {
      if (!(m instanceof THREE.Mesh) || m.userData.baked) continue;
      if (m.userData.keep) {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes))
          if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.getAttribute('uv')) {
          const n = g.getAttribute('position').count;
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
        }
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const list = painted.get(m.material as THREE.Material) ?? [];
        list.push(g);
        painted.set(m.material as THREE.Material, list);
        if (m.children.some((k) => k instanceof THREE.Mesh && k.material === ink())) {
          const ig = g.clone();
          ig.deleteAttribute('uv');
          const n = ig.getAttribute('position').count;
          ig.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
          inkG.push(ig);
        }
        grp.remove(m);
        continue;
      }
      const mat = m.material as THREE.Material;
      if (mat instanceof THREE.MeshToonMaterial) {
        c.copy(mat.color).add(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity * 0.8));
        const g = prep(m, c);
        toonG.push(g);
        if (m.children.some((k) => k instanceof THREE.Mesh && k.material === ink())) inkG.push(g.clone());
      } else if (mat instanceof THREE.MeshBasicMaterial && mat !== ink()) flatG.push(prep(m, mat.color));
      else continue;
      grp.remove(m);
    }
    const add = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean) => {
      if (!list.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(list)!, mat);
      mesh.castShadow = shadow;
      mesh.userData.keep = true;
      mesh.userData.baked = true;
      mesh.raycast = () => undefined;
      grp.add(mesh);
      for (const g of list) g.dispose();
    };
    add(toonG, bakedToon, true);
    for (const [mat, list] of painted) add(list, mat, true);
    add(inkG, ink(), false);
    add(flatG, bakedFlat, false);
  }
}

// ---------------------------------------------------------------- the posed hero

export class HeroModel {
  readonly group = new THREE.Group();
  private readonly j: Joints;
  private readonly beast: Beast | null;
  readonly dog: Beast | null;
  /** Height of the rider's eyes above the ground (the camera looks a bit higher on a mount). */
  readonly lift: number;
  private readonly weapon: THREE.Group;
  /** Where a sword hangs when it is not drawn (at the left hip), and whether this kit wears one. */
  private readonly sheath: THREE.Group;
  private readonly sheathes: boolean;
  /** The last time (s) the hero struck or used a skill: the sword stays drawn a moment after. */
  private foughtAt = -1e9;
  /** Is the sword in the hand now (for the tests)? */
  get drawn(): boolean {
    return this.weapon.parent === this.j.gripR;
  }
  /** A soft light-ring at the feet (the selected hero) and the slash trail. */
  readonly trail: THREE.Mesh;
  private readonly trailMat: THREE.MeshBasicMaterial;

  /** A real 3D model driving in place of the built-in figure (PK), or null. */
  readonly rig: HeroRig | null = null;

  constructor(
    readonly kit: HeroKit,
    readonly look: HeroLook,
    model?: { source: THREE.Object3D; spec: ModelSpec } | null,
  ) {
    const f = adultFigure(dressOf(look));
    this.j = f.j;
    if (look.quiver) {
      const q = part(new THREE.CylinderGeometry(0.045, 0.04, 0.5, 8), 0x6a4422);
      q.userData.keep = q.userData.gear = true;
      q.position.set(0.08, 0.3, -0.15);
      q.rotation.z = 0.45;
      this.j.spine.add(q);
    }
    if (look.shield) {
      // A small round shield on the left forearm (spearmen of the reliefs).
      const sh = part(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 18), 0x8a5a2c);
      sh.userData.keep = sh.userData.gear = true;
      sh.rotation.z = Math.PI / 2;
      sh.position.set(0.06, -0.12, 0.02);
      this.j.elbowL.add(sh);
      const boss = part(ball(0.055), 0xe0b040, false);
      boss.userData.keep = boss.userData.gear = true;
      boss.position.set(0.085, -0.12, 0.02);
      this.j.elbowL.add(boss);
    }
    this.beast = look.mount ? mount(look.mount) : null;
    if (this.beast) {
      this.group.add(this.beast.root);
      f.root.position.y = this.beast.seat - 0.94 + 0.1;
      f.root.position.z = look.mount === 'elephant' ? 1.1 : 0.05;
    }
    this.group.add(f.root);
    this.lift = this.beast ? f.root.position.y : 0;
    this.weapon = weapon(kit.weapon);
    this.weapon.userData.gear = true;
    this.j.gripR.add(this.weapon);
    // PK 1.8.0: a sword is worn at the left hip, hilt forward, and drawn only to fight.
    this.sheath = new THREE.Group();
    this.sheath.userData.gear = true;
    this.sheath.position.set(SHEATH.at[0], SHEATH.at[1], SHEATH.at[2]);
    this.sheath.rotation.set(SHEATH.rot[0], SHEATH.rot[1], SHEATH.rot[2]);
    this.j.pelvis.add(this.sheath);
    this.sheathes = kit.weapon === 'sword' || kit.weapon === 'preahKhan';
    if (this.sheathes) this.sheath.add(this.weapon);
    if (kit.weapon === 'bow') {
      const b = bow();
      b.userData.gear = true;
      b.rotation.set(0, Math.PI / 2, 0);
      this.j.gripL.add(b);
    }
    this.dog = look.dog ? dogModel() : null;
    bakeModel(this.group);
    if (model) {
      // PK's real model: the built-in body is still posed (hidden) and drives the model's
      // bones; the weapon, shield, quiver and mount stay.
      const rig = new HeroRig(model.source, model.spec, this.j);
      rig.root.position.copy(f.root.position);
      this.group.add(rig.root);
      const gear = (o: THREE.Object3D): boolean => {
        for (let p: THREE.Object3D | null = o; p && p !== f.root; p = p.parent)
          if (p.userData.gear) return true;
        return false;
      };
      f.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !gear(o)) o.visible = false;
      });
      this.rig = rig;
    }
    if (this.dog) bakeModel(this.dog.root);
    // Slash trail: a thin ribbon arc, additive, flashed during strikes.
    this.trailMat = new THREE.MeshBasicMaterial({
      color: kit.id === 'king' ? 0xffe08a : 0xdff4ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.45, 28, 1, -0.9, 1.8), this.trailMat);
    this.trail.rotation.x = -Math.PI / 2;
    this.trail.position.y = 1.2 + this.lift;
    this.group.add(this.trail);
    // A model sculpted with its arms down stands at idle as modelled (see HeroRig).
    if (this.rig?.armsAsModeled) {
      this.poseJoints({
        state: 'idle',
        stateT: 0,
        combo: 0,
        stride: 0,
        speed: 0,
        y: 0,
        t: 0,
        strikeSec: 0.4,
        skillKind: kit.skill.kind,
      });
      this.rig.calibrateArms();
    }
  }

  /** Show or hide the weapon in hand (the character sheet shows the costume alone). */
  showWeapon(on: boolean): void {
    this.weapon.visible = on;
  }

  /**
   * Pose for this frame. `s` is the hero's state, `p` its time in that state (s), `combo` the
   * strike in the combo, `stride` the walk phase, `speed` m/s, `y` the jump height.
   */
  pose(h: Parameters<HeroModel['poseJoints']>[0]): void {
    this.poseJoints(h);
    this.rig?.drive();
  }

  private poseJoints(h: {
    state: HeroState;
    stateT: number;
    combo: number;
    stride: number;
    speed: number;
    y: number;
    t: number;
    strikeSec: number;
    skillKind: HeroKit['skill']['kind'];
  }): void {
    const j = this.j;
    const reset = (g: THREE.Group) => g.rotation.set(0, 0, 0);
    for (const g of [
      j.spine,
      j.head,
      j.shoulderL,
      j.shoulderR,
      j.elbowL,
      j.elbowR,
      j.hipL,
      j.hipR,
      j.kneeL,
      j.kneeR,
    ])
      reset(g);
    j.body.position.set(0, 0, 0);
    j.body.rotation.set(0, 0, 0);
    // The sword: drawn while fighting and for a moment after, else back at the hip.
    if (this.sheathes) {
      if (h.state === 'attack' || h.state === 'skill') this.foughtAt = h.t;
      const want = h.t - this.foughtAt < SHEATH.keepDrawn ? this.j.gripR : this.sheath;
      if (this.weapon.parent !== want) want.add(this.weapon);
    }
    if (this.beast) this.beast.root.rotation.x = 0;
    // Arms rest a little away from the body; the right holds the weapon forward.
    j.shoulderL.rotation.z = 0.12;
    j.shoulderR.rotation.z = -0.12;
    j.elbowR.rotation.x = -0.5;
    j.elbowL.rotation.x = -0.2;
    const ranged = this.kit.weapon === 'bow';
    const mounted = !!this.beast;
    const ph = h.stride;
    const s = h.state;
    // Legs.
    if (mounted) {
      // Astride: thighs out and forward, shins down.
      j.hipL.rotation.set(-1.0, 0, 0.55);
      j.hipR.rotation.set(-1.0, 0, -0.55);
      j.kneeL.rotation.x = 1.3;
      j.kneeR.rotation.x = 1.3;
      if (this.look.mount === 'elephant') {
        j.hipL.rotation.z = 0.9;
        j.hipR.rotation.z = -0.9;
      }
    } else if (s === 'run' || (s === 'attack' && h.speed > 0.1)) {
      const k = Math.min(1, h.speed / 6);
      const sw = Math.sin(ph) * (0.45 + 0.45 * k);
      j.hipL.rotation.x = sw;
      j.hipR.rotation.x = -sw;
      j.kneeL.rotation.x = Math.max(0, -Math.sin(ph)) * (0.6 + 0.9 * k) + 0.1;
      j.kneeR.rotation.x = Math.max(0, Math.sin(ph)) * (0.6 + 0.9 * k) + 0.1;
      j.body.position.y = Math.abs(Math.cos(ph)) * 0.06 * k;
      j.spine.rotation.x = 0.12 + 0.12 * k;
      j.shoulderL.rotation.x = -sw * 0.9;
      j.shoulderR.rotation.x = sw * 0.6;
    } else if (s === 'jump') {
      const late = h.stateT > 0.35; // legs reach down for the landing
      j.hipL.rotation.x = late ? -0.4 : -0.9;
      j.hipR.rotation.x = late ? -0.1 : -0.3;
      j.kneeL.rotation.x = late ? 0.4 : 1.4;
      j.kneeR.rotation.x = late ? 0.2 : 0.8;
      j.shoulderL.rotation.set(late ? -1.2 : -2.2, 0, 0.5);
      j.shoulderR.rotation.set(-1.0, 0, -0.5);
    } else if (s === 'dash') {
      j.spine.rotation.x = 0.55;
      j.hipL.rotation.x = -0.9;
      j.hipR.rotation.x = 0.7;
      j.kneeL.rotation.x = 0.6;
      j.kneeR.rotation.x = 0.5;
      j.shoulderL.rotation.x = 0.9;
      j.shoulderR.rotation.x = 0.9;
    } else {
      // Idle: weight shifts, breathing.
      const br = Math.sin(h.t * 2.2) * 0.02;
      j.spine.rotation.x = br;
      j.hipL.rotation.z = 0.04;
      j.hipR.rotation.z = -0.04;
      j.shoulderL.rotation.x = br * 2;
      j.shoulderR.rotation.x = -br * 2;
    }
    // Arms by action.
    if (s === 'attack') {
      const p = Math.min(1, h.stateT / h.strikeSec);
      // Wind up to 0.3, cut through 0.3–0.5: the blade crosses the front as the blow lands (0.45).
      const e = Math.min(1, p / 0.3);
      const f = p < 0.3 ? 0 : Math.min(1, (p - 0.3) / 0.2);
      if (ranged) {
        // Draw and loose: the bow arm straight out, the string hand pulled back to the cheek.
        j.spine.rotation.y = -0.9;
        j.shoulderL.rotation.set(-1.55, 0, 0.0);
        j.shoulderL.rotation.y = 0.9;
        j.elbowL.rotation.x = 0;
        j.shoulderR.rotation.set(-1.5, 0, 0);
        j.shoulderR.rotation.y = 0.9 - e * 0.4 + f * 0.5;
        j.elbowR.rotation.x = -1.8 * e * (1 - f);
        j.head.rotation.y = 0.8;
      } else if (this.kit.weapon === 'spear' || this.kit.weapon === 'lance') {
        // Thrusts: draw back, then drive forward; the third sweeps.
        if (h.combo < 2) {
          j.spine.rotation.y = 0.5 - f * 0.9;
          j.shoulderR.rotation.x = -0.4 - e * 0.6 - f * 0.9;
          j.elbowR.rotation.x = -1.6 * (1 - f);
          j.shoulderL.rotation.x = -0.9;
          j.elbowL.rotation.x = -1.2;
        } else {
          j.spine.rotation.y = 1.2 - f * 2.4;
          j.shoulderR.rotation.set(-1.5, 0, -0.4);
          j.elbowR.rotation.x = -0.3;
        }
      } else {
        // Slashes: right to left, left to right, then a leaping overhead blow.
        if (h.combo === 0) {
          j.spine.rotation.y = 0.9 * e - 1.8 * f;
          j.shoulderR.rotation.set(-1.4, 0, -0.9 * e + 0.8 * f);
          j.elbowR.rotation.x = -0.4;
        } else if (h.combo === 1) {
          j.spine.rotation.y = -0.8 * e + 1.7 * f;
          j.shoulderR.rotation.set(-1.2, 0, 0.6 * e - 1.2 * f);
          j.elbowR.rotation.x = -0.6;
        } else {
          j.spine.rotation.x = -0.2 * e + 0.5 * f;
          j.shoulderR.rotation.x = -2.8 * e + 2.2 * f;
          j.shoulderL.rotation.x = -2.6 * e + 2.0 * f;
          j.elbowR.rotation.x = -0.5 * e;
          j.body.position.y += Math.sin(Math.min(1, p / 0.45) * Math.PI) * 0.35; // lands on the blow
        }
        if (!mounted) {
          j.hipL.rotation.x = -0.35;
          j.hipR.rotation.x = 0.3;
          j.kneeL.rotation.x = 0.35;
        }
      }
      this.trailMat.opacity = !ranged && f > 0 && f < 1 ? 0.75 * (1 - f) : 0;
      this.trail.rotation.z = (h.combo === 1 ? -1 : 1) * (f - 0.5) * 1.6;
      this.trail.rotation.y = h.combo === 2 ? Math.PI / 2 : 0;
    } else {
      this.trailMat.opacity *= 0.8;
    }
    if (s === 'skill') {
      const p = Math.min(1, h.stateT / 0.9);
      switch (h.skillKind) {
        case 'spin':
          if (this.look.mount === 'elephant' && this.beast) {
            // The elephant rears and stamps its forefeet down on the blow; the mahout raises the goad.
            const rear = Math.sin(Math.min(1, p / 0.33) * Math.PI);
            this.beast.root.rotation.x = -0.35 * rear;
            this.beast.legs[0]!.rotation.x = -0.8 * rear;
            this.beast.legs[1]!.rotation.x = -0.8 * rear;
            j.spine.rotation.x = 0.3;
            j.shoulderR.rotation.x = -2.4;
            break;
          }
          j.body.rotation.y = p * Math.PI * 2 * 1.5;
          j.shoulderR.rotation.set(-1.5, 0, -1.2);
          j.shoulderL.rotation.set(-1.5, 0, 1.2);
          j.spine.rotation.x = 0.2;
          this.trailMat.opacity = 0.7 * (1 - p);
          this.trail.rotation.z = p * 12;
          break;
        case 'dash':
          j.spine.rotation.x = 0.4;
          j.shoulderR.rotation.x = -1.6;
          j.elbowR.rotation.x = -0.1;
          j.shoulderL.rotation.x = -1.0;
          j.elbowL.rotation.x = -1.6; // the Bokator elbow
          if (!mounted) {
            j.hipR.rotation.x = -1.2 * Math.sin(p * Math.PI); // the knee comes up
            j.kneeR.rotation.x = 1.6 * Math.sin(p * Math.PI);
          }
          break;
        case 'volley':
          j.spine.rotation.x = -0.45;
          j.shoulderL.rotation.set(-2.4, 0, 0);
          j.shoulderR.rotation.set(-2.2, 0, 0);
          j.elbowR.rotation.x = -1.2 * (1 - p);
          break;
        case 'heal':
          j.shoulderL.rotation.set(-2.7, 0, 0.5);
          j.shoulderR.rotation.set(-2.7, 0, -0.5);
          j.head.rotation.x = -0.3;
          break;
        case 'dog':
          j.shoulderR.rotation.set(-1.5, 0, 0);
          j.elbowR.rotation.x = 0;
          j.head.rotation.x = 0.1;
          break;
        case 'chop':
          j.shoulderR.rotation.x = -3.0 + p * 3.4;
          j.shoulderL.rotation.x = -3.0 + p * 3.4;
          j.spine.rotation.x = -0.3 + p * 0.8;
          break;
      }
    }
    if (s === 'work') {
      const p = Math.min(1, h.stateT / 0.6);
      // A diagonal felling swing, waist-high: the blade meets the trunk at the work act (0.35 s).
      const down = p < 0.4 ? 0 : Math.min(1, (p - 0.4) / 0.18);
      j.spine.rotation.y = 0.9 * (1 - down) - 0.4 * down;
      j.shoulderR.rotation.x = -2.2 * (1 - down) - 1.0 * down;
      j.shoulderL.rotation.x = -2.0 * (1 - down) - 0.9 * down;
      j.shoulderR.rotation.z = -0.5;
      j.elbowR.rotation.x = -0.6;
      j.spine.rotation.x = -0.1 + 0.4 * down;
    }
    if (s === 'hurt') {
      j.spine.rotation.x = -0.35;
      j.head.rotation.x = -0.3;
      j.shoulderL.rotation.x = -0.6;
    }
    // The mount's gait (not while the elephant stamps).
    if (this.beast && !(s === 'skill' && this.look.mount === 'elephant')) {
      const k = Math.min(1, h.speed / 2);
      // Elephants walk four-beat (lateral); horses and buffalo trot (diagonal pairs).
      const phases =
        this.look.mount === 'elephant'
          ? [Math.PI * 1.5, Math.PI * 0.5, Math.PI, 0]
          : [0, Math.PI, Math.PI, 0];
      this.beast.legs.forEach((g, i) => {
        g.rotation.x = Math.sin(ph * this.beast!.gait + phases[i]!) * 0.55 * k;
      });
      this.beast.root.position.y = Math.abs(Math.sin(ph * this.beast.gait)) * 0.06 * k;
      if (this.beast.head) this.beast.head.rotation.x = Math.sin(ph * this.beast.gait) * 0.08 * k;
    }
  }

  /** Where the head is now (world), for checks and effects over the hero. */
  headWorld(): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    return this.j.head.getWorldPosition(new THREE.Vector3());
  }

  /** Where the right forearm (between elbow and grip) is, in the world (the sheet's close-up). */
  forearmWorld(): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    const e = this.j.elbowR.getWorldPosition(new THREE.Vector3());
    return e.lerp(this.j.gripR.getWorldPosition(new THREE.Vector3()), 0.55);
  }

  /** Pose the dog: running alongside, or leaping at a foe. */
  poseDog(stride: number, speed: number): void {
    if (!this.dog) return;
    const k = Math.min(1, speed / 5);
    // A gallop: the forelegs together, then the hind legs (gesture review).
    const off = [0, 0.3, Math.PI, Math.PI + 0.3];
    this.dog.legs.forEach((g, i) => (g.rotation.x = Math.sin(stride + off[i]!) * 0.7 * k));
    this.dog.root.position.y = Math.abs(Math.sin(stride)) * 0.05 * k;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    if (this.dog)
      this.dog.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    this.trailMat.dispose();
  }
}
