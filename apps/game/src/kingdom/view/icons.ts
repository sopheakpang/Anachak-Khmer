import * as THREE from 'three';
import { crowdMaterial } from '../../engine/figures';

/**
 * 3D icons for the command buttons (PK: "3D models of items for all buttons, the label
 * below", D65). Each item's own low-poly model is rendered in a few turning frames into a
 * small sprite sheet (a data URL); CSS pops the icon up above its label and spins it on
 * hover. Frames are drawn with the game's renderer in a corner of the canvas before the
 * frame's scene is rendered (so tone mapping and colours match the game), one icon per
 * frame, and copied out at once; the corner is then painted over by the scene.
 */

export const ICON_PX = 96;
export const ICON_FRAMES = 8;
/** The button background; drawn behind the model and keyed out to transparent. */
const KEY = new THREE.Color(0x3a2412);

export class IconAtlas {
  private readonly urls = new Map<string, string>();
  private readonly wanted = new Map<string, () => THREE.BufferGeometry>();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private readonly sheet = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D | null;
  onReady: () => void = () => undefined;

  constructor(private readonly clothColor: number) {
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5040, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 5, 4);
    this.scene.add(sun);
    this.sheet.width = ICON_PX * ICON_FRAMES;
    this.sheet.height = ICON_PX;
    this.g = this.sheet.getContext('2d', { willReadFrequently: true });
  }

  /** The sprite sheet for an item, or null while it is still queued. */
  url(id: string): string | null {
    return this.urls.get(id) ?? null;
  }

  /** Ask for an icon (built on a later frame). */
  want(id: string, geometry: () => THREE.BufferGeometry): void {
    if (!this.urls.has(id) && !this.wanted.has(id)) this.wanted.set(id, geometry);
  }

  get pending(): number {
    return this.wanted.size;
  }

  /** Build one queued icon now (call before the frame's scene render). */
  step(renderer: THREE.WebGLRenderer): void {
    const next = this.wanted.entries().next();
    if (next.done || !this.g) return;
    const [id, make] = next.value;
    this.wanted.delete(id);
    const geo = make();
    geo.computeBoundingSphere();
    const bs = geo.boundingSphere!;
    const mesh = new THREE.InstancedMesh(geo, crowdMaterial({ speed: 0, leg: 0, arm: 0, armSync: 0 }), 1);
    mesh.setColorAt(0, new THREE.Color(this.clothColor));
    mesh.frustumCulled = false;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    mesh.position.set(-bs.center.x, -bs.center.y, -bs.center.z);
    this.scene.add(pivot);
    const d = (bs.radius / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02;
    this.camera.position.set(0, d * 0.42, d * 0.91);
    this.camera.lookAt(0, 0, 0);

    const size = renderer.getSize(new THREE.Vector2());
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    const S = ICON_PX;
    this.g.clearRect(0, 0, this.sheet.width, S);
    renderer.setRenderTarget(null);
    renderer.setClearColor(KEY, 1);
    renderer.setScissorTest(true);
    for (let f = 0; f < ICON_FRAMES; f++) {
      pivot.rotation.y = 0.5 + (f / ICON_FRAMES) * Math.PI * 2;
      renderer.setViewport(0, 0, S, S);
      renderer.setScissor(0, 0, S, S);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      this.g.drawImage(renderer.domElement, 0, renderer.domElement.height - S, S, S, f * S, 0, S, S);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setClearColor(clear, alpha);
    this.scene.remove(pivot);
    geo.dispose();
    // Key out the background (close to KEY) so the model floats over the button.
    const img = this.g.getImageData(0, 0, this.sheet.width, S);
    // The corner pixel is always background: key out everything close to it.
    const [kr, kg, kb] = [img.data[0]!, img.data[1]!, img.data[2]!];
    for (let i = 0; i < img.data.length; i += 4) {
      const diff =
        Math.abs(img.data[i]! - kr) + Math.abs(img.data[i + 1]! - kg) + Math.abs(img.data[i + 2]! - kb);
      if (diff < 24) img.data[i + 3] = 0;
    }
    this.g.putImageData(img, 0, 0);
    this.urls.set(id, this.sheet.toDataURL('image/png'));
    if (!this.wanted.size) this.onReady();
  }
}
