# PK 2026-10-21 (D169): the spearman's (ពលលំពែង) energy-beam skill effect, built in Blender
# EEVEE from code, in five layers (PK's brief): the energy core, the core beam, the beam's noisy
# outer flames, the impact wave and the propelled particles. Every colour and speed is a custom
# property on the empty "BeamFX_Controls" (drivers read them), so it is tweaked in one place.
# Run it in Blender (Text editor, or through the Blender MCP), or headless:
#   blender -b -P make_energy_beam.py -- [out dir]   (also saves energy_beam.blend and the meshes as GLB)
import bpy, bmesh, math, os, sys, mathutils

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = ARGS[0] if ARGS else None

# --- the knobs (copied onto BeamFX_Controls; change them there afterwards) -------------------
P = {
    'core_color': (0.32, 0.66, 1.0, 1.0),     # the Lunge skill's blue (#9fd8ff, deeper so it glows blue)
    'flame_color': (0.2, 0.5, 1.0, 1.0),
    'wave_color': (0.4, 0.75, 1.0, 1.0),
    'spark_color': (0.7, 0.9, 1.0, 1.0),
    'strength': 3.0,                          # emission strength (bloom)
    'beam_length': 8.0,
    'flame_speed': 1.0,                       # × the brief's #frame / 10
    'wave_speed': 1.0,                        # × #frame / 15
    'spark_speed': 1.0,                       # × #frame / 24 and #frame / 48
    'twist': 1.2,                             # radians along the beam
    'flicker': 0.25,                          # core beam Z-scale noise
}
L = P['beam_length']


def clear():
    for o in list(bpy.data.objects):
        if o.name.startswith('BeamFX'):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials):
        if m.name.startswith('BeamFX'):
            bpy.data.materials.remove(m)
    for t in list(bpy.data.textures):
        if t.name.startswith('BeamFX'):
            bpy.data.textures.remove(t)
    for me in list(bpy.data.meshes):
        if me.name.startswith('BeamFX') and not me.users:
            bpy.data.meshes.remove(me)


clear()
# Its own scene, so nothing already in the file is touched (and it opens on that scene).
scene = bpy.data.scenes.get('BeamFX') or bpy.data.scenes.new('BeamFX')
coll = scene.collection
try:
    bpy.context.window.scene = scene
except Exception:
    pass

# --- the controls ----------------------------------------------------------------------------
ctl = bpy.data.objects.new('BeamFX_Controls', None)
ctl.empty_display_type = 'PLAIN_AXES'
coll.objects.link(ctl)
for k, v in P.items():
    ctl[k] = v
    if isinstance(v, tuple):
        ui = ctl.id_properties_ui(k)
        ui.update(subtype='COLOR', min=0.0, max=1.0)


def drive(owner, path, expr, index=-1, props=()):
    """A driver on owner.path[index] = expr, with each controls property as a variable."""
    fc = owner.driver_add(path, index) if index >= 0 else owner.driver_add(path)
    d = fc.driver
    d.type = 'SCRIPTED'
    for name in props:
        v = d.variables.new()
        v.name = name
        v.type = 'SINGLE_PROP'
        v.targets[0].id = ctl
        v.targets[0].data_path = f'["{name}"]'
    d.expression = expr
    return fc


def drive_color(socket_owner, prop):
    """An RGB value driven from a colour property of the controls."""
    for i in range(3):
        fc = socket_owner.driver_add('default_value', i)
        v = fc.driver.variables.new()
        v.name = 'c'
        v.type = 'SINGLE_PROP'
        v.targets[0].id = ctl
        v.targets[0].data_path = f'["{prop}"][{i}]'
        fc.driver.expression = 'c'


def obj(name, me):
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def blended(m):
    """EEVEE alpha blending (Blender 4.2+: surface_render_method; older: blend_method)."""
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        try:
            m.blend_method = 'BLEND'
        except TypeError:
            pass
    if hasattr(m, 'use_transparency_overlap'):
        m.use_transparency_overlap = True
    m.use_backface_culling = False


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes, nt.links


def ramp(nodes, stops, x, y):
    r = nodes.new('ShaderNodeValToRGB')
    r.location = (x, y)
    el = r.color_ramp.elements
    while len(el) > 1:
        el.remove(el[-1])
    el[0].position, el[0].color = stops[0]
    for pos, c in stops[1:]:
        e = el.new(pos)
        e.color = c
    return r


def tinted_emission(nodes, links, factor_socket, color_prop, x, y):
    """Emission = ramp colour × the controls' colour × strength."""
    rgb = nodes.new('ShaderNodeRGB')
    rgb.location = (x, y - 200)
    drive_color(rgb.outputs[0], color_prop)
    mul = nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.location = (x + 200, y)
    mul.inputs[0].default_value = 1.0
    links.new(factor_socket, mul.inputs[6])
    links.new(rgb.outputs[0], mul.inputs[7])
    em = nodes.new('ShaderNodeEmission')
    em.location = (x + 400, y)
    links.new(mul.outputs[2], em.inputs['Color'])
    s = em.inputs['Strength']
    fc = s.driver_add('default_value')
    v = fc.driver.variables.new()
    v.name = 's'
    v.type = 'SINGLE_PROP'
    v.targets[0].id = ctl
    v.targets[0].data_path = '["strength"]'
    fc.driver.expression = 's'
    return em


# --- 1 + 2: the fresnel emission (Layer Weight facing → Color Ramp → Emission) ---------------
def fresnel_material(name, color_prop):
    m, nt, nodes, links = new_mat(name)
    lw = nodes.new('ShaderNodeLayerWeight')
    lw.location = (-600, 0)
    lw.inputs['Blend'].default_value = 0.35
    r = ramp(nodes, [(0.0, (1, 1, 1, 1)), (0.55, (0.75, 0.9, 1, 1)), (1.0, (0.1, 0.35, 1, 1))], -400, 0)
    links.new(lw.outputs['Facing'], r.inputs['Fac'])
    em = tinted_emission(nodes, links, r.outputs['Color'], color_prop, -150, 0)
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (500, 0)
    links.new(em.outputs[0], out.inputs['Surface'])
    return m


core_mat = fresnel_material('BeamFX_CoreMat', 'core_color')

# 1. Energy core: a UV sphere, subdivided.
def prim(name, build):
    """A mesh object built with bmesh (no operators: it lands in BeamFX, whatever is active)."""
    bm = bmesh.new()
    bm.loops.layers.uv.new('UVMap')  # calc_uvs fills it only if it is there
    build(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return obj(name, me)


def cylinder_x(bm, r, segs):
    """A capped cylinder from x = 0 to x = L along +X, with UVs (u round it, v along it)."""
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=L, calc_uvs=True)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi / 2, 3, 'Y'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(L / 2, 0, 0))
    # Square UVs: u round the beam, v along it (0 at the spear, 1 at the far end).
    uvl = bm.loops.layers.uv.active
    for f in bm.faces:
        angs = [math.atan2(l.vert.co.z, l.vert.co.y) / (2 * math.pi) % 1.0 for l in f.loops]
        seam = max(angs) - min(angs) > 0.5  # the face across the seam: keep it continuous
        for l, a in zip(f.loops, angs):
            l[uvl].uv = ((a + 1.0) if seam and a < 0.5 else a, l.vert.co.x / L)


core = prim('BeamFX_EnergyCore', lambda bm: bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.45, calc_uvs=True))
core.modifiers.new('Subdivision', 'SUBSURF').levels = 2
core.data.materials.append(core_mat)
for p in core.data.polygons:
    p.use_smooth = True

# 2. Core beam: a cylinder stretched along +X, flickering in Z scale (noise modifier on a driver).
beam = prim('BeamFX_CoreBeam', lambda bm: cylinder_x(bm, 0.16, 24))
beam.data.materials.append(core_mat)
for p in beam.data.polygons:
    p.use_smooth = True
fc = drive(beam, 'scale', '1.0', index=2)
noise = fc.modifiers.new('NOISE')
noise.scale = 2.0
noise.strength = P['flicker'] * 2
noise.phase = 1.0

# --- 3: the noisy outer flames ---------------------------------------------------------------
flames = prim('BeamFX_OuterFlames', lambda bm: cylinder_x(bm, 0.42, 32))
# Many loop cuts along the length (smooth deformation): rebuild the side as a grid.
me = flames.data
bm = bmesh.new()
bm.from_mesh(me)
caps = [f for f in bm.faces if len(f.verts) > 4]
bmesh.ops.delete(bm, geom=caps, context='FACES')
side_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > L * 0.5]
bmesh.ops.subdivide_edges(bm, edges=side_edges, cuts=40, use_grid_fill=True)
bm.to_mesh(me)
bm.free()
for p in me.polygons:
    p.use_smooth = True

# a) Displace by a Voronoi texture in the space of an Empty that slides along X (#frame / 10).
mover = bpy.data.objects.new('BeamFX_NoiseMover', None)
coll.objects.link(mover)
drive(mover, 'location', 'frame / 10 * flame_speed', index=0, props=('flame_speed',))
tex = bpy.data.textures.new('BeamFX_Voronoi', 'VORONOI')
tex.distance_metric = 'DISTANCE'
tex.noise_scale = 0.6
disp = flames.modifiers.new('Displace', 'DISPLACE')
disp.texture = tex
disp.texture_coords = 'OBJECT'
disp.texture_coords_object = mover
disp.strength = 0.25
disp.mid_level = 0.5
# b) Twist along X.
tw = flames.modifiers.new('Twist', 'SIMPLE_DEFORM')
tw.deform_method = 'TWIST'
tw.deform_axis = 'X'
drive(tw, 'angle', 'twist', props=('twist',))

# Material: Transparent + Emission mixed by Voronoi (UV, Manhattan) × an end fade.
fm, nt, nodes, links = new_mat('BeamFX_FlameMat')
blended(fm)
tc = nodes.new('ShaderNodeTexCoord')
tc.location = (-1300, 0)
mp = nodes.new('ShaderNodeMapping')
mp.location = (-1100, 0)
mp.inputs['Scale'].default_value = (3.0, 1.0, 1.0)
links.new(tc.outputs['UV'], mp.inputs['Vector'])
drive(mp.inputs['Location'], 'default_value', '-frame / 20 * flame_speed', index=1, props=('flame_speed',))
vor = nodes.new('ShaderNodeTexVoronoi')
vor.location = (-900, 0)
vor.distance = 'MANHATTAN'
vor.inputs['Scale'].default_value = 4.0
links.new(mp.outputs['Vector'], vor.inputs['Vector'])
vr = ramp(nodes, [(0.0, (1, 1, 1, 1)), (0.6, (0.55, 0.55, 0.55, 1)), (1.0, (0, 0, 0, 1))], -700, 0)
links.new(vor.outputs['Distance'], vr.inputs['Fac'])
# Soft cut-off at both ends: a gradient along the beam (UV y) through black-white-black.
sep = nodes.new('ShaderNodeSeparateXYZ')
sep.location = (-1100, -300)
links.new(tc.outputs['UV'], sep.inputs['Vector'])
gr = ramp(nodes, [(0.0, (0, 0, 0, 1)), (0.15, (1, 1, 1, 1)), (0.85, (1, 1, 1, 1)), (1.0, (0, 0, 0, 1))], -900, -300)
links.new(sep.outputs['Y'], gr.inputs['Fac'])
mul = nodes.new('ShaderNodeMath')
mul.operation = 'MULTIPLY'
mul.location = (-450, -100)
links.new(vr.outputs['Color'], mul.inputs[0])
links.new(gr.outputs['Color'], mul.inputs[1])
em = tinted_emission(nodes, links, vr.outputs['Color'], 'flame_color', -300, 200)
tr = nodes.new('ShaderNodeBsdfTransparent')
tr.location = (100, -150)
mix = nodes.new('ShaderNodeMixShader')
mix.location = (350, 0)
links.new(mul.outputs[0], mix.inputs['Fac'])
links.new(tr.outputs[0], mix.inputs[1])
links.new(em.outputs[0], mix.inputs[2])
out = nodes.new('ShaderNodeOutputMaterial')
out.location = (550, 0)
links.new(mix.outputs[0], out.inputs['Surface'])
me.materials.append(fm)


# --- 4: the impact wave ----------------------------------------------------------------------
def disc_mesh(name, r0, r1, rings, segs, extra):
    """A flat ring in the YZ plane, UVs unwrapped to a square: u round it, v from in to out.
    `extra` = one more loop cut near the rim (the wave slows as it reaches the edge)."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    rs = [i / rings for i in range(rings + 1)]
    rs = sorted(set(rs + [extra]))
    grid = []
    for t in rs:
        r = r0 + (r1 - r0) * t
        row = []
        for k in range(segs + 1):
            a = 2 * math.pi * k / segs
            row.append((bm.verts.new((0, math.cos(a) * r, math.sin(a) * r)), k / segs, t))
        grid.append(row)
    for i in range(len(grid) - 1):
        for k in range(segs):
            q = [grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]]
            f = bm.faces.new([v[0] for v in q])
            for loop, v in zip(f.loops, q):
                loop[uvl].uv = (v[1], v[2])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


wave = obj('BeamFX_ImpactWave', disc_mesh('BeamFX_ImpactWave', 0.05, 2.2, 6, 48, 0.9))
wave.location = (L, 0, 0)
wm, nt, nodes, links = new_mat('BeamFX_WaveMat')
blended(wm)
tc = nodes.new('ShaderNodeTexCoord')
tc.location = (-1400, 0)
nz = nodes.new('ShaderNodeTexNoise')
nz.location = (-1400, -250)
nz.inputs['Scale'].default_value = 4.0
links.new(tc.outputs['UV'], nz.inputs['Vector'])
mp = nodes.new('ShaderNodeMapping')
mp.location = (-1150, 0)
links.new(tc.outputs['UV'], mp.inputs['Vector'])
# The noise distorts the mapping's scale: a ragged, living ring.
sc = nodes.new('ShaderNodeVectorMath')
sc.operation = 'MULTIPLY_ADD'
sc.location = (-1150, -250)
sc.inputs[1].default_value = (0.3, 0.3, 0.3)
sc.inputs[2].default_value = (1.0, 1.0, 1.0)
links.new(nz.outputs['Color'], sc.inputs[0])
links.new(sc.outputs[0], mp.inputs['Scale'])
wv = nodes.new('ShaderNodeTexWave')
wv.location = (-900, 0)
wv.wave_type = 'BANDS'
wv.bands_direction = 'Y'
wv.inputs['Scale'].default_value = 3.0
links.new(mp.outputs['Vector'], wv.inputs['Vector'])
drive(wv.inputs['Phase Offset'], 'default_value', '-frame / 15 * wave_speed', props=('wave_speed',))
wr = ramp(nodes, [(0.0, (0, 0, 0, 1)), (0.7, (0, 0, 0, 1)), (0.92, (1, 1, 1, 1))], -700, 0)  # clear between the rings
links.new(wv.outputs['Fac'], wr.inputs['Fac'])
sep = nodes.new('ShaderNodeSeparateXYZ')
sep.location = (-1150, -500)
links.new(tc.outputs['UV'], sep.inputs['Vector'])
gr = ramp(nodes, [(0.0, (0, 0, 0, 1)), (0.5, (1, 1, 1, 1)), (1.0, (0, 0, 0, 1))], -900, -500)
links.new(sep.outputs['Y'], gr.inputs['Fac'])
mul = nodes.new('ShaderNodeMath')
mul.operation = 'MULTIPLY'
mul.location = (-450, -200)
links.new(wr.outputs['Color'], mul.inputs[0])
links.new(gr.outputs['Color'], mul.inputs[1])
em = tinted_emission(nodes, links, wr.outputs['Color'], 'wave_color', -300, 200)
tr = nodes.new('ShaderNodeBsdfTransparent')
tr.location = (100, -150)
mix = nodes.new('ShaderNodeMixShader')
mix.location = (350, 0)
links.new(mul.outputs[0], mix.inputs['Fac'])
links.new(tr.outputs[0], mix.inputs[1])
links.new(em.outputs[0], mix.inputs[2])
out = nodes.new('ShaderNodeOutputMaterial')
out.location = (550, 0)
links.new(mix.outputs[0], out.inputs['Surface'])
wave.data.materials.append(wm)


# --- 5: the propelled particles --------------------------------------------------------------
def tube_mesh(name, r, length, rings, segs, extra):
    """A circle extruded back along -X into a tube, UVs a square: u round it, v along it, with
    one more loop cut near its open end."""
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new()
    ts = sorted(set([i / rings for i in range(rings + 1)] + [extra]))
    grid = []
    for t in ts:
        row = []
        for k in range(segs + 1):
            a = 2 * math.pi * k / segs
            row.append((bm.verts.new((-length * t, math.cos(a) * r, math.sin(a) * r)), k / segs, t))
        grid.append(row)
    for i in range(len(grid) - 1):
        for k in range(segs):
            q = [grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k]]
            f = bm.faces.new([v[0] for v in q])
            for loop, v in zip(f.loops, q):
                loop[uvl].uv = (v[1], v[2])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


sparks = obj('BeamFX_Particles', tube_mesh('BeamFX_Particles', 0.75, L, 8, 32, 0.92))
sparks.location = (L, 0, 0)
pm, nt, nodes, links = new_mat('BeamFX_SparkMat')
blended(pm)
tc = nodes.new('ShaderNodeTexCoord')
tc.location = (-1500, 0)


def streaks(y, scale, speed_expr):
    mp = nodes.new('ShaderNodeMapping')
    mp.location = (-1250, y)
    mp.inputs['Scale'].default_value = scale
    links.new(tc.outputs['UV'], mp.inputs['Vector'])
    # The streaks race along the tube (its UV y; the brief's "X location" on its own unwrap).
    drive(mp.inputs['Location'], 'default_value', speed_expr, index=1, props=('spark_speed',))
    v = nodes.new('ShaderNodeTexVoronoi')
    v.location = (-1050, y)
    v.inputs['Scale'].default_value = 1.0
    links.new(mp.outputs['Vector'], v.inputs['Vector'])
    r = ramp(nodes, [(0.0, (1, 1, 1, 1)), (0.16, (0, 0, 0, 1))], -850, y)  # a tight white slider
    links.new(v.outputs['Distance'], r.inputs['Fac'])
    return r


# Layer 1: stretched hard along the tube (Y = along it in UV after the mapping's swap).
r1 = streaks(200, (12.0, 1.2, 1.0), '-frame / 24 * spark_speed')
# Layer 2: another scale, slower (#frame / 48): depth.
r2 = streaks(-150, (7.0, 0.7, 1.0), '-frame / 48 * spark_speed')
scr = nodes.new('ShaderNodeMix')
scr.data_type = 'RGBA'
scr.blend_type = 'SCREEN'
scr.location = (-600, 50)
scr.inputs[0].default_value = 1.0
links.new(r1.outputs['Color'], scr.inputs[6])
links.new(r2.outputs['Color'], scr.inputs[7])
sep = nodes.new('ShaderNodeSeparateXYZ')
sep.location = (-1250, -450)
links.new(tc.outputs['UV'], sep.inputs['Vector'])
gr = ramp(nodes, [(0.0, (0, 0, 0, 1)), (0.2, (1, 1, 1, 1)), (0.8, (1, 1, 1, 1)), (1.0, (0, 0, 0, 1))], -1050, -450)
links.new(sep.outputs['Y'], gr.inputs['Fac'])
mul = nodes.new('ShaderNodeMath')
mul.operation = 'MULTIPLY'
mul.location = (-400, -150)
links.new(scr.outputs[2], mul.inputs[0])
links.new(gr.outputs['Color'], mul.inputs[1])
em = tinted_emission(nodes, links, scr.outputs[2], 'spark_color', -350, 250)
tr = nodes.new('ShaderNodeBsdfTransparent')
tr.location = (100, -150)
mix = nodes.new('ShaderNodeMixShader')
mix.location = (350, 0)
links.new(mul.outputs[0], mix.inputs['Fac'])
links.new(tr.outputs[0], mix.inputs[1])
links.new(em.outputs[0], mix.inputs[2])
out = nodes.new('ShaderNodeOutputMaterial')
out.location = (550, 0)
links.new(mix.outputs[0], out.inputs['Surface'])
sparks.data.materials.append(pm)

# --- render: EEVEE, glow (bloom) ----------------------------------------------------------------
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        pass
ee = scene.eevee
if hasattr(ee, 'use_bloom'):  # EEVEE before 4.2
    ee.use_bloom = True
    ee.bloom_intensity = 0.08
scene.view_settings.view_transform = 'AgX' if 'AgX' in [i.identifier for i in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
world = scene.world or bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value = (0.01, 0.012, 0.02, 1)
# EEVEE 4.2+ has no bloom switch: a Glare node (Bloom / Fog Glow) in the compositor does it.
GLOW = 'none'


def bloom(gl):
    """Set a Glare node to Bloom: an enum before Blender 5, a menu input ('Type') from 5 on."""
    for t in ('BLOOM', 'FOG_GLOW'):
        try:
            gl.glare_type = t
            return t
        except (TypeError, AttributeError):
            pass
    s = gl.inputs.get('Type')
    for t in ('Bloom', 'Fog Glow'):
        try:
            s.default_value = t
            return t
        except Exception:
            pass
    return '?'


try:
    if hasattr(scene, 'compositing_node_group'):  # Blender 5: the compositor is a node group
        # A fresh group each run (an old one still set on the scene keeps rendering black).
        old = bpy.data.node_groups.get('BeamFX_Glow')
        scene.compositing_node_group = None
        if old:
            bpy.data.node_groups.remove(old)
        g = bpy.data.node_groups.new('BeamFX_Glow', 'CompositorNodeTree')
        g.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        # Blender 5: the render comes from a Render Layers node; the group's output is the result.
        rl = g.nodes.new('CompositorNodeRLayers')
        rl.scene = scene
        no = g.nodes.new('NodeGroupOutput')
        gl = g.nodes.new('CompositorNodeGlare')
        bloom(gl)
        g.links.new(rl.outputs['Image'], gl.inputs['Image'])
        g.links.new(gl.outputs['Image'], no.inputs[0])
        scene.compositing_node_group = g
        scene.render.use_compositing = True
        GLOW = 'compositor group (Blender 5)'
    else:
        scene.use_nodes = True
        tree = scene.node_tree
        rl = tree.nodes.get('Render Layers') or tree.nodes.new('CompositorNodeRLayers')
        comp = tree.nodes.get('Composite') or tree.nodes.new('CompositorNodeComposite')
        gl = tree.nodes.new('CompositorNodeGlare')
        bloom(gl)
        tree.links.new(rl.outputs['Image'], gl.inputs['Image'])
        tree.links.new(gl.outputs['Image'], comp.inputs['Image'])
        GLOW = 'compositor'
except Exception as e:  # never stop the effect for the glow
    GLOW = 'failed: ' + str(e)[:80]

# A camera looking along the beam from the side.
cam = scene.objects.get('BeamFX_Camera')
if not cam:
    cd = bpy.data.cameras.new('BeamFX_Camera')
    cam = bpy.data.objects.new('BeamFX_Camera', cd)
    coll.objects.link(cam)
cam.location = (L * 0.5, -15.0, 3.5)
cam.rotation_euler = (math.radians(80), 0, 0)
cam.data.lens = 35
scene.camera = cam
scene.frame_start, scene.frame_end = 1, 96

if OUT:
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'energy_beam.blend'), copy=True)
    # The game's meshes (its shaders are the game's own: view/beamFx.ts): the BeamFX scene only.
    vl = scene.view_layers[0]
    keep = ('BeamFX_OuterFlames', 'BeamFX_ImpactWave', 'BeamFX_Particles', 'BeamFX_CoreBeam', 'BeamFX_EnergyCore')
    for s2 in bpy.data.scenes:
        for l2 in s2.view_layers:
            for o in l2.objects:
                if o is not None and o.select_get(view_layer=l2):
                    o.select_set(False, view_layer=l2)
    for o in scene.objects:
        if o.name in keep:
            o.select_set(True, view_layer=vl)
    with bpy.context.temp_override(scene=scene, view_layer=vl):
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'spear-beam.glb'), use_selection=True, export_format='GLB',
                                  export_apply=True, export_materials='NONE', use_active_scene=True)
print('BEAMFX done; glow:', GLOW)
