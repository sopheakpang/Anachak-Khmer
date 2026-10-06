/* global process, console */
// Shrink an AI-made model for the game (D112): weld, simplify to a triangle budget with
// meshoptimizer, drop unused maps, resize textures to 1024 WebP.
//   node scripts/models/shrink.mjs raw.glb small.glb 24000
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [inp, out, target0] = process.argv.slice(2);
if (!inp || !out) {
  console.log('usage: node scripts/models/shrink.mjs in.glb out.glb [triangles=24000]');
  process.exit(1);
}
const doc = await io.read(inp);
// The game draws models cel-shaded: the metal/roughness map is not used, so it is dropped.
for (const m of doc.getRoot().listMaterials()) {
  m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(1);
}
const target = +target0 || 24000;
const prim0 = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const tris = prim0.getIndices()
  ? prim0.getIndices().getCount() / 3
  : prim0.getAttribute('POSITION').getCount() / 3;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: target / tris, error: 0.01, lockBorder: false }),
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
);
await io.write(out, doc);
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
console.log('tris', prim.getIndices().getCount() / 3, 'verts', prim.getAttribute('POSITION').getCount());
