import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, withRateLimit } from '@/lib/validation/middleware';
import { updateBroadcastProductBodySchema } from '@/lib/validation/broadcast-product.schemas';
import { broadcastProductRepository } from '@/server/repositories/broadcast-product.repository';
import { logActivity } from '@/server/services/activity.service';
import { formatMoney2 } from '@/lib/api/money';

/**
 * `/api/sale/broadcast-products/[id]` — Tier 3.5 PATCH + DELETE.
 *
 * PATCH — update `priceOverride` / `isPinned` / `displayOrder` only.
 * Identity-bearing fields stay immutable.
 *
 * DELETE — hard delete with active-Booking guard. Non-EXPIRED bookings
 * referencing the BP block delete with 409. Race-condition (booking
 * created between count + delete) also surfaces as 409.
 *
 * Repository: src/server/repositories/broadcast-product.repository.ts
 * Plan: docs/superpowers/2026-05-14-sale-broadcast-product-update-delete-plan.md
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
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

      const { id } = await context.params;

      if (!id || id.length === 0 || id.length > 128) {
        return NextResponse.json(error('Invalid broadcast product id'), {
          status: 400,
        });
      }

      const bodyResult = await validateBody(request, updateBroadcastProductBodySchema);
      if ('error' in bodyResult) return bodyResult.error;

      const updated = await broadcastProductRepository.update({
        shopId: user.shopId,
        id,
        ...(bodyResult.data.priceOverride !== undefined
          ? { priceOverride: bodyResult.data.priceOverride }
          : {}),
        ...(bodyResult.data.isPinned !== undefined
          ? { isPinned: bodyResult.data.isPinned }
          : {}),
        ...(bodyResult.data.displayOrder !== undefined
          ? { displayOrder: bodyResult.data.displayOrder }
          : {}),
      });

      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'BROADCAST_PRODUCT_UPDATED',
        entity: 'broadcast_product',
        entityId: updated.broadcastProductId,
        description: `BroadcastProduct ${updated.displayCode} updated`,
        metadata: {
          broadcastProductId: updated.broadcastProductId,
          displayCode: updated.displayCode,
          fieldsChanged: Object.keys(bodyResult.data),
        },
      }).catch(() => {});

      return NextResponse.json(
        ok({
          broadcastProductId: updated.broadcastProductId,
          shopId: updated.shopId,
          liveSessionId: updated.liveSessionId,
          displayCode: updated.displayCode,
          displayOrder: updated.displayOrder,
          isPinned: updated.isPinned,
          productId: updated.productId,
          productName: updated.productName,
          variantId: updated.variantId,
          sku: updated.sku,
          unitPrice: formatMoney2(updated.priceOverride ?? updated.variantPrice),
          priceOverride:
            updated.priceOverride !== null ? formatMoney2(updated.priceOverride) : null,
          stockQuantity: updated.stockQuantity,
          reservedQty: updated.reservedQty,
          availableQty: updated.availableQty,
          imageUrl: updated.imageUrl,
          currency: 'MYR' as const,
        })
      );
    } catch (err) {
      const appErr = toAppError(err);
      return NextResponse.json(error(appErr.message), { status: appErr.status });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return withRateLimit(request, async () => {
    try {
      const user = await requireAuth();

      if (!user.shopId) {
        return NextResponse.json(error('No shop associated with your account'), {
          status: 403,
        });
      }

      // DELETE is more restrictive than PATCH — OWNER only.
      // Hard deletes are permanent and audit-relevant; MANAGER can edit
      // but not destroy.
      if (user.role !== 'OWNER') {
        return NextResponse.json(error('Only OWNER can delete broadcast products'), {
          status: 403,
        });
      }

      const { id } = await context.params;

      if (!id || id.length === 0 || id.length > 128) {
        return NextResponse.json(error('Invalid broadcast product id'), {
          status: 400,
        });
      }

      const result = await broadcastProductRepository.delete({
        shopId: user.shopId,
        id,
      });

      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'BROADCAST_PRODUCT_DELETED',
        entity: 'broadcast_product',
        entityId: result.id,
        description: `BroadcastProduct ${result.id} deleted`,
        metadata: {
          broadcastProductId: result.id,
          deletedAt: result.deletedAt.toISOString(),
        },
      }).catch(() => {});

      return NextResponse.json(
        ok({
          broadcastProductId: result.id,
          deletedAt: result.deletedAt.toISOString(),
        })
      );
    } catch (err) {
      const appErr = toAppError(err);
      return NextResponse.json(error(appErr.message), { status: appErr.status });
    }
  });
}
