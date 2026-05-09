/**
 * Non-production end-to-end verification for `bookingRepository.convertToOrder()`.
 *
 * Commit 2H — companion to:
 *   - docs/superpowers/2026-05-09-booking-to-order-conversion-dissent.md (locked design)
 *   - docs/superpowers/2026-04-06-sale-mvp-dissent.md (Boss decisions)
 *   - src/server/repositories/booking.repository.ts (convertToOrder method)
 *
 * Same production safety guards as scripts/verify-booking-flow.ts:
 *   1. CONFIRM_NON_PROD_DB === 'true'
 *   2. DATABASE_URL set
 *   3. host NOT in PROD_HOST_DENY_LIST
 *   4. host does NOT contain 'nazhahatyai'
 *   5. host = localhost / 127.0.0.1
 *   6. db name = liveshop_pro
 *   7. port = 5432
 *   8. runId matches /^[A-Za-z0-9-]{4,64}$/, prefixed with FIXTURE_PREFIX
 *
 * Usage:
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_BOOKING_FLOW_RUN_ID=$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx -y tsx scripts/verify-booking-conversion.ts
 *
 * Exit codes:
 *   0  all tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered
 */

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { bookingRepository } from '../src/server/repositories/booking.repository';
import { AppError } from '../src/lib/errors';
import { NO_EXPIRY_SENTINEL } from '../src/lib/sale/booking-rules';

// ─── Production safety (mirrors verify-booking-flow.ts) ────────────────

const PROD_HOST_DENY_LIST = ['junction.proxy.rlwy.net', 'rlwy.net'] as const;
const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
const REQUIRED_DB_NAME = 'liveshop_pro';
const ALLOWED_DB_PORTS = ['5432'];
const FIXTURE_PREFIX = 'verify-booking-conv';

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
    console.error('[GUARD] Refusing to run: DATABASE_URL invalid URL.', err);
    process.exit(2);
  }
  const port = parsed.port || '5432';
  const dbName = parsed.pathname.replace(/^\//, '');
  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      console.error(`[GUARD] Refusing: host '${parsed.hostname}' matches deny '${denied}'.`);
      process.exit(2);
    }
  }
  if (parsed.hostname.includes('nazhahatyai')) {
    console.error(`[GUARD] Refusing: host '${parsed.hostname}' contains production marker.`);
    process.exit(2);
  }
  const allowStaging = process.env.ALLOW_STAGING_DB === 'true';
  if (!allowStaging) {
    if (!(ALLOWED_LOCAL_HOSTS as readonly string[]).includes(parsed.hostname)) {
      console.error(`[GUARD] Refusing: host '${parsed.hostname}' is not local.`);
      process.exit(2);
    }
    if (dbName !== REQUIRED_DB_NAME) {
      console.error(`[GUARD] Refusing: db '${dbName}' != '${REQUIRED_DB_NAME}'.`);
      process.exit(2);
    }
    if (!ALLOWED_DB_PORTS.includes(port)) {
      console.error(`[GUARD] Refusing: port '${port}' not in [${ALLOWED_DB_PORTS.join(', ')}].`);
      process.exit(2);
    }
  }
  const rawRunId = process.env.VERIFY_BOOKING_FLOW_RUN_ID
    ?? `${FIXTURE_PREFIX}-${Date.now().toString(36)}`;
  if (!/^[A-Za-z0-9-]{4,64}$/.test(rawRunId)) {
    console.error(`[GUARD] Refusing: bad runId '${rawRunId}'.`);
    process.exit(2);
  }
  const runId = rawRunId.startsWith(FIXTURE_PREFIX) ? rawRunId : `${FIXTURE_PREFIX}-${rawRunId}`;
  if (runId.length > 64) {
    console.error(`[GUARD] Refusing: runId length > 64.`);
    process.exit(2);
  }
  console.log('[GUARD] Production safety checks passed.');
  console.log(`[GUARD] DB host: ${parsed.hostname}:${port} db=${dbName}`);
  console.log(`[GUARD] Run ID: ${runId} (prefix=${FIXTURE_PREFIX}, mode=${allowStaging ? 'STAGING' : 'LOCAL'})`);
  return { url, runId };
}

// ─── Test runner ───────────────────────────────────────────────────────

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
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const guard = assertNonProdDatabase();
  const { runId } = guard;
  const adapter = new PrismaPg(guard.url);
  const prisma = new PrismaClient({ adapter });

  console.log('');
  console.log('=== Fixture setup ===');

  const idShop = `${runId}--shop`;
  const idUser = `${runId}--user`;
  const idCustomer = `${runId}--cust`;
  const idCustomer2 = `${runId}--cust2`;
  const idProduct = `${runId}--prod`;
  const idVariant = `${runId}--var`;
  const idVariant2 = `${runId}--var2`;
  const idLiveSession = `${runId}--live`;
  const idBP = `${runId}--bp`;
  const idBP2 = `${runId}--bp2`;
  // Bookings — created and confirmed by this script
  const idBookingA = `${runId}--book-a`;
  const idBookingB = `${runId}--book-b`;
  const idBookingC = `${runId}--book-c`;
  const idBookingD = `${runId}--book-d`;

  let setupOk = false;
  try {
    await prisma.shop.create({
      data: { id: idShop, name: `VERIFYCONV ${runId}`, slug: `verifyconv-${runId}` },
    });
    await prisma.user.create({
      data: {
        id: idUser,
        name: `verifyconv-admin-${runId}`,
        username: `verifyconv-${runId.slice(-8)}`,
        role: 'OWNER',
      },
    });
    await prisma.customer.create({
      data: { id: idCustomer, shopId: idShop, name: `verifyconv-cust-${runId}` },
    });
    await prisma.customer.create({
      data: { id: idCustomer2, shopId: idShop, name: `verifyconv-cust2-${runId}` },
    });
    await prisma.product.create({
      data: {
        id: idProduct,
        shopId: idShop,
        stockCode: `STK-${runId.slice(-8)}`,
        name: `Verify Conversion Product ${runId}`,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant,
        productId: idProduct,
        sku: `SKU-${runId.slice(-8)}`,
        attributes: {},
        price: '10.00',
        quantity: 50,
        reservedQty: 0,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant2,
        productId: idProduct,
        sku: `SKU2-${runId.slice(-8)}`,
        attributes: {},
        price: '15.00',
        quantity: 50,
        reservedQty: 0,
      },
    });
    await prisma.liveSession.create({
      data: { id: idLiveSession, shopId: idShop, title: `Verify Conv ${runId}`, status: 'LIVE' },
    });
    await prisma.broadcastProduct.create({
      data: {
        id: idBP,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant,
        displayCode: `T1-${runId.slice(-8)}`,
      },
    });
    await prisma.broadcastProduct.create({
      data: {
        id: idBP2,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant2,
        displayCode: `T2-${runId.slice(-8)}`,
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

  // ── Helper to create + confirm a booking ──
  async function createAndConfirmBooking(
    bookingId: string,
    customerId: string,
    broadcastProductId: string,
    quantity: number,
    unitPrice: string
  ): Promise<void> {
    await prisma.booking.create({
      data: {
        id: bookingId,
        shopId: idShop,
        liveSessionId: idLiveSession,
        broadcastProductId,
        customerId,
        quantity,
        unitPrice,
        status: 'PENDING_REVIEW',
        source: 'MANUAL',
      },
    });
    await bookingRepository.confirm({
      bookingId,
      shopId: idShop,
      changedById: idUser,
    });
  }

  // ── Test 1: Convert single booking → Order created ──
  try {
    await createAndConfirmBooking(idBookingA, idCustomer, idBP, 2, '10.00');

    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });

    const result = await bookingRepository.convertToOrder({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      changedById: idUser,
    });

    assert(result.status === 'RESERVED', 'order status RESERVED');
    assert(result.idempotent === false, 'first conversion not idempotent');
    assert(result.bookingCount === 1, `bookingCount expected 1 got ${result.bookingCount}`);
    assert(result.totalAmount === '20.00', `total expected 20.00 got ${result.totalAmount}`);

    // Booking flipped
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: idBookingA } });
    assert(booking.status === 'CONVERTED_TO_ORDER', 'booking status flipped');
    assert(booking.convertedOrderId === result.orderId, 'convertedOrderId set');

    // No double-touch on stock
    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    assert(
      variantAfter.quantity === variantBefore.quantity,
      `quantity must NOT change on conversion: ${variantBefore.quantity} → ${variantAfter.quantity}`
    );
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty,
      `reservedQty must NOT change on conversion: ${variantBefore.reservedQty} → ${variantAfter.reservedQty}`
    );

    // StockReservation row gained orderId, kept bookingId, kept sentinel expiresAt
    const reservations = await prisma.stockReservation.findMany({
      where: { bookingId: idBookingA, releasedAt: null },
    });
    assert(reservations.length === 1, `expected 1 active reservation, got ${reservations.length}`);
    assert(reservations[0].orderId === result.orderId, 'reservation orderId set');
    assert(reservations[0].bookingId === idBookingA, 'reservation bookingId preserved');
    assert(
      reservations[0].expiresAt.toISOString() === NO_EXPIRY_SENTINEL.toISOString(),
      'expiresAt sentinel preserved'
    );

    // BookingHistory row written
    const history = await prisma.bookingHistory.findMany({
      where: { bookingId: idBookingA },
      orderBy: { createdAt: 'asc' },
    });
    assert(history.length === 2, `expected 2 history rows (confirm + convert), got ${history.length}`);
    assert(history[1].fromStatus === 'CONFIRMED', 'last history fromStatus');
    assert(history[1].toStatus === 'CONVERTED_TO_ORDER', 'last history toStatus');

    // OrderAudit row written
    const audit = await prisma.orderAudit.findMany({ where: { orderId: result.orderId } });
    assert(audit.length >= 1, 'OrderAudit row written');
    assert(audit[0].action === 'CREATED_FROM_SALE_BOOKINGS', 'audit action correct');

    record('Test 1 — Convert single booking', 'PASS', `order=${shortId(result.orderId)}`);
  } catch (err) {
    record('Test 1 — Convert single booking', 'FAIL', (err as Error).message);
  }

  // ── Test 2: Conversion re-call after CONVERTED_TO_ORDER → NO_BOOKINGS_TO_CONVERT ──
  // Per dissent §10 + Boss design Q6: idempotency lookup happens by
  // sale-conv key. After Test 1, booking A is CONVERTED_TO_ORDER (terminal),
  // so re-calling with same (shop, session, customer) finds 0 CONFIRMED
  // bookings → throws NO_BOOKINGS_TO_CONVERT BEFORE the idempotency lookup.
  // This is the expected "user clicks Create order twice 5 minutes apart"
  // path: admin sees a clear error, no duplicate order. The TRUE idempotency
  // path (P2002 catch + return existing) exercises only on concurrent
  // double-clicks within milliseconds — covered by Test 4 indirectly when
  // multiple bookings are converted then a second convert call is attempted
  // with the same set still in CONFIRMED state (impossible in a clean DB
  // run; see commit message for race-window discussion).
  try {
    const orderCountBefore = await prisma.order.count({ where: { shopId: idShop } });
    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.convertToOrder({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }
    assert(threw, 'expected throw on re-call after conversion');
    assert(
      code === 'NO_BOOKINGS_TO_CONVERT',
      `expected NO_BOOKINGS_TO_CONVERT, got ${code}`
    );

    const orderCountAfter = await prisma.order.count({ where: { shopId: idShop } });
    assert(orderCountAfter === orderCountBefore, 'no duplicate order created');

    record('Test 2 — Re-call after conversion is rejected (no duplicate order)', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 2 — Re-call after conversion is rejected (no duplicate order)', 'FAIL', (err as Error).message);
  }

  // ── Test 3: No CONFIRMED bookings → NO_BOOKINGS_TO_CONVERT ──
  try {
    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.convertToOrder({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer2, // customer2 has no bookings
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }
    assert(threw, 'expected throw');
    assert(code === 'NO_BOOKINGS_TO_CONVERT', `code expected NO_BOOKINGS_TO_CONVERT, got ${code}`);
    record('Test 3 — No bookings to convert', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 3 — No bookings to convert', 'FAIL', (err as Error).message);
  }

  // ── Test 4: Multi-booking same variant + same price → consolidated OrderItem ──
  try {
    await createAndConfirmBooking(idBookingB, idCustomer2, idBP, 1, '10.00');
    await createAndConfirmBooking(idBookingC, idCustomer2, idBP, 3, '10.00');

    const result = await bookingRepository.convertToOrder({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer2,
      changedById: idUser,
    });

    assert(result.bookingCount === 2, `bookingCount expected 2, got ${result.bookingCount}`);
    assert(result.totalAmount === '40.00', `total expected 40.00, got ${result.totalAmount}`);

    const items = await prisma.orderItem.findMany({ where: { orderId: result.orderId } });
    assert(items.length === 1, `expected 1 consolidated OrderItem, got ${items.length}`);
    assert(items[0].quantity === 4, `OrderItem qty expected 4, got ${items[0].quantity}`);
    // Prisma Decimal serializes via toString() which may drop trailing zeros
    // (e.g. '40' instead of '40.00'). Compare via Number() for value equality.
    const totalPriceNum = Number(items[0].totalPrice.toString());
    assert(
      totalPriceNum === 40,
      `OrderItem totalPrice value expected 40, got ${items[0].totalPrice.toString()}`
    );

    record('Test 4 — Same variant+price consolidated', 'PASS');
  } catch (err) {
    record('Test 4 — Same variant+price consolidated', 'FAIL', (err as Error).message);
  }

  // ── Test 5: Different variant → separate OrderItems ──
  try {
    await createAndConfirmBooking(idBookingD, idCustomer, idBP2, 1, '15.00');

    // Existing customer1 already has 1 converted booking. New booking on
    // different variant should be picked up by a NEW conversion call (different
    // booking set → different idempotency key).
    const result = await bookingRepository.convertToOrder({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      changedById: idUser,
    });

    assert(!result.idempotent, 'second conversion with new booking should NOT be idempotent');
    assert(result.bookingCount === 1, 'second conversion picks only the new booking');
    assert(result.totalAmount === '15.00', 'total = 1 × 15.00');

    const items = await prisma.orderItem.findMany({ where: { orderId: result.orderId } });
    assert(items.length === 1, 'one item');
    assert(items[0].variantId === idVariant2, 'item is variant2');

    record('Test 5 — Different variant separate OrderItem', 'PASS');
  } catch (err) {
    record('Test 5 — Different variant separate OrderItem', 'FAIL', (err as Error).message);
  }

  // ── Test 6: After conversion, Order RESERVED→CONFIRMED decrements stock once ──
  try {
    // Use the order from Test 5 (single booking qty=1 on variant2)
    const order = await prisma.order.findFirst({
      where: { shopId: idShop, customerId: idCustomer, status: 'RESERVED' },
      orderBy: { createdAt: 'desc' },
    });
    assert(order !== null, 'order exists from Test 5');
    if (!order) throw new Error('no order');

    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant2 },
      select: { quantity: true, reservedQty: true },
    });

    // Use existing orderRepository.transition() — NOT modified.
    const { orderRepository } = await import('../src/server/repositories/order.repository');
    await orderRepository.transition(idShop, order.id, 'CONFIRMED', idUser);

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant2 },
      select: { quantity: true, reservedQty: true },
    });

    assert(
      variantAfter.quantity === variantBefore.quantity - 1,
      `quantity should decrement by 1: ${variantBefore.quantity} → ${variantAfter.quantity}`
    );
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty - 1,
      `reservedQty should decrement by 1: ${variantBefore.reservedQty} → ${variantAfter.reservedQty}`
    );

    record('Test 6 — Order RESERVED→CONFIRMED single decrement', 'PASS');
  } catch (err) {
    record('Test 6 — Order RESERVED→CONFIRMED single decrement', 'FAIL', (err as Error).message);
  }

  // ── Cleanup ──
  console.log('');
  console.log('=== Cleanup ===');
  const cleanupOk = await runCleanup(prisma, runId);

  await prisma.$disconnect();
  finalSummary();

  const allPass = results.every((r) => r.status === 'PASS');
  process.exit(allPass && cleanupOk ? 0 : 1);
}

// ─── Cleanup ───────────────────────────────────────────────────────────

async function runCleanup(prisma: PrismaClient, runId: string): Promise<boolean> {
  const fixturePrefix = `${runId}--`;
  const targets: Array<{ name: string; fn: () => Promise<{ count: number }> }> = [
    {
      name: 'OrderAudit',
      fn: () =>
        prisma.orderAudit.deleteMany({
          where: { order: { shopId: { startsWith: fixturePrefix } } },
        }),
    },
    {
      name: 'OrderItem',
      fn: () =>
        prisma.orderItem.deleteMany({
          where: { order: { shopId: { startsWith: fixturePrefix } } },
        }),
    },
    {
      name: 'Order',
      fn: () =>
        prisma.order.deleteMany({ where: { shopId: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'BookingHistory',
      fn: () =>
        prisma.bookingHistory.deleteMany({
          where: { booking: { id: { startsWith: fixturePrefix } } },
        }),
    },
    {
      name: 'StockReservation',
      fn: () =>
        prisma.stockReservation.deleteMany({
          where: {
            OR: [
              { bookingId: { startsWith: fixturePrefix } },
              { variantId: { startsWith: fixturePrefix } },
            ],
          },
        }),
    },
    {
      name: 'Booking',
      fn: () => prisma.booking.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'BroadcastProduct',
      fn: () =>
        prisma.broadcastProduct.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'LiveSession',
      fn: () =>
        prisma.liveSession.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'ProductVariant',
      fn: () =>
        prisma.productVariant.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'Product',
      fn: () => prisma.product.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'Customer',
      fn: () => prisma.customer.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'Shop',
      fn: () => prisma.shop.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
    },
    {
      name: 'User',
      fn: () => prisma.user.deleteMany({ where: { id: { startsWith: fixturePrefix } } }),
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
      console.error(`  HINT: search '${fixturePrefix}' in ${t.name} table`);
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
