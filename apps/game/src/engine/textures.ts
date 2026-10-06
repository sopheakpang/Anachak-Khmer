import * as THREE from 'three';

/**
 * All textures are painted in code (no image files, nothing to license) in the warm
 * museum-panorama palette from the spec: laterite red, Kulen grey-green sandstone that
 * turns gold once set, brick red, dusty ground.
 */

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Deterministic noise so every run looks the same (and screenshots compare). */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function speckle(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  colors: string[],
  seed: number,
  alpha = 0.35,
): void {
  const r = rand(seed);
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)]!;
    const s = 1 + r() * 2;
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

/** Big soft colour patches — the gentle variation of a hand-painted film set. */
function blotches(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  colors: string[],
  seed: number,
  size = 0.35,
  alpha = 0.35,
): void {
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = (0.3 + r() * 0.7) * Math.min(w, h) * size;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = colors[Math.floor(r() * colors.length)]!;
    grad.addColorStop(0, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    // Draw wrapped copies so repeating textures stay seamless.
    for (const dx of [-w, 0, w])
      for (const dy of [-h, 0, h]) {
        g.save();
        g.translate(dx, dy);
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        g.restore();
      }
  }
  g.globalAlpha = 1;
}

/** One block: soft colour variation and gently darker edges (the rounded model adds the bevel). */
function block(
  base: string,
  dark: string,
  light: string,
  specks: string[],
  seed: number,
): THREE.CanvasTexture {
  return canvas(128, 64, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 64);
    blotches(g, 128, 64, 10, [light, ...specks], seed, 0.5, 0.25);
    speckle(g, 128, 64, 260, specks, seed + 1, 0.3);
    const edge = g.createLinearGradient(0, 0, 0, 64);
    edge.addColorStop(0, 'rgba(255,240,210,0.18)');
    edge.addColorStop(0.2, 'rgba(0,0,0,0)');
    edge.addColorStop(0.85, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(40,20,10,0.22)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 128, 64);
    void dark;
  });
}

/**
 * Khmer brickwork: each kit block shows 5 courses of small fired bricks laid in a running
 * bond, with the very thin joints typical of Preah Ko (bricks were rubbed flat and set with
 * a fine vegetable-based mortar), and slight colour differences brick to brick.
 */
function brickCourses(seed: number): THREE.CanvasTexture {
  return canvas(256, 128, (g) => {
    const r = rand(seed);
    g.fillStyle = '#7a3a28'; // joint colour
    g.fillRect(0, 0, 256, 128);
    const rows = 5;
    const rh = 128 / rows;
    const bw = 256 / 3.5;
    const tones = ['#a9533a', '#b05d40', '#9c4a33', '#b8664a', '#a14e36', '#c06e4f'];
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw + off; x < 256; x += bw) {
        g.fillStyle = tones[Math.floor(r() * tones.length)]!;
        g.fillRect(x + 1, row * rh + 1, bw - 2, rh - 2);
        // Soft highlight on the top edge of each brick.
        g.fillStyle = 'rgba(255,220,190,0.12)';
        g.fillRect(x + 1, row * rh + 1, bw - 2, 3);
      }
    }
    speckle(g, 256, 128, 700, ['#7e3c2a', '#c77a5c', '#8d4130'], seed + 3, 0.35);
  });
}

let cache: ReturnType<typeof makeTextures> | null = null;

function makeTextures() {
  const brick = brickCourses(7);
  const laterite = block('#b0643f', '#6f3a22', '#cf8a62', ['#6d3620', '#8a4a2c', '#c9855c', '#5b2d18'], 11);
  const sandstoneGold = block('#d4b27a', '#9c7b4a', '#f1d9a6', ['#c4a06a', '#e2c58f', '#b8945e'], 13);
  const sandstoneFresh = block('#9ea283', '#6c705a', '#c3c6a8', ['#8e9275', '#b0b394', '#7c8066'], 17);

  const ground = canvas(256, 256, (g) => {
    g.fillStyle = '#d2ac72';
    g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 26, ['#c49a5e', '#e0bf88', '#b98f58', '#e8cc9a'], 23, 0.35, 0.16);
    speckle(g, 256, 256, 1600, ['#b8925a', '#e0c494', '#a88452'], 24, 0.25);
  });
  ground.wrapS = ground.wrapT = THREE.RepeatWrapping;

  const grass = canvas(256, 256, (g) => {
    g.fillStyle = '#8db35a';
    g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 30, ['#7aa24c', '#a6c46a', '#6f9644', '#b7cc74'], 29, 0.35, 0.16);
    speckle(g, 256, 256, 1600, ['#7b9650', '#a3bb72', '#6d8646'], 30, 0.25);
  });
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;

  const water = canvas(256, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 14, ['#d8ece6', '#eef8f4'], 33, 0.5, 0.5);
    const r = rand(31);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = r() * 256;
      const y = r() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 10, y - 3, x + 22, y);
      g.stroke();
    }
  });
  water.wrapS = water.wrapT = THREE.RepeatWrapping;

  const thatch = canvas(128, 128, (g) => {
    g.fillStyle = '#b8995e';
    g.fillRect(0, 0, 128, 128);
    const r = rand(37);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = ['#9c7f48', '#d1b57a', '#8a6f3c'][i % 3]!;
      const x = r() * 128;
      g.beginPath();
      g.moveTo(x, r() * 128);
      g.lineTo(x + (r() - 0.5) * 6, r() * 128);
      g.stroke();
    }
  });
  thatch.wrapS = thatch.wrapT = THREE.RepeatWrapping;

  const sky = canvas(4, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#8fb3cf');
    grad.addColorStop(0.5, '#e9dcbc');
    grad.addColorStop(1, '#f3cf92');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  });

  // Rice rows: light and dark stripes, tinted per paddy (young green → ripe gold).
  const paddy = canvas(128, 128, (g) => {
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, 128, 128);
    const r = rand(88);
    for (let y = 0; y < 128; y += 8) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(0, y, 128, 4);
      for (let x = 0; x < 128; x += 3) {
        g.fillStyle = `rgba(90,90,90,${0.25 + r() * 0.3})`;
        g.fillRect(x, y + 4 + r() * 3, 2, 2);
      }
    }
  });
  paddy.wrapS = paddy.wrapT = THREE.RepeatWrapping;
  // Surface detail only: the low-poly style (D41) swaps these for their average colour.
  for (const t of [brick, laterite, sandstoneGold, sandstoneFresh, ground, grass, thatch])
    t.userData.detail = true;
  return { brick, laterite, sandstoneGold, sandstoneFresh, ground, grass, water, thatch, sky, paddy };
}

export function textures() {
  if (!cache) cache = makeTextures();
  return cache;
}

export function repeated(t: THREE.Texture, x: number, y: number): THREE.Texture {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}
