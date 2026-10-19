# PK 1.9.0 (D153): make PK's 3D models game-ready in Blender 5.2 (run on PK's PC):
#   blender -b --factory-startup --python gamify.py -- <library.json> <out dir> [only-prefix]
# For each item of scripts/models/library.json with a source and an output:
#  - import, drop Meshy's hidden helper spheres, join the meshes;
#  - buildings with cutBase: find the top of Meshy's square ground slab (the lowest level with a
#    large up-facing area), cut everything below it, stand the building on z = 0;
#  - scale to the real size (height or longest side), centre on the ground, front toward −Y in
#    Blender (= +Z in glTF, the game's front);
#  - lighten to the target triangles (collapse decimate; skin weights kept, 4 a vertex);
#  - textures to 1024 px (512 for props, plants and small life), saved as WebP;
#  - rigged people keep their Idle and Walking clips, animals their Walking;
#  - export a GLB and render a 384 px check picture; write report.json.
import bpy, bmesh, os, sys, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
LIB = json.load(open(argv[0], encoding='utf-8'))
OUT = argv[1]
ONLY = argv[2] if len(argv) > 2 else ''
ROOT = LIB['root']
os.makedirs(OUT, exist_ok=True)
SMALL = {'prop', 'plant', 'bird', 'water', 'rock'}


def src_path(src):
    p = os.path.join(ROOT, LIB['lib'], src.replace('/', os.sep))
    if os.path.exists(p):
        return p
    p = os.path.join(ROOT, src.replace('/', os.sep))
    return p if os.path.exists(p) else None


def tris_of(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == 'MESH')


def bounds(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def slab_top(o):
    """Height of the top of Meshy's ground slab: the lowest z band holding a big up-facing area."""
    me = o.data
    lo, hi = bounds([o])
    foot = (hi.x - lo.x) * (hi.y - lo.y)
    h = hi.z - lo.z
    bins = [0.0] * 60
    for p in me.polygons:
        n = (o.matrix_world.to_3x3() @ p.normal).normalized()
        if n.z < 0.9:
            continue
        z = (o.matrix_world @ p.center).z
        k = int((z - lo.z) / max(h, 1e-6) * 59)
        bins[max(0, min(59, k))] += p.area * (o.matrix_world.to_scale().x ** 2)
    for k in range(0, 20):
        if bins[k] > foot * 0.25:
            # The band's upper edge.
            return lo.z + (k + 1) / 59 * h
    return None


def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions, bpy.data.textures):
        for b in list(coll):
            coll.remove(b)


def keep_clips(arm, kind, acts):
    want = ('Idle', 'Walking', 'Running', 'Combat_Stance') if kind == 'person' else ('Walking',)
    keep = []
    for w in want:
        a = next((x for x in acts if w.lower() in x.name.lower() and x not in keep), None)
        if a:
            keep.append(a)
    ad = arm.animation_data or arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    ad.action = None
    for a in acts:
        if a in keep:
            a.use_fake_user = True
            tr = ad.nla_tracks.new()
            tr.name = a.name
            st = tr.strips.new(a.name, int(a.frame_range[0]), a)
            st.name = a.name
        else:
            bpy.data.actions.remove(a)
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    return [a.name for a in keep]


# Check-picture stage.
def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items} else 'CYCLES'
    sc.render.resolution_x = sc.render.resolution_y = 384
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('W')
    w.color = (0.42, 0.44, 0.47)
    sc.world = w
    sc.view_settings.view_transform = 'AgX'


report = []
done_out = set()
PREFIX = tuple(x for x in ONLY.split(',') if x) or ('',)
items = [it for it in LIB['items'] if it.get('src') and it.get('out') and it['game'].startswith(PREFIX)]
for it in items:
    if it['out'] in done_out:
        continue
    done_out.add(it['out'])
    rec = {'game': it['game'], 'out': it['out']}
    p = src_path(it['src'])
    if not p:
        rec['error'] = 'source not found: ' + it['src']
        report.append(rec)
        continue
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        clear_scene()
        acts0 = set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=p)
        acts = [a for a in bpy.data.actions if a not in acts0]
        for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]:
            bpy.data.objects.remove(o, do_unlink=True)
        meshes = [o for o in bpy.data.objects if o.type == 'MESH']
        arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
        rec['tris_in'] = tris_of(meshes)
        # Rest pose for measuring.
        for a in arms:
            if a.animation_data:
                a.animation_data.action = None
            for pb in a.pose.bones:
                pb.location = (0, 0, 0)
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        # Join static meshes into one (rigged ones stay as they are: one skinned mesh each).
        if not arms and len(meshes) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in meshes:
                o.select_set(True)
            bpy.context.view_layer.objects.active = meshes[0]
            bpy.ops.object.join()
            meshes = [bpy.context.view_layer.objects.active]
        if not arms:
            for o in meshes:
                bpy.context.view_layer.objects.active = o
                o.select_set(True)
                bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # Cut Meshy's ground slab under buildings.
        if it.get('cutBase') and not arms:
            o = meshes[0]
            zt = slab_top(o)
            if zt is not None:
                bm = bmesh.new()
                bm.from_mesh(o.data)
                geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
                bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, zt + 0.002), plane_no=(0, 0, 1), clear_inner=True)
                bm.to_mesh(o.data)
                bm.free()
                rec['cut_at'] = round(zt, 3)
        # Scale and place.
        lo, hi = bounds(meshes)
        dim = hi - lo
        mode, val = it['size']
        cur = dim.z if mode == 'h' else max(dim.x, dim.y)
        k = val / cur if cur > 1e-6 else 1.0
        tops = [o for o in bpy.data.objects if o.parent is None]
        for o in tops:
            o.scale = o.scale * k
            o.location = (o.location - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) * k
        bpy.context.view_layer.update()
        if not arms:
            for o in meshes:
                bpy.ops.object.select_all(action='DESELECT')
                o.select_set(True)
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        # Lighten.
        now = tris_of(meshes)
        target = it.get('tris', now)
        # Very heavy scans (fences, lily pads, slabs: 100k+ triangles of thin parts) fall apart when
        # cut to 1 %: they keep more (D153, checked one by one).
        if rec['tris_in'] > 100000:
            target = max(target, it.get('heavyTris', 6000))
        if now > target * 1.05:
            ratio = target / now
            for o in meshes:
                m = o.modifiers.new('dec', 'DECIMATE')
                m.decimate_type = 'COLLAPSE'
                m.ratio = ratio
                m.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = o
                # Apply with the armature modifier kept after it.
                bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
                bpy.ops.object.modifier_apply(modifier='dec')
        for o in meshes:
            if o.vertex_groups:
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
                bpy.ops.object.vertex_group_limit_total(limit=4)
                bpy.ops.object.vertex_group_normalize_all(lock_active=False)
                bpy.ops.object.mode_set(mode='OBJECT')
        rec['tris'] = tris_of(meshes)
        # Textures.
        px = 512 if it['kind'] in SMALL else 1024
        for img in bpy.data.images:
            if img.size[0] > px:
                img.scale(px, px * img.size[1] // max(1, img.size[0]))
        rec['tex'] = px
        # Clips.
        if arms:
            rec['clips'] = keep_clips(arms[0], it['kind'], acts)
        lo, hi = bounds(meshes)
        rec['size_m'] = [round(x, 2) for x in (hi - lo)]
        out = os.path.join(OUT, it['out'].replace('/', os.sep))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format='GLB',
            export_yup=True,
            export_apply=True,
            export_image_format='WEBP',
            export_animations=bool(arms),
            export_animation_mode='NLA_TRACKS' if arms else 'ACTIONS',
            export_skins=bool(arms),
            export_morph=False,
            export_cameras=False,
            export_lights=False,
        )
        rec['mb'] = round(os.path.getsize(out) / 1e6, 2)
        # Check picture: front three-quarter view.
        setup_render()
        r = max(hi - lo)
        cd = bpy.data.cameras.new('C')
        cd.lens = 50
        cd.clip_end = 5000
        cam = bpy.data.objects.new('C', cd)
        bpy.context.scene.collection.objects.link(cam)
        ctr = (lo + hi) / 2
        cam.location = ctr + Vector((0.8, -1.6, 0.7)).normalized() * r * 2.2
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.scene.camera = cam
        bpy.ops.object.light_add(type='SUN')
        sun = bpy.context.object
        sun.data.energy = 3.0
        sun.rotation_euler = (math.radians(50), 0, math.radians(30))
        pic = out[:-4] + '.check.jpg'
        bpy.context.scene.render.filepath = pic
        bpy.context.scene.render.image_settings.file_format = 'JPEG'
        bpy.ops.render.render(write_still=True)
    except Exception as e:
        import traceback
        rec['error'] = traceback.format_exc()[-600:]
    report.append(rec)
    json.dump(report, open(os.path.join(OUT, 'report.json'), 'w'), indent=1)
    print('GAMIFY', len(report), len(items), it['out'], rec.get('tris'), rec.get('error', '')[:80], flush=True)
open(os.path.join(OUT, 'GAMIFY-DONE.txt'), 'w').write(str(len(report)))
