# PK 2026-10-21 (D170): the spearman's (ពលលំពែង) energy-beam gesture — PK's brief for a beam
# fired along the character's forward axis, keyed in Blender on the spearman's own skeleton.
# The brief names a Rigify rig; the spearman is a Mixamo skeleton (mixamorig:*), so this adds the
# controls the brief keys: hand IK targets (IK on each forearm, two bones), a look target (Damped
# Track on the head) and the hips as the root. "+X" in the brief = the hero's forward here: the
# game's models face glTF +Z, which is Blender -Y after import.
#   0–15  charge-up: hips down 0.3 m and back, spine back 15°, chest turned 20° away, hands cupped
#         at the chest, fingers clawed, head down a little, eyes on the target ahead (smooth Bezier)
#   15–20 thrust: hips 0.5 m forward into a lunge, spine forward 15°, chest square, both hands
#         driven straight forward, palms ahead, fingers spread, just behind where the energy core
#         appears (sharp: linear into the impact)
#   21–60 sustain: the pose held; noise on the hand targets' forward channel (strength 0.02,
#         scale 2) — the beam's heavy recoil
#   61–80 recovery: hips ease home, fingers relax, wrists turn down 30°, spine and head back to a
#         neutral combat stance
# Then the controls are baked into plain bone keys (an action "Spear_EnergyBeam", 30 fps) that
# glTF and the game can play, and only that clip is exported (merged into the model by
# scripts/models/addClip.mjs).
#   blender -b -P make_spear_beam_anim.py -- <spearman.glb> <out dir>
import bpy, math, os, sys
from mathutils import Vector, Matrix, Quaternion

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC = ARGS[0] if ARGS else 'spearman.glb'
OUT = ARGS[1] if len(ARGS) > 1 else '.'
CLIP = 'Spear_EnergyBeam'
FPS = 30

# --- a scene of its own, the model in it ---------------------------------------------------------
scene = bpy.data.scenes.get('SpearBeamAnim')
if scene:
    for o in list(scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    scene = bpy.data.scenes.new('SpearBeamAnim')
try:
    bpy.context.window.scene = scene
except Exception:
    pass
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, 80
vl = scene.view_layers[0]
with bpy.context.temp_override(scene=scene, view_layer=vl):
    bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
arm.name = 'SpearArmature'
for a in list(bpy.data.actions):
    if a.name.startswith(CLIP):
        bpy.data.actions.remove(a)
if arm.animation_data:
    arm.animation_data.action = None
    for t in list(arm.animation_data.nla_tracks):  # the model's own clips stay in the model
        arm.animation_data.nla_tracks.remove(t)
else:
    arm.animation_data_create()

P = arm.pose.bones
B = lambda n: P['mixamorig:' + n]
MW = arm.matrix_world


def update():
    vl.update()


def world_head(pb):
    return MW @ pb.head


# The rest pose (T-pose) as the neutral start.
for pb in P:
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
update()

# The hero's frame in Blender: forward F (glTF +Z = Blender -Y), up U, right R.
F = Vector((0, -1, 0))
U = Vector((0, 0, 1))
R = F.cross(U)  # the hero's right
# Sizes from the model (it is in the game's scale after import, metres).
hips0 = world_head(B('Hips'))
shoulderL0 = world_head(B('LeftArm'))
shoulderR0 = world_head(B('RightArm'))
chest0 = world_head(B('Spine2'))
arm_len = (world_head(B('LeftForeArm')) - shoulderL0).length + (world_head(B('LeftHand')) - world_head(B('LeftForeArm'))).length
height = world_head(B('Head')).z
k = height / 1.6  # the brief's metres are for a 1.6 m-tall head height


# --- the controls --------------------------------------------------------------------------------
def empty(name, loc, shape='SPHERE', size=0.06):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = shape
    e.empty_display_size = size
    e.location = loc
    scene.collection.objects.link(e)
    return e


ikL = empty('IK_Hand.L', world_head(B('LeftHand')))
ikR = empty('IK_Hand.R', world_head(B('RightHand')))
# Elbows bend down and out; knees bend forward.
poleL = empty('Pole_Elbow.L', world_head(B('LeftForeArm')) - R * 0.5 * k - U * 0.4 * k + F * 0.1 * k, 'PLAIN_AXES')
poleR = empty('Pole_Elbow.R', world_head(B('RightForeArm')) + R * 0.5 * k - U * 0.4 * k + F * 0.1 * k, 'PLAIN_AXES')
eye = empty('Eye_Target', world_head(B('Head')) + F * 6.0, 'CUBE', 0.15)
for side, ik, pole in (('Left', ikL, poleL), ('Right', ikR, poleR)):
    c = B(side + 'ForeArm').constraints.new('IK')
    c.name = 'BeamIK'
    c.target = ik
    c.pole_target = pole
    c.chain_count = 2
    c.pole_angle = math.pi if side == 'Left' else 0.0  # Mixamo's two sides roll opposite ways
# The feet stay planted (the lunge steps the front foot): IK on each shin, the foot's own turn
# taken from its target.
feet = {}
for side in ('Left', 'Right'):
    fb = B(side + 'Foot')
    e = empty('IK_Foot.' + side[0], world_head(fb), 'CUBE', 0.05)
    e.matrix_world = MW @ fb.bone.matrix_local
    feet[side] = e
    knee = empty('Pole_Knee.' + side[0], world_head(B(side + 'Leg')) + F * 0.8 * k, 'PLAIN_AXES')
    c = B(side + 'Leg').constraints.new('IK')
    c.name = 'StanceIK'
    c.target = e
    c.pole_target = knee
    c.chain_count = 2
    c.pole_angle = math.pi if side == 'Left' else 0.0
    cr = fb.constraints.new('COPY_ROTATION')
    cr.target = e
    cr.target_space = cr.owner_space = 'WORLD'
footL0, footR0 = feet['Left'].location.copy(), feet['Right'].location.copy()
look = B('Head').constraints.new('DAMPED_TRACK')
look.name = 'EyeLock'
look.target = eye
look.track_axis = 'TRACK_Z'  # the head bone's Z is his face's forward (checked on the model)
look.influence = 0.0  # keyed: on while he charges and fires


def rot_world(pb, axis, deg):
    """Turn a pose bone by `deg` about a world axis (from where it is now)."""
    update()
    m = MW.inverted() @ (Matrix.Rotation(math.radians(deg), 4, axis) @ (MW @ pb.matrix))
    m.translation = pb.matrix.translation
    pb.matrix = m
    update()


def key_bones(frame, names):
    for n in names:
        pb = B(n)
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)


def reset(names):
    for n in names:
        pb = B(n)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    update()


SPINE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']
FINGERS = [f'{s}HandMiddle{i}' for s in ('Left', 'Right') for i in (1, 2, 3)]
HANDS = ['LeftHand', 'RightHand']
ALL = SPINE + FINGERS + HANDS


def hips_to(offset_world):
    """Move the hips (the root) by a world offset from where they rest."""
    pb = B('Hips')
    update()
    m = pb.matrix.copy()
    m.translation = MW.inverted() @ (hips0 + offset_world)
    pb.matrix = m
    update()


def fingers(curl_deg):
    for n in FINGERS:
        B(n).rotation_quaternion = Quaternion((1, 0, 0), math.radians(curl_deg))
    update()


def wrists(deg):
    for n in HANDS:
        B(n).rotation_quaternion = Quaternion((1, 0, 0), math.radians(deg))
    update()


def key_ctl(frame):
    for e in (ikL, ikR, eye, feet['Left'], feet['Right']):
        e.keyframe_insert('location', frame=frame)
    look.keyframe_insert('influence', frame=frame)


def stance(front=0.0, back=0.0, lift=0.0):
    feet['Left'].location = footL0 + F * front + U * lift
    feet['Right'].location = footR0 - F * back


# Arms hang by the IK: where the hands rest at the sides (frame 0 and 80, the combat stance).
side = lambda s: (shoulderL0 if s == 'L' else shoulderR0) - U * arm_len * 0.92 + F * 0.12 * k + (-R if s == 'L' else R) * 0.03

# Frame 0: neutral (knees a little soft).
reset(ALL)
hips_to(-U * 0.04 * k)
stance()
ikL.location, ikR.location = side('L'), side('R')
key_bones(0, ALL)
key_ctl(0)

# Frame 15: charge-up — sunk 0.3 m, weight back, spine back 15°, chest turned 20° away.
reset(ALL)
hips_to(-U * 0.3 * k + F * -0.1 * k)
stance(front=0.08 * k, back=0.12 * k)
rot_world(B('Spine'), R, 15)
rot_world(B('Spine2'), U, 20)
rot_world(B('Head'), R, -14)         # head down; the eye lock (70%) keeps the gaze ahead
chest = (MW @ B('Spine2').matrix).translation
ikL.location = chest + F * 0.24 * k - R * 0.02 * k + U * 0.02 * k
ikR.location = chest + F * 0.22 * k + R * 0.10 * k - U * 0.05 * k
fingers(45)                          # clawed
wrists(-40)                          # wrists flexed
look.influence = 0.7
key_bones(15, ALL)
key_ctl(15)

# Frame 20: thrust — the root lunges 0.5 m forward, spine forward 15°, chest square, both arms
# straight out ahead at shoulder height, palms forward, fingers spread (the core appears just
# ahead of the palms: energyBeam's 0.8 m from where he stands).
reset(ALL)
hips_to(F * 0.5 * k - U * 0.16 * k)
stance(front=0.75 * k, back=0.05 * k)
rot_world(B('Spine'), R, -15)
update()
for e, n, s in ((ikL, 'LeftArm', -1), (ikR, 'RightArm', 1)):
    sh = world_head(B(n))
    e.location = sh + F * arm_len * 1.02 + R * s * 0.1 * k - U * 0.02 * k
fingers(-8)                          # spread
wrists(65)                           # palms to the front
look.influence = 1.0
key_bones(20, ALL)
key_ctl(20)

# Frame 60: still holding (sustain).
key_bones(60, ALL)
key_ctl(60)

# Frame 80: recovery to the combat stance.
reset(ALL)
hips_to(-U * 0.04 * k)
stance()
ikL.location, ikR.location = side('L'), side('R')
fingers(20)                          # relaxed
wrists(-30)                          # wrists down
look.influence = 0.0
key_bones(80, ALL)
key_ctl(80)


# --- easing ---------------------------------------------------------------------------------------
def fcurves(idb):
    ad = idb.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(act, 'fcurves') and len(getattr(act, 'fcurves', [])):
        return list(act.fcurves)
    out = []  # Blender 5: layered actions (layers → strips → channelbags)
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


ids = [arm, ikL, ikR, eye, feet['Left'], feet['Right']]
for idb in ids:
    for fc in fcurves(idb):
        for kp in fc.keyframe_points:
            f = round(kp.co.x)
            if f == 15:
                kp.interpolation = 'LINEAR'       # straight into the impact: sharp
            else:
                kp.interpolation = 'BEZIER'
                kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
                kp.easing = 'EASE_IN_OUT'
        fc.update()
# 21–60: recoil jitter on the hands' forward channel (glTF +X of the brief = the hero's forward).
fwd_index = 1  # Blender Y carries the hero's forward (-Y)
for e in (ikL, ikR):
    for fc in fcurves(e):
        if fc.data_path == 'location' and fc.array_index == fwd_index:
            n = fc.modifiers.new('NOISE')
            n.strength = 0.02 * 2  # Blender's noise strength is peak-to-peak
            n.scale = 2.0
            n.use_restricted_range = True
            n.frame_start, n.frame_end = 21, 60
            n.blend_in = n.blend_out = 3

# --- bake to plain bone keys and export the clip ------------------------------------------------
for o in scene.objects:
    o.select_set(False, view_layer=vl)
arm.select_set(True, view_layer=vl)
vl.objects.active = arm
with bpy.context.temp_override(scene=scene, view_layer=vl, active_object=arm, object=arm, selected_objects=[arm]):
    bpy.ops.object.mode_set(mode='POSE')
    for pb in P:
        if hasattr(pb, 'select'):  # Blender 5: selection is on the pose bone
            pb.select = True
        else:
            pb.bone.select = True
    bpy.ops.nla.bake(frame_start=0, frame_end=80, only_selected=True, visual_keying=True, clear_constraints=False,
                     use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
baked = arm.animation_data.action
baked.name = CLIP
baked.use_fake_user = True
# The controls' own (unbaked) action stays in the .blend for editing.
os.makedirs(OUT, exist_ok=True)
with bpy.context.temp_override(scene=scene, view_layer=vl):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'spear_energy_beam_anim.blend'), copy=True)
    # The export takes this clip alone: the model's own clips and the controls' keys go from this
    # (already saved) session, so the exporter cannot pick one of them up.
    for a in list(bpy.data.actions):
        if a != baked:
            bpy.data.actions.remove(a)
    arm.animation_data.action = baked
    # The bake already holds what the controls did: switch them off for the export.
    for pb in P:
        for c in pb.constraints:
            c.mute = True
    # Only the armature with only this clip: addClip.mjs merges it into the model by bone names.
    for o in scene.objects:
        o.select_set(o == arm or o.parent == arm, view_layer=vl)
    kw = dict(filepath=os.path.join(OUT, CLIP + '.glb'), use_selection=True, export_format='GLB', export_animations=True,
              export_apply=False, use_active_scene=True, export_frame_range=True)
    try:
        bpy.ops.export_scene.gltf(export_animation_mode='ACTIONS', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
print('SPEARANIM done', CLIP, 'frames 0-80 at', FPS, 'fps; arm', round(arm_len, 2), 'k', round(k, 2))
