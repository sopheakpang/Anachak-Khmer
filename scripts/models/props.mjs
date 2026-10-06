/* global process, console, URL, Buffer */
// Shrink PK's raw Meshy props for the game (1.6.0): one mesh, `tris` triangles, a small WebP
// colour map only (the game lights them itself), written to the slot's file.
//   node scripts/models/props.mjs "<raw folder>" [slot ...]
import { readFileSync, existsSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, textureCompress, flatten, join, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [raw, ...only] = process.argv.slice(2);
if (!raw) {
  console.log('usage: node scripts/models/props.mjs "<raw folder>" [slot ...]');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(new URL('../../config/kingdom/props.json', import.meta.url), 'utf8'));
/**
 * Paint each vertex with the colour map under it (sRGB → linear COLOR_0), then drop the map,
 * the UVs and the normals and weld by position: the mesh can then be cut far down without
 * smearing the colours, and draws like the game's own vertex-coloured plants.
 */
async function bakeVertexColours(doc) {
  const cache = new Map();
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const tex = mat?.getBaseColorTexture();
      const uvA = prim.getAttribute('TEXCOORD_0');
      if (!tex || !uvA) continue;
      let img = cache.get(tex);
      if (!img) {
        const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        img = { data, w: info.width, h: info.height };
        cache.set(tex, img);
      }
      const uv = uvA.getArray();
      const n = uv.length / 2;
      const col = new Float32Array(n * 3);
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const f = mat.getBaseColorFactor();
      for (let i = 0; i < n; i++) {
        const u = ((uv[i * 2] % 1) + 1) % 1;
        const v = ((uv[i * 2 + 1] % 1) + 1) % 1;
        const x = Math.min(img.w - 1, Math.floor(u * img.w));
        const y = Math.min(img.h - 1, Math.floor(v * img.h));
        const o = (y * img.w + x) * 4;
        for (let k = 0; k < 3; k++) col[i * 3 + k] = lin(img.data[o + k] / 255) * f[k];
      }
      const acc = doc.createAccessor().setType('VEC3').setArray(col).setBuffer(uvA.getBuffer());
      prim.setAttribute('COLOR_0', acc);
      prim.setAttribute('TEXCOORD_0', null);
      prim.setAttribute('NORMAL', null);
      mat.setBaseColorTexture(null);
      mat.setBaseColorFactor([1, 1, 1, 1]);
    }
  await doc.transform(weld(), prune());
}

const triCount = (doc) => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return t;
};
for (const [slot, s] of Object.entries(cfg.slots)) {
  if (only.length && !only.includes(slot)) continue;
  const src = `${raw}/${s.source}`;
  if (!existsSync(src)) {
    console.log(slot, 'missing', src);
    continue;
  }
  const doc = await io.read(src);
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicRoughnessTexture(null);
    m.setNormalTexture(null);
    m.setOcclusionTexture(null);
    m.setEmissiveTexture(null);
    m.setEmissiveFactor([0, 0, 0]);
    m.setMetallicFactor(0);
    m.setRoughnessFactor(1);
  }
  await doc.transform(flatten(), join(), weld(), prune());
  const before = triCount(doc);
  await MeshoptSimplifier.ready;
  if (s.bake === 'vertex') await bakeVertexColours(doc);
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const uv = prim.getAttribute('TEXCOORD_0')?.getArray();
      const idx = prim.getIndices();
      const src = new Uint32Array(idx.getArray());
      const target = Math.floor(s.tris * 3);
      if (src.length <= target * 1.15) continue;
      let best = src;
      for (const err of [0.01, 0.03, 0.06, 0.1, 0.2]) {
        const [ix] = uv
          ? MeshoptSimplifier.simplifyWithAttributes(src, pos, 3, uv, 2, [0.5, 0.5], null, target, err, ['Prune'])
          : MeshoptSimplifier.simplify(src, pos, 3, target, err, ['Prune']);
        best = ix;
        if (ix.length <= target * 1.15) break;
      }
      // Baked colours have no seams to keep: the last cuts may ignore the topology.
      if (!uv && best.length > target * 1.15)
        [best] = MeshoptSimplifier.simplifySloppy(best, pos, 3, null, target, 1);
      idx.setArray(best);
      compactPrimitive(prim);
    }
  await doc.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [s.tex, s.tex], quality: 82 }),
  );
  await io.write(`apps/game/public-mobile/${s.file}`, doc);
  const kb = Math.round(readFileSync(`apps/game/public-mobile/${s.file}`).length / 1024);
  console.log(slot, Math.round(before), '→', Math.round(triCount(doc)), 'tris', kb, 'KB');
}
