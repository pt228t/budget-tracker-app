import { expect, test } from '@playwright/test';

test('switches between the scaffold pages', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('current-view')).toHaveText('Login');

  // Set up mock responses for authentication and authorization check
  await page.route('https://www.googleapis.com/oauth2/v3/userinfo', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'e2e_tester@example.com' })
    });
  });

  await page.route('https://sheets.googleapis.com/v4/spreadsheets/**', async route => {
    const url = route.request().url();
    if (url.includes('values/App_Config')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          values: [
            ['key', 'value'],
            ['allowed_users', 'e2e_tester@example.com']
          ]
        })
      });
    } else if (url.includes('values/Budget_Categories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          values: [
            ['category_name', 'monthly_budget', 'spent'],
            ['Groceries', '8000', '6400'],
            ['Transport', '2500', '1150'],
            ['Dining Out', '3000', '2700']
          ]
        })
      });
    } else if (url.includes('values/Sub_Categories')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          values: [
            ['sub_category_name', 'category_id'],
            ['Vegetables', '1'],
            ['Fuel', '2']
          ]
        })
      });
    } else if (url.includes('values')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ values: [] })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sheets: [{ properties: { title: 'App_Config' } }] })
      });
    }
  });

  // Inject token to mock authenticated state
  await page.evaluate(() => {
    sessionStorage.setItem('bp_access_token', 'mock_token_for_e2e');
    localStorage.setItem('bp_spreadsheet_id', 'mock_spreadsheet_id');
  });

  await page.reload();

  await expect(page.getByTestId('current-view')).toHaveText('Dashboard');
  await expect(page.getByText('Budget Health')).toBeVisible();
  await expect(page.locator('[data-testid="category-health-list"] [data-category-health-item]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Expense Log' }).click();
  await expect(page.getByTestId('current-view')).toHaveText('Expense Log');
  await expect(page.getByLabel('Vendor')).toBeVisible();
  await expect(page.locator('#category option')).toHaveCount(4);
  await expect(page.locator('#category option').nth(1)).toHaveText('Groceries');

  await page.getByRole('button', { name: 'Analytics' }).click();
  await expect(page.getByTestId('current-view')).toHaveText('Analytics');
  await expect(page.locator('#analytics-container')).toBeVisible();
});
