import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER, type KingdomSim } from '../sim/sim';

/**
 * Light alerts in the world (PK): a soft blue light over work in progress (a building going
 * up, people being trained, research), a gold flash when something is finished, and an amber
 * light over a lumber camp that is full and waits for a cart. The resource bar shows what is
 * running out and what a build still needs (hud.ts). Rules: rules.json `alerts`.
 */

export type AlertKind = 'progress' | 'done' | 'full';

export interface Beacon {
  kind: AlertKind;
  x: number;
  z: number;
  /** Footprint radius, metres. */
  r: number;
  /** Brightness this frame, 0–1. */
  glow: number;
}

export const ALERT_COLOR: Record<AlertKind, number> = {
  progress: 0x58b4ff,
  done: 0xffd25a,
  full: 0xffa030,
};

/** A finished-work flash to show for a while. */
export interface Flash {
  x: number;
  z: number;
  r: number;
  until: number;
  sec: number;
}

/** Every light to draw now (t in seconds). */
export function beacons(sim: KingdomSim, t: number, flashes: Flash[]): Beacon[] {
  const A = sim.data.rules.alerts;
  const T = sim.map.tile;
  const out: Beacon[] = [];
  for (const b of sim.buildings.values()) {
    if (b.team !== PLAYER || b.type === 'riceField') continue;
    const [x, z] = sim.center(b);
    const r = (Math.max(b.w, b.d) * T) / 2 + 0.6;
    const busy = b.progress < 1 || b.queue.length > 0;
    if (busy) out.push({ kind: 'progress', x, z, r, glow: 0.55 + 0.35 * Math.sin(t * 2.2 + b.id) });
    if (b.type === 'lumberCamp' && (b.stock ?? 0) >= A.campFull)
      out.push({ kind: 'full', x, z, r, glow: 0.6 + 0.4 * Math.abs(Math.sin(t * 4)) });
  }
  for (const f of flashes) {
    const left = f.until - t;
    if (left <= 0) continue;
    out.push({ kind: 'done', x: f.x, z: f.z, r: f.r, glow: Math.min(1, left / (f.sec * 0.6)) });
  }
  return out;
}

/** A ring of light on the ground and a soft column rising from it (radius 1, drawn additive). */
export function beaconGeometry(): THREE.BufferGeometry {
  const ring = new THREE.RingGeometry(0.72, 1, 40, 1).rotateX(-Math.PI / 2).translate(0, 0.25, 0);
  const column = new THREE.CylinderGeometry(0.62, 0.95, 9, 24, 1, true).translate(0, 4.6, 0);
  ring.deleteAttribute('uv');
  column.deleteAttribute('uv');
  // Fade the column out as it rises (additive: black is invisible).
  const shade = (g: THREE.BufferGeometry, f: (y: number) => number) => {
    const p = g.getAttribute('position');
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c.fill(f(p.getY(i)), i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  return mergeGeometries([
    shade(ring.toNonIndexed(), () => 1),
    shade(column.toNonIndexed(), (y) => 0.9 * Math.max(0, 1 - y / 9) ** 1.4),
  ])!;
}

export function beaconMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}
