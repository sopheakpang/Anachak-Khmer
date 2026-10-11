import * as THREE from 'three';

/**
 * Free the GPU memory of a piece of the scene (1.8.0 optimisation pass, PK's master prompt
 * part 3). three.js never frees geometry, materials or textures on its own: an object taken out
 * of the scene keeps its buffers on the graphics card until `dispose()` is called on each.
 *
 * Every mesh, line, point cloud and sprite under `node` (InstancedMesh, SkinnedMesh, LOD and
 * Group included) gives back its geometry and its material(s); an InstancedMesh also its
 * per-instance buffers, a SkinnedMesh its bone texture, a light its shadow map. Textures only with `textures: true`:
 * the colour maps of loaded models are shared by every copy of the model, so they stay unless
 * the caller owns them. A material or geometry marked `userData.shared = true`, or listed in
 * `keep`, is left alone (module caches used by other scenes). Each resource is freed once, and
 * freeing is safe to repeat: three.js uploads a freed resource again if it is drawn later.
 * Finally the node leaves its parent.
 */
export interface DisposeOptions {
  /** Also free the textures the materials use (default false). */
  textures?: boolean;
  /** Resources to leave alone. */
  keep?: ReadonlySet<unknown>;
}

type Drawable = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

const shared = (r: { userData?: Record<string, unknown> }): boolean => r.userData?.shared === true;

/** The textures a material uses (map, normalMap, uniforms, ...). */
function texturesOf(m: THREE.Material): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  const look = (v: unknown) => {
    if (v instanceof THREE.Texture) out.push(v);
  };
  for (const v of Object.values(m)) look(v);
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k of Object.keys(u)) look(u[k]?.value);
  return out;
}

export function disposeNode(node: THREE.Object3D | null | undefined, opts: DisposeOptions = {}): void {
  if (!node) return;
  const done = new Set<unknown>();
  const free = (r: { dispose(): void } | null | undefined) => {
    if (!r || done.has(r) || opts.keep?.has(r)) return;
    done.add(r);
    r.dispose();
  };
  node.traverse((o) => {
    const d = o as Drawable;
    if (d.geometry instanceof THREE.BufferGeometry && !shared(d.geometry)) free(d.geometry);
    const mats = d.material ? (Array.isArray(d.material) ? d.material : [d.material]) : [];
    for (const m of mats) {
      if (!m || shared(m) || opts.keep?.has(m)) continue;
      if (opts.textures) for (const t of texturesOf(m)) if (!shared(t)) free(t);
      free(m);
    }
    const cd = (o as THREE.Mesh).customDepthMaterial;
    if (cd && !shared(cd)) free(cd);
    if ((o as THREE.InstancedMesh).isInstancedMesh) {
      // InstancedMesh.dispose() frees the instance buffers (and its morph texture).
      if (!done.has(o)) {
        done.add(o);
        (o as THREE.InstancedMesh).dispose();
      }
    } else if ((o as THREE.Light).isLight) {
      // A light that casts shadows owns its shadow map (a render target on the graphics card).
      if (!done.has(o)) {
        done.add(o);
        (o as THREE.Light).dispose();
      }
    } else if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
      const sk = (o as THREE.SkinnedMesh).skeleton;
      if (sk && !done.has(sk)) {
        done.add(sk);
        sk.dispose();
      }
    }
  });
  node.removeFromParent();
}

/** Take `node` out of `scene` and free it (see disposeNode). */
export function disposeAndRemove(
  scene: THREE.Scene,
  node: THREE.Object3D | null | undefined,
  opts?: DisposeOptions,
): void {
  if (!node) return;
  scene.remove(node);
  disposeNode(node, opts);
}
