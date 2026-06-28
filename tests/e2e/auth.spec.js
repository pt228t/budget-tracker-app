import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('should display login screen initially and handle auth interactions', async ({ page }) => {
    // Go to the app
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    await page.goto('/');

    // Should see the login screen initially (since no token is in storage)
    const loginSection = page.locator('[data-page="login"]');
    await expect(loginSection).toBeVisible();

    // The sign in button should be visible
    const signInBtn = page.locator('button:has-text("Sign in with Google")');
    await expect(signInBtn).toBeVisible();

    // Note: We cannot fully E2E test the Google OAuth popup in Playwright easily 
    // without complex setup or mock servers, but we can verify our UI bindings.
    
    // Mock the Google UserInfo API so handleAuthSuccess doesn't fail due to the fake token
    await page.route('https://www.googleapis.com/oauth2/v3/userinfo', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ email: 'e2e_tester@example.com' })
      });
    });

    await page.route('https://www.googleapis.com/oauth2/v3/tokeninfo**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'
        })
      });
    });

    // Mock the Google Sheets API to pretend the user is authorized
    await page.route('https://sheets.googleapis.com/v4/spreadsheets/**', async route => {
      if (route.request().url().includes('values')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ values: [['allowed_users', 'e2e_tester@example.com']] })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ sheets: [{ properties: { title: 'App_Config' } }] })
        });
      }
    });

    // We can simulate an authenticated state by manually injecting a token
    await page.evaluate(() => {
      sessionStorage.setItem('bp_access_token', 'mock_token_for_e2e');
      localStorage.setItem('bp_spreadsheet_id', 'mock_spreadsheet_id');
    });

    // Reload the page, the app should auto-authenticate and show the dashboard
    await page.reload();

    // Verify dashboard is now visible instead of login
    const dashboardSection = page.locator('[data-page="dashboard"]');
    await expect(dashboardSection).toBeVisible();
    await expect(loginSection).toBeHidden();

    // The nav button should now say 'Sign Out'
    const signOutNavBtn = page.locator('button.shell-nav-link[data-route="logout"]');
    await expect(signOutNavBtn).toHaveText('Sign Out');

    // Click Sign Out
    await signOutNavBtn.click();

    // Verify it drops back to login screen
    await expect(loginSection).toBeVisible();
    await expect(dashboardSection).toBeHidden();
    
    // Verify token is removed from storage
    const token = await page.evaluate(() => sessionStorage.getItem('bp_access_token'));
    expect(token).toBeNull();
  });
});
