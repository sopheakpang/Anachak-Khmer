/* global process, console */
// Quick facts about .glb files: triangles, meshes, materials, textures, bounding size, skin.
//   node scripts/models/inspect.mjs a.glb b.glb ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  let tris = 0;
  for (const m of r.listMeshes())
    for (const p of m.listPrimitives())
      tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const b = getBounds(r.listScenes()[0]);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(2));
  const tex = r.listTextures().map((t) => (t.getSize() ?? []).join('x')).join(',');
  console.log(
    f.split('/').pop(),
    JSON.stringify({ tris, meshes: r.listMeshes().length, mats: r.listMaterials().length, tex, size, skins: r.listSkins().length, anims: r.listAnimations().length }),
  );
}
