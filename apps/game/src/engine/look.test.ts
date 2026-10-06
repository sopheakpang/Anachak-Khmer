import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import qualityJson from '../../../../config/quality.json';
import { currentLook, detail, flatten, lowPoly, seg, setLook, styleScene } from './look';
import { qualityFrom } from './app';

/** A stand-in for a painted canvas: every pixel is the given colour. */
function paintedTexture(rgb: [number, number, number], detailTexture: boolean): THREE.Texture {
  const w = 8;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
  const image = { width: w, height: w, getContext: () => ({ getImageData: () => ({ data }) }) };
  const t = new THREE.Texture(image as unknown as HTMLCanvasElement);
  t.userData.detail = detailTexture;
  return t;
}

describe('low-poly style (D41)', () => {
  afterEach(() => setLook({ style: 'lowpoly', flatColors: false }));

  it('is the default in every quality preset, and ?style=film brings back the film look', () => {
    for (const p of ['low', 'high', 'lite'] as const) expect(qualityJson[p].look.style).toBe('lowpoly');
    expect(qualityFrom('').q.look.style).toBe('lowpoly');
    expect(qualityFrom('?style=film').q.look.style).toBe('film');
    expect(qualityFrom('?preset=lite&style=film').q.look.shadows).toBe(false);
    setLook({ style: 'nonsense' });
    expect(currentLook().style).toBe('lowpoly');
  });

  it('halves round-shape segments and lowers icosahedron detail, never below the minimum', () => {
    setLook({ style: 'lowpoly' });
    expect(lowPoly()).toBe(true);
    expect(seg(16)).toBe(8);
    expect(seg(6, 5)).toBe(5);
    expect(detail(2)).toBe(1);
    expect(detail(0)).toBe(0);
    setLook({ style: 'film' });
    expect(seg(16)).toBe(16);
    expect(detail(2)).toBe(2);
  });

  it('flat-shades lit materials; flatColors swaps detail textures for their average colour', () => {
    setLook({ flatColors: false });
    const kept = new THREE.MeshStandardMaterial({ map: paintedTexture([200, 100, 50], true) });
    flatten(kept);
    expect(kept.flatShading).toBe(true);
    expect(kept.map).not.toBeNull(); // textured low-poly (default): painted detail stays
    setLook({ flatColors: true });
    const brick = new THREE.MeshStandardMaterial({ map: paintedTexture([200, 100, 50], true) });
    flatten(brick);
    expect(brick.flatShading).toBe(true);
    expect(brick.map).toBeNull();
    const expected = new THREE.Color().setRGB(200 / 255, 100 / 255, 50 / 255, THREE.SRGBColorSpace);
    expect(brick.color.r).toBeCloseTo(expected.r, 3);
    expect(brick.color.b).toBeCloseTo(expected.b, 3);
    // Pictures (the painted map, carved names) and cut-out textures keep their texture.
    const picture = new THREE.MeshStandardMaterial({ map: paintedTexture([10, 10, 10], false) });
    const leaf = new THREE.MeshStandardMaterial({ map: paintedTexture([0, 90, 0], true), alphaTest: 0.5 });
    flatten(picture);
    flatten(leaf);
    expect(picture.map).not.toBeNull();
    expect(leaf.map).not.toBeNull();
    // Unlit effects are left alone.
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
    flatten(glow);
    expect(glow.version).toBe(0);
  });

  it('styleScene reaches every mesh; the film style leaves the scene untouched', () => {
    const scene = new THREE.Scene();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const b = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshLambertMaterial()]);
    scene.add(a, new THREE.Group().add(b));
    setLook({ style: 'film' });
    styleScene(scene);
    expect((a.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
    setLook({ style: 'lowpoly' });
    styleScene(scene);
    expect((a.material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    expect((b.material as THREE.MeshLambertMaterial[])[0]!.flatShading).toBe(true);
  });
});
