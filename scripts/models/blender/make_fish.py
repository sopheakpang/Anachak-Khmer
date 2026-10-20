# PK 2026-10-20 (D160): "ត្រី 3D models" — the fish of the Tonle Sap and the moats, made in Blender
# from code for the schools at the fishing spots: ត្រីរៀល trey riel (Henicorhynchus, the small
# silver carp of prahok), ត្រីរ៉ស់ trey ros (striped snakehead, Channa striata: long, olive-brown,
# dark bands) and ត្រីប្រា trey pra (Pangasius catfish: grey back, pale belly, barbels). Each is
# one mesh along +y (glTF +z after export: nose forward), 1 m long, vertex colours (dark back,
# pale belly, the snakehead's bands), with fins, a forked or rounded tail and eyes.
#   python3 -c "import bpy" … or blender -b -P make_fish.py -- <out dir>
import bpy, bmesh, math, os, sys
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else '.'

SPECIES = {
    # name: (half-width, half-height profile peak, back colour, belly colour, bands, tail fork, barbels)
    'trey-riel': dict(w=0.085, h=0.13, back=(0.36, 0.44, 0.5), belly=(0.92, 0.93, 0.9), bands=0, fork=0.75, barbels=0, dorsal=0.13),
    'trey-ros': dict(w=0.075, h=0.085, back=(0.24, 0.24, 0.16), belly=(0.78, 0.74, 0.6), bands=7, fork=0.0, barbels=0, dorsal=0.06),
    'trey-pra': dict(w=0.085, h=0.09, back=(0.26, 0.29, 0.33), belly=(0.88, 0.88, 0.86), bands=0, fork=0.6, barbels=2, dorsal=0.12),
}


def make(name, S):
    bm = bmesh.new()
    col = bm.loops.layers.color.new('Col')
    N, R = 16, 10  # rings along the body, verts round each
    rings = []
    for i in range(N):
        t = i / (N - 1)  # 0 nose .. 1 tail root
        y = 0.5 - t * 0.82
        # A rounded snout, the deepest point a third back, a slim tail stalk (never a needle).
        u = 0.02 + 0.95 * t
        if name == 'trey-ros':
            prof = (u ** 0.3 * (1 - u) ** 0.55) / 0.62  # long, even body
        else:
            prof = (1.9 * u ** 0.5 * (1 - u)) / 0.73
        k = max(0.0, min(1.0, (t - 0.7) / 0.3))
        prof = max(prof, 0.2 * k)
        hw, hh = S['w'] * prof + 0.004, S['h'] * prof + 0.004
        ring = []
        for k in range(R):
            a = 2 * math.pi * k / R
            ring.append(bm.verts.new((math.cos(a) * hw, y, math.sin(a) * hh - 0.1 * hh * (1 - math.sin(a)) * 0.3)))
        rings.append((ring, y, t))
    nose = bm.verts.new((0, 0.515, 0))
    for i in range(N - 1):
        a, b = rings[i][0], rings[i + 1][0]
        for k in range(R):
            bm.faces.new((a[k], a[(k + 1) % R], b[(k + 1) % R], b[k]))
    for k in range(R):
        bm.faces.new((nose, rings[0][0][(k + 1) % R], rings[0][0][k]))
    tail_root = rings[-1][0]
    tc = bm.verts.new((0, rings[-1][1] - 0.01, 0))
    for k in range(R):
        bm.faces.new((tail_root[k], tail_root[(k + 1) % R], tc))
    fins = []
    # tail fin: two lobes (forked) or a rounded paddle
    ty = rings[-1][1]
    if S['fork'] > 0:
        f = S['fork']
        tl = [bm.verts.new(p) for p in ((0, ty, 0.02), (0, ty - 0.2, 0.15), (0, ty - 0.2 + 0.08 * f, 0.0), (0, ty - 0.2, -0.15), (0, ty, -0.02))]
        fins.append(bm.faces.new(tl))
    else:
        tl = [bm.verts.new((0, ty - 0.17 * math.sin(math.pi * u), 0.09 * math.cos(math.pi * u))) for u in [i / 8 for i in range(9)]]
        fins.append(bm.faces.new(tl))
    # dorsal fin (the snakehead's runs most of the back), pectorals, anal fin
    dy0, dy1 = (0.25, -0.05) if name != 'trey-ros' else (0.2, -0.28)
    dorsal = [bm.verts.new((0, dy0, S['h'] * 0.8)), bm.verts.new((0, (dy0 + dy1) / 2 + 0.06, S['h'] * 0.8 + S['dorsal'])), bm.verts.new((0, dy1, S['h'] * 0.5))]
    fins.append(bm.faces.new(dorsal))
    for sx in (-1, 1):
        p = [bm.verts.new((sx * S['w'] * 0.9, 0.28, -S['h'] * 0.3)), bm.verts.new((sx * (S['w'] + 0.08), 0.16, -S['h'] * 0.55)), bm.verts.new((sx * S['w'] * 0.8, 0.2, -S['h'] * 0.5))]
        fins.append(bm.faces.new(p))
    an = [bm.verts.new((0, -0.05, -S['h'] * 0.7)), bm.verts.new((0, -0.15, -S['h'] * 0.7 - 0.05)), bm.verts.new((0, -0.2, -S['h'] * 0.4))]
    fins.append(bm.faces.new(an))
    if S['barbels']:
        for sx in (-1, 1):
            b = [bm.verts.new((sx * 0.02, 0.5, -0.01)), bm.verts.new((sx * 0.09, 0.42, -0.06)), bm.verts.new((sx * 0.02, 0.48, -0.03))]
            fins.append(bm.faces.new(b))
    # eyes: small dark discs on each side near the nose
    eyes = []
    for sx in (-1, 1):
        cx, cy, cz = sx * (S['w'] * 0.72 + 0.006), 0.4, S['h'] * 0.25
        c = bm.verts.new((cx, cy, cz))
        ring = [bm.verts.new((cx, cy + 0.022 * math.cos(2 * math.pi * k / 8), cz + 0.022 * math.sin(2 * math.pi * k / 8))) for k in range(8)]
        for k in range(8):
            eyes.append(bm.faces.new((c, ring[k], ring[(k + 1) % 8]) if sx > 0 else (c, ring[(k + 1) % 8], ring[k])))
    back, belly = Vector(S['back']), Vector(S['belly'])
    fin_c = back * 0.8 + belly * 0.2
    bm.normal_update()
    for f in bm.faces:
        for lp in f.loops:
            v = lp.vert.co
            if f in fins:
                c = fin_c
            elif f in eyes:
                c = Vector((0.05, 0.05, 0.05))
            else:
                hh = max(1e-3, S['h'])
                k = max(0.0, min(1.0, (v.z / hh) * 1.6 + 0.45))  # 0 belly .. 1 back
                c = belly.lerp(back, k)
                if S['bands']:
                    band = 0.5 + 0.5 * math.cos((0.5 - v.y) * S['bands'] * math.pi * 2 / 0.82)
                    if v.z > -0.2 * hh:
                        c = c * (1 - 0.45 * band ** 4)
            lp[col] = (c.x, c.y, c.z, 1.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    m = bpy.data.materials.get('Fish') or bpy.data.materials.new('Fish')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.35
    if not any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Col'
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    me.materials.append(m)
    ob = bpy.data.objects.new('Fish-' + name, me)
    bpy.context.scene.collection.objects.link(ob)
    for o in bpy.context.scene.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), use_selection=True, export_format='GLB', export_apply=True, use_active_scene=True)
    print('FISH', name, sum(len(p.vertices) - 2 for p in me.polygons))
    bpy.data.objects.remove(ob, do_unlink=True)


for n, s in SPECIES.items():
    make(n, s)
