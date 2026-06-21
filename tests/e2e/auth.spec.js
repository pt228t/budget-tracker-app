import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('should display login screen initially and handle auth interactions', async ({ page }) => {
    // Go to the app
    await page.goto('/');

    // Should see the login screen initially (since no token is in storage)
    const loginSection = page.locator('[data-page="login"]');
    await expect(loginSection).toBeVisible();

    // The sign in button should be visible
    const signInBtn = page.locator('button:has-text("Sign in with Google")');
    await expect(signInBtn).toBeVisible();

    // Note: We cannot fully E2E test the Google OAuth popup in Playwright easily 
    // without complex setup or mock servers, but we can verify our UI bindings.
    
    // We can simulate an authenticated state by manually injecting a token
    await page.evaluate(() => {
      sessionStorage.setItem('bp_access_token', 'mock_token_for_e2e');
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
