import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { ConflictError } from '@/lib/errors';
import {
  assertCategoryBelongsToShop,
  buildCodePairs,
  createOrReuseProductVariantPairs,
  type ProductBulkCoreInput,
} from './product-bulk-core';

/**
 * Tier 3.9-D2-A — Inventory bulk product creation.
 *
 * Thin adapter on top of the shared `product-bulk-core`. Creates
 * Product + ProductVariant pairs only. NO `BroadcastProduct` rows are
 * written — inventory is stock-managed; admin attaches items to a
 * specific saleDate later via /sale AddFromStock or sale quick-create.
 *
 * Per Boss Decision 3 (2026-05-23):
 *   - reuses existing quick bulk product-code core logic
 *   - inventory is a thin adapter, not a parallel implementation
 *   - no schema migration
 *   - no image upload
 *   - all-or-nothing batch via $transaction
 *   - max cap shared (`QUICK_BULK_MAX_RANGE` = 100)
 *
 * Cross-references:
 * - Plan: docs/superpowers/2026-05-23-inventory-bulk-technical-plan.md
 * - Core: src/server/repositories/product-bulk-core.ts
 * - Sale flow: src/server/repositories/quick-product-codes.repository.ts
 * - Schema: src/lib/validation/inventory.schemas.ts inventoryBulkBodySchema
 * - Route: src/app/api/inventory/quick-product-bulk/route.ts
 */

/**
 * Inventory bulk input == shared core input. Deliberately NO additional
 * fields:
 *   - no `saleDate` (inventory is stock-only)
 *   - no `imageUrl` (Boss Decision 3 exclusion)
 */
export type InventoryBulkInput = ProductBulkCoreInput;

export interface InventoryBulkCreatedItem {
  readonly productId: string;
  readonly variantId: string;
  readonly stockCode: string;
  readonly saleCode: string;
  readonly productCreated: boolean;
  readonly variantCreated: boolean;
}

export interface InventoryBulkResult {
  readonly createdCount: number;
  readonly items: readonly InventoryBulkCreatedItem[];
}

/**
 * Map a P2002 unique-constraint violation into an admin-actionable
 * ConflictError specific to the inventory flow. Inventory does NOT
 * create BroadcastProduct, so the (shopId, saleDate, displayCode)
 * partial unique index is unreachable from this flow. After the shared
 * core's Tier 3.9-B-Fix-1 reuse logic, the most likely remaining P2002
 * paths are:
 *   - Product.@@unique([shopId, stockCode]) — should NOT fire post-reuse
 *   - ProductVariant.@@unique([productId, sku]) — variant collision
 */
function classifyInventoryP2002(err: Prisma.PrismaClientKnownRequestError): ConflictError {
  const target = Array.isArray(err.meta?.target)
    ? err.meta?.target.join(', ')
    : String(err.meta?.target ?? '');
  let friendly = `Duplicate code: ${target || 'unknown'}. Transaction rolled back; no products created.`;
  if (target.includes('stockCode')) {
    friendly =
      'Stock code already exists in this shop with different metadata. Reuse logic failed unexpectedly.';
  } else if (target.includes('sku')) {
    friendly =
      'Variant SKU collision. The existing product has a conflicting variant. Edit the product before retrying.';
  }
  return new ConflictError(friendly);
}

export const inventoryBulkRepository = Object.freeze({
  /**
   * Create or reuse N Product + ProductVariant pairs for inventory
   * preparation. All-or-nothing transaction.
   *
   * Throws:
   * - ValidationError 400 — bad displayCode shape, bad range, bad
   *   category (cross-shop or non-existent)
   * - ConflictError 409  — duplicate stockCode (after reuse) or
   *   variant SKU collision
   */
  async createBulk(input: InventoryBulkInput): Promise<InventoryBulkResult> {
    const pairs = buildCodePairs(input);

    // Cross-shop category check happens BEFORE the transaction so the
    // tx scope only contains writes. Matches sale-flow ordering.
    await assertCategoryBelongsToShop(input.shopId, input.categoryId);

    try {
      const corePairs = await prisma.$transaction(async (tx) => {
        return createOrReuseProductVariantPairs(tx, pairs, input);
      });

      const items: InventoryBulkCreatedItem[] = corePairs.map((p) =>
        Object.freeze({
          productId: p.productId,
          variantId: p.variantId,
          stockCode: p.stockCode,
          saleCode: p.saleCode,
          productCreated: p.productCreated,
          variantCreated: p.variantCreated,
        })
      );

      return Object.freeze({
        createdCount: items.length,
        items: Object.freeze(items),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw classifyInventoryP2002(err);
      }
      throw err;
    }
  },
});

export type InventoryBulkRepository = typeof inventoryBulkRepository;
