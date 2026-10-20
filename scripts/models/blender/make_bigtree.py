# PK 2026-10-20 (D156): a big tropical tree for Anachak Khmer, made in Blender from code —
# a Tetrameles / spung tree as at Ta Prohm: a tall pale trunk on great buttress roots, roots
# snaking over the ground, a few heavy limbs high up and an umbrella crown of glossy leaves.
# One mesh, one material (bark on the left half of the atlas, leaf cards on the right half).
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Matrix

import json
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else r"C:\Users\ASUS\Downloads\3D model\Anachak-Khmer\game-ready\bigtree"
# PK 2026-10-20 (D158): the same maker shapes the other tropical trees (a mango, a rain tree):
# the second argument is a JSON of what differs from the big spung.
P = {
    'name': 'big-tropical-tree', 'seed': 11, 'trunk': 15.0, 'radius': 1.15, 'buttress': 3.4,
    'limbs': 6, 'limbLen': [7.5, 10.0], 'limbRise': [2.5, 5.0], 'crown': 12.0, 'clumps': 60,
    'clumpSize': [4.2, 6.2], 'crownLift': 4.0, 'crownDome': 3.2, 'roots': 6,
}
if len(ARGS) > 1:
    P.update(json.loads(ARGS[1]))
ATLAS = os.path.join(OUT, 'bigtree_atlas.png')
random.seed(P['seed'])

for o in list(bpy.data.objects):
    if o.name.startswith('BigTree'):
        bpy.data.objects.remove(o, do_unlink=True)

bm = bmesh.new()
uvl = bm.loops.layers.uv.new()
BARK_U = (0.0, 0.5)
LEAF_U = (0.5, 1.0)
V_PER_M = 1.0 / 12.0  # the bark repeats every 12 m up the trunk


def frames(pts):
    """Parallel-transport frames along a path."""
    out = []
    t0 = (pts[1] - pts[0]).normalized()
    n = t0.orthogonal().normalized()
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        n = (n - t * n.dot(t)).normalized()
        b = t.cross(n).normalized()
        out.append((t, n, b))
    return out


def tube(pts, radii, segs, star=None, v0=0.0, cap=False):
    fr = frames(pts)
    rings = []
    s = v0
    for i, p in enumerate(pts):
        if i:
            s += (pts[i] - pts[i - 1]).length * V_PER_M
        t, n, b = fr[i]
        ring = []
        for k in range(segs + 1):
            th = 2 * math.pi * (k % segs) / segs
            r = radii[i] * (star(th, i) if star else 1.0)
            ring.append((bm.verts.new(p + (n * math.cos(th) + b * math.sin(th)) * r), k / segs, s))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            a, b2, c, d = rings[i][k], rings[i][k + 1], rings[i + 1][k + 1], rings[i + 1][k]
            f = bm.faces.new((a[0], b2[0], c[0], d[0]))
            for loop, q in zip(f.loops, (a, b2, c, d)):
                loop[uvl].uv = (BARK_U[0] + (BARK_U[1] - BARK_U[0]) * q[1] * 0.999, 1.0 - q[2])
    if cap:
        last = rings[-1]
        c = bm.verts.new(pts[-1] + fr[-1][0] * radii[-1] * 0.6)
        for k in range(segs):
            f = bm.faces.new((last[k][0], last[k + 1][0], c))
            for loop in f.loops:
                loop[uvl].uv = (0.25, 0.5)
    return s


def bezier(p0, p1, p2, n):
    return [p0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + p2 * t * t for t in (i / (n - 1) for i in range(n))]


# --- the trunk on its buttresses --------------------------------------------------------
TRUNK_H = P['trunk']
N = 22
lean = Vector((0.35, -0.2, 0))
trunk = [Vector((0, 0, -0.3)) + lean * ((i / (N - 1)) ** 2) + Vector((0, 0, TRUNK_H * (i / (N - 1)) ** 1.5)) for i in range(N)]
trunk_r = [P['radius'] * (1 - 0.55 * (p.z / TRUNK_H)) for p in trunk]
phase = random.random() * 6.28
weights = [random.uniform(0.7, 1.25) for _ in range(6)]


def buttress(th, i):
    h = max(0.0, trunk[i].z)
    A = P['buttress'] * math.exp(-h / 2.6)
    k = int(((th + phase) % (2 * math.pi)) / (2 * math.pi) * 6) % 6
    c = max(0.0, math.cos(6 * (th + phase))) ** 7
    return 1 + A * c * weights[k] + 0.05 * math.sin(th * 13 + h)


tube(trunk, trunk_r, 30, buttress)

# --- roots snaking over the ground from the buttresses --------------------------------
for j in range(P['roots']):
    th = (j + 0.5) / max(1, P['roots']) * 2 * math.pi - phase + random.uniform(-0.2, 0.2)
    d = Vector((math.cos(th), math.sin(th), 0))
    start = d * 2.6 + Vector((0, 0, 0.25))
    L = random.uniform(3.5, 6.5)
    side = d.cross(Vector((0, 0, 1)))
    pts = [start + d * (L * t) + side * math.sin(t * 5 + j) * 0.6 + Vector((0, 0, 0.18 * (1 - t) - 0.05)) for t in (i / 7 for i in range(8))]
    tube(pts, [0.32 * (1 - 0.8 * t) for t in (i / 7 for i in range(8))], 7, cap=True)

# --- limbs and branches -------------------------------------------------------------------
top = trunk[-1]
ends = []
nl = P['limbs']
for j in range(nl):
    a = j / nl * 2 * math.pi + random.uniform(-0.25, 0.25)
    out = Vector((math.cos(a), math.sin(a), 0))
    L = random.uniform(*P['limbLen'])
    rise = random.uniform(*P['limbRise'])
    p0 = top + Vector((0, 0, -random.uniform(0.5, 3.0)))
    p2 = p0 + out * L + Vector((0, 0, rise + 3.0))
    p1 = p0 + out * (L * 0.35) + Vector((0, 0, rise + 3.5))
    pts = bezier(p0, p1, p2, 8)
    tube(pts, [0.55 * (1 - 0.7 * i / 7) for i in range(8)], 9, cap=True)
    ends.append((p2, 1.0))
    for m in range(2):
        q0 = pts[random.randint(4, 6)]
        b = (out + Vector((random.uniform(-0.9, 0.9), random.uniform(-0.9, 0.9), 0))).normalized()
        l2 = random.uniform(3.5, 5.0)
        q2 = q0 + b * l2 + Vector((0, 0, random.uniform(1.0, 2.5)))
        q1 = q0 + b * (l2 * 0.4) + Vector((0, 0, 1.8))
        sp = bezier(q0, q1, q2, 6)
        tube(sp, [0.22 * (1 - 0.7 * i / 5) for i in range(6)], 7, cap=True)
        ends.append((q2, 0.85))

# --- the crown: crossed leaf cards in clumps, an umbrella over the limbs ------------------
def card(c, size, normal_tilt):
    """One leaf card through c: a square, turned at random, tilted toward the sky."""
    az = random.random() * math.pi
    rot = Matrix.Rotation(az, 3, 'Z') @ Matrix.Rotation(normal_tilt, 3, 'X')
    h = size / 2
    corners = [rot @ Vector(v) for v in ((-h, 0, -h), (h, 0, -h), (h, 0, h), (-h, 0, h))]
    vs = [bm.verts.new(c + v) for v in corners]
    f = bm.faces.new(vs)
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = (LEAF_U[0] + (LEAF_U[1] - LEAF_U[0]) * (0.002 + uv[0] * 0.996), 0.002 + uv[1] * 0.996)


clumps = []
for p, k in ends:
    clumps.append((p + Vector((0, 0, 0.2)), P['clumpSize'][1] * 1.15 * k))
# more clumps filling an umbrella-shaped crown
cr = P['crown']
for i in range(P['clumps']):
    a = random.random() * 2 * math.pi
    r = cr * math.sqrt(random.random())
    z = top.z + P['crownLift'] + P['crownDome'] * (1 - (r / cr) ** 2) + random.uniform(-0.8, 0.8)
    clumps.append((Vector((top.x + math.cos(a) * r, top.y + math.sin(a) * r, z)), random.uniform(*P['clumpSize'])))
for c, s in clumps:
    card(c, s, math.radians(random.uniform(55, 80)))   # mostly lying flat: the crown's roof
    card(c, s * 0.9, math.radians(random.uniform(0, 25)))   # and standing: its depth from the side
    card(c, s * 0.85, math.radians(random.uniform(20, 50)))

me = bpy.data.meshes.new(P['name'])
bm.normal_update()
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
ob = bpy.data.objects.new('BigTree-' + P['name'], me)
bpy.context.scene.collection.objects.link(ob)

# --- material: one atlas, leaf alpha clipped, both sides drawn -----------------------------
mat = bpy.data.materials.get('BigTreeMat') or bpy.data.materials.new('BigTreeMat')
mat.use_nodes = True
mat.use_backface_culling = False
nt = mat.node_tree
nt.nodes.clear()
outn = nt.nodes.new('ShaderNodeOutputMaterial')
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Roughness'].default_value = 0.85
tex = nt.nodes.new('ShaderNodeTexImage')
img = bpy.data.images.load(ATLAS, check_existing=True)
tex.image = img
clip = nt.nodes.new('ShaderNodeMath')
clip.operation = 'GREATER_THAN'
clip.inputs[1].default_value = 0.5
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex.outputs['Alpha'], clip.inputs[0])
nt.links.new(clip.outputs[0], bsdf.inputs['Alpha'])
nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
me.materials.append(mat)

tris = sum(len(p.vertices) - 2 for p in me.polygons)
size = [round(v, 2) for v in ob.dimensions]
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, P['name'] + '.glb'), use_selection=True, export_format='GLB', export_image_format='WEBP', export_apply=True)
print('BIGTREE', tris, size)
