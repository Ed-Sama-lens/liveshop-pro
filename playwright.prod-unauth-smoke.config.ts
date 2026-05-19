import { defineConfig, devices } from '@playwright/test';

/**
 * Production UNAUTH smoke Playwright config.
 *
 * Separate from playwright.prod-smoke.config.ts (which targets the
 * authenticated Phase A spec). This config:
 * - targets production nazhahatyai.com
 * - runs ONLY tests/e2e/prod-unauth-smoke.spec.ts
 * - never uses storageState
 * - never starts a webServer
 *
 * Hard guard by construction: the testMatch regex includes the literal
 * "unauth" segment, so an accidentally renamed or new authenticated
 * spec cannot be picked up by this config.
 *
 * Invocation: `npm run smoke:prod:unauth`
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /prod-unauth-smoke\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: 'https://nazhahatyai.com',
    // Smoke is short and idempotent — no trace/video to keep CI fast
    // and avoid accidental artifact uploads.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Explicitly do NOT load any storageState. Tests must run unauth.
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // NO webServer — we target live nazhahatyai.com.
});
