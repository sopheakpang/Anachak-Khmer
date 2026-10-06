import '../fonts.css';
import '../style.css';
import '../kingdom/view/ancientMap.css';
import { loadKingdom } from '@temples/shared';
import { createStage, setLayout } from '../stage';
import { KingdomSim, PLAYER } from '../kingdom/sim/sim';
import { tileToWorld } from '../kingdom/sim/map';
import { AncientMap, mapViewOf } from '../kingdom/view/ancientMap';

/**
 * Dev-only page for the ancient map popup (npm run dev -w @temples/game, then
 * /ancientmap.html): a real campaign map with a large explored area, some places found,
 * a few enemies in sight. ?all=1 explores everything; ?focus=1 opens zoomed on Angkor.
 */
const q = new URLSearchParams(location.search);
const { overlay } = createStage(document.getElementById('app')!);
setLayout('landscape');
overlay.style.pointerEvents = 'auto';
overlay.style.background = '#4a5a3a';

const sim = new KingdomSim(loadKingdom(), 'easy');
const N = sim.map.size;
const [sx, sz] = sim.map.start;
const f = sim.fog;
for (let z = 0; z < N; z++)
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - sx, z - sz);
    const band = Math.abs(x - 0.9 * z - 60) < 70 && z < 900; // a road explored to the north-west
    const east = Math.hypot(x - 800, z - 600) < 170;
    if (q.get('all') || d < 300 || band || east) f.explored[z * N + x] = 1;
    if (d < 60) f.visible[z * N + x] = 1;
  }
for (const p of sim.data.world.places) if (f.explored[p.at[1] * N + p.at[0]]) sim.discovered.add(p.id);
// A few enemies in sight near home.
const any = [...sim.units.values()][0]!;
for (let i = 0; i < 6; i++) {
  const [x, z] = tileToWorld(sim.map, sx + 30 + i * 3, sz - 25 + (i % 2) * 4);
  sim.units.set(9000 + i, { ...any, id: 9000 + i, team: 1, x, z });
}
sim.fogVersion++;

const [cx, cz] = tileToWorld(sim.map, sx, sz);
const log: string[] = [];
const map = new AncientMap(overlay, {
  onGo: (x, z) => log.push(`go ${x.toFixed(0)},${z.toFixed(0)}`),
  onSend: (x, z) => log.push(`send ${x.toFixed(0)},${z.toFixed(0)}`),
  onClose: () => log.push('close'),
});
const view = { x: cx, z: cz, w: 160, h: 90 };
let prepareMs = 0;
if (q.get('prepare')) {
  const tp = performance.now();
  map.prepare(mapViewOf(sim, PLAYER));
  prepareMs = performance.now() - tp;
}
const t0 = performance.now();
map.open(mapViewOf(sim, PLAYER), q.get('focus') ? { x: cx, z: cz } : undefined);
const openMs = performance.now() - t0;
const t1 = performance.now();
map.render(mapViewOf(sim, PLAYER), view);
const frameMs = performance.now() - t1;
(window as unknown as { __am: unknown }).__am = { prepareMs, openMs, frameMs, log, map };
const loop = () => {
  if (map.isOpen) map.render(mapViewOf(sim, PLAYER), view);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
