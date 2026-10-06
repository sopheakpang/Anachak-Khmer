import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __temples: { fontsReady: boolean; fontsOk: boolean; stats: { fps: number; frames: number } };
  }
}

const FAMILIES = ['Moulpali', 'Kantumruy Pro'];

test('Khmer fonts load and render (AC-20), 10 s FPS sample', async ({ page }) => {
  await page.goto('/?fonts=1&offline=1&meter=1&shot=site');
  await page.waitForFunction(() => window.__temples?.fontsReady === true, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__temples.fontsOk)).toBe(true);

  // Every bundled family has a loaded face (no silent fallback).
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  );
  for (const family of FAMILIES) expect(loaded).toContain(family);

  // The panel shows every test line in both fonts.
  await expect(page.locator('.font-row')).toHaveCount(2);
  await expect(page.locator('.font-sample').first()).toContainText('ស្ថាបត្យករហ្លួង');

  // FPS over 10 s. Headless uses software WebGL, so this only proves the loop runs;
  // the real 30 FPS check happens on the stream PC (docs/CAPTURE.md).
  const before = await page.evaluate(() => window.__temples.stats.frames);
  await page.waitForTimeout(10_000);
  const after = await page.evaluate(() => window.__temples.stats.frames);
  const fps = (after - before) / 10;
  console.log(`average FPS over 10 s (headless, software GL): ${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThan(0);
  expect(fps).toBeLessThanOrEqual(31);

  await page.screenshot({ path: 'docs/screens/02-khmer.png' });
});

test('stage stays 9:16 and fully visible in a laptop-sized window', async ({ page }) => {
  await page.setViewportSize({ width: 608, height: 1080 });
  await page.goto('/?offline=1');
  await page.waitForFunction(() => window.__temples?.fontsReady === true);
  const box = await page.locator('.stage').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width / box.height).toBeCloseTo(9 / 16, 2);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(609);
  expect(box.y + box.height).toBeLessThanOrEqual(1081);
});
