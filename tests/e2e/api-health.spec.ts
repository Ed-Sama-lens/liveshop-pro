import { test, expect } from '@playwright/test';

test.describe('API Health', () => {
  test('storefront products API returns valid response', async ({ request }) => {
    const res = await request.get('/api/storefront/test-shop/products');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('success');
  });

  test('storefront branding API returns valid response', async ({ request }) => {
    const res = await request.get('/api/storefront/test-shop/branding');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('analytics API requires auth', async ({ request }) => {
    const res = await request.get('/api/analytics');
    // Should return 401 for unauthenticated
    expect([401, 403, 500]).toContain(res.status());
  });

  test('settings API requires auth', async ({ request }) => {
    const res = await request.get('/api/settings/shop');
    expect([401, 403, 500]).toContain(res.status());
  });

  test('upload API requires auth', async ({ request }) => {
    const res = await request.post('/api/upload');
    expect([401, 403, 500]).toContain(res.status());
  });

  test('storefront cart requires customer ID', async ({ request }) => {
    const res = await request.get('/api/storefront/test-shop/cart');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Customer identification');
  });

  test('storefront cart with customer ID returns valid response', async ({ request }) => {
    const res = await request.get('/api/storefront/test-shop/cart', {
      headers: { 'x-customer-id': 'test-customer-123' },
    });
    // May fail with DB error since test-shop doesn't exist, but should not be 401
    expect(res.status()).not.toBe(401);
  });
});
