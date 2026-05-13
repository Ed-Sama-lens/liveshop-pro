/**
 * One-time interactive auth setup for production smoke.
 *
 * Run via:
 *   npx tsx tests/e2e/setup-prod-auth.ts
 *
 * Behavior:
 * 1. Launches a HEADED Chromium window pointed at nazhahatyai.com/login.
 * 2. Waits for Boss to complete login manually (handles 2FA, FB OAuth,
 *    or any custom auth flow without Claude seeing credentials).
 * 3. After Boss reaches /admin or /sale, Boss returns to the terminal
 *    and presses Enter.
 * 4. Saves storageState (cookies + localStorage) to
 *    tests/e2e/.auth/boss-prod-storage-state.json.
 * 5. Browser closes.
 *
 * Security:
 * - storage state contains an active admin session cookie. NEVER commit.
 * - .gitignore excludes tests/e2e/.auth/.
 * - Delete the file after Phase A finishes (instructions in final report).
 *
 * If login fails or Boss aborts (Ctrl+C), no file is written.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as readline from 'node:readline';

const AUTH_FILE = resolve(
  process.cwd(),
  'tests/e2e/.auth/boss-prod-storage-state.json'
);
const LOGIN_URL = 'https://nazhahatyai.com/login';
const SUCCESS_HINT_URL_FRAGMENTS = ['/admin', '/sale', '/dashboard'] as const;

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolveFn) => {
    rl.question(prompt, () => {
      rl.close();
      resolveFn();
    });
  });
}

async function main(): Promise<void> {
  const dir = dirname(AUTH_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  console.log('=================================================');
  console.log('LiveShop Pro — Production auth setup (Phase A)');
  console.log('=================================================');
  console.log(`Launching headed Chromium → ${LOGIN_URL}`);
  console.log('');
  console.log('STEPS:');
  console.log(' 1. Browser window will open.');
  console.log(' 2. Sign in as OWNER or MANAGER admin.');
  console.log(' 3. Navigate to /admin or /sale to confirm logged in.');
  console.log(' 4. Return here and press ENTER to save session.');
  console.log('');
  console.log('SECURITY:');
  console.log(`  Session will be saved to: ${AUTH_FILE}`);
  console.log('  This file is gitignored. DO NOT commit it.');
  console.log('  Delete it after Phase A completes.');
  console.log('=================================================');
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    console.error(`Failed to open ${LOGIN_URL}:`, err);
    await browser.close();
    process.exit(1);
  }

  await waitForEnter(
    '>>> After login is complete + you reached /admin or /sale, press ENTER here to save session... '
  );

  const currentUrl = page.url();
  const ok = SUCCESS_HINT_URL_FRAGMENTS.some((frag) =>
    currentUrl.includes(frag)
  );
  if (!ok) {
    console.warn('');
    console.warn(`WARNING: current URL is ${currentUrl}`);
    console.warn('Does not appear to be /admin or /sale.');
    console.warn(
      'Storage state will still be saved if you continue, but auth may not be valid.'
    );
    console.warn('');
    await waitForEnter(
      '>>> Press ENTER to save anyway, or Ctrl+C to abort... '
    );
  }

  await context.storageState({ path: AUTH_FILE });
  console.log('');
  console.log(`✅ Storage state saved to: ${AUTH_FILE}`);
  console.log('');
  console.log('Next step:');
  console.log(
    '  npx playwright test --config=playwright.prod-smoke.config.ts'
  );
  console.log('');
  console.log('After Phase A smoke finishes, delete the auth file:');
  console.log(`  rm "${AUTH_FILE}"`);
  console.log('');

  await browser.close();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
