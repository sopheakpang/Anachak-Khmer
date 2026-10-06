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
