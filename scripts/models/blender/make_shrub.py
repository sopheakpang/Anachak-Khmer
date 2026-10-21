# PK 2026-10-21 (D168): "Remove or use Blender to make new and replace" the scatter models whose
# shapes broke when their scans were cut down to a game budget (shredded leaves, floating
# shards). The bushes are made again here from code in the forest trees' look (D159): a low dome of
# round leaf clumps, each clump small leaf-spray cards on a shell (the tree maker's atlas: sunlit
# sprays outside and on top, shaded ones underneath and inside), on a few short woody stems.
#   python3 -c "import bpy, sys; sys.argv=['x','--',<out dir>,<json>]; exec(open('make_shrub.py').read())"
# json: name, seed, height, width (m), clumps, lobe (clump radius m), cards (per clump),
#       atlas (png path), hue (degrees to turn the leaves: purple flowering bush), stems.
import bpy, bmesh, math, random, os, sys, json
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else '.'
P = {'name': 'shrub', 'seed': 1, 'height': 1.5, 'width': 2.0, 'clumps': 14, 'lobe': 0.42, 'cards': 16,
     'atlas': os.path.join(OUT, 'bigtree_atlas3.png'), 'hue': 0, 'stems': 5, 'card': [0.9, 1.3]}
if len(ARGS) > 1:
    P.update(json.loads(ARGS[1]))
random.seed(P['seed'])

bpy.ops.wm.read_factory_settings(use_empty=True)
bm = bmesh.new()
uvl = bm.loops.layers.uv.new()
BARK_U = (0.0, 0.25)
LEAF_U = (0.25, 1.0)
UP = Vector((0, 0, 1))
LEAF_N = {}


def card(c, size, out, sprite):
    """One leaf spray through c, facing `out`, picture `sprite` (0-2 sunlit, 3-5 shade)."""
    z = out.normalized()
    x = z.cross(UP if abs(z.z) < 0.95 else Vector((1, 0, 0))).normalized()
    y = z.cross(x)
    spin = random.uniform(-0.6, 0.6)
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


def stem(a, b, r):
    """A thin woody stem from a to b (6 sides, bark UVs)."""
    d = (b - a)
    t = d.normalized()
    n = t.orthogonal().normalized()
    bb = t.cross(n)
    rings = []
    for k, (p, rr) in enumerate(((a, r), (b, r * 0.4))):
        ring = []
        for i in range(7):
            th = 2 * math.pi * (i % 6) / 6
            ring.append((bm.verts.new(p + (n * math.cos(th) + bb * math.sin(th)) * rr), i / 6, k * d.length / 3))
        rings.append(ring)
    for i in range(6):
        v = [rings[0][i], rings[0][i + 1], rings[1][i + 1], rings[1][i]]
        f = bm.faces.new([q[0] for q in v])
        for loop, q in zip(f.loops, v):
            loop[uvl].uv = (BARK_U[0] + (BARK_U[1] - BARK_U[0]) * q[1], q[2] % 1.0)


H, W = P['height'], P['width']
R = P['lobe']
# Clumps on a low dome: the outer ones lower and further out, a few up top.
lobes = []
for i in range(P['clumps']):
    a = random.random() * 2 * math.pi
    r = (W / 2 - R) * math.sqrt(random.random())
    z = R * 0.8 + (H - 2 * R * 0.9) * (1 - (r / max(1e-3, W / 2 - R)) ** 2) * random.uniform(0.75, 1.0)
    lobes.append((Vector((math.cos(a) * r, math.sin(a) * r, z)), R * random.uniform(0.85, 1.15)))
heart = sum((c for c, _ in lobes), Vector()) / len(lobes)
for i in range(P['stems']):
    c, _ = lobes[i % len(lobes)]
    stem(Vector((random.uniform(-0.08, 0.08), random.uniform(-0.08, 0.08), 0)), c * 0.8, 0.035 * H)
gold = math.pi * (3 - math.sqrt(5))
for c, rad in lobes:
    n = P['cards']
    for i in range(n):
        zz = 1 - 2 * (i + 0.5) / n
        zz = 1 - (1 - zz) * 0.85
        rr = math.sqrt(max(0.0, 1 - zz * zz))
        th = i * gold + random.uniform(-0.3, 0.3)
        d = Vector((math.cos(th) * rr, math.sin(th) * rr, zz))
        pos = c + d * rad * random.uniform(0.7, 1.0)
        pos.z = max(pos.z, 0.05)
        outward = (pos - heart).normalized().dot(d)
        lit = zz > -0.15 and (zz > 0.45 or outward > -0.2)
        card(pos, rad * random.uniform(*P['card']), d + Vector((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), 0.15)),
             random.randrange(3) + (0 if lit else 3))
    for i in range(3):  # a shaded heart so the light does not show through the clump
        d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 0.6))).normalized()
        card(c + d * rad * 0.3, rad * 1.1, d, 3 + random.randrange(3))

me = bpy.data.meshes.new(P['name'])
bm.normal_update()
bm.verts.index_update()
vnorm = [tuple(LEAF_N.get(v, v.normal)) for v in bm.verts]
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True
if hasattr(me, 'use_auto_smooth'):
    me.use_auto_smooth = True
me.normals_split_custom_set_from_vertices(vnorm)
ob = bpy.data.objects.new('Shrub-' + P['name'], me)
bpy.context.scene.collection.objects.link(ob)

# The atlas, its leaves turned `hue` degrees (a purple flowering bush) when asked.
atlas = P['atlas']
if P['hue']:
    from PIL import Image
    import numpy as np
    im = Image.open(atlas).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255.0
    w0 = int(a.shape[1] * LEAF_U[0])
    leaf = a[:, w0:, :3]
    hsv = np.asarray(Image.fromarray((leaf * 255).astype(np.uint8)).convert('HSV')).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + P['hue'] / 360 * 255) % 255
    hsv[..., 1] *= P.get('sat', 1.0)
    rgb = np.asarray(Image.fromarray(np.clip(hsv, 0, 255).astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32) / 255
    a[:, w0:, :3] = rgb
    atlas = os.path.join(OUT, f"{P['name']}_atlas.png")
    Image.fromarray((a * 255).astype(np.uint8)).save(atlas)

mat = bpy.data.materials.new('ShrubMat')
mat.use_nodes = True
mat.use_backface_culling = False
nt = mat.node_tree
nt.nodes.clear()
outn = nt.nodes.new('ShaderNodeOutputMaterial')
bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Roughness'].default_value = 0.85
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(atlas, check_existing=True)
clip = nt.nodes.new('ShaderNodeMath')
clip.operation = 'GREATER_THAN'
clip.inputs[1].default_value = 0.5
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex.outputs['Alpha'], clip.inputs[0])
nt.links.new(clip.outputs[0], bsdf.inputs['Alpha'])
nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
me.materials.append(mat)

tris = sum(len(p.vertices) - 2 for p in me.polygons)
for o in bpy.context.scene.objects:
    o.select_set(o == ob)
bpy.context.view_layer.objects.active = ob
os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, P['name'] + '.glb'), use_selection=True, export_format='GLB',
                          export_image_format='WEBP', export_apply=True, use_active_scene=True)
print('SHRUB', P['name'], tris, [round(v, 2) for v in ob.dimensions])
