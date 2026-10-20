# Card atlases: scripts/models/blender/card_atlas.py; game copies: node scripts/models/heavy.mjs <glb> <out> <height> 20000 1024
# PK 2026-10-20 (D158): the map's forest trees (props.json trees a–f) remade with the tree maker
# (make_trees6.py) and their far-distance picture cards rendered here: 3 sides (0°, 60°, 120°) and
# 3 more (30°, 90°, 150°), each with a view from straight above, flat light, transparent ground.
import bpy, sys, io, contextlib, json, math, os
from mathutils import Vector
D = r"C:\Users\ASUS\Downloads\3D model\Anachak-Khmer\game-ready\bigtree"
MAKER = os.path.join(D, "make_trees6.py")  # a copy of scripts/models/blender/make_bigtree.py
VARIANTS = {
  "forest-a": {"seed": 41, "trunk": 9, "radius": 0.5, "buttress": 1.2, "limbs": 6, "limbLen": [2.5, 3.5], "limbRise": [3, 5], "crown": 4.5, "clumps": 55, "clumpSize": [3.0, 4.2], "crownLift": 2.0, "crownDome": 6.0, "roots": 4},
  "forest-b": {"seed": 42, "trunk": 8, "radius": 0.55, "buttress": 1.4, "limbs": 7, "limbLen": [3.5, 5.0], "limbRise": [2, 4], "crown": 5.5, "clumps": 60, "clumpSize": [3.2, 4.4], "crownLift": 2.0, "crownDome": 4.0, "roots": 4},
  "forest-c": {"seed": 43, "trunk": 10, "radius": 0.5, "buttress": 1.2, "limbs": 5, "limbLen": [4.0, 6.0], "limbRise": [3, 5], "crown": 5.0, "clumps": 40, "clumpSize": [3.0, 4.2], "crownLift": 1.5, "crownDome": 3.0, "roots": 4},
  "forest-d": {"seed": 44, "trunk": 9, "radius": 1.0, "buttress": 2.5, "limbs": 6, "limbLen": [5.0, 7.0], "limbRise": [2, 4], "crown": 7.0, "clumps": 55, "clumpSize": [3.5, 5.0], "crownLift": 2.0, "crownDome": 3.0, "roots": 6},
  "forest-e": {"seed": 45, "trunk": 13, "radius": 0.55, "buttress": 1.5, "limbs": 6, "limbLen": [3.0, 4.0], "limbRise": [2, 4], "crown": 5.0, "clumps": 50, "clumpSize": [3.0, 4.2], "crownLift": 2.0, "crownDome": 4.0, "roots": 5},
  # D159: the scatter trees from the same maker (no picture cards; the scatter draws them whole)
  "mango-tree": {"seed": 21, "trunk": 6, "radius": 0.55, "buttress": 0.8, "limbs": 7, "limbLen": [3.0, 4.5], "limbRise": [2.0, 3.5], "crown": 5.0, "clumps": 50, "clumpSize": [3.5, 4.6], "crownLift": 1.5, "crownDome": 3.5, "roots": 3, "cards": 18},
  "rain-tree": {"seed": 31, "trunk": 6, "radius": 0.8, "buttress": 1.0, "limbs": 7, "limbLen": [6.0, 9.0], "limbRise": [1.0, 2.5], "crown": 9.0, "clumps": 32, "clumpSize": [3.5, 5.0], "crownLift": 1.0, "crownDome": 1.5, "roots": 5, "cards": 16},
  "big-tropical-tree": {"seed": 11, "cards": 17},
  "forest-f": {"seed": 46, "trunk": 9, "radius": 0.9, "buttress": 3.2, "limbs": 7, "limbLen": [6.0, 8.0], "limbRise": [1.5, 3], "crown": 8.0, "clumps": 60, "clumpSize": [3.5, 5.0], "crownLift": 2.0, "crownDome": 2.5, "roots": 6},
}

def make(name):
    p = dict(VARIANTS[name]); p["name"] = name
    src = open(MAKER, encoding="utf-8").read()
    buf = io.StringIO()
    argv = sys.argv; sys.argv = ["blender", "--", D, json.dumps(p)]
    try:
        with contextlib.redirect_stdout(buf):
            exec(compile(src, "make_trees6.py", "exec"), {"__name__": "__main__"})
    finally:
        sys.argv = argv
    return [l for l in buf.getvalue().splitlines() if 'BIGTREE' in l]

def cards(name):
    sc = bpy.context.scene
    ob = bpy.data.objects['BigTree-' + name]
    for o in sc.objects:
        if o.type == 'MESH': o.hide_render = o is not ob
    bpy.context.view_layer.update()
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for c in ob.bound_box:
        w = ob.matrix_world @ Vector(c); lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    H = hi.z - max(lo.z, 0)
    half = max(hi.x - lo.x, hi.y - lo.y, H) / 2 * 1.02
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.view_settings.view_transform = 'Standard'
    sc.world.color = (1, 1, 1)
    for l in [o for o in sc.objects if o.type == 'LIGHT']: l.hide_render = True
    cam = sc.objects.get('CardCam')
    if not cam:
        cd = bpy.data.cameras.new('CardCam'); cam = bpy.data.objects.new('CardCam', cd); sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2 * half; cam.data.clip_end = 500
    out = []
    for row, turn in ((0, 0.0), (1, math.pi / 6)):
        for k in range(3):
            a = k * math.pi / 3 + turn
            # The game's card k looks along -(sin a, 0, cos a) in glTF (x, y, z) = Blender (x, -z?, y).
            cam.location = Vector((cx + math.sin(a) * 60, cy - math.cos(a) * 60, half))
            cam.rotation_euler = (Vector((cx, cy, half)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
            f = os.path.join(D, f"{name}-card-{row}-{k}.png")
            sc.render.filepath = f; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
            bpy.ops.render.render(write_still=True, scene=sc.name); out.append(f)
        # From straight above: image up = -z in glTF (Blender +Y), right = +x.
        cam.location = Vector((cx, cy, hi.z + 40))
        cam.rotation_euler = (0, 0, -turn)
        f = os.path.join(D, f"{name}-card-{row}-top.png")
        sc.render.filepath = f
        bpy.ops.render.render(write_still=True, scene=sc.name); out.append(f)
    for o in sc.objects:
        if o.type == 'MESH': o.hide_render = False
    for l in [o for o in sc.objects if o.type == 'LIGHT']: l.hide_render = False
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.world.color = (0.55, 0.62, 0.7)
    return {"frame": 2 * half, "height": H, "card": round(2 * half / H, 3)}
