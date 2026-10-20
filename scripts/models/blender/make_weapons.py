# PK 2026-10-20 (D158) "Blender all weapons and equipment in very details": the 3D hero's weapons
# and gear, modelled from code in Blender after the Angkor reliefs (Angkor Wat south gallery,
# Bayon): the straight sword with its wrapped grip and small guard, the Preah Khan in gold,
# leaf-bladed spears and the cavalry lance with their red tassels, the woodcutter's axe, the
# mahout's goad, the staff, the long bow, the round bossed shield and the quiver of arrows.
#
# Game convention (glTF Y-up after export; Blender Z-up here): the long axis runs up +Z, the
# hand grips at the origin. Bow: upright along Z, gripped at its middle, the limbs and string
# toward +X. Shield: its dome up (the game turns it onto the arm).
# Each item one object, PBR colours (no textures), exported to OUT/<name>.glb.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else r"C:\Users\ASUS\Downloads\3D model\Anachak-Khmer\game-ready\weapons"
os.makedirs(OUT, exist_ok=True)

MATS = {
    'iron': ((0.79, 0.81, 0.84), 1.0, 0.3),
    'darkiron': ((0.42, 0.43, 0.45), 1.0, 0.45),
    'gold': ((0.9, 0.7, 0.29), 1.0, 0.25),
    'wood': ((0.42, 0.27, 0.16), 0.0, 0.62),
    'darkwood': ((0.2, 0.13, 0.08), 0.0, 0.55),
    'bamboo': ((0.72, 0.6, 0.35), 0.0, 0.5),
    'leather': ((0.33, 0.19, 0.11), 0.0, 0.7),
    'cord': ((0.86, 0.8, 0.66), 0.0, 0.8),
    'red': ((0.62, 0.12, 0.1), 0.0, 0.75),
    'feather': ((0.92, 0.9, 0.84), 0.0, 0.85),
}


def mat(name):
    m = bpy.data.materials.get('W_' + name)
    if m:
        return m
    col, metal, rough = MATS[name]
    m = bpy.data.materials.new('W_' + name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if name == 'gold':
        b.inputs['Emission Color'].default_value = (1.0, 0.8, 0.35, 1)
        b.inputs['Emission Strength'].default_value = 0.08
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.slots = []

    def slot(self, name):
        if name not in self.slots:
            self.slots.append(name)
        return self.slots.index(name)

    def lathe(self, profile, segs, material, z0=0.0, sx=1.0, sy=1.0, c=(0.0, 0.0)):
        """A turned part: profile = [(radius, z), ...] bottom to top, centred on c (x, y)."""
        bm = self.bm
        mi = self.slot(material)
        rings = []
        for r, z in profile:
            ring = []
            for k in range(segs):
                a = 2 * math.pi * k / segs
                ring.append(bm.verts.new((c[0] + r * math.cos(a) * sx, c[1] + r * math.sin(a) * sy, z0 + z)))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for k in range(segs):
                f = bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
                f.material_index = mi
                f.smooth = True
        for ring, up in ((rings[0], False), (rings[-1], True)):
            if profile[0 if not up else -1][0] > 1e-4:
                f = bm.faces.new(ring if up else list(reversed(ring)))
                f.material_index = mi

    def loft(self, sections, material, smooth=True, xf=None):
        """Cross-sections along Z: [(z, [(x, y), ...]), ...] (same count each, counter-clockwise);
        xf maps (x, y, z) to where the point goes (a blade lying another way)."""
        bm = self.bm
        mi = self.slot(material)
        put = xf or (lambda x, y, z: (x, y, z))
        rings = [[bm.verts.new(put(x, y, z)) for x, y in pts] for z, pts in sections]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for k in range(n):
                f = bm.faces.new((rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]))
                f.material_index = mi
                f.smooth = smooth
        f = bm.faces.new(list(reversed(rings[0])))
        f.material_index = mi
        top = rings[-1]
        c = bm.verts.new(Vector(sum((v.co for v in top), Vector())) / n)
        for k in range(n):
            f = bm.faces.new((top[k], top[(k + 1) % n], c))
            f.material_index = mi
            f.smooth = smooth

    def tube(self, pts, radii, segs, material, cap=True):
        """A bent rod along points (Vector) with radii."""
        bm = self.bm
        mi = self.slot(material)
        rings = []
        n = Vector((1, 0, 0))
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            if abs(n.dot(t)) > 0.95:
                n = Vector((0, 1, 0))
            n = (n - t * n.dot(t)).normalized()
            b = t.cross(n)
            rings.append([bm.verts.new(p + (n * math.cos(2 * math.pi * k / segs) + b * math.sin(2 * math.pi * k / segs)) * radii[i]) for k in range(segs)])
        for i in range(len(rings) - 1):
            for k in range(segs):
                f = bm.faces.new((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
                f.material_index = mi
                f.smooth = True
        if cap:
            for ring, rev in ((rings[0], True), (rings[-1], False)):
                f = bm.faces.new(list(reversed(ring)) if rev else ring)
                f.material_index = mi

    def box(self, c, s, material, rot=None):
        bm = self.bm
        mi = self.slot(material)
        r = rot or Matrix.Identity(3)
        vs = []
        for dx in (-1, 1):
            for dy in (-1, 1):
                for dz in (-1, 1):
                    vs.append(bm.verts.new(Vector(c) + r @ Vector((dx * s[0] / 2, dy * s[1] / 2, dz * s[2] / 2))))
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            f = bm.faces.new([vs[i] for i in q])
            f.material_index = mi

    def finish(self, name):
        me = bpy.data.meshes.new('W-' + name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for s in self.slots:
            me.materials.append(mat(s))
        ob = bpy.data.objects.new('W-' + name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def blade_section(w, t, n=8, ridge=1.0):
    """A lens-shaped blade cross-section (width w, thickness t), its edge sharp, a central ridge."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        x = math.cos(a) * w / 2
        y = math.sin(a) * t / 2 * (abs(math.cos(a)) ** 0.0 if ridge else 1)
        y *= (1 - abs(math.cos(a)) ** 3)  # thin toward the edges
        pts.append((x, y))
    return pts


def grip(b, z0, z1, r, material='leather', wraps=7, ring='gold'):
    """A wrapped grip: bands of cord or leather between gold rings."""
    L = z1 - z0
    prof = []
    for i in range(wraps * 2 + 1):
        z = L * i / (wraps * 2)
        prof.append((r * (1.08 if i % 2 else 0.96), z))
    b.lathe(prof, 12, material, z0)
    b.lathe([(r * 1.25, 0), (r * 1.3, 0.008), (r * 1.25, 0.016)], 12, ring, z0 - 0.008)
    b.lathe([(r * 1.25, 0), (r * 1.3, 0.008), (r * 1.25, 0.016)], 12, ring, z1 - 0.008)


def sword(name, holy):
    b = Builder()
    metal = 'gold' if holy else 'iron'
    # Pommel: a lotus bud (the Preah Khan's in gold), a grip wrapped in cord, a small guard.
    b.lathe([(0.0, -0.06), (0.018, -0.055), (0.028, -0.04), (0.03, -0.025), (0.022, -0.012), (0.016, 0)], 12, 'gold', 0)
    grip(b, 0.0, 0.15, 0.017, 'leather' if not holy else 'gold', wraps=8, ring='gold')
    # The guard: a short bar with rounded ends, a bead at each end.
    b.box((0, 0, 0.163), (0.13, 0.024, 0.022), 'gold')
    for side in (-1, 1):
        b.lathe([(0.0, -0.016), (0.016, -0.008), (0.017, 0), (0.016, 0.008), (0.0, 0.016)], 10, 'gold', 0.163, c=(side * 0.066, 0.0))
    # The blade: straight, a gentle leaf swell toward the point, a ridge down the middle.
    L = 0.74
    secs = []
    for i in range(13):
        u = i / 12
        w = (0.05 + 0.012 * math.sin(math.pi * min(1, u * 1.25))) * (1 - max(0, u - 0.84) / 0.16 * 0.92)
        secs.append((0.175 + L * u, blade_section(max(0.004, w), 0.011 * (1 - 0.6 * u))))
    b.loft(secs, 'gold' if holy else 'iron')
    # The fuller: a darker groove down each face (a thin raised strip reads as the groove's edge).
    if not holy:
        for s in (-1, 1):
            b.box((0, s * 0.0045, 0.4), (0.008, 0.002, 0.36), 'darkiron')
    else:
        # The Preah Khan: a gold sheath plate at the blade's root, engraved bands.
        for z in (0.2, 0.24):
            b.lathe([(0.0, 0), (0.03, 0.002), (0.03, 0.012), (0.0, 0.014)], 12, 'gold', z, 1, 0.35)
    return b.finish(name)


def spear(name, L, tassel=True):
    b = Builder()
    # Shaft: tapered hardwood with a bronze butt cap and binding rings.
    b.lathe([(0.0, -0.58), (0.016, -0.575), (0.019, -0.53), (0.019, L - 0.9), (0.016, L - 0.62)], 10, 'wood', 0)
    b.lathe([(0.0, 0), (0.021, 0.004), (0.022, 0.05), (0.019, 0.06)], 10, 'gold', -0.6)
    for z in (-0.1, 0.05, L - 0.75):
        b.lathe([(0.021, 0), (0.023, 0.006), (0.021, 0.012)], 10, 'cord', z)
    # Socket and a leaf-shaped head with a mid-rib.
    b.lathe([(0.016, 0), (0.02, 0.01), (0.017, 0.11), (0.012, 0.14)], 10, 'iron', L - 0.63)
    secs = []
    for i in range(11):
        u = i / 10
        w = 0.075 * math.sin(math.pi * min(1, (u + 0.08) / 0.9)) ** 0.8 * (1 - u * 0.15)
        secs.append((L - 0.49 + 0.3 * u, blade_section(max(0.003, w), 0.014 * (1 - 0.7 * u))))
    b.loft(secs, 'iron')
    if tassel:
        # The red horsehair tassel below the head (the reliefs' spears carry pennons and tufts).
        for k in range(14):
            a = 2 * math.pi * k / 14
            p0 = Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, L - 0.64))
            p1 = Vector((math.cos(a) * 0.06, math.sin(a) * 0.06, L - 0.76))
            p2 = Vector((math.cos(a) * 0.07, math.sin(a) * 0.07, L - 0.84))
            b.tube([p0, p1, p2], [0.007, 0.006, 0.002], 4, 'red', cap=False)
    return b.finish(name)


def axe():
    b = Builder()
    b.lathe([(0.0, -0.08), (0.02, -0.075), (0.022, 0.3), (0.019, 0.52), (0.021, 0.6), (0.0, 0.62)], 10, 'wood', 0)
    # The iron head: a cheek lashed to the haft, a flaring crescent edge, out along +Y.
    hsecs = []
    for i in range(9):
        u = i / 8
        hsecs.append((0.02 + 0.17 * u, blade_section(0.07 + 0.11 * u ** 1.5, 0.034 * (1 - 0.82 * u))))
    b.loft(hsecs, 'iron', xf=lambda x, y, z: (y, -z, 0.5 + x))  # forward = glTF +Z = Blender -Y
    for z in (0.43, 0.46, 0.53, 0.56):
        b.lathe([(0.023, 0), (0.026, 0.006), (0.023, 0.012)], 10, 'cord', z)
    return b.finish('axe')


def goad():
    b = Builder()
    b.lathe([(0.0, -0.05), (0.02, -0.045), (0.02, 0.62), (0.0, 0.64)], 10, 'darkwood', 0)
    grip(b, 0.0, 0.16, 0.021, 'leather', wraps=5, ring='gold')
    # The iron point and its hook, as the mahouts' ankus on the reliefs.
    b.lathe([(0.016, 0), (0.012, 0.08), (0.0, 0.14)], 8, 'iron', 0.62)
    pts = [Vector((0, 0, 0.66)) + Vector((0.07 * math.sin(a), 0, 0.06 * (1 - math.cos(a)) - 0.02 * a)) for a in [i * 0.35 for i in range(9)]]
    b.tube(pts, [0.01 - 0.0009 * i for i in range(9)], 6, 'iron')
    return b.finish('goad')


def staff():
    b = Builder()
    prof = [(0.0, -0.2), (0.022, -0.195)]
    for i in range(9):
        z = -0.2 + 1.3 * (i + 0.5) / 9
        prof += [(0.022, z - 0.06), (0.026, z), (0.022, z + 0.06)]  # bamboo nodes
    prof += [(0.022, 1.1), (0.0, 1.11)]
    b.lathe(prof, 10, 'bamboo', 0)
    return b.finish('staff')


def bow():
    b = Builder()
    # The long bow upright: limbs curving back (toward -X) from the grip, tips recurved.
    pts = []
    radii = []
    for i in range(21):
        u = -1 + 2 * i / 20
        z = 0.68 * u
        # The grip (the bow's middle) in the hand at the origin; the limbs sweep toward +X.
        x = 0.13 * u * u + 0.03 * max(0, abs(u) - 0.85) / 0.15
        pts.append(Vector((x, 0, z)))
        radii.append(0.017 * (1 - 0.55 * abs(u)) + 0.004)
    b.tube(pts, radii, 8, 'wood')
    grip(b, -0.06, 0.06, 0.02, 'leather', wraps=4, ring='gold')
    # Grip moved onto the bow's belly.
    # The string, tip to tip.
    t0, t1 = pts[0], pts[-1]
    b.tube([t0, (t0 + t1) / 2, t1], [0.0025, 0.0025, 0.0025], 4, 'cord')
    return b.finish('bow')


def shield():
    b = Builder()
    # Round, slightly domed wood, a leather rim, a gold boss and a ring of studs (the reliefs'
    # spearmen carry small round shields). Faces +Y; worn on the left forearm.
    prof = [(0.0, 0.035), (0.08, 0.033), (0.16, 0.025), (0.22, 0.012), (0.25, 0.0), (0.25, -0.012), (0.0, -0.01)]
    b.lathe(prof, 32, 'wood', 0)
    b.lathe([(0.24, -0.015), (0.262, -0.005), (0.265, 0.01), (0.248, 0.018)], 32, 'leather', 0)
    b.lathe([(0.0, 0.07), (0.03, 0.065), (0.055, 0.045), (0.06, 0.03)], 16, 'gold', 0)
    for k in range(12):
        a = 2 * math.pi * k / 12
        b.lathe([(0.012, 0.0), (0.011, 0.006), (0.0, 0.012)], 8, 'gold', 0.024, c=(math.cos(a) * 0.19, math.sin(a) * 0.19))
    # Its dome faces up (glTF +Y), as the built-in shield's disc before the game turns it.
    return b.finish('shield')


def quiver():
    b = Builder()
    b.lathe([(0.0, 0), (0.045, 0.004), (0.05, 0.03), (0.05, 0.5), (0.055, 0.52), (0.05, 0.54)], 14, 'bamboo', 0)
    for z in (0.08, 0.27, 0.46):
        b.lathe([(0.052, 0), (0.056, 0.012), (0.052, 0.024)], 14, 'leather', z)
    # Arrows: shafts and white fletching standing out of the mouth.
    for k in range(7):
        a = 2 * math.pi * k / 7
        x, y = math.cos(a) * 0.025, math.sin(a) * 0.025
        b.lathe([(0.004, 0), (0.004, 0.2)], 5, 'wood', 0.48, c=(x, y))
        for f in range(3):
            fa = a + f * 2 * math.pi / 3
            b.box((x + math.cos(fa) * 0.008, y + math.sin(fa) * 0.008, 0.62), (0.012, 0.002, 0.08), 'feather',
                  Matrix.Rotation(fa, 3, 'Z'))
    return b.finish('quiver')


for o in list(bpy.data.objects):
    if o.name.startswith('W-'):
        bpy.data.objects.remove(o, do_unlink=True)
items = [sword('sword', False), sword('preah-khan', True), spear('spear', 1.9), spear('lance', 2.4), axe(), goad(), staff(), bow(), shield(), quiver()]
report = {}
# Nothing else selected in any scene (the exporter would take it along).
for scn in bpy.data.scenes:
    for vl in scn.view_layers:
        for o in list(vl.objects):
            if o is not None and o.select_get(view_layer=vl):
                o.select_set(False, view_layer=vl)
for ob in items:
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    name = ob.name[2:]
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, name + '.glb'), use_selection=True, use_active_scene=True, export_format='GLB', export_apply=True
    )
    report[name] = {'tris': sum(len(p.vertices) - 2 for p in ob.data.polygons), 'size': [round(v, 3) for v in ob.dimensions]}
print('WEAPONS', report)
