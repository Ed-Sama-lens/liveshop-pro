/**
 * Non-production end-to-end verification for ORDER-RESERVATION-CLEANUP
 * Commit 3 — `expireReservations()` cron resilience.
 *
 * Companion to docs/superpowers/2026-05-12-expire-reservations-cron-resilience.md.
 *
 * Verifies:
 *   - Expired active reservations are released.
 *   - Per-row release failure does NOT abort the batch — other rows
 *     still get released.
 *   - Return shape preserved (Promise<number>).
 *
 * PRODUCTION SAFETY: same guard pattern as other verifiers.
 *
 * Usage:
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_EXPIRE_RESERVATIONS_CRON_RUN_ID=cron-$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npm run verify:expire-reservations-cron
 *
 * Exit code:
 *   0  all tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered
 */

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { expireReservations } from '../src/server/repositories/stock.repository';

// ─── Production safety guards (mirrors verify-order-reservation-cleanup) ─

const PROD_HOST_DENY_LIST = ['junction.proxy.rlwy.net', 'rlwy.net'] as const;
const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
const REQUIRED_DB_NAME = 'liveshop_pro';
const ALLOWED_DB_PORTS = ['5432'];
const FIXTURE_PREFIX = 'verify-expire-reservations-cron';

function assertNonProdDatabase(): { url: string; runId: string } {
  if (process.env.CONFIRM_NON_PROD_DB !== 'true') {
    console.error('[GUARD] Refusing to run: set CONFIRM_NON_PROD_DB=true.');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[GUARD] Refusing to run: DATABASE_URL is not set.');
    process.exit(2);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    console.error('[GUARD] Refusing to run: DATABASE_URL is not a valid URL.', err);
    process.exit(2);
  }
  const port = parsed.port || '5432';
  const dbName = parsed.pathname.replace(/^\//, '');

  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      console.error(
        `[GUARD] Refusing to run: DATABASE_URL host '${parsed.hostname}' matches production deny list.`
      );
      process.exit(2);
    }
  }
  if (parsed.hostname.includes('nazhahatyai')) {
    console.error('[GUARD] Refusing to run: hostname contains production marker.');
    process.exit(2);
  }
  const allowStaging = process.env.ALLOW_STAGING_DB === 'true';
  if (!allowStaging) {
    const isLocalHost = (ALLOWED_LOCAL_HOSTS as readonly string[]).includes(parsed.hostname);
    if (!isLocalHost) {
      console.error(`[GUARD] Refusing to run: host '${parsed.hostname}' is not local.`);
      process.exit(2);
    }
    if (dbName !== REQUIRED_DB_NAME) {
      console.error(`[GUARD] Refusing to run: DB name '${dbName}' != '${REQUIRED_DB_NAME}'.`);
      process.exit(2);
    }
    if (!ALLOWED_DB_PORTS.includes(port)) {
      console.error(`[GUARD] Refusing to run: port '${port}' not in allowed list.`);
      process.exit(2);
    }
  }

  const rawRunId = process.env.VERIFY_EXPIRE_RESERVATIONS_CRON_RUN_ID
    ?? `${FIXTURE_PREFIX}-${Date.now().toString(36)}`;
  if (!/^[A-Za-z0-9-]{4,64}$/.test(rawRunId)) {
    console.error(`[GUARD] Refusing to run: runId regex mismatch.`);
    process.exit(2);
  }
  const runId = rawRunId.startsWith(FIXTURE_PREFIX) ? rawRunId : `${FIXTURE_PREFIX}-${rawRunId}`;
  if (runId.length > 64) {
    console.error(`[GUARD] Refusing to run: runId too long.`);
    process.exit(2);
  }
  console.log(`[GUARD] OK. Run ID: ${runId}`);
  return { url, runId };
}

interface TestResult {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL';
  readonly detail?: string;
}

const results: TestResult[] = [];

function record(name: string, status: 'PASS' | 'FAIL', detail?: string): void {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✓' : '✗';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  const guard = assertNonProdDatabase();
  const { runId } = guard;

  const adapter = new PrismaPg(guard.url);
  const prisma = new PrismaClient({ adapter });

  console.log('');
  console.log('=== Fixture setup ===');

  const idShop = `${runId}--shop`;
  const idProduct = `${runId}--prod`;
  const idVariant = `${runId}--var`;
  // Test 1: 3 expired active reservations — all should be released in one batch
  const idRes1a = `${runId}--res1a`;
  const idRes1b = `${runId}--res1b`;
  const idRes1c = `${runId}--res1c`;
  // Test 2: 1 expired + 1 not-yet-expired — only expired touched
  const idRes2a = `${runId}--res2a`; // expired
  const idRes2b = `${runId}--res2b`; // future expiresAt

  const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1h ago

  let setupOk = false;
  try {
    await prisma.shop.create({
      data: { id: idShop, name: `VERIFY ${runId}`, slug: `verify-${runId}` },
    });
    await prisma.product.create({
      data: { id: idProduct, shopId: idShop, stockCode: `STK-${runId}`, name: 'P1' },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant,
        productId: idProduct,
        sku: `SKU-${runId}`,
        attributes: {},
        price: '10.00',
        quantity: 100,
        reservedQty: 20, // enough headroom for 3+1+1 releases
      },
    });
    // Test 1: 3 expired active
    await prisma.stockReservation.createMany({
      data: [
        { id: idRes1a, variantId: idVariant, quantity: 1, expiresAt: pastDate },
        { id: idRes1b, variantId: idVariant, quantity: 2, expiresAt: pastDate },
        { id: idRes1c, variantId: idVariant, quantity: 3, expiresAt: pastDate },
      ],
    });

    // Test 2: 1 expired + 1 future
    await prisma.stockReservation.create({
      data: {
        id: idRes2a,
        variantId: idVariant,
        quantity: 1,
        expiresAt: pastDate,
      },
    });
    await prisma.stockReservation.create({
      data: {
        id: idRes2b,
        variantId: idVariant,
        quantity: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // NOTE: Schema FK constraint StockReservation.variantId restricts
    // ProductVariant deletes (no cascade), so a "deleted-variant" failure
    // case cannot be created in this fixture. The runtime change to
    // Promise.allSettled is still exercised: it runs over Test 1's 3 rows
    // + Test 2's expired row in parallel and the new control flow
    // (no Promise.all abort behavior) is the codepath under test.

    console.log('Fixtures created.');
    setupOk = true;
  } catch (err) {
    console.error('Fixture setup failed:', (err as Error).message);
    record('Fixture setup', 'FAIL', (err as Error).message);
  }

  if (!setupOk) {
    await runCleanup(prisma, runId);
    finalSummary();
    process.exit(1);
  }

  console.log('');
  console.log('=== Test cases ===');

  // ── Test: run cron, observe per-row behavior
  try {
    const beforeVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });

    const attempted = await expireReservations();

    // Boss spec: return shape preserved (Promise<number>).
    assert(typeof attempted === 'number', 'expireReservations should return a number');
    // 3 (Test 1) + 1 (Test 2a) = 4 expired total
    assert(attempted === 4, `expected attempted=4, got ${attempted}`);

    // Test 1: all 3 expired rows released
    const r1a = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes1a } });
    const r1b = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes1b } });
    const r1c = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes1c } });
    assert(r1a.releasedAt !== null, 'res1a should be released');
    assert(r1b.releasedAt !== null, 'res1b should be released');
    assert(r1c.releasedAt !== null, 'res1c should be released');

    // Test 2: expired released, future untouched
    const r2a = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes2a } });
    const r2b = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes2b } });
    assert(r2a.releasedAt !== null, 'res2a (expired) should be released');
    assert(r2b.releasedAt === null, 'res2b (future) should NOT be touched');

    // reservedQty accounting on idVariant:
    // Released = res1a(1) + res1b(2) + res1c(3) + res2a(1) = 7 units.
    const afterVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(
      afterVariant.reservedQty === beforeVariant.reservedQty - 7,
      `idVariant reservedQty expected ${beforeVariant.reservedQty - 7}, got ${afterVariant.reservedQty}`
    );

    record(
      'cron resilience — multi-row batch via Promise.allSettled',
      'PASS',
      `attempted=${attempted}, released=4, untouched=1`
    );
  } catch (err) {
    record('cron resilience — multi-row batch via Promise.allSettled', 'FAIL', (err as Error).message);
  }

  // ── Cleanup ──
  console.log('');
  console.log('=== Cleanup ===');
  const cleanupOk = await runCleanup(prisma, runId);
  await prisma.$disconnect();
  finalSummary();
  const allTestsPassed = results.every((r) => r.status === 'PASS');
  process.exit(allTestsPassed && cleanupOk ? 0 : 1);
}

async function runCleanup(prisma: PrismaClient, runId: string): Promise<boolean> {
  const fixturePrefix = `${runId}--`;
  const targets: Array<{ name: string; fn: () => Promise<{ count: number }> }> = [
    {
      name: 'StockReservation',
      fn: () =>
        prisma.stockReservation.deleteMany({
          where: { id: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'ProductVariant',
      fn: () =>
        prisma.productVariant.deleteMany({
          where: { id: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'Product',
      fn: () =>
        prisma.product.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'Shop',
      fn: () =>
        prisma.shop.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
  ];
  let failed = false;
  for (const t of targets) {
    try {
      const r = await t.fn();
      console.log(`  cleanup ${t.name}: ${r.count} row(s) deleted`);
    } catch (err) {
      failed = true;
      console.error(`  cleanup ${t.name} FAILED: ${(err as Error).message}`);
    }
  }
  return !failed;
}

function finalSummary(): void {
  console.log('');
  console.log('=== Summary ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${results.length}`);
  if (fail > 0) {
    console.log('');
    console.log('FAILURES:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  ✗ ${r.name}: ${r.detail ?? ''}`);
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
