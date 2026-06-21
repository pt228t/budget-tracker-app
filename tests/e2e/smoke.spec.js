import { expect, test } from '@playwright/test';

test('renders the BudgetPulse scaffold shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('app-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByText('Awaiting OAuth and Sheets connection')).toBeVisible();
  await expect(page.getByTestId('current-view')).toHaveText('Login');
});
