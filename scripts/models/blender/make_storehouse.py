# PK 2026-10-20 (D160): "ឃ្លាំង Storehouse is villager house" — the Meshy granary read as one more
# stilted house. The storehouse made in Blender from code so it reads as a store at a glance: an
# open pavilion (no walls: you see the goods), a low hipped thatch roof with layered eaves on six
# hardwood posts over a raised plank floor on short stumps, and the goods inside and round it —
# rice sacks, round woven baskets, big clay jars, rice sheaves, a stack of logs, a bale tied with
# rope, a ladder. One mesh, plain PBR colours (the game blends them with the land, D156).
#   blender -b -P make_storehouse.py -- <out dir>
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else r"C:\Users\ASUS\Downloads\3D model\Anachak-Khmer\game-ready\storehouse"
random.seed(5)

sc = bpy.data.scenes.get('StoreScene') or bpy.data.scenes.new('StoreScene')
if bpy.context.window:
    bpy.context.window.scene = sc
for o in list(sc.objects):
    if o.name.startswith('Store'):
        bpy.data.objects.remove(o, do_unlink=True)

MATS = {}


def mat(name, rgb, rough=0.85):
    m = bpy.data.materials.get('S_' + name) or bpy.data.materials.new('S_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    MATS[name] = m
    return m


def thatch_image(path):
    """Straw thatch: long vertical strands, darker courses, a little noise (made here, no download)."""
    W2, H2 = 256, 256
    img = bpy.data.images.get('S_thatch') or bpy.data.images.new('S_thatch', W2, H2)
    rnd = random.Random(9)
    strand = [rnd.uniform(0.75, 1.15) for _ in range(W2)]
    px = []
    for yy in range(H2):
        course = 0.82 + 0.18 * ((yy % 32) / 32)  # each course darker at its lower edge
        for xx in range(W2):
            k = strand[xx] * course * rnd.uniform(0.9, 1.05)
            px += [0.56 * k, 0.45 * k, 0.27 * k, 1.0]
    img.pixels[:] = px
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


for n, c in {
    'thatch': (0.55, 0.45, 0.28), 'thatchDark': (0.42, 0.33, 0.2), 'wood': (0.36, 0.24, 0.15),
    'plank': (0.48, 0.35, 0.22), 'sack': (0.78, 0.7, 0.55), 'basket': (0.62, 0.48, 0.28),
    'clay': (0.62, 0.36, 0.22), 'rice': (0.82, 0.68, 0.36), 'log': (0.42, 0.3, 0.2),
    'rope': (0.66, 0.56, 0.38), 'stone': (0.5, 0.42, 0.36),
}.items():
    mat(n, c)
os.makedirs(OUT, exist_ok=True)
TH = thatch_image(os.path.join(OUT, 'thatch.png'))
for n in ('thatch', 'thatchDark'):
    nt = MATS[n].node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = TH
    bsdf = nt.nodes['Principled BSDF']
    if n == 'thatchDark':
        mul = nt.nodes.new('ShaderNodeMixRGB')
        mul.blend_type = 'MULTIPLY'
        mul.inputs[0].default_value = 1.0
        mul.inputs[2].default_value = (0.75, 0.72, 0.68, 1)
        nt.links.new(tex.outputs['Color'], mul.inputs[1])
        nt.links.new(mul.outputs[0], bsdf.inputs['Base Color'])
    else:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

bm = bmesh.new()
parts = []  # (bmesh faces' material index ranges are set via a layer)
ORDER = list(MATS)


def add(geom_fn, m, xf):
    tmp = bmesh.new()
    geom_fn(tmp)
    bmesh.ops.transform(tmp, matrix=xf, verts=tmp.verts)
    for f in tmp.faces:
        f.material_index = ORDER.index(m)
    me = bpy.data.meshes.new('t')
    tmp.to_mesh(me)
    tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def T(x, y, z, rz=0.0, s=(1, 1, 1)):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((*s, 1))


def box(m, sx, sy, sz, x, y, z, rz=0.0):
    add(lambda b: bmesh.ops.create_cube(b, size=1.0), m, T(x, y, z, rz, (sx, sy, sz)))


def cyl(m, r, h, x, y, z, segs=10, r2=None, rx=0.0, rz=0.0):
    def g(b):
        bmesh.ops.create_cone(b, cap_ends=True, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    add(g, m, Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X'))


def ball(m, r, x, y, z, sz=1.0, segs=10):
    add(lambda b: bmesh.ops.create_uvsphere(b, u_segments=segs, v_segments=6, radius=r), m, T(x, y, z, 0, (1, 1, sz)))


W, D = 6.0, 5.2   # floor
FLOOR = 0.7
# --- stumps, floor and steps ------------------------------------------------------------------
for i in range(4):
    for j in range(3):
        cyl('stone', 0.2, 0.35, -W / 2 + 0.4 + i * (W - 0.8) / 3, -D / 2 + 0.4 + j * (D - 0.8) / 2, 0.17, 8)
        cyl('wood', 0.13, FLOOR - 0.3, -W / 2 + 0.4 + i * (W - 0.8) / 3, -D / 2 + 0.4 + j * (D - 0.8) / 2, 0.35 + (FLOOR - 0.3) / 2, 7)
for k in range(12):  # planks across
    box('plank' if k % 3 else 'wood', W, D / 12 - 0.03, 0.08, 0, -D / 2 + (k + 0.5) * D / 12, FLOOR + 0.04)
for k in range(3):  # steps at the front (-y is the front in Blender, +z in the game)
    box('wood', 1.6, 0.35, 0.08, 0, -D / 2 - 0.25 - k * 0.32, FLOOR - 0.22 - k * 0.22)
for sx in (-0.82, 0.82):  # the stair's side boards
    box('wood', 0.08, 1.1, 0.12, sx, -D / 2 - 0.55, FLOOR - 0.44, 0)
    add(lambda b: bmesh.ops.create_cube(b, size=1.0), 'wood', Matrix.Translation((sx, -D / 2 - 0.55, FLOOR / 2 - 0.15)) @ Matrix.Rotation(-0.62, 4, 'X') @ Matrix.Diagonal((0.08, 1.3, 0.12, 1)))
# --- six posts and the beams ------------------------------------------------------------------
POST_H = 2.6
for i in range(3):
    for j in (0, 1):
        x = -W / 2 + 0.25 + i * (W - 0.5) / 2
        y = -D / 2 + 0.25 + j * (D - 0.5)
        box('wood', 0.22, 0.22, POST_H, x, y, FLOOR + POST_H / 2)
top = FLOOR + POST_H
box('wood', W + 0.3, 0.2, 0.22, 0, -D / 2 + 0.25, top)
box('wood', W + 0.3, 0.2, 0.22, 0, D / 2 - 0.25, top)
for i in range(3):
    box('wood', 0.2, D + 0.3, 0.2, -W / 2 + 0.25 + i * (W - 0.5) / 2, 0, top + 0.18)
# --- hipped thatch roof in three layered courses ---------------------------------------------


def hip(b, ew, ed, h, ridge):
    v = [b.verts.new(p) for p in ((-ew, -ed, 0), (ew, -ed, 0), (ew, ed, 0), (-ew, ed, 0))]
    r = [b.verts.new((-ridge, 0, h)), b.verts.new((ridge, 0, h))]
    b.faces.new((v[0], v[1], r[1], r[0]))
    b.faces.new((v[2], v[3], r[0], r[1]))
    b.faces.new((v[1], v[2], r[1]))
    b.faces.new((v[3], v[0], r[0]))
    # underside, so the eaves have thickness from below
    u = [b.verts.new((x, y, -0.12)) for x, y, _ in ((-ew, -ed, 0), (ew, -ed, 0), (ew, ed, 0), (-ew, ed, 0))]
    for a in range(4):
        b.faces.new((v[a], u[a], u[(a + 1) % 4], v[(a + 1) % 4]))
    b.faces.new(list(reversed(u)))


for k, (s, dz, m) in enumerate(((1.0, 0.0, 'thatchDark'), (0.82, 0.55, 'thatch'), (0.62, 1.05, 'thatch'))):
    ew, ed = (W / 2 + 1.0) * s, (D / 2 + 1.0) * s
    add(lambda b, ew=ew, ed=ed, s=s: hip(b, ew, ed, 2.3 * s, 1.4 * s), m, Matrix.Translation((0, 0, top + 0.3 + dz)))
box('thatchDark', 3.0, 0.35, 0.25, 0, 0, top + 0.3 + 1.05 + 2.3 * 0.62)  # the ridge cap


def fringe(b):
    """A ragged straw fringe hanging under the eaves (sawtooth strips round the roof's edge)."""
    ew, ed = W / 2 + 1.0, D / 2 + 1.0
    rnd = random.Random(3)
    edges = [((-ew, -ed), (ew, -ed)), ((ew, -ed), (ew, ed)), ((ew, ed), (-ew, ed)), ((-ew, ed), (-ew, -ed))]
    for (ax, ay), (bx, by) in edges:
        n = int(math.hypot(bx - ax, by - ay) / 0.25)
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            p0 = (ax + (bx - ax) * t0, ay + (by - ay) * t0)
            p1 = (ax + (bx - ax) * t1, ay + (by - ay) * t1)
            drop = rnd.uniform(0.18, 0.4)
            v = [b.verts.new((p0[0], p0[1], -0.1)), b.verts.new((p1[0], p1[1], -0.1)),
                 b.verts.new(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, -0.1 - drop))]
            b.faces.new(v)


add(fringe, 'thatchDark', Matrix.Translation((0, 0, top + 0.3)))
# --- the goods ----------------------------------------------------------------------------------
F = FLOOR + 0.08
for i in range(3):  # sacks of rice, stacked in a pyramid at the back left
    for j in range(4 - i):
        ball('sack', 0.42, -W / 2 + 0.9 + j * 0.62 + i * 0.31, D / 2 - 0.9, F + 0.32 + i * 0.5, 0.75)
for j in range(3):
    ball('sack', 0.42, -W / 2 + 0.9 + j * 0.62, D / 2 - 1.6, F + 0.32, 0.75)
for (x, y) in ((1.2, 1.4), (1.9, 1.3), (1.5, 0.6), (2.3, 0.5)):  # big clay jars at the back right
    cyl('clay', 0.34, 0.55, x, y, F + 0.27, 12, 0.42)
    cyl('clay', 0.42, 0.35, x, y, F + 0.72, 12, 0.18)
    cyl('clay', 0.2, 0.08, x, y, F + 0.92, 12)
for (x, y, s) in ((-0.6, -0.4, 1.0), (0.1, -0.7, 0.85), (-1.3, -1.1, 0.9), (0.9, -1.4, 1.0)):  # round baskets
    cyl('basket', 0.45 * s, 0.55 * s, x, y, F + 0.27 * s, 12, 0.36 * s)
    ball('rice', 0.36 * s, x, y, F + 0.55 * s, 0.35)
for k in range(5):  # rice sheaves leaning on the front left post
    cyl('rice', 0.13, 1.1, -W / 2 + 0.45 + k * 0.22, -D / 2 + 0.55, F + 0.5, 6, 0.06, rx=-0.25)
for k in range(9):  # a stack of logs beside the store, on the ground at the right
    row = 0 if k < 4 else 1 if k < 7 else 2
    i = k if row == 0 else k - 4 if row == 1 else k - 7
    cyl('log', 0.2, 2.6, W / 2 + 1.0 + i * 0.42 + row * 0.21, -0.6, 0.2 + row * 0.36, 8, rx=math.pi / 2)
box('rice', 1.2, 0.8, 0.7, -W / 2 - 0.9, -1.2, 0.35)  # a straw bale on the ground at the left
for d in (-0.25, 0.25):
    box('rope', 0.06, 0.84, 0.74, -W / 2 - 0.9 + d, -1.2, 0.36)
for k in range(2):  # a ladder against the side
    box('wood', 0.07, 0.07, 2.6, W / 2 + 0.15, 1.4 + k * 0.45, 1.2, 0)
for k in range(6):
    box('wood', 0.07, 0.5, 0.05, W / 2 + 0.15, 1.62, 0.3 + k * 0.42)

bm.normal_update()
uvl = bm.loops.layers.uv.new()
for f in bm.faces:
    n = f.normal
    ax = max(range(3), key=lambda i: abs(n[i]))
    for lp in f.loops:
        c = lp.vert.co
        u, v = ((c.x, c.y) if ax == 2 else (c.y, c.z) if ax == 0 else (c.x, c.z))
        lp[uvl].uv = (u * 0.35, v * 0.35)
me = bpy.data.meshes.new('storehouse')
bm.to_mesh(me)
bm.free()
for m in ORDER:
    me.materials.append(MATS[m])
ob = bpy.data.objects.new('Store-house', me)
sc.collection.objects.link(ob)
for s2 in bpy.data.scenes:
    for vl in s2.view_layers:
        for o in vl.objects:
            if o is not None and o.select_get(view_layer=vl):
                o.select_set(False, view_layer=vl)
vl = bpy.context.view_layer
ob.select_set(True)
vl.objects.active = ob
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'storehouse-v2.glb'), use_selection=True, export_format='GLB', export_apply=True, use_active_scene=True)
print('STORE', sum(len(p.vertices) - 2 for p in me.polygons), [round(v, 2) for v in ob.dimensions])
