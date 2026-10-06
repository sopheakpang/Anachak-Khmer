import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BURST_KINDS, Particles } from './vfx';

describe('Particles', () => {
  it('is one hidden Points draw call until something bursts', () => {
    const p = new Particles(100);
    expect(p.mesh).toBeInstanceOf(THREE.Points);
    expect(p.mesh.visible).toBe(false);
    expect(p.alive).toBe(0);
  });

  it('every kind adds particles', () => {
    for (const kind of BURST_KINDS) {
      const p = new Particles(100);
      p.burst(kind, 1, 2, 3);
      expect(p.alive, kind).toBeGreaterThan(0);
      expect(p.mesh.visible).toBe(true);
    }
  });

  it('update moves, ages and recycles', () => {
    const p = new Particles(100);
    p.burst('chips', 0, 1, 0, 8);
    expect(p.alive).toBe(8);
    const pos = p.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const y0 = pos.getY(0);
    p.update(0.05);
    expect(p.alive).toBe(8);
    expect(pos.getY(0)).not.toBe(y0);
    for (let i = 0; i < 40; i++) p.update(0.05); // 2 s: chips live under 1 s
    expect(p.alive).toBe(0);
    p.update(0.05);
    expect(p.mesh.visible).toBe(false);
    const alpha = p.mesh.geometry.getAttribute('alpha') as THREE.BufferAttribute;
    expect(alpha.getX(0)).toBe(0);
  });

  it('never exceeds its capacity (oldest reused)', () => {
    const p = new Particles(50);
    for (let i = 0; i < 20; i++) p.burst('dust', i, 0, 0, 12);
    expect(p.alive).toBe(50);
    p.update(0.01);
    expect(p.alive).toBe(50);
    p.burst('sparks', 0, 0, 0, 500);
    expect(p.alive).toBe(50);
    expect(p.mesh.geometry.getAttribute('position').count).toBe(50);
  });

  it('smoke rises and grows', () => {
    const p = new Particles(40);
    p.burst('smoke', 0, 0, 0, 10);
    const size = p.mesh.geometry.getAttribute('size') as THREE.BufferAttribute;
    const pos = p.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const s0 = size.getX(0);
    for (let i = 0; i < 10; i++) p.update(0.1);
    expect(size.getX(0)).toBeGreaterThan(s0);
    expect(pos.getY(0)).toBeGreaterThan(0.3);
  });
});
