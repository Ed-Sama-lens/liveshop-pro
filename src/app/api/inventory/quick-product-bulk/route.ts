import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, withRateLimit } from '@/lib/validation/middleware';
import { inventoryBulkBodySchema } from '@/lib/validation/inventory.schemas';
import { inventoryBulkRepository } from '@/server/repositories/inventory-bulk.repository';
import { logActivity } from '@/server/services/activity.service';

/**
 * Tier 3.9-D2-A — POST /api/inventory/quick-product-bulk
 *
 * Inventory bulk product creation. Creates N Product + ProductVariant
 * pairs only — NO `BroadcastProduct` rows. Admin attaches items to a
 * sale date later via /sale AddFromStock or sale quick-create.
 *
 * Auth: requireAuth + OWNER|MANAGER write access (mirrors sale flow
 * pattern). CHAT_SUPPORT cannot create inventory.
 *
 * Body schema: src/lib/validation/inventory.schemas.ts inventoryBulkBodySchema
 * Repository:  src/server/repositories/inventory-bulk.repository.ts
 *
 * Errors:
 *   400 — validation failed (Zod schema or repo guard)
 *   401 — unauth
 *   403 — wrong role or missing shopId
 *   409 — duplicate stockCode (post reuse) or variant SKU collision
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

      const bodyResult = await validateBody(request, inventoryBulkBodySchema);
      if ('error' in bodyResult) return bodyResult.error;

      const result = await inventoryBulkRepository.createBulk({
        shopId: user.shopId,
        ...bodyResult.data,
      });

      // Activity log (non-blocking). Single entry per request even for
      // bulk runs.
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'INVENTORY_PRODUCT_BULK_CREATED',
        entity: 'product',
        entityId: result.items[0]?.productId ?? '',
        description: `Quick-created ${result.createdCount} inventory product(s) via /inventory (Tier 3.9-D2-A)`,
        metadata: {
          createdCount: result.createdCount,
          stockCodes: result.items.map((i) => i.stockCode),
          saleCodes: result.items.map((i) => i.saleCode),
          productCreatedCount: result.items.filter((i) => i.productCreated).length,
          variantCreatedCount: result.items.filter((i) => i.variantCreated).length,
        },
      }).catch(() => {});

      return NextResponse.json(ok(result), { status: 201 });
    } catch (err) {
      const appErr = toAppError(err);
      return NextResponse.json(error(appErr.message), { status: appErr.status });
    }
  });
}
