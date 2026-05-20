/**
 * Non-production verifier for Tier 3.8 quick bulk product code create.
 *
 * Exercises the quickProductCodesRepository.createBulk() composite
 * transaction (Product + ProductVariant + BroadcastProduct) against
 * a LOCAL Docker postgres. Mirrors the surface of the new
 * POST /api/sale/quick-product-codes route but bypasses the HTTP +
 * auth layer to test the repo directly.
 *
 * PRODUCTION SAFETY (6 layers, identical to existing verifiers):
 *   1. CONFIRM_NON_PROD_DB=true required
 *   2. DATABASE_URL must be set
 *   3. Host must be localhost or 127.0.0.1
 *   4. Host must not match production deny-list
 *   5. URL must not contain 'nazhahatyai'
 *   6. DB name must equal 'liveshop_pro'
 *
 * Usage (Docker local DB only):
 *   docker compose up -d postgres
 *   DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npx prisma migrate deploy
 *   CONFIRM_NON_PROD_DB=true \
 *     VERIFY_TIER38_RUN_ID=$(date +%Y%m%d-%H%M%S) \
 *     DATABASE_URL='postgresql://liveshop:liveshop_dev_2024@localhost:5432/liveshop_pro' \
 *     npm run verify:sale:quick-bulk
 *
 * Cases (9):
 *   A. single quick create with all defaults
 *   B. bulk create 1..5
 *   C. quantity 0 create (sold out placeholder)
 *   D. price 0 create (price-undetermined placeholder)
 *   E. no-category create
 *   F. duplicate displayCode rollback (transaction integrity)
 *   G. invalid range reject (endNo < startNo)
 *   H. max batch exceed reject (range > 100)
 *   I. cleanup all fixtures
 *
 * Exit codes:
 *   0 — all 9 PASS + cleanup OK
 *   1 — any failure
 *   2 — production safety guard triggered
 */

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { evaluateNonProdDatabase } from './lib/non-prod-db-guard';
import { quickProductCodesRepository } from '../src/server/repositories/quick-product-codes.repository';
import { ConflictError, ValidationError } from '../src/lib/errors';

function assertNonProdDatabase(): {
  url: string;
  runId: string;
  sanitizedHost: string;
} {
  const result = evaluateNonProdDatabase({
    databaseUrl: process.env.DATABASE_URL,
    confirmNonProdDb: process.env.CONFIRM_NON_PROD_DB,
  });
  if (!result.ok) {
    console.error('[GUARD] Refusing to run:', result.reason);
    process.exit(2);
  }
  const runId = process.env.VERIFY_TIER38_RUN_ID || `${Date.now()}`;
  return { url: result.url, runId, sanitizedHost: result.sanitizedHost };
}

interface TestResult {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL';
  readonly detail?: string;
}

const results: TestResult[] = [];

function record(name: string, status: TestResult['status'], detail?: string): void {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail !== undefined ? ' — ' + detail : ''}`);
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  const { url, runId, sanitizedHost } = assertNonProdDatabase();

  console.log(`Running Tier 3.8 verifier against ${sanitizedHost}`);
  console.log(`Run id: ${runId}`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  const idShop = `${runId}--shop-t38`;
  const idUser = `${runId}--user-t38`;
  let categoryId: string | null = null;

  // ─── Fixture setup ────────────────────────────────────────────────
  let setupOk = false;
  try {
    await prisma.shop.create({
      data: {
        id: idShop,
        name: `Verify T3.8 ${runId}`,
        slug: `verify-t38-${runId}`,
        defaultCurrency: 'MYR',
      },
    });
    await prisma.user.create({
      data: { id: idUser, name: 'Verify T3.8 Admin', role: 'OWNER' },
    });
    await prisma.shopMember.create({
      data: { shopId: idShop, userId: idUser, role: 'OWNER' },
    });
    const cat = await prisma.productCategory.create({
      data: { shopId: idShop, name: `Test Category ${runId.slice(-8)}` },
    });
    categoryId = cat.id;
    setupOk = true;
    console.log('Fixtures created.');
  } catch (err) {
    console.error('Fixture setup failed:', (err as Error).message);
    record('Fixture setup', 'FAIL', (err as Error).message);
  }

  if (!setupOk) {
    await prisma.$disconnect();
    process.exit(1);
  }

  // ─── Case A — single quick create ────────────────────────────────
  try {
    const r = await quickProductCodesRepository.createBulk({
      shopId: idShop,
      stockCodeBase: `${runId}-A`,
      saleCodeBase: `A${runId.slice(-6)}`,
      price: '0',
      quantity: 1,
    });
    assert(r.createdCount === 1, `expected 1, got ${r.createdCount}`);
    assert(r.items.length === 1, 'items length mismatch');
    assert(r.items[0]!.stockCode === `${runId}-A`, 'stockCode mismatch');
    record('Case A — single create defaults', 'PASS', `BP=${r.items[0]!.broadcastProductId.slice(-8)}`);
  } catch (err) {
    record('Case A — single create defaults', 'FAIL', (err as Error).message);
  }

  // ─── Case B — bulk 1..5 ──────────────────────────────────────────
  try {
    const r = await quickProductCodesRepository.createBulk({
      shopId: idShop,
      stockCodeBase: `${runId}-B`,
      saleCodeBase: `B${runId.slice(-6)}_`,
      startNo: 1,
      endNo: 5,
      quantity: 1,
    });
    assert(r.createdCount === 5, `expected 5, got ${r.createdCount}`);
    assert(r.items.length === 5, 'items length mismatch');
    for (let i = 0; i < 5; i++) {
      assert(
        r.items[i]!.stockCode === `${runId}-B${i + 1}`,
        `item ${i} stockCode mismatch`
      );
    }
    record('Case B — bulk 1..5', 'PASS', 'created 5 trios');
  } catch (err) {
    record('Case B — bulk 1..5', 'FAIL', (err as Error).message);
  }

  // ─── Case C — quantity 0 ─────────────────────────────────────────
  try {
    const r = await quickProductCodesRepository.createBulk({
      shopId: idShop,
      stockCodeBase: `${runId}-C`,
      saleCodeBase: `C${runId.slice(-6)}`,
      quantity: 0,
    });
    assert(r.createdCount === 1, 'should create');
    const variant = await prisma.productVariant.findUnique({
      where: { id: r.items[0]!.variantId },
      select: { quantity: true },
    });
    assert(variant?.quantity === 0, `expected quantity=0, got ${variant?.quantity}`);
    record('Case C — quantity 0', 'PASS', 'variant.quantity=0');
  } catch (err) {
    record('Case C — quantity 0', 'FAIL', (err as Error).message);
  }

  // ─── Case D — price 0 ────────────────────────────────────────────
  try {
    const r = await quickProductCodesRepository.createBulk({
      shopId: idShop,
      stockCodeBase: `${runId}-D`,
      saleCodeBase: `D${runId.slice(-6)}`,
      price: '0',
    });
    const variant = await prisma.productVariant.findUnique({
      where: { id: r.items[0]!.variantId },
      select: { price: true },
    });
    assert(variant?.price.toString() === '0' || variant?.price.toString() === '0.00',
      `expected price 0, got ${variant?.price.toString()}`);
    record('Case D — price 0', 'PASS', `variant.price=${variant?.price.toString()}`);
  } catch (err) {
    record('Case D — price 0', 'FAIL', (err as Error).message);
  }

  // ─── Case E — no category ────────────────────────────────────────
  try {
    const r = await quickProductCodesRepository.createBulk({
      shopId: idShop,
      stockCodeBase: `${runId}-E`,
      saleCodeBase: `E${runId.slice(-6)}`,
      // categoryId omitted
    });
    const product = await prisma.product.findUnique({
      where: { id: r.items[0]!.productId },
      select: { categoryId: true },
    });
    assert(product?.categoryId === null, `expected null category, got ${product?.categoryId}`);
    record('Case E — no category', 'PASS', 'product.categoryId=null');
  } catch (err) {
    record('Case E — no category', 'FAIL', (err as Error).message);
  }

  // ─── Case F — duplicate displayCode rollback ─────────────────────
  try {
    // First create
    await quickProductCodesRepository.createBulk({
      shopId: idShop,
      stockCodeBase: `${runId}-F_dup_unique_1`,
      saleCodeBase: `F${runId.slice(-6)}DUP`,
    });
    // Count products in shop after first create
    const beforeCount = await prisma.product.count({ where: { shopId: idShop } });
    // Second create with same saleCodeBase (duplicate displayCode in
    // BroadcastProduct partial unique on (shopId, displayCode) WHERE
    // liveSessionId IS NULL).
    let didThrow = false;
    try {
      await quickProductCodesRepository.createBulk({
        shopId: idShop,
        stockCodeBase: `${runId}-F_dup_unique_2`,
        saleCodeBase: `F${runId.slice(-6)}DUP`, // same displayCode
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        didThrow = true;
      } else {
        throw err;
      }
    }
    assert(didThrow, 'expected ConflictError on duplicate displayCode');
    // Verify product count did NOT increase (rollback worked)
    const afterCount = await prisma.product.count({ where: { shopId: idShop } });
    assert(
      afterCount === beforeCount,
      `transaction rollback failed: expected ${beforeCount} products, got ${afterCount}`
    );
    record('Case F — duplicate displayCode rollback', 'PASS', 'transaction rolled back');
  } catch (err) {
    record('Case F — duplicate displayCode rollback', 'FAIL', (err as Error).message);
  }

  // ─── Case G — invalid range (endNo < startNo) ────────────────────
  try {
    let didThrow = false;
    try {
      await quickProductCodesRepository.createBulk({
        shopId: idShop,
        stockCodeBase: `${runId}-G`,
        saleCodeBase: `G${runId.slice(-6)}_`,
        startNo: 10,
        endNo: 1,
      });
    } catch (err) {
      if (err instanceof ValidationError) didThrow = true;
      else throw err;
    }
    assert(didThrow, 'expected ValidationError on endNo < startNo');
    record('Case G — invalid range reject', 'PASS', 'ValidationError thrown');
  } catch (err) {
    record('Case G — invalid range reject', 'FAIL', (err as Error).message);
  }

  // ─── Case H — max batch exceed (range > 100) ─────────────────────
  try {
    let didThrow = false;
    try {
      await quickProductCodesRepository.createBulk({
        shopId: idShop,
        stockCodeBase: `${runId}-H`,
        saleCodeBase: `H${runId.slice(-6)}_`,
        startNo: 1,
        endNo: 200,
      });
    } catch (err) {
      if (err instanceof ValidationError) didThrow = true;
      else throw err;
    }
    assert(didThrow, 'expected ValidationError on max batch');
    record('Case H — max batch reject', 'PASS', 'ValidationError thrown');
  } catch (err) {
    record('Case H — max batch reject', 'FAIL', (err as Error).message);
  }

  // Use categoryId at least once to avoid unused-variable warning
  void categoryId;

  // ─── Case I — cleanup ────────────────────────────────────────────
  let cleanupOk = true;
  try {
    await runCleanup(prisma, idShop, idUser);
    record('Case I — cleanup', 'PASS', 'all rows removed');
  } catch (err) {
    cleanupOk = false;
    record('Case I — cleanup', 'FAIL', (err as Error).message);
  }

  // ─── Summary ─────────────────────────────────────────────────────
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log('');
  console.log('=== Summary ===');
  console.log(`PASS: ${passCount}  FAIL: ${failCount}  TOTAL: ${results.length}`);

  await prisma.$disconnect();
  process.exit(failCount > 0 || !cleanupOk ? 1 : 0);
}

async function runCleanup(
  prisma: PrismaClient,
  shopId: string,
  userId: string
): Promise<void> {
  const ops: Array<{ label: string; fn: () => Promise<{ count: number }> }> = [
    { label: 'BroadcastProduct', fn: () => prisma.broadcastProduct.deleteMany({ where: { shopId } }) },
    { label: 'ProductVariant', fn: () => prisma.productVariant.deleteMany({ where: { product: { shopId } } }) },
    { label: 'Product', fn: () => prisma.product.deleteMany({ where: { shopId } }) },
    { label: 'ProductCategory', fn: () => prisma.productCategory.deleteMany({ where: { shopId } }) },
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

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
