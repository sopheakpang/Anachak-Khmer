# PK 2026-10-21 (D168): the small plants whose scans broke when cut to a game budget, made again
# from code, whole and light: shapes with painted vertex colours (no texture to smear).
#   reeds     — a clump of tapered, gently bowed blades, green to straw at the tips, with cattails
#   lily-pads — round pads with their notch, cupped at the rim, veined from the middle, a bud or two
#   red-lily  — arching strap leaves round a few red flower spikes (a ginger / canna clump)
#   python3 -c "import bpy, sys; sys.argv=['x','--',<out dir>,<kind>,<seed>]; exec(open('make_plants.py').read())"
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else '.'
KIND = ARGS[1] if len(ARGS) > 1 else 'reeds'
random.seed(int(ARGS[2]) if len(ARGS) > 2 else 1)

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
col = bm.loops.layers.color.new('Col')


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def face(verts, colours):
    f = bm.faces.new(verts)
    for loop, c in zip(f.loops, colours):
        loop[col] = (*c, 1.0)
    return f


def blade(base, height, width, lean, turn, c0, c1, segs=4, droop=0.0):
    """A tapered blade from `base`, bowed by `lean` (m at the tip), facing `turn`."""
    side = Vector((math.cos(turn), math.sin(turn), 0))
    out = Vector((-math.sin(turn), math.cos(turn), 0))
    left, right, ts = [], [], []
    for i in range(segs + 1):
        t = i / segs
        bend = lean * t * t
        z = height * t - droop * t ** 3 * height
        p = base + out * bend + Vector((0, 0, z))
        w = width * (1 - t) ** 0.8 * 0.5 + 0.002
        left.append(bm.verts.new(p - side * w))
        right.append(bm.verts.new(p + side * w))
        ts.append(t)
    for i in range(segs):
        a, b = lerp(c0, c1, ts[i]), lerp(c0, c1, ts[i + 1])
        face([left[i], right[i], right[i + 1], left[i + 1]], [a, a, b, b])


def spike(base, height, radius, c, segs=6):
    """A closed cone/cylinder: a cattail head or a flower spike."""
    ring0 = [bm.verts.new(base + Vector((math.cos(2 * math.pi * k / segs) * radius, math.sin(2 * math.pi * k / segs) * radius, 0))) for k in range(segs)]
    ring1 = [bm.verts.new(base + Vector((math.cos(2 * math.pi * k / segs) * radius * 0.8, math.sin(2 * math.pi * k / segs) * radius * 0.8, height))) for k in range(segs)]
    tip = bm.verts.new(base + Vector((0, 0, height + radius * 1.2)))
    dark = tuple(v * 0.8 for v in c)
    for k in range(segs):
        n = (k + 1) % segs
        face([ring0[k], ring0[n], ring1[n], ring1[k]], [dark, dark, c, c])
        face([ring1[k], ring1[n], tip], [c, c, c])


def disc(centre, r, notch, cup, c_mid, c_rim, segs=16, tilt=(0.0, 0.0)):
    """A lily pad: a fan of triangles with a wedge cut out, its rim turned up by `cup`."""
    m = Matrix.Rotation(tilt[0], 4, 'X') @ Matrix.Rotation(tilt[1], 4, 'Y')
    mid = bm.verts.new(centre)
    a0 = random.uniform(0, 2 * math.pi)
    rim = []
    for k in range(segs + 1):
        a = a0 + notch / 2 + (2 * math.pi - notch) * k / segs
        rr = r * random.uniform(0.96, 1.03)
        p = Vector((math.cos(a) * rr, math.sin(a) * rr, cup))
        rim.append(bm.verts.new(centre + (m @ p)))
    for k in range(segs):
        vein = c_rim if k % 2 else lerp(c_rim, c_mid, 0.4)
        face([mid, rim[k], rim[k + 1]], [c_mid, vein, vein])


GREEN = (0.16, 0.36, 0.08)
YGREEN = (0.42, 0.52, 0.16)
STRAW = (0.62, 0.56, 0.3)

if KIND == 'reeds':
    # 1.4 m tall, 2.4 m across: 5 tufts of blades, cattails in two of them.
    for t in range(5):
        c = Vector((random.uniform(-0.8, 0.8), random.uniform(-0.6, 0.6), 0))
        for i in range(26):
            a = random.uniform(0, 2 * math.pi)
            base = c + Vector((math.cos(a), math.sin(a), 0)) * random.uniform(0, 0.22)
            h = random.uniform(0.8, 1.4)
            blade(base, h, random.uniform(0.025, 0.045), random.uniform(0.05, 0.35), a + math.pi / 2,
                  lerp(GREEN, YGREEN, random.random() * 0.5), lerp(YGREEN, STRAW, random.uniform(0.3, 0.9)),
                  segs=3, droop=random.uniform(0, 0.08))
        if t < 2:
            for i in range(3):
                b = c + Vector((random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12), 0))
                blade(b, random.uniform(1.0, 1.25), 0.012, 0.03, random.uniform(0, 3), GREEN, YGREEN, segs=2)
                spike(b + Vector((0, 0, random.uniform(1.0, 1.2))), 0.16, 0.025, (0.35, 0.2, 0.1))
elif KIND == 'lily-pads':
    # Pads on the water across 2.6 m, 0.2 m high (a bud or two standing up).
    pads = []
    for i in range(9):
        for _ in range(30):
            p = Vector((random.uniform(-1.05, 1.05), random.uniform(-1.05, 1.05), 0))
            r = random.uniform(0.18, 0.36)
            if all((p - q).length > r + rq - 0.04 for q, rq in pads) and p.length + r < 1.3:
                pads.append((p, r))
                break
    for p, r in pads:
        disc(p + Vector((0, 0, 0.01)), r, random.uniform(0.25, 0.45), r * 0.06,
             lerp(GREEN, YGREEN, 0.25), lerp(GREEN, (0.1, 0.24, 0.06), 0.5),
             tilt=(random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05)))
    for i in range(2):
        p, r = pads[i]
        b = p + Vector((r * 0.9, 0, 0))
        blade(b, 0.12, 0.012, 0.0, 0, GREEN, GREEN, segs=1)
        spike(b + Vector((0, 0, 0.12)), 0.07, 0.035, (0.85, 0.45, 0.55))
elif KIND == 'red-lily':
    # 0.6 m tall, 0.7 m across: arching strap leaves, three red flower spikes.
    for i in range(22):
        a = random.uniform(0, 2 * math.pi)
        base = Vector((math.cos(a), math.sin(a), 0)) * random.uniform(0, 0.08)
        blade(base, random.uniform(0.35, 0.55), random.uniform(0.06, 0.09), random.uniform(0.15, 0.3), a + math.pi / 2,
              GREEN, lerp(GREEN, YGREEN, 0.6), segs=4, droop=random.uniform(0.15, 0.35))
    for i in range(3):
        a = 2 * math.pi * i / 3 + random.uniform(-0.3, 0.3)
        b = Vector((math.cos(a), math.sin(a), 0)) * 0.06
        top = b + Vector((0, 0, random.uniform(0.42, 0.5)))
        blade(b, top.z, 0.014, 0.02, a, GREEN, GREEN, segs=2)
        # A spider-lily head: thin red petals curling out and up from the top of the stalk.
        for k in range(7):
            pa = 2 * math.pi * k / 7 + random.uniform(-0.2, 0.2)
            blade(top, random.uniform(0.07, 0.1), 0.018, random.uniform(0.07, 0.1), pa - math.pi / 2,
                  (0.75, 0.08, 0.06), (0.92, 0.2, 0.12), segs=3, droop=0.5)
elif KIND == 'wildflowers':
    # 0.6 m tall, 1 m across: grass tufts with small flower heads (white, yellow, blue, pink).
    heads = [(0.95, 0.95, 0.9), (0.95, 0.8, 0.2), (0.35, 0.45, 0.9), (0.9, 0.5, 0.65)]
    for t in range(11):
        c = Vector((random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), 0))
        for i in range(12):
            a = random.uniform(0, 2 * math.pi)
            base = c + Vector((math.cos(a), math.sin(a), 0)) * random.uniform(0, 0.08)
            blade(base, random.uniform(0.14, 0.3), random.uniform(0.012, 0.022), random.uniform(0.04, 0.12), a + math.pi / 2,
                  GREEN, YGREEN, segs=2)
        hc = random.choice(heads)
        for i in range(random.randint(2, 4)):
            a = random.uniform(0, 2 * math.pi)
            top = c + Vector((math.cos(a), math.sin(a), 0)) * random.uniform(0, 0.1) + Vector((0, 0, random.uniform(0.2, 0.36)))
            blade(Vector((top.x, top.y, 0)), top.z, 0.008, 0.02, a, GREEN, GREEN, segs=2)
            for k in range(5):  # a little five-petalled flower facing up
                pa = 2 * math.pi * k / 5
                blade(top, 0.05, 0.035, 0.045, pa - math.pi / 2, hc, hc, segs=1, droop=0.6)
else:
    raise SystemExit('unknown kind ' + KIND)

me = bpy.data.meshes.new(KIND)
bm.normal_update()
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
m = bpy.data.materials.new('Painted')
m.use_nodes = True
m.use_backface_culling = False
nt = m.node_tree
bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.8
vc = nt.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.append(m)
ob = bpy.data.objects.new('Plant-' + KIND, me)
bpy.context.scene.collection.objects.link(ob)
for o in bpy.context.scene.objects:
    o.select_set(o == ob)
bpy.context.view_layer.objects.active = ob
os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, KIND + '.glb'), use_selection=True, export_format='GLB',
                          export_apply=True, use_active_scene=True, export_vertex_color='ACTIVE')
print('PLANT', KIND, sum(len(p.vertices) - 2 for p in me.polygons), [round(v, 2) for v in ob.dimensions])
