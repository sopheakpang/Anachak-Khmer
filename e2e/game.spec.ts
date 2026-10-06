import { expect, test, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync(new URL('../config/layout.json', import.meta.url), 'utf8')) as {
  zones: Record<string, unknown>;
};

/** A host socket to the test bridge (in-memory world). */
async function host(): Promise<{ send: (m: unknown) => void; close: () => void }> {
  const ws = new WebSocket('ws://localhost:7420/?role=host');
  await new Promise((r) => ws.once('open', r));
  return { send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
}
let seq = 0;
const gift = (name: string, coins: number, user: [string, string], extra: object = {}) => ({
  kind: 'simulate',
  event: {
    id: `g${Date.now()}-${++seq}`,
    type: 'gift',
    giftName: name,
    giftCoins: coins,
    user: { id: user[0], name: user[1], handle: user[0] },
    ts: Date.now(),
    ...extra,
  },
});

async function open(page: Page, query: string) {
  await page.goto(`/?${query}`);
  await page.waitForFunction(
    () => window.__temples?.fontsReady && window.__temples.model?.connected && window.__temples.model.state,
  );
}

/**
 * Performance budget per frame (Low preset, including the shadow pass). It keeps the scene
 * light for the stream laptop; the real frame rate is checked there with ?meter=1.
 */
async function expectBudget(page: Page, label: string) {
  await page.waitForFunction(() => window.__temples.stats.frames > 2);
  const s = await page.evaluate(() => window.__temples.stats);
  console.log(`[budget] ${label}: ${s.triangles} triangles, ${s.drawCalls} draw calls`);
  expect(s.triangles, label).toBeLessThan(600_000);
  expect(s.drawCalls, label).toBeLessThan(80);
}

// Software rendering in the test browser is slow (~1 frame a second), so allow 3 minutes.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('the game builds Preah Ko from gifts and shows Khmer UI', async ({ page }) => {
  const h = await host();
  h.send({ kind: 'control', action: 'resetTemple' });
  h.send({ kind: 'control', action: 'newStream' });
  await open(page, 'shot=site');
  await expect(page.locator('#ui-temple-km')).toHaveText('ព្រះគោ');
  await expect(page.locator('.game-title')).toHaveText('សាងប្រាសាទ');

  // Build up: many roses and a few big gifts from Khmer / English / Thai viewers.
  const people: Array<[string, string]> = [
    ['dara', 'Dara'],
    ['sokha', 'សុខា'],
    ['pich', 'ពេជ្រ'],
    ['somchai', 'สมชาย'],
  ];
  for (let i = 0; i < 60; i++) h.send(gift('Hand Hearts', 100, people[i % 4]!));
  h.send(gift('Doughnut', 30, ['bopha', 'Bopha']));
  await page.waitForFunction(() => (window.__temples.model?.state?.temple.progress ?? 0) > 1500, null, {
    timeout: 15_000,
  });
  await expect(page.locator('#ui-feed li').first()).toBeVisible();
  // TikTok support shown as resources: gifts today (and likes) beside the progress bar.
  await page.waitForFunction(() => (window.__temples.model?.state?.giftsToday ?? 0) >= 61, null, {
    timeout: 30_000,
    polling: 500, // the software-rendered test browser draws very few frames here
  });
  await expect(page.locator('#ui-gifts')).not.toHaveText('0');
  await expect(page.locator('#ui-likes')).toBeVisible();
  await expect(page.locator('#ui-top li').first()).toContainText(/Dara|សុខា|ពេជ្រ|@somchai/);
  // Toasts live 4 s; the headless test browser draws ~1 frame a second, so check the model.
  await page.waitForFunction(() => (window.__temples.model?.toasts.length ?? 0) > 0);
  await page.waitForTimeout(2500); // let blocks land
  await page.screenshot({ path: 'docs/screens/b-site.png' });
  await expectBudget(page, 'site (built)');
  h.close();
});

test('a huge gift cuts to the site with a banner (AC-11 on screen)', async ({ page }) => {
  const h = await host();
  await open(page, 'meter=1&cutSeconds=60');
  h.send(gift('Lion', 29999, ['vannak', 'Vannak']));
  await expect(page.locator('#ui-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#ui-banner')).toContainText('Vannak');
  await page.waitForFunction(() => window.__temples.view?.mode === 'cut');
  await page.screenshot({ path: 'docs/screens/b-cut.png' });
  h.close();
});

test('a small gift shows in picture-in-picture (AC-12 on screen)', async ({ page }) => {
  const h = await host();
  await open(page, 'shot=map&pipSeconds=60');
  h.send(gift('Finger Heart', 5, ['kanha', 'កញ្ញា']));
  await page.waitForFunction(
    () => window.__temples.view?.pip !== null && window.__temples.view?.pip !== undefined,
  );
  await expect(page.locator('.pip-frame')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/b-map-pip.png' });
  h.close();
});

for (const shot of ['quarry', 'river', 'hauling'] as const) {
  test(`scene: ${shot}`, async ({ page }) => {
    await open(page, `shot=${shot}`);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `docs/screens/b-${shot}.png` });
    await expectBudget(page, shot);
  });
}

test('help pop-up: white rounded box, black letters, at the top under TikTok’s header', async ({ page }) => {
  await open(page, 'shot=site');
  // Measure in the same tick the pop-up is showing (it hides again after a few seconds).
  const handle = await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLElement>('#ui-help');
      if (!el || el.hidden || !el.textContent?.includes('ចុចបេះដូង')) return null;
      const cs = getComputedStyle(el);
      const stage = document.querySelector('.stage')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const k = stage.width / 1080;
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        radius: parseFloat(cs.borderTopLeftRadius),
        top: (r.top - stage.top) / k,
      };
    },
    null,
    { timeout: 90_000, polling: 200 },
  );
  const look = (await handle.jsonValue())!;
  expect(look.bg).toBe('rgb(255, 255, 255)');
  expect(look.color).toBe('rgb(26, 20, 16)');
  expect(look.radius).toBeGreaterThan(10);
  expect(look.top).toBeGreaterThanOrEqual(200);
  expect(look.top).toBeLessThan(480);
  // Keep it on screen for the picture (the slow test browser may hide it before the shot).
  await page.addStyleTag({ content: '#ui-help[hidden]{display:block!important;animation:none}' });
  await page.screenshot({ path: 'docs/screens/b-help-popup.png' });
});

test('AC-21: no on-screen text sits in TikTok’s areas', async ({ page }) => {
  const h = await host();
  await open(page, 'shot=site');
  h.send(gift('Galaxy', 1000, ['longname', 'Sokha The Great Builder Of Angkor']));
  h.send({ kind: 'control', action: 'safeZones', on: true });
  await page.waitForTimeout(1500);
  const bad = await page.evaluate((zones) => {
    const stage = document.querySelector('.stage')!.getBoundingClientRect();
    const k = stage.width / 1080;
    const clear = Object.entries(zones).filter(([, z]) => (z as { keepClear?: boolean }).keepClear) as Array<
      [string, { x: number; y: number; w: number; h: number }]
    >;
    const out: string[] = [];
    for (const el of document.querySelectorAll('[data-ui], .toast, .banner:not([hidden]), .help')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const box = {
        x: (r.left - stage.left) / k,
        y: (r.top - stage.top) / k,
        w: r.width / k,
        h: r.height / k,
      };
      for (const [name, z] of clear) {
        if (box.x < z.x + z.w && box.x + box.w > z.x && box.y < z.y + z.h && box.y + box.h > z.y) {
          out.push(`${name}: ${(el.textContent ?? '').slice(0, 30)}`);
        }
      }
    }
    return out;
  }, layout.zones);
  await page.screenshot({ path: 'docs/screens/b-safe-zones.png' });
  h.send({ kind: 'control', action: 'safeZones', on: false });
  h.close();
  expect(bad).toEqual([]);
});

test('text is at least 26 px at 1080 wide', async ({ page }) => {
  await open(page, 'shot=site');
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.ui *')]
      .filter((e) => e.childElementCount === 0 && (e.textContent ?? '').trim())
      .map((e) => [e.className, parseFloat(getComputedStyle(e).fontSize)] as const)
      .filter(([, px]) => px < 26),
  );
  expect(small).toEqual([]);
});
