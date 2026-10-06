/* global process, console, window */
// Screenshots of the game for reviews (the review agents use it; D97).
// Start the game first:  npm run dev -w @temples/game   (http://localhost:5173)
// Then:  node scripts/shot.mjs "http://localhost:5173/?mode=anachak&offline=1&preset=lite" steps.json
// steps.json: [{ "wait": 6000 }, { "eval": "window.__temples.anachak.act('card-close')" },
//              { "key": "j" }, { "down": "w" }, { "up": "w" }, { "click": [960, 540] },
//              { "shot": "docs/screens/review-1.png" }]
// SwiftShader (no GPU) draws about one frame a second: wait several seconds before a shot.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url, file] = process.argv.slice(2);
if (!url || !file) {
  console.log('usage: node scripts/shot.mjs URL steps.json');
  process.exit(1);
}
const steps = JSON.parse(readFileSync(file, 'utf8'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console:', m.text().slice(0, 300));
});
await page.goto(url);
await page.waitForFunction(
  () => window.__temples?.fontsReady && (window.__temples.anachak || window.__temples.kingdom),
  null,
  { timeout: 240_000, polling: 1000 },
);
for (const s of steps) {
  if (s.eval) console.log('eval:', JSON.stringify(await page.evaluate(s.eval)));
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.key) await page.keyboard.press(s.key);
  if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) {
    await page.screenshot({ path: s.shot, timeout: 180_000 });
    console.log('saved', s.shot);
  }
}
await browser.close();
