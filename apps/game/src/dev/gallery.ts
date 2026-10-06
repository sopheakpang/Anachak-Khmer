import * as THREE from 'three';
import { addLights, environmentFrom, setLook, setupRenderer, skyDome, styleScene } from '../engine/look';
import { ACT, Crowd, crowdMaterial, hutGeometry, workerGeometry, WALK } from '../engine/figures';
import { riderGeometry } from '../expedition/jungleArt';
import { archerGeometry, spearmanGeometry, swordsmanGeometry } from '../kingdom/view/art';
import {
  elephantGeometry,
  elephantWithBlockGeometry,
  horseGeometry,
  nandiGeometry,
  oxCartGeometry,
  zebuGeometry,
} from '../engine/animals';
// ?houses=1: Khmer houses and village livestock (Kingdom tab).
import { stiltHouseGeometry } from '../kingdom/view/art';
import { keungHouseGeometry, rongHouseGeometry } from '../kingdom/view/houses';
import { chickenGeometry, cowGeometry, pigGeometry } from '../kingdom/view/livestock';
// ?people=1: Kingdom people by job and era, the commander, watchman, mounts and supply cart.
import {
  buffaloRiderGeometry,
  commanderGeometry,
  horsemanGeometry,
  oxCartUnitGeometry,
  soldierGeometry,
  villagerGeometry,
  watchmanGeometry,
  type EraLook,
  type Job,
} from '../kingdom/view/people';

/**
 * Dev-only model gallery (npm run dev -w @temples/game, then /gallery.html): every animal
 * and a worker side by side, for reviewing shapes. ?style=film shows the D25 look.
 * ?y=0.6 turns the line-up; ?walk=1 animates legs.
 */
const q = new URLSearchParams(location.search);
setLook({ style: q.get('style') ?? 'lowpoly' });
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1600, 900);
setupRenderer(renderer);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9c9a8);
scene.add(skyDome());
addLights(scene, { center: [0, 0, 0], extent: 20 });
scene.environment = environmentFrom(renderer);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 30),
  new THREE.MeshStandardMaterial({ color: 0xc9a46b }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const models: Array<[THREE.BufferGeometry, number]> = [
  [q.get('plain') ? elephantGeometry() : elephantWithBlockGeometry(), -9],
  [horseGeometry(), -4.5],
  [horseGeometry({ pack: true }), -2.2],
  [zebuGeometry(), 0.2],
  [nandiGeometry(), 2.6],
  [oxCartGeometry(), 6.2],
  [workerGeometry('mallet'), 9.6],
  [riderGeometry(), 13.5],
  [hutGeometry(), 18.5],
];
const mat = crowdMaterial(q.get('walk') ? WALK : { speed: 0, leg: 0, arm: 0, armSync: 0 });
const turn = Number(q.get('y') ?? '0.9');
for (const [g, x] of models) {
  const m = new THREE.InstancedMesh(g, mat, 1);
  m.setMatrixAt(0, new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0, 0));
  m.setColorAt(0, new THREE.Color(0xb8412f));
  m.castShadow = true;
  scene.add(m);
}
// Second row: the crew's actions (stand, hammer, lift, pull, lever, carry on the head),
// third row: fighting (spear thrust, Bokator sword, bow, guard) and planting rice (D63).
const acts = [ACT.stand, ACT.hammer, ACT.lift, ACT.pull, ACT.lever, ACT.carry];
const tools = ['none', 'mallet', 'none', 'none', 'pole', 'none'] as const;
const tAct = Number(q.get('t') ?? '1.2');
acts.forEach((act, i) => {
  const c = new Crowd(workerGeometry(tools[i]), 1);
  c.setAgents([
    { place: () => ({ x: -7 + i * 2.8, y: 0, z: 6, heading: 0.5, act, lean: act === ACT.pull ? -0.3 : 0 }) },
  ]);
  c.update(tAct);
  scene.add(c.mesh);
});
const fight: Array<[THREE.BufferGeometry, number, number]> = [
  [spearmanGeometry(), ACT.thrust, 0],
  [swordsmanGeometry(), ACT.sword, 0],
  [swordsmanGeometry(), ACT.sword, 0],
  [archerGeometry(), ACT.draw, 0],
  [swordsmanGeometry(), ACT.guard, 0],
  [workerGeometry(), ACT.plant, 0.42],
];
fight.forEach(([g, act, lean], i) => {
  const c = new Crowd(g, 1);
  c.setAgents([{ place: () => ({ x: -7 + i * 2.8, y: 0, z: 11, heading: 0.9, act: act as never, lean }) }]);
  c.update(tAct + (i === 2 ? 1.3 : 0));
  scene.add(c.mesh);
});
const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 500);
const cx = Number(q.get('cx') ?? '2');
const cd = Number(q.get('cd') ?? '30');
const lz = Number(q.get('lz') ?? '0');
cam.position.set(cx, 7 * (cd / 30), cd + lz);
cam.lookAt(cx, 1.5, lz);

// ---- ?houses=1 block: Pteas Rong, Pteas Keung and the old stilt house, with a pig, a
// chicken and cows in front; the usual line-up is hidden. ?hy turns the houses.
if (q.get('houses')) {
  for (const o of [...scene.children]) if (o instanceof THREE.InstancedMesh) o.visible = false;
  const hTurn = Number(q.get('hy') ?? '0.5');
  const row: Array<[THREE.BufferGeometry, number, number, number]> = [
    [stiltHouseGeometry(), -8, 0, 1],
    [rongHouseGeometry(), -2.5, 0, 1],
    [keungHouseGeometry(), 4.5, 0, 1],
    [pigGeometry(), -4.5, 5, 2],
    [chickenGeometry(), -2.8, 5.4, 2],
    [cowGeometry(), 0, 5, 1],
    [cowGeometry({ brown: true }), 2.2, 5, 1],
  ];
  for (const [g, x, z, s] of row) {
    const m = new THREE.InstancedMesh(g, mat, 1);
    m.setMatrixAt(
      0,
      new THREE.Matrix4()
        .makeRotationY(z > 0 ? turn : hTurn)
        .scale(new THREE.Vector3(s, s, s))
        .setPosition(x, 0, z),
    );
    m.setColorAt(0, new THREE.Color(0xb8412f));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
  const hd = Number(q.get('cd') ?? '26');
  cam.position.set(Number(q.get('cx') ?? '-1'), Number(q.get('cyh') ?? '9') * (hd / 26), hd + 2);
  cam.lookAt(Number(q.get('cx') ?? '-1'), 2.6, 1);
}
// ---- end ?houses=1 block

// ---- ?people=1 block: row 1 villagers by job, row 2 soldiers by era, row 3 specials.
if (q.get('people')) {
  for (const o of [...scene.children]) if (o instanceof THREE.InstancedMesh) o.visible = false;
  const jobs: Job[] = [
    'idle',
    'builder',
    'farmer',
    'fisher',
    'woodcutter',
    'quarryman',
    'goldworker',
    'hunter',
    'forager',
    'porter',
  ];
  const eras: EraLook[] = ['early', 'baphuon', 'angkorWat', 'bayon'];
  const row: Array<[THREE.BufferGeometry, number, number]> = [];
  jobs.forEach((j, i) => row.push([villagerGeometry(j, 'early'), (i - 4.5) * 1.3, 0]));
  eras.forEach((e, k) =>
    (['spearman', 'swordsman', 'archer'] as const).forEach((t, i) =>
      row.push([soldierGeometry(t, e), (k * 3 + i - 5.5) * 1.1, -3]),
    ),
  );
  row.push([commanderGeometry('angkorWat'), -9, -7]);
  row.push([commanderGeometry('bayon'), -6.5, -7]);
  row.push([watchmanGeometry('early'), -4, -7]);
  row.push([horsemanGeometry('angkorWat'), -1, -7]);
  row.push([buffaloRiderGeometry('early'), 2.5, -7]);
  row.push([oxCartUnitGeometry(), 7, -7]);
  for (const [g, x, z] of row) {
    const m = new THREE.InstancedMesh(g, mat, 1);
    m.setMatrixAt(0, new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0, z));
    m.setColorAt(0, new THREE.Color(0x2f5fa8));
    m.castShadow = true;
    scene.add(m);
  }
  const pd = Number(q.get('cd') ?? '16');
  cam.position.set(Number(q.get('cx') ?? '0'), 6 * (pd / 16), pd + Number(q.get('lz') ?? '0'));
  cam.lookAt(Number(q.get('cx') ?? '0'), 1, Number(q.get('lz') ?? '0'));
}
// ---- end ?people=1 block
styleScene(scene);
renderer.render(scene, cam);
(window as unknown as { galleryReady: boolean }).galleryReady = true;
