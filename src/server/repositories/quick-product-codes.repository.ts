import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { ConflictError, ValidationError } from '@/lib/errors';
import { QUICK_BULK_MAX_RANGE } from '@/lib/validation/sale.schemas';

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
 * re-checks defensively.
 *
 * Tenant safety:
 *   - All Products, Variants, BroadcastProducts share the passed shopId.
 *   - BroadcastProduct uses partial unique index on
 *     (shopId, displayCode) WHERE liveSessionId IS NULL — enforced
 *     via the database; duplicate displayCode within shop rolls back
 *     the whole transaction.
 *
 * Tier 3.8 evergreen scope:
 *   - This route creates evergreen BroadcastProducts only
 *     (liveSessionId = null). Live-bound BPs use the existing
 *     /api/sale/broadcast-products POST.
 *
 * Cross-references:
 *   - Schema: src/lib/validation/sale.schemas.ts quickBulkProductCodesBodySchema
 *   - Route:  src/app/api/sale/quick-product-codes/route.ts
 *   - Plan:   docs/superpowers/2026-05-20-tier-3-8-quick-bulk-product-code-creation-backlog.md
 */

export interface QuickBulkProductCodesInput {
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
 * Build the list of (stockCode, saleCode) pairs for this request.
 * Single mode returns one pair; bulk returns N.
 */
function buildCodePairs(input: QuickBulkProductCodesInput): Array<{
  stockCode: string;
  saleCode: string;
}> {
  const { stockCodeBase, saleCodeBase, startNo, endNo } = input;

  // Single mode
  if (startNo === undefined || endNo === undefined) {
    return [{ stockCode: stockCodeBase, saleCode: saleCodeBase }];
  }

  // Bulk mode — defensive validation (schema already enforces)
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
function resolveName(
  explicitName: string | undefined,
  saleCode: string,
  stockCode: string
): string {
  if (explicitName && explicitName.trim().length > 0) {
    return explicitName.trim();
  }
  return saleCode.trim().length > 0 ? saleCode.trim() : stockCode;
}

/** Validate displayCode format (matches broadcast-product.repository.ts rule). */
function assertDisplayCodeShape(displayCode: string): void {
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

export const quickProductCodesRepository = Object.freeze({
  /**
   * Create N Product + Variant + BroadcastProduct trios in one
   * transaction. All-or-nothing: duplicate stockCode within shop or
   * displayCode within shop (evergreen) rolls back the entire batch.
   *
   * Throws:
   * - ValidationError 400 — bad displayCode shape, bad range
   * - ConflictError 409  — duplicate stockCode or displayCode
   */
  async createBulk(input: QuickBulkProductCodesInput): Promise<QuickBulkProductCodesResult> {
    const pairs = buildCodePairs(input);

    // Pre-flight validate every displayCode (= saleCode) shape so the
    // transaction never starts if any pair is malformed.
    for (const pair of pairs) {
      assertDisplayCodeShape(pair.saleCode);
    }

    // Verify categoryId belongs to this shop (if provided). Cross-shop
    // category FK injection would be a tenant violation.
    if (input.categoryId !== undefined) {
      const category = await prisma.productCategory.findFirst({
        where: { id: input.categoryId, shopId: input.shopId },
        select: { id: true },
      });
      if (!category) {
        throw new ValidationError('Category not found in this shop', {
          categoryId: ['unknown or cross-shop'],
        });
      }
    }

    try {
      const items = await prisma.$transaction(async (tx) => {
        const results: QuickBulkCreatedItem[] = [];
        for (const pair of pairs) {
          const resolvedName = resolveName(
            input.productName,
            pair.saleCode,
            pair.stockCode
          );

          const product = await tx.product.create({
            data: {
              shopId: input.shopId,
              stockCode: pair.stockCode,
              saleCode: pair.saleCode,
              name: resolvedName,
              description: input.productDetails ?? '',
              images: input.imageUrl ? [input.imageUrl] : [],
              categoryId: input.categoryId ?? null,
              isActive: true,
            },
          });

          // SKU mirrors saleCode for live-selling simplicity. Admin can
          // edit later if needing custom SKUs. Unique constraint is
          // (productId, sku) so collision impossible across products.
          const variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku: pair.saleCode,
              attributes: {},
              price: input.price ?? '0',
              costPrice: input.cost ?? null,
              quantity: input.quantity ?? 1,
              lowStockAt: input.lowStockAt ?? null,
            },
          });

          const bp = await tx.broadcastProduct.create({
            data: {
              shopId: input.shopId,
              liveSessionId: null, // evergreen-only for Tier 3.8
              productId: product.id,
              variantId: variant.id,
              displayCode: pair.saleCode,
              displayOrder: 0,
              isPinned: false,
            },
          });

          results.push(
            Object.freeze({
              productId: product.id,
              variantId: variant.id,
              broadcastProductId: bp.id,
              stockCode: pair.stockCode,
              saleCode: pair.saleCode,
              displayCode: pair.saleCode,
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
      // P2002 = unique constraint violation. Map to ConflictError with
      // useful payload so the UI can show which code collided.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = Array.isArray(err.meta?.target)
          ? err.meta?.target.join(', ')
          : String(err.meta?.target ?? 'unknown');
        throw new ConflictError(
          `Duplicate code: ${target}. Transaction rolled back; no products created.`
        );
      }
      throw err;
    }
  },
});

export type QuickProductCodesRepository = typeof quickProductCodesRepository;
