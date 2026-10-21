/* global process, console */
// PK 2026-10-21 (D170): put an animation clip made in Blender into a model that has the same
// skeleton, without re-exporting the model (its meshes, textures and other clips stay as they are).
// Channels are matched by node (bone) name; a channel that never moves from the bone's rest is
// left out; a clip of the same name in the model is replaced.
//   node scripts/models/addClip.mjs <model.glb> <clip.glb> <clip name> [out.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

/** True when every key of a sampler equals `rest` (within eps). */
export function staysAtRest(values, rest, eps = 1e-4) {
  const n = rest.length;
  for (let i = 0; i < values.length; i += n) for (let j = 0; j < n; j++) if (Math.abs(values[i + j] - rest[j]) > eps) return false;
  return true;
}

const REST = { translation: 'getTranslation', rotation: 'getRotation', scale: 'getScale' };

/** Copies the first animation of `clipDoc` into `doc` as `name`; returns the channels added. */
export function addClip(doc, clipDoc, name) {
  const root = doc.getRoot();
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  for (const a of root.listAnimations()) if (a.getName() === name) a.dispose();
  const src = clipDoc.getRoot().listAnimations()[0];
  if (!src) throw new Error('the clip file has no animation');
  const buffer = root.listBuffers()[0];
  const anim = doc.createAnimation(name);
  let added = 0;
  const missing = new Set();
  for (const ch of src.listChannels()) {
    const target = nodes.get(ch.getTargetNode()?.getName() ?? '');
    const path = ch.getTargetPath();
    if (!target) {
      missing.add(ch.getTargetNode()?.getName());
      continue;
    }
    const s = ch.getSampler();
    const out = s.getOutput().getArray();
    if (staysAtRest(out, target[REST[path]]())) continue;
    const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(s.getInput().getArray())).setBuffer(buffer);
    const output = doc
      .createAccessor()
      .setType(s.getOutput().getType())
      .setArray(new Float32Array(out))
      .setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(sampler));
    added++;
  }
  // Only the armature's own node may be missing (the clip's armature has its own name).
  return { added, missing: [...missing] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [model, clip, name, out = model] = process.argv.slice(2);
  if (!model || !clip || !name) {
    console.error('usage: node scripts/models/addClip.mjs <model.glb> <clip.glb> <clip name> [out.glb]');
    process.exit(1);
  }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const [doc, clipDoc] = await Promise.all([io.read(model), io.read(clip)]);
  const r = addClip(doc, clipDoc, name);
  await io.write(out, doc);
  console.log(`${name}: ${r.added} channels added to ${out}${r.missing.length ? `; not in the model: ${r.missing.join(', ')}` : ''}`);
}
