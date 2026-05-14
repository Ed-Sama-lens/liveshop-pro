import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { allowEvergreenBroadcastProduct } from '@/lib/sale/feature-flags';

/**
 * BroadcastProduct repository (Tier 3 Add from Stock — PR 4).
 *
 * Owns create + list of BroadcastProduct rows for the /sale workspace.
 * Post-PR-2 schema supports two flavors:
 *
 * 1. Live-bound: `liveSessionId` set. Uniqueness via existing
 *    `@@unique([liveSessionId, displayCode])`. Available without any
 *    feature flag.
 * 2. Evergreen / non-live: `liveSessionId IS NULL`. Uniqueness via the
 *    partial unique index `BroadcastProduct_shop_evergreen_displayCode_key`
 *    added in migration `20260514000000_sale_omnichannel_booking` step 7.
 *    Gated behind `ALLOW_EVERGREEN_BROADCAST_PRODUCT` flag. Defense-in-
 *    depth — routes should reject before calling repository, but the
 *    repository also enforces.
 *
 * Tenant safety:
 * - Every read/write scoped by `shopId`.
 * - ProductVariant.product.shopId must match the caller's shop.
 * - LiveSession.shopId must match the caller's shop when `liveSessionId`
 *   is provided.
 * - No `bp.liveSession.shopId` traversal (FK is nullable post-PR-2).
 *
 * Update + Delete are intentionally NOT implemented here. They ship in
 * a Tier 3.5 follow-up after Boss + ChatGPT review the Add from Stock
 * flow end-to-end with the create + list pair landing first.
 */

export interface CreateBroadcastProductInput {
  readonly shopId: string;
  readonly variantId: string;
  readonly displayCode: string;
  readonly liveSessionId?: string;
  readonly priceOverride?: string;
  readonly isPinned?: boolean;
}

export interface BroadcastProductRow {
  readonly broadcastProductId: string;
  readonly shopId: string;
  readonly liveSessionId: string | null;
  readonly displayCode: string;
  readonly displayOrder: number;
  readonly priceOverride: string | null;
  readonly isPinned: boolean;
  readonly productId: string;
  readonly productName: string;
  readonly variantId: string;
  readonly sku: string;
  readonly attributes: unknown;
  readonly variantPrice: string;
  readonly stockQuantity: number;
  readonly reservedQty: number;
  readonly availableQty: number;
  readonly imageUrl: string | null;
  readonly createdAt: Date;
}

export interface ListBroadcastProductsInput {
  readonly shopId: string;
  readonly scope: 'live' | 'evergreen' | 'all';
  readonly liveSessionId?: string;
  readonly q?: string;
  readonly limit: number;
}

/**
 * Map a Prisma BroadcastProduct row (with relations) into the public
 * row shape. Centralized to keep route handlers thin and ensure
 * money/image normalization happens once.
 */
function toRow(
  bp: {
    id: string;
    shopId: string;
    liveSessionId: string | null;
    displayCode: string;
    displayOrder: number;
    priceOverride: Prisma.Decimal | null;
    isPinned: boolean;
    productId: string;
    variantId: string | null;
    createdAt: Date;
    product: { name: string; images: string[] };
    variant: {
      id: string;
      sku: string;
      attributes: Prisma.JsonValue;
      price: Prisma.Decimal;
      quantity: number;
      reservedQty: number;
    } | null;
  }
): BroadcastProductRow {
  if (!bp.variant) {
    // BroadcastProduct without a variant (whole-product) is not
    // supported by /sale; the GET route filters these out. Repository
    // mappers should never hit this path because callers must select
    // variant. Throwing keeps the bug visible.
    throw new AppError(
      `BroadcastProduct ${bp.id} has no variant`,
      'VARIANT_REQUIRED',
      500
    );
  }
  const stockQuantity = bp.variant.quantity;
  const reservedQty = bp.variant.reservedQty;
  const availableQty = Math.max(0, stockQuantity - reservedQty);
  const imageUrl =
    Array.isArray(bp.product.images) && bp.product.images.length > 0
      ? bp.product.images[0]
      : null;
  return Object.freeze({
    broadcastProductId: bp.id,
    shopId: bp.shopId,
    liveSessionId: bp.liveSessionId,
    displayCode: bp.displayCode,
    displayOrder: bp.displayOrder,
    priceOverride: bp.priceOverride !== null ? bp.priceOverride.toString() : null,
    isPinned: bp.isPinned,
    productId: bp.productId,
    productName: bp.product.name,
    variantId: bp.variant.id,
    sku: bp.variant.sku,
    attributes: bp.variant.attributes,
    variantPrice: bp.variant.price.toString(),
    stockQuantity,
    reservedQty,
    availableQty,
    imageUrl,
    createdAt: bp.createdAt,
  });
}

export const broadcastProductRepository = {
  /**
   * Create a BroadcastProduct row. Validates tenant scope + flag gates
   * + uniqueness. Returns the public row shape on success.
   *
   * Throws:
   * - ValidationError 400 — bad displayCode, evergreen-without-flag
   * - NotFoundError 404 — variantId not in shop, liveSessionId not in shop
   * - ConflictError 409 — displayCode collides with existing row
   */
  async create(input: CreateBroadcastProductInput): Promise<BroadcastProductRow> {
    const { shopId, variantId, displayCode, liveSessionId, priceOverride, isPinned } = input;

    // ─── 1. Pure-input validation ──────────────────────────────────
    if (typeof displayCode !== 'string' || displayCode.length === 0 || displayCode.length > 32) {
      throw new ValidationError('displayCode must be 1..32 chars', {
        displayCode: ['required, 1..32 chars'],
      });
    }
    if (!/^[A-Za-z0-9_-]+$/.test(displayCode)) {
      throw new ValidationError('displayCode must contain only A-Z, a-z, 0-9, _, -', {
        displayCode: ['invalid format'],
      });
    }

    const isEvergreen = liveSessionId === undefined || liveSessionId === null;

    // ─── 2. Feature flag gate (defense-in-depth) ──────────────────
    if (isEvergreen && !allowEvergreenBroadcastProduct()) {
      throw new ValidationError(
        'Evergreen broadcast products are not enabled. Set ALLOW_EVERGREEN_BROADCAST_PRODUCT=true to use evergreen product codes.',
        { liveSessionId: ['required when ALLOW_EVERGREEN_BROADCAST_PRODUCT=false'] }
      );
    }

    // ─── 3. ProductVariant tenant + existence check ───────────────
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId },
      select: {
        id: true,
        product: { select: { id: true, shopId: true } },
      },
    });
    if (!variant) {
      throw new NotFoundError('ProductVariant not found');
    }
    if (variant.product.shopId !== shopId) {
      throw new NotFoundError('ProductVariant not found in this shop');
    }

    // ─── 4. LiveSession tenant check (live-bound only) ────────────
    if (!isEvergreen) {
      const session = await prisma.liveSession.findFirst({
        where: { id: liveSessionId, shopId },
        select: { id: true },
      });
      if (!session) {
        throw new NotFoundError('LiveSession not found in this shop');
      }
    }

    // ─── 5. Price override validation ─────────────────────────────
    if (priceOverride !== undefined) {
      // Decimal accepts strings; reject obvious garbage early.
      if (!/^\d+(\.\d{1,2})?$/.test(priceOverride)) {
        throw new ValidationError('priceOverride must be a decimal with up to 2 places', {
          priceOverride: ['invalid format'],
        });
      }
    }

    // ─── 6. Compute displayOrder (max + 1 within scope) ───────────
    const maxOrderRow = await prisma.broadcastProduct.findFirst({
      where: isEvergreen
        ? { shopId, liveSessionId: null }
        : { liveSessionId: liveSessionId! },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true },
    });
    const nextDisplayOrder = (maxOrderRow?.displayOrder ?? -1) + 1;

    // ─── 7. Insert ────────────────────────────────────────────────
    try {
      const created = await prisma.broadcastProduct.create({
        data: {
          shopId,
          liveSessionId: liveSessionId ?? null,
          productId: variant.product.id,
          variantId: variant.id,
          displayCode,
          displayOrder: nextDisplayOrder,
          priceOverride: priceOverride ?? null,
          isPinned: isPinned ?? false,
        },
        include: {
          product: { select: { name: true, images: true } },
          variant: {
            select: {
              id: true,
              sku: true,
              attributes: true,
              price: true,
              quantity: true,
              reservedQty: true,
            },
          },
        },
      });
      return toRow(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique violation — either live-bound (liveSessionId, displayCode)
        // or the partial evergreen index (shopId, displayCode) WHERE
        // liveSessionId IS NULL. Either way the user-facing message is
        // the same: pick a different code.
        throw new ConflictError(
          isEvergreen
            ? `Evergreen product code "${displayCode}" already exists in this shop`
            : `Live-bound product code "${displayCode}" already exists in this live session`
        );
      }
      throw err;
    }
  },

  /**
   * List BroadcastProduct rows scoped to a shop. Supports live / evergreen
   * / all filtering and optional displayCode + product name search.
   *
   * No flag check on read — flag gates creation only; existing rows can
   * always be inspected. Tenant scoping via `shopId` in where clause.
   */
  async list(input: ListBroadcastProductsInput): Promise<readonly BroadcastProductRow[]> {
    const { shopId, scope, liveSessionId, q, limit } = input;

    const scopeFilter: Prisma.BroadcastProductWhereInput =
      scope === 'evergreen'
        ? { liveSessionId: null }
        : scope === 'live'
          ? liveSessionId
            ? { liveSessionId }
            : { liveSessionId: { not: null } }
          : {}; // 'all'

    const searchFilter: Prisma.BroadcastProductWhereInput =
      typeof q === 'string' && q.length > 0
        ? {
            OR: [
              { displayCode: { contains: q, mode: 'insensitive' } },
              { product: { name: { contains: q, mode: 'insensitive' } } },
              { variant: { sku: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {};

    const rows = await prisma.broadcastProduct.findMany({
      where: {
        shopId,
        variantId: { not: null },
        ...scopeFilter,
        ...searchFilter,
      },
      orderBy: [{ isPinned: 'desc' }, { displayOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        product: { select: { name: true, images: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
            price: true,
            quantity: true,
            reservedQty: true,
          },
        },
      },
    });

    return rows
      .filter((r) => r.variant !== null) // belt-and-braces against orphan rows
      .map(toRow);
  },

  /**
   * Update a BroadcastProduct row. Only safe fields are editable:
   *   - `priceOverride` (decimal string OR explicit null to clear)
   *   - `isPinned` (boolean)
   *   - `displayOrder` (int)
   *
   * Identity-bearing fields (`displayCode` / `variantId` / `liveSessionId`
   * / `productId`) are intentionally NOT editable to preserve booking
   * audit trail + uniqueness invariants.
   *
   * Cross-shop probe returns NotFoundError (404) — does NOT disclose
   * existence in another shop.
   *
   * At least one field must be set in input; empty patch returns
   * ValidationError (route layer enforces too, this is defense-in-depth).
   */
  async update(input: {
    readonly shopId: string;
    readonly id: string;
    readonly priceOverride?: string | null;
    readonly isPinned?: boolean;
    readonly displayOrder?: number;
  }): Promise<BroadcastProductRow> {
    const { shopId, id, priceOverride, isPinned, displayOrder } = input;

    // ─── 1. At-least-one-field check ─────────────────────────────────
    if (
      priceOverride === undefined &&
      isPinned === undefined &&
      displayOrder === undefined
    ) {
      throw new ValidationError('At least one field must be provided to update', {
        body: ['empty patch not allowed'],
      });
    }

    // ─── 2. priceOverride format check (null clears) ─────────────────
    if (priceOverride !== undefined && priceOverride !== null) {
      if (!/^\d+(\.\d{1,2})?$/.test(priceOverride)) {
        throw new ValidationError('priceOverride must be a decimal with up to 2 places', {
          priceOverride: ['invalid format'],
        });
      }
    }

    // ─── 3. displayOrder bounds ──────────────────────────────────────
    if (displayOrder !== undefined) {
      if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) {
        throw new ValidationError('displayOrder must be an integer between 0 and 9999', {
          displayOrder: ['out of range'],
        });
      }
    }

    // ─── 4. Tenant scope check ───────────────────────────────────────
    const existing = await prisma.broadcastProduct.findFirst({
      where: { id, shopId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError('BroadcastProduct not found in this shop');
    }

    // ─── 5. Apply update ─────────────────────────────────────────────
    const data: Prisma.BroadcastProductUpdateInput = {};
    if (priceOverride !== undefined) data.priceOverride = priceOverride; // null clears
    if (isPinned !== undefined) data.isPinned = isPinned;
    if (displayOrder !== undefined) data.displayOrder = displayOrder;

    const updated = await prisma.broadcastProduct.update({
      where: { id },
      data,
      include: {
        product: { select: { name: true, images: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            attributes: true,
            price: true,
            quantity: true,
            reservedQty: true,
          },
        },
      },
    });
    return toRow(updated);
  },

  /**
   * Hard-delete a BroadcastProduct row. Blocked when any non-EXPIRED
   * Booking references it (active history preservation).
   *
   * Cross-shop probe returns NotFoundError (404) — does NOT disclose
   * existence in another shop.
   *
   * Throws:
   * - NotFoundError 404 — row not in shop
   * - ConflictError 409 — active bookings reference the row
   */
  async delete(input: {
    readonly shopId: string;
    readonly id: string;
  }): Promise<{ id: string; deletedAt: Date }> {
    const { shopId, id } = input;

    // ─── 1. Tenant scope check ───────────────────────────────────────
    const existing = await prisma.broadcastProduct.findFirst({
      where: { id, shopId },
      select: { id: true, displayCode: true },
    });
    if (!existing) {
      throw new NotFoundError('BroadcastProduct not found in this shop');
    }

    // ─── 2. Active booking guard ─────────────────────────────────────
    // EXPIRED bookings are excluded — they cannot reference live stock
    // anymore. CANCELLED + CONVERTED_TO_ORDER bookings are still
    // counted because their history points back to this BP for audit.
    const activeCount = await prisma.booking.count({
      where: {
        broadcastProductId: id,
        status: { not: 'EXPIRED' },
      },
    });
    if (activeCount > 0) {
      throw new ConflictError(
        `Cannot delete: BroadcastProduct "${existing.displayCode}" is referenced by ${activeCount} active booking(s). Cancel or expire the bookings first.`
      );
    }

    // ─── 3. Hard delete ──────────────────────────────────────────────
    try {
      await prisma.broadcastProduct.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        // Race condition: a booking was created between the count
        // and the delete. Surface as 409 so admin can retry.
        throw new ConflictError(
          'Delete failed due to race condition: a booking was created during the operation. Retry or check booking list.'
        );
      }
      throw err;
    }

    return Object.freeze({ id, deletedAt: new Date() });
  },
};

export type BroadcastProductRepository = typeof broadcastProductRepository;
