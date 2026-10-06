/* global process, console, URL */
// Auto-rig (D112): bake a Mixamo-named skeleton and skin weights into an unrigged humanoid model
// standing with its arms down (TRELLIS, Tripo or Meshy output), so the game's HeroRig drives it.
//   node scripts/models/autorig.mjs small.glb rigged.glb ./king-landmarks.mjs
// The landmarks file gives the joint heights and widths in the model's own units (+y up, facing
// +z, +x = the character's left); read them off `slice.mjs`-style cross-sections.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [inp, out] = process.argv.slice(2);
const doc = await io.read(inp);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const meshNode = root.listNodes().find((n) => n.getMesh());
// Bake any node transforms into the vertices (skinned meshes ignore their node transform).
const wm = meshNode.getWorldMatrix();
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const nor = prim.getAttribute('NORMAL');
const n = pos.getCount();
const P = new Float32Array(n * 3);
const v = [0, 0, 0];
const ident = wm.every((x, i) => Math.abs(x - [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]) < 1e-6);
for (let i = 0; i < n; i++) {
  pos.getElement(i, v);
  const x = wm[0] * v[0] + wm[4] * v[1] + wm[8] * v[2] + wm[12],
    y = wm[1] * v[0] + wm[5] * v[1] + wm[9] * v[2] + wm[13],
    z = wm[2] * v[0] + wm[6] * v[1] + wm[10] * v[2] + wm[14];
  P[i * 3] = x;
  P[i * 3 + 1] = y;
  P[i * 3 + 2] = z;
}
if (!ident) {
  for (let i = 0; i < n; i++) pos.setElement(i, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  // normals: rotation part only (uniform scale assumed)
  const t = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    nor.getElement(i, t);
    const x = wm[0] * t[0] + wm[4] * t[1] + wm[8] * t[2],
      y = wm[1] * t[0] + wm[5] * t[1] + wm[9] * t[2],
      z = wm[2] * t[0] + wm[6] * t[1] + wm[10] * t[2];
    const l = Math.hypot(x, y, z) || 1;
    nor.setElement(i, [x / l, y / l, z / l]);
  }
  let p = meshNode;
  while (p) {
    p.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    p = p.getParentNode();
  }
}
// Landmarks (model space, +y up, facing +z; +x is the character's left).
const L = (await import(new URL(process.argv[4], 'file://' + process.cwd() + '/').href)).default;
// Bones: name, parent, world head position.
const bones = [
  ['Hips', null, [0, L.hipsY, 0]],
  ['Spine', 'Hips', [0, L.spineY, 0]],
  ['Spine1', 'Spine', [0, L.chestY, 0]],
  ['Neck', 'Spine1', [0, L.neckY, 0]],
  ['Head', 'Neck', [0, L.headY, 0]],
  ['HeadTop_End', 'Head', [0, L.topY, 0]],
];
for (const [side, sx] of [
  ['Left', 1],
  ['Right', -1],
]) {
  bones.push(
    [`${side}Shoulder`, 'Spine1', [sx * L.clavX, L.shoulderY, 0]],
    [`${side}Arm`, `${side}Shoulder`, [sx * L.shoulderX, L.shoulderY, 0]],
    [`${side}ForeArm`, `${side}Arm`, [sx * L.elbowX, L.elbowY, L.elbowZ]],
    [`${side}Hand`, `${side}ForeArm`, [sx * L.wristX, L.wristY, L.wristZ]],
    [`${side}HandTip_End`, `${side}Hand`, [sx * L.wristX, L.handEndY, L.wristZ]],
    [`${side}UpLeg`, 'Hips', [sx * L.legX, L.legY, 0]],
    [`${side}Leg`, `${side}UpLeg`, [sx * L.legX, L.kneeY, 0]],
    [`${side}Foot`, `${side}Leg`, [sx * L.legX, L.ankleY, 0]],
    [`${side}ToeBase`, `${side}Foot`, [sx * L.legX, L.minY + 0.01, L.toeZ]],
  );
}
const byName = new Map(bones.map((b) => [b[0], b]));
const nodes = new Map();
for (const [name, parent, w] of bones) {
  const pw = parent ? byName.get(parent)[2] : [0, 0, 0];
  const nd = doc.createNode('mixamorig:' + name).setTranslation([w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]]);
  nodes.set(name, nd);
  if (parent) nodes.get(parent).addChild(nd);
  else scene.addChild(nd);
}
// Weighting segments: the bone owns the segment from its head to its (main) child's head.
const seg = (b, a, c, opts = {}) => ({ b, a, c, ...opts });
const W = (name) => byName.get(name)[2];
const segs = [
  seg('Hips', [0, L.legY - 0.02, 0], W('Spine')),
  seg('Spine', W('Spine'), W('Spine1')),
  seg('Spine1', W('Spine1'), W('Neck')),
  seg('Neck', W('Neck'), W('Head')),
  seg('Head', W('Head'), W('HeadTop_End')),
];
for (const s of ['Left', 'Right']) {
  segs.push(
    seg(`${s}Shoulder`, W(`${s}Shoulder`), W(`${s}Arm`), { arm: s }),
    seg(`${s}Arm`, W(`${s}Arm`), W(`${s}ForeArm`), { arm: s }),
    seg(`${s}ForeArm`, W(`${s}ForeArm`), W(`${s}Hand`), { arm: s }),
    seg(`${s}Hand`, W(`${s}Hand`), W(`${s}HandTip_End`), { arm: s }),
    seg(`${s}UpLeg`, W(`${s}UpLeg`), W(`${s}Leg`), { leg: s }),
    seg(`${s}Leg`, W(`${s}Leg`), W(`${s}Foot`), { leg: s }),
    seg(`${s}Foot`, W(`${s}Foot`), W(`${s}ToeBase`), { leg: s }),
  );
}
const jointNames = segs.map((s) => s.b);
function dseg(p, a, c) {
  const ab = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-9;
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2));
  const q = [a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]];
  return Math.hypot(q[0], q[1], q[2]);
}

// Groups: arms below the shoulders are cut free of the body (TRELLIS fuses hands and elbows to
// the skirt and chest; a triangle across the gap would stretch into a spike when the arm moves).
const armDist = (p, side) =>
  Math.min(
    ...segs.filter((s) => s.arm === side && s.b.indexOf('Shoulder') < 0).map((s) => dseg(p, s.a, s.c)),
  );
const grp = (x, y, z) => {
  const gap = L.armGap(y);
  if (gap >= 1) return 'any';
  if (Math.abs(x) <= gap) return 'body';
  const side = x >= 0 ? 'Left' : 'Right';
  return armDist([x, y, z], side) < L.armR ? side : 'body';
};
const idxAcc = prim.getIndices();
const idx = Array.from(idxAcc.getArray());
const vg = new Array(n);
for (let i = 0; i < n; i++) vg[i] = grp(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
const dupKey = new Map();
const extra = []; // [src, group]
for (let t = 0; t < idx.length; t += 3) {
  const gs = [vg[idx[t]], vg[idx[t + 1]], vg[idx[t + 2]]].filter((g) => g !== 'any');
  if (!gs.length) continue;
  const cnt = {};
  gs.forEach((g) => (cnt[g] = (cnt[g] || 0) + 1));
  const tg = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  for (let k = 0; k < 3; k++) {
    const v0 = idx[t + k];
    if (vg[v0] === 'any' || vg[v0] === tg) continue;
    const key = v0 + ':' + tg;
    let nv = dupKey.get(key);
    if (nv === undefined) {
      nv = n + extra.length;
      extra.push([v0, tg]);
      dupKey.set(key, nv);
    }
    idx[t + k] = nv;
  }
}
const N = n + extra.length;
const vgroup = vg.concat(extra.map((e) => e[1]));
const src = (i) => (i < n ? i : extra[i - n][0]);
// Grow the vertex attributes for the duplicates.
for (const sem of prim.listSemantics()) {
  const a = prim.getAttribute(sem);
  const es = a.getElementSize();
  const arr = new (a.getArray().constructor)(N * es);
  arr.set(a.getArray());
  const el = new Array(es).fill(0);
  extra.forEach(([v0], j) => {
    a.getElement(v0, el);
    arr.set(el, (n + j) * es);
  });
  a.setArray(arr);
}
idxAcc.setArray(new Uint32Array(idx));
console.log('cut', extra.length, 'vertices free of the body');
const J = new Uint16Array(N * 4),
  Wt = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  const s0 = src(i);
  const p = [P[s0 * 3], P[s0 * 3 + 1], P[s0 * 3 + 2]];
  const ax = Math.abs(p[0]);
  const side = p[0] >= 0 ? 'Left' : 'Right';
  const g = vgroup[i];
  const cand = [];
  segs.forEach((s, k) => {
    if (s.arm && s.arm !== side) return;
    if (s.leg && s.leg !== side && ax > L.legBlend) return;
    if (g === 'body' && s.arm) return;
    if ((g === 'Left' || g === 'Right') && !s.arm) return;
    if (s.leg && p[1] > L.legY + 0.02) return;
    cand.push([k, dseg(p, s.a, s.c)]);
  });
  cand.sort((a, b) => a[1] - b[1]);
  const top = cand.slice(0, 4);
  const d0 = Math.max(top[0][1], 1e-4);
  let sum = 0;
  const ws = top.map(([k, d]) => {
    const w = Math.pow(d0 / Math.max(d, 1e-4), 8);
    sum += w;
    return [k, w];
  });
  ws.forEach(([k, w], j) => {
    J[i * 4 + j] = k;
    Wt[i * 4 + j] = w / sum;
  });
}
const buf = root.listBuffers()[0];
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(Wt).setBuffer(buf));
const ibm = new Float32Array(jointNames.length * 16);
jointNames.forEach((nm, k) => {
  const w = W(nm);
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -w[0], -w[1], -w[2], 1], k * 16);
});
const skin = doc
  .createSkin('kingSkin')
  .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf))
  .setSkeleton(nodes.get('Hips'));
for (const nm of jointNames) skin.addJoint(nodes.get(nm));
meshNode.setSkin(skin);
await io.write(out, doc);
console.log('rigged', n, 'verts,', jointNames.length, 'joints');
