import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadKingdom } from '@temples/shared';
import { BEAM_LENGTH, EnergyBeam, beamCylinder, beamLook, beamPhase, builtShapes, shapesFromModel, waveDisc } from './energyBeam';
import { planSkillVfx, type EnergyPiece } from './skillVfx';
import { SkillFx } from './skillFx';

/** PK 2026-10-21 (D169): the spearman's energy beam, designed in Blender, played in the game. */
const data = loadKingdom();
const spear = data.anachak.hero.kits.find((k) => k.id === 'spear')!;
const lunge = spear.skills.find((s) => s.id === 'lunge')!;

describe('the spearman’s energy beam', () => {
  it('the Lunge fires it, and the Blender meshes are named in the config', () => {
    expect(lunge.vfx).toContain('energyBeam');
    expect(data.anachak.hero.vfx.beamModel).toMatch(/spear-beam\.glb$/);
  });

  it('is planned from the spear’s point where the thrust ends, along his heading, as long as the skill reaches', () => {
    const pieces = planSkillVfx({
      skill: lunge,
      weapon: 'spear',
      color: 0x9fd8ff,
      from: [0, 0],
      to: [0, 3],
      heading: 0,
      lift: 0,
      area: [0, 3],
      cfg: data.anachak.hero.vfx,
    });
    const b = pieces.find((p): p is EnergyPiece => p.t === 'energy')!;
    expect(b).toBeTruthy();
    expect(b.x).toBeCloseTo(0);
    expect(b.z).toBeCloseTo(3 + data.anachak.hero.vfx.beamAhead!); // just past his palms (D170)
    expect(b.length).toBeGreaterThanOrEqual(6);
    // Sparks where it ends.
    expect(pieces.some((p) => p.t === 'burst' && p.kind === 'sparks' && Math.abs(p.z - (b.z + b.length)) < 0.01)).toBe(true);
  });

  it('shoots out fast, holds, then its light fades', () => {
    expect(beamPhase(0, 1).reach).toBe(0);
    expect(beamPhase(0.14, 1).reach).toBeCloseTo(1);
    expect(beamPhase(0.5, 1).light).toBe(1);
    expect(beamPhase(0.9, 1).light).toBeGreaterThan(0);
    expect(beamPhase(0.9, 1).light).toBeLessThan(0.5);
    expect(beamPhase(1.1, 1).light).toBe(0);
  });

  it('its shapes: along +X with square UVs (u round, v along / out), as the Blender meshes', () => {
    const c = beamCylinder(0.4, BEAM_LENGTH, 16, 4);
    c.computeBoundingBox();
    expect(c.boundingBox!.min.x).toBeCloseTo(0);
    expect(c.boundingBox!.max.x).toBeCloseTo(BEAM_LENGTH);
    const pos = c.getAttribute('position');
    const uv = c.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 7) expect(uv.getY(i)).toBeCloseTo(pos.getX(i) / BEAM_LENGTH, 5);
    const d = waveDisc(0.1, 2, 24, 3);
    d.computeBoundingBox();
    expect(d.boundingBox!.max.x - d.boundingBox!.min.x).toBeLessThan(1e-6); // across the beam
    const dv = d.getAttribute('uv');
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < dv.count; i++) [lo, hi] = [Math.min(lo, dv.getY(i)), Math.max(hi, dv.getY(i))];
    expect(lo).toBeCloseTo(0);
    expect(hi).toBeCloseTo(1);
  });

  it('takes the Blender meshes by their names when they load, else builds the same', () => {
    expect(shapesFromModel(null)).toBeNull();
    const root = new THREE.Group();
    const add = (name: string, g: THREE.BufferGeometry, x = 0) => {
      const m = new THREE.Mesh(g);
      m.name = name;
      m.position.x = x;
      root.add(m);
    };
    add('BeamFX_EnergyCore', new THREE.SphereGeometry(0.4));
    add('BeamFX_CoreBeam', beamCylinder(0.16, BEAM_LENGTH, 8, 1));
    add('BeamFX_OuterFlames', beamCylinder(0.4, BEAM_LENGTH, 8, 4));
    add('BeamFX_ImpactWave', waveDisc(0.05, 2, 8, 2), BEAM_LENGTH);
    expect(shapesFromModel(root)).toBeNull(); // one missing
    add('BeamFX_Particles', beamCylinder(0.7, BEAM_LENGTH, 8, 2));
    const s = shapesFromModel(root)!;
    s.wave.computeBoundingBox();
    expect(s.wave.boundingBox!.min.x).toBeCloseTo(0); // the far end rides the beam's tip
    expect(Object.keys(builtShapes())).toEqual(['core', 'beam', 'flames', 'wave', 'sparks']);
  });

  it('a cast stretches out to its length, then goes; SkillFx plays and frees it', () => {
    const b = new EnergyBeam(builtShapes(), beamLook(0x9fd8ff), 10);
    b.aim(1, 1.2, 2, 0);
    // Heading 0 = +z in the game: the beam's +X turns onto +z.
    const tip = new THREE.Vector3(1, 0, 0).applyEuler(b.group.rotation);
    expect(tip.z).toBeCloseTo(1);
    b.update(0.02, 1);
    b.update(0.5, 1);
    expect(b.group.visible).toBe(true);
    b.update(1.2, 1);
    expect(b.group.visible).toBe(false);
    b.dispose();
    const fx = new SkillFx(() => ({ burst: () => undefined }) as never, 10);
    fx.play([{ t: 'energy', x: 0, y: 1, z: 0, heading: 0, length: 8, color: 0x9fd8ff, delay: 0, dur: 0.5 }]);
    fx.update(0.1, new THREE.PerspectiveCamera());
    expect(fx.group.children.length).toBe(1);
    fx.update(0.6, new THREE.PerspectiveCamera());
    expect(fx.count).toBe(0);
    expect(fx.group.children.length).toBe(0);
  });
});

describe('the Blender meshes', () => {
  it('spear-beam.glb loads into the five shapes', async () => {
    const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as { readFileSync(p: string): Uint8Array };
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const b = fs.readFileSync(new URL(`../../../public-mobile/${data.anachak.hero.vfx.beamModel}`, import.meta.url).pathname);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(ab, '');
    const s = shapesFromModel(gltf.scene)!;
    expect(s).not.toBeNull();
    s.beam.computeBoundingBox();
    expect(s.beam.boundingBox!.max.x).toBeCloseTo(BEAM_LENGTH, 1);
    s.wave.computeBoundingBox();
    expect(Math.abs(s.wave.boundingBox!.min.x)).toBeLessThan(0.01);
  });
});
