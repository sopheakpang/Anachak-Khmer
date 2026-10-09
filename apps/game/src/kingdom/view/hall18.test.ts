import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { applyProp } from './props';
import { buildingGeometry } from './scene';
import { makePrekWater } from './water';
import { skyDome } from '../../engine/look';

const D = loadKingdom();

describe("PK 1.8.0: PK's royal hall model", () => {
  it('the royal hall slot names a model that ships with the game, fitted to the hall footprint', () => {
    const slot = D.props.buildings?.townCentre;
    expect(slot).toBeTruthy();
    const shipped = Object.keys(import.meta.glob('../../../public-mobile/models/buildings/*.glb'));
    expect(shipped.some((f) => f.endsWith(slot!.file))).toBe(true);
    expect(slot!.fit).toBe('width');
    // A stand-in model: its widest side becomes the built-in hall's widest side.
    const mesh = new THREE.InstancedMesh(buildingGeometry('townCentre', 'anachak'), new THREE.MeshBasicMaterial(), 2);
    mesh.setColorAt(0, new THREE.Color(0x3366ff));
    const like = mesh.geometry.clone();
    like.computeBoundingBox();
    const model = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.17, 1.89), new THREE.MeshStandardMaterial());
    expect(applyProp(mesh, model, slot!)).toBe(true);
    mesh.geometry.computeBoundingBox();
    const a = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    const b = like.boundingBox!.getSize(new THREE.Vector3());
    expect(Math.max(a.x, a.z)).toBeCloseTo(Math.max(b.x, b.z), 3);
    expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(like.boundingBox!.min.y, 3);
    expect(mesh.userData.prop).toBe(slot!.file);
    // The model keeps its own colours (the team colour is reset to white).
    const c = new THREE.Color();
    mesh.getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 1, 1]);
  });
});

describe('PK 1.8.0: the sun in the sky and on the water', () => {
  it('the sky dome can draw the sun disc (off unless the moving sun turns it on)', () => {
    const dome = skyDome();
    const m = dome.material as THREE.ShaderMaterial;
    expect(m.uniforms.sunDisc!.value).toBe(0);
    expect(m.fragmentShader).toContain('sunDisc');
  });

  it('the water takes the sun where it stands, its colour, and a path of light at sunset', () => {
    const h = new THREE.DataTexture(new Float32Array(4), 2, 2, THREE.RedFormat, THREE.FloatType);
    const w = makePrekWater(h, 100, -0.1, new THREE.Vector3(0, 1, 0), D.diorama.water);
    w.setSun(new THREE.Vector3(-1, 0.05, 0.3), new THREE.Color(1, 0.5, 0.2), 0.8);
    const u = (w.mesh.material as THREE.ShaderMaterial).uniforms;
    expect((u.uSun!.value as THREE.Vector3).length()).toBeCloseTo(1);
    expect((u.uSun!.value as THREE.Vector3).x).toBeLessThan(0);
    expect((u.uSunCol!.value as THREE.Color).g).toBeCloseTo(0.5);
    expect(u.uGolden!.value).toBe(0.8);
    expect((w.mesh.material as THREE.ShaderMaterial).fragmentShader).toContain('reflect(-v, n)');
  });
});
