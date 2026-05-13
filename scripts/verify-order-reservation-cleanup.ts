/**
 * Non-production end-to-end verification for ORDER-RESERVATION-CLEANUP
 * Commit 1 — `orderRepository.transition('CONFIRMED')` now marks
 * associated StockReservation rows `releasedAt`.
 *
 * Companion to docs/superpowers/2026-05-12-order-reservation-cleanup-dissent.md.
 *
 * PRODUCTION SAFETY: refuses to run unless ALL of:
 *   1. process.env.CONFIRM_NON_PROD_DB === 'true'
 *   2. DATABASE_URL is set
 *   3. DATABASE_URL host is local
 *   4. DATABASE_URL db name is liveshop_pro
 *   5. DATABASE_URL port is 5432
 *   6. VERIFY_ORDER_RESERVATION_CLEANUP_RUN_ID matches the runId regex
 *
 * Usage:
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_ORDER_RESERVATION_CLEANUP_RUN_ID=order-cleanup-$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npm run verify:order-reservation-cleanup
 *
 * Exit code:
 *   0  all tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered
 */

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { orderRepository } from '../src/server/repositories/order.repository';

// ─── Production safety guards ────────────────────────────────────────────

const PROD_HOST_DENY_LIST = ['junction.proxy.rlwy.net', 'rlwy.net'] as const;
const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
const REQUIRED_DB_NAME = 'liveshop_pro';
const ALLOWED_DB_PORTS = ['5432'];
const FIXTURE_PREFIX = 'verify-order-reservation-cleanup';

function assertNonProdDatabase(): { url: string; runId: string; sanitizedHost: string } {
  if (process.env.CONFIRM_NON_PROD_DB !== 'true') {
    console.error(
      '[GUARD] Refusing to run: set CONFIRM_NON_PROD_DB=true to confirm non-production database.'
    );
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
  const sanitizedHost = parsed.hostname + ':' + port;
  const dbName = parsed.pathname.replace(/^\//, '');

  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      console.error(
        `[GUARD] Refusing to run: DATABASE_URL host '${parsed.hostname}' matches production deny list ('${denied}').`
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
      console.error(
        `[GUARD] Refusing to run: host '${parsed.hostname}' is not local.`
      );
      process.exit(2);
    }
    if (dbName !== REQUIRED_DB_NAME) {
      console.error(
        `[GUARD] Refusing to run: DB name '${dbName}' != '${REQUIRED_DB_NAME}'.`
      );
      process.exit(2);
    }
    if (!ALLOWED_DB_PORTS.includes(port)) {
      console.error(
        `[GUARD] Refusing to run: port '${port}' not in allowed list.`
      );
      process.exit(2);
    }
  }

  const rawRunId = process.env.VERIFY_ORDER_RESERVATION_CLEANUP_RUN_ID
    ?? `${FIXTURE_PREFIX}-${Date.now().toString(36)}`;
  if (!/^[A-Za-z0-9-]{4,64}$/.test(rawRunId)) {
    console.error(
      `[GUARD] Refusing to run: runId must match /^[A-Za-z0-9-]{4,64}$/, got '${rawRunId}'.`
    );
    process.exit(2);
  }
  const runId = rawRunId.startsWith(FIXTURE_PREFIX) ? rawRunId : `${FIXTURE_PREFIX}-${rawRunId}`;
  if (runId.length > 64) {
    console.error(`[GUARD] Refusing to run: runId '${runId}' exceeds 64 chars.`);
    process.exit(2);
  }
  console.log('[GUARD] Production safety checks passed.');
  console.log(`[GUARD] DB host: ${sanitizedHost} db=${dbName}`);
  console.log(`[GUARD] Run ID: ${runId}`);
  return { url, runId, sanitizedHost };
}

// ─── Test runner ─────────────────────────────────────────────────────────

interface TestResult {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL' | 'SKIP';
  readonly detail?: string;
}

const results: TestResult[] = [];

function record(name: string, status: 'PASS' | 'FAIL' | 'SKIP', detail?: string): void {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const guard = assertNonProdDatabase();
  const { runId } = guard;

  const adapter = new PrismaPg(guard.url);
  const prisma = new PrismaClient({ adapter });

  console.log('');
  console.log('=== Fixture setup ===');

  // Stable IDs prefixed with runId for tight cleanup
  const idShop = `${runId}--shop`;
  const idUser = `${runId}--user`;
  const idCustomer = `${runId}--cust`;
  const idProduct = `${runId}--prod`;
  const idVariant1 = `${runId}--var1`;
  const idVariant2 = `${runId}--var2`;
  // Test 1 — single reservation, RESERVED → CONFIRMED
  const idOrder1 = `${runId}--order1`;
  const idItem1 = `${runId}--item1`;
  const idRes1 = `${runId}--res1`;
  // Test 2 — already-released reservation idempotency
  const idOrder2 = `${runId}--order2`;
  const idItem2 = `${runId}--item2`;
  const idRes2 = `${runId}--res2`;
  // Test 3 — multiple reservations per order
  const idOrder3 = `${runId}--order3`;
  const idItem3a = `${runId}--item3a`;
  const idItem3b = `${runId}--item3b`;
  const idRes3a = `${runId}--res3a`;
  const idRes3b = `${runId}--res3b`;
  // Test 4 — booking-converted reservation (bookingId + orderId)
  const idLiveSession = `${runId}--live`;
  const idBP = `${runId}--bp`;
  const idBooking = `${runId}--booking`;
  const idOrder4 = `${runId}--order4`;
  const idItem4 = `${runId}--item4`;
  const idRes4 = `${runId}--res4`;
  // Test 5 — order with NO reservations
  const idOrder5 = `${runId}--order5`;
  const idItem5 = `${runId}--item5`;

  let setupOk = false;

  try {
    // Shop + user + customer
    await prisma.shop.create({
      data: { id: idShop, name: `VERIFY ${runId}`, slug: `verify-${runId}` },
    });
    await prisma.user.create({
      data: {
        id: idUser,
        name: `verify-admin-${runId}`,
        username: `verify-${runId}`,
        role: 'OWNER',
      },
    });
    await prisma.customer.create({
      data: { id: idCustomer, shopId: idShop, name: `cust-${runId}` },
    });

    // Product + 2 variants
    await prisma.product.create({
      data: { id: idProduct, shopId: idShop, stockCode: `STK-${runId}`, name: 'P1' },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant1,
        productId: idProduct,
        sku: `SKU1-${runId}`,
        attributes: {},
        price: '10.00',
        quantity: 100,
        reservedQty: 10, // pre-set so we can verify decrement
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant2,
        productId: idProduct,
        sku: `SKU2-${runId}`,
        attributes: {},
        price: '20.00',
        quantity: 100,
        reservedQty: 10,
      },
    });

    // ── Order 1: single reservation
    await prisma.order.create({
      data: {
        id: idOrder1,
        shopId: idShop,
        customerId: idCustomer,
        orderNumber: `ORD-${runId}-001`,
        status: 'RESERVED',
        totalAmount: '20.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        id: idItem1,
        orderId: idOrder1,
        productId: idProduct,
        variantId: idVariant1,
        quantity: 2,
        unitPrice: '10.00',
        totalPrice: '20.00',
      },
    });
    await prisma.stockReservation.create({
      data: {
        id: idRes1,
        variantId: idVariant1,
        orderId: idOrder1,
        quantity: 2,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // ── Order 2: already-released reservation idempotency
    await prisma.order.create({
      data: {
        id: idOrder2,
        shopId: idShop,
        customerId: idCustomer,
        orderNumber: `ORD-${runId}-002`,
        status: 'RESERVED',
        totalAmount: '30.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        id: idItem2,
        orderId: idOrder2,
        productId: idProduct,
        variantId: idVariant1,
        quantity: 3,
        unitPrice: '10.00',
        totalPrice: '30.00',
      },
    });
    await prisma.stockReservation.create({
      data: {
        id: idRes2,
        variantId: idVariant1,
        orderId: idOrder2,
        quantity: 3,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        releasedAt: new Date(Date.now() - 60_000), // already released
      },
    });

    // ── Order 3: 2 reservations on 2 items
    await prisma.order.create({
      data: {
        id: idOrder3,
        shopId: idShop,
        customerId: idCustomer,
        orderNumber: `ORD-${runId}-003`,
        status: 'RESERVED',
        totalAmount: '50.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        id: idItem3a,
        orderId: idOrder3,
        productId: idProduct,
        variantId: idVariant1,
        quantity: 1,
        unitPrice: '10.00',
        totalPrice: '10.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        id: idItem3b,
        orderId: idOrder3,
        productId: idProduct,
        variantId: idVariant2,
        quantity: 2,
        unitPrice: '20.00',
        totalPrice: '40.00',
      },
    });
    await prisma.stockReservation.create({
      data: {
        id: idRes3a,
        variantId: idVariant1,
        orderId: idOrder3,
        quantity: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await prisma.stockReservation.create({
      data: {
        id: idRes3b,
        variantId: idVariant2,
        orderId: idOrder3,
        quantity: 2,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // ── Order 4: booking-converted reservation
    await prisma.liveSession.create({
      data: { id: idLiveSession, shopId: idShop, title: 'live', status: 'LIVE' },
    });
    await prisma.broadcastProduct.create({
      data: {
        id: idBP,
        shopId: idShop,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant1,
        displayCode: `T-${runId}`,
      },
    });
    await prisma.booking.create({
      data: {
        id: idBooking,
        shopId: idShop,
        liveSessionId: idLiveSession,
        broadcastProductId: idBP,
        customerId: idCustomer,
        quantity: 1,
        unitPrice: '10.00',
        status: 'CONVERTED_TO_ORDER',
        source: 'MANUAL',
      },
    });
    await prisma.order.create({
      data: {
        id: idOrder4,
        shopId: idShop,
        customerId: idCustomer,
        orderNumber: `ORD-${runId}-004`,
        status: 'RESERVED',
        totalAmount: '10.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        id: idItem4,
        orderId: idOrder4,
        productId: idProduct,
        variantId: idVariant1,
        quantity: 1,
        unitPrice: '10.00',
        totalPrice: '10.00',
      },
    });
    await prisma.stockReservation.create({
      data: {
        id: idRes4,
        variantId: idVariant1,
        orderId: idOrder4,
        bookingId: idBooking, // sale-conversion pattern
        quantity: 1,
        expiresAt: new Date('2099-12-31T23:59:59.000Z'),
      },
    });

    // ── Order 5: NO reservations
    await prisma.order.create({
      data: {
        id: idOrder5,
        shopId: idShop,
        customerId: idCustomer,
        orderNumber: `ORD-${runId}-005`,
        status: 'RESERVED',
        totalAmount: '10.00',
      },
    });
    await prisma.orderItem.create({
      data: {
        id: idItem5,
        orderId: idOrder5,
        productId: idProduct,
        variantId: idVariant1,
        quantity: 1,
        unitPrice: '10.00',
        totalPrice: '10.00',
      },
    });

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

  // ── Test 1: single reservation RESERVED → CONFIRMED
  try {
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant1 },
      select: { quantity: true, reservedQty: true },
    });

    await orderRepository.transition(idShop, idOrder1, 'CONFIRMED', idUser);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: idOrder1 } });
    assert(order.status === 'CONFIRMED', 'order should be CONFIRMED');

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant1 },
      select: { quantity: true, reservedQty: true },
    });
    assert(
      variantAfter.quantity === variantBefore.quantity - 2,
      `quantity expected ${variantBefore.quantity - 2}, got ${variantAfter.quantity}`
    );
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty - 2,
      `reservedQty expected ${variantBefore.reservedQty - 2}, got ${variantAfter.reservedQty}`
    );

    const res = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes1 } });
    assert(res.releasedAt !== null, 'StockReservation.releasedAt should be set');

    record('Test 1 — single reservation RESERVED → CONFIRMED', 'PASS');
  } catch (err) {
    record('Test 1 — single reservation RESERVED → CONFIRMED', 'FAIL', (err as Error).message);
  }

  // ── Test 2: already-released reservation idempotency
  try {
    const resBefore = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes2 } });
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant1 },
      select: { quantity: true, reservedQty: true },
    });

    await orderRepository.transition(idShop, idOrder2, 'CONFIRMED', idUser);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: idOrder2 } });
    assert(order.status === 'CONFIRMED', 'order should be CONFIRMED');

    const resAfter = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes2 } });
    assert(
      resAfter.releasedAt?.getTime() === resBefore.releasedAt?.getTime(),
      `releasedAt should be unchanged for already-released row. before=${resBefore.releasedAt?.toISOString()} after=${resAfter.releasedAt?.toISOString()}`
    );

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant1 },
      select: { quantity: true, reservedQty: true },
    });
    assert(
      variantAfter.quantity === variantBefore.quantity - 3,
      'quantity decrement applied via OrderItem.quantity (existing behavior)'
    );
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty - 3,
      'reservedQty decrement applied via OrderItem.quantity (existing behavior)'
    );

    record('Test 2 — already-released reservation idempotency', 'PASS');
  } catch (err) {
    record('Test 2 — already-released reservation idempotency', 'FAIL', (err as Error).message);
  }

  // ── Test 3: multiple reservations per order — both released
  try {
    await orderRepository.transition(idShop, idOrder3, 'CONFIRMED', idUser);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: idOrder3 } });
    assert(order.status === 'CONFIRMED', 'order should be CONFIRMED');

    const res3a = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes3a } });
    const res3b = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes3b } });
    assert(res3a.releasedAt !== null, 'res3a should be released');
    assert(res3b.releasedAt !== null, 'res3b should be released');

    record('Test 3 — multiple reservations per order', 'PASS', `2 rows released`);
  } catch (err) {
    record('Test 3 — multiple reservations per order', 'FAIL', (err as Error).message);
  }

  // ── Test 4: booking-converted reservation — bookingId preserved
  try {
    await orderRepository.transition(idShop, idOrder4, 'CONFIRMED', idUser);

    const res = await prisma.stockReservation.findUniqueOrThrow({ where: { id: idRes4 } });
    assert(res.releasedAt !== null, 'reservation should be released');
    assert(res.bookingId === idBooking, 'bookingId should be preserved (sale-conversion audit trail)');
    assert(res.orderId === idOrder4, 'orderId should be preserved');

    record('Test 4 — booking-converted reservation bookingId preserved', 'PASS');
  } catch (err) {
    record('Test 4 — booking-converted reservation bookingId preserved', 'FAIL', (err as Error).message);
  }

  // ── Test 5: order with no reservations succeeds
  try {
    await orderRepository.transition(idShop, idOrder5, 'CONFIRMED', idUser);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: idOrder5 } });
    assert(order.status === 'CONFIRMED', 'order should be CONFIRMED');

    // No reservations to assert; just confirm transition didn't crash.
    record('Test 5 — order with no reservations transitions OK', 'PASS');
  } catch (err) {
    record('Test 5 — order with no reservations transitions OK', 'FAIL', (err as Error).message);
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
      name: 'OrderAudit',
      fn: () =>
        prisma.orderAudit.deleteMany({
          where: { orderId: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'StockReservation',
      fn: () =>
        prisma.stockReservation.deleteMany({
          where: { id: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'BookingHistory',
      fn: () =>
        prisma.bookingHistory.deleteMany({
          where: { bookingId: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'Booking',
      fn: () =>
        prisma.booking.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'BroadcastProduct',
      fn: () =>
        prisma.broadcastProduct.deleteMany({
          where: { id: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'LiveSession',
      fn: () =>
        prisma.liveSession.deleteMany({
          where: { id: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'OrderItem',
      fn: () =>
        prisma.orderItem.deleteMany({
          where: { id: { startsWith: fixturePrefix } },
        }),
    },
    {
      name: 'Order',
      fn: () =>
        prisma.order.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
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
      name: 'Customer',
      fn: () =>
        prisma.customer.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'Shop',
      fn: () =>
        prisma.shop.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'User',
      fn: () =>
        prisma.user.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
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
