/**
 * Production unauth smoke (TRACK 3 — overnight 2026-05-15).
 *
 * Runs against `https://nazhahatyai.com`. NO authenticated requests.
 * NO production mutation. NO storageState. Designed to replace the
 * ad-hoc 13-probe curl loop with a repeatable Playwright spec.
 *
 * Boss/ChatGPT can invoke this whenever a deploy ships, including from
 * CI or local terminal:
 *
 *   npx playwright test --config=playwright.prod-smoke.config.ts \
 *     tests/e2e/prod-unauth-smoke.spec.ts
 *
 * Each test below corresponds to one canonical probe. Any 500 is a
 * hard fail. Any deviation from expected gate-status code is a fail
 * — the harness is meant to catch unexpected production behavior
 * change, not to tolerate it.
 *
 * Coverage parity with the curl-based smoke used during D1/D3/D4/D6/PR4/
 * PR6 deploy verifications (13 probes).
 */

import { expect, test } from '@playwright/test';

/**
 * Hard guard: every Playwright request in this spec must be a GET or
 * an unauth POST/PATCH/DELETE that the route is expected to reject
 * with 401 before touching DB. Tests assert HTTP status only — never
 * follow up with authenticated calls.
 */

test.describe('production unauth smoke', () => {
  test('GET / redirects to sign-in (307)', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = res.headers()['location'] ?? '';
    expect(location).toContain('/auth/sign-in');
  });

  test('GET /favicon.ico returns 200', async ({ request }) => {
    const res = await request.get('/favicon.ico');
    expect(res.status()).toBe(200);
  });

  test('GET /sale (unauth) redirects to sign-in (307)', async ({ request }) => {
    const res = await request.get('/sale', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = res.headers()['location'] ?? '';
    expect(location).toContain('/auth/sign-in');
  });

  test('GET /api/sale/live-sessions (unauth) returns 401', async ({ request }) => {
    const res = await request.get('/api/sale/live-sessions');
    expect(res.status()).toBe(401);
  });

  test('GET /api/sale/customers/search (unauth) returns 401', async ({ request }) => {
    const res = await request.get('/api/sale/customers/search?q=test');
    expect(res.status()).toBe(401);
  });

  test('POST /api/sale/bookings (unauth) returns 401', async ({ request }) => {
    const res = await request.post('/api/sale/bookings', {
      data: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/sale/orders/from-bookings (unauth) returns 401', async ({ request }) => {
    const res = await request.post('/api/sale/orders/from-bookings', {
      data: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/sale/broadcast-products (unauth) returns 401', async ({ request }) => {
    const res = await request.get('/api/sale/broadcast-products');
    expect(res.status()).toBe(401);
  });

  test('POST /api/sale/broadcast-products (unauth) returns 401', async ({ request }) => {
    const res = await request.post('/api/sale/broadcast-products', {
      data: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/sale/broadcast-products/[id] (unauth) returns 401', async ({ request }) => {
    const res = await request.patch('/api/sale/broadcast-products/bogus-id', {
      data: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(401);
  });

  test('DELETE /api/sale/broadcast-products/[id] (unauth) returns 401', async ({ request }) => {
    const res = await request.delete('/api/sale/broadcast-products/bogus-id');
    expect(res.status()).toBe(401);
  });

  // Tier 3.9-G3 (PR #70) — read-only daily summary endpoint.
  test('GET /api/sale/summary (unauth) returns 401', async ({ request }) => {
    const res = await request.get('/api/sale/summary?saleDate=2026-05-23');
    expect(res.status()).toBe(401);
  });

  test('GET /api/storefront/<bogus>/products returns 404 not 500', async ({ request }) => {
    const res = await request.get('/api/storefront/nonexistent-shop-slug-xyz/products');
    expect(res.status()).toBe(404);
  });

  test('GET /api/auth/csrf returns 200', async ({ request }) => {
    const res = await request.get('/api/auth/csrf');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(typeof json?.csrfToken).toBe('string');
  });

  // Post fix/public-robots-middleware (PR #8 merged 2026-05-15):
  // /robots.txt is public 200 and returns the metadata-route response
  // from src/app/robots.ts. /sitemap.xml has no metadata route yet so
  // it returns 404 — middleware does NOT block it; route absence is
  // the expected reason. Both probes go here so a regression in the
  // PUBLIC_PATHS allowlist surfaces immediately.
  test('GET /robots.txt is public (200)', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-Agent');
    expect(body).toContain('Disallow');
  });

  test('GET /sitemap.xml is not gated (404 not 307)', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 });
    // 404 because no metadata route exists yet; 200 acceptable once a
    // src/app/sitemap.ts ships. 307 would indicate middleware
    // regression and is the failure we guard against.
    expect([200, 404]).toContain(res.status());
  });

  // Security headers sanity check on a representative redirect response.
  test('security headers present on root response', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 });
    const headers = res.headers();
    expect(headers['content-security-policy']).toBeTruthy();
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['permissions-policy']).toBeTruthy();
    expect(headers['referrer-policy']).toBeTruthy();
  });
});
