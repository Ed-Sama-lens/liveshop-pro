import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, withRateLimit } from '@/lib/validation/middleware';
import { quickBulkProductCodesBodySchema } from '@/lib/validation/sale.schemas';
import { quickProductCodesRepository } from '@/server/repositories/quick-product-codes.repository';
import { logActivity } from '@/server/services/activity.service';

/**
 * Tier 3.8 — POST /api/sale/quick-product-codes
 *
 * Composite create flow: Product + ProductVariant + BroadcastProduct
 * in one transaction. Supports single mode and bulk mode (Start/End No.).
 *
 * Auth: requireAuth + OWNER|MANAGER write access (mirrors POST
 * /api/sale/broadcast-products). CHAT_SUPPORT cannot create products.
 *
 * Body schema: src/lib/validation/sale.schemas.ts quickBulkProductCodesBodySchema
 * Repository:  src/server/repositories/quick-product-codes.repository.ts
 *
 * Errors:
 *   400 — validation failed (Zod schema or repo guard)
 *   401 — unauth
 *   403 — wrong role or missing shopId
 *   409 — duplicate stockCode or displayCode within shop
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

      const bodyResult = await validateBody(request, quickBulkProductCodesBodySchema);
      if ('error' in bodyResult) return bodyResult.error;

      const result = await quickProductCodesRepository.createBulk({
        shopId: user.shopId,
        ...bodyResult.data,
      });

      // Activity log (non-blocking). Single entry per request even for
      // bulk runs — listing N products in one log line keeps the
      // activity feed scannable.
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'BROADCAST_PRODUCT_BULK_CREATED',
        entity: 'broadcast_product',
        entityId: result.items[0]?.broadcastProductId ?? '',
        description: `Quick-created ${result.createdCount} product code(s) via /sale (Tier 3.8)`,
        metadata: {
          createdCount: result.createdCount,
          stockCodes: result.items.map((i) => i.stockCode),
          saleCodes: result.items.map((i) => i.saleCode),
        },
      }).catch(() => {});

      return NextResponse.json(ok(result), { status: 201 });
    } catch (err) {
      const appErr = toAppError(err);
      return NextResponse.json(error(appErr.message), { status: appErr.status });
    }
  });
}
