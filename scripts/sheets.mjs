/* global process, console */
// Character sheets for the costume reviewers (PK, D103). Start the game first
// (npm run dev -w @temples/game, or vite on another port; set SHEETS_URL), then:
//   node scripts/sheets.mjs all king villager spearman ... tiger
// writes docs/screens/sheet-<name>.png (all = every character side by side; tiger = the tiger).
import { chromium } from '@playwright/test';
const b = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('err', e.message));
const list = process.argv.slice(2);
for (const t of list) {
  await p.goto(
    (process.env.SHEETS_URL ?? 'http://localhost:5173') +
      '/heroSheet.html?' +
      (t === 'all' ? 'all=1' : t === 'tiger' ? 'tiger=1' : t === 'yantra' ? 'yantra=1' : 'kit=' + t),
  );
  await p.waitForTimeout(t === 'all' ? 30000 : 22000);
  await p.screenshot({ path: 'docs/screens/sheet-' + t + '.png' });
  console.log('saved', t);
}
await b.close();
