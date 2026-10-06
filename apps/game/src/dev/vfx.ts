import * as THREE from 'three';
import {
  addLights,
  environmentFrom,
  groundPlane,
  setLook,
  setupRenderer,
  skyDome,
  styleScene,
} from '../engine/look';
import { figureMaterial, treeGeometry } from '../engine/figures';
import { WeatherFx } from '../kingdom/view/weather';
import { BURST_KINDS, Particles } from '../kingdom/view/vfx';
import { KingdomSound, sfxForEvent, type SfxName } from '../kingdom/view/sound';

/**
 * Dev-only check of Kingdom weather and particles (npm run dev -w @temples/game, then
 * /vfx.html): ground, trees, WeatherFx and a burst of every particle kind each second.
 * ?w=windy|rain|storm|clear fixes the weather (default: cycles windy → rain → storm every 8 s);
 * ?cd=60 camera distance. Click to hear the sounds (each burst plays its matching effect).
 */
const q = new URLSearchParams(location.search);
setLook({ style: q.get('style') ?? 'lowpoly' });
const W = 1600;
const H = 900;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
setupRenderer(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9c9a8);
scene.fog = new THREE.Fog(0xf0dcb8, 150, 520);
scene.add(skyDome());
addLights(scene, { center: [0, 0, 0], extent: 40 });
scene.environment = environmentFrom(renderer);
scene.add(groundPlane(240, 240, new THREE.MeshStandardMaterial({ color: 0x9c9a5a })));

const trees = new THREE.InstancedMesh(treeGeometry(1), figureMaterial, 40);
const m = new THREE.Matrix4();
for (let i = 0; i < 40; i++) {
  const a = i * 2.4;
  const r = 14 + (i % 7) * 4;
  m.makeRotationY(a).setPosition(Math.cos(a) * r, 0, Math.sin(a) * r - 6);
  trees.setMatrixAt(i, m);
}
trees.castShadow = true;
scene.add(trees);

const weather = new WeatherFx(scene);
const fx = new Particles();
scene.add(fx.mesh);
const cam = new THREE.PerspectiveCamera(38, W / H, 1, 900);
fx.setViewport(H, cam.fov);
const dist = Number(q.get('cd') ?? '60');
const pitch = THREE.MathUtils.degToRad(56);
cam.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
cam.lookAt(0, 0, 0);

const sound = new KingdomSound();
addEventListener('pointerdown', () => sound.unlock());
const kindSound: Record<string, SfxName> = {
  chips: 'chop',
  dust: 'mine',
  sparks: 'sword',
  splash: 'splash',
  smoke: 'build',
  hit: 'hit',
  leaves: 'farm',
  gold: 'mine',
};

const cycle = ['windy', 'rain', 'storm'];
const fixed = q.get('w');
const label = document.createElement('div');
label.style.cssText =
  'position:fixed;left:12px;top:8px;font:20px sans-serif;color:#fff;text-shadow:0 1px 3px #000';
document.body.append(label);
let last = performance.now() / 1000;
let nextBurst = 0;
// Software rendering in headless checks is slow: clamp the step so easing still looks real.
function frame(): void {
  const now = performance.now() / 1000;
  const dt = Math.min(0.25, now - last);
  last = now;
  const id = fixed ?? cycle[Math.floor(now / 8) % cycle.length]!;
  weather.update(id, now, 0, 0, dt);
  sound.setAmbience({ rain: weather.rain, wind: weather.wind, birds: id === 'clear' ? 1 : 0 });
  if (now > nextBurst) {
    nextBurst = now + 1;
    BURST_KINDS.forEach((k, i) => {
      const x = (i - (BURST_KINDS.length - 1) / 2) * 5;
      fx.burst(k, x, k === 'smoke' ? 0.5 : 1, 4);
      sound.play(kindSound[k]!, { pan: x / 30, gain: 0.6 });
    });
    if (id === 'storm') sound.play(sfxForEvent({ kind: 'weather', weather: 'storm' }) ?? 'thunder');
  }
  fx.update(dt);
  label.textContent = `${id}  wind ${weather.wind.toFixed(2)}  rain ${weather.rain.toFixed(2)}  particles ${fx.alive}`;
  styleScene(scene);
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
