# PK 2026-10-20 (D164): the rare fantasy plants whose textures smear (glowcap, crystal tree, red
# mushrooms). Their scans were cut from millions of triangles to a few thousand, and the cut left
# triangles whose corners land in different parts of the texture atlas, so every such triangle
# draws a streak across unrelated colours. The colours meant for each part are still in the
# atlas: this samples it at the middle of every triangle (the one place that lands inside one
# part), takes the median of each corner's triangles (a single stray sample does not win), and
# writes the result as vertex colours. The textures (colour, normal, roughness, glow) are dropped:
# they all share the broken UVs. Geometry is untouched.
#   python3 -c "import bpy, sys; sys.argv=['x','--',<in.glb>,<out.glb>,<smooth passes>,<saturation>]; exec(open('fix_smeared.py').read())"
import bpy, bmesh, sys
import numpy as np

ARGS = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = ARGS[0], ARGS[1]
PASSES = int(ARGS[2]) if len(ARGS) > 2 else 1
SAT = float(ARGS[3]) if len(ARGS) > 3 else 1.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
me = ob.data
mat = me.materials[0]
img = next(n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and
           any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links))
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, img.channels)[:, :, :3]

bm = bmesh.new()
bm.from_mesh(me)
uv = bm.loops.layers.uv.active


def sample(u, v):
    x = int(np.clip(u % 1.0 * W, 0, W - 1))
    y = int(np.clip(v % 1.0 * H, 0, H - 1))  # Blender images: row 0 at the bottom, as UV v
    return px[y, x]


face_col = {}
for f in bm.faces:
    cu = sum(l[uv].uv.x for l in f.loops) / len(f.loops)
    cv = sum(l[uv].uv.y for l in f.loops) / len(f.loops)
    face_col[f.index] = sample(cu, cv)

vert_col = {}
for v in bm.verts:
    cs = [face_col[f.index] for f in v.link_faces]
    vert_col[v.index] = np.median(np.array(cs), axis=0) if cs else np.ones(3) * 0.5
# Light smoothing over the mesh (median again: keeps the edge between a cap and its stem).
for _ in range(PASSES):
    nxt = {}
    for v in bm.verts:
        ring = [vert_col[e.other_vert(v).index] for e in v.link_edges] + [vert_col[v.index]] * 2
        nxt[v.index] = np.median(np.array(ring), axis=0)
    vert_col = nxt

col = bm.loops.layers.color.new('Col')
for f in bm.faces:
    for l in f.loops:
        c = vert_col[l.vert.index]
        g = c.mean()
        c = np.clip(g + (c - g) * SAT, 0, 1)
        # Blender hands the image's pixels over already linear, as glTF vertex colours are.
        l[col] = (float(c[0]), float(c[1]), float(c[2]), 1.0)
bm.to_mesh(me)
bm.free()

# A plain material that shows the vertex colours.
m = bpy.data.materials.new('Painted')
m.use_nodes = True
nt = m.node_tree
bsdf = nt.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.75
vc = nt.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.clear()
me.materials.append(m)
while len(me.uv_layers):
    me.uv_layers.remove(me.uv_layers[0])
for o in bpy.context.scene.objects:
    o.select_set(o == ob)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format='GLB', export_apply=True,
                          use_active_scene=True, export_vertex_color='ACTIVE')
print('FIXED', OUT, len(me.polygons))
