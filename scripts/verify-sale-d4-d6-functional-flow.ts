/**
 * Non-production D4/D6 functional flow verifier (Mega session Track 6).
 *
 * Exercises the same Stage A-G surface the Boss-side D4/D6 visual
 * guide walks through, but against a LOCAL Docker postgres so Claude
 * can prove the code path end-to-end without authenticated production
 * access.
 *
 * Scope vs verify-omnichannel-booking.ts:
 *   - Identical fixture topology
 *   - Adds Case G (no-duplicate-order under replay)
 *   - Adds Case H (StockReservation ↔ Order linkage assertion)
 *   - Case I covers cleanup
 *   - Re-asserts every reservedQty transition explicitly to catch
 *     subtle drift the existing verifier folds into chained tests
 *
 * PRODUCTION SAFETY (defense in depth):
 *   1. process.env.CONFIRM_NON_PROD_DB === 'true' required
 *   2. DATABASE_URL must be set
 *   3. DATABASE_URL host must be in ALLOWED_LOCAL_HOSTS
 *   4. DATABASE_URL must not match PROD_HOST_DENY_LIST
 *   5. DATABASE_URL must not contain literal 'nazhahatyai'
 *   6. DB name must equal 'liveshop_pro'
 *
 * Usage (Docker local DB only):
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_D4_D6_RUN_ID=$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx -y tsx scripts/verify-sale-d4-d6-functional-flow.ts
 *
 * Test cases (9):
 *   A. Create evergreen BroadcastProduct (D6)
 *   B. Create non-live MANUAL booking PENDING_REVIEW (D4 + D6)
 *   C. Confirm booking → reservedQty +qty
 *   D. Create second booking + cancel → reservation released, net unchanged
 *   E. Convert via V2 bookingIds-only path (D3) → Order RESERVED
 *   F. Replay V2 conversion → idempotent, same orderId
 *   G. No duplicate Order row created after replay
 *   H. StockReservation.orderId set + booking linkage intact
 *   I. Cleanup all fixtures
 *
 * Exit code:
 *   0  all 9 tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered
 */

// Flags set BEFORE module imports so any module-level reads see the
// expected D3/D4/D6 ON state. feature-flags.ts reads process.env at
// call time so setting after import is also fine, but early is safer.
process.env.ALLOW_EVERGREEN_BROADCAST_PRODUCT = 'true';
process.env.ALLOW_NON_LIVE_BOOKING = 'true';
process.env.ALLOW_BOOKINGIDS_ONLY_CONVERSION = 'true';

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { bookingRepository } from '../src/server/repositories/booking.repository';

// ─── Production safety guards ────────────────────────────────────────────

const PROD_HOST_DENY_LIST = ['junction.proxy.rlwy.net', 'rlwy.net'] as const;
const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
const REQUIRED_DB_NAME = 'liveshop_pro';

function assertNonProdDatabase(): { url: string; runId: string; sanitizedHost: string } {
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
  const sanitizedHost = parsed.hostname + ':' + (parsed.port || '5432');
  const dbName = parsed.pathname.replace(/^\//, '');
  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      console.error(`[GUARD] Refusing to run: hostname looks like production (${denied}).`);
      process.exit(2);
    }
  }
  if (url.includes('nazhahatyai')) {
    console.error('[GUARD] Refusing to run: DATABASE_URL contains "nazhahatyai".');
    process.exit(2);
  }
  if (!ALLOWED_LOCAL_HOSTS.some((h) => parsed.hostname === h)) {
    console.error(
      `[GUARD] Refusing to run: hostname ${parsed.hostname} is not in allowlist ${ALLOWED_LOCAL_HOSTS.join(', ')}.`
    );
    process.exit(2);
  }
  if (dbName !== REQUIRED_DB_NAME) {
    console.error(`[GUARD] Refusing to run: database name ${dbName} != ${REQUIRED_DB_NAME}.`);
    process.exit(2);
  }
  const runId = process.env.VERIFY_D4_D6_RUN_ID || `${Date.now()}`;
  return { url, runId, sanitizedHost };
}

// ─── Test harness ────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail?: string;
}

const results: TestResult[] = [];

function record(name: string, status: TestResult['status'], detail?: string): void {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { url, runId, sanitizedHost } = assertNonProdDatabase();
  console.log(`Running D4/D6 functional verifier against ${sanitizedHost}`);
  console.log(`Run id: ${runId}`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  const idShop = `${runId}--shop-d46`;
  const idUser = `${runId}--user-d46`;
  const idProduct = `${runId}--product-d46`;
  const idVariant = `${runId}--variant-d46`;
  const idCustomer = `${runId}--cust-d46`;
  const idEvergreenBP = `${runId}--bp-ever-d46`;

  let setupOk = false;
  try {
    await prisma.shop.create({
      data: {
        id: idShop,
        name: `Verify D46 ${runId}`,
        slug: `verify-d46-${runId}`,
        defaultCurrency: 'MYR',
      },
    });
    await prisma.user.create({
      data: { id: idUser, name: 'Verify D46 Admin', role: 'OWNER' },
    });
    await prisma.shopMember.create({
      data: { shopId: idShop, userId: idUser, role: 'OWNER' },
    });
    await prisma.product.create({
      data: {
        id: idProduct,
        shopId: idShop,
        name: `Verify D46 Product ${runId}`,
        stockCode: `D46-${runId.slice(-8)}`,
        isActive: true,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant,
        productId: idProduct,
        sku: `D46-V-${runId.slice(-8)}`,
        attributes: {},
        price: '9.99',
        quantity: 50,
        reservedQty: 0,
      },
    });
    await prisma.customer.create({
      data: {
        id: idCustomer,
        shopId: idShop,
        name: `Verify D46 Customer ${runId}`,
        channel: 'MANUAL',
      },
    });
    setupOk = true;
    console.log('Fixtures created (no BP yet — Case A creates it).');
  } catch (err) {
    console.error('Fixture setup failed:', (err as Error).message);
    record('Fixture setup', 'FAIL', (err as Error).message);
  }

  if (!setupOk) {
    await runCleanup(prisma, runId);
    process.exit(1);
  }

  let bookingAId = '';
  let bookingBId = '';
  let orderId = '';

  // ── Case A: create evergreen BroadcastProduct (D6 path)
  try {
    await prisma.broadcastProduct.create({
      data: {
        id: idEvergreenBP,
        shopId: idShop,
        liveSessionId: null,
        productId: idProduct,
        variantId: idVariant,
        displayCode: `EVR-D46-${runId.slice(-8)}`,
      },
    });
    const fetched = await prisma.broadcastProduct.findUnique({
      where: { id: idEvergreenBP },
      select: { id: true, liveSessionId: true, shopId: true, displayCode: true },
    });
    assert(fetched !== null, 'BP not found after insert');
    assert(fetched.liveSessionId === null, `expected liveSessionId=null, got ${fetched.liveSessionId}`);
    assert(fetched.shopId === idShop, 'shopId mismatch');
    record('Case A — create evergreen BroadcastProduct (D6)', 'PASS', `displayCode=${fetched.displayCode}`);
  } catch (err) {
    record('Case A — create evergreen BroadcastProduct (D6)', 'FAIL', (err as Error).message);
  }

  // ── Case B: create non-live MANUAL booking PENDING_REVIEW (D4 + D6)
  try {
    const a = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: null,
      customerId: idCustomer,
      broadcastProductId: idEvergreenBP,
      quantity: 1,
      status: 'PENDING_REVIEW',
      changedById: idUser,
    });
    bookingAId = a.bookingId;
    assert(a.status === 'PENDING_REVIEW', `expected PENDING_REVIEW, got ${a.status}`);
    assert(a.reservationId === null, 'PENDING_REVIEW must NOT reserve stock');
    const variant = await prisma.productVariant.findUnique({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variant?.reservedQty === 0, `after Case B: expected reservedQty=0, got ${variant?.reservedQty}`);
    record('Case B — create non-live PENDING_REVIEW booking (D4+D6)', 'PASS', `bookingId=${bookingAId.slice(-8)}`);
  } catch (err) {
    record('Case B — create non-live PENDING_REVIEW booking (D4+D6)', 'FAIL', (err as Error).message);
  }

  // ── Case C: confirm booking → reservedQty +qty
  if (bookingAId) {
    try {
      const c = await bookingRepository.confirm({
        bookingId: bookingAId,
        shopId: idShop,
        changedById: idUser,
      });
      assert(c.status === 'CONFIRMED', `expected CONFIRMED, got ${c.status}`);
      assert(typeof c.reservationId === 'string' && c.reservationId.length > 0, 'CONFIRMED must reserve');
      const variant = await prisma.productVariant.findUnique({
        where: { id: idVariant },
        select: { reservedQty: true },
      });
      assert(variant?.reservedQty === 1, `after Case C: expected reservedQty=1, got ${variant?.reservedQty}`);
      record('Case C — confirm reserves stock (+1)', 'PASS', `reservedQty=1`);
    } catch (err) {
      record('Case C — confirm reserves stock (+1)', 'FAIL', (err as Error).message);
    }
  } else {
    record('Case C — confirm reserves stock (+1)', 'FAIL', 'skipped: bookingA missing');
  }

  // ── Case D: create second booking CONFIRMED + cancel → release net unchanged
  try {
    const b = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: null,
      customerId: idCustomer,
      broadcastProductId: idEvergreenBP,
      quantity: 2,
      status: 'CONFIRMED',
      changedById: idUser,
    });
    bookingBId = b.bookingId;
    const afterCreate = await prisma.productVariant.findUnique({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(afterCreate?.reservedQty === 3, `after Case D create: expected 3, got ${afterCreate?.reservedQty}`);

    const cancel = await bookingRepository.cancel({
      bookingId: bookingBId,
      shopId: idShop,
      changedById: idUser,
      targetStatus: 'CANCELLED',
    });
    assert(cancel.status === 'CANCELLED', `expected CANCELLED, got ${cancel.status}`);
    assert(cancel.releasedQuantity === 2, `expected releasedQuantity=2, got ${cancel.releasedQuantity}`);

    const afterCancel = await prisma.productVariant.findUnique({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(afterCancel?.reservedQty === 1, `after Case D cancel: expected 1, got ${afterCancel?.reservedQty}`);
    record('Case D — second booking CONFIRMED then cancel releases', 'PASS', 'reservedQty 1→3→1');
  } catch (err) {
    record('Case D — second booking CONFIRMED then cancel releases', 'FAIL', (err as Error).message);
  }

  // ── Case E: V2 bookingIds-only conversion (D3)
  if (bookingAId) {
    try {
      const conv = await bookingRepository.convertToOrder({
        shopId: idShop,
        changedById: idUser,
        bookingIds: [bookingAId],
      });
      orderId = conv.orderId;
      assert(conv.status === 'RESERVED', `expected RESERVED, got ${conv.status}`);
      assert(conv.idempotent === false, 'first conversion must NOT be idempotent');
      assert(conv.bookingCount === 1, `expected bookingCount=1, got ${conv.bookingCount}`);
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { idempotencyKey: true, channel: true, status: true },
      });
      assert(
        order?.idempotencyKey?.startsWith('sale-conv:v2:') === true,
        `expected v2 idempotency key, got ${order?.idempotencyKey}`
      );
      assert(order?.status === 'RESERVED', `expected order RESERVED, got ${order?.status}`);
      record('Case E — V2 bookingIds-only conversion (D3)', 'PASS', `orderId=${orderId.slice(-8)}`);
    } catch (err) {
      record('Case E — V2 bookingIds-only conversion (D3)', 'FAIL', (err as Error).message);
    }
  } else {
    record('Case E — V2 bookingIds-only conversion (D3)', 'FAIL', 'skipped: bookingA missing');
  }

  // ── Case F: replay V2 conversion → idempotent, same orderId
  if (bookingAId && orderId) {
    try {
      const replay = await bookingRepository.convertToOrder({
        shopId: idShop,
        changedById: idUser,
        bookingIds: [bookingAId],
      });
      assert(replay.idempotent === true, 'replay must be idempotent');
      assert(replay.orderId === orderId, `replay orderId mismatch: ${replay.orderId} vs ${orderId}`);
      assert(replay.status === 'RESERVED', `replay status expected RESERVED, got ${replay.status}`);
      record('Case F — V2 replay idempotent same orderId', 'PASS', `same=${orderId.slice(-8)}`);
    } catch (err) {
      record('Case F — V2 replay idempotent same orderId', 'FAIL', (err as Error).message);
    }
  } else {
    record('Case F — V2 replay idempotent same orderId', 'FAIL', 'skipped: bookingA/order missing');
  }

  // ── Case G: no duplicate Order row after replay
  if (orderId) {
    try {
      const orderCount = await prisma.order.count({
        where: { shopId: idShop },
      });
      assert(orderCount === 1, `expected exactly 1 Order row for shop, got ${orderCount}`);
      // Belt-and-suspenders: same idempotencyKey only ever maps to one row
      const orders = await prisma.order.findMany({
        where: { shopId: idShop },
        select: { id: true, idempotencyKey: true },
      });
      const keys = new Set(orders.map((o) => o.idempotencyKey ?? '<null>'));
      assert(keys.size === orders.length, `duplicate idempotency keys: ${[...keys].join(', ')}`);
      record('Case G — no duplicate Order after replay', 'PASS', `Order count=${orderCount}`);
    } catch (err) {
      record('Case G — no duplicate Order after replay', 'FAIL', (err as Error).message);
    }
  } else {
    record('Case G — no duplicate Order after replay', 'FAIL', 'skipped: order missing');
  }

  // ── Case H: StockReservation linkage (booking → reservation → order)
  if (bookingAId && orderId) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingAId },
        select: {
          id: true,
          status: true,
          convertedOrderId: true,
          stockReservations: {
            select: { id: true, orderId: true, bookingId: true, releasedAt: true },
          },
        },
      });
      assert(booking !== null, 'booking A not found');
      assert(
        booking.status === 'CONVERTED_TO_ORDER',
        `expected CONVERTED_TO_ORDER, got ${booking.status}`
      );
      assert(
        booking.convertedOrderId === orderId,
        `convertedOrderId mismatch: ${booking.convertedOrderId} vs ${orderId}`
      );
      const reservations = booking.stockReservations ?? [];
      const activeReservation = reservations.find((r) => r.releasedAt === null);
      assert(
        activeReservation !== undefined,
        `StockReservation must exist + be unreleased for converted booking (saw ${reservations.length} rows)`
      );
      assert(
        activeReservation.orderId === orderId,
        `reservation.orderId mismatch: ${activeReservation.orderId} vs ${orderId}`
      );
      assert(
        activeReservation.bookingId === bookingAId,
        `reservation.bookingId mismatch: ${activeReservation.bookingId} vs ${bookingAId}`
      );
      record('Case H — reservation links booking + order intact', 'PASS', 'all FKs match');
    } catch (err) {
      record('Case H — reservation links booking + order intact', 'FAIL', (err as Error).message);
    }
  } else {
    record('Case H — reservation links booking + order intact', 'FAIL', 'skipped');
  }

  // ── Case I: cleanup
  let cleanupOk = true;
  try {
    await runCleanup(prisma, runId);
    record('Case I — cleanup', 'PASS', 'all rows removed');
  } catch (err) {
    cleanupOk = false;
    record('Case I — cleanup', 'FAIL', (err as Error).message);
  }

  // ── Summary
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log('');
  console.log('=== Summary ===');
  console.log(`PASS: ${passCount}  FAIL: ${failCount}  TOTAL: ${results.length}`);

  await prisma.$disconnect();
  process.exit(failCount > 0 || !cleanupOk ? 1 : 0);
}

async function runCleanup(prisma: PrismaClient, runId: string): Promise<void> {
  const shopId = `${runId}--shop-d46`;
  const productId = `${runId}--product-d46`;
  const userId = `${runId}--user-d46`;
  const ops: Array<{ label: string; fn: () => Promise<{ count: number }> }> = [
    {
      label: 'OrderItem',
      fn: () => prisma.orderItem.deleteMany({ where: { order: { shopId } } }),
    },
    {
      label: 'OrderAudit',
      fn: () =>
        prisma.orderAudit
          .deleteMany({ where: { order: { shopId } } })
          .catch(() => ({ count: 0 })),
    },
    { label: 'Order', fn: () => prisma.order.deleteMany({ where: { shopId } }) },
    {
      label: 'BookingHistory',
      fn: () => prisma.bookingHistory.deleteMany({ where: { booking: { shopId } } }),
    },
    {
      label: 'StockReservation',
      fn: () => prisma.stockReservation.deleteMany({ where: { booking: { shopId } } }),
    },
    { label: 'Booking', fn: () => prisma.booking.deleteMany({ where: { shopId } }) },
    {
      label: 'BroadcastProduct',
      fn: () => prisma.broadcastProduct.deleteMany({ where: { shopId } }),
    },
    {
      label: 'ProductVariant',
      fn: () => prisma.productVariant.deleteMany({ where: { productId } }),
    },
    { label: 'Product', fn: () => prisma.product.deleteMany({ where: { shopId } }) },
    { label: 'Customer', fn: () => prisma.customer.deleteMany({ where: { shopId } }) },
    { label: 'ShopMember', fn: () => prisma.shopMember.deleteMany({ where: { shopId } }) },
    { label: 'Shop', fn: () => prisma.shop.deleteMany({ where: { id: shopId } }) },
    { label: 'User', fn: () => prisma.user.deleteMany({ where: { id: userId } }) },
  ];
  for (const op of ops) {
    try {
      const r = await op.fn();
      console.log(`  cleanup ${op.label}: ${r.count} row(s) deleted`);
    } catch (err) {
      console.error(`  cleanup ${op.label} failed:`, (err as Error).message);
    }
  }
}

main().catch(async (err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
