import { expect, test, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync(new URL('../config/layout.json', import.meta.url), 'utf8')) as {
  zones: Record<string, { x: number; y: number; w: number; h: number; keepClear?: boolean }>;
};

async function host(): Promise<{ send: (m: unknown) => void; close: () => void }> {
  const ws = new WebSocket('ws://localhost:7420/?role=host');
  await new Promise((r) => ws.once('open', r));
  return { send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
}
let seq = 0;
const comment = (text: string, id: string) => ({
  kind: 'simulate',
  event: { id: `c${Date.now()}-${++seq}`, type: 'comment', text, user: { id, name: id }, ts: Date.now() },
});

/** Stage pixel (1080 × 1920) → page coordinates. */
async function at(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator('.stage').boundingBox())!;
  const k = box.width / 1080;
  return { x: box.x + x * k, y: box.y + y * k };
}

// Software rendering in the test browser is slow (~1 frame a second).
test.describe.configure({ mode: 'serial', timeout: 300_000 });

test('AX-01: the host switches to Expedition; hero vote, pick, walk, and back to Build', async ({ page }) => {
  const h = await host();
  try {
    await page.goto('/?selectSeconds=600');
    await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.model?.state, null, {
      timeout: 60_000,
    });
    const before = await page.evaluate(() => window.__temples.model!.state!.temple.progress);
    h.send({ kind: 'control', action: 'setMode', mode: 'expedition' });
    await page.waitForFunction(
      () => window.__temples.mode === 'expedition' && window.__temples.expedition,
      null,
      { timeout: 90_000 },
    );
    await expect(page.locator('#exp-select')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.exp-card')).toHaveCount(3);
    await expect(page.locator('.exp-card-name').first()).toHaveText('វីរៈ');

    // A viewer votes !3 in chat.
    h.send(comment('!3', 'voter1'));
    await expect(page.locator('.exp-card').nth(2)).toContainText('១', { timeout: 20_000 });
    await page.screenshot({ path: 'docs/screens/x-select.png' });

    // The host clicks the warrior card.
    await page.locator('.exp-card').first().click();
    await page.waitForFunction(() => window.__temples.expedition?.heroCfg?.id === 'warrior', null, {
      timeout: 20_000,
    });
    await expect(page.locator('.exp-skill')).toHaveCount(4, { timeout: 20_000 });
    // The how-to card in the middle: arrows walk, mouse aims, click strikes, Q W E R.
    await expect(page.locator('#exp-howto')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#exp-howto')).toContainText('Mouse aims');

    // Arrow key Up: the hero walks north (no clicking needed).
    const start = await page.evaluate(() => [
      window.__temples.expedition!.hero!.x,
      window.__temples.expedition!.hero!.z,
    ]);
    await page.locator('.stage').hover();
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(([, sz]) => window.__temples.expedition!.hero!.z < sz! - 0.5, start, {
      timeout: 90_000,
    });
    await page.keyboard.up('ArrowUp');
    await page.screenshot({ path: 'docs/screens/x-walk.png' });

    // Stand beside a training post, point at it (red sword) and click: it takes damage.
    await page.evaluate(() => {
      const ex = window.__temples.expedition!;
      const post = ex.combat.targets[0]!;
      ex.hero!.x = post.x + 2;
      ex.hero!.z = post.z + 0.5;
      ex.hero!.path = [];
      ex.centre();
    });
    await page.waitForTimeout(3000);
    const px = await page.evaluate(() => {
      const ex = window.__temples.expedition!;
      const post = ex.combat.targets[0]!;
      return ex.jungle.projectGround(post.x, post.z);
    });
    const pp = await at(page, px.x, px.y);
    await page.mouse.move(pp.x, pp.y);
    await expect(page.locator('.exp-cursor')).toHaveAttribute('data-state', 'attack', { timeout: 30_000 });
    await page.mouse.click(pp.x, pp.y);
    await page.waitForFunction(
      () => {
        const t = window.__temples.expedition!.combat.targets[0]!;
        return t.hp < t.maxHp;
      },
      null,
      { timeout: 20_000 },
    );

    // Q: the warrior's first blessing strikes where the mouse points.
    const energy0 = await page.evaluate(() => window.__temples.expedition!.hero!.energy);
    await page.keyboard.press('q');
    await page.waitForFunction((e0) => window.__temples.expedition!.hero!.energy < e0, energy0, {
      timeout: 20_000,
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/screens/x-strike.png' });

    // Old Quarry: stand at a rock face, press F, the block rides on the head, bring it to camp.
    await page.evaluate(() => {
      const ex = window.__temples.expedition!;
      const [fx, fz] = ex.quarry.cfg.faces[0]!;
      ex.hero!.x = fx + 2;
      ex.hero!.z = fz + 2;
      ex.hero!.path = [];
      ex.centre();
    });
    await page.keyboard.press('f');
    await expect(page.locator('#exp-objective')).toContainText('Cutting', { timeout: 30_000 });
    await page.waitForFunction(() => window.__temples.expedition!.quarry.carrying, null, { timeout: 60_000 });
    await expect(page.locator('#exp-objective')).toContainText('camp pile', { timeout: 30_000 });
    await page.screenshot({ path: 'docs/screens/x-quarry.png' });
    await page.evaluate(() => {
      const ex = window.__temples.expedition!;
      const [px, pz] = ex.quarry.cfg.pile;
      ex.hero!.x = px + 2;
      ex.hero!.z = pz + 2;
    });
    await page.waitForFunction(() => window.__temples.expedition!.quarry.delivered === 1, null, {
      timeout: 60_000,
    });
    await expect(page.locator('#exp-quota-label')).toContainText('១ blocks', { timeout: 30_000 });

    // Back to Build: the temple is exactly where it was.
    h.send({ kind: 'control', action: 'setMode', mode: 'build' });
    await page.waitForFunction(() => window.__temples.mode === 'build', null, { timeout: 30_000 });
    await expect(page.locator('#ui-temple-km')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#exp-select')).toBeHidden();
    const after = await page.evaluate(() => window.__temples.model!.state!.temple.progress);
    expect(after).toBe(before);
  } finally {
    h.send({ kind: 'control', action: 'setMode', mode: 'build' });
    h.close();
  }
});

test('AX-02: Expedition HUD stays out of TikTok areas, text ≥ 26 px, frame budget', async ({ page }) => {
  await page.goto('/?mode=expedition&offline=1&selectSeconds=600');
  await page.waitForFunction(() => window.__temples?.fontsReady && window.__temples.expedition, null, {
    timeout: 90_000,
  });
  // Check the choice screen, then the play HUD.
  for (const phase of ['select', 'play'] as const) {
    if (phase === 'play') {
      await page.keyboard.press('3');
      await expect(page.locator('.exp-skill')).toHaveCount(4, { timeout: 30_000 });
      await page.evaluate(() => {
        const ex = window.__temples.expedition!;
        ex.jungle.reveal(-50, -4, 30);
        ex.hero!.x = -48;
        ex.hero!.z = -2;
      });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'docs/screens/x-hermitage-rider.png' });
    } else {
      await expect(page.locator('#exp-select')).toBeVisible({ timeout: 30_000 });
    }
    const bad = await page.evaluate((zones) => {
      const stage = document.querySelector('.stage')!.getBoundingClientRect();
      const k = stage.width / 1080;
      const clear = Object.entries(zones).filter(([, z]) => z.keepClear);
      const out: string[] = [];
      for (const el of document.querySelectorAll('.exp-ui [data-ui]')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const b = {
          x: (r.left - stage.left) / k,
          y: (r.top - stage.top) / k,
          w: r.width / k,
          h: r.height / k,
        };
        for (const [name, z] of clear)
          if (b.x < z.x + z.w && b.x + b.w > z.x && b.y < z.y + z.h && b.y + b.h > z.y)
            out.push(`${name}: ${(el.textContent ?? '').trim().slice(0, 30)}`);
      }
      return out;
    }, layout.zones);
    expect(bad, phase).toEqual([]);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.exp-ui *')]
        .filter(
          (e) => e.childElementCount === 0 && (e.textContent ?? '').trim() && (e as HTMLElement).offsetParent,
        )
        .map((e) => [e.className, parseFloat(getComputedStyle(e).fontSize)] as const)
        .filter(([, px]) => px < 26),
    );
    expect(small, phase).toEqual([]);
  }
  await page.waitForFunction(() => window.__temples.stats.frames > 3);
  const s = await page.evaluate(() => window.__temples.stats);
  console.log(`[budget] expedition: ${s.triangles} triangles, ${s.drawCalls} draw calls`);
  expect(s.triangles).toBeLessThan(600_000);
  expect(s.drawCalls).toBeLessThan(120);
});
