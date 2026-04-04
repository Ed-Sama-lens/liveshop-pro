import { test, expect } from '@playwright/test';

// Public storefront pages should load without auth
test.describe('Storefront (Public)', () => {
  // Use a fake shop ID — API will return empty data but pages should render
  const shopId = 'test-shop-id';

  test('shop page loads and shows search', async ({ page }) => {
    await page.goto(`/shop/${shopId}`);
    // Page should render without crashing
    await expect(page.locator('input[placeholder]')).toBeVisible();
  });

  test('cart page loads', async ({ page }) => {
    await page.goto(`/shop/${shopId}/cart`);
    // Should show empty cart or cart UI
    await page.waitForLoadState('networkidle');
    // Page rendered without error
    await expect(page.locator('body')).not.toHaveText(/Internal Server Error/);
  });

  test('checkout page loads', async ({ page }) => {
    await page.goto(`/shop/${shopId}/checkout`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toHaveText(/Internal Server Error/);
  });

  test('product detail page loads', async ({ page }) => {
    await page.goto(`/shop/${shopId}/product/fake-product-id`);
    await page.waitForLoadState('networkidle');
    // Will show "no products" or product not found state
    await expect(page.locator('body')).not.toHaveText(/Internal Server Error/);
  });
});
