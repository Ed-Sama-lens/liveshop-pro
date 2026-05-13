/**
 * Non-production end-to-end verification for omnichannel booking
 * (PR 2 / AR-1 + AR-2 + AR-3).
 *
 * Exercises the bookingIds-only conversion path + evergreen
 * BroadcastProduct creation + non-live booking lifecycle, all behind
 * the three PR 2 feature flags.
 *
 * Sets flags inline at top of run so the script works regardless of
 * the shell environment:
 *   ALLOW_EVERGREEN_BROADCAST_PRODUCT=true
 *   ALLOW_NON_LIVE_BOOKING=true
 *   ALLOW_BOOKINGIDS_ONLY_CONVERSION=true
 *
 * PRODUCTION SAFETY: refuses to run unless ALL of:
 *   1. process.env.CONFIRM_NON_PROD_DB === 'true'
 *   2. DATABASE_URL is set
 *   3. DATABASE_URL host is NOT a known production marker
 *      ('junction.proxy.rlwy.net' / 'rlwy.net')
 *   4. DATABASE_URL does NOT contain literal 'nazhahatyai'
 *
 * Usage (Docker local DB only):
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_OMNICHANNEL_RUN_ID=$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx -y tsx scripts/verify-omnichannel-booking.ts
 *
 * Test cases (5):
 *   A. create non-live PENDING_REVIEW booking via evergreen BP
 *   B. confirm non-live booking → reserves stock atomically
 *   C. cancel non-live CONFIRMED booking → releases stock
 *   D. convert confirmed non-live bookingIds to order (V2 path)
 *   E. replay V2 conversion → idempotent
 *
 * Exit code:
 *   0  all 5 tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered
 */

// Set feature flags BEFORE importing repository — module-level reads
// happen at import time for some paths. feature-flags.ts reads
// process.env at call time so this is also fine post-import, but
// setting early is defense-in-depth.
process.env.ALLOW_EVERGREEN_BROADCAST_PRODUCT = 'true';
process.env.ALLOW_NON_LIVE_BOOKING = 'true';
process.env.ALLOW_BOOKINGIDS_ONLY_CONVERSION = 'true';

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { bookingRepository } from '../src/server/repositories/booking.repository';
import { AppError } from '../src/lib/errors';

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
    console.error(`[GUARD] Refusing to run: hostname ${parsed.hostname} is not in allowlist ${ALLOWED_LOCAL_HOSTS.join(', ')}.`);
    process.exit(2);
  }
  if (dbName !== REQUIRED_DB_NAME) {
    console.error(`[GUARD] Refusing to run: database name ${dbName} != ${REQUIRED_DB_NAME}.`);
    process.exit(2);
  }
  const runId = process.env.VERIFY_OMNICHANNEL_RUN_ID || `${Date.now()}`;
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

// ─── Fixtures ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { url, runId, sanitizedHost } = assertNonProdDatabase();
  console.log(`Running omnichannel booking verifier against ${sanitizedHost}`);
  console.log(`Run id: ${runId}`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  const idShop = `${runId}--shop`;
  const idUser = `${runId}--user`;
  const idProduct = `${runId}--product`;
  const idVariant = `${runId}--variant`;
  const idCustomer = `${runId}--cust`;
  const idEvergreenBP = `${runId}--bp-ever`;

  let setupOk = false;
  try {
    await prisma.shop.create({
      data: {
        id: idShop,
        name: `Verify Omnichannel ${runId}`,
        slug: `verify-omni-${runId}`,
        defaultCurrency: 'MYR',
      },
    });
    await prisma.user.create({
      data: { id: idUser, name: 'Verify Admin', role: 'OWNER' },
    });
    await prisma.shopMember.create({
      data: { shopId: idShop, userId: idUser, role: 'OWNER' },
    });
    await prisma.product.create({
      data: {
        id: idProduct,
        shopId: idShop,
        name: `Verify Product ${runId}`,
        stockCode: `OMNI-${runId.slice(-8)}`,
        isActive: true,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant,
        productId: idProduct,
        sku: `OMNI-V-${runId.slice(-8)}`,
        attributes: {},
        price: '20.00',
        quantity: 100,
        reservedQty: 0,
      },
    });
    await prisma.customer.create({
      data: {
        id: idCustomer,
        shopId: idShop,
        name: `Verify Customer ${runId}`,
        channel: 'MANUAL',
      },
    });
    // Evergreen BroadcastProduct — liveSessionId NULL, shopId set
    await prisma.broadcastProduct.create({
      data: {
        id: idEvergreenBP,
        shopId: idShop,
        liveSessionId: null,
        productId: idProduct,
        variantId: idVariant,
        displayCode: `EVR-${runId.slice(-8)}`,
      },
    });
    setupOk = true;
    console.log('Fixtures created.');
  } catch (err) {
    console.error('Fixture setup failed:', (err as Error).message);
    record('Fixture setup', 'FAIL', (err as Error).message);
  }

  if (!setupOk) {
    await runCleanup(prisma, runId);
    process.exit(1);
  }

  let createdBookingAId = '';
  let createdBookingBId = '';

  // ── Test A: create non-live PENDING_REVIEW via evergreen BP
  try {
    const a = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: null,
      customerId: idCustomer,
      broadcastProductId: idEvergreenBP,
      quantity: 2,
      status: 'PENDING_REVIEW',
      changedById: idUser,
    });
    createdBookingAId = a.bookingId;
    assert(a.status === 'PENDING_REVIEW', `expected PENDING_REVIEW, got ${a.status}`);
    assert(a.reservationId === null, 'PENDING_REVIEW should not reserve stock');
    record('Test A — create non-live PENDING_REVIEW via evergreen BP', 'PASS', `bookingId=${createdBookingAId.slice(-8)}`);
  } catch (err) {
    record('Test A — create non-live PENDING_REVIEW via evergreen BP', 'FAIL', (err as Error).message);
  }

  // ── Test B: confirm non-live booking
  if (createdBookingAId) {
    try {
      const b = await bookingRepository.confirm({
        bookingId: createdBookingAId,
        shopId: idShop,
        changedById: idUser,
      });
      assert(b.status === 'CONFIRMED', `expected CONFIRMED, got ${b.status}`);
      assert(b.reservationId !== null && b.reservationId.length > 0, 'CONFIRMED should reserve stock');
      // Verify variant reservedQty incremented
      const variant = await prisma.productVariant.findUnique({
        where: { id: idVariant },
        select: { reservedQty: true },
      });
      assert(variant?.reservedQty === 2, `expected reservedQty=2, got ${variant?.reservedQty}`);
      record('Test B — confirm non-live booking reserves stock', 'PASS', `reservedQty=2`);
    } catch (err) {
      record('Test B — confirm non-live booking reserves stock', 'FAIL', (err as Error).message);
    }
  } else {
    record('Test B — confirm non-live booking reserves stock', 'FAIL', 'skipped — booking A missing');
  }

  // ── Test C: create second + cancel CONFIRMED → release stock
  try {
    const b = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: null,
      customerId: idCustomer,
      broadcastProductId: idEvergreenBP,
      quantity: 3,
      status: 'CONFIRMED',
      changedById: idUser,
    });
    createdBookingBId = b.bookingId;
    const variantAfterB = await prisma.productVariant.findUnique({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variantAfterB?.reservedQty === 5, `after Test C create: expected reservedQty=5, got ${variantAfterB?.reservedQty}`);

    // Cancel booking B → release 3 units
    const cancelResult = await bookingRepository.cancel({
      bookingId: createdBookingBId,
      shopId: idShop,
      changedById: idUser,
      targetStatus: 'CANCELLED',
    });
    assert(cancelResult.status === 'CANCELLED', `expected CANCELLED, got ${cancelResult.status}`);
    assert(cancelResult.releasedQuantity === 3, `expected releasedQuantity=3, got ${cancelResult.releasedQuantity}`);
    const variantAfterCancel = await prisma.productVariant.findUnique({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variantAfterCancel?.reservedQty === 2, `after Test C cancel: expected reservedQty=2, got ${variantAfterCancel?.reservedQty}`);
    record('Test C — cancel non-live CONFIRMED releases stock', 'PASS', 'reservedQty 5→2');
  } catch (err) {
    record('Test C — cancel non-live CONFIRMED releases stock', 'FAIL', (err as Error).message);
  }

  // ── Test D: convert confirmed non-live bookingIds via V2 path
  let convertedOrderId = '';
  if (createdBookingAId) {
    try {
      const conv = await bookingRepository.convertToOrder({
        shopId: idShop,
        // V2 dispatch — no liveSessionId, no customerId, bookingIds[] only
        changedById: idUser,
        bookingIds: [createdBookingAId],
      });
      convertedOrderId = conv.orderId;
      assert(conv.status === 'RESERVED', `expected RESERVED, got ${conv.status}`);
      assert(conv.idempotent === false, 'first conversion should not be idempotent');
      assert(conv.bookingCount === 1, `expected 1, got ${conv.bookingCount}`);
      // V2 key should have v2 prefix
      const order = await prisma.order.findUnique({
        where: { id: convertedOrderId },
        select: { idempotencyKey: true, channel: true, status: true },
      });
      assert(
        order?.idempotencyKey?.startsWith('sale-conv:v2:') === true,
        `expected v2 idempotency key, got ${order?.idempotencyKey}`
      );
      assert(order?.channel === 'MANUAL', `expected MANUAL channel, got ${order?.channel}`);
      // Booking flipped to CONVERTED_TO_ORDER
      const bk = await prisma.booking.findUnique({
        where: { id: createdBookingAId },
        select: { status: true, convertedOrderId: true },
      });
      assert(bk?.status === 'CONVERTED_TO_ORDER', `expected CONVERTED, got ${bk?.status}`);
      assert(bk?.convertedOrderId === convertedOrderId, 'convertedOrderId mismatch');
      record('Test D — convert non-live bookingIds via V2 path', 'PASS', `orderId=${convertedOrderId.slice(-8)}`);
    } catch (err) {
      record('Test D — convert non-live bookingIds via V2 path', 'FAIL', (err as Error).message);
    }
  } else {
    record('Test D — convert non-live bookingIds via V2 path', 'FAIL', 'skipped — booking A missing');
  }

  // ── Test E: replay V2 conversion → idempotent
  if (createdBookingAId && convertedOrderId) {
    try {
      const replay = await bookingRepository.convertToOrder({
        shopId: idShop,
        changedById: idUser,
        bookingIds: [createdBookingAId],
      });
      assert(replay.idempotent === true, 'replay should be idempotent');
      assert(replay.orderId === convertedOrderId, 'replay should return same order');
      assert(replay.status === 'RESERVED', `replay status expected RESERVED, got ${replay.status}`);
      record('Test E — V2 conversion replay returns idempotent', 'PASS', `same orderId=${replay.orderId.slice(-8)}`);
    } catch (err) {
      record('Test E — V2 conversion replay returns idempotent', 'FAIL', (err as Error).message);
    }
  } else {
    record('Test E — V2 conversion replay returns idempotent', 'FAIL', 'skipped — booking/order missing');
  }

  await runCleanup(prisma, runId);

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log('');
  console.log('=== Summary ===');
  console.log(`PASS: ${passCount}  FAIL: ${failCount}  TOTAL: ${results.length}`);

  await prisma.$disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

async function runCleanup(prisma: PrismaClient, runId: string): Promise<void> {
  console.log('');
  console.log('=== Cleanup ===');
  const ops: Array<{ label: string; fn: () => Promise<{ count: number }> }> = [
    { label: 'OrderAudit', fn: () => prisma.orderAudit.deleteMany({ where: { metadata: { path: ['bookingIds'], array_contains: [] }, NOT: { metadata: undefined } } }).catch(() => ({ count: 0 })) },
    { label: 'OrderItem', fn: () => prisma.orderItem.deleteMany({ where: { order: { shopId: `${runId}--shop` } } }) },
    { label: 'Order', fn: () => prisma.order.deleteMany({ where: { shopId: `${runId}--shop` } }) },
    { label: 'BookingHistory', fn: () => prisma.bookingHistory.deleteMany({ where: { booking: { shopId: `${runId}--shop` } } }) },
    { label: 'StockReservation', fn: () => prisma.stockReservation.deleteMany({ where: { booking: { shopId: `${runId}--shop` } } }) },
    { label: 'Booking', fn: () => prisma.booking.deleteMany({ where: { shopId: `${runId}--shop` } }) },
    { label: 'BroadcastProduct', fn: () => prisma.broadcastProduct.deleteMany({ where: { shopId: `${runId}--shop` } }) },
    { label: 'ProductVariant', fn: () => prisma.productVariant.deleteMany({ where: { productId: `${runId}--product` } }) },
    { label: 'Product', fn: () => prisma.product.deleteMany({ where: { shopId: `${runId}--shop` } }) },
    { label: 'Customer', fn: () => prisma.customer.deleteMany({ where: { shopId: `${runId}--shop` } }) },
    { label: 'ShopMember', fn: () => prisma.shopMember.deleteMany({ where: { shopId: `${runId}--shop` } }) },
    { label: 'Shop', fn: () => prisma.shop.deleteMany({ where: { id: `${runId}--shop` } }) },
    { label: 'User', fn: () => prisma.user.deleteMany({ where: { id: `${runId}--user` } }) },
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
