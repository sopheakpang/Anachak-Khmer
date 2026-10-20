import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { fresnel, makeRealWater, transmit } from './realWater';
import { heightTexture } from './water';

/** PK 2026-10-20 (D158): the PC look's realistic water. */

const W = loadKingdom().diorama.realWater;

describe('realistic water', () => {
  it('mirrors more at a glancing view than straight down (Fresnel)', () => {
    expect(fresnel(1, W.f0)).toBeCloseTo(W.f0, 6);
    expect(fresnel(0, W.f0)).toBeCloseTo(1, 6);
    expect(fresnel(0.2, W.f0)).toBeGreaterThan(fresnel(0.7, W.f0));
  });

  it('red is absorbed first: deep water turns green-blue and dark', () => {
    const [r, g, b] = transmit(2, W.absorb);
    expect(r).toBeLessThan(g);
    expect(r).toBeLessThan(b);
    expect(transmit(0, W.absorb)).toEqual([1, 1, 1]);
    expect(transmit(10, W.absorb)[1]).toBeLessThan(0.05);
  });

  it('the plane mirrors the world once a frame, from above the water only', () => {
    const heights = heightTexture(new Float32Array(4).fill(-1), 2);
    const w = makeRealWater(heights, 100, -0.12, new THREE.Vector3(0.3, 1, 0.2), W);
    expect(w.mesh.onBeforeRender).toBeTypeOf('function');
    const scene = new THREE.Scene();
    scene.add(w.mesh);
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 500);
    cam.position.set(0, 20, 30);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    w.mesh.updateMatrixWorld();
    let renders = 0;
    const renderer = {
      info: { render: { frame: 1 } },
      getDrawingBufferSize: (v: THREE.Vector2) => v.set(1920, 1080),
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      shadowMap: { autoUpdate: true },
      xr: { enabled: false },
      state: { buffers: { depth: { setMask: () => {} } }, viewport: () => {} },
      autoClear: true,
      clear: () => {},
      render: () => {
        renders++;
        // The water itself is hidden from its own mirror.
        expect(w.mesh.visible).toBe(false);
      },
    } as unknown as THREE.WebGLRenderer;
    const call = () =>
      w.mesh.onBeforeRender(
        renderer,
        scene,
        cam,
        w.mesh.geometry,
        w.mesh.material as THREE.Material,
        null as never,
      );
    call();
    call(); // the same frame (the AO pass): not again
    expect(renders).toBe(1);
    expect(w.mesh.visible).toBe(true);
    (renderer.info.render as { frame: number }).frame = 2;
    cam.position.set(0, -5, 10); // under the water: nothing to mirror
    cam.updateMatrixWorld();
    call();
    expect(renders).toBe(1);
    expect(w.reflections).toBe(1);
    w.dispose();
  });
});
