/* global process, console */
// Game-ready copies of very heavy static scans (D154): Blender's collapse decimate shreds thin
// bark, leaves and reeds when an 800k-8M triangle scan is cut to ~1 %, and the 8 GB PC runs out
// of memory on the biggest. meshoptimizer keeps the outline far better. One model a run:
//   node --max-old-space-size=6000 scripts/models/heavy.mjs in.glb out.glb <height m> <triangles> [tex px]
// Bakes node transforms, joins, welds, simplifies to the triangle budget, scales to the real
// height, stands it centred on the ground (y = 0) and writes WebP textures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  weld,
  simplify,
  prune,
  dedup,
  join,
  flatten,
  textureCompress,
  transformMesh,
  clearNodeTransform,
  getBounds,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, h0, t0, px0] = process.argv.slice(2);
if (!inp || !out || !h0) {
  console.log('usage: node scripts/models/heavy.mjs in.glb out.glb <height m> <triangles> [tex px]');
  process.exit(1);
}
const height = +h0;
const target = +t0 || 6000;
const px = +px0 || 1024;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();

const triCount = () =>
  root
    .listMeshes()
    .flatMap((m) => m.listPrimitives())
    .reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);

await doc.transform(flatten());
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  transformMesh(mesh, node.getWorldMatrix());
  clearNodeTransform(node);
}
await doc.transform(join(), weld());
const before = triCount();
if (before > target * 1.05) {
  // A tight error first; meshopt stops early on thin parts rather than tear them.
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / before, error: 0.02, lockBorder: false }));
  // Still far over: allow more error (the outline is what counts at RTS distance).
  if (triCount() > target * 1.5)
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: target / triCount(), error: 0.08, lockBorder: false }));
  // Scans cut into thousands of texture islands cannot collapse across the seams: the last
  // step is meshopt's sloppy simplifier (merges by position only, the texture stays mapped).
  if (triCount() > target * 1.5) {
    await MeshoptSimplifier.ready;
    const ratio = target / triCount();
    for (const prim of root.listMeshes().flatMap((m) => m.listPrimitives())) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      if (!idx || !pos) continue;
      const want = Math.max(3, Math.floor((idx.getCount() * ratio) / 3) * 3);
      const [out] = MeshoptSimplifier.simplifySloppy(
        Uint32Array.from(idx.getArray()),
        Float32Array.from(pos.getArray()),
        3,
        null,
        want,
        0.05,
      );
      idx.setArray(out);
    }
    await doc.transform(prune());
  }
}
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const bb = getBounds(scene);
const cur = bb.max[1] - bb.min[1];
const k = cur > 1e-6 ? height / cur : 1;
const cx = (bb.min[0] + bb.max[0]) / 2;
const cz = (bb.min[2] + bb.max[2]) / 2;
// Column-major: scale k, then move so the base centre sits at the origin.
const m = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, -cx * k, -bb.min[1] * k, -cz * k, 1];
for (const mesh of root.listMeshes()) transformMesh(mesh, m);
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [px, px], quality: 85 }),
);
await io.write(out, doc);
const b2 = getBounds(scene);
console.log(
  JSON.stringify({
    out,
    trisIn: before,
    tris: triCount(),
    size: [0, 1, 2].map((i) => +(b2.max[i] - b2.min[i]).toFixed(3)),
  }),
);
