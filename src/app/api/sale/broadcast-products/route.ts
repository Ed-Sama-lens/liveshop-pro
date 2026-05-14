import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, withRateLimit } from '@/lib/validation/middleware';
import {
  createBroadcastProductBodySchema,
  listBroadcastProductsQuerySchema,
} from '@/lib/validation/broadcast-product.schemas';
import { broadcastProductRepository } from '@/server/repositories/broadcast-product.repository';
import { logActivity } from '@/server/services/activity.service';
import { formatMoney2 } from '@/lib/api/money';

/**
 * /api/sale/broadcast-products — Tier 3 Add from Stock routes.
 *
 * GET — list shop-scoped BroadcastProducts with optional scope filter
 *       (live / evergreen / all) + optional displayCode/product name
 *       search. Read access for OWNER / MANAGER / CHAT_SUPPORT (matches
 *       existing /sale read routes).
 *
 * POST — create a BroadcastProduct row. Live-bound creation works in
 *        any flag state. Evergreen creation requires
 *        ALLOW_EVERGREEN_BROADCAST_PRODUCT=true (repository enforces;
 *        route validates body but does not re-check the flag — defense
 *        in depth via the repository).
 *
 * Schema reference: prisma/schema.prisma model BroadcastProduct.
 * Repository: src/server/repositories/broadcast-product.repository.ts.
 * Plan: docs/superpowers/2026-05-14-sale-add-from-stock-product-code-plan.md.
 */

const SCOPE_VALUES = ['live', 'evergreen', 'all'] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), {
        status: 403,
      });
    }

    if (!['OWNER', 'MANAGER', 'CHAT_SUPPORT'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listBroadcastProductsQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return NextResponse.json(
        { success: false, error: 'Validation failed', fields: fieldErrors },
        { status: 400 }
      );
    }

    const { scope, liveSessionId, q, limit } = parsed.data;

    const rows = await broadcastProductRepository.list({
      shopId: user.shopId,
      scope,
      liveSessionId,
      q,
      limit,
    });

    const products = rows.map((r) => ({
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
      createdAt: r.createdAt,
    }));

    return NextResponse.json(
      ok({
        scope,
        currency: 'MYR' as const,
        products,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

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

      const bodyResult = await validateBody(request, createBroadcastProductBodySchema);
      if ('error' in bodyResult) return bodyResult.error;

      const { variantId, displayCode, liveSessionId, priceOverride, isPinned } = bodyResult.data;

      const created = await broadcastProductRepository.create({
        shopId: user.shopId,
        variantId,
        displayCode,
        ...(liveSessionId !== undefined ? { liveSessionId } : {}),
        ...(priceOverride !== undefined ? { priceOverride } : {}),
        ...(isPinned !== undefined ? { isPinned } : {}),
      });

      // Activity log (non-blocking). Reasonable to log every create for
      // audit since BP creation is a low-frequency admin action.
      logActivity({
        shopId: user.shopId,
        userId: user.id,
        userName: user.name,
        action: 'BROADCAST_PRODUCT_CREATED',
        entity: 'broadcast_product',
        entityId: created.broadcastProductId,
        description: `BroadcastProduct ${created.displayCode} created (${created.liveSessionId === null ? 'evergreen' : 'live'})`,
        metadata: {
          broadcastProductId: created.broadcastProductId,
          displayCode: created.displayCode,
          liveSessionId: created.liveSessionId,
          variantId: created.variantId,
          productId: created.productId,
          isEvergreen: created.liveSessionId === null,
        },
      }).catch(() => {});

      return NextResponse.json(
        ok({
          broadcastProductId: created.broadcastProductId,
          shopId: created.shopId,
          liveSessionId: created.liveSessionId,
          displayCode: created.displayCode,
          displayOrder: created.displayOrder,
          isPinned: created.isPinned,
          productId: created.productId,
          productName: created.productName,
          variantId: created.variantId,
          sku: created.sku,
          unitPrice: formatMoney2(created.priceOverride ?? created.variantPrice),
          priceOverride: created.priceOverride !== null ? formatMoney2(created.priceOverride) : null,
          stockQuantity: created.stockQuantity,
          reservedQty: created.reservedQty,
          availableQty: created.availableQty,
          imageUrl: created.imageUrl,
          currency: 'MYR' as const,
        }),
        { status: 201 }
      );
    } catch (err) {
      const appErr = toAppError(err);
      return NextResponse.json(error(appErr.message), { status: appErr.status });
    }
  });
}

// SCOPE_VALUES intentionally referenced to keep export contract clear
export type { CreateBroadcastProductBody } from '@/lib/validation/broadcast-product.schemas';
export { SCOPE_VALUES };
