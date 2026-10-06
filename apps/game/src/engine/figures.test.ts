import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import qualityJson from '../../../../config/quality.json';
import windowJson from '../../../../config/window.json';
import {
  bushGeometry,
  hutGeometry,
  LIMB,
  palmGeometry,
  raftGeometry,
  taperedTube,
  treeGeometry,
  workerGeometry,
} from './figures';
import { cloudGeometry } from './look';
import {
  elephantGeometry,
  elephantWithBlockGeometry,
  horseGeometry,
  nandiGeometry,
  oxCartGeometry,
  zebuGeometry,
} from './animals';
import { qualityFrom } from './app';

const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;

/** Distinct values of one component of the limb attribute. */
function limbValues(g: THREE.BufferGeometry, component: number): Set<number> {
  const a = g.getAttribute('limb');
  const out = new Set<number>();
  for (let i = 0; i < a.count; i++) out.add(Math.round(a.getComponent(i, component) * 100) / 100);
  return out;
}

const figures = {
  worker: workerGeometry(),
  workerMallet: workerGeometry('mallet'),
  workerPole: workerGeometry('pole'),
  workerLoad: workerGeometry('load'),
  elephant: elephantGeometry(),
  oxCart: oxCartGeometry(),
  horse: horseGeometry(),
  packHorse: horseGeometry({ pack: true }),
  zebu: zebuGeometry(),
  nandi: nandiGeometry(),
  raft: raftGeometry(),
  tree: treeGeometry(),
  palm: palmGeometry(),
  bush: bushGeometry(),
  hut: hutGeometry(),
};

describe('stylised figures (D25)', () => {
  it('every figure has smooth normals, colours and limb data for every vertex', () => {
    for (const [name, g] of Object.entries(figures)) {
      const n = g.getAttribute('position').count;
      for (const attr of ['normal', 'color', 'limb', 'limbZ']) {
        expect(g.getAttribute(attr)?.count, `${name}.${attr}`).toBe(n);
      }
      // Normals are unit length (no zero normals from degenerate parts).
      const nrm = g.getAttribute('normal');
      for (let i = 0; i < n; i += 97) {
        const len = Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        expect(len, name).toBeGreaterThan(0.9);
      }
    }
  });

  it('stays inside the triangle budget per figure (Low preset = stream laptop)', () => {
    const budget: Record<string, number> = {
      worker: 4000,
      workerMallet: 4200,
      workerPole: 4200,
      workerLoad: 4200,
      elephant: 7000,
      oxCart: 5500,
      horse: 3000,
      packHorse: 3600,
      zebu: 3000,
      nandi: 3000,
      raft: 2000,
      tree: 1500,
      palm: 1500,
      bush: 500,
      hut: 1500,
    };
    for (const [name, g] of Object.entries(figures)) expect(tris(g), name).toBeLessThanOrEqual(budget[name]!);
  });

  it('workers have heroic proportions: shoulders wider than the waist, head about 1/7 of height', () => {
    const g = figures.worker;
    const pos = g.getAttribute('position');
    let shoulder = 0;
    let waist = 0;
    let top = 0;
    let chin = Infinity;
    const col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const x = Math.abs(pos.getX(i));
      if (y > 1.45 && y < 1.55) shoulder = Math.max(shoulder, x);
      if (y > 1.13 && y < 1.17 && x < 0.28) waist = Math.max(waist, x);
      top = Math.max(top, y);
      if (y > 1.66 && col.getX(i) > 0.3) chin = Math.min(chin, y);
    }
    expect(shoulder).toBeGreaterThan(waist * 1.8);
    expect(top).toBeGreaterThan(1.85);
    expect((top - chin) / top).toBeLessThan(0.2);
  });

  it('workers have swinging legs and arms, and a cloth area for crowd colours', () => {
    const kinds = limbValues(figures.worker, 2);
    expect(kinds).toContain(LIMB.leg);
    expect(kinds).toContain(LIMB.arm);
    expect(limbValues(figures.worker, 3)).toContain(1); // cloth mask
    // Legs swing opposite each other (both signs present).
    expect(limbValues(figures.worker, 0)).toEqual(new Set([0, 1, -1]));
  });

  it('elephant legs swing around their own hip (pivot depth = leg position)', () => {
    const g = figures.elephant;
    const limb = g.getAttribute('limb');
    const lz = g.getAttribute('limbZ');
    const pos = g.getAttribute('position');
    for (let i = 0; i < limb.count; i++) {
      if (limb.getZ(i) !== LIMB.leg) continue;
      expect(Math.abs(pos.getZ(i) - lz.getX(i))).toBeLessThan(0.6);
    }
    expect(limbValues(g, 2)).toContain(LIMB.sway); // trunk
  });

  it('cart wheels roll around the axle at z = 0', () => {
    const g = figures.oxCart;
    const limb = g.getAttribute('limb');
    const pos = g.getAttribute('position');
    let wheelVerts = 0;
    for (let i = 0; i < limb.count; i++) {
      if (limb.getZ(i) !== LIMB.wheel) continue;
      wheelVerts++;
      expect(Math.hypot(pos.getY(i) - limb.getY(i), pos.getZ(i))).toBeLessThan(0.7);
    }
    expect(wheelVerts).toBeGreaterThan(100);
  });

  it('figures stand on the ground and face +Z', () => {
    for (const name of ['worker', 'elephant', 'oxCart'] as const) {
      const g = figures[name];
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y, name).toBeGreaterThan(-0.05);
      expect(g.boundingBox!.min.y, name).toBeLessThan(0.1);
    }
    // Eyes (white) sit on the front of the head.
    const g = figures.worker;
    const col = g.getAttribute('color');
    const pos = g.getAttribute('position');
    const white = new THREE.Color(0xfbf6ee);
    let front = 0;
    for (let i = 0; i < col.count; i++) {
      if (Math.abs(col.getX(i) - white.r) < 1e-3 && pos.getY(i) > 1.3) front += pos.getZ(i) > 0.1 ? 1 : -1;
    }
    expect(front).toBeGreaterThan(0);
  });
});

describe('taperedTube', () => {
  it('narrows from the first radius to the last', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 2, 0)];
    const g = taperedTube(pts, 0.4, 0.1, 10, 8);
    const pos = g.getAttribute('position');
    let bottom = 0;
    let top = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (pos.getY(i) < 0.01) bottom = Math.max(bottom, r);
      if (pos.getY(i) > 1.99) top = Math.max(top, r);
    }
    expect(bottom).toBeCloseTo(0.4, 2);
    expect(top).toBeCloseTo(0.1, 2);
  });
});

describe('look (D25)', () => {
  it('clouds have flattened undersides', () => {
    const g = cloudGeometry(3);
    g.computeBoundingBox();
    expect(-g.boundingBox!.min.y).toBeLessThan(g.boundingBox!.max.y * 0.5);
  });

  it('every quality preset has valid look settings', () => {
    for (const name of ['low', 'high', 'lite'] as const) {
      const look = qualityJson[name].look;
      expect(Math.log2(look.shadowMapSize) % 1, name).toBe(0);
      expect(look.exposure).toBeGreaterThan(0.5);
      expect(look.exposure).toBeLessThan(2);
      expect(look.envIntensity).toBeGreaterThanOrEqual(0);
    }
    // The stream laptop keeps soft shadows; lite is the fallback without them.
    expect(qualityJson.low.look.shadows).toBe(true);
    expect(qualityJson.lite.look.shadows).toBe(false);
  });

  it('picks the preset from the URL, defaulting to low', () => {
    expect(qualityFrom('').name).toBe('low');
    expect(qualityFrom('?preset=high').name).toBe('high');
    expect(qualityFrom('?preset=lite').name).toBe('lite');
    expect(qualityFrom('?preset=ultra').name).toBe('ultra'); // a strong PC (D79)
    expect(qualityFrom('?preset=mega').name).toBe('low');
    expect(['low', 'high', 'lite']).toContain(windowJson.preset);
  });
});

describe("Build tab details from PK's prompt", () => {
  it('stilt houses are Pteas Kantaang: nine posts on stone footings, raised floor, door side +z', () => {
    const g = hutGeometry();
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.y).toBeGreaterThan(4.5); // raised floor + gable
    expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
    // Footings: pale stone at ground level under each of the 3 × 3 posts.
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    const stone = new Set<string>();
    for (let i = 0; i < pos.count; i++)
      if (pos.getY(i) < 0.21 && col.getX(i) > 0.4 && Math.abs(col.getX(i) - col.getZ(i)) < 0.25)
        stone.add(`${Math.round(pos.getX(i))},${Math.round(pos.getZ(i))}`);
    expect(stone.size).toBeGreaterThanOrEqual(6);
  });

  it('the elephant carries a block on its back, under the triangle budget', () => {
    const plain = elephantGeometry();
    const loaded = elephantWithBlockGeometry();
    // The block's top face (y ≈ 3.63) over the middle of the back.
    const top = (g: THREE.BufferGeometry) => {
      const p = g.getAttribute('position');
      let n = 0;
      for (let i = 0; i < p.count; i++)
        if (Math.abs(p.getY(i) - 3.625) < 0.01 && Math.abs(p.getZ(i) + 0.45) < 0.5) n++;
      return n;
    };
    expect(top(loaded)).toBeGreaterThan(top(plain));
    expect(tris(loaded)).toBeLessThanOrEqual(7200);
  });
});

describe('crowd shader source', () => {
  it('declares no variable with a GLSL reserved word (a bad name hides every crowd and building)', async () => {
    const { LIMB_VERTEX } = await import('./figures');
    const reserved = [
      'out',
      'in',
      'inout',
      'input',
      'output',
      'sample',
      'filter',
      'active',
      'common',
      'partition',
    ];
    for (const w of reserved)
      expect(LIMB_VERTEX, w).not.toMatch(new RegExp(`\\b(float|int|bool|vec[234])\\s+${w}\\b`));
  });
});
