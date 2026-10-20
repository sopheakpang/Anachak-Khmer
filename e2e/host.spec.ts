import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 }, baseURL: 'http://localhost:7421' });

test('host panel drives the bridge end to end (AC-01, AC-02 via UI)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pill-bridge')).toHaveText('Bridge: connected');
  await expect(page.locator('#pill-source')).toContainText('simulator · connected');
  await expect(page.locator('#t-km')).toContainText('ព្រះគោ · Preah Ko');
  // The test bridge is shared with other tests: start from an empty temple.
  await page.getByRole('button', { name: 'Reset temple…' }).click();
  await page.getByRole('button', { name: 'Yes, reset' }).click();
  await page.getByRole('button', { name: 'New stream' }).click();
  await expect(page.locator('#t-prog')).toHaveText('0 / 3,000');

  await page.selectOption('#user', 'sim-dara');
  await page.getByRole('button', { name: /Doughnut/ }).click();
  await expect(page.locator('#feed')).toContainText('Doughnut');
  await expect(page.locator('#t-prog')).toHaveText('150 / 3,000');
  await expect(page.locator('#top-temple')).toContainText('Dara');

  await page.selectOption('#user', 'sim-sokha');
  await page.getByRole('button', { name: /Rose combo/ }).click();
  await expect(page.locator('#feed')).toContainText('Rose ×12', { timeout: 5000 });
  await expect(page.locator('#t-prog')).toHaveText('210 / 3,000');

  // Thai name falls back to the @handle
  await page.selectOption('#user', 'sim-somchai');
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('2'); // Finger Heart hotkey
  await expect(page.locator('#feed')).toContainText('@somchai_bkk');

  // Lion: capped at 15%, rest to the stockpile
  await page.getByRole('button', { name: /Lion/ }).click();
  await expect(page.locator('#t-stock')).not.toHaveText('0');

  // Reset needs the in-page confirm
  await page.getByRole('button', { name: 'Reset temple…' }).click();
  await expect(page.locator('#reset-confirm')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#reset-confirm')).toBeHidden();

  await page.screenshot({ path: 'docs/screens/06-host.png', fullPage: true });
});

test('PK 2026-10-20 (D157): ព្រះរាជបញ្ជា · Royal Orders — add and remove an order in the dashboard', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#pill-bridge')).toHaveText('Bridge: connected');
  await page.getByRole('button', { name: /Royal Orders/ }).click();
  await expect(page.locator('#tab-orders')).toBeVisible();
  await expect(page.locator('#tab-panel')).toBeHidden();
  const rows = page.locator('#orders-list tr');
  await expect(rows.first()).toBeVisible();
  const n0 = await rows.count();
  expect(n0).toBeGreaterThan(10);
  // A question with three answers, the second one right, for the king and the commander.
  await page.locator('input[name="otype"][value="question"]').check();
  await page.fill('#o-km', 'ស្ដេចអង្គណាសាងប្រាសាទបាគង?');
  await page.fill('#o-en', 'Which king built Bakong?');
  const opt = page.locator('#o-options .opt');
  await opt.nth(0).locator('.o-oen').fill('Jayavarman VII');
  await opt.nth(1).locator('.o-oen').fill('Indravarman I');
  await opt.nth(2).locator('.o-oen').fill('Suryavarman II');
  await opt.nth(1).locator('input[type="radio"]').check();
  await page.locator('#o-kits input[value="king"]').check();
  await page.locator('#o-kits input[value="commander"]').check();
  await page.getByRole('button', { name: /Add the order/ }).click();
  await expect(rows).toHaveCount(n0 + 1);
  const row = page.locator('#orders-list tr[data-id="which-king-built-bakong"]');
  await expect(row).toContainText('Indravarman I ✓');
  await page.screenshot({ path: 'docs/screens/host-royal-orders.png', fullPage: true });
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(rows).toHaveCount(n0);
  // A visit with no text is refused by the form itself (required fields).
  await page.getByRole('button', { name: /Add the order/ }).click();
  await expect(rows).toHaveCount(n0);
});
