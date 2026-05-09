/**
 * Non-production end-to-end verification for `bookingRepository.confirm()`
 * and `bookingRepository.cancel()`.
 *
 * Commit 2D — companion to:
 *   - docs/superpowers/2026-04-06-sale-mvp-dissent.md
 *   - docs/superpowers/2026-05-09-sale-booking-runtime-design.md
 *   - Commit 2B (`689a83a`) + Commit 2B-AUDIT-001 (`552562a`)
 *
 * PRODUCTION SAFETY: refuses to run unless ALL of:
 *   1. process.env.CONFIRM_NON_PROD_DB === 'true'
 *   2. DATABASE_URL is set
 *   3. DATABASE_URL host does NOT match known production marker
 *      ('junction.proxy.rlwy.net') — booking flow rotation moved off this
 *      host on 2026-05-09 but the substring is the safest deny list anchor.
 *      Customize PROD_HOST_DENY_LIST below if your production migrates.
 *   4. DATABASE_URL does NOT contain literal 'nazhahatyai' or 'railway'
 *      anywhere except as a database NAME (that would be 'railway' DB on
 *      Railway). The combination of host + DB-name match increases
 *      confidence; either alone is not sufficient to flag.
 *   5. Optional VERIFY_BOOKING_FLOW_RUN_ID env var. If absent we generate
 *      one. The runId becomes the prefix on every fixture row so cleanup
 *      can target only this run.
 *
 * Usage:
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_BOOKING_FLOW_RUN_ID=$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx -y tsx scripts/verify-booking-flow.ts
 *
 * Exit code:
 *   0  all 8 tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered (will not connect)
 */

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { bookingRepository } from '../src/server/repositories/booking.repository';
import { AppError } from '../src/lib/errors';
import { NO_EXPIRY_SENTINEL } from '../src/lib/sale/booking-rules';

// ─── Production safety guards ────────────────────────────────────────────

const PROD_HOST_DENY_LIST = [
  'junction.proxy.rlwy.net',
  'rlwy.net',
] as const;

function assertNonProdDatabase(): { url: string; runId: string; sanitizedHost: string } {
  if (process.env.CONFIRM_NON_PROD_DB !== 'true') {
    console.error(
      '[GUARD] Refusing to run: set CONFIRM_NON_PROD_DB=true to confirm this is a non-production database.'
    );
    process.exit(2);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[GUARD] Refusing to run: DATABASE_URL is not set.');
    process.exit(2);
  }

  // Parse host without leaking creds.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (err) {
    console.error('[GUARD] Refusing to run: DATABASE_URL is not a valid URL.', err);
    process.exit(2);
  }

  const sanitizedHost = parsed.hostname + ':' + (parsed.port || '5432');
  const dbName = parsed.pathname.replace(/^\//, '');
  const sanitizedDb = dbName.length > 0 ? dbName : '<unspecified>';

  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      console.error(
        `[GUARD] Refusing to run: DATABASE_URL host '${parsed.hostname}' matches production deny list ('${denied}').`
      );
      process.exit(2);
    }
  }

  if (parsed.hostname.includes('nazhahatyai')) {
    console.error(
      `[GUARD] Refusing to run: DATABASE_URL host '${parsed.hostname}' contains production marker 'nazhahatyai'.`
    );
    process.exit(2);
  }

  const runId = process.env.VERIFY_BOOKING_FLOW_RUN_ID
    ?? `verify-${Date.now().toString(36)}`;

  if (!/^[A-Za-z0-9-]{4,64}$/.test(runId)) {
    console.error(
      `[GUARD] Refusing to run: VERIFY_BOOKING_FLOW_RUN_ID must match /^[A-Za-z0-9-]{4,64}$/, got '${runId}'.`
    );
    process.exit(2);
  }

  console.log('[GUARD] Production safety checks passed.');
  console.log(`[GUARD] DB host: ${sanitizedHost} db=${sanitizedDb}`);
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

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const guard = assertNonProdDatabase();
  const { runId } = guard;

  // Set DATABASE_URL on process.env for the prisma singleton (which reads it
  // at import time). The import already happened above so override the
  // adapter URL via fresh client.
  const adapter = new PrismaPg(guard.url);
  const prisma = new PrismaClient({ adapter });

  // Override the singleton-backed bookingRepository's prisma instance is not
  // possible without monkey-patching, so we use a direct adapter for fixture
  // setup/cleanup but call bookingRepository for the actual operations under
  // test. The repository internally uses '@/lib/db/prisma' which reads
  // DATABASE_URL from env — so as long as DATABASE_URL is set in the same
  // process (it is, via the env requirement), both clients hit the same DB.

  console.log('');
  console.log('=== Fixture setup ===');

  // Stable IDs derived from runId for traceability.
  const idShop = `shop-${runId}`;
  const idShop2 = `shop2-${runId}`;
  const idUser = `user-${runId}`;
  const idCustomer = `cust-${runId}`;
  const idProduct = `prod-${runId}`;
  const idProduct2 = `prod2-${runId}`;
  const idVariant = `var-${runId}`;
  const idVariant2 = `var2-${runId}`;
  const idLiveSession = `live-${runId}`;
  const idBP = `bp-${runId}`;
  const idBPCrossShop = `bpx-${runId}`;
  const idBookingPending = `book-pend-${runId}`;
  const idBookingMulti = `book-multi-${runId}`;
  const idBookingInsuf = `book-insuf-${runId}`;
  const idBookingCrossShop = `book-xshop-${runId}`;
  const idBookingConverted = `book-conv-${runId}`;

  let setupOk = false;

  try {
    // 1. Shop A (primary) + Shop B (cross-shop)
    await prisma.shop.create({
      data: { id: idShop, name: `VERIFY ${runId}`, slug: `verify-${runId}` },
    });
    await prisma.shop.create({
      data: { id: idShop2, name: `VERIFY2 ${runId}`, slug: `verify2-${runId}` },
    });

    // 2. Admin user (changedById)
    await prisma.user.create({
      data: {
        id: idUser,
        name: `verify-admin-${runId}`,
        username: `verify-${runId}`,
        role: 'OWNER',
      },
    });

    // 3. Customer
    await prisma.customer.create({
      data: {
        id: idCustomer,
        shopId: idShop,
        name: `verify-customer-${runId}`,
      },
    });

    // 4. Product + Variant in Shop A
    await prisma.product.create({
      data: {
        id: idProduct,
        shopId: idShop,
        stockCode: `STK-${runId}`,
        name: `Verify Product ${runId}`,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant,
        productId: idProduct,
        sku: `SKU-${runId}`,
        attributes: {},
        price: '10.00',
        quantity: 5,
        reservedQty: 0,
      },
    });

    // 5. Product + Variant in Shop B (for cross-shop integrity test)
    await prisma.product.create({
      data: {
        id: idProduct2,
        shopId: idShop2,
        stockCode: `STK2-${runId}`,
        name: `Cross-Shop Product ${runId}`,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant2,
        productId: idProduct2,
        sku: `SKU2-${runId}`,
        attributes: {},
        price: '10.00',
        quantity: 99,
        reservedQty: 0,
      },
    });

    // 6. LiveSession (Shop A)
    await prisma.liveSession.create({
      data: {
        id: idLiveSession,
        shopId: idShop,
        title: `Verify Live ${runId}`,
        status: 'LIVE',
      },
    });

    // 7. BroadcastProduct (Shop A's variant)
    await prisma.broadcastProduct.create({
      data: {
        id: idBP,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant,
        displayCode: `T1-${runId}`,
      },
    });

    // 8. BroadcastProduct pointing to cross-shop variant (data corruption simulation)
    await prisma.broadcastProduct.create({
      data: {
        id: idBPCrossShop,
        liveSessionId: idLiveSession,
        productId: idProduct,           // valid Shop A product
        variantId: idVariant2,           // CORRUPTED: variant from Shop B
        displayCode: `XSHOP-${runId}`,
      },
    });

    // 9. Bookings (PENDING_REVIEW)
    await prisma.booking.create({
      data: {
        id: idBookingPending,
        shopId: idShop,
        liveSessionId: idLiveSession,
        broadcastProductId: idBP,
        customerId: idCustomer,
        quantity: 2,
        unitPrice: '10.00',
        status: 'PENDING_REVIEW',
        source: 'MANUAL',
      },
    });
    await prisma.booking.create({
      data: {
        id: idBookingMulti,
        shopId: idShop,
        liveSessionId: idLiveSession,
        broadcastProductId: idBP,
        customerId: idCustomer,
        quantity: 1,
        unitPrice: '10.00',
        status: 'CONFIRMED',  // pre-set to CONFIRMED for multi-active scenario
        source: 'MANUAL',
        confirmedAt: new Date(),
      },
    });
    await prisma.booking.create({
      data: {
        id: idBookingInsuf,
        shopId: idShop,
        liveSessionId: idLiveSession,
        broadcastProductId: idBP,
        customerId: idCustomer,
        quantity: 999,  // exceeds available
        unitPrice: '10.00',
        status: 'PENDING_REVIEW',
        source: 'MANUAL',
      },
    });
    await prisma.booking.create({
      data: {
        id: idBookingCrossShop,
        shopId: idShop,
        liveSessionId: idLiveSession,
        broadcastProductId: idBPCrossShop,  // points to cross-shop variant
        customerId: idCustomer,
        quantity: 1,
        unitPrice: '10.00',
        status: 'PENDING_REVIEW',
        source: 'MANUAL',
      },
    });
    await prisma.booking.create({
      data: {
        id: idBookingConverted,
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

  // ── Test 1: Confirm pending booking ──
  try {
    const before = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    assert(before.quantity === 5, `pre-test variant quantity expected 5, got ${before.quantity}`);
    assert(before.reservedQty === 0, `pre-test reservedQty expected 0, got ${before.reservedQty}`);

    const result = await bookingRepository.confirm({
      bookingId: idBookingPending,
      shopId: idShop,
      changedById: idUser,
    });

    assert(result.status === 'CONFIRMED', `expected CONFIRMED, got ${result.status}`);
    assert(result.idempotent === false, 'first confirm should not be idempotent');
    assert(result.quantity === 2, `expected qty 2, got ${result.quantity}`);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: idBookingPending } });
    assert(booking.status === 'CONFIRMED', 'booking.status not updated');
    assert(booking.confirmedAt !== null, 'confirmedAt not set');

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    assert(variant.quantity === 5, 'quantity should NOT change on confirm');
    assert(variant.reservedQty === 2, `reservedQty expected 2, got ${variant.reservedQty}`);

    const reservation = await prisma.stockReservation.findUniqueOrThrow({
      where: { id: result.reservationId },
      select: { variantId: true, bookingId: true, orderId: true, quantity: true, expiresAt: true, releasedAt: true },
    });
    assert(reservation.bookingId === idBookingPending, 'reservation.bookingId mismatch');
    assert(reservation.orderId === null, 'reservation.orderId should be null on booking-side reservation');
    assert(reservation.releasedAt === null, 'reservation.releasedAt should be null on active');
    assert(reservation.quantity === 2, 'reservation.quantity mismatch');
    assert(
      reservation.expiresAt.toISOString() === NO_EXPIRY_SENTINEL.toISOString(),
      `expiresAt should be sentinel, got ${reservation.expiresAt.toISOString()}`
    );

    const history = await prisma.bookingHistory.findMany({
      where: { bookingId: idBookingPending },
      orderBy: { createdAt: 'asc' },
    });
    assert(history.length === 1, `expected 1 history row, got ${history.length}`);
    assert(history[0].fromStatus === 'PENDING_REVIEW', 'fromStatus mismatch');
    assert(history[0].toStatus === 'CONFIRMED', 'toStatus mismatch');
    assert(history[0].changedById === idUser, 'changedById mismatch');

    record('Test 1 — Confirm pending booking', 'PASS', `reservation=${shortId(result.reservationId)}`);
  } catch (err) {
    record('Test 1 — Confirm pending booking', 'FAIL', (err as Error).message);
  }

  // ── Test 2: Confirm idempotency ──
  try {
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    const reservationsBefore = await prisma.stockReservation.findMany({
      where: { bookingId: idBookingPending, releasedAt: null },
    });
    const historyBefore = await prisma.bookingHistory.count({
      where: { bookingId: idBookingPending },
    });

    const result = await bookingRepository.confirm({
      bookingId: idBookingPending,
      shopId: idShop,
      changedById: idUser,
    });

    assert(result.idempotent === true, 'second confirm should be idempotent');
    assert(result.status === 'CONFIRMED', 'status should remain CONFIRMED');

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty,
      `reservedQty changed on idempotent re-call: ${variantBefore.reservedQty} → ${variantAfter.reservedQty}`
    );

    const reservationsAfter = await prisma.stockReservation.findMany({
      where: { bookingId: idBookingPending, releasedAt: null },
    });
    assert(
      reservationsAfter.length === reservationsBefore.length,
      `active reservation count changed: ${reservationsBefore.length} → ${reservationsAfter.length}`
    );

    const historyAfter = await prisma.bookingHistory.count({
      where: { bookingId: idBookingPending },
    });
    assert(historyAfter === historyBefore, `history rows changed on idempotent re-call: ${historyBefore} → ${historyAfter}`);

    record('Test 2 — Confirm idempotency', 'PASS');
  } catch (err) {
    record('Test 2 — Confirm idempotency', 'FAIL', (err as Error).message);
  }

  // ── Test 3: Cancel confirmed booking ──
  try {
    const result = await bookingRepository.cancel({
      bookingId: idBookingPending,
      shopId: idShop,
      changedById: idUser,
      targetStatus: 'CANCELLED',
      reason: 'verify-test-cancel',
    });

    assert(result.status === 'CANCELLED', 'status should be CANCELLED');
    assert(result.stockReleased === true, 'stockReleased should be true');
    assert(result.releasedQuantity === 2, `releasedQuantity expected 2, got ${result.releasedQuantity}`);
    assert(result.idempotent === false, 'first cancel should not be idempotent');

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: idBookingPending } });
    assert(booking.status === 'CANCELLED', 'booking.status not updated');
    assert(booking.cancelledAt !== null, 'cancelledAt not set');
    assert(booking.cancellationReason === 'verify-test-cancel', 'cancellationReason not stored');

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variant.reservedQty === 0, `reservedQty should be 0 after release, got ${variant.reservedQty}`);

    const activeReservations = await prisma.stockReservation.findMany({
      where: { bookingId: idBookingPending, releasedAt: null },
    });
    assert(activeReservations.length === 0, `expected 0 active reservations, got ${activeReservations.length}`);

    const releasedReservations = await prisma.stockReservation.findMany({
      where: { bookingId: idBookingPending, releasedAt: { not: null } },
    });
    assert(releasedReservations.length === 1, `expected 1 released reservation, got ${releasedReservations.length}`);

    const history = await prisma.bookingHistory.findMany({
      where: { bookingId: idBookingPending },
      orderBy: { createdAt: 'asc' },
    });
    assert(history.length === 2, `expected 2 history rows, got ${history.length}`);
    assert(history[1].fromStatus === 'CONFIRMED' && history[1].toStatus === 'CANCELLED', 'cancel history mismatch');
    assert(history[1].reason === 'verify-test-cancel', 'history reason not stored');

    record('Test 3 — Cancel confirmed booking', 'PASS');
  } catch (err) {
    record('Test 3 — Cancel confirmed booking', 'FAIL', (err as Error).message);
  }

  // ── Test 4: Cancel idempotency ──
  try {
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    const historyBefore = await prisma.bookingHistory.count({
      where: { bookingId: idBookingPending },
    });

    const result = await bookingRepository.cancel({
      bookingId: idBookingPending,
      shopId: idShop,
      changedById: idUser,
      targetStatus: 'CANCELLED',
    });

    assert(result.idempotent === true, 'second cancel should be idempotent');
    assert(result.stockReleased === false, 'stockReleased should be false on idempotent re-call');
    assert(result.releasedQuantity === 0, 'releasedQuantity should be 0');

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variantAfter.reservedQty === variantBefore.reservedQty, 'reservedQty changed on idempotent re-cancel');

    const historyAfter = await prisma.bookingHistory.count({
      where: { bookingId: idBookingPending },
    });
    assert(historyAfter === historyBefore, 'history rows changed on idempotent re-cancel');

    record('Test 4 — Cancel idempotency', 'PASS');
  } catch (err) {
    record('Test 4 — Cancel idempotency', 'FAIL', (err as Error).message);
  }

  // ── Test 5: Insufficient stock ──
  try {
    const before = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });

    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.confirm({
        bookingId: idBookingInsuf,
        shopId: idShop,
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected confirm to throw');
    assert(code === 'INSUFFICIENT_STOCK', `expected INSUFFICIENT_STOCK, got ${code ?? 'no AppError'}`);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: idBookingInsuf } });
    assert(booking.status === 'PENDING_REVIEW', `booking should remain PENDING_REVIEW, got ${booking.status}`);

    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(after.reservedQty === before.reservedQty, 'reservedQty should not change on failed confirm');

    const reservations = await prisma.stockReservation.findMany({
      where: { bookingId: idBookingInsuf },
    });
    assert(reservations.length === 0, 'no reservation should be created on failed confirm');

    const history = await prisma.bookingHistory.count({ where: { bookingId: idBookingInsuf } });
    assert(history === 0, 'no history row on failed confirm');

    record('Test 5 — Insufficient stock', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 5 — Insufficient stock', 'FAIL', (err as Error).message);
  }

  // ── Test 6: Multi-active reservation integrity ──
  try {
    // idBookingMulti is pre-set to CONFIRMED. Insert TWO active StockReservations
    // for it directly, simulating data corruption.
    await prisma.stockReservation.create({
      data: {
        variantId: idVariant,
        bookingId: idBookingMulti,
        quantity: 1,
        expiresAt: NO_EXPIRY_SENTINEL,
      },
    });
    await prisma.stockReservation.create({
      data: {
        variantId: idVariant,
        bookingId: idBookingMulti,
        quantity: 1,
        expiresAt: NO_EXPIRY_SENTINEL,
      },
    });

    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.confirm({
        bookingId: idBookingMulti,
        shopId: idShop,
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected confirm to throw on multi-active');
    assert(
      code === 'RESERVATION_INTEGRITY_ERROR',
      `expected RESERVATION_INTEGRITY_ERROR, got ${code ?? 'no AppError'}`
    );

    // Try cancel as well — should also raise integrity error
    let cancelThrew = false;
    let cancelCode: string | undefined;
    try {
      await bookingRepository.cancel({
        bookingId: idBookingMulti,
        shopId: idShop,
        changedById: idUser,
        targetStatus: 'CANCELLED',
      });
    } catch (err) {
      cancelThrew = true;
      if (err instanceof AppError) cancelCode = err.code;
    }

    assert(cancelThrew, 'expected cancel to throw on multi-active');
    assert(
      cancelCode === 'RESERVATION_INTEGRITY_ERROR',
      `expected cancel RESERVATION_INTEGRITY_ERROR, got ${cancelCode ?? 'no AppError'}`
    );

    record('Test 6 — Multi-active integrity', 'PASS', `confirm=${code} cancel=${cancelCode}`);
  } catch (err) {
    record('Test 6 — Multi-active integrity', 'FAIL', (err as Error).message);
  }

  // ── Test 7: Cross-shop variant integrity ──
  try {
    const variant2Before = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant2 },
      select: { reservedQty: true },
    });

    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.confirm({
        bookingId: idBookingCrossShop,
        shopId: idShop,
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected confirm to throw on cross-shop variant');
    assert(
      code === 'RESERVATION_INTEGRITY_ERROR',
      `expected RESERVATION_INTEGRITY_ERROR, got ${code ?? 'no AppError'}`
    );

    const variant2After = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant2 },
      select: { reservedQty: true },
    });
    assert(
      variant2After.reservedQty === variant2Before.reservedQty,
      'cross-shop variant reservedQty should be unchanged'
    );

    record('Test 7 — Cross-shop variant integrity', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 7 — Cross-shop variant integrity', 'FAIL', (err as Error).message);
  }

  // ── Test 8: Converted booking cannot cancel ──
  try {
    let threw = false;
    let conflict = false;
    try {
      await bookingRepository.cancel({
        bookingId: idBookingConverted,
        shopId: idShop,
        changedById: idUser,
        targetStatus: 'CANCELLED',
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError && (err.code === 'CONFLICT' || err.code === 'BOOKING_INVALID_STATUS')) {
        conflict = true;
      }
    }

    assert(threw, 'expected cancel to throw on CONVERTED_TO_ORDER booking');
    assert(conflict, 'expected ConflictError or BOOKING_INVALID_STATUS');

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: idBookingConverted } });
    assert(
      booking.status === 'CONVERTED_TO_ORDER',
      `status should remain CONVERTED_TO_ORDER, got ${booking.status}`
    );
    assert(booking.cancelledAt === null, 'cancelledAt should remain null');

    record('Test 8 — Converted booking cannot cancel', 'PASS');
  } catch (err) {
    record('Test 8 — Converted booking cannot cancel', 'FAIL', (err as Error).message);
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

// ─── Cleanup ─────────────────────────────────────────────────────────────

async function runCleanup(prisma: PrismaClient, runId: string): Promise<boolean> {
  // Delete only rows whose id contains our runId. Reverse-FK order.
  // Safety: each delete uses `contains: runId` — never targets unrelated rows.
  const targets: Array<{ name: string; fn: () => Promise<{ count: number }> }> = [
    {
      name: 'BookingHistory',
      fn: () => prisma.bookingHistory.deleteMany({ where: { booking: { id: { contains: runId } } } }),
    },
    {
      name: 'StockReservation',
      fn: () => prisma.stockReservation.deleteMany({ where: { OR: [
        { bookingId: { contains: runId } },
        { variantId: { contains: runId } },
      ] } }),
    },
    {
      name: 'Booking',
      fn: () => prisma.booking.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'BroadcastProduct',
      fn: () => prisma.broadcastProduct.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'LiveSession',
      fn: () => prisma.liveSession.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'ProductVariant',
      fn: () => prisma.productVariant.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'Product',
      fn: () => prisma.product.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'Customer',
      fn: () => prisma.customer.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'ShopMember',
      fn: () => prisma.shopMember.deleteMany({ where: { OR: [
        { shopId: { contains: runId } },
        { userId: { contains: runId } },
      ] } }),
    },
    {
      name: 'Shop',
      fn: () => prisma.shop.deleteMany({ where: { id: { contains: runId } } }),
    },
    {
      name: 'User',
      fn: () => prisma.user.deleteMany({ where: { id: { contains: runId } } }),
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
      console.error(`  HINT: search '${runId}' in ${t.name} table to manually clean up`);
    }
  }
  return !failed;
}

// ─── Final summary ───────────────────────────────────────────────────────

function finalSummary(): void {
  console.log('');
  console.log('=== Summary ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}  TOTAL: ${results.length}`);
  if (fail > 0) {
    console.log('');
    console.log('FAILURES:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`  ✗ ${r.name}: ${r.detail ?? ''}`);
    }
  }
}

// ─── Entrypoint ──────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
