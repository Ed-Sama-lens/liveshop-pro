import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { ValidationError } from '@/lib/errors';
import { QUICK_BULK_MAX_RANGE } from '@/lib/validation/sale.schemas';

/**
 * Tier 3.9-D2-R — Shared bulk product/variant creation core.
 *
 * Extracted from `quick-product-codes.repository.ts` so both:
 *
 *   1. Sale quick-create (creates Product + Variant + BroadcastProduct
 *      trios per saleDate)
 *   2. Inventory quick-bulk (creates Product + Variant pairs only;
 *      stock-managed, no BroadcastProduct, no saleDate)
 *
 * share one safe implementation of the Product/Variant create-or-reuse
 * pattern (Tier 3.9-B-Fix-1). Callers compose this core with their
 * flow-specific tail (BroadcastProduct insert for sale; no-op for
 * inventory).
 *
 * Behavior is identical to the legacy `quickProductCodesRepository`
 * inline logic — this is a behavior-preserving extraction. Sale tests
 * must remain green.
 *
 * Cross-references:
 * - Plan: docs/superpowers/2026-05-23-inventory-bulk-technical-plan.md
 * - Original repository: src/server/repositories/quick-product-codes.repository.ts
 * - Tier 3.9-B-Fix-1 reuse-or-create Product semantics
 */

export interface ProductBulkCoreInput {
  readonly shopId: string;
  readonly stockCodeBase: string;
  readonly saleCodeBase: string;
  readonly categoryId?: string;
  readonly productName?: string;
  readonly productDetails?: string;
  readonly imageUrl?: string;
  readonly startNo?: number;
  readonly endNo?: number;
  readonly quantity?: number;
  readonly lowStockAt?: number;
  readonly price?: string;
  readonly cost?: string;
}

export interface CreatedProductVariantPair {
  readonly productId: string;
  readonly variantId: string;
  readonly stockCode: string;
  readonly saleCode: string;
  readonly displayCode: string;
  readonly productCreated: boolean;
  readonly variantCreated: boolean;
}

/**
 * Build the list of (stockCode, saleCode) pairs for this request.
 * Single mode returns one pair; bulk returns N. Pure — no DB.
 *
 * Schema-level superRefine already enforces start/end constraints; this
 * helper re-checks defensively in case the core is called outside the
 * route layer.
 */
export function buildCodePairs(input: ProductBulkCoreInput): Array<{
  stockCode: string;
  saleCode: string;
}> {
  const { stockCodeBase, saleCodeBase, startNo, endNo } = input;

  // Single mode
  if (startNo === undefined || endNo === undefined) {
    return [{ stockCode: stockCodeBase, saleCode: saleCodeBase }];
  }

  // Bulk mode — defensive validation
  if (endNo < startNo) {
    throw new ValidationError('endNo must be >= startNo', { endNo: ['invalid range'] });
  }
  const count = endNo - startNo + 1;
  if (count > QUICK_BULK_MAX_RANGE) {
    throw new ValidationError(
      `Bulk range too large: ${count} > ${QUICK_BULK_MAX_RANGE}`,
      { endNo: ['range exceeds max'] }
    );
  }

  const pairs: Array<{ stockCode: string; saleCode: string }> = [];
  for (let n = startNo; n <= endNo; n++) {
    pairs.push({
      stockCode: `${stockCodeBase}${n}`,
      saleCode: `${saleCodeBase}${n}`,
    });
  }
  return pairs;
}

/**
 * Resolve product name placeholder per Boss live-selling workflow.
 * Same fallback chain as productRepository.create() so empty-name
 * intent is consistent across routes.
 */
export function resolveName(
  explicitName: string | undefined,
  saleCode: string,
  stockCode: string
): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  return saleCode.trim().length > 0 ? saleCode.trim() : stockCode;
}

/**
 * Validate displayCode format. displayCode == saleCode in both sale
 * and inventory flows; kept in shared core so format rules cannot drift.
 *
 * Matches broadcast-product.repository.ts rule.
 */
export function assertDisplayCodeShape(displayCode: string): void {
  if (displayCode.length === 0 || displayCode.length > 32) {
    throw new ValidationError('displayCode must be 1..32 chars', {
      displayCode: [`saleCode '${displayCode}' must be 1..32 chars`],
    });
  }
  if (!/^[A-Za-z0-9_-]+$/.test(displayCode)) {
    throw new ValidationError(
      `displayCode '${displayCode}' must contain only A-Z, a-z, 0-9, _, -`,
      { displayCode: ['invalid format'] }
    );
  }
}

/**
 * Verify the given categoryId (if provided) belongs to the calling
 * shop. Cross-shop category FK injection would be a tenant violation.
 *
 * Caller must invoke this BEFORE entering the $transaction so the
 * lookup uses the regular prisma client; passing tx is acceptable but
 * unnecessary.
 */
export async function assertCategoryBelongsToShop(
  shopId: string,
  categoryId: string | undefined
): Promise<void> {
  if (categoryId === undefined) {
    return;
  }
  const category = await prisma.productCategory.findFirst({
    where: { id: categoryId, shopId },
    select: { id: true },
  });
  if (!category) {
    throw new ValidationError('Category not found in this shop', {
      categoryId: ['unknown or cross-shop'],
    });
  }
}

/**
 * Per-pair reuse-or-create Product + Variant inside an existing
 * transaction.
 *
 * Tier 3.9-B-Fix-1 contract:
 *   - stockCode is a stable physical-inventory ID per shop. Same
 *     stockCode on different sale dates reuses the existing Product
 *     (does NOT collide on Product.@@unique([shopId, stockCode])).
 *   - Existing Product: name/description/category/images/price are
 *     NOT overwritten — catalog data the admin may have edited.
 *   - Variant with matching sku: reused. Stock is shared across sale
 *     dates.
 *   - Variant missing on existing Product: created with caller defaults.
 *
 * Returns Product + Variant ids plus a 'created' flag per row so
 * callers (and future audits) can distinguish reuse vs create.
 */
async function createOrReuseProductVariantPair(
  tx: Prisma.TransactionClient,
  shopId: string,
  pair: { stockCode: string; saleCode: string },
  input: ProductBulkCoreInput
): Promise<CreatedProductVariantPair> {
  const resolvedName = resolveName(input.productName, pair.saleCode, pair.stockCode);

  const existingProduct = await tx.product.findUnique({
    where: {
      shopId_stockCode: { shopId, stockCode: pair.stockCode },
    },
    include: { variants: { where: { sku: pair.saleCode }, take: 1 } },
  });

  let productId: string;
  let variantId: string;
  let productCreated = false;
  let variantCreated = false;

  if (existingProduct) {
    productId = existingProduct.id;
    if (existingProduct.variants.length > 0) {
      variantId = existingProduct.variants[0].id;
    } else {
      // Edge case: Product exists but no variant with matching sku.
      // Create one with caller-provided defaults (or sensible
      // fallbacks). Does not touch existing variants.
      const v = await tx.productVariant.create({
        data: {
          productId: existingProduct.id,
          sku: pair.saleCode,
          attributes: {},
          price: input.price ?? '0',
          costPrice: input.cost ?? null,
          quantity: input.quantity ?? 1,
          lowStockAt: input.lowStockAt ?? null,
        },
      });
      variantId = v.id;
      variantCreated = true;
    }
  } else {
    const p = await tx.product.create({
      data: {
        shopId,
        stockCode: pair.stockCode,
        saleCode: pair.saleCode,
        name: resolvedName,
        description: input.productDetails ?? '',
        images: input.imageUrl ? [input.imageUrl] : [],
        categoryId: input.categoryId ?? null,
        isActive: true,
      },
    });
    productId = p.id;
    productCreated = true;

    const v = await tx.productVariant.create({
      data: {
        productId: p.id,
        sku: pair.saleCode,
        attributes: {},
        price: input.price ?? '0',
        costPrice: input.cost ?? null,
        quantity: input.quantity ?? 1,
        lowStockAt: input.lowStockAt ?? null,
      },
    });
    variantId = v.id;
    variantCreated = true;
  }

  return Object.freeze({
    productId,
    variantId,
    stockCode: pair.stockCode,
    saleCode: pair.saleCode,
    displayCode: pair.saleCode,
    productCreated,
    variantCreated,
  });
}

/**
 * Create or reuse N Product + Variant pairs inside the caller's
 * transaction. Caller composes any per-flow tail (e.g. BroadcastProduct
 * insert for sale flow) after this returns.
 *
 * Behavior:
 *   - Validates every pair's displayCode shape before any DB write so
 *     a malformed code aborts the transaction early (matches legacy
 *     pre-flight order).
 *   - Reuse-or-create Product + Variant per pair (Tier 3.9-B-Fix-1).
 *   - Throws ValidationError on bad inputs / shape.
 *   - Propagates Prisma errors (P2002 etc.) so caller can classify.
 *
 * NOTE: callers should invoke `assertCategoryBelongsToShop` BEFORE
 * starting the transaction. This core does not re-verify the category
 * — it would be redundant work inside the tx scope.
 */
export async function createOrReuseProductVariantPairs(
  tx: Prisma.TransactionClient,
  pairs: ReadonlyArray<{ stockCode: string; saleCode: string }>,
  input: ProductBulkCoreInput
): Promise<readonly CreatedProductVariantPair[]> {
  // Pre-flight: every displayCode shape valid before any write.
  for (const pair of pairs) {
    assertDisplayCodeShape(pair.saleCode);
  }

  const results: CreatedProductVariantPair[] = [];
  for (const pair of pairs) {
    const created = await createOrReuseProductVariantPair(tx, input.shopId, pair, input);
    results.push(created);
  }
  return Object.freeze(results);
}
