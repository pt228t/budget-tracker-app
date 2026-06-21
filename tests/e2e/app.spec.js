import { expect, test } from '@playwright/test';

test('switches between the scaffold pages', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('current-view')).toHaveText('Login');

  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('current-view')).toHaveText('Dashboard');
  await expect(page.getByText('Budget Health')).toBeVisible();

  await page.getByRole('button', { name: 'Expense Log' }).click();
  await expect(page.getByTestId('current-view')).toHaveText('Expense Log');
  await expect(page.getByLabel('Vendor')).toBeVisible();

  await page.getByRole('button', { name: 'Analytics' }).click();
  await expect(page.getByTestId('current-view')).toHaveText('Analytics');
  await expect(page.locator('#analytics-chart')).toBeVisible();
});
