import { expect, test } from '@playwright/test';

test('game page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('The Temples');
});
