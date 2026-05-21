import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, withRateLimit } from '@/lib/validation/middleware';
import { createBroadcastProductBatchBodySchema } from '@/lib/validation/broadcast-product.schemas';
import { broadcastProductRepository } from '@/server/repositories/broadcast-product.repository';
import { logActivity } from '@/server/services/activity.service';
import { formatMoney2 } from '@/lib/api/money';

/**
 * POST /api/sale/broadcast-products/batch — Tier 3.9-C.
 *
 * Batch-create N BroadcastProduct rows in a single Prisma transaction.
 * Used by AddFromStock multi-select to add many stock variants to the
 * same saleDate in one click.
 *
 * Atomic: any per-item validation failure (bad displayCode, missing
 * variant, conflict on existing same-date code, duplicate within batch)
 * rolls back the entire batch — no products created.
 *
 * Auth: OWNER / MANAGER. CHAT_SUPPORT cannot create.
 *
 * Body shape:
 *   {
 *     items: [{ variantId, displayCode, priceOverride? }, ...] (1..50)
 *     liveSessionId?: string,
 *     saleDate?: YYYY-MM-DD
 *   }
 *
 * Errors:
 *   400 — validation failed (Zod schema or repo guard)
 *   401 — unauth
 *   403 — wrong role or missing shopId
 *   404 — variant not in shop / liveSession not in shop
 *   409 — duplicate displayCode in batch or on existing row
 *   500 — unexpected
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return withRateLimit(request, async () => {
    try {
      const user = await requireAuth();

      if (!user.shopId) {
        return NextResponse.json(error('No shop associated with your account'), {
          status: 403,
        });
      }

      if (!['OWNER', 'MANAGER'].includes(user.role)) {
        return NextResponse.json(error('Insufficient permissions'), { status: 403 });
      }

      const bodyResult = await validateBody(request, createBroadcastProductBatchBodySchema);
      if ('error' in bodyResult) return bodyResult.error;

      const { items, liveSessionId, saleDate } = bodyResult.data;

      const created = await broadcastProductRepository.createMany({
        shopId: user.shopId,
        items,
        ...(liveSessionId !== undefined ? { liveSessionId } : {}),
        ...(saleDate !== undefined ? { saleDate } : {}),
      });

      // Activity log — single entry for the batch (N items in metadata).
      // Skip awaiting; never fail response on logging error.
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'BROADCAST_PRODUCT_BATCH_CREATED',
        entity: 'broadcast_product',
        entityId: created[0]?.broadcastProductId ?? '',
        description: `Batch-created ${created.length} broadcast product(s) via /sale (Tier 3.9-C)`,
        metadata: {
          createdCount: created.length,
          displayCodes: created.map((r) => r.displayCode),
          variantIds: created.map((r) => r.variantId),
          liveSessionId: liveSessionId ?? null,
          saleDate: saleDate ?? null,
        },
      }).catch(() => {});

      const products = created.map((r) => ({
        broadcastProductId: r.broadcastProductId,
        shopId: r.shopId,
        liveSessionId: r.liveSessionId,
        displayCode: r.displayCode,
        displayOrder: r.displayOrder,
        isPinned: r.isPinned,
        productId: r.productId,
        productName: r.productName,
        variantId: r.variantId,
        sku: r.sku,
        attributes: r.attributes,
        unitPrice: formatMoney2(r.priceOverride ?? r.variantPrice),
        priceOverride: r.priceOverride !== null ? formatMoney2(r.priceOverride) : null,
        stockQuantity: r.stockQuantity,
        reservedQty: r.reservedQty,
        availableQty: r.availableQty,
        imageUrl: r.imageUrl,
        saleDate: r.saleDate,
      }));

      return NextResponse.json(
        ok({
          createdCount: created.length,
          currency: 'MYR' as const,
          saleDate: saleDate ?? null,
          products,
        }),
        { status: 201 }
      );
    } catch (err) {
      const appErr = toAppError(err);
      return NextResponse.json(error(appErr.message), { status: appErr.status });
    }
  });
}
