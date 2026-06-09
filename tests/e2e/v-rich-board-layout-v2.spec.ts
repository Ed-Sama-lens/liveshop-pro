/**
 * V Rich Board Stage 3.10-C WIRE-4 — Playwright e2e scaffold.
 *
 * SKIPPED BY DEFAULT. Runs only when:
 *   1. Boss enables `NEXT_PUBLIC_SALE_LAYOUT_V2=true` in `.env.local`
 *   2. Boss has signed in once via
 *      `tests/e2e/.auth/boss-dev-storage-state.json` (Boss-owned,
 *      gitignored)
 *   3. Boss runs `npm run dev` to start the local server
 *   4. Boss invokes `npx playwright test tests/e2e/v-rich-board-layout-v2.spec.ts`
 *
 * This spec exists as a WIRE-4 scaffold so the assertions are already
 * codified for future Boss execution. It does NOT mutate production
 * data. It runs against `http://localhost:3000` only.
 *
 * Auth model:
 * - Requires `tests/e2e/.auth/boss-dev-storage-state.json` produced by
 *   one-time manual login. Same pattern as
 *   `manual-create-phase-a.prod-smoke.spec.ts`.
 * - File is gitignored. Never paste into chat.
 *
 * Hard rules:
 * - NO production mutation
 * - NO production smoke (local dev only)
 * - NO bypass of auth — spec uses storageState same as legit admin
 * - NO drag/drop test (held)
 * - NO manual slot fill test (held — Stage 3.10-D)
 *
 * Per Boss directive 2026-05-25 WIRE-4 scope.
 *
 * To enable: set env `RUN_V_RICH_E2E=1` before invoking playwright.
 * Without that env, the entire suite is skipped — protects CI from
 * accidentally running a spec that requires Boss-owned storageState.
 */
import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const AUTH_FILE = resolve(
  process.cwd(),
  'tests/e2e/.auth/boss-dev-storage-state.json'
);

const RUN_FLAG = process.env.RUN_V_RICH_E2E === '1';
const FLAG_ENABLED =
  process.env.NEXT_PUBLIC_SALE_LAYOUT_V2 === 'true' ||
  process.env.NEXT_PUBLIC_SALE_LAYOUT_V2 === '1';

// Gate the entire suite on opt-in env. Without `RUN_V_RICH_E2E=1`, Playwright
// silently skips the suite (matches the existing prod-smoke pattern that
// skips when storageState file is missing).
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  if (!RUN_FLAG) {
    test.skip(true, 'Set RUN_V_RICH_E2E=1 to enable V Rich board e2e spec');
  }
  if (!existsSync(AUTH_FILE)) {
    test.skip(
      true,
      `Auth file missing: ${AUTH_FILE}. Run manual login first.`
    );
  }
  if (!FLAG_ENABLED) {
    test.skip(
      true,
      'NEXT_PUBLIC_SALE_LAYOUT_V2 must be true|1 in .env.local for this spec'
    );
  }
});

test.use({ storageState: AUTH_FILE });

test.describe('V Rich Board — layout v2 read-only', () => {
  test('flag ON → board renders alongside legacy Product Codes panel', async ({
    page,
  }) => {
    await page.goto('/sale');
    // Wait for shell to render
    await page.waitForSelector('text=รหัสสินค้า', { timeout: 15_000 });

    // Legacy panel header present
    await expect(page.getByText(/รหัสสินค้า/).first()).toBeVisible();

    // V Rich board title present
    await expect(
      page.getByText(/Sale Board \(V Rich style\) — preview/)
    ).toBeVisible();
  });

  test('board subtitle prompts pill click when none selected', async ({
    page,
  }) => {
    await page.goto('/sale');
    await page.waitForSelector(
      'text=Sale Board (V Rich style) — preview',
      { timeout: 15_000 }
    );
    await expect(page.getByText(/คลิกรหัสเพื่อดู slot/)).toBeVisible();
  });

  test('pill click → drawer expands; subtitle shows Selected', async ({
    page,
  }) => {
    await page.goto('/sale');
    await page.waitForSelector(
      'text=Sale Board (V Rich style) — preview',
      { timeout: 15_000 }
    );

    // Find the first product code pill (matches role=button under the
    // board listbox). If no pill present (empty saleDate), skip — this
    // smoke is meaningful only when there are pills to click.
    const pills = page.locator('[role="listbox"][aria-label="Product code pills"] button');
    const count = await pills.count();
    if (count === 0) {
      test.skip(
        true,
        'No product codes on selected saleDate. Pick a date with codes first.'
      );
    }

    await pills.first().click();
    // Subtitle changes to "Selected: <code>" — assert prefix
    await expect(page.getByText(/Selected:/)).toBeVisible({ timeout: 5_000 });
  });

  test('drawer is read-only — no submit / mutation controls injected', async ({
    page,
  }) => {
    await page.goto('/sale');
    await page.waitForSelector(
      'text=Sale Board (V Rich style) — preview',
      { timeout: 15_000 }
    );

    // The board itself must NOT introduce Confirm/Cancel/Convert buttons.
    // Those buttons live in the legacy BookingQueuePlaceholder panel —
    // the board is read-only by contract.
    const boardSection = page.locator(
      'section:has-text("Sale Board (V Rich style)")'
    );
    // No buttons with text matching mutation actions inside the board card
    await expect(
      boardSection.locator('button:has-text("Confirm")')
    ).toHaveCount(0);
    await expect(
      boardSection.locator('button:has-text("Convert")')
    ).toHaveCount(0);
  });

  test('no POST/PUT/PATCH/DELETE to /api/sale/* fires during board interaction', async ({
    page,
  }) => {
    const mutationsObserved: string[] = [];
    page.on('request', (req) => {
      const method = req.method();
      const url = req.url();
      const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
      if (mutationMethods.has(method) && url.includes('/api/sale/')) {
        mutationsObserved.push(`${method} ${url}`);
      }
    });

    await page.goto('/sale');
    await page.waitForSelector(
      'text=Sale Board (V Rich style) — preview',
      { timeout: 15_000 }
    );

    // Click first pill if present
    const pills = page.locator(
      '[role="listbox"][aria-label="Product code pills"] button'
    );
    if ((await pills.count()) > 0) {
      await pills.first().click();
      await page.waitForTimeout(1000);
      await pills.first().click(); // collapse
    }

    expect(mutationsObserved).toEqual([]);
  });
});

test.describe('V Rich Board — flag OFF regression', () => {
  test('SKIP NOTE: flag-off coverage lives in unit tests at SaleWorkspaceShell-layout-v2-gating.test.tsx', async () => {
    // E2E flag-off requires restarting the dev server with new .env.local,
    // which is awkward inside a single Playwright run. The flag-off
    // regression is already pinned by 8 unit tests (vitest) that mock
    // the shell + render with each env value. This spec only validates
    // the flag-ON live path.
    test.skip(true, 'See SaleWorkspaceShell-layout-v2-gating.test.tsx');
  });
});

/**
 * Boss invocation guide (also at docs/superpowers/2026-05-25-v-rich-3-10-c-wire-3-boss-ui-smoke-guide.md):
 *
 *   1. cd liveshop-pro
 *   2. echo "NEXT_PUBLIC_SALE_LAYOUT_V2=true" >> .env.local
 *   3. npm run dev   (separate terminal; leave running)
 *   4. # One-time only: sign in via browser → save storageState
 *      npx tsx tests/e2e/setup-dev-auth.ts  (Boss creates this helper)
 *   5. RUN_V_RICH_E2E=1 NEXT_PUBLIC_SALE_LAYOUT_V2=true \
 *        npx playwright test tests/e2e/v-rich-board-layout-v2.spec.ts
 *   6. Read report at playwright-report/index.html
 *
 * Without all three of: RUN_V_RICH_E2E env, flag env, and storageState
 * file — the spec silently skips. This protects CI from accidentally
 * running a spec it cannot satisfy.
 */

// Hint to TS that Page is in use (some assertions use it via fixtures)
type _PageHint = Page;
