import { defineConfig, devices } from '@playwright/test';

/**
 * Production smoke Playwright config.
 *
 * Separate from playwright.config.ts so the default dev config (which
 * boots `npm run dev`) is untouched. This config:
 * - targets production nazhahatyai.com
 * - does NOT start any web server
 * - runs only specs matching *.prod-smoke.spec.ts
 * - records trace + video + screenshot on every run for audit
 * - serial execution (1 worker) — avoids accidental rate-limit burn
 *
 * Phase A scope: read-only authenticated smoke against production.
 * Spec must enforce its own network guard against mutation requests.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.prod-smoke\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://nazhahatyai.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 30s default; production network can be slower than localhost.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // NO webServer — we target live nazhahatyai.com.
});
