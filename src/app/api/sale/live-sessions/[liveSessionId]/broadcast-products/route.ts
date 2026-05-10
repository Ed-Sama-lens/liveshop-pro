import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { formatMoney2 } from '@/lib/api/money';
import { prisma } from '@/lib/db/prisma';

interface RouteContext {
  params: Promise<{ liveSessionId: string }>;
}

/**
 * GET /api/sale/live-sessions/[liveSessionId]/broadcast-products
 *
 * Read-only endpoint for the /sale product code grid (Commit 2Q).
 * Returns BroadcastProduct rows for a single live session belonging to
 * the authenticated admin's shop, joined with variant + product so the
 * UI can render display code / name / SKU / price / stock without a
 * second round trip.
 *
 * Auth/RBAC
 * - requireAuth() → 401 on no session
 * - user.shopId required → 403
 * - Roles: OWNER, MANAGER, CHAT_SUPPORT (matches /sale page rule).
 *   WAREHOUSE denied.
 * - LiveSession must belong to user.shopId, else NotFoundError (404).
 *   Generic 404 message used to avoid leaking session existence across
 *   shops; cross-shop probing returns identical "Live session not found".
 *
 * Response (200)
 *   {
 *     success: true,
 *     data: {
 *       liveSessionId,
 *       currency: 'MYR',
 *       products: [{
 *         broadcastProductId, displayCode, displayOrder,
 *         productId, productName,
 *         variantId, variantName, sku,
 *         unitPrice (string, fixed-2-decimal),
 *         priceOverride (string|null),
 *         stockQuantity, reservedQty, availableQty,
 *         imageUrl|null
 *       }]
 *     }
 *   }
 *
 * Filtering
 * - BroadcastProduct rows with `variantId === null` (whole-product
 *   broadcasts; unsupported in Phase 1) are excluded from the response
 *   to avoid surfacing rows the /sale workflow cannot act on.
 * - Defense-in-depth: variant.product.shopId !== shopId rows are also
 *   excluded. This mirrors the cross-shop defense in createManual().
 *
 * unitPrice resolution
 * - unitPrice = `BroadcastProduct.priceOverride ?? ProductVariant.price`
 *   formatted to fixed-2-decimal at this route boundary via
 *   formatMoney2().
 * - priceOverride is also returned separately so the UI can show "X RM
 *   (overridden from Y RM)" if it wants. null when no override.
 *
 * availableQty = stockQuantity - reservedQty (clamped to ≥ 0).
 *
 * No mutation. No rate limit on GET. No customer-facing messages.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
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

    const { liveSessionId } = await context.params;

    if (!liveSessionId || liveSessionId.length === 0 || liveSessionId.length > 128) {
      return NextResponse.json(error('Invalid live session id'), { status: 400 });
    }

    // Verify liveSession belongs to this shop. Generic 404 prevents
    // cross-shop existence probing.
    const liveSession = await prisma.liveSession.findFirst({
      where: { id: liveSessionId, shopId: user.shopId },
      select: { id: true },
    });
    if (!liveSession) {
      throw new NotFoundError('Live session not found');
    }

    const rows = await prisma.broadcastProduct.findMany({
      where: {
        liveSessionId,
        variantId: { not: null },
      },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        displayCode: true,
        displayOrder: true,
        priceOverride: true,
        productId: true,
        variantId: true,
        product: {
          select: {
            shopId: true,
            name: true,
            images: true,
          },
        },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
            price: true,
            quantity: true,
            reservedQty: true,
            product: { select: { shopId: true } },
          },
        },
      },
    });

    const products = rows
      .filter((r) => {
        // Cross-shop defense: skip any BP whose variant.product.shopId
        // differs from caller. variant must be present (filtered in
        // where clause). product on the BP itself is also shop-scoped.
        if (!r.variant) return false;
        if (r.variant.product.shopId !== user.shopId) return false;
        if (r.product.shopId !== user.shopId) return false;
        return true;
      })
      .map((r) => {
        const variant = r.variant!;
        const stockQuantity = variant.quantity;
        const reservedQty = variant.reservedQty;
        const availableQty = Math.max(0, stockQuantity - reservedQty);
        const baseUnitPrice = (r.priceOverride ?? variant.price).toString();
        const variantName = describeVariant(variant.attributes);
        const imageUrl =
          Array.isArray(r.product.images) && r.product.images.length > 0
            ? r.product.images[0]
            : null;
        return Object.freeze({
          broadcastProductId: r.id,
          displayCode: r.displayCode,
          displayOrder: r.displayOrder,
          productId: r.productId,
          productName: r.product.name,
          variantId: variant.id,
          variantName,
          sku: variant.sku,
          unitPrice: formatMoney2(baseUnitPrice),
          priceOverride:
            r.priceOverride !== null ? formatMoney2(r.priceOverride.toString()) : null,
          stockQuantity,
          reservedQty,
          availableQty,
          imageUrl,
        });
      });

    return NextResponse.json(
      Object.freeze({
        success: true,
        data: Object.freeze({
          liveSessionId,
          currency: 'MYR' as const,
          products,
        }),
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

/**
 * Pure: describe a Prisma JSON attribute payload as a short human-
 * readable string for /sale UI display. Falls back to '—' on unknown
 * shapes so the route response never crashes on legacy variants.
 *
 * Examples:
 *   { color: 'red', size: 'M' } → 'color: red · size: M'
 *   {}                           → '—'
 *   null                         → '—'
 */
function describeVariant(attributes: unknown): string {
  if (!attributes || typeof attributes !== 'object') return '—';
  const entries = Object.entries(attributes as Record<string, unknown>);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' · ');
}
