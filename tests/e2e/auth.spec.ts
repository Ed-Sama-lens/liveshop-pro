import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('sign-in page loads', async ({ page }) => {
    await page.goto('/auth/sign-in');
    await expect(page).toHaveTitle(/LiveShop/i);
    // Should show Facebook login button
    await expect(page.getByText(/facebook/i)).toBeVisible();
  });

  test('unauthenticated user is redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to sign-in or show unauthorized
    await page.waitForURL(/\/(auth\/sign-in|unauthorized)/);
  });

  test('unauthenticated user is redirected from inventory', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForURL(/\/(auth\/sign-in|unauthorized)/);
  });

  test('unauthenticated user is redirected from orders', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForURL(/\/(auth\/sign-in|unauthorized)/);
  });

  test('unauthenticated user is redirected from settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL(/\/(auth\/sign-in|unauthorized)/);
  });
});
