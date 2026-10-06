import { expect, test, type Page } from '@playwright/test';
import { WebSocket } from 'ws';

async function host(): Promise<{ send: (m: unknown) => void; close: () => void }> {
  const ws = new WebSocket('ws://localhost:7420/?role=host');
  await new Promise((r) => ws.once('open', r));
  return { send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
}
let seq = 0;
const event = (e: Record<string, unknown>, id: string) => ({
  kind: 'simulate',
  event: { id: `k${Date.now()}-${++seq}`, user: { id, name: id }, ts: Date.now(), ...e },
});

/** Stage pixel (1920 × 1080 in the Kingdom tab, D51) → page coordinates. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.stage').boundingBox())!;
  const k = box.width / 1920;
  return { x: box.x + x * k, y: box.y + y * k };
}

// Software rendering (SwiftShader) draws the Anno-style view (D79) at about 0.3 frames a second, so allow 10 minutes.
test.describe.configure({ mode: 'serial', timeout: 600_000 });
// The Kingdom tab is 16:9: test it in a landscape window.
test.use({ viewport: { width: 1920, height: 1080 } });

test('KG-01: the Kingdom tab: select, build, gather, train, LIVE support, council vote, save and load', async ({
  page,
}) => {
  const h = await host();
  try {
    // Gameplay tests use the light preset: software rendering is too slow for every effect
    // (KG-02 checks the default preset and its frame budget).
    await page.goto('/?preset=lite');
    await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.model?.state, null, {
      timeout: 60_000,
    });
    h.send({ kind: 'control', action: 'setMode', mode: 'kingdom' });
    await page.waitForFunction(() => window.__temples.mode === 'kingdom' && window.__temples.kingdom, null, {
      timeout: 90_000,
    });
    await expect(page.locator('.k-year-en')).toContainText('879 CE', { timeout: 30_000 });
    const stageBox = (await page.locator('.stage').boundingBox())!;
    expect(stageBox.width / stageBox.height).toBeCloseTo(16 / 9, 2);
    await expect(page.locator('.k-year-en')).toContainText('Indravarman I');
    // The campaign opens on chapter 1: build Preah Ko (a translucent card tells its story).
    await expect(page.locator('.k-objective')).toContainText('Preah Ko');
    if (await page.locator('#k-card').isVisible()) {
      await expect(page.locator('#k-card')).toContainText('Preah Ko');
      await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
    }
    await expect(page.locator('#k-card')).toBeHidden();
    // The scripted orders below want the villagers where they stand: auto-work off.
    await page.locator('.k-menubar [data-act="auto"]').click();
    await page.waitForFunction(() => !window.__temples.kingdom!.sim.autoWork, null, { polling: 500 });
    // Villagers already sent to work by auto-work stand still for the box selection.
    await page.evaluate(() => {
      for (const u of window.__temples.kingdom!.sim.units.values())
        if (u.team === 0) {
          u.task = { kind: 'idle' };
          u.path = null;
        }
    });

    // Drag a box around the villagers at the royal hall.
    const box = await page.evaluate(() => {
      const k = window.__temples.kingdom!;
      const pts = [...k.sim.units.values()]
        .filter((u) => u.type === 'villager')
        .map((u) => k.view.project(u.x, 1, u.z));
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        x0: Math.min(...xs) - 30,
        y0: Math.min(...ys) - 40,
        x1: Math.max(...xs) + 30,
        y1: Math.max(...ys) + 40,
      };
    });
    const a = await at(page, box.x0, box.y0);
    const b = await at(page, box.x1, box.y1);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 4 });
    // The selection box is drawn exactly under the mouse (it used to drift).
    await page.waitForTimeout(2500);
    const drawn = await page.locator('.k-drag').boundingBox();
    expect(drawn).not.toBeNull();
    expect(Math.abs(drawn!.x - Math.min(a.x, b.x))).toBeLessThan(4);
    expect(Math.abs(drawn!.y - Math.min(a.y, b.y))).toBeLessThan(4);
    expect(Math.abs(drawn!.x + drawn!.width - Math.max(a.x, b.x))).toBeLessThan(4);
    await page.mouse.up();
    await page.waitForFunction(() => window.__temples.kingdom!.selected.size >= 6, null, { timeout: 30_000 });
    await expect(page.locator('.k-sel-name')).toContainText('អ្នកស្រុក', { timeout: 30_000 });

    // Build a stilt house: the button, then a spot on open ground beside the hall.
    const houses0 = await page.evaluate(
      () => [...window.__temples.kingdom!.sim.buildings.values()].filter((x) => x.type === 'house').length,
    );
    await page.locator('.k-btn[data-act="build:house"]').click();
    const spot = await page.evaluate(() => {
      const k = window.__temples.kingdom!;
      const hall = [...k.sim.buildings.values()].find((x) => x.type === 'townCentre')!;
      const [cx, cz] = k.sim.center(hall);
      return k.view.project(cx + 14, 0, cz - 4);
    });
    const s = await at(page, spot.x, spot.y);
    await page.mouse.move(s.x, s.y);
    await page.waitForTimeout(2500);
    await page.mouse.click(s.x, s.y);
    await page.waitForFunction(
      (n) =>
        [...window.__temples.kingdom!.sim.buildings.values()].filter((x) => x.type === 'house').length > n,
      houses0,
      { timeout: 30_000 },
    );

    // Right-click the nearest visible tree with the villagers still selected: they gather wood.
    const tree = await page.evaluate(() => {
      const k = window.__temples.kingdom!;
      const hall = [...k.sim.buildings.values()].find((x) => x.type === 'townCentre')!;
      const [cx, cz] = k.sim.center(hall);
      // The nearest tree (each new game places them at random); make sure it is seen.
      const n = [...k.sim.nodes.values()]
        .filter((x) => x.kind === 'tree')
        .map((x) => ({ x, p: k.sim.nodePos(x) }))
        .sort((p, q) => Math.hypot(p.p[0] - cx, p.p[1] - cz) - Math.hypot(q.p[0] - cx, q.p[1] - cz))[0]!;
      const f = k.sim.fog;
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) f.explored[(n.x.tz + dz) * f.size + n.x.tx + dx] = 1;
      k.sim.fogVersion++;
      k.panTo(n.p[0], n.p[1]);
      return n.x.id;
    });
    await page.waitForTimeout(3000);
    const tp = await page.evaluate((id) => {
      const k = window.__temples.kingdom!;
      const [x, z] = k.sim.nodePos(k.sim.nodes.get(id)!);
      return k.view.project(x, 0, z);
    }, tree);
    const t = await at(page, tp.x, tp.y);
    await page.mouse.click(t.x, t.y, { button: 'right' });
    await page.waitForFunction(
      () =>
        [...window.__temples.kingdom!.sim.units.values()].some(
          (u) => u.task.kind === 'gather' && u.task.res === 'wood',
        ),
      null,
      { timeout: 30_000 },
    );
    await page.screenshot({ path: 'docs/screens/k-play.png' });

    // H selects the royal hall; train a villager from its panel.
    await page.keyboard.press('h');
    await expect(page.locator('.k-btn[data-act="train:villager"]')).toBeVisible({ timeout: 30_000 });
    await page.locator('.k-btn[data-act="train:villager"]').click();
    await page.waitForFunction(
      () =>
        [...window.__temples.kingdom!.sim.buildings.values()].some(
          (x) => x.type === 'townCentre' && x.queue.length > 0,
        ),
      null,
      { timeout: 30_000 },
    );

    // A big gift during the Kingdom tab becomes stone.
    const stone0 = await page.evaluate(() => window.__temples.kingdom!.sim.res[0].stone);
    h.send(event({ type: 'gift', giftName: 'Galaxy', giftCoins: 1000, count: 1, comboEnd: true }, 'giver1'));
    await page.waitForFunction((s0) => window.__temples.kingdom!.sim.res[0].stone > s0, stone0, {
      timeout: 30_000,
    });

    // Council vote: open it now, a viewer types !2.
    await page.evaluate(() => {
      const k = window.__temples.kingdom! as unknown as { council: { nextAt: number; openUntil: number } };
      k.council.nextAt = 0;
      k.council.openUntil = 0;
    });
    await expect(page.locator('#k-council')).toBeVisible({ timeout: 30_000 });
    h.send(event({ type: 'comment', text: '!2' }, 'voter9'));
    await expect(page.locator('#k-council li').nth(1)).toContainText('១', { timeout: 30_000 });

    // Save from the host panel, change the world, load it back.
    h.send({ kind: 'control', action: 'kingdom', op: 'save' });
    await page.waitForFunction(() => !!localStorage.getItem('kingdom.manual'), null, { timeout: 30_000 });
    const saved = await page.evaluate(() => window.__temples.kingdom!.sim.buildings.size);
    await page.evaluate(() => {
      const k = window.__temples.kingdom!;
      const house = [...k.sim.buildings.values()].find((x) => x.type === 'house')!;
      k.sim.cancel(house.id);
    });
    h.send({ kind: 'control', action: 'kingdom', op: 'load' });
    await page.waitForFunction((n) => window.__temples.kingdom!.sim.buildings.size === n, saved, {
      timeout: 30_000,
    });
  } finally {
    h.send({ kind: 'control', action: 'setMode', mode: 'build' });
    h.close();
  }
});

test('KG-02: Kingdom HUD fits the 16:9 stage, command bar at the bottom, text ≥ 26 px, frame budget', async ({
  page,
}) => {
  await page.goto('/?mode=kingdom&offline=1&kingdomDemo=1');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const hall = [...k.sim.buildings.values()].find((x) => x.type === 'townCentre')!;
    k.selected.add([...k.sim.units.values()].find((u) => u.type === 'villager')!.id);
    const [cx, cz] = k.sim.center(hall);
    k.panTo(cx + 12, cz - 6);
    k.zoom(95);
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'docs/screens/k-demo.png' });
  // Everything on screen sits inside the 16:9 stage, and the command bar is at the bottom.
  const bad = await page.evaluate(() => {
    const stage = document.querySelector('.stage')!.getBoundingClientRect();
    const out: string[] = [];
    for (const el of document.querySelectorAll('.k-ui [data-ui]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (
        r.left < stage.left - 1 ||
        r.top < stage.top - 1 ||
        r.right > stage.right + 1 ||
        r.bottom > stage.bottom + 1
      )
        out.push((el.className || el.tagName).toString());
    }
    return out;
  });
  expect(bad).toEqual([]);
  const panel = await page.evaluate(() => {
    const stage = document.querySelector('.stage')!.getBoundingClientRect();
    const r = document.querySelector('.k-panel')!.getBoundingClientRect();
    return (stage.bottom - r.bottom) / (stage.height / 1080);
  });
  expect(panel).toBeLessThan(20);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.k-ui *')]
      .filter(
        (e) => e.childElementCount === 0 && (e.textContent ?? '').trim() && (e as HTMLElement).offsetParent,
      )
      .map((e) => [e.className, parseFloat(getComputedStyle(e).fontSize)] as const)
      .filter(([, px]) => px < 26),
  );
  expect(small).toEqual([]);
  await page.waitForFunction(() => window.__temples.stats.frames > 3);
  const s = await page.evaluate(() => window.__temples.stats);
  console.log(
    `[budget] kingdom: ${s.triangles} triangles, ${s.drawCalls} draw calls; post ${s.postTriangles} / ${s.postCalls}`,
  );
  expect(s.triangles).toBeLessThan(600_000);
  expect(s.drawCalls).toBeLessThan(120);
  // Post-processing (D79) is one more pass over the view for AO plus a few full-screen quads.
  expect(s.postTriangles).toBeLessThan(600_000);
  expect(s.postCalls).toBeLessThan(120);
});

test('KG-03: the campaign: finishing a temple ends its era, unlocks the next temple on its map site, History revisits it', async ({
  page,
}) => {
  await page.goto('/?mode=kingdom&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    k.newGame('easy');
    k.sim.ai.nextRaid = 1e9;
  });
  await expect(page.locator('.k-year-en')).toContainText('879 CE', { timeout: 30_000 });
  // Finish Preah Ko on its site (the long build is skipped) and hold it.
  const site0 = await page.evaluate(() => {
    const s = window.__temples.kingdom!.sim;
    const [x, z] = s.monumentSpot();
    s.addBuilding('monument', 0, x, z, 1, 'preah-ko');
    s.monumentDoneAt = s.time;
    s.update(s.data.rules.victory.monumentHoldSec + 1);
    return [x, z];
  });
  await expect(page.locator('#k-card')).toContainText('Bakong', { timeout: 30_000 });
  await expect(page.locator('.k-year-en')).toContainText('881 CE');
  await expect(page.locator('.k-objective')).toContainText('Bakong');
  const next = await page.evaluate(() => window.__temples.kingdom!.sim.monumentSpot());
  expect(next).not.toEqual(site0);
  // The message boxes are see-through.
  const bg = await page.locator('#k-card').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(Number(bg.match(/[\d.]+(?=\))/)?.[0] ?? 1)).toBeLessThan(0.9);
  await page.screenshot({ path: 'docs/screens/k-chapter.png' });
  await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');

  // History: Preah Ko is built, Bakong is being built, the rest are locked.
  // History and New game live in the menu bar at the top right (PK).
  await page.locator('.k-menubar [data-act="history"]').click();
  await expect(page.locator('.k-tl')).toHaveCount(13);
  await expect(page.locator('.k-tl.done')).toHaveCount(1);
  await expect(page.locator('.k-tl.now')).toContainText('Bakong');
  await expect(page.locator('.k-tl.locked').first()).toBeDisabled();
  await page.screenshot({ path: 'docs/screens/k-history.png' });
  // Visit Preah Ko: the camera flies there and its story is shown.
  await page.locator('.k-tl.done').click();
  await expect(page.locator('#k-card')).toContainText('Preah Ko');
  await page.waitForFunction(
    () => {
      const k = window.__temples.kingdom! as unknown as {
        cam: { x: number; z: number };
        siteCentre: (i: number) => [number, number];
      };
      const [x, z] = k.siteCentre(0);
      return Math.hypot(k.cam.x - x, k.cam.z - z) < 40;
    },
    null,
    { timeout: 60_000 },
  );
  await expect(page.locator('#k-card')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/k-visit.png' });
});

test('KG-04: the empire world: menu bar, 3D button icons, hover hints, idle workers, weather', async ({
  page,
}) => {
  await page.goto('/?mode=kingdom&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('#k-card').isVisible())
    await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
  // The menu bar: idle workers, call workers, army, call army, auto-work, map, History, New
  // game, sound. The weather has no menu entry any more: it is shown in the world (PK).
  for (const act of [
    'idle',
    'call-workers',
    'army',
    'call-army',
    'auto',
    'map',
    'history',
    'new',
    'about',
    'sound',
  ])
    await expect(page.locator(`.k-menubar [data-act="${act}"]`)).toBeVisible();
  await expect(page.locator('.k-menubar .k-weather')).toHaveCount(0);
  // About: the developer's credit (PK).
  await page.locator('.k-menubar [data-act="about"]').click();
  await expect(page.locator('#k-card')).toContainText('Mr. Sopheak Pang', { timeout: 30_000 });
  await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
  // The minimap opens the old map of the empire; Esc closes it.
  await page.locator('.k-minimap').click();
  await expect(page.locator('.am-backdrop')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'docs/screens/k-oldmap.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.am-backdrop')).toBeHidden({ timeout: 30_000 });
  // The command bar hides by itself with nothing selected (PK); its tab cycles
  // auto → always open → folded → auto.
  await page.evaluate(() => window.__temples.kingdom!.selected.clear());
  await expect(page.locator('.k-panel')).toHaveClass(/k-away/, { timeout: 30_000 });
  await page.locator('.k-min').dispatchEvent('pointerdown');
  await expect(page.locator('.k-panel')).not.toHaveClass(/k-away/, { timeout: 30_000 });
  await page.locator('.k-min').dispatchEvent('pointerdown');
  await expect(page.locator('.k-panel')).toHaveClass(/k-folded/, { timeout: 30_000 });
  await page.locator('.k-min').dispatchEvent('pointerdown');
  await expect(page.locator('.k-panel')).toHaveClass(/k-away/, { timeout: 30_000 });
  // The world is the empire (10x the area) and a new game has its own seed.
  const w = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    return { size: k.sim.map.size, animals: k.sim.animals.size, seed: k.sim.seed };
  });
  expect(w.size).toBe(1080);
  expect(w.animals).toBeGreaterThan(100);

  // Select the villagers: the build buttons carry their 3D icon above the label.
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    k.sim.autoWork = false;
    for (const u of k.sim.units.values()) if (u.team === 0 && u.type === 'villager') k.selected.add(u.id);
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.k-btn[data-act="build:riceField"] .k-icon') as HTMLElement | null;
      return !!el && el.style.backgroundImage.includes('data:image/png');
    },
    null,
    { timeout: 90_000, polling: 500 },
  );
  // A button's hint says what it needs.
  await page.locator('.k-btn[data-act="build:barracks"]').hover();
  await expect(page.locator('.k-tip')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.k-tip')).toContainText('ជំរំទាហាន');
  await page.screenshot({ path: 'docs/screens/k-icons.png' });

  // Hover a tree in the world: its hint shows how much wood it holds.
  const tp = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const hall = [...k.sim.buildings.values()].find((x) => x.type === 'townCentre')!;
    const [cx, cz] = k.sim.center(hall);
    // The nearest tree to the hall (each new game places them at random); make sure it is seen.
    const n = [...k.sim.nodes.values()]
      .filter((x) => x.kind === 'tree')
      .map((x) => ({ x, p: k.sim.nodePos(x) }))
      .sort((p, q) => Math.hypot(p.p[0] - cx, p.p[1] - cz) - Math.hypot(q.p[0] - cx, q.p[1] - cz))[0]!;
    const f = k.sim.fog;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) f.explored[(n.x.tz + dz) * f.size + n.x.tx + dx] = 1;
    k.sim.fogVersion++;
    k.panTo(n.p[0], n.p[1]);
    return n.p;
  });
  await page.waitForTimeout(3000);
  const q = await page.evaluate(([x, z]) => window.__temples.kingdom!.view.project(x!, 1.5, z!), tp);
  const m = await at(page, q.x, q.y);
  await page.mouse.move(m.x, m.y);
  await page.mouse.move(m.x + 2, m.y + 1);
  await expect(page.locator('.k-tip')).toContainText('wood', { timeout: 30_000 });
  await page.screenshot({ path: 'docs/screens/k-hover.png' });

  // Idle workers: the button selects one and says how many there are.
  await page.evaluate(() => {
    for (const u of window.__temples.kingdom!.sim.units.values()) if (u.team === 0) u.task = { kind: 'idle' };
  });
  await expect(page.locator('.k-menubar [data-act="idle"]')).not.toContainText('Idle 0', { timeout: 30_000 });
  await page.locator('.k-menubar [data-act="idle"]').click();
  await page.waitForFunction(() => window.__temples.kingdom!.selected.size === 1, null, { polling: 500 });

  // Hay Day-style orders (PK): the Orders button opens the board; a buyer is paid in gold.
  await page.evaluate(() => {
    const s = window.__temples.kingdom!.sim;
    for (const o of s.market.orders) o.readyAt = 0;
    Object.assign(s.res[0], { food: 9999, wood: 9999, stone: 9999 });
  });
  await page.locator('.k-yearbar [data-act="orders"]').click();
  await expect(page.locator('.k-orders')).toBeVisible({ timeout: 30_000 });
  const gold0 = await page.evaluate(() => window.__temples.kingdom!.sim.res[0].gold);
  // The board redraws its clocks every second, so press the button directly.
  await page
    .locator('.k-orders [data-act^="order-deliver"]:not([disabled])')
    .first()
    .dispatchEvent('pointerdown');
  await page.waitForFunction((g) => window.__temples.kingdom!.sim.res[0].gold > g, gold0, { polling: 500 });
  await page.screenshot({ path: 'docs/screens/k-orders.png' });
  await page.locator('.k-orders [data-act="orders"]').dispatchEvent('pointerdown');
  // A full basket over a house: clicking it takes the food.
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const h = [...k.sim.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
    h.basketAt = k.sim.time; // full now (an older one would be taken in by itself)
    const [x, z] = k.sim.center(h);
    k.panTo(x, z);
  });
  const food0 = await page.evaluate(() => window.__temples.kingdom!.sim.res[0].food);
  // The basket bobs (never "stable" for a click), so send the press straight to it.
  await page.locator('.k-bubble').first().dispatchEvent('pointerdown', {}, { timeout: 60_000 });
  await page.waitForFunction((f) => window.__temples.kingdom!.sim.res[0].food > f, food0, { polling: 500 });

  // PK: a see-through circle menu round a clicked building (Hay Day): it trains from there.
  const q0 = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const h = [...k.sim.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
    k.selected.clear();
    k.selected.add(h.id);
    Object.assign(k.sim.res[0], { food: 9999, wood: 9999, stone: 9999, gold: 9999 });
    return h.queue.length;
  });
  await expect(page.locator('.k-radial .k-rb').first()).toBeVisible({ timeout: 60_000 });
  // PK 1.6.0: no hover hint on a button that can be pressed; a greyed one says what it lacks.
  expect(await page.locator('.k-radial .k-rb:not(.k-rb-off)[data-tip]').count()).toBe(0);
  expect(await page.locator('.k-radial .k-rb.k-rb-off:not([data-tip])').count()).toBe(0);
  await page.screenshot({ path: 'docs/screens/k-radial.png' });
  await page.locator('.k-radial [data-act^="train:"]').first().dispatchEvent('pointerdown');
  await page.waitForFunction(
    (n) => {
      const k = window.__temples.kingdom!;
      const h = [...k.sim.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
      return h.queue.length > n;
    },
    q0,
    { polling: 500 },
  );
  await page.evaluate(() => window.__temples.kingdom!.selected.clear());

  // PK: the king — his name on hover, his orders on click (the decree to build the temple).
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const h = [...k.sim.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
    const [x, z] = k.sim.center(h);
    k.panTo(x, z + 8);
  });
  await page.waitForTimeout(3000);
  const kp = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const h = [...k.sim.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
    const [x, z] = k.sim.center(h);
    return k.view.project(x, 1.4, z + 7.6);
  });
  const km2 = await at(page, kp.x, kp.y);
  await page.mouse.move(km2.x, km2.y);
  await page.mouse.move(km2.x + 1, km2.y + 1);
  await expect(page.locator('.k-tip')).toContainText('King', { timeout: 30_000 });
  await page.evaluate(([x, y]) => window.__temples.kingdom!.clickSelect(x!, y!), [kp.x, kp.y]);
  await page
    .locator('.k-radial [data-act="decree:temple"]')
    .dispatchEvent('pointerdown', {}, { timeout: 60_000 });
  await page.waitForFunction(() => window.__temples.kingdom!.sim.decree === 'temple', null, { polling: 500 });
  await page.screenshot({ path: 'docs/screens/k-king.png' });
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    k.sim.setDecree(false);
    k.selected.clear();
  });

  // Weather is seen in the world: a storm brings rain and wind (leaves blow).
  await page.evaluate(() => {
    window.__temples.kingdom!.sim.weather.id = 'storm';
  });
  await page.waitForFunction(
    () => {
      const fx = window.__temples.kingdom!.view.weatherFx;
      return fx.rain > 0.5 && fx.wind > 0.4;
    },
    null,
    { timeout: 60_000, polling: 500 },
  );
  await page.screenshot({ path: 'docs/screens/k-storm.png' });
  const s = await page.evaluate(() => window.__temples.stats);
  console.log(`[budget] kingdom world: ${s.triangles} triangles, ${s.drawCalls} draw calls`);
  expect(s.triangles).toBeLessThan(600_000);
  expect(s.drawCalls).toBeLessThan(120);
});

test('KG-05: Anachak Khmer: the king calls villagers to arms, his overview, the royal roads, the 3D hero mode', async ({
  page,
}) => {
  await page.goto('/?mode=anachak&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.anachak, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('.k-anachak #k-card').isVisible())
    await page.locator('.k-anachak #k-card .k-card-x').dispatchEvent('pointerdown');
  const ui = page.locator('.k-anachak');
  // Its own world: the royal roads, their bridges and rest houses.
  const roads = await page.evaluate(() => {
    const k = window.__temples.anachak!;
    k.sim.addResources({ food: 3000, wood: 3000, stone: 3000, gold: 3000 });
    k.sim.autoWork = false;
    return {
      variant: k.sim.variant,
      routes: k.sim.map.roads?.routes.length,
      rests: k.sim.map.roads?.rests.length,
    };
  });
  expect(roads).toEqual({ variant: 'anachak', routes: 5, rests: expect.any(Number) });
  // The king's menu: call to arms, to battle, his book, play him in 3D.
  await page.evaluate(() => window.__temples.anachak!.selected.add(-1));
  for (const act of ['decree:temple', 'king:levy', 'battle', 'overview', 'hero:king'])
    await expect(ui.locator(`#k-panel [data-act="${act}"]`)).toBeVisible({ timeout: 30_000 });
  await ui.locator('#k-panel [data-act="overview"]').dispatchEvent('pointerdown');
  await expect(ui.locator('#k-card')).toContainText("The king's overview", { timeout: 30_000 });
  await expect(ui.locator('#k-card')).toContainText('Resources');
  await expect(ui.locator('#k-card')).toContainText('Soldiers');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/screens/k-anachak-overview.png' });
  await ui.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
  // The levy: five spearmen at their price.
  await ui.locator('#k-panel [data-act="king:levy"]').dispatchEvent('pointerdown');
  await expect(ui.locator('#k-panel [data-act="levy:spearman"]')).toBeVisible({ timeout: 30_000 });
  const before = await page.evaluate(() => {
    const k = window.__temples.anachak!;
    return {
      food: k.sim.res[0].food,
      n: [...k.sim.units.values()].filter((u) => u.type === 'spearman').length,
    };
  });
  await ui.locator('#k-panel [data-act="levy:spearman"]').dispatchEvent('pointerdown');
  await page.waitForFunction(
    (n) => [...window.__temples.anachak!.sim.units.values()].filter((u) => u.type === 'spearman').length > n,
    before.n,
    { timeout: 60_000 },
  );
  const after = await page.evaluate(() => window.__temples.anachak!.sim.res[0].food);
  expect(before.food - after).toBeGreaterThanOrEqual(45);
  await page.screenshot({ path: 'docs/screens/k-anachak-levy.png' });
  await ui.locator('#k-panel [data-act="king:main"]').dispatchEvent('pointerdown');
  // The 3D hero mode: play a villager, walk, strike, come back with Esc.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    k.selected.clear();
    const v = [...k.sim.units.values()].find((u) => u.team === 0 && u.type === 'villager')!;
    k.selected.add(v.id);
  });
  await ui.locator('#k-panel [data-act^="hero:"]').first().dispatchEvent('pointerdown');
  await expect(ui.locator('.k-hero')).toBeVisible({ timeout: 30_000 });
  await expect(ui.locator('.k-hero-exit')).toBeVisible({ timeout: 60_000 });
  const start = await page.evaluate(() => {
    const h = window.__temples.anachak!.hero!;
    h.core!.camYaw = h.core!.heading + Math.PI;
    return [h.core!.x, h.core!.z];
  });
  await page.keyboard.down('w');
  await page.waitForFunction(
    ([x, z]) => {
      const c = window.__temples.anachak!.hero!.core!;
      return Math.hypot(c.x - x!, c.z - z!) > 1.5;
    },
    start,
    { timeout: 120_000, polling: 500 },
  );
  await page.keyboard.up('w');
  await page.keyboard.press('j');
  // A three-quarter view from the front for the screenshot.
  await page.evaluate(() => {
    const c = window.__temples.anachak!.hero!.core!;
    c.camYaw = c.heading + 0.7;
    c.camDist = 4.2;
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'docs/screens/k-hero.png' });
  const mode = await page.evaluate(() => {
    const k = window.__temples.anachak!;
    return { fov: k.view.camera.fov, manual: k.sim.units.get(k.hero!.unitId!)?.manual };
  });
  expect(mode).toEqual({ fov: 55, manual: true });
  await page.keyboard.press('Escape');
  await expect(ui.locator('.k-hero')).toBeHidden({ timeout: 60_000 });
  expect(await page.evaluate(() => window.__temples.anachak!.hero!.active)).toBe(false);
  // The king himself, with the sacred sword.
  await page.evaluate(() => window.__temples.anachak!.act('hero:king'));
  await expect(ui.locator('.k-hero-card')).toContainText('King', { timeout: 60_000 });
  await page.evaluate(() => {
    const c = window.__temples.anachak!.hero!.core!;
    c.z += 6;
    c.camYaw = c.heading + 0.5;
    c.camDist = 4.2;
  });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'docs/screens/k-hero-king.png' });
  await ui.locator('.k-hero-exit').dispatchEvent('pointerdown');
  await expect(ui.locator('.k-hero')).toBeHidden({ timeout: 60_000 });
});

test('KG-06: Anachak danger call: fly to the person in danger, watch in 3D, take control; night fires', async ({
  page,
}) => {
  await page.goto('/?mode=anachak&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.anachak, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('.k-anachak #k-card').isVisible())
    await page.locator('.k-anachak #k-card .k-card-x').dispatchEvent('pointerdown');
  const ui = page.locator('.k-anachak');
  // A tiger right beside a villager: the alarm, and the call to the player.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    k.sim.ai.nextRaid = 1e9;
    // The choice waits longer here: the software renderer draws about a frame a second.
    k.sim.data.anachak.danger.askSec = 600;
    const v = [...k.sim.units.values()].find((u) => u.team === 0 && u.type === 'villager')!;
    const kind = k.sim.data.world.animals.kinds.find((a) => a.id === 'tiger')!;
    k.sim.animals.set(990777, {
      id: 990777,
      kind: 'tiger',
      x: v.x + 2,
      z: v.z,
      hp: kind.hp * 20,
      heading: 0,
      home: [v.x, v.z],
      target: null,
      fleeUntil: 0,
      fleeFrom: null,
      ready: 1e9,
      moving: false,
    });
  });
  await expect(ui.locator('.k-danger')).toBeVisible({ timeout: 60_000 });
  await expect(ui.locator('.k-danger')).toContainText('tiger');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'docs/screens/k-danger.png' });
  // Watch in 3D: the AI keeps the unit, the camera follows.
  const called = await page.evaluate(() => window.__temples.anachak!.dangerFor);
  // A real click (not a synthetic event): the HUD layer must not swallow it (PK, 1.6.0).
  const watchBtn = ui.locator('[data-act="danger:watch"]');
  const hit = await watchBtn.evaluate((b) => {
    const r = b.getBoundingClientRect();
    return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  expect(hit).toBe(true);
  await watchBtn.dispatchEvent('pointerdown');
  await expect(ui.locator('.k-hero-take')).toBeVisible({ timeout: 60_000 });
  const watching = await page.evaluate((id) => {
    const k = window.__temples.anachak!;
    return { watching: k.hero!.watching, manual: !!k.sim.units.get(id!)?.manual, unit: k.hero!.unitId };
  }, called);
  expect(watching).toEqual({ watching: true, manual: false, unit: called });
  expect(called).not.toBeNull();
  // Night falls: the rest houses' fires glow.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    const N = k.sim.data.anachak.night;
    k.sim.time = N.daySec * ((N.dusk[1] + N.dawn[0]) / 2);
  });
  await page.waitForFunction(() => window.__temples.anachak!.view.night > 0.95, null, {
    timeout: 60_000,
    polling: 500,
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'docs/screens/k-watch-night.png' });
  // E takes control.
  await page.keyboard.press('e');
  await page.waitForFunction(() => !window.__temples.anachak!.hero!.watching, null, { timeout: 60_000 });
  const played = await page.evaluate((id) => !!window.__temples.anachak!.sim.units.get(id!)?.manual, called);
  expect(played).toBe(true);
  await page.keyboard.press('Escape');
  await expect(ui.locator('.k-hero')).toBeHidden({ timeout: 60_000 });
});

test('KG-07: Anachak market: villagers can build it; a finished market trades one good for another', async ({
  page,
}) => {
  await page.goto('/?mode=anachak&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.anachak, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('.k-anachak #k-card').isVisible())
    await page.locator('.k-anachak #k-card .k-card-x').dispatchEvent('pointerdown');
  const ui = page.locator('.k-anachak');
  // A villager's build list offers the market.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    k.sim.ai.nextRaid = 1e9;
    k.sim.addResources({ food: 2000, wood: 2000, stone: 2000, gold: 2000 });
    const v = [...k.sim.units.values()].find((u) => u.team === 0 && u.type === 'villager')!;
    k.selected.clear();
    k.selected.add(v.id);
  });
  await expect(ui.locator('#k-panel [data-act="build:market"]')).toBeVisible({ timeout: 60_000 });
  // A finished market beside the hall, selected: give food, get wood.
  const before = await page.evaluate(() => {
    const k = window.__temples.anachak!;
    const s = k.sim;
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre' && b.team === 0)!;
    const place = (type: string) => {
      for (let r = 8; r < 40; r += 2)
        for (const [dx, dz] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
        ])
          if (!s.canPlace(type, hall.tx + dx, hall.tz + dz))
            return s.addBuilding(type, 0, hall.tx + dx, hall.tz + dz, 1);
      return null;
    };
    // The market needs a storehouse first (D105).
    if (![...s.buildings.values()].some((b) => b.type === 'storehouse' && b.team === 0)) place('storehouse');
    const m = place('market');
    k.selected.clear();
    k.selected.add(m!.id);
    return { food: s.res[0].food, wood: s.res[0].wood };
  });
  await expect(ui.locator('#k-panel [data-act="trade:wood"]')).toBeVisible({ timeout: 60_000 });
  await ui.locator('#k-panel [data-act="trade:wood"]').dispatchEvent('pointerdown');
  await page.waitForFunction((f) => window.__temples.anachak!.sim.res[0].food < f, before.food, {
    timeout: 60_000,
  });
  const after = await page.evaluate(() => {
    const s = window.__temples.anachak!.sim;
    return { food: s.res[0].food, wood: s.res[0].wood };
  });
  expect(after.wood).toBeGreaterThan(before.wood);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'docs/screens/k-market-trade.png' });
});

test('KG-08: PK 1.6.0: move a house to a new spot; the historical temple has no Move', async ({ page }) => {
  await page.goto('/?mode=kingdom&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('#k-card').isVisible())
    await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
  // A finished house near the start, selected; the camera looks at open ground beside it.
  const house = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const s = k.sim;
    s.ai.nextRaid = 1e9;
    const [sx, sz] = s.map.start;
    let at: [number, number] | null = null;
    for (let r = 6; r < 40 && !at; r++)
      for (let d = -r; d <= r && !at; d++)
        if (s.canPlace('house', sx + r, sz + d) === null && s.canPlace('house', sx + r + 8, sz + d) === null)
          at = [sx + r, sz + d];
    const b = s.addBuilding('house', 0, at![0], at![1], 1);
    k.selected.clear();
    k.selected.add(b.id);
    const [x, z] = s.center(b);
    k.panTo(x + 8 * s.map.tile, z);
    return { id: b.id, tx: b.tx, tz: b.tz };
  });
  await expect(page.locator('.k-radial [data-act="move"]')).toBeVisible({ timeout: 60_000 });
  await page.locator('.k-radial [data-act="move"]').dispatchEvent('pointerdown');
  // Click the middle of the view: the house goes there.
  const box = (await page.locator('canvas').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    (h) => {
      const b = window.__temples.kingdom!.sim.buildings.get(h.id)!;
      return b.tx !== h.tx || b.tz !== h.tz;
    },
    house,
    { timeout: 60_000, polling: 500 },
  );
  const after = await page.evaluate((id) => {
    const s = window.__temples.kingdom!.sim;
    const b = s.buildings.get(id)!;
    return { tx: b.tx, open: s.grid.ok(b.tx - 8, b.tz) };
  }, house.id);
  expect(after.tx).toBeGreaterThan(house.tx + 4);
  // The temple on its historical site cannot be moved.
  const templeMovable = await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const s = k.sim;
    const [mx, mz] = s.monumentSpot();
    const t = s.addBuilding('monument', 0, mx, mz, 0.3, s.chapterData.temple);
    return s.movable(t.id);
  });
  expect(templeMovable).toBe(false);
});
