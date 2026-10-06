import * as THREE from 'three';
import { loadKingdom } from '@temples/shared';
import { setLook, setupRenderer } from '../engine/look';
import { HeroModel, lookFor } from '../kingdom/hero/heroModel';
import { kitFor } from '../kingdom/hero/heroCore';
import { TigerModel } from '../kingdom/hero/tiger';
import { heroModelFor, preloadModels } from '../kingdom/hero/glbModel';
import { yantraTexture, type YantraKind } from '../kingdom/hero/yantra';
import '../fonts.css';

/**
 * Dev page: character sheets of the 3D heroes, rendered by the game on white (PK's reference:
 * full front, full back, the face, the gold bracer, the crown before and after the Angkor Wat
 * era).
 * - /heroSheet.html?kit=king — one character (any unit type: swordsman, archer, villager,
 *   warElephant, oxCart…); &weapon=1 shows the weapon.
 * - /heroSheet.html?all=1 — every character side by side (PK: so the reviewers can check
 *   every costume).
 * - /heroSheet.html?tiger=1 — the encounter tiger from four sides, prowling and swiping.
 * - /heroSheet.html?yantra=1 — the three yantra of the skills' light (lotus, spiral, grid).
 */
const q = new URLSearchParams(location.search);
setLook({ style: 'lowpoly' });
const W = 1920;
const H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
setupRenderer(renderer);
renderer.setClearColor(0xffffff, 1);
renderer.autoClear = false;
document.body.append(renderer.domElement);

const data = loadKingdom();
const all = q.get('all') === '1';
const type = q.get('kit') ?? 'king';
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a890, 1.4));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
sun.position.set(2, 4, 5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xdfe8ff, 1.0);
rim.position.set(-3, 3, -4);
scene.add(rim);

/** A character standing at rest, at x, turned ry, in the Angkor Wat era (tall) or before. */
const make = (
  t: string,
  tall: boolean,
  x: number,
  ry: number,
  armed = q.get('weapon') === '1',
): HeroModel => {
  const kit = kitFor(data.anachak.hero, t);
  const m = new HeroModel(kit, lookFor(kit, t, tall), heroModelFor(data.anachak.hero.models, kit.id));
  m.pose({
    state: 'idle',
    stateT: 0,
    combo: 0,
    stride: 0,
    speed: 0,
    y: 0,
    t: 0.4,
    strikeSec: 0.4,
    skillKind: kit.skill.kind,
  });
  m.showWeapon(armed);
  // The hunter's dog sits at his side (PK's reference sheet).
  if (m.dog) {
    m.dog.root.position.set(x + 0.95, m.dog.root.position.y, -0.55);
    m.dog.root.rotation.y = ry - 0.4;
    scene.add(m.dog.root);
  }
  m.group.position.x = x;
  m.group.rotation.y = ry;
  scene.add(m.group);
  return m;
};

/** Height and width of a model (mounts and carts are framed as well as people). */
const sizeOf = (m: HeroModel): { h: number; w: number } => {
  m.group.updateMatrixWorld(true);
  // Only what shows (a hidden weapon does not count).
  const b = new THREE.Box3();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if ((o as THREE.Mesh).isMesh) b.expandByObject(o, false);
    o.children.forEach(visit);
  };
  visit(m.group);
  return { h: Math.max(1.8, b.max.y - b.min.y), w: Math.max(1, b.max.x - b.min.x, b.max.z - b.min.z) };
};

const nameOf = (t: string) => {
  const d = data.units[t];
  return d ? { km: d.km, en: d.en } : { km: 'ព្រះមហាក្សត្រ', en: 'The King' };
};

const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 200);
const view = (x: number, y: number, w: number, h: number, look: THREE.Vector3, dist: number, yaw = 0) => {
  cam.aspect = w / h;
  cam.position.set(look.x + Math.sin(yaw) * dist, look.y + 0.05, look.z + Math.cos(yaw) * dist);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  renderer.setViewport(x, H - y - h, w, h);
  renderer.setScissor(x, H - y - h, w, h);
  renderer.setScissorTest(true);
  renderer.render(scene, cam);
};
const label = (text: string, x: number, y: number) => {
  const d = document.createElement('div');
  d.className = 'label';
  d.textContent = text;
  d.style.whiteSpace = 'pre';
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  document.body.append(d);
};
const title = document.createElement('div');
title.className = 'title';
document.body.append(title);

/** The colour model: flat chips of the look's colours, as on an anime model sheet. */
function palette(t: string): void {
  const kit = kitFor(data.anachak.hero, t);
  const L = lookFor(kit, t, true);
  const chips: Array<[number, string]> = [
    [L.skin, 'ស្បែក · Skin'],
    [L.hair, 'សក់ · Hair'],
    [L.cloth, 'សំពត់ · Sampot'],
    [L.pattern, 'ក្បាច់ · Pattern'],
    [L.trim, 'ខ្សែក្រវាត់ · Trim'],
    ...(L.jewels !== 'none' ? ([[0xe0b040, 'មាស · Gold']] as Array<[number, string]>) : []),
    ...(L.crown === 'helmet' ? ([[0xa4acb4, 'មួក · Helmet']] as Array<[number, string]>) : []),
  ];
  chips.forEach(([c, name], i) => {
    const d = document.createElement('div');
    Object.assign(d.style, {
      position: 'absolute',
      left: `${1910 - (chips.length - i) * 125}px`,
      top: '72px',
      width: '110px',
      fontSize: '18px',
      textAlign: 'center',
      color: '#2a1a10',
    });
    d.innerHTML = `<div style="height:30px;border:3px solid #140c10;border-radius:6px;background:#${c.toString(16).padStart(6, '0')}"></div>${name}`;
    document.body.append(d);
  });
}

/** One character: back, front, front before the Angkor Wat era, face, forearm. */
function sheetPage(): void {
  const n = nameOf(type);
  title.textContent = `${n.km} · ${n.en} — Anachak Khmer character sheet`;
  const probe = make(type, true, -999, 0);
  const { h: tall, w: wide } = sizeOf(probe);
  scene.remove(probe.group);
  const spread = Math.max(3, wide * 1.6);
  make(type, true, -spread, Math.PI);
  const front = make(type, true, 0, 0);
  make(type, false, spread, 0.25);
  const king = type === 'king';
  const big = tall > 2.6;
  const frame = () => {
    renderer.setScissorTest(false);
    renderer.clear();
    const head = front.headWorld();
    const arm = front.forearmWorld();
    const dist = Math.max(6.4, tall * 2.7, wide * 3.2);
    const mid = Math.max(0.95, tall * 0.47);
    view(0, 80, 420, 960, new THREE.Vector3(-spread, mid, 0), dist);
    view(420, 80, 420, 960, new THREE.Vector3(0, mid, 0), dist);
    view(840, 80, 420, 960, new THREE.Vector3(spread, mid, 0), dist);
    view(1270, 80, 640, 470, new THREE.Vector3(head.x, head.y + 0.02, head.z), 1.25);
    // The right forearm (the figure's right is screen left from the front): bracer, armlet.
    view(1270, 570, 640, 470, arm, 1.05, -0.35);
    requestAnimationFrame(frame);
  };
  label('ខាងក្រោយ · Back', 210, 1000);
  label(king ? 'មកុដខ្ពស់ · Tall Mokot (Angkor Wat era on)' : 'ខាងមុខ · Front (Angkor Wat era)', 630, 1040);
  label(king ? 'មកុដទាប · Low crown (before)' : 'មុនសម័យអង្គរវត្ត · Before Angkor Wat', 1050, 1000);
  label(big ? 'អ្នកជិះ · The rider' : 'មុខ · Face and expression', 1590, 540);
  palette(type);
  label('ដៃ · Arm and jewellery', 1590, 1040);
  frame();
}

/** Every character, front three-quarter, in two rows (PK: the reviewers check every costume). */
function galleryPage(): void {
  title.textContent = 'អាណាចក្រខ្មែរ · Anachak Khmer — every character (Angkor Wat era)';
  const types = ['king', ...data.anachak.hero.kits.flatMap((k) => k.units)];
  const cols = Math.ceil(types.length / 2);
  const w = Math.floor(W / cols);
  const h = 420;
  const models = types.map((t, i) => {
    // The lineup shows each one armed, as the reference sheet does.
    const m = make(t, true, i * 14, 0.5, q.get('weapon') !== '0');
    return { t, x: i * 14, ...sizeOf(m) };
  });
  models.forEach((o, i) => {
    const n = nameOf(o.t);
    label(`${n.km}\n${n.en}`, (i % cols) * w + w / 2, 70 + Math.floor(i / cols) * (h + 24) + h);
  });
  const draw = () => {
    renderer.setScissorTest(false);
    renderer.clear();
    models.forEach((o, i) => {
      // Mounts and the cart turn further, so the rider shows beside the head.
      const mount = o.w > 1.6;
      const dist = Math.max(5.2, o.h * 2.9, o.w * 3.1);
      view(
        (i % cols) * w,
        80 + Math.floor(i / cols) * (h + 24),
        w,
        h,
        new THREE.Vector3(o.x, o.h * 0.48, 0),
        dist,
        mount ? 1.05 : 0.5,
      );
    });
    requestAnimationFrame(draw);
  };
  draw();
}

/** The tiger from the side, front, back and three-quarter; the last one mid-swipe. */
function tigerPage(): void {
  title.textContent = 'ខ្លា · Tiger — Anachak Khmer hero-mode encounter';
  const views: Array<[number, number, string]> = [
    [Math.PI / 2, -1, 'ចំហៀង · Side, prowling'],
    [0, -1, 'ខាងមុខ · Front'],
    [Math.PI, -1, 'ខាងក្រោយ · Back'],
    [0.8, 0.45, 'វាយ · Swipe'],
  ];
  const tigers = views.map(([, attack], i) => {
    const t = new TigerModel();
    t.group.position.x = i * 6;
    t.pose(attack >= 0 ? 0 : 1.2, 0.1, attack, 1);
    scene.add(t.group);
    return t;
  });
  void tigers;
  const w = W / 2;
  const h = 470;
  views.forEach(([, , name], i) =>
    label(name, (i % 2) * w + w / 2, 80 + Math.floor(i / 2) * (h + 20) + h - 30),
  );
  const draw = () => {
    renderer.setScissorTest(false);
    renderer.clear();
    views.forEach(([yaw], i) =>
      view((i % 2) * w, 80 + Math.floor(i / 2) * (h + 20), w, h, new THREE.Vector3(i * 6, 0.8, 0), 5.5, yaw),
    );
    requestAnimationFrame(draw);
  };
  draw();
}

/** The skills' yantra, drawn gold and moonlight blue on night blue. */
function yantraPage(): void {
  renderer.domElement.style.display = 'none';
  document.body.style.background = '#0d1630';
  title.textContent = 'យ័ន្ត · Yantra light for the skills (lotus · spiral · grid)';
  title.style.color = '#ffe2a0';
  const kinds: Array<[YantraKind, string, string]> = [
    ['lotus', '#ffcf6a', 'ផ្កាឈូក · Lotus — the King’s blessing, the war cry'],
    ['spiral', '#9fd8ff', 'វង់ · Spiral — sweeps, charges, the mighty chop'],
    ['grid', '#9fd8ff', 'ក្រឡា · Grid — the rain of arrows, the dog'],
  ];
  kinds.forEach(([k, color, name], i) => {
    const src = yantraTexture(k, 560)!.image as HTMLCanvasElement;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 560;
    const g = cv.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, 560, 560);
    Object.assign(cv.style, {
      position: 'absolute',
      left: `${60 + i * 620}px`,
      top: '150px',
      filter: `drop-shadow(0 0 8px ${color})`,
    });
    document.body.append(cv);
    label(name, 60 + i * 620 + 280, 740);
  });
  document.querySelectorAll<HTMLElement>('.label').forEach((e) => (e.style.color = '#e8eefc'));
}

// PK's model files load first (the built-in figure stands in for any that are missing).
void preloadModels(data.anachak.hero.models).then(() => {
  if (q.get('yantra') === '1') yantraPage();
  else if (q.get('tiger') === '1') tigerPage();
  else if (all) galleryPage();
  else sheetPage();
  (window as unknown as { __sheet: boolean }).__sheet = true;
});
