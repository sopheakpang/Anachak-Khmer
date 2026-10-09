/* global process, console, URL */
// PK 1.8.0: shrink PK's Meshy trees for the game. Each entry of config/kingdom/props.json
// `trees` becomes the near model (`hi` triangles, `tex` px WebP colour map, one mesh,
// metal/normal maps dropped: the game lights them itself). The far trees are picture cards of
// this model: copy it to apps/game/public-mobile/_bake/ and run
//   node scripts/models/grassCards.mjs <port> <id>.glb <id>-cards turn 0 top
// then move models/grass/<id>-cards.webp to models/trees/ (its printed `card` goes in the config).
//   node scripts/models/trees.mjs "<raw folder>" [id ...]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune, dedup, textureCompress, flatten, join, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [raw, ...only] = process.argv.slice(2);
if (!raw) {
  console.log('usage: node scripts/models/trees.mjs "<raw folder>" [id ...]');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(new URL('../../config/kingdom/props.json', import.meta.url), 'utf8'));

const triCount = (doc) => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return t;
};

/** Read, clean and simplify one model to `tris` triangles with a `tex` px colour map. */
async function make(src, out, tris, tex) {
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
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray();
      const uv = prim.getAttribute('TEXCOORD_0')?.getArray();
      const idx = prim.getIndices();
      const all = new Uint32Array(idx.getArray());
      const target = Math.floor(tris * 3);
      if (all.length <= target * 1.15) continue;
      let best = all;
      // Keep the UV seams first; loosen the error until the budget is met.
      for (const err of [0.005, 0.01, 0.03, 0.06, 0.1, 0.2, 0.4]) {
        const [ix] = uv
          ? MeshoptSimplifier.simplifyWithAttributes(all, pos, 3, uv, 2, [0.5, 0.5], null, target, err, ['Prune'])
          : MeshoptSimplifier.simplify(all, pos, 3, target, err, ['Prune']);
        best = ix;
        if (ix.length <= target * 1.15) break;
      }
      // Still over (leaf cards with many seams): the last cut may ignore the topology.
      if (best.length > target * 1.3) [best] = MeshoptSimplifier.simplifySloppy(best, pos, 3, null, target, 1);
      idx.setArray(best);
      compactPrimitive(prim);
    }
  await doc.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 82 }),
  );
  await io.write(out, doc);
  return { before, after: triCount(doc), kb: Math.round(statSync(out).size / 1024) };
}

for (const t of cfg.trees ?? []) {
  if (only.length && !only.includes(t.id)) continue;
  const src = `${raw}/${t.source}`;
  if (!existsSync(src)) {
    console.log(t.id, 'missing', src);
    continue;
  }
  const hi = await make(src, `apps/game/public-mobile/${t.file}`, t.hi, t.tex);
  console.log(t.id, Math.round(hi.before), '→', Math.round(hi.after), `triangles, ${hi.kb} KB`);
}
