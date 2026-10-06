import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WeatherFx } from './weather';

function setup() {
  const scene = new THREE.Scene();
  scene.add(new THREE.DirectionalLight(0xffffff, 3), new THREE.HemisphereLight(0xffffff, 0x444444, 1));
  scene.fog = new THREE.Fog(0xffffff, 100, 500);
  const fx = new WeatherFx(scene);
  const get = (n: string) => scene.getObjectByName(n) as THREE.Points;
  const run = (id: string, seconds: number) => {
    for (let t = 0; t < seconds; t += 0.1) fx.update(id, t, 10, 20, 0.1);
  };
  return {
    scene,
    fx,
    run,
    rain: get('weather-rain'),
    leaves: get('weather-leaves'),
    splash: get('weather-splash'),
  };
}

describe('WeatherFx', () => {
  it('adds at most three Points, all hidden at first', () => {
    const { scene, rain, leaves, splash } = setup();
    expect(scene.children.filter((o) => o instanceof THREE.Points)).toHaveLength(3);
    expect([rain.visible, leaves.visible, splash.visible]).toEqual([false, false, false]);
  });

  it('windy blows leaves and wind eases up; no rain', () => {
    const { fx, run, rain, leaves, splash } = setup();
    const before = fx.wind;
    run('windy', 10);
    expect(leaves.visible).toBe(true);
    expect(fx.wind).toBeGreaterThan(0.55); // PK: a gentler wind (D108)
    expect(fx.wind).toBeGreaterThan(before);
    expect(rain.visible).toBe(false);
    expect(splash.visible).toBe(false);
    expect(fx.rain).toBeLessThan(0.02);
  });

  it('rain shows streaks and splashes, no leaves', () => {
    const { fx, run, rain, leaves, splash } = setup();
    run('rain', 10);
    expect(rain.visible).toBe(true);
    expect(splash.visible).toBe(true);
    expect(leaves.visible).toBe(false);
    expect(fx.rain).toBeGreaterThan(0.35); // PK: lighter rain (D108)
  });

  it('storm has rain and some leaves; unknown ids look clear', () => {
    const { fx, run, rain, leaves } = setup();
    run('storm', 10);
    expect(rain.visible && leaves.visible).toBe(true);
    run('hurricane?', 20);
    expect(rain.visible).toBe(false);
    expect(leaves.visible).toBe(false);
    expect(fx.wind).toBeLessThan(0.2);
  });

  it('leaves fall from the tree crowns near the view, never from an empty sky (PK)', () => {
    const { fx, leaves } = setup();
    const origin = leaves.geometry.getAttribute('origin') as THREE.BufferAttribute;
    // No trees yet: every leaf has no crown (the shader hides it).
    for (let i = 0; i < origin.count; i++) expect(origin.getY(i)).toBe(0);
    fx.setLeafSources([5, 4.2, 6, -3, 3.8, 9]);
    const xs = new Set<number>();
    for (let i = 0; i < origin.count; i++) {
      expect([4.2, 3.8]).toContain(Number(origin.getY(i).toFixed(1)));
      xs.add(origin.getX(i));
    }
    expect([...xs].sort()).toEqual([-3, 5]);
    fx.setLeafSources([]);
    expect(origin.getY(0)).toBe(0);
  });
});
