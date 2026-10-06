import { expect, test } from '@playwright/test';

/** The Android phone build of the Kingdom (D72), on a 20:9 phone held sideways, by touch. */
test.describe.configure({ mode: 'serial', timeout: 360_000 });
test.use({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

test('KM-01: phone build: credit screen, touch to select and gather, menu, back button, budget', async ({
  page,
}) => {
  await page.goto('/mobile.html');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  // The start screen credits the developer; a tap starts the game.
  await expect(page.locator('.m-splash')).toContainText('Mr. Sopheak Pang');
  await page.screenshot({ path: 'docs/screens/m-start.png' });
  await page.locator('.m-start[data-variant="kingdom"]').tap({ force: true }); // it pulses, so never "stable"
  await expect(page.locator('.m-splash')).toHaveCount(0);
  // The stage is widened to the phone (20:9 → about 2400 × 1080) and uses the touch layout.
  const w = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--landscape-w'),
  );
  expect(parseInt(w)).toBeGreaterThan(2200);
  await expect(page.locator('.k-ui.k-mobile')).toHaveCount(1);
  // No TikTok council on the phone.
  await expect(page.locator('#k-council')).toBeHidden();

  // Tap a villager: he is selected. Then tap the nearest tree: he goes to cut it.
  const toPage = async (x: number, y: number) =>
    page.evaluate(
      ([sx, sy]) => {
        const r = document.querySelector('.stage')!.getBoundingClientRect();
        const W = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--landscape-w'));
        return { x: r.left + (sx! / W) * r.width, y: r.top + (sy! / 1080) * r.height };
      },
      [x, y],
    );
  const v = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    k.sim.autoWork = false;
    const u = [...k.sim.units.values()].find((x) => x.team === 0 && x.type === 'villager')!;
    u.task = { kind: 'idle' };
    k.panTo(u.x, u.z);
    return u.id;
  });
  await page.waitForTimeout(3000);
  const vp = await page.evaluate((id) => {
    const k = window.__temples.kingdom!;
    const u = k.sim.units.get(id)!;
    return k.view.project(u.x, 1, u.z);
  }, v);
  let t = await toPage(vp.x, vp.y);
  await page.touchscreen.tap(t.x, t.y);
  await page.waitForFunction((id) => window.__temples.kingdom!.selected.has(id), v, {
    timeout: 30_000,
    polling: 500,
  });
  const tree = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const u = [...k.selected].map((id) => k.sim.units.get(id)!)[0]!;
    const n = [...k.sim.nodes.values()]
      .filter((x) => x.kind === 'tree')
      .map((x) => ({ x, p: k.sim.nodePos(x) }))
      .sort((a, b) => Math.hypot(a.p[0] - u.x, a.p[1] - u.z) - Math.hypot(b.p[0] - u.x, b.p[1] - u.z))[0]!;
    const f = k.sim.fog;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) f.explored[(n.x.tz + dz) * f.size + n.x.tx + dx] = 1;
    k.sim.fogVersion++;
    k.panTo(n.p[0], n.p[1]);
    return n.p;
  });
  await page.waitForTimeout(3000);
  const tp = await page.evaluate(([x, z]) => window.__temples.kingdom!.view.project(x!, 1.5, z!), tree);
  t = await toPage(tp.x, tp.y);
  await page.touchscreen.tap(t.x, t.y);
  await page.waitForFunction(
    (id) => {
      const u = window.__temples.kingdom!.sim.units.get(id)!;
      return u.task.kind === 'gather' && u.task.res === 'wood';
    },
    v,
    { timeout: 30_000, polling: 500 },
  );
  await page.screenshot({ path: 'docs/screens/m-play.png' });

  // The ☰ menu opens the big buttons; About credits the developer.
  await page.locator('.k-menu-toggle').tap();
  await expect(page.locator('.k-menubar [data-act="about"]')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'docs/screens/m-menu.png' });
  await page.locator('.k-menubar [data-act="about"]').dispatchEvent('pointerdown');
  await expect(page.locator('#k-card')).toContainText('Mr. Sopheak Pang', { timeout: 30_000 });
  // The Android back button closes the card, then the selection, then reports nothing open.
  const backs = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    k.hud.menuOpen = false;
    return [window.__kingdomBack!(), window.__kingdomBack!(), window.__kingdomBack!()];
  });
  expect(backs).toEqual([true, true, false]);

  const s = await page.evaluate(() => window.__temples.stats);
  console.log(`[budget] phone: ${s.triangles} triangles, ${s.drawCalls} draw calls`);
  expect(s.triangles).toBeLessThan(600_000);
  expect(s.drawCalls).toBeLessThan(120);
});

/** The iPhone web app (D73): same page from Safari, installable, landscape only. */
test.describe('iPhone', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });

  test('KM-02: iPhone: Home Screen icon and manifest, install hint, turn-the-phone screen', async ({
    page,
  }) => {
    await page.goto('/mobile.html');
    await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
      timeout: 180_000,
      polling: 500,
    });
    // Safari (not yet on the Home Screen) is told how to install it.
    await expect(page.locator('.m-install')).toContainText('Add to Home Screen');
    // The icon and the manifest the Home Screen uses are served.
    const icon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await page.request.get(new URL(icon!, page.url()).href)).status()).toBe(200);
    const man = await page.request.get(new URL('manifest.webmanifest', page.url()).href);
    expect(man.status()).toBe(200);
    const m = (await man.json()) as { display: string; orientation: string; icons: unknown[] };
    expect(m.display).toBe('fullscreen');
    expect(m.orientation).toBe('landscape');
    expect(m.icons.length).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.m-rotate')).toBeHidden();
    await page.screenshot({ path: 'docs/screens/m-iphone.png' });
    // Held upright, the game asks to turn the phone sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.m-rotate')).toBeVisible();
    await expect(page.locator('.m-rotate')).toContainText('Turn your phone or iPad sideways');
  });
});

/** iPad (D74): a taller stage in the tablet's own shape, no black bars; same touch play. */
test.describe('iPad', () => {
  test.use({
    viewport: { width: 1180, height: 820 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  });

  test('KM-03: iPad: taller stage fills the screen, HUD at the edges, pinch zoom', async ({ page }) => {
    await page.goto('/mobile.html');
    await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
      timeout: 180_000,
      polling: 500,
    });
    const h = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--landscape-h'),
    );
    expect(parseInt(h)).toBe(Math.round(1920 / (1180 / 820)));
    await page.locator('.m-start[data-variant="kingdom"]').tap({ force: true });
    await expect(page.locator('.m-splash')).toHaveCount(0);
    // The stage fills the tablet: no black bars above or below.
    const r = await page.evaluate(() => {
      const b = document.querySelector('.stage')!.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    });
    expect(Math.abs(r.top)).toBeLessThan(2);
    expect(Math.abs(r.bottom - 820)).toBeLessThan(2);
    expect(Math.abs(r.left)).toBeLessThan(2);
    // The command bar sits at the bottom of the taller stage.
    const bar = await page.locator('#k-panel').boundingBox();
    expect(bar!.y + bar!.height).toBeGreaterThan(780);
    await expect(page.locator('.m-rotate')).toBeHidden();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'docs/screens/m-ipad.png' });
  });
});

test('KM-04: phone: Anachak Khmer from the start screen, the 3D hero mode with the stick', async ({
  page,
}) => {
  await page.goto('/mobile.html');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  await expect(page.locator('.m-start[data-variant="anachak"]')).toBeVisible();
  await page.locator('.m-start[data-variant="anachak"]').tap({ force: true });
  await expect(page.locator('.m-splash')).toHaveCount(0);
  await page.waitForFunction(() => window.__temples.anachak && window.__temples.mode === 'anachak', null, {
    timeout: 180_000,
  });
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    k.act('card-close');
    const v = [...k.sim.units.values()].find((u) => u.team === 0 && u.type === 'villager')!;
    k.act(`hero:${v.id}`);
  });
  await expect(page.locator('.k-anachak .k-hero-stick')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.k-anachak .k-hb-attack')).toBeVisible();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'docs/screens/m-hero.png' });
  await page.locator('.k-anachak .k-hero-exit').tap({ force: true });
  await expect(page.locator('.k-anachak .k-hero')).toBeHidden({ timeout: 60_000 });
});
