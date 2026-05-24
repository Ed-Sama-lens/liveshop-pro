import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { ConflictError, ValidationError } from '@/lib/errors';
import {
  assertCategoryBelongsToShop,
  buildCodePairs,
  createOrReuseProductVariantPairs,
  type CreatedProductVariantPair,
  type ProductBulkCoreInput,
} from './product-bulk-core';

/**
 * Tier 3.8 — Quick bulk product code repository.
 *
 * Composite create flow that solves Boss's live-selling workflow:
 *
 *   1. Bulk-create N Product + ProductVariant + BroadcastProduct rows
 *      in a single Prisma transaction.
 *   2. Stock is the operational anchor; admin can edit name / price /
 *      quantity / image / details later via /inventory or /sale Edit
 *      Product Code dialog.
 *
 * Single vs bulk mode:
 *
 *   - Single: when startNo/endNo omitted → creates exactly one trio
 *     using stockCodeBase / saleCodeBase as-typed.
 *   - Bulk:   when startNo + endNo present → creates `endNo - startNo + 1`
 *     trios with numeric suffix appended to both stockCode and saleCode
 *     (which doubles as displayCode for BroadcastProduct).
 *
 * Range cap: QUICK_BULK_MAX_RANGE (100) per request — enforced by
 * the Zod schema before this repository runs. Repository also
 * re-checks defensively via the shared core.
 *
 * Tenant safety:
 *   - All Products, Variants, BroadcastProducts share the passed shopId.
 *   - BroadcastProduct uses partial unique index on
 *     (shopId, saleDate, displayCode) WHERE saleDate IS NOT NULL —
 *     enforced via the database; duplicate displayCode within shop on
 *     the same saleDate rolls back the whole transaction.
 *
 * Tier 3.8 evergreen scope:
 *   - This route creates evergreen BroadcastProducts only
 *     (liveSessionId = null). Live-bound BPs use the existing
 *     /api/sale/broadcast-products POST.
 *
 * Tier 3.9-D2-R refactor:
 *   - Product + Variant create-or-reuse logic extracted to
 *     `product-bulk-core.ts` so the inventory bulk flow can share it
 *     without duplicating semantics. This repository keeps the
 *     BroadcastProduct insert + saleDate resolve + sale-specific
 *     P2002 classifier as its tail.
 *
 * Cross-references:
 *   - Schema: src/lib/validation/sale.schemas.ts quickBulkProductCodesBodySchema
 *   - Route:  src/app/api/sale/quick-product-codes/route.ts
 *   - Core:   src/server/repositories/product-bulk-core.ts
 *   - Plan:   docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-creation-backlog.md
 *   - D2-R:   docs/superpowers/2026-05-23-inventory-bulk-technical-plan.md
 */

export interface QuickBulkProductCodesInput extends ProductBulkCoreInput {
  /**
   * Tier 3.9 — Sale Date (YYYY-MM-DD). When omitted, repository
   * resolves today in shop timezone per D-Date-5 verdict. All created
   * BroadcastProducts in the batch share the same saleDate.
   */
  readonly saleDate?: string;
}

export interface QuickBulkCreatedItem {
  readonly productId: string;
  readonly variantId: string;
  readonly broadcastProductId: string;
  readonly stockCode: string;
  readonly saleCode: string;
  readonly displayCode: string;
}

export interface QuickBulkProductCodesResult {
  readonly createdCount: number;
  readonly items: readonly QuickBulkCreatedItem[];
}

/**
 * Resolve the effective saleDate for this batch. Either accept the
 * caller's explicit YYYY-MM-DD or default to today in shop timezone
 * per D-Date-5.
 */
async function resolveBatchSaleDate(
  shopId: string,
  saleDateInput: string | undefined
): Promise<Date> {
  const { parseSaleDate, todaySaleDate } = await import('@/lib/sale/sale-date');

  if (typeof saleDateInput === 'string' && saleDateInput.length > 0) {
    try {
      return parseSaleDate(saleDateInput);
    } catch (parseErr) {
      throw new ValidationError(
        parseErr instanceof Error ? parseErr.message : 'Invalid saleDate',
        { saleDate: ['must be YYYY-MM-DD'] }
      );
    }
  }
  const shopRow = await prisma.shop.findFirst({
    where: { id: shopId },
    select: { timezone: true },
  });
  const tz = shopRow?.timezone ?? 'Asia/Kuala_Lumpur';
  return parseSaleDate(todaySaleDate(tz));
}

/**
 * Map a P2002 unique-constraint violation into an admin-actionable
 * ConflictError specific to the sale flow. After Tier 3.9-B-Fix-1
 * reuse-Product logic, the most common path that fires here is the
 * partial unique index on (shopId, saleDate, displayCode).
 *
 * Copy is Thai-first (matches /sale admin dialog UI) with English
 * suffix in parens so logs + Boss + Thai admins all stay readable.
 * Mirrors inventory-side translation shipped in PR #131 (per UX
 * audit candidate #4, 2026-05-24-inventory-bulk-ux-audit-after-d2.md).
 *
 * Recognized targets from schema + raw-SQL partial unique indexes:
 *   - Product.@@unique([shopId, stockCode]) → 'shopId,stockCode' (should NOT fire post-reuse-Product)
 *   - ProductVariant.@@unique([productId, sku]) → 'productId,sku' (should NOT fire post-reuse-Variant)
 *   - BroadcastProduct.@@unique([liveSessionId, displayCode]) → 'liveSessionId,displayCode'
 *   - Raw partial: BroadcastProduct_shop_saleDate_displayCode_key (no Prisma meta.target — fallback)
 */
export function classifySaleP2002(err: Prisma.PrismaClientKnownRequestError): ConflictError {
  const target = Array.isArray(err.meta?.target)
    ? err.meta?.target.join(', ')
    : String(err.meta?.target ?? '');
  let friendly = `รหัสซ้ำ (Duplicate code): ${target || 'unknown'}. ระบบยกเลิกธุรกรรม ไม่มีสินค้าใหม่ถูกสร้าง.`;
  if (target.includes('stockCode')) {
    friendly =
      'รหัสสต็อกซ้ำในร้านนี้แต่ข้อมูลไม่ตรงกัน (Stock code already exists in this shop with different metadata). ระบบ reuse ล้มเหลว ติดต่อทีมพัฒนา.';
  } else if (target.includes('sku')) {
    friendly =
      'SKU ของ variant ซ้ำ (Variant SKU collision). สินค้าเดิมมี variant ที่ขัดแย้ง แก้ไขสินค้าก่อนแล้วลองใหม่.';
  } else if (target.includes('liveSessionId') && target.includes('displayCode')) {
    friendly =
      'รหัสสินค้านี้มีอยู่แล้วในรอบไลฟ์เดียวกัน (Product code already exists in the same live session). เลือกรหัสอื่นหรือยกเลิกรายการเดิม.';
  } else {
    // Partial unique index on (shopId, saleDate, displayCode) WHERE
    // saleDate IS NOT NULL fires here. Prisma surfaces no meta.target.
    friendly =
      'รหัสสินค้านี้มีอยู่แล้วสำหรับวันขายที่เลือกในร้านนี้ (Product code already exists for the selected sale date in this shop). เลือกรหัสอื่นหรือวันขายอื่น.';
  }
  return new ConflictError(friendly);
}

export const quickProductCodesRepository = Object.freeze({
  /**
   * Create N Product + Variant + BroadcastProduct trios in one
   * transaction. All-or-nothing: duplicate stockCode within shop or
   * displayCode within shop (per saleDate) rolls back the entire batch.
   *
   * Throws:
   * - ValidationError 400 — bad displayCode shape, bad range
   * - ConflictError 409  — duplicate stockCode or displayCode
   */
  async createBulk(input: QuickBulkProductCodesInput): Promise<QuickBulkProductCodesResult> {
    const pairs = buildCodePairs(input);

    // Cross-shop category check happens BEFORE the transaction so the
    // tx scope only contains writes. Matches legacy ordering.
    await assertCategoryBelongsToShop(input.shopId, input.categoryId);

    // Tier 3.9 — Resolve saleDate once for the whole batch.
    const resolvedSaleDate = await resolveBatchSaleDate(input.shopId, input.saleDate);

    try {
      const items = await prisma.$transaction(async (tx) => {
        const corePairs: readonly CreatedProductVariantPair[] =
          await createOrReuseProductVariantPairs(tx, pairs, input);

        const results: QuickBulkCreatedItem[] = [];
        for (const corePair of corePairs) {
          // BroadcastProduct is always new — even when Product/Variant
          // reuse — because saleDate is the primary grouping context.
          // Uniqueness is enforced by partial index
          // (shopId, saleDate, displayCode) WHERE saleDate IS NOT NULL.
          const bp = await tx.broadcastProduct.create({
            data: {
              shopId: input.shopId,
              liveSessionId: null, // evergreen by default; channel context lives elsewhere
              productId: corePair.productId,
              variantId: corePair.variantId,
              displayCode: corePair.displayCode,
              displayOrder: 0,
              isPinned: false,
              saleDate: resolvedSaleDate,
            },
          });

          results.push(
            Object.freeze({
              productId: corePair.productId,
              variantId: corePair.variantId,
              broadcastProductId: bp.id,
              stockCode: corePair.stockCode,
              saleCode: corePair.saleCode,
              displayCode: corePair.displayCode,
            })
          );
        }
        return results;
      });

      return Object.freeze({
        createdCount: items.length,
        items: Object.freeze(items),
      });
    } catch (err) {
      // P2002 = unique constraint violation. Tier 3.9-B-Fix-1 — better
      // classification: identify which constraint fired so admin sees
      // an actionable message. After reuse-Product logic, the most
      // common path is the partial unique index on
      // (shopId, saleDate, displayCode).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw classifySaleP2002(err);
      }
      throw err;
    }
  },
});

export type QuickProductCodesRepository = typeof quickProductCodesRepository;
