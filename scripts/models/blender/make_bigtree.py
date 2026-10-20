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
    # D159: leaf clumps of small cards on the shell of round lobes (lobe radius = clump size × this,
    # cards per lobe, card size × lobe radius) and the atlas with bark in the left quarter, 3 × 2 leaf sprays.
    'lobe': 0.6, 'cards': 22, 'card': [0.95, 1.35], 'atlas': 'bigtree_atlas3.png',
}
if len(ARGS) > 1:
    P.update(json.loads(ARGS[1]))
ATLAS = os.path.join(OUT, P['atlas'])
random.seed(P['seed'])

for o in list(bpy.data.objects):
    if o.name.startswith('BigTree'):
        bpy.data.objects.remove(o, do_unlink=True)

bm = bmesh.new()
uvl = bm.loops.layers.uv.new()
BARK_U = (0.0, 0.25)
LEAF_U = (0.25, 1.0)
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
                loop[uvl].uv = ((BARK_U[0] + BARK_U[1]) / 2, 0.5)
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
    start = d * (P['radius'] * 1.5) + Vector((0, 0, 0.12))
    L = random.uniform(3.5, 6.5) * min(1.0, P['radius'] / 0.9)
    side = d.cross(Vector((0, 0, 1)))
    pts = [start + d * (L * t) + side * math.sin(t * 5 + j) * 0.6 + Vector((0, 0, 0.1 * (1 - t) - 0.12 * t)) for t in (i / 7 for i in range(8))]
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

# --- the crown (D159): round lobes of leaf clumps, each card facing out of its lobe --------
LEAF_N = {}  # vertex -> the normal it shades with: out of its lobe and up (soft, round crowns)
UP = Vector((0, 0, 1))


def card(c, size, out, sprite):
    """One leaf spray through c, facing `out`, picture `sprite` (0-2 sunlit, 3-5 shade)."""
    z = out.normalized()
    x = z.cross(UP if abs(z.z) < 0.95 else Vector((1, 0, 0))).normalized()
    y = z.cross(x)
    spin = random.uniform(-0.6, 0.6)  # the spray mostly upright, its twigs below
    xr = x * math.cos(spin) + y * math.sin(spin)
    yr = y * math.cos(spin) - x * math.sin(spin)
    if yr.z < 0:
        xr, yr = -xr, -yr
    h = size / 2
    vs = [bm.verts.new(c + xr * u * h + yr * v * h) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    col, row = sprite % 3, sprite // 3
    u0 = LEAF_U[0] + (LEAF_U[1] - LEAF_U[0]) * col / 3
    du = (LEAF_U[1] - LEAF_U[0]) / 3
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = (u0 + du * (0.01 + uv[0] * 0.98), 1.0 - (row + 1 - (0.01 + uv[1] * 0.98)) * 0.5)
    n = (z * 0.75 + UP * 0.45).normalized()
    for v in vs:
        LEAF_N[v] = n


lobes = []
for p, k in ends:
    lobes.append((p + Vector((0, 0, 0.6)), P['clumpSize'][1] * P['lobe'] * k))
cr = P['crown']
for i in range(max(4, P['clumps'] // 4)):
    a = random.random() * 2 * math.pi
    r = cr * 0.75 * math.sqrt(random.random())
    z = top.z + P['crownLift'] + P['crownDome'] * (1 - (r / cr) ** 2) + random.uniform(-0.5, 0.8)
    lobes.append((Vector((top.x + math.cos(a) * r, top.y + math.sin(a) * r, z)), random.uniform(*P['clumpSize']) * P['lobe']))
heart = sum((c for c, _ in lobes), Vector()) / len(lobes)
gold = math.pi * (3 - math.sqrt(5))
for c, R in lobes:
    n = P['cards']
    for i in range(n):
        # spread over the lobe's shell (golden spiral), fewer underneath
        zz = 1 - 2 * (i + 0.5) / n
        zz = 1 - (1 - zz) * 0.85
        rr = math.sqrt(max(0.0, 1 - zz * zz))
        th = i * gold + random.uniform(-0.3, 0.3)
        d = Vector((math.cos(th) * rr, math.sin(th) * rr, zz))
        pos = c + d * R * random.uniform(0.7, 1.0)
        # sunlit on top and on the crown's outside, shaded underneath and toward its heart
        outward = (pos - heart).normalized().dot(d)
        lit = zz > -0.15 and (zz > 0.45 or outward > -0.2)
        card(pos, R * random.uniform(*P['card']), d + Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 0.15)), random.randrange(3) + (0 if lit else 3))
    for i in range(3):  # a shaded heart so the light does not show through the lobe
        d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 0.6))).normalized()
        card(c + d * R * 0.3, R * 1.1, d, 3 + random.randrange(3))

me = bpy.data.meshes.new(P['name'])
bm.normal_update()
bm.verts.index_update()
vnorm = [tuple(LEAF_N.get(v, v.normal)) for v in bm.verts]
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
if hasattr(me, 'use_auto_smooth'):
    me.use_auto_smooth = True  # Blender < 4.1: custom normals need it
me.normals_split_custom_set_from_vertices(vnorm)
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
for sc in bpy.data.scenes:  # never export another scene's selection (D158)
    for vl in sc.view_layers:
        for o in vl.objects:
            if o is not None and o.select_get(view_layer=vl):
                o.select_set(False, view_layer=vl)
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, P['name'] + '.glb'), use_selection=True, export_format='GLB', export_image_format='WEBP', export_apply=True, use_active_scene=True)
print('BIGTREE', tris, size)
