/**
 * Non-production end-to-end verification for `bookingRepository.createManual()`.
 *
 * Commit 2M-b — companion to:
 *   - docs/superpowers/2026-05-09-manual-booking-create-dissent.md
 *   - docs/superpowers/2026-04-06-sale-mvp-dissent.md
 *   - docs/superpowers/2026-05-09-sale-booking-runtime-design.md
 *
 * PRODUCTION SAFETY: refuses to run unless ALL of:
 *   1. process.env.CONFIRM_NON_PROD_DB === 'true'
 *   2. DATABASE_URL is set
 *   3. DATABASE_URL host does NOT match known production marker
 *      ('junction.proxy.rlwy.net' / 'rlwy.net')
 *   4. DATABASE_URL does NOT contain literal 'nazhahatyai'
 *   5. Optional VERIFY_BOOKING_CREATE_RUN_ID env var. If absent we generate one.
 *
 * Usage:
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_BOOKING_CREATE_RUN_ID=$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx -y tsx scripts/verify-booking-create.ts
 *
 * Exit code:
 *   0  all tests pass + cleanup successful
 *   1  any assertion fails or cleanup fails
 *   2  production safety guard triggered
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

const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
const REQUIRED_DB_NAME = 'liveshop_pro';
const ALLOWED_DB_PORTS = ['5432'];

const FIXTURE_PREFIX = 'verify-booking-create';

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

  const allowStaging = process.env.ALLOW_STAGING_DB === 'true';
  if (!allowStaging) {
    const isLocalHost = (ALLOWED_LOCAL_HOSTS as readonly string[]).includes(parsed.hostname);
    if (!isLocalHost) {
      console.error(
        `[GUARD] Refusing to run: DATABASE_URL host '${parsed.hostname}' is not local. Set ALLOW_STAGING_DB=true to opt in.`
      );
      process.exit(2);
    }
    if (dbName !== REQUIRED_DB_NAME) {
      console.error(
        `[GUARD] Refusing to run: DB name '${sanitizedDb}' does not equal required '${REQUIRED_DB_NAME}'.`
      );
      process.exit(2);
    }
    if (!ALLOWED_DB_PORTS.includes(port)) {
      console.error(
        `[GUARD] Refusing to run: DB port '${port}' not in allowed local list [${ALLOWED_DB_PORTS.join(', ')}].`
      );
      process.exit(2);
    }
  }

  const rawRunId = process.env.VERIFY_BOOKING_CREATE_RUN_ID
    ?? `${FIXTURE_PREFIX}-${Date.now().toString(36)}`;

  if (!/^[A-Za-z0-9-]{4,64}$/.test(rawRunId)) {
    console.error(
      `[GUARD] Refusing to run: VERIFY_BOOKING_CREATE_RUN_ID must match /^[A-Za-z0-9-]{4,64}$/, got '${rawRunId}'.`
    );
    process.exit(2);
  }

  const runId = rawRunId.startsWith(FIXTURE_PREFIX) ? rawRunId : `${FIXTURE_PREFIX}-${rawRunId}`;

  if (runId.length > 64) {
    console.error(
      `[GUARD] Refusing to run: normalized runId '${runId}' exceeds 64 chars.`
    );
    process.exit(2);
  }

  console.log('[GUARD] Production safety checks passed.');
  console.log(`[GUARD] DB host: ${sanitizedHost} db=${sanitizedDb}`);
  console.log(`[GUARD] Run ID: ${runId} (prefix=${FIXTURE_PREFIX}, mode=${allowStaging ? 'STAGING' : 'LOCAL'})`);
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

  const idShop = `${runId}--shop`;
  const idShop2 = `${runId}--shop2`;
  const idUser = `${runId}--user`;
  const idCustomer = `${runId}--cust`;
  const idCustomerBanned = `${runId}--cust-banned`;
  const idCustomerOtherShop = `${runId}--cust-other`;
  const idProduct = `${runId}--prod`;
  const idProduct2 = `${runId}--prod2`;
  const idVariant = `${runId}--var`;
  const idVariant2 = `${runId}--var2`;
  const idLiveSession = `${runId}--live`;
  const idLiveSessionShop2 = `${runId}--live2`;
  const idBP = `${runId}--bp`;
  const idBPNoVariant = `${runId}--bp-novariant`;
  const idBPCrossShop = `${runId}--bpx`;
  const idBPShop2 = `${runId}--bp-shop2`;

  let setupOk = false;

  try {
    await prisma.shop.create({
      data: { id: idShop, name: `VERIFY ${runId}`, slug: `verify-${runId}` },
    });
    await prisma.shop.create({
      data: { id: idShop2, name: `VERIFY2 ${runId}`, slug: `verify2-${runId}` },
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
      data: {
        id: idCustomer,
        shopId: idShop,
        name: `verify-customer-${runId}`,
      },
    });
    await prisma.customer.create({
      data: {
        id: idCustomerBanned,
        shopId: idShop,
        name: `verify-banned-${runId}`,
        isBanned: true,
        bannedReason: 'verify-test',
      },
    });
    await prisma.customer.create({
      data: {
        id: idCustomerOtherShop,
        shopId: idShop2,
        name: `verify-other-shop-${runId}`,
      },
    });

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
        price: '12.34',
        quantity: 10,
        reservedQty: 0,
      },
    });

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
        price: '99.00',
        quantity: 99,
        reservedQty: 0,
      },
    });

    await prisma.liveSession.create({
      data: {
        id: idLiveSession,
        shopId: idShop,
        title: `Verify Live ${runId}`,
        status: 'LIVE',
      },
    });
    await prisma.liveSession.create({
      data: {
        id: idLiveSessionShop2,
        shopId: idShop2,
        title: `Verify Live Shop2 ${runId}`,
        status: 'LIVE',
      },
    });

    // BroadcastProduct in Shop A (normal)
    await prisma.broadcastProduct.create({
      data: {
        id: idBP,
        shopId: idShop,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant,
        displayCode: `T1-${runId}`,
        // priceOverride: null → falls back to variant.price (12.34)
      },
    });

    // BroadcastProduct without variantId (whole-product unsupported)
    await prisma.broadcastProduct.create({
      data: {
        id: idBPNoVariant,
        shopId: idShop,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: null,
        displayCode: `T2-${runId}`,
      },
    });

    // BroadcastProduct in Shop A's session, but variant from Shop B (corruption)
    await prisma.broadcastProduct.create({
      data: {
        id: idBPCrossShop,
        shopId: idShop,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant2,
        displayCode: `XSHOP-${runId}`,
      },
    });

    // BroadcastProduct in Shop B's session (different shop entirely)
    await prisma.broadcastProduct.create({
      data: {
        id: idBPShop2,
        shopId: idShop2,
        liveSessionId: idLiveSessionShop2,
        productId: idProduct2,
        variantId: idVariant2,
        displayCode: `S2-${runId}`,
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

  // ── Test 1: Create PENDING_REVIEW booking (no reservation, history null→PENDING) ──
  try {
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    assert(variantBefore.reservedQty === 0, `pre-test reservedQty expected 0, got ${variantBefore.reservedQty}`);

    const result = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 2,
      status: 'PENDING_REVIEW',
      changedById: idUser,
    });

    assert(result.status === 'PENDING_REVIEW', `expected PENDING_REVIEW, got ${result.status}`);
    assert(result.idempotent === false, 'fresh create should not be idempotent');
    assert(result.reservationId === null, 'PENDING_REVIEW must have null reservationId');
    assert(result.unitPrice === '12.34', `unitPrice expected '12.34', got '${result.unitPrice}'`);
    assert(result.quantity === 2, `quantity expected 2, got ${result.quantity}`);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    assert(booking.status === 'PENDING_REVIEW', 'booking.status mismatch');
    assert(booking.source === 'MANUAL', `source expected MANUAL, got ${booking.source}`);
    assert(booking.unitPrice.toString() === '12.34', 'unitPrice not captured on booking row');
    assert(booking.createdById === idUser, 'createdById not set');
    assert(booking.idempotencyKey === null, 'idempotencyKey should be null when omitted');

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variantAfter.reservedQty === 0, 'reservedQty must NOT change for PENDING_REVIEW');

    const reservations = await prisma.stockReservation.count({
      where: { bookingId: result.bookingId },
    });
    assert(reservations === 0, 'no reservation should exist for PENDING_REVIEW');

    const history = await prisma.bookingHistory.findMany({
      where: { bookingId: result.bookingId },
      orderBy: { createdAt: 'asc' },
    });
    assert(history.length === 1, `expected 1 history row, got ${history.length}`);
    assert(history[0].fromStatus === null, `fromStatus expected null, got ${history[0].fromStatus}`);
    assert(history[0].toStatus === 'PENDING_REVIEW', 'toStatus mismatch');
    assert(history[0].changedById === idUser, 'changedById mismatch');

    record('Test 1 — Create PENDING_REVIEW (no reservation)', 'PASS');
  } catch (err) {
    record('Test 1 — Create PENDING_REVIEW (no reservation)', 'FAIL', (err as Error).message);
  }

  // ── Test 2: Create CONFIRMED booking (booking + reservation + 2 history rows) ──
  try {
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });

    const result = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 3,
      status: 'CONFIRMED',
      changedById: idUser,
    });

    assert(result.status === 'CONFIRMED', `expected CONFIRMED, got ${result.status}`);
    assert(result.idempotent === false, 'fresh create should not be idempotent');
    assert(result.reservationId !== null, 'CONFIRMED must have reservationId');
    assert(result.unitPrice === '12.34', `unitPrice expected '12.34', got '${result.unitPrice}'`);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    assert(booking.status === 'CONFIRMED', 'booking.status mismatch');
    assert(booking.confirmedAt !== null, 'confirmedAt should be set');

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    assert(variantAfter.quantity === variantBefore.quantity, 'quantity should NOT change on confirm');
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty + 3,
      `reservedQty expected +3, got delta=${variantAfter.reservedQty - variantBefore.reservedQty}`
    );

    const reservation = await prisma.stockReservation.findUniqueOrThrow({
      where: { id: result.reservationId! },
      select: { bookingId: true, orderId: true, quantity: true, releasedAt: true },
    });
    assert(reservation.bookingId === result.bookingId, 'reservation.bookingId mismatch');
    assert(reservation.orderId === null, 'reservation.orderId must be null on booking-side reservation');
    assert(reservation.releasedAt === null, 'reservation.releasedAt must be null on active');
    assert(reservation.quantity === 3, 'reservation.quantity mismatch');

    const history = await prisma.bookingHistory.findMany({
      where: { bookingId: result.bookingId },
      orderBy: { createdAt: 'asc' },
    });
    assert(history.length === 2, `expected 2 history rows, got ${history.length}`);
    assert(history[0].fromStatus === null && history[0].toStatus === 'PENDING_REVIEW', 'history[0] mismatch');
    assert(
      history[1].fromStatus === 'PENDING_REVIEW' && history[1].toStatus === 'CONFIRMED',
      'history[1] mismatch'
    );

    record('Test 2 — Create CONFIRMED (booking + reservation + 2 history)', 'PASS');
  } catch (err) {
    record('Test 2 — Create CONFIRMED (booking + reservation + 2 history)', 'FAIL', (err as Error).message);
  }

  // ── Test 3: Insufficient stock on create-and-confirm rolls back entire tx ──
  try {
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    const bookingsBefore = await prisma.booking.count({ where: { shopId: idShop } });
    const reservationsBefore = await prisma.stockReservation.count({
      where: { variantId: idVariant },
    });

    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBP,
        quantity: 999, // far exceeds available
        status: 'CONFIRMED',
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected createManual to throw on insufficient stock');
    assert(code === 'INSUFFICIENT_STOCK', `expected INSUFFICIENT_STOCK, got ${code ?? 'no AppError'}`);

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { quantity: true, reservedQty: true },
    });
    assert(variantAfter.quantity === variantBefore.quantity, 'quantity must not change');
    assert(
      variantAfter.reservedQty === variantBefore.reservedQty,
      `reservedQty must rollback: ${variantBefore.reservedQty} → ${variantAfter.reservedQty}`
    );

    const bookingsAfter = await prisma.booking.count({ where: { shopId: idShop } });
    assert(
      bookingsAfter === bookingsBefore,
      `booking count must rollback: ${bookingsBefore} → ${bookingsAfter} (orphan PENDING_REVIEW left!)`
    );

    const reservationsAfter = await prisma.stockReservation.count({
      where: { variantId: idVariant },
    });
    assert(
      reservationsAfter === reservationsBefore,
      `reservation count must rollback: ${reservationsBefore} → ${reservationsAfter}`
    );

    record('Test 3 — Insufficient stock rolls back transaction', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 3 — Insufficient stock rolls back transaction', 'FAIL', (err as Error).message);
  }

  // ── Test 4: Cross-shop BroadcastProduct rejected ──
  try {
    const bookingsBefore = await prisma.booking.count({ where: { shopId: idShop } });

    let threw = false;
    let code: string | undefined;
    try {
      // Trying to attach a Shop B's BroadcastProduct to a Shop A booking
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBPShop2, // belongs to idLiveSessionShop2, not idLiveSession
        quantity: 1,
        status: 'PENDING_REVIEW',
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected cross-session BroadcastProduct to throw');
    assert(code === 'NOT_FOUND', `expected NOT_FOUND (BP not found in this session), got ${code}`);

    // Now try the cross-shop variant (BP in Shop A's session, variant from Shop B)
    let threw2 = false;
    let code2: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBPCrossShop,
        quantity: 1,
        status: 'PENDING_REVIEW',
        changedById: idUser,
      });
    } catch (err) {
      threw2 = true;
      if (err instanceof AppError) code2 = err.code;
    }
    assert(threw2, 'expected cross-shop variant to throw');
    assert(code2 === 'CONFLICT', `expected CONFLICT (cross-shop variant), got ${code2}`);

    const bookingsAfter = await prisma.booking.count({ where: { shopId: idShop } });
    assert(bookingsAfter === bookingsBefore, 'no booking should be created on cross-shop reject');

    record('Test 4 — Cross-shop BP/variant rejected', 'PASS', `bp_session=${code} variant_shop=${code2}`);
  } catch (err) {
    record('Test 4 — Cross-shop BP/variant rejected', 'FAIL', (err as Error).message);
  }

  // ── Test 5: Banned customer rejected ──
  try {
    const bookingsBefore = await prisma.booking.count({ where: { customerId: idCustomerBanned } });
    const variantBefore = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });

    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomerBanned,
        broadcastProductId: idBP,
        quantity: 1,
        status: 'CONFIRMED',
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected banned customer to throw');
    assert(code === 'CONFLICT', `expected CONFLICT (banned), got ${code}`);

    const bookingsAfter = await prisma.booking.count({ where: { customerId: idCustomerBanned } });
    assert(bookingsAfter === bookingsBefore, 'no booking should be created for banned customer');

    const variantAfter = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(variantAfter.reservedQty === variantBefore.reservedQty, 'no stock mutation for banned customer');

    record('Test 5 — Banned customer rejected', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 5 — Banned customer rejected', 'FAIL', (err as Error).message);
  }

  // ── Test 6: idempotencyKey replay returns existing booking ──
  try {
    const idempotencyKey = `test6-${runId}`;

    // First call
    const first = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 1,
      status: 'CONFIRMED',
      idempotencyKey,
      changedById: idUser,
    });
    assert(first.idempotent === false, 'first call should not be idempotent');
    assert(first.reservationId !== null, 'first CONFIRMED call should have reservationId');

    const variantAfterFirst = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    const historyCountAfterFirst = await prisma.bookingHistory.count({
      where: { bookingId: first.bookingId },
    });
    const reservationCountAfterFirst = await prisma.stockReservation.count({
      where: { bookingId: first.bookingId },
    });

    // Second call (same key, same payload)
    const second = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 1,
      status: 'CONFIRMED',
      idempotencyKey,
      changedById: idUser,
    });

    assert(second.idempotent === true, 'replay should be idempotent');
    assert(second.bookingId === first.bookingId, 'replay should return same bookingId');
    assert(second.status === 'CONFIRMED', 'replay status mismatch');
    assert(second.reservationId === first.reservationId, 'replay reservationId mismatch');

    const variantAfterSecond = await prisma.productVariant.findUniqueOrThrow({
      where: { id: idVariant },
      select: { reservedQty: true },
    });
    assert(
      variantAfterSecond.reservedQty === variantAfterFirst.reservedQty,
      `reservedQty changed on replay: ${variantAfterFirst.reservedQty} → ${variantAfterSecond.reservedQty}`
    );

    const historyCountAfterSecond = await prisma.bookingHistory.count({
      where: { bookingId: first.bookingId },
    });
    assert(
      historyCountAfterSecond === historyCountAfterFirst,
      `history rows changed on replay: ${historyCountAfterFirst} → ${historyCountAfterSecond}`
    );

    const reservationCountAfterSecond = await prisma.stockReservation.count({
      where: { bookingId: first.bookingId },
    });
    assert(
      reservationCountAfterSecond === reservationCountAfterFirst,
      `reservation count changed on replay: ${reservationCountAfterFirst} → ${reservationCountAfterSecond}`
    );

    record('Test 6 — idempotencyKey replay (CONFIRMED)', 'PASS');
  } catch (err) {
    record('Test 6 — idempotencyKey replay (CONFIRMED)', 'FAIL', (err as Error).message);
  }

  // ── Test 7: idempotencyKey reused with different payload throws conflict ──
  try {
    const idempotencyKey = `test7-${runId}`;

    // First call
    await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 1,
      status: 'PENDING_REVIEW',
      idempotencyKey,
      changedById: idUser,
    });

    // Second call: same key, DIFFERENT quantity
    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBP,
        quantity: 2, // different
        status: 'PENDING_REVIEW',
        idempotencyKey,
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }
    assert(threw, 'expected payload mismatch to throw');
    assert(code === 'CONFLICT', `expected CONFLICT on payload mismatch, got ${code}`);

    // Test invalid format
    let threwFmt = false;
    let codeFmt: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBP,
        quantity: 1,
        status: 'PENDING_REVIEW',
        idempotencyKey: 'too$short!', // invalid char + too short anyway
        changedById: idUser,
      });
    } catch (err) {
      threwFmt = true;
      if (err instanceof AppError) codeFmt = err.code;
    }
    assert(threwFmt, 'expected bad idempotencyKey format to throw');
    assert(codeFmt === 'VALIDATION_ERROR', `expected VALIDATION_ERROR on bad format, got ${codeFmt}`);

    record('Test 7 — idempotencyKey mismatch + bad format', 'PASS', `mismatch=${code} bad_format=${codeFmt}`);
  } catch (err) {
    record('Test 7 — idempotencyKey mismatch + bad format', 'FAIL', (err as Error).message);
  }

  // ── Test 8: Duplicate create without idempotencyKey produces separate rows ──
  try {
    const beforeCount = await prisma.booking.count({
      where: { shopId: idShop, customerId: idCustomer, broadcastProductId: idBP },
    });

    const a = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 1,
      status: 'PENDING_REVIEW',
      changedById: idUser,
    });
    const b = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 1,
      status: 'PENDING_REVIEW',
      changedById: idUser,
    });

    assert(a.bookingId !== b.bookingId, 'no-key duplicates must have distinct bookingIds');
    assert(a.idempotent === false && b.idempotent === false, 'neither call should be idempotent');

    const afterCount = await prisma.booking.count({
      where: { shopId: idShop, customerId: idCustomer, broadcastProductId: idBP },
    });
    assert(afterCount === beforeCount + 2, `expected +2 bookings, got delta=${afterCount - beforeCount}`);

    record('Test 8 — Duplicate without key creates separate rows', 'PASS');
  } catch (err) {
    record('Test 8 — Duplicate without key creates separate rows', 'FAIL', (err as Error).message);
  }

  // ── Test 9: Customer from different shop rejected ──
  try {
    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomerOtherShop, // belongs to idShop2
        broadcastProductId: idBP,
        quantity: 1,
        status: 'PENDING_REVIEW',
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }
    assert(threw, 'expected cross-shop customer to throw');
    assert(code === 'NOT_FOUND', `expected NOT_FOUND, got ${code}`);

    record('Test 9 — Cross-shop customer rejected', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 9 — Cross-shop customer rejected', 'FAIL', (err as Error).message);
  }

  // ── Test 10: Quantity boundary validation ──
  try {
    const cases: Array<{ q: number; label: string }> = [
      { q: 0, label: 'zero' },
      { q: -1, label: 'negative' },
      { q: 1000, label: 'over-max' },
      { q: 1.5, label: 'fractional' },
    ];
    for (const c of cases) {
      let threw = false;
      let code: string | undefined;
      try {
        await bookingRepository.createManual({
          shopId: idShop,
          liveSessionId: idLiveSession,
          customerId: idCustomer,
          broadcastProductId: idBP,
          quantity: c.q,
          status: 'PENDING_REVIEW',
          changedById: idUser,
        });
      } catch (err) {
        threw = true;
        if (err instanceof AppError) code = err.code;
      }
      assert(threw, `expected throw on quantity=${c.q} (${c.label})`);
      assert(
        code === 'VALIDATION_ERROR',
        `expected VALIDATION_ERROR for ${c.label}, got ${code}`
      );
    }
    record('Test 10 — Quantity boundary validation', 'PASS', '0/-1/1000/1.5 all rejected');
  } catch (err) {
    record('Test 10 — Quantity boundary validation', 'FAIL', (err as Error).message);
  }

  // ── Test 11: BroadcastProduct without variantId rejected ──
  try {
    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBPNoVariant,
        quantity: 1,
        status: 'PENDING_REVIEW',
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }
    assert(threw, 'expected null-variantId BP to throw');
    assert(code === 'VARIANT_REQUIRED', `expected VARIANT_REQUIRED, got ${code}`);

    record('Test 11 — BroadcastProduct without variantId rejected', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 11 — BroadcastProduct without variantId rejected', 'FAIL', (err as Error).message);
  }

  // ── Test 12: priceOverride captured in unitPrice when present ──
  try {
    const idBPOverride = `${runId}--bp-over`;
    await prisma.broadcastProduct.create({
      data: {
        id: idBPOverride,
        shopId: idShop,
        liveSessionId: idLiveSession,
        productId: idProduct,
        variantId: idVariant,
        displayCode: `OVR-${runId}`,
        priceOverride: '5.50',
      },
    });

    const result = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBPOverride,
      quantity: 1,
      status: 'PENDING_REVIEW',
      changedById: idUser,
    });
    // Prisma Decimal serializes 5.50 → '5.5' via .toString() (strips trailing zero).
    // We compare numerically to confirm the override value was captured, not the
    // variant fallback price (12.34).
    assert(
      Number(result.unitPrice) === 5.5,
      `expected priceOverride numeric 5.5, got '${result.unitPrice}'`
    );

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    assert(
      Number(booking.unitPrice.toString()) === 5.5,
      `booking row unitPrice should match override (5.5), got '${booking.unitPrice.toString()}'`
    );

    // Mutate override after capture: snapshot must NOT shift
    await prisma.broadcastProduct.update({
      where: { id: idBPOverride },
      data: { priceOverride: '999.99' },
    });
    const bookingReread = await prisma.booking.findUniqueOrThrow({ where: { id: result.bookingId } });
    assert(
      Number(bookingReread.unitPrice.toString()) === 5.5,
      `booking unitPrice should be frozen at 5.5 even after override change, got '${bookingReread.unitPrice.toString()}'`
    );

    record('Test 12 — priceOverride captured + frozen', 'PASS');
  } catch (err) {
    record('Test 12 — priceOverride captured + frozen', 'FAIL', (err as Error).message);
  }

  // ── Test 13: idempotency replay surfaces multi-active reservation corruption (2M-c) ──
  try {
    const idempotencyKey = `test13-${runId}`;

    // First: create CONFIRMED booking via the public path so we get a real
    // first reservation row.
    const first = await bookingRepository.createManual({
      shopId: idShop,
      liveSessionId: idLiveSession,
      customerId: idCustomer,
      broadcastProductId: idBP,
      quantity: 1,
      status: 'CONFIRMED',
      idempotencyKey,
      changedById: idUser,
    });
    assert(first.idempotent === false, 'first call should not be idempotent');
    assert(first.reservationId !== null, 'first CONFIRMED must have a reservationId');

    // Inject a SECOND active StockReservation directly to simulate corruption.
    // This mirrors the verify-booking-flow Test 6 multi-active simulation.
    await prisma.stockReservation.create({
      data: {
        variantId: idVariant,
        bookingId: first.bookingId,
        quantity: 1,
        expiresAt: NO_EXPIRY_SENTINEL,
      },
    });

    // Replay with same key + same payload should now surface the integrity
    // error rather than silently picking the first active reservation.
    let threw = false;
    let code: string | undefined;
    try {
      await bookingRepository.createManual({
        shopId: idShop,
        liveSessionId: idLiveSession,
        customerId: idCustomer,
        broadcastProductId: idBP,
        quantity: 1,
        status: 'CONFIRMED',
        idempotencyKey,
        changedById: idUser,
      });
    } catch (err) {
      threw = true;
      if (err instanceof AppError) code = err.code;
    }

    assert(threw, 'expected multi-active replay to throw');
    assert(
      code === 'RESERVATION_INTEGRITY_ERROR',
      `expected RESERVATION_INTEGRITY_ERROR, got ${code ?? 'no AppError'}`
    );

    // Confirm replay did NOT mutate state: still 2 active reservations,
    // booking still CONFIRMED, no extra history rows.
    const reservationsAfter = await prisma.stockReservation.count({
      where: { bookingId: first.bookingId, releasedAt: null },
    });
    assert(
      reservationsAfter === 2,
      `expected 2 active reservations (corruption preserved for inspection), got ${reservationsAfter}`
    );

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: first.bookingId } });
    assert(booking.status === 'CONFIRMED', 'booking status must remain CONFIRMED on failed replay');

    record('Test 13 — Multi-active replay surfaces integrity error (2M-c)', 'PASS', `code=${code}`);
  } catch (err) {
    record('Test 13 — Multi-active replay surfaces integrity error (2M-c)', 'FAIL', (err as Error).message);
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
  const fixturePrefix = `${runId}--`;
  const targets: Array<{ name: string; fn: () => Promise<{ count: number }> }> = [
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
    // Bookings carry idempotencyKey inside the test; no explicit FK fan-out needed
    // beyond StockReservation/History which are already cleared above.
    {
      name: 'Booking',
      fn: () =>
        prisma.booking.deleteMany({
          where: {
            OR: [
              { shopId: { startsWith: fixturePrefix } },
              { liveSessionId: { startsWith: fixturePrefix } },
            ],
          },
        }),
    },
    {
      name: 'BroadcastProduct',
      fn: () =>
        prisma.broadcastProduct.deleteMany({
          where: { liveSessionId: { startsWith: fixturePrefix } },
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
      name: 'ShopMember',
      fn: () =>
        prisma.shopMember.deleteMany({
          where: {
            OR: [
              { shopId: { startsWith: fixturePrefix } },
              { userId: { startsWith: fixturePrefix } },
            ],
          },
        }),
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
      console.error(`  HINT: search '${fixturePrefix}' (startsWith) in ${t.name} table to manually clean up`);
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
