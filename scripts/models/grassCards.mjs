/* global process, console, Buffer, document */
// Bake PK's Meshy grass model into grass cards (PK 1.8.0): the model is drawn from 3 sides
// (0°, 60°, 120°) with flat light onto a transparent atlas, twice — whole (with its plumes) and
// cut below the plumes — so the game can plant thousands of crossed cards that look like the
// model at 12 triangles a clump. Writes the WebP atlas the game loads.
//   1. start the game's dev server:  npm run dev -w @temples/game   (port 5173, or pass one)
//   2. copy the .glb into apps/game/public-mobile/_bake/grass.glb
//   3. node scripts/models/grassCards.mjs [port] [model.glb under _bake] [out name] [cut|turn] [hue shift°]
//      cut  = 2nd row cut below the plumes (elephant grass, default); turn = 2nd row the same
//      grass seen from 3 more sides (30°, 90°, 150°); hue shift = leaves toward green (default 38).
//      top = a 4th column: the grass seen from straight above (for a flat card the steep RTS
//      camera sees; the side cards look like thin stars from up there).
//      e.g. node scripts/models/grassCards.mjs 5173 sward.glb sward turn 0 top   (PK's 30 cm cogon mix)
// Output: apps/game/public-mobile/models/grass/<out>.webp (1536 × 1024: 3 views × 2 variants).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const port = process.argv[2] ?? '5173';
const model = process.argv[3] ?? 'grass.glb';
const outName = process.argv[4] ?? 'cards';
const mode = process.argv[5] ?? 'cut';
const shift = Number(process.argv[6] ?? 38);
const top = process.argv[7] === 'top';
const COLS = top ? 4 : 3;
const VIEW = 512;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: VIEW, height: VIEW } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:${port}/_bake/blank.html`);
const shots = await page.evaluate(
  async ([VIEW, model, mode, top]) => {
    const root = '/@fs' + '/home/claude/the-temples/node_modules/three';
    const T = await import(`${root}/build/three.module.js`);
    const { GLTFLoader } = await import(`${root}/examples/jsm/loaders/GLTFLoader.js`);
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(VIEW, VIEW);
    r.setPixelRatio(1);
    r.outputColorSpace = T.SRGBColorSpace;
    r.localClippingEnabled = true;
    r.setClearColor(0x000000, 0);
    document.body.appendChild(r.domElement);
    const scene = new T.Scene();
    const g = await new GLTFLoader().loadAsync(`/_bake/${model}`);
    const m = g.scene;
    const box = new T.Box3().setFromObject(m);
    const c = box.getCenter(new T.Vector3());
    const sz = box.getSize(new T.Vector3());
    m.position.sub(new T.Vector3(c.x, box.min.y, c.z));
    scene.add(m);
    // Flat light: the game lights the cards itself.
    scene.add(new T.AmbientLight(0xffffff, Math.PI));
    const H = sz.y;
    const half = (Math.max(sz.x, sz.z, H) / 2) * 1.02;
    // Clip: the soil disc at the foot always; the plumes in the second variant.
    const foot = new T.Plane(new T.Vector3(0, 1, 0), -0.02 * H);
    const below = new T.Plane(new T.Vector3(0, -1, 0), 0.6 * H);
    const out = [];
    for (const plumes of [true, false]) {
      m.traverse((o) => {
        if (o.material) o.material.clippingPlanes = plumes || mode === 'turn' ? [foot] : [foot, below];
      });
      const turn = !plumes && mode === 'turn' ? Math.PI / 6 : 0;
      for (const a0 of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        const ang = a0 + turn;
        const cam = new T.OrthographicCamera(-half, half, 2 * half, 0, 0.01, 100);
        cam.position.set(Math.sin(ang) * 20, 0, Math.cos(ang) * 20);
        cam.lookAt(0, 0, 0);
        r.render(scene, cam);
        out.push(r.domElement.toDataURL('image/png'));
      }
      if (top) {
        // From straight above: image up = -z, right = +x (the flat card's uv in the game).
        const cam = new T.OrthographicCamera(-half, half, half, -half, 0.01, 100);
        cam.position.set(0, 20, 0);
        cam.up.set(Math.sin(turn), 0, -Math.cos(turn));
        cam.lookAt(0, 0, 0);
        r.render(scene, cam);
        out.push(r.domElement.toDataURL('image/png'));
      }
    }
    // Frame size (a card is this wide and tall, the grass is H tall), for the game.
    return { out, frame: 2 * half, height: H };
  },
  [VIEW, model, mode, top],
);
await b.close();
// Meshy's albedo is an olive yellow: turn the leaves toward the game's greens (hue +shift),
// keep the golden plumes (orange hues) as they are.
async function greener(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 1e-3) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    const l = (max + min) / 2;
    const sat = d / (1 - Math.abs(2 * l - 1));
    // Leaves (yellow-olive, 45°–80°) → grass green; plumes (below 45°) stay gold.
    const k = Math.min(1, Math.max(0, (h - 42) / 10));
    const h2 = h + shift * k;
    const s2 = sat * (1 - 0.12 * k);
    const l2 = l * (1 - 0.1 * k);
    const c = (1 - Math.abs(2 * l2 - 1)) * s2;
    const x = c * (1 - Math.abs(((h2 / 60) % 2) - 1));
    const m = l2 - c / 2;
    const [rr, gg, bb] = h2 < 60 ? [c, x, 0] : h2 < 120 ? [x, c, 0] : h2 < 180 ? [0, c, x] : [0, x, c];
    data[i] = Math.round((rr + m) * 255);
    data[i + 1] = Math.round((gg + m) * 255);
    data[i + 2] = Math.round((bb + m) * 255);
  }
  return sharp(pad(data, info.width, info.height), { raw: info }).png().toBuffer();
}

/**
 * Bleed the leaf colours into the clear pixels (8 rings, then the mean leaf colour): the
 * filtered and mipmapped atlas then fades to grass, not to black, round every leaf (the dark
 * brown rim and the dark far grass otherwise).
 */
function pad(data, w, h) {
  const n = w * h;
  const have = new Uint8Array(n);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++)
    if (data[i * 4 + 3] > 8) {
      have[i] = 1;
      sr += data[i * 4];
      sg += data[i * 4 + 1];
      sb += data[i * 4 + 2];
      cnt++;
    }
  for (let ring = 0; ring < 8; ring++) {
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (have[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!have[j]) continue;
            r += data[j * 4];
            g += data[j * 4 + 1];
            b += data[j * 4 + 2];
            c++;
          }
        if (c) add.push(i, r / c, g / c, b / c);
      }
    for (let k = 0; k < add.length; k += 4) {
      const i = add[k];
      data[i * 4] = add[k + 1];
      data[i * 4 + 1] = add[k + 2];
      data[i * 4 + 2] = add[k + 3];
      have[i] = 1;
    }
  }
  if (cnt)
    for (let i = 0; i < n; i++)
      if (!have[i]) {
        data[i * 4] = sr / cnt;
        data[i * 4 + 1] = sg / cnt;
        data[i * 4 + 2] = sb / cnt;
      }
  return data;
}
const tiles = await Promise.all(shots.out.map((s) => greener(Buffer.from(s.split(',')[1], 'base64'))));
// Copy the tiles in raw (a composite would blend the padded clear pixels back to black).
const W = VIEW * COLS;
const raw = Buffer.alloc(W * VIEW * 2 * 4);
for (const [i, png] of tiles.entries()) {
  const px = await sharp(png).raw().toBuffer();
  const ox = (i % COLS) * VIEW;
  const oy = Math.floor(i / COLS) * VIEW;
  for (let y = 0; y < VIEW; y++) px.copy(raw, ((oy + y) * W + ox) * 4, y * VIEW * 4, (y + 1) * VIEW * 4);
}
const atlas = sharp(raw, { raw: { width: W, height: VIEW * 2, channels: 4 } });
mkdirSync('apps/game/public-mobile/models/grass', { recursive: true });
writeFileSync(`apps/game/public-mobile/models/grass/${outName}.webp`, await atlas.webp({ quality: 88, alphaQuality: 100, exact: true }).toBuffer());
console.log(JSON.stringify({ frame: +shots.frame.toFixed(3), height: +shots.height.toFixed(3), card: +(shots.frame / shots.height).toFixed(3) }));
