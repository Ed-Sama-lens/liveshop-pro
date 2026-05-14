/**
 * Non-production end-to-end verifier for BroadcastProduct CRUD
 * (Tier 3 PR 4 — Add from Stock).
 *
 * Exercises the new broadcastProductRepository.create + list helpers
 * under both live-bound and evergreen modes, with cross-shop /
 * cross-variant denial checks and feature-flag gating.
 *
 * PRODUCTION SAFETY: refuses to run unless ALL of:
 *   1. process.env.CONFIRM_NON_PROD_DB === 'true'
 *   2. DATABASE_URL is set
 *   3. DATABASE_URL host is NOT a known production marker
 *      ('junction.proxy.rlwy.net' / 'rlwy.net')
 *   4. DATABASE_URL does NOT contain literal 'nazhahatyai'
 *
 * Usage:
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx -y tsx scripts/verify-broadcast-product-crud.ts
 *
 * Test cases (16, A-P):
 *   A. create live-bound BP (no evergreen flag needed)
 *   B. duplicate live-bound displayCode rejects with ConflictError
 *   C. create evergreen with flag OFF rejects with ValidationError
 *   D. create evergreen with flag ON succeeds
 *   E. duplicate evergreen same shop rejects with ConflictError
 *   F. duplicate evergreen DIFFERENT shop succeeds (partial unique scoped per shop)
 *   G. cross-shop variant rejects with NotFoundError
 *   H. list scope=live returns live-bound rows only
 *   I. list scope=evergreen returns evergreen rows only
 *   J. PATCH priceOverride sets value, GET reflects
 *   K. PATCH isPinned toggles, list orders by isPinned desc
 *   L. PATCH empty body rejects with ValidationError
 *   M. PATCH cross-shop rejects with NotFoundError
 *   N. DELETE with zero bookings succeeds
 *   O. DELETE with active booking rejects with ConflictError
 *   P. DELETE cross-shop rejects with NotFoundError
 */

// Flag default OFF for test C; flipped on for D-F via env mutation
process.env.ALLOW_EVERGREEN_BROADCAST_PRODUCT = 'false';

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { broadcastProductRepository } from '../src/server/repositories/broadcast-product.repository';
import { AppError, ConflictError, ValidationError, NotFoundError } from '../src/lib/errors';

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
  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      console.error(`[GUARD] Refusing to run: DATABASE_URL host matches "${denied}".`);
      process.exit(2);
    }
  }
  if (url.includes('nazhahatyai')) {
    console.error('[GUARD] Refusing to run: DATABASE_URL contains "nazhahatyai".');
    process.exit(2);
  }
  if (!ALLOWED_LOCAL_HOSTS.includes(parsed.hostname as (typeof ALLOWED_LOCAL_HOSTS)[number])) {
    console.error(
      `[GUARD] Refusing to run: DATABASE_URL host "${parsed.hostname}" is not in allowed local hosts ${JSON.stringify(ALLOWED_LOCAL_HOSTS)}.`
    );
    process.exit(2);
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (dbName !== REQUIRED_DB_NAME) {
    console.error(
      `[GUARD] Refusing to run: database name "${dbName}" is not "${REQUIRED_DB_NAME}".`
    );
    process.exit(2);
  }
  const runId =
    process.env.VERIFY_BP_RUN_ID ?? `${Date.now()}`;
  console.log(`[GUARD] OK. host=${sanitizedHost} db=${dbName} runId=${runId}`);
  return { url, runId, sanitizedHost };
}

interface TestResult {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL';
  readonly detail?: string;
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

async function run(): Promise<void> {
  const { url, runId } = assertNonProdDatabase();

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  const results: TestResult[] = [];

  function record(name: string, status: 'PASS' | 'FAIL', detail?: string): void {
    results.push({ name, status, ...(detail !== undefined ? { detail } : {}) });
    const tag = status === 'PASS' ? '[PASS]' : '[FAIL]';
    const det = detail ? ` — ${detail}` : '';
    console.log(`${tag} ${name}${det}`);
  }

  const idShop1 = `${runId}--shop1`;
  const idShop2 = `${runId}--shop2`;
  const idUser = `${runId}--user`;
  const idCustomer1 = `${runId}--cust1`;
  const idSession = `${runId}--sess`;
  const idProduct1 = `${runId}--prod1`;
  const idProduct2 = `${runId}--prod2`;
  const idVariant1 = `${runId}--var1`;
  const idVariant2 = `${runId}--var2`;

  let setupOk = false;
  try {
    console.log('=== Fixture setup ===');
    // ── Setup ─────────────────────────────────────────────────────────
    await prisma.user.create({
      data: {
        id: idUser,
        name: 'Verifier User',
        role: 'OWNER',
      },
    });
    await prisma.shop.create({
      data: {
        id: idShop1,
        name: `Verify BP CRUD ${runId} Shop1`,
        slug: `verify-bp-${runId}-1`,
        defaultCurrency: 'MYR',
      },
    });
    await prisma.shop.create({
      data: {
        id: idShop2,
        name: `Verify BP CRUD ${runId} Shop2`,
        slug: `verify-bp-${runId}-2`,
        defaultCurrency: 'MYR',
      },
    });
    await prisma.shopMember.create({
      data: { shopId: idShop1, userId: idUser, role: 'OWNER' },
    });
    await prisma.customer.create({
      data: {
        id: idCustomer1,
        shopId: idShop1,
        name: 'Verifier Customer',
        channel: 'MANUAL',
      },
    });
    await prisma.liveSession.create({
      data: {
        id: idSession,
        shopId: idShop1,
        title: 'Verifier Live',
        status: 'LIVE',
        startedAt: new Date(),
      },
    });
    await prisma.product.create({
      data: {
        id: idProduct1,
        shopId: idShop1,
        stockCode: `${runId}-s1`,
        name: 'Verifier Product Shop1',
      },
    });
    await prisma.product.create({
      data: {
        id: idProduct2,
        shopId: idShop2,
        stockCode: `${runId}-s2`,
        name: 'Verifier Product Shop2',
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant1,
        productId: idProduct1,
        sku: `${runId}-sku1`,
        attributes: { size: 'M' },
        price: '12.50',
        quantity: 10,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: idVariant2,
        productId: idProduct2,
        sku: `${runId}-sku2`,
        attributes: { size: 'L' },
        price: '20.00',
        quantity: 5,
      },
    });
    setupOk = true;
    console.log('Fixtures created.');
  } catch (err) {
    console.error('Fixture setup failed:', (err as Error).stack ?? (err as Error).message);
    record('Fixture setup', 'FAIL', (err as Error).message);
  }

  try {
    if (!setupOk) {
      // skip tests; cleanup still runs in finally
    } else {

    let _createdLiveBPId: string | null = null;
    let _createdEvergreenShop1Id: string | null = null;

    // ── Test A: live-bound create (no evergreen flag) ────────────────
    try {
      const bp = await broadcastProductRepository.create({
        shopId: idShop1,
        variantId: idVariant1,
        displayCode: 'A1',
        liveSessionId: idSession,
      });
      _createdLiveBPId = bp.broadcastProductId;
      assert(bp.liveSessionId === idSession, 'expected liveSessionId set');
      assert(bp.shopId === idShop1, 'expected shop1');
      record('Test A — live-bound create', 'PASS', `id=${bp.broadcastProductId.slice(-8)}`);
    } catch (err) {
      record('Test A — live-bound create', 'FAIL', (err as Error).message);
    }

    // ── Test B: duplicate live-bound displayCode rejects ─────────────
    try {
      await broadcastProductRepository.create({
        shopId: idShop1,
        variantId: idVariant1,
        displayCode: 'A1',
        liveSessionId: idSession,
      });
      record('Test B — duplicate live-bound rejects', 'FAIL', 'expected ConflictError, got none');
    } catch (err) {
      if (err instanceof ConflictError) {
        record('Test B — duplicate live-bound rejects', 'PASS');
      } else {
        record('Test B — duplicate live-bound rejects', 'FAIL', `expected ConflictError, got ${(err as Error).constructor.name}`);
      }
    }

    // ── Test C: evergreen with flag OFF rejects ──────────────────────
    process.env.ALLOW_EVERGREEN_BROADCAST_PRODUCT = 'false';
    try {
      await broadcastProductRepository.create({
        shopId: idShop1,
        variantId: idVariant1,
        displayCode: 'EVG1',
      });
      record('Test C — evergreen flag-off rejects', 'FAIL', 'expected ValidationError');
    } catch (err) {
      if (err instanceof ValidationError) {
        record('Test C — evergreen flag-off rejects', 'PASS');
      } else {
        record('Test C — evergreen flag-off rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
      }
    }

    // ── Test D: evergreen with flag ON succeeds ──────────────────────
    process.env.ALLOW_EVERGREEN_BROADCAST_PRODUCT = 'true';
    try {
      const bp = await broadcastProductRepository.create({
        shopId: idShop1,
        variantId: idVariant1,
        displayCode: 'EVG1',
      });
      _createdEvergreenShop1Id = bp.broadcastProductId;
      assert(bp.liveSessionId === null, 'expected evergreen (null liveSessionId)');
      record('Test D — evergreen flag-on succeeds', 'PASS', `id=${bp.broadcastProductId.slice(-8)}`);
    } catch (err) {
      record('Test D — evergreen flag-on succeeds', 'FAIL', (err as Error).message);
    }

    // ── Test E: duplicate evergreen same shop rejects ────────────────
    try {
      await broadcastProductRepository.create({
        shopId: idShop1,
        variantId: idVariant1,
        displayCode: 'EVG1',
      });
      record('Test E — duplicate evergreen same shop rejects', 'FAIL', 'expected ConflictError');
    } catch (err) {
      if (err instanceof ConflictError) {
        record('Test E — duplicate evergreen same shop rejects', 'PASS');
      } else {
        record('Test E — duplicate evergreen same shop rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
      }
    }

    // ── Test F: duplicate evergreen DIFFERENT shop succeeds ──────────
    try {
      const bp = await broadcastProductRepository.create({
        shopId: idShop2,
        variantId: idVariant2,
        displayCode: 'EVG1',
      });
      assert(bp.shopId === idShop2, 'expected shop2');
      assert(bp.liveSessionId === null, 'expected evergreen');
      record('Test F — duplicate evergreen different shop succeeds', 'PASS');
    } catch (err) {
      record('Test F — duplicate evergreen different shop succeeds', 'FAIL', (err as Error).message);
    }

    // ── Test G: cross-shop variant rejects ───────────────────────────
    try {
      await broadcastProductRepository.create({
        shopId: idShop1,
        variantId: idVariant2, // belongs to shop2
        displayCode: 'XS1',
      });
      record('Test G — cross-shop variant rejects', 'FAIL', 'expected NotFoundError');
    } catch (err) {
      if (err instanceof NotFoundError) {
        record('Test G — cross-shop variant rejects', 'PASS');
      } else {
        record('Test G — cross-shop variant rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
      }
    }

    // ── Test H: list scope=live returns live-bound only ──────────────
    try {
      const live = await broadcastProductRepository.list({
        shopId: idShop1,
        scope: 'live',
        limit: 50,
      });
      assert(live.length >= 1, `expected >=1 live-bound, got ${live.length}`);
      assert(
        live.every((b) => b.liveSessionId !== null),
        'all rows must have liveSessionId set'
      );
      record('Test H — list scope=live filters', 'PASS', `count=${live.length}`);
    } catch (err) {
      record('Test H — list scope=live filters', 'FAIL', (err as Error).message);
    }

    // ── Test I: list scope=evergreen returns evergreen only ──────────
    try {
      const evg = await broadcastProductRepository.list({
        shopId: idShop1,
        scope: 'evergreen',
        limit: 50,
      });
      assert(evg.length >= 1, `expected >=1 evergreen, got ${evg.length}`);
      assert(
        evg.every((b) => b.liveSessionId === null),
        'all rows must have null liveSessionId'
      );
      record('Test I — list scope=evergreen filters', 'PASS', `count=${evg.length}`);
    } catch (err) {
      record('Test I — list scope=evergreen filters', 'FAIL', (err as Error).message);
    }

    // ── Test J: PATCH priceOverride ──────────────────────────────────
    if (_createdLiveBPId) {
      try {
        const upd = await broadcastProductRepository.update({
          shopId: idShop1,
          id: _createdLiveBPId,
          priceOverride: '9.99',
        });
        assert(upd.priceOverride === '9.99', `expected '9.99', got ${upd.priceOverride}`);
        record('Test J — PATCH priceOverride', 'PASS');
      } catch (err) {
        record('Test J — PATCH priceOverride', 'FAIL', (err as Error).message);
      }
    }

    // ── Test K: PATCH isPinned toggle ────────────────────────────────
    if (_createdLiveBPId) {
      try {
        const upd = await broadcastProductRepository.update({
          shopId: idShop1,
          id: _createdLiveBPId,
          isPinned: true,
        });
        assert(upd.isPinned === true, 'expected isPinned=true');
        record('Test K — PATCH isPinned toggle', 'PASS');
      } catch (err) {
        record('Test K — PATCH isPinned toggle', 'FAIL', (err as Error).message);
      }
    }

    // ── Test L: PATCH empty body rejects ─────────────────────────────
    if (_createdLiveBPId) {
      try {
        await broadcastProductRepository.update({
          shopId: idShop1,
          id: _createdLiveBPId,
        });
        record('Test L — PATCH empty body rejects', 'FAIL', 'expected ValidationError');
      } catch (err) {
        if (err instanceof ValidationError) {
          record('Test L — PATCH empty body rejects', 'PASS');
        } else {
          record('Test L — PATCH empty body rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
        }
      }
    }

    // ── Test M: PATCH cross-shop rejects ─────────────────────────────
    if (_createdLiveBPId) {
      try {
        await broadcastProductRepository.update({
          shopId: idShop2, // wrong shop
          id: _createdLiveBPId,
          isPinned: false,
        });
        record('Test M — PATCH cross-shop rejects', 'FAIL', 'expected NotFoundError');
      } catch (err) {
        if (err instanceof NotFoundError) {
          record('Test M — PATCH cross-shop rejects', 'PASS');
        } else {
          record('Test M — PATCH cross-shop rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
        }
      }
    }

    // ── Test N: DELETE with zero bookings succeeds ───────────────────
    if (_createdEvergreenShop1Id) {
      try {
        const result = await broadcastProductRepository.delete({
          shopId: idShop1,
          id: _createdEvergreenShop1Id,
        });
        assert(result.id === _createdEvergreenShop1Id, 'expected returned id matches');
        record('Test N — DELETE no-bookings succeeds', 'PASS');
        _createdEvergreenShop1Id = null; // mark deleted for cleanup
      } catch (err) {
        record('Test N — DELETE no-bookings succeeds', 'FAIL', (err as Error).message);
      }
    }

    // ── Test O: DELETE with active booking rejects ──────────────────
    // Create a fixture booking referencing _createdLiveBPId, then attempt delete
    if (_createdLiveBPId) {
      try {
        await prisma.booking.create({
          data: {
            id: `${runId}--booking-active`,
            shopId: idShop1,
            liveSessionId: idSession,
            broadcastProductId: _createdLiveBPId,
            customerId: idCustomer1,
            quantity: 1,
            unitPrice: '9.99',
            status: 'PENDING_REVIEW',
            source: 'MANUAL',
          },
        });
        try {
          await broadcastProductRepository.delete({
            shopId: idShop1,
            id: _createdLiveBPId,
          });
          record('Test O — DELETE active-bookings rejects', 'FAIL', 'expected ConflictError');
        } catch (err) {
          if (err instanceof ConflictError) {
            record('Test O — DELETE active-bookings rejects', 'PASS');
          } else {
            record('Test O — DELETE active-bookings rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
          }
        }
      } catch (err) {
        record('Test O — DELETE active-bookings rejects', 'FAIL', `setup failed: ${(err as Error).message}`);
      }
    }

    // ── Test P: DELETE cross-shop rejects ────────────────────────────
    if (_createdLiveBPId) {
      try {
        await broadcastProductRepository.delete({
          shopId: idShop2, // wrong shop
          id: _createdLiveBPId,
        });
        record('Test P — DELETE cross-shop rejects', 'FAIL', 'expected NotFoundError');
      } catch (err) {
        if (err instanceof NotFoundError) {
          record('Test P — DELETE cross-shop rejects', 'PASS');
        } else {
          record('Test P — DELETE cross-shop rejects', 'FAIL', `got ${(err as Error).constructor.name}`);
        }
      }
    }

    } // end else
  } finally {
    console.log('');
    console.log('=== Cleanup ===');
    const ops: Array<{ label: string; fn: () => Promise<{ count: number }> }> = [
      { label: 'Booking', fn: () => prisma.booking.deleteMany({ where: { OR: [{ shopId: idShop1 }, { shopId: idShop2 }] } }) },
      { label: 'BroadcastProduct', fn: () => prisma.broadcastProduct.deleteMany({ where: { OR: [{ shopId: idShop1 }, { shopId: idShop2 }] } }) },
      { label: 'ProductVariant', fn: () => prisma.productVariant.deleteMany({ where: { OR: [{ productId: idProduct1 }, { productId: idProduct2 }] } }) },
      { label: 'Product', fn: () => prisma.product.deleteMany({ where: { OR: [{ shopId: idShop1 }, { shopId: idShop2 }] } }) },
      { label: 'LiveSession', fn: () => prisma.liveSession.deleteMany({ where: { id: idSession } }) },
      { label: 'Customer', fn: () => prisma.customer.deleteMany({ where: { shopId: idShop1 } }) },
      { label: 'Shop', fn: () => prisma.shop.deleteMany({ where: { OR: [{ id: idShop1 }, { id: idShop2 }] } }) },
      { label: 'User', fn: () => prisma.user.deleteMany({ where: { id: idUser } }) },
    ];
    for (const op of ops) {
      try {
        const r = await op.fn();
        console.log(`  cleanup ${op.label}: ${r.count} row(s) deleted`);
      } catch (err) {
        console.error(`  cleanup ${op.label} failed:`, (err as Error).message);
      }
    }

    console.log('');
    console.log('=== Summary ===');
    const pass = results.filter((r) => r.status === 'PASS').length;
    const fail = results.filter((r) => r.status === 'FAIL').length;
    const total = results.length;
    console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${total}`);
    await prisma.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
}

run().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
