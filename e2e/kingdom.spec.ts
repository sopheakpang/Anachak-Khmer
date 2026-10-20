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
    // PK 2026-10-20 (D160): the vote no longer pops up; it is in the ព្រះរាជបញ្ជា inbox, whose
    // year-bar button glows while it is open.
    await expect(page.locator('.k-yb-inbox.k-yb-live')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#k-council')).toBeHidden();
    await page.locator('.k-yb-inbox').dispatchEvent('pointerdown');
    await expect(page.locator('#k-inbox .k-ib-vote')).toBeVisible({ timeout: 30_000 });
    h.send(event({ type: 'comment', text: '!2' }, 'voter9'));
    await expect(page.locator('#k-inbox .k-ib-vote li').nth(1)).toContainText('១', { timeout: 30_000 });
    // The gift above is in the inbox as news, not a pop-up.
    await expect(page.locator('#k-inbox .k-ib-list')).toContainText('giver1', { timeout: 30_000 });
    await expect(page.locator('#k-toasts li')).toHaveCount(0);
    await page.screenshot({ path: 'docs/screens/k-inbox.png' });
    await page.locator('#k-inbox h3 button').dispatchEvent('pointerdown');
    await expect(page.locator('#k-inbox')).toBeHidden();

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
  // PK 1.8.0: measure with PK's tree models in (they load in the background).
  await page.waitForFunction(
    () => {
      const m = window.__temples.kingdom!.view.models;
      return !m || m.loaded === m.kinds.size;
    },
    null,
    { timeout: 240_000, polling: 1000 },
  );
  await page.waitForTimeout(3000);
  const f0 = await page.evaluate(() => window.__temples.stats.frames);
  await page.waitForFunction((f) => window.__temples.stats.frames > f + 3, f0, { timeout: 120_000 });
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
  // PK 2026-10-20 (D160): the next chapter's card waits in the ព្រះរាជបញ្ជា inbox; open it there.
  await expect(page.locator('.k-yb-inbox')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#k-card')).toBeHidden();
  await page.locator('.k-yb-inbox').dispatchEvent('pointerdown');
  await expect(page.locator('#k-inbox .k-ib-card').first()).toContainText('Bakong', { timeout: 30_000 });
  await page.locator('#k-inbox .k-ib-card button').first().dispatchEvent('pointerdown');
  await expect(page.locator('#k-card')).toContainText('Bakong', { timeout: 30_000 });
  await page.locator('.k-yb-inbox').dispatchEvent('pointerdown');
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
  // The levy: no one can be called up before the kingdom has a barracks (PK 1.9.0, D148).
  await ui.locator('#k-panel [data-act="king:levy"]').dispatchEvent('pointerdown');
  await expect(ui.locator('#k-panel [data-act="levy:spearman"]')).toBeVisible({ timeout: 30_000 });
  await expect(ui.locator('#k-panel [data-act="levy:spearman"]')).toBeDisabled();
  await page.evaluate(() => {
    const s = window.__temples.anachak!.sim;
    const h = [...s.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
    s.addBuilding('barracks', 0, h.tx + 9, h.tz, 1);
  });
  // Five spearmen at their price.
  await ui.locator('#k-panel [data-act="king:main"]').dispatchEvent('pointerdown');
  await ui.locator('#k-panel [data-act="king:levy"]').dispatchEvent('pointerdown');
  await expect(ui.locator('#k-panel [data-act="levy:spearman"]')).toBeEnabled({ timeout: 30_000 });
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
  // PK 1.9.0 (D146): A turns him to the camera's left and he walks that way; the camera stays put.
  const side = await page.evaluate(() => {
    const c = window.__temples.anachak!.hero!.core!;
    return { x: c.x, z: c.z, yaw: c.camYaw, heading: c.heading };
  });
  await page.keyboard.down('a');
  await page.waitForFunction(
    (s) => {
      const c = window.__temples.anachak!.hero!.core!;
      return Math.hypot(c.x - s.x, c.z - s.z) > 1;
    },
    side,
    { timeout: 120_000, polling: 500 },
  );
  const strafe = await page.evaluate(() => {
    const c = window.__temples.anachak!.hero!.core!;
    return { yaw: c.camYaw, heading: c.heading, mode: c.moveMode };
  });
  await page.keyboard.up('a');
  const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  expect(strafe.mode).toBe('side');
  expect(turn(strafe.yaw, side.yaw)).toBeLessThan(0.05);
  expect(turn(strafe.heading, side.yaw + Math.PI + Math.PI / 2)).toBeLessThan(0.3);
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

test('KG-09: PK 1.8.0: the keyboard panel: pick a key for an action, it works, Reset brings the defaults', async ({
  page,
}) => {
  await page.goto('/?mode=kingdom&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('#k-card').isVisible())
    await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    k.sim.ai.nextRaid = 1e9;
    k.keymap.reset();
    k.selected.clear();
  });
  // The 🎮 button on the year bar opens the panel; Khmer first, every map action listed.
  await page.locator('.k-yearbar [data-act="keys"]').dispatchEvent('pointerdown');
  await expect(page.locator('#k-keys')).toBeVisible();
  await expect(page.locator('#k-keys h3')).toContainText('ក្តារចុច');
  const size = await page
    .locator('#k-keys .k-keyname')
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeGreaterThanOrEqual(26);
  // "The royal hall" gets G: click its first key, press G.
  await page.locator('#k-keys [data-act="keys-set:map:hall:0"]').dispatchEvent('pointerdown');
  await expect(page.locator('#k-keys [data-act="keys-set:map:hall:0"]')).toHaveText('…');
  await page.keyboard.press('g');
  await expect(page.locator('#k-keys [data-act="keys-set:map:hall:0"]')).toHaveText('G');
  await page.locator('#k-keys [data-act="keys-close"]').dispatchEvent('pointerdown');
  await expect(page.locator('#k-keys')).toBeHidden();
  // G now selects the hall; H does nothing any more.
  const hallBy = async (key: string) => {
    await page.evaluate(() => window.__temples.kingdom!.selected.clear());
    await page.keyboard.press(key);
    return page.evaluate(() => {
      const k = window.__temples.kingdom!;
      return [...k.selected].some((id) => k.sim.buildings.get(id)?.type === 'townCentre');
    });
  };
  expect(await hallBy('h')).toBe(false);
  expect(await hallBy('g')).toBe(true);
  // Kept in the browser; Reset brings H back.
  expect(await page.evaluate(() => localStorage.getItem('temples.keys.v1'))).toContain('KeyG');
  await page.locator('.k-yearbar [data-act="keys"]').dispatchEvent('pointerdown');
  await page.locator('#k-keys [data-act="keys-reset"]').dispatchEvent('pointerdown');
  expect(await hallBy('h')).toBe(true);
});

test('KG-10: 1.8.0 optimisation: New Game frees the old world (graphics memory stays level)', async ({
  page,
}) => {
  await page.goto('/?mode=kingdom&offline=1');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('#k-card').isVisible())
    await page.locator('#k-card .k-card-x').dispatchEvent('pointerdown');
  const memory = () =>
    page.evaluate(() => {
      const k = window.__temples.kingdom! as unknown as {
        renderer: { info: { memory: { geometries: number; textures: number } } };
      };
      return { ...k.renderer.info.memory };
    });
  const fresh = async () => {
    await page.evaluate(() => window.__temples.kingdom!.newGame('normal'));
    // Measure once the new world's models and pictures are in (they load in the background).
    await page.waitForFunction(
      () => {
        const v = window.__temples.kingdom!.view as unknown as {
          models: { loaded: number; kinds: Map<string, unknown> } | null;
        };
        return !v.models || v.models.loaded >= v.models.kinds.size;
      },
      null,
      { timeout: 120_000, polling: 500 },
    );
    await page.waitForTimeout(4000);
    return memory();
  };
  const first = await fresh();
  const second = await fresh();
  const third = await fresh();
  // Before 1.8.0 every New Game kept the old world: about +110 geometries and +25 textures.
  for (const m of [second, third]) {
    expect(m.geometries).toBeLessThanOrEqual(first.geometries + 10);
    expect(m.textures).toBeLessThanOrEqual(first.textures + 3);
  }
});

test('KG-11: PK 1.9.0 (D147): Preah Ko built in play shows whole the moment it is finished', async ({
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
    const s = k.sim;
    const [x, z] = s.monumentSpot();
    s.addBuilding('monument', 0, x, z, 0.2, 'preah-ko');
  });
  type T = { filled: number; kit: { slots: unknown[] }; group: { visible: boolean } };
  const temple = () =>
    page.evaluate(() => {
      const t = (window.__temples.kingdom!.view as unknown as { temple: T }).temple;
      return { filled: t.filled, total: t.kit.slots.length, visible: t.group.visible };
    });
  // The build rises a little at a time, as in play.
  for (const p of [0.21, 0.22, 0.5, 0.51, 0.99]) {
    await page.evaluate((p) => {
      for (const b of window.__temples.kingdom!.sim.buildings.values())
        if (b.type === 'monument') b.progress = p;
    }, p);
    await page.waitForTimeout(400);
  }
  const mid = await temple();
  expect(mid.visible).toBe(true);
  expect(mid.filled).toBeGreaterThan(mid.total * 0.9);
  await page.evaluate(() => {
    for (const b of window.__temples.kingdom!.sim.buildings.values())
      if (b.type === 'monument') b.progress = 1;
  });
  await page.waitForFunction(
    () => {
      const t = (window.__temples.kingdom!.view as unknown as { temple: T }).temple;
      return t.filled === t.kit.slots.length;
    },
    null,
    { timeout: 5_000, polling: 100 },
  );
});

test('KG-12: PK 1.9.0 Sprint 1: danger rings and the edge arrow, the 🤖 auto hero, the MOBA keys', async ({
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
  // Play a villager; a tiger waits 30 m ahead of him.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    k.sim.autoWork = false;
    k.sim.ai.nextRaid = 1e9;
    k.selected.clear();
    const v = [...k.sim.units.values()].find((u) => u.team === 0 && u.type === 'villager')!;
    k.selected.add(v.id);
  });
  await ui.locator('#k-panel [data-act^="hero:"]').first().dispatchEvent('pointerdown');
  await expect(ui.locator('.k-hero-exit')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    const c = k.hero!.core!;
    c.camYaw = c.heading + Math.PI;
    const tiger = [...k.sim.animals.values()].find((a) => k.sim.kindOf(a).behaviour === 'predator')!;
    tiger.x = c.x + Math.sin(c.heading) * 30;
    tiger.z = c.z + Math.cos(c.heading) * 30;
    tiger.home = [tiger.x, tiger.z];
    k.sim.fog.explored.fill(1);
  });
  // The ring on the ground and the arrow at the top of the screen (he faces it).
  await expect(ui.locator('.k-danger-arrow')).toBeVisible({ timeout: 30_000 });
  const ring = await page.evaluate(() => {
    const g = window.__temples.anachak!.view.dangerRings.group;
    return { visible: g.visible, n: (g.children[0] as unknown as { count: number }).count };
  });
  expect(ring.visible).toBe(true);
  expect(ring.n).toBeGreaterThan(0);
  const top = await ui.locator('.k-danger-arrow').evaluate((e) => parseFloat((e as HTMLElement).style.top));
  expect(top).toBeLessThan(330);
  expect(top).toBeGreaterThan(160);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/screens/k-hero-danger.png' });
  // X hides them, X again shows them.
  await page.keyboard.press('x');
  await expect(ui.locator('.k-danger-arrow')).toBeHidden({ timeout: 10_000 });
  expect(await page.evaluate(() => window.__temples.anachak!.view.dangerRings.group.visible)).toBe(false);
  await page.keyboard.press('x');
  await expect(ui.locator('.k-danger-arrow')).toBeVisible({ timeout: 10_000 });
  // 🤖: the tiger out of the way, he goes to work by himself; a move key takes control back.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    for (const a of [...k.sim.animals.values()]) if (k.sim.dangerous(a)) k.sim.animals.delete(a.id);
  });
  const at = await page.evaluate(() => [
    window.__temples.anachak!.hero!.core!.x,
    window.__temples.anachak!.hero!.core!.z,
  ]);
  await page.keyboard.press('t');
  await expect(ui.locator('.k-hb-auto.on')).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(
    ([x, z]) => {
      const h = window.__temples.anachak!.hero!;
      const c = h.core!;
      return h.autoNow === 'work' || c.state === 'work' || Math.hypot(c.x - x!, c.z - z!) > 2;
    },
    at,
    { timeout: 60_000, polling: 250 },
  );
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.__temples.anachak!.hero!.auto)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(ui.locator('.k-hero')).toBeHidden({ timeout: 60_000 });
  // 🎮 → Hero → MOBA: arrows walk, Q is the skill.
  await page.evaluate(() => {
    const k = window.__temples.anachak! as unknown as {
      keymap: { applyScheme(id: string): boolean; scheme: string };
    };
    k.keymap.applyScheme('moba');
  });
  expect(
    await page.evaluate(
      () => (window.__temples.anachak! as unknown as { keymap: { scheme: string } }).keymap.scheme,
    ),
  ).toBe('moba');
  await page.evaluate(() => {
    const k = window.__temples.anachak! as unknown as { keymap: { reset(): void } };
    k.keymap.reset();
  });
});

test('KG-13: PK 1.9.0 (D146 ខ១ ខ៣, D149): PC 1660 preset — Meshy buildings, the Meshy heroes, the 🖥 panel', async ({
  page,
}) => {
  // The software renderer here cannot draw 4096 shadows under the 21 m trees in time, and a frame
  // of the PC look takes about a second in it (D154).
  test.setTimeout(1_200_000);
  await page.goto('/?mode=kingdom&offline=1&kingdomDemo=1&preset=pc1660&shadowMap=2048');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.kingdom, null, {
    timeout: 180_000,
    polling: 500,
  });
  expect(await page.evaluate(() => window.__temples.preset)).toBe('pc1660');
  // The Meshy buildings load in the background and replace the built-in shapes.
  await page.waitForFunction(
    () => {
      const v = window.__temples.kingdom!.view as unknown as { propsOn: number };
      return v.propsOn >= 4;
    },
    null,
    { timeout: 240_000, polling: 1000 },
  );
  await page.evaluate(() => {
    const k = window.__temples.kingdom!;
    const b =
      [...k.sim.buildings.values()].find((x) => x.type === 'storehouse' || x.type === 'barracks') ??
      [...k.sim.buildings.values()].find((x) => x.type === 'townCentre')!;
    const [cx, cz] = k.sim.center(b);
    k.panTo(cx, cz);
    k.zoom(45);
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'docs/screens/k-pc1660.png' });
  // The 🖥 panel shows the frame rate and the presets.
  await page.locator('.k-yearbar [data-act="gfx"]').dispatchEvent('pointerdown');
  await expect(page.locator('.k-gfx-fps')).toContainText('FPS', { timeout: 10_000 });
  await expect(page.locator('[data-act="gfx-set:pc1660"].k-on')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/k-gfx-panel.png' });
});

test('KG-14: PK 1.9.0 (D146 ខ៥, D150): the king’s four skills, the great one under a yantra canopy', async ({
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
  await page.evaluate(() => window.__temples.anachak!.act('hero:king'));
  await expect(ui.locator('.k-hero-card')).toContainText('King', { timeout: 60_000 });
  // Four skill buttons: the first, two more, the great one.
  for (const b of ['skill', 'skill2', 'skill3', 'skill4'])
    await expect(ui.locator(`.k-hb-${b}`)).toBeVisible();
  // PK 2026-10-20 (D156): on the PC they are one bar along the bottom, each with its key.
  await expect(ui.locator('.k-hero-hotbar')).toBeVisible();
  for (const b of ['attack', 'skill', 'skill2', 'skill3', 'skill4', 'dash', 'jump', 'work', 'auto'])
    await expect(ui.locator(`.k-hero-hotbar .k-hb-${b} .k-hb-k`)).not.toBeEmpty();
  const bar = (await ui.locator('.k-hero-hotbar').boundingBox())!;
  const stage = (await ui.boundingBox())!;
  expect(bar.y + bar.height).toBeGreaterThan(stage.y + stage.height * 0.9);
  // PK 2026-10-20 (D160): half the size it was (≈ 1 300 px wide at full size).
  expect(bar.width).toBeLessThan(stage.width * 0.4);
  expect(bar.height).toBeLessThan(stage.height * 0.1);
  await page.evaluate(() => {
    const h = window.__temples.anachak!.hero!;
    const c = h.core!;
    c.camYaw = c.heading + 0.6;
    c.camDist = 7;
    // D157: while a Royal Order question is open, 1–4 answer it; the skills are tested here.
    (h as unknown as { order: unknown }).order = null;
  });
  await page.keyboard.press('Digit3');
  await page.waitForFunction(() => window.__temples.anachak!.hero!.core!.skillSlot === 3, null, {
    timeout: 10_000,
  });
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'docs/screens/k-hero-ultimate.png' });
  await expect(ui.locator('.k-hb-skill4 .k-hb-cd')).toBeVisible({ timeout: 5_000 });
  const left = await page.evaluate(() => window.__temples.anachak!.hero!.core!.skillLeft(3));
  expect(left).toBeGreaterThan(30);
  await page.keyboard.press('Escape');
});

test('KG-15: PK 1.9.0 (D151): every hero’s great skill plays its yantra effects', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?mode=anachak&offline=1&preset=lite');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.anachak, null, {
    timeout: 180_000,
    polling: 500,
  });
  if (await page.locator('.k-anachak #k-card').isVisible())
    await page.locator('.k-anachak #k-card .k-card-x').dispatchEvent('pointerdown');
  const ui = page.locator('.k-anachak');
  for (const type of ['king', 'swordsman', 'spearman', 'archer', 'horseman', 'warElephant', 'watchman']) {
    await page.evaluate((type) => {
      const k = window.__temples.anachak!;
      if (type === 'king') return k.act('hero:king');
      const s = k.sim;
      for (const u of [...s.units.values()]) if (u.team !== 0) s.units.delete(u.id);
      const hall = [...s.buildings.values()].find((b) => b.team === 0 && b.type === 'townCentre')!;
      const u = s.spawnNear(hall, type, 0);
      k.act(`hero:${u.id}`);
    }, type);
    await expect(ui.locator('.k-hb-skill4')).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => {
      const c = window.__temples.anachak!.hero!.core!;
      c.camYaw = c.heading + 0.5;
      c.camDist = 9;
    });
    await page.waitForTimeout(400);
    await page.keyboard.press('Digit3');
    await page.waitForFunction(() => (window.__temples.anachak!.hero!.skillFx?.count ?? 0) > 0, null, {
      timeout: 10_000,
    });
    await page.waitForTimeout(type === 'archer' || type === 'watchman' ? 550 : 420);
    await page.screenshot({ path: `docs/screens/k-vfx-${type}.png` });
    await page.keyboard.press('Escape');
    await expect(ui.locator('.k-hb-skill4')).toBeHidden({ timeout: 30_000 });
  }
});

test('KG-16: PK 1.9.0 (D152, D153): the semi-realistic PC look — PK’s models in the village and scattered over the land', async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  await page.goto('/?mode=anachak&offline=1&preset=pc1660&presetLock=1&shadowMap=2048');
  // The software renderer takes 1–2 minutes to open the PC look on the big Anachak map (D154).
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.anachak, null, {
    timeout: 480_000,
    polling: 500,
  });
  if (await page.locator('.k-anachak #k-card').isVisible())
    await page.locator('.k-anachak #k-card .k-card-x').dispatchEvent('pointerdown');
  // Build a little village round the hall so the house and storehouse models show.
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    const s = k.sim;
    s.fog.explored.fill(1);
    s.fog.visible.fill(1);
    s.exploredVersion++;
    const hall = [...s.buildings.values()].find((b) => b.type === 'townCentre')!;
    const [hx, hz] = [hall.tx, hall.tz];
    const tryPlace = (type: string, dx: number, dz: number) => {
      if (!s.canPlace(type, hx + dx, hz + dz, 0)) s.addBuilding(type, 0, hx + dx, hz + dz, 1);
    };
    for (const [t, dx, dz] of [
      ['house', 8, 0],
      ['house', 8, 4],
      ['house', -6, 6],
      ['storehouse', -8, -2],
      ['market', 2, 9],
    ] as const)
      tryPlace(t, dx, dz);
  });
  await page.waitForFunction(
    () => {
      const v = window.__temples.anachak!.view as unknown as {
        propsOn: number;
        scatter: { shown: number } | null;
      };
      // D154: heavy scans show fewer copies (each kind ≤ 10k triangles), so fewer than before.
      return v.propsOn >= 4 && (v.scatter?.shown ?? 0) > 30;
    },
    null,
    { timeout: 300_000, polling: 1000 },
  );
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    const hall = [...k.sim.buildings.values()].find((b) => b.type === 'townCentre')!;
    const [cx, cz] = k.sim.center(hall);
    k.panTo(cx + 6, cz + 4);
    k.zoom(40);
  });
  // D155: the people nearest the middle of the view are PK's Meshy people with their own clips.
  await page.waitForFunction(
    () =>
      ((window.__temples.anachak!.view as unknown as { people: { shown: number } | null }).people?.shown ??
        0) > 0,
    null,
    { timeout: 240_000, polling: 1000 },
  );
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'docs/screens/k-real-village.png' });
  await page.evaluate(() => {
    const k = window.__temples.anachak!;
    const hall = [...k.sim.buildings.values()].find((b) => b.type === 'townCentre')!;
    const [cx, cz] = k.sim.center(hall);
    k.zoom(90);
    k.panTo(cx + 40, cz + 30);
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'docs/screens/k-real-land.png' });
  const shown = await page.evaluate(
    () => (window.__temples.anachak!.view as unknown as { scatter: { shown: number } }).scatter.shown,
  );
  expect(shown).toBeGreaterThan(30);
});
