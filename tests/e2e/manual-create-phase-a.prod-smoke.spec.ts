/**
 * Phase A — Manual Create read-only production smoke (Boss 2026-05-13).
 *
 * Authenticated browser smoke against https://nazhahatyai.com/sale.
 * Steps 0-9 only. NO submit. NO mutation. NO booking created.
 *
 * Auth model:
 * - Requires `tests/e2e/.auth/boss-prod-storage-state.json` produced by
 *   `npx tsx tests/e2e/setup-prod-auth.ts` (Boss runs once, manual
 *   login, file saved locally + gitignored).
 *
 * Network guard:
 * - Test FAILS if ANY POST/PUT/PATCH/DELETE request fires against
 *   /api/sale/* or /api/customers/* during the run.
 * - Only the documented GET allowlist is accepted; everything else is
 *   logged + asserted at the end.
 *
 * Artifact convention:
 * - Numbered screenshots saved to tests/e2e/screenshots/manual-create-prod-smoke/
 * - All paths gitignored.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const AUTH_FILE = resolve(
  process.cwd(),
  'tests/e2e/.auth/boss-prod-storage-state.json'
);
const SHOT_DIR = resolve(
  process.cwd(),
  'tests/e2e/screenshots/manual-create-prod-smoke'
);

// PII whitelist for customers/search response.
const ALLOWED_CUSTOMER_KEYS = [
  'customerId',
  'name',
  'phone',
  'email',
  'isBanned',
  'orderCount',
] as const;

const FORBIDDEN_CUSTOMER_KEYS = [
  'address',
  'district',
  'province',
  'postalCode',
  'labels',
  'notes',
  'channel',
  'facebookId',
  'bannedReason',
  'shopId',
  'shippingType',
  'lifetimeValue',
  'createdAt',
  'updatedAt',
  'rawPayload',
  'platformUserId',
  'platformThreadId',
  'metadata',
] as const;

// Allowed GET endpoints during the run. Anything else is logged.
const ALLOWED_GET_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/api\/sale\/live-sessions(\?.*)?$/,
  /^\/api\/sale\/live-sessions\/[^/]+\/broadcast-products(\?.*)?$/,
  /^\/api\/sale\/bookings(\?.*)?$/,
  /^\/api\/sale\/customers\/search(\?.*)?$/,
  /^\/api\/customers\/[^/]+(\?.*)?$/, // Customer Panel
  /^\/api\/auth\//,                    // next-auth probes
  /^\/_next\//,
  /^\/favicon\.ico/,
];

// Forbidden mutation methods (Phase A is read-only).
const FORBIDDEN_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface NetworkEvent {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly status: number | null;
}

const networkLog: NetworkEvent[] = [];
const mutationViolations: NetworkEvent[] = [];
const allowedEndpointHits: Record<string, number> = {};

/**
 * Last Phase A step the spec successfully completed. Updated as each
 * step finishes. Used by the afterEach guard to:
 *  (a) persist network-log.json no matter how the spec exits (pass,
 *      fail, or test.skip mid-flight)
 *  (b) refuse to claim PHASE_A_PASS unless Step 9 actually completed
 *
 * Lifecycle:
 *   beforeEach → reset to 0
 *   each step end → setStep(N)
 *   afterEach → derive phaseAStatus from this number + presence of fail
 */
let stepReached = 0;
/**
 * If a step was BLOCKED (e.g. no BroadcastProduct in session), record
 * which step + why. Distinguishes blocked-by-test-data from spec failure.
 */
let blockedAtStep: { step: number; reason: string } | null = null;

function setStep(n: number): void {
  if (n > stepReached) stepReached = n;
}

function markBlocked(step: number, reason: string): void {
  blockedAtStep = { step, reason };
}

/**
 * Translate stepReached + blocked state into the Boss-approved status
 * vocabulary. NEVER returns PHASE_A_PASS unless all required steps ran.
 */
function derivePhaseAStatus(): string {
  if (mutationViolations.length > 0) {
    return 'PHASE_A_FAIL_MUTATION_GUARD';
  }
  if (blockedAtStep !== null) {
    return `PHASE_A_PARTIAL_ACCEPTED_BLOCKED_AT_STEP_${blockedAtStep.step}`;
  }
  if (stepReached >= 9) {
    return 'PHASE_A_PASS';
  }
  if (stepReached === 0) {
    return 'PHASE_A_FAIL_BEFORE_STEP_1';
  }
  return `PHASE_A_PARTIAL_STEPS_0_${stepReached}_OF_9`;
}

function classifyUrl(rawUrl: string): { path: string; isSaleApi: boolean } {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname + (u.search ?? '');
    const isSaleApi =
      u.hostname === 'nazhahatyai.com' &&
      (u.pathname.startsWith('/api/sale/') ||
        u.pathname.startsWith('/api/customers'));
    return { path, isSaleApi };
  } catch {
    return { path: rawUrl, isSaleApi: false };
  }
}

function attachNetworkGuard(page: Page): void {
  page.on('request', (req: Request) => {
    const method = req.method();
    const url = req.url();
    const { path, isSaleApi } = classifyUrl(url);

    if (!isSaleApi && !path.startsWith('/api/')) return;

    if (FORBIDDEN_METHODS.has(method)) {
      const violation: NetworkEvent = {
        method,
        url,
        path,
        status: null,
      };
      mutationViolations.push(violation);
      // Surface immediately to test output.
      console.error(`[MUTATION VIOLATION] ${method} ${path}`);
    }
  });

  page.on('response', (res) => {
    const req = res.request();
    const method = req.method();
    const url = res.url();
    const { path, isSaleApi } = classifyUrl(url);
    if (!isSaleApi && !path.startsWith('/api/')) return;

    networkLog.push({ method, url, path, status: res.status() });

    if (method === 'GET') {
      const cleanPath = path.split('?')[0];
      allowedEndpointHits[cleanPath] = (allowedEndpointHits[cleanPath] ?? 0) + 1;
    }
  });
}

function assertPathAllowed(path: string): void {
  const clean = path;
  const allowed = ALLOWED_GET_PATTERNS.some((p) => p.test(clean));
  expect(
    allowed,
    `GET path not in allowlist: ${clean}`
  ).toBe(true);
}

test.describe('Manual Create — Phase A read-only smoke (production)', () => {
  test.skip(
    !existsSync(AUTH_FILE),
    `Missing auth file ${AUTH_FILE}. Run: npx tsx tests/e2e/setup-prod-auth.ts`
  );

  test.use({ storageState: AUTH_FILE });

  test.beforeAll(() => {
    if (!existsSync(SHOT_DIR)) {
      mkdirSync(SHOT_DIR, { recursive: true });
    }
  });

  test.beforeEach(() => {
    // Reset cross-test state so a rerun starts clean.
    networkLog.length = 0;
    mutationViolations.length = 0;
    for (const key of Object.keys(allowedEndpointHits)) {
      delete allowedEndpointHits[key];
    }
    stepReached = 0;
    blockedAtStep = null;
  });

  /**
   * Always persist a network-log + status artifact at the end of each
   * test, no matter how the spec exited (pass / fail / test.skip).
   * Without this hook, a mid-flight test.skip leaves no audit trail —
   * the Boss/ChatGPT review then can't confirm zero mutations.
   */
  test.afterEach(async () => {
    try {
      if (!existsSync(SHOT_DIR)) {
        mkdirSync(SHOT_DIR, { recursive: true });
      }
      const fs = await import('node:fs/promises');
      const artifact = {
        runAt: new Date().toISOString(),
        phaseAStatus: derivePhaseAStatus(),
        stepReached,
        blockedAtStep,
        totalRequests: networkLog.length,
        mutationViolations,
        saleGets: networkLog.filter(
          (e) =>
            (e.path.startsWith('/api/sale/') ||
              e.path.startsWith('/api/customers')) &&
            e.method === 'GET'
        ),
        endpointHits: { ...allowedEndpointHits },
      };
      await fs.writeFile(
        `${SHOT_DIR}/network-log.json`,
        JSON.stringify(artifact, null, 2)
      );
    } catch (err) {
      // Surface to test output but never fail the run on artifact write
      // alone — the underlying test result (pass/fail/skip) is the
      // authoritative signal.
      console.error('afterEach artifact write failed:', err);
    }
  });

  test('steps 0-9 read-only inspection', async ({ page }) => {
    // /sale carries a long-lived SSE notification stream + Playwright
    // production network is slower than local. Allow plenty of slack.
    test.setTimeout(180_000);
    attachNetworkGuard(page);

    // ── Step 0 — auth/session in place ──
    // storageState is applied by test.use; verify by hitting / first.
    await page.goto('/');
    await page.screenshot({
      path: `${SHOT_DIR}/00-login-or-session.png`,
      fullPage: true,
    });
    setStep(0);

    // ── Step 1 — open /sale + verify panels ──
    // Note: /sale layout includes a notification SSE stream
    // (/api/notifications/stream) that keeps the network busy
    // indefinitely. `networkidle` would never fire — use
    // `domcontentloaded` + explicit element waits below instead.
    await page.goto('/sale', { waitUntil: 'domcontentloaded' });
    // Heading text in workspace shell.
    await expect(
      page.getByRole('heading', { name: /Live Sale/i })
    ).toBeVisible({ timeout: 15_000 });

    // Six panel cards by title text (Thai-bilingual).
    // Actual SalePanelCard titles in production (verified via grep on
    // src/components/sale/Sale*Placeholder.tsx). The shell mounts:
    // - Live Sessions / รอบไลฟ์
    // - Product Codes / รหัสสินค้า
    // - Customer Bookings / รายการจอง
    // - Customer Panel / ข้อมูลลูกค้า
    // - Create Order / สร้างออเดอร์
    // - Unified Inbox (Coming Soon)
    const panelTitles = [
      'Live Sessions',
      'Product Codes',
      'Customer Bookings',
      'Customer Panel',
      'Create Order',
      'Unified Inbox',
    ];
    for (const t of panelTitles) {
      await expect(
        page.locator('text=' + t).first()
      ).toBeVisible({ timeout: 10_000 });
    }

    // Wait for booking queue to settle into ready state. The shell
    // fires GET /api/sale/bookings after auto-selecting a session; the
    // panel renders subtitle text that includes "รายการ" once the
    // response arrives (either populated or empty). Without this wait
    // the page screenshot captures the loading skeleton + Step 2
    // checks the DOM before the Manual Create button has had a chance
    // to mount.
    await page.waitForResponse(
      (res) =>
        res.url().includes('/api/sale/bookings') &&
        res.request().method() === 'GET' &&
        res.status() === 200,
      { timeout: 20_000 }
    );
    // After response — give React one tick to commit the new state +
    // mount the Manual Create button.
    await page
      .locator('[class*="border-dashed"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });

    await page.screenshot({
      path: `${SHOT_DIR}/01-sale-page-loaded.png`,
      fullPage: true,
    });
    setStep(1);

    // ── Step 2 — locate Manual Create button ──
    // Discovered during Phase A run: in production code,
    // SaleBookingQueuePlaceholder.tsx returns the empty-state markup
    // before the strip that hosts the Manual Create button. Result:
    // when the selected live session has zero bookings (e.g. fresh
    // session with no parsed comments), the Manual Create button is
    // not rendered at all — admin cannot create the first booking via
    // the UI. Filed as a follow-up.
    //
    // For the smoke run: capture the workspace state, then either
    // skip the remaining steps (no bookings) or continue (bookings
    // present + Manual Create button visible).
    const trigger = page.getByRole('button', {
      name: /สร้าง booking เอง.*Manual Create.*PENDING_REVIEW/i,
    });
    const triggerCount = await trigger.count();
    if (triggerCount === 0) {
      await page.screenshot({
        path: `${SHOT_DIR}/02-manual-create-button-missing.png`,
        fullPage: true,
      });
      markBlocked(
        2,
        'Manual Create button hidden — booking queue empty on auto-selected session. Re-run after seeding ≥1 booking row OR after the empty-queue UX fix (2f52e01) deploys.'
      );
      // afterEach hook persists the artifact regardless of how we exit.
      test.skip(
        true,
        'Manual Create button not present — booking queue empty on auto-selected session. See network-log.json + blockedAtStep.'
      );
      return;
    }
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${SHOT_DIR}/02-manual-create-button.png`,
      fullPage: false,
    });
    setStep(2);

    // ── Step 3 — open modal ──
    await trigger.click();
    const modalTitle = page.getByRole('heading', {
      name: /สร้าง booking เอง \(Manual Create\)/i,
    });
    await expect(modalTitle).toBeVisible({ timeout: 5_000 });

    // Modal fields visible.
    await expect(
      page.getByPlaceholder(/พิมพ์ชื่อ \/ เบอร์ \/ อีเมล/i)
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/กรองด้วย display code/i)
    ).toBeVisible();
    // The phrase "Confirm ภายหลัง" appears twice — once inside the
    // DialogDescription paragraph as part of the explanation, once
    // as the standalone status indicator label. Match the standalone
    // <span> by exact text to avoid strict-mode ambiguity.
    await expect(
      page.getByText('Confirm ภายหลัง', { exact: true })
    ).toBeVisible();
    // Status indicator shows PENDING — locked. CONFIRMED must NOT be present
    // as a selectable control inside the modal.
    const modalScope = page.locator('[role="dialog"]');
    const confirmedRadio = modalScope.getByRole('radio', { name: /CONFIRMED/i });
    expect(await confirmedRadio.count()).toBe(0);
    const submitBtn = modalScope.getByRole('button', {
      name: /สร้าง booking \(PENDING_REVIEW\)/i,
    });
    await expect(submitBtn).toBeDisabled();

    await page.screenshot({
      path: `${SHOT_DIR}/03-manual-create-modal-open.png`,
      fullPage: true,
    });
    setStep(3);

    // ── Step 4 — customer search + PII whitelist ──
    const searchQuery = process.env.PHASE_A_SEARCH_TERM ?? 'a';
    // Compose >= 2 chars (server min). Fall back to 'an' if env is 1 char.
    const effectiveQ = searchQuery.length >= 2 ? searchQuery : 'an';

    const searchResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/sale/customers/search') &&
        res.request().method() === 'GET'
    );
    await page
      .getByPlaceholder(/พิมพ์ชื่อ \/ เบอร์ \/ อีเมล/i)
      .fill(effectiveQ);

    const searchRes = await searchResponsePromise;
    expect(searchRes.status()).toBe(200);
    const searchUrl = searchRes.url();
    expect(searchUrl).toMatch(/\/api\/sale\/customers\/search\?q=/);

    const searchBody = await searchRes.json();
    expect(searchBody.success).toBe(true);
    expect(Array.isArray(searchBody.data?.customers)).toBe(true);

    const customers: ReadonlyArray<Record<string, unknown>> =
      searchBody.data.customers;

    // PII whitelist enforcement — every row exposes only allowed keys.
    for (const c of customers) {
      const keys = Object.keys(c).sort();
      // Expected keys present (allow subset if email/phone are missing — schema is nullable):
      const expectedSet = new Set(ALLOWED_CUSTOMER_KEYS);
      for (const k of keys) {
        expect(
          expectedSet.has(k as (typeof ALLOWED_CUSTOMER_KEYS)[number]),
          `Customer row has unexpected key "${k}". Full row: ${JSON.stringify(c)}`
        ).toBe(true);
      }
      // None of the forbidden PII keys appear.
      for (const forbidden of FORBIDDEN_CUSTOMER_KEYS) {
        expect(
          Object.prototype.hasOwnProperty.call(c, forbidden),
          `Customer row leaks forbidden PII key "${forbidden}".`
        ).toBe(false);
      }
    }

    // Save the PII report next to screenshots for human review.
    const piiReport = {
      endpoint: new URL(searchUrl).pathname + new URL(searchUrl).search,
      status: searchRes.status(),
      rowCount: customers.length,
      allowedKeysObserved: customers[0]
        ? Object.keys(customers[0]).sort()
        : [],
      forbiddenKeysObserved: [] as string[],
    };

    await page.screenshot({
      path: `${SHOT_DIR}/04-customer-search-network.png`,
      fullPage: true,
    });
    setStep(4);

    // Render a small overlay summary onto the page so the screenshot
    // captures the PII verdict in human-readable form.
    await page.evaluate(
      ({ report }) => {
        const div = document.createElement('div');
        div.style.cssText =
          'position:fixed;top:8px;right:8px;z-index:99999;' +
          'padding:12px 16px;background:#111;color:#0f0;' +
          'font:12px/1.4 monospace;border:1px solid #0f0;' +
          'max-width:380px;white-space:pre-wrap;';
        div.textContent = JSON.stringify(report, null, 2);
        div.id = 'phase-a-pii-overlay';
        document.body.appendChild(div);
      },
      { report: piiReport }
    );
    await page.screenshot({
      path: `${SHOT_DIR}/05-customer-search-pii-whitelist.png`,
      fullPage: true,
    });
    await page.evaluate(() => {
      const el = document.getElementById('phase-a-pii-overlay');
      if (el) el.remove();
    });
    setStep(5);

    // ── Step 5 — banned customer state (best-effort) ──
    // The search list renders banned rows with a BANNED badge + the
    // <button> for the row is disabled. If no banned row in result set,
    // we record NOT_AVAILABLE.
    const bannedBadge = page.locator(
      '[role="dialog"] >> text=BANNED'
    );
    const bannedCount = await bannedBadge.count();
    if (bannedCount > 0) {
      const bannedRowButton = bannedBadge.first().locator(
        'xpath=ancestor::button[1]'
      );
      const isDisabled = await bannedRowButton.isDisabled().catch(() => true);
      expect(isDisabled).toBe(true);
      await page.screenshot({
        path: `${SHOT_DIR}/06-banned-customer-state.png`,
        fullPage: true,
      });
    } else {
      // Document NOT_AVAILABLE via a console marker + a screenshot anyway.
      await page.screenshot({
        path: `${SHOT_DIR}/06-banned-customer-state.png`,
        fullPage: true,
      });
    }

    // ── Step 6 — select first non-banned customer ──
    // Locate result list buttons inside dialog. The button is enabled
    // only when the row's customer is not banned (route returns
    // isBanned=true → UI disables button).
    const candidateRows = page.locator(
      '[role="dialog"] ul li button:not([disabled])'
    );
    const candidateCount = await candidateRows.count();
    if (candidateCount === 0) {
      markBlocked(
        6,
        'No selectable customer in search results for the chosen term. Set PHASE_A_SEARCH_TERM env to a term that matches a known non-banned test customer.'
      );
      test.skip(
        true,
        'No selectable customer. See network-log.json + blockedAtStep.'
      );
      return;
    }
    await candidateRows.first().click();

    // Selected customer card visible (has "ล้างการเลือกลูกค้า" clear button).
    await expect(
      page.getByRole('button', { name: 'ล้างการเลือกลูกค้า' })
    ).toBeVisible();
    await page.screenshot({
      path: `${SHOT_DIR}/07-customer-selected.png`,
      fullPage: true,
    });
    setStep(6);

    // ── Step 7 — product filter + select ──
    const productInput = page.getByPlaceholder(/กรองด้วย display code/i);
    await expect(productInput).toBeVisible();

    // First, look at the unfiltered list.
    const productRowsAll = page.locator(
      '[role="dialog"] ul li button:not([disabled])'
    );
    const productAllCount = await productRowsAll.count();
    if (productAllCount === 0) {
      markBlocked(
        7,
        'No BroadcastProduct rows in auto-selected LiveSession. Seed ≥1 product on a LIVE/SCHEDULED session before re-running Phase A for Steps 7-9 coverage.'
      );
      test.skip(
        true,
        'No broadcast products in current session. See network-log.json + blockedAtStep.'
      );
      return;
    }

    // Try a prefix filter that probably narrows. Use first char of first
    // visible displayCode as a generic prefix.
    const firstCodeText = await page
      .locator('[role="dialog"] ul li button:not([disabled])')
      .first()
      .innerText();
    const prefixGuess = (firstCodeText.match(/[A-Za-z0-9]+/)?.[0] ?? 'A').slice(
      0,
      1
    );
    await productInput.fill(prefixGuess);
    await page.waitForTimeout(200);

    // Pick the first product row that's enabled after filtering.
    const productPicked = page.locator(
      '[role="dialog"] ul li button:not([disabled])'
    );
    await productPicked.first().click();

    await expect(
      page.getByRole('button', { name: 'ล้างการเลือกสินค้า' })
    ).toBeVisible();
    await page.screenshot({
      path: `${SHOT_DIR}/08-product-filter-selected.png`,
      fullPage: true,
    });
    setStep(7);

    // ── Step 8 — quantity clamp ──
    const qtyInput = page.locator('[role="dialog"] input[type="number"]');
    await expect(qtyInput).toBeVisible();

    // Try 0 → clamps to 1.
    await qtyInput.fill('0');
    await qtyInput.blur();
    expect(await qtyInput.inputValue()).toBe('1');

    // Try 1000 → clamps to 999.
    await qtyInput.fill('1000');
    await qtyInput.blur();
    expect(await qtyInput.inputValue()).toBe('999');

    // Settle to 2.
    await qtyInput.fill('2');
    await qtyInput.blur();
    expect(await qtyInput.inputValue()).toBe('2');

    await page.screenshot({
      path: `${SHOT_DIR}/09-quantity-clamp.png`,
      fullPage: true,
    });
    setStep(8);

    // ── Step 9 — summary block + final no-submit state ──
    await expect(page.locator('text=รวม').last()).toBeVisible();
    await expect(page.locator('text=PENDING').first()).toBeVisible();

    // Submit button is now enabled (form valid) but DO NOT click.
    const submitBtnFinal = page.getByRole('button', {
      name: /สร้าง booking \(PENDING_REVIEW\)/i,
    });
    await expect(submitBtnFinal).toBeVisible();
    // We do not assert disabled state here — the harden contract is
    // that submit may legitimately be enabled. The contract Phase A
    // verifies is "no POST fired", checked at the end.

    await page.screenshot({
      path: `${SHOT_DIR}/10-summary-block.png`,
      fullPage: true,
    });

    // Close the modal WITHOUT submitting.
    await page.getByRole('button', { name: 'ยกเลิก' }).click();
    await expect(modalTitle).not.toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: `${SHOT_DIR}/11-final-no-submit-state.png`,
      fullPage: true,
    });
    setStep(9);

    // ── Network audit: ZERO mutations against /api/sale/* ──
    const saleMutations = networkLog.filter(
      (e) =>
        (e.path.startsWith('/api/sale/') ||
          e.path.startsWith('/api/customers')) &&
        FORBIDDEN_METHODS.has(e.method)
    );
    expect(
      saleMutations,
      `Mutation requests detected during Phase A: ${JSON.stringify(saleMutations, null, 2)}`
    ).toHaveLength(0);

    expect(
      mutationViolations,
      `Forbidden methods observed during Phase A: ${JSON.stringify(mutationViolations, null, 2)}`
    ).toHaveLength(0);

    // Allowlist check for /api/sale/* GET paths.
    const saleGets = networkLog.filter(
      (e) =>
        (e.path.startsWith('/api/sale/') ||
          e.path.startsWith('/api/customers')) &&
        e.method === 'GET'
    );
    for (const g of saleGets) {
      assertPathAllowed(g.path);
    }

    // Final status guard — even after Step 9 setStep, we still rely on
    // derivePhaseAStatus() in the afterEach hook to be the only source
    // of truth for whether this run earned PHASE_A_PASS. The hook reads
    // mutationViolations + blockedAtStep + stepReached and refuses to
    // print PHASE_A_PASS unless all three line up. console.log here is
    // diagnostic only.
    const finalStatus = derivePhaseAStatus();
    console.log(`=== Phase A status (derived): ${finalStatus} ===`);
  });
});
