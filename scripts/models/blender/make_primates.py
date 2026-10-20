# PK 2026-10-20 (D161): the six wild animals that had no 3D model — the gibbon, the silvered
# langur, the red-shanked douc, the long-tailed macaque, the slow loris and the binturong — made in
# Blender from code, in the stylised low-poly look of the game: rounded parts (head, body, limbs,
# tail) with vertex colours for their coats (the douc's grey body, maroon legs, white forearms and
# golden face; the gibbon's dark coat and pale face ring; the loris's eye rings; the binturong's
# shaggy black coat). Standing on all fours (the gibbon upright, arms long), facing glTF +z, sized in
# the game (props.json animals). One mesh each, no rig (they glide, as the snakes and birds do).
#   python3 -c "import bpy" … exec, or blender -b -P make_primates.py -- <out dir>
import bpy, bmesh, math, os, sys
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else '.'


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')

    def part(self, kind, size, at, colour, rot=(0, 0, 0), segs=10):
        tmp = bmesh.new()
        if kind == 'ball':
            bmesh.ops.create_uvsphere(tmp, u_segments=segs, v_segments=max(5, segs // 2 + 1), radius=1.0)
        else:  # 'limb': a capsule-ish cylinder along z, size = (radius, radius, length)
            bmesh.ops.create_cone(tmp, cap_ends=True, segments=max(6, segs - 2), radius1=1.0, radius2=0.8, depth=1.0)
        m = Matrix.Translation(at) @ (Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X')) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
        c = tmp.loops.layers.color.new('Col')
        for f in tmp.faces:
            for lp in f.loops:
                lp[c] = (*colour, 1.0)
        me = bpy.data.meshes.new('t')
        tmp.to_mesh(me)
        tmp.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)

    def limb(self, a, b, r, colour):
        a, b = Vector(a), Vector(b)
        d = b - a
        mid = (a + b) / 2
        q = d.to_track_quat('Z', 'Y').to_euler()
        self.part('limb', (r, r, d.length), mid, colour, rot=(q.x, q.y, q.z), segs=8)
        self.part('ball', (r * 1.05, r * 1.05, r * 1.05), b, colour, segs=6)

    def tail(self, root, dirs, r, colour, n=6, curl=0.0):
        p = Vector(root)
        d = Vector(dirs).normalized()
        step = Vector(dirs).length / n
        for i in range(n):
            nxt = p + d * step
            self.limb(p, nxt, r * (1 - 0.6 * i / n), colour)
            d = (Matrix.Rotation(curl, 3, 'X') @ d).normalized()
            p = nxt

    def save(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = True
        m = bpy.data.materials.get('Fur') or bpy.data.materials.new('Fur')
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value = 0.9
        if not any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
            vc = nt.nodes.new('ShaderNodeVertexColor')
            vc.layer_name = 'Col'
            nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        me.materials.append(m)
        ob = bpy.data.objects.new('Primate-' + name, me)
        sc = bpy.context.scene
        sc.collection.objects.link(ob)
        for s2 in bpy.data.scenes:
            for vl in s2.view_layers:
                for o in vl.objects:
                    if o is not None and o.select_get(view_layer=vl):
                        o.select_set(False, view_layer=vl)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        os.makedirs(OUT, exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), use_selection=True, export_format='GLB', export_apply=True, use_active_scene=True)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        print('PRIMATE', name, tris, [round(v, 2) for v in ob.dimensions])
        bpy.data.objects.remove(ob, do_unlink=True)


# Blender: -y is the animal's front (glTF +z), z up. Sizes in metres (the game refits them).
def quadruped(name, body, head, legs, tail, coat, belly, face, extra=None):
    """A monkey on all fours: body (half-sizes), head radius, leg length, tail (length, curl)."""
    b = Builder()
    bx, by, bz = body
    hip_h = legs * 0.95
    b.part('ball', (bx, by, bz), (0, 0, hip_h + bz * 0.6), coat)
    b.part('ball', (bx * 0.85, by * 0.5, bz * 0.7), (0, 0.05, hip_h + bz * 0.25), belly)
    hx = -by * 0.95
    b.part('ball', (head, head * 1.05, head), (0, hx - head * 0.6, hip_h + bz * 1.25 + head * 0.3), coat)
    b.part('ball', (head * 0.62, head * 0.45, head * 0.55), (0, hx - head * 1.45, hip_h + bz * 1.2 + head * 0.15), face)
    for sx in (-1, 1):  # eyes
        b.part('ball', (head * 0.12,) * 3, (sx * head * 0.32, hx - head * 1.75, hip_h + bz * 1.25 + head * 0.35), (0.04, 0.03, 0.02), segs=6)
    for sx in (-1, 1):
        for fy, k in ((-by * 0.7, 1.05), (by * 0.7, 1.0)):  # front legs a little longer (monkeys)
            top = (sx * bx * 0.6, fy, hip_h + bz * 0.2)
            knee = (sx * bx * 0.65, fy + (0.03 if fy < 0 else -0.03), legs * 0.5 * k)
            foot = (sx * bx * 0.65, fy - 0.04, 0.03)
            leg_c = (extra or {}).get('front' if fy < 0 else 'hind', coat)
            b.limb(top, knee, bx * 0.28, leg_c)
            b.limb(knee, foot, bx * 0.24, (extra or {}).get('fore', leg_c) if fy < 0 else leg_c)
    if tail:
        length, curl, r = tail
        # Out behind, then hanging down (curl < 0 droops it; the binturong's tip curls in).
        b.tail((0, by * 0.95, hip_h + bz * 0.7), (0, length * 0.75, length * 0.1), r, coat, n=7, curl=curl)
    b.save(name)


def gibbon():
    b = Builder()
    coat, face = (0.12, 0.1, 0.09), (0.8, 0.74, 0.62)
    b.part('ball', (0.13, 0.1, 0.2), (0, 0, 0.55), coat)  # upright body
    b.part('ball', (0.1, 0.1, 0.1), (0, -0.02, 0.86), coat)
    b.part('ball', (0.075, 0.05, 0.075), (0, -0.09, 0.85), face)  # the pale face ring
    b.part('ball', (0.05, 0.03, 0.05), (0, -0.115, 0.85), (0.15, 0.12, 0.1))
    for sx in (-1, 1):
        b.part('ball', (0.016,) * 3, (sx * 0.03, -0.14, 0.87), (0.04, 0.03, 0.02), segs=6)
        # the long arms, reaching down and out (a gibbon walking upright, arms raised to balance)
        b.limb((sx * 0.12, 0, 0.7), (sx * 0.34, -0.05, 0.86), 0.035, coat)
        b.limb((sx * 0.34, -0.05, 0.86), (sx * 0.55, -0.02, 1.0), 0.03, coat)
        b.limb((sx * 0.07, 0, 0.38), (sx * 0.1, -0.05, 0.2), 0.045, coat)
        b.limb((sx * 0.1, -0.05, 0.2), (sx * 0.11, -0.1, 0.03), 0.04, coat)
    b.save('gibbon')


def loris():
    b = Builder()
    coat, belly = (0.62, 0.5, 0.36), (0.78, 0.7, 0.56)
    b.part('ball', (0.07, 0.12, 0.07), (0, 0, 0.12), coat)
    b.part('ball', (0.06, 0.055, 0.055), (0, -0.14, 0.15), coat)
    for sx in (-1, 1):
        b.part('ball', (0.022, 0.012, 0.024), (sx * 0.023, -0.188, 0.162), (0.25, 0.16, 0.1))  # dark eye rings
        b.part('ball', (0.013,) * 3, (sx * 0.023, -0.198, 0.164), (0.05, 0.04, 0.03), segs=6)  # the big eyes
        for fy in (-0.08, 0.08):
            b.limb((sx * 0.05, fy, 0.1), (sx * 0.06, fy, 0.01), 0.02, coat)
    b.part('ball', (0.012, 0.05, 0.012), (0, 0.0, 0.19), (0.4, 0.3, 0.2))  # the dark stripe down the back
    b.save('slow-loris')


def build_all():
    quadruped('langur', (0.13, 0.24, 0.12), 0.09, 0.32, (0.75, -0.32, 0.035), (0.52, 0.54, 0.56), (0.68, 0.7, 0.72), (0.15, 0.15, 0.17))
    quadruped(
        'douc', (0.13, 0.24, 0.12), 0.09, 0.33, (0.65, -0.3, 0.03), (0.5, 0.5, 0.52), (0.62, 0.62, 0.62), (0.85, 0.65, 0.3),
        extra={'hind': (0.45, 0.13, 0.1), 'fore': (0.92, 0.92, 0.9)},
    )
    quadruped('macaque', (0.14, 0.24, 0.13), 0.09, 0.28, (0.45, -0.18, 0.04), (0.5, 0.4, 0.28), (0.64, 0.55, 0.42), (0.62, 0.45, 0.4))
    quadruped('binturong', (0.18, 0.36, 0.16), 0.11, 0.28, (0.8, -0.22, 0.07), (0.08, 0.08, 0.08), (0.14, 0.13, 0.12), (0.22, 0.2, 0.18))
    gibbon()
    loris()


build_all()
