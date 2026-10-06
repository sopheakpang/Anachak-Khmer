import * as THREE from 'three';
import { RENDER_SIZE, type SlotRef } from '@temples/shared';
import { PALETTE, addLights, horizonDressing, skyDome, type SunOptions } from '../engine/look';
import type { DirectorView } from '../logic/director';

export interface FrameContext {
  now: number;
  dt: number;
  view: DirectorView;
  convoys: { workers: number; oxcart: number; elephants: number; raft: number };
  stockpile: number;
  progress01: number;
  paused: boolean;
}

export interface GameScene {
  readonly name: string;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Move the camera for shot progress t (0..1) and animate. */
  update(ctx: FrameContext): void;
}

export const ASPECT = RENDER_SIZE.width / RENDER_SIZE.height;

/** Sky, warm key light, soft shadows and haze shared by every scene (spec: Look rules, D25). */
export function baseScene(
  fogNear = 60,
  fogFar = 220,
  sun: SunOptions = { center: [0, 0, 0], extent: 40 },
): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(skyDome());
  scene.add(horizonDressing(Math.round(fogFar)));
  scene.fog = new THREE.Fog(PALETTE.fog, fogNear, fogFar);
  addLights(scene, sun);
  return scene;
}

export function camera(fov = 45): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(fov, ASPECT, 0.5, 600);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Something that can show a slot close-up (site scene), used for cuts and PiP. */
export interface SlotViewer {
  aimAt(cam: THREE.PerspectiveCamera, slot: SlotRef | null, distance: number, t: number): void;
}
