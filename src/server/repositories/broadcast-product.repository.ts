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
  /**
   * Tier 3.9 — Sale Date (YYYY-MM-DD). When omitted, repository writes
   * today in shop timezone (Shop.timezone) per D-Date-5 verdict.
   * Caller may pass explicit ISO date for backfill or admin override.
   */
  readonly saleDate?: string;
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
  /**
   * Tier 3.9 — Sale Date in YYYY-MM-DD form (shop timezone). Null when
   * row predates migration backfill and could not be safely derived
   * ("Untagged" group in UI per D-Date-4 verdict).
   */
  readonly saleDate: string | null;
}

export interface ListBroadcastProductsInput {
  readonly shopId: string;
  readonly scope: 'live' | 'evergreen' | 'all';
  readonly liveSessionId?: string;
  readonly q?: string;
  readonly limit: number;
  /**
   * Tier 3.9 — Sale Date filter (YYYY-MM-DD). When provided, only rows
   * with matching saleDate are returned. `'untagged'` sentinel returns
   * rows with `saleDate IS NULL` (UI "Untagged" group). When omitted,
   * scope filter alone is used (legacy compatibility).
   */
  readonly saleDate?: string | 'untagged';
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
    saleDate: Date | null;
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
  // saleDate (Prisma DATE) comes back as JS Date at UTC midnight. We
  // serialize as YYYY-MM-DD using UTC components to avoid local-tz
  // rendering shift (the DB value is calendar-only, not a timestamp).
  const saleDateIso =
    bp.saleDate !== null
      ? `${bp.saleDate.getUTCFullYear()}-${String(bp.saleDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bp.saleDate.getUTCDate()).padStart(2, '0')}`
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
    saleDate: saleDateIso,
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
    const { shopId, variantId, displayCode, liveSessionId, priceOverride, isPinned, saleDate } =
      input;

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

    // ─── 5.5 Sale Date resolution (Tier 3.9) ──────────────────────
    // If saleDate omitted, default to today in shop timezone per
    // D-Date-5. Lazy-load shop timezone only when needed.
    const { parseSaleDate, todaySaleDate } = await import('@/lib/sale/sale-date');
    let resolvedSaleDate: Date | null = null;
    if (typeof saleDate === 'string' && saleDate.length > 0) {
      try {
        resolvedSaleDate = parseSaleDate(saleDate);
      } catch (parseErr) {
        throw new ValidationError(
          parseErr instanceof Error ? parseErr.message : 'Invalid saleDate',
          { saleDate: ['must be YYYY-MM-DD'] }
        );
      }
    } else {
      const shopRow = await prisma.shop.findFirst({
        where: { id: shopId },
        select: { timezone: true },
      });
      const tz = shopRow?.timezone ?? 'Asia/Kuala_Lumpur';
      resolvedSaleDate = parseSaleDate(todaySaleDate(tz));
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
          saleDate: resolvedSaleDate,
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
        // Unique violation — could be:
        //  - live-bound (liveSessionId, displayCode)
        //  - new Tier 3.9 partial (shopId, saleDate, displayCode) WHERE saleDate IS NOT NULL
        // Distinguish by saleDate presence for the message; both mean
        // "pick a different code for that scope".
        if (resolvedSaleDate !== null) {
          throw new ConflictError(
            `Product code "${displayCode}" already exists for this sale date in this shop`
          );
        }
        throw new ConflictError(
          isEvergreen
            ? `Product code "${displayCode}" already exists in this shop`
            : `Live-bound product code "${displayCode}" already exists in this live session`
        );
      }
      throw err;
    }
  },

  /**
   * Batch-create N BroadcastProduct rows in a single Prisma transaction.
   * All-or-nothing: if any item fails validation, tenant, or uniqueness,
   * the entire batch rolls back.
   *
   * Tier 3.9-C (2026-05-22). Used by AddFromStock multi-select to add
   * many stock variants to the same saleDate in one click.
   *
   * Per-item displayCode defaults to caller-supplied displayCode or
   * (if omitted) Product.saleCode → ProductVariant.sku → stockCode
   * (handled in the caller / route layer). Each input must have a
   * resolved displayCode by the time it reaches this method.
   *
   * Returns the created rows in the same order as the input array.
   *
   * Throws:
   * - ValidationError 400 — bad item, evergreen-without-flag, duplicate in batch
   * - NotFoundError 404 — variantId not in shop, liveSessionId not in shop
   * - ConflictError 409 — displayCode collides with existing row OR
   *   within the batch
   */
  async createMany(input: {
    readonly shopId: string;
    readonly items: ReadonlyArray<{
      readonly variantId: string;
      readonly displayCode: string;
      readonly priceOverride?: string;
    }>;
    readonly liveSessionId?: string;
    readonly saleDate?: string;
  }): Promise<readonly BroadcastProductRow[]> {
    const { shopId, items, liveSessionId, saleDate } = input;

    if (items.length === 0) {
      throw new ValidationError('items must contain at least one entry', {
        items: ['required'],
      });
    }
    if (items.length > 50) {
      throw new ValidationError('items may not exceed 50 entries per batch', {
        items: [`got ${items.length}, max 50`],
      });
    }

    // Pure-input validation per item.
    for (const item of items) {
      if (
        typeof item.displayCode !== 'string' ||
        item.displayCode.length === 0 ||
        item.displayCode.length > 32
      ) {
        throw new ValidationError(
          `displayCode "${item.displayCode}" must be 1..32 chars`,
          { displayCode: ['required, 1..32 chars'] }
        );
      }
      if (!/^[A-Za-z0-9_-]+$/.test(item.displayCode)) {
        throw new ValidationError(
          `displayCode "${item.displayCode}" must contain only A-Z, a-z, 0-9, _, -`,
          { displayCode: ['invalid format'] }
        );
      }
      if (item.priceOverride !== undefined) {
        if (!/^\d+(\.\d{1,2})?$/.test(item.priceOverride)) {
          throw new ValidationError(
            `priceOverride "${item.priceOverride}" must be a decimal with up to 2 places`,
            { priceOverride: ['invalid format'] }
          );
        }
      }
    }

    // Detect intra-batch displayCode duplicates BEFORE hitting DB.
    const codeSet = new Set<string>();
    for (const item of items) {
      if (codeSet.has(item.displayCode)) {
        throw new ConflictError(
          `Duplicate displayCode "${item.displayCode}" in batch — each item must have a unique code`
        );
      }
      codeSet.add(item.displayCode);
    }

    const isEvergreen = liveSessionId === undefined || liveSessionId === null;
    if (isEvergreen && !allowEvergreenBroadcastProduct()) {
      throw new ValidationError(
        'Evergreen broadcast products are not enabled. Set ALLOW_EVERGREEN_BROADCAST_PRODUCT=true.',
        { liveSessionId: ['required when ALLOW_EVERGREEN_BROADCAST_PRODUCT=false'] }
      );
    }

    // LiveSession tenant check (once for live-bound batch).
    if (!isEvergreen) {
      const session = await prisma.liveSession.findFirst({
        where: { id: liveSessionId, shopId },
        select: { id: true },
      });
      if (!session) {
        throw new NotFoundError('LiveSession not found in this shop');
      }
    }

    // Tenant + existence check for ALL variants in one query.
    const variantIds = items.map((i) => i.variantId);
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        product: { select: { id: true, shopId: true } },
      },
    });
    if (variants.length !== items.length) {
      const foundIds = new Set(variants.map((v) => v.id));
      const missing = variantIds.filter((id) => !foundIds.has(id));
      throw new NotFoundError(
        `ProductVariant not found: ${missing.join(', ')}`
      );
    }
    const variantById = new Map(variants.map((v) => [v.id, v]));
    for (const v of variants) {
      if (v.product.shopId !== shopId) {
        throw new NotFoundError('ProductVariant not found in this shop');
      }
    }

    // Resolve saleDate once (shared across batch).
    const { parseSaleDate, todaySaleDate } = await import('@/lib/sale/sale-date');
    let resolvedSaleDate: Date;
    if (typeof saleDate === 'string' && saleDate.length > 0) {
      try {
        resolvedSaleDate = parseSaleDate(saleDate);
      } catch (parseErr) {
        throw new ValidationError(
          parseErr instanceof Error ? parseErr.message : 'Invalid saleDate',
          { saleDate: ['must be YYYY-MM-DD'] }
        );
      }
    } else {
      const shopRow = await prisma.shop.findFirst({
        where: { id: shopId },
        select: { timezone: true },
      });
      const tz = shopRow?.timezone ?? 'Asia/Kuala_Lumpur';
      resolvedSaleDate = parseSaleDate(todaySaleDate(tz));
    }

    // Atomic batch insert.
    try {
      const created = await prisma.$transaction(async (tx) => {
        // Compute starting displayOrder per scope (once, then increment).
        const maxOrderRow = await tx.broadcastProduct.findFirst({
          where: isEvergreen
            ? { shopId, liveSessionId: null }
            : { liveSessionId: liveSessionId! },
          orderBy: { displayOrder: 'desc' },
          select: { displayOrder: true },
        });
        let nextOrder = (maxOrderRow?.displayOrder ?? -1) + 1;

        const results: Array<{
          id: string;
          shopId: string;
          liveSessionId: string | null;
          displayCode: string;
          displayOrder: number;
          priceOverride: Prisma.Decimal | null;
          isPinned: boolean;
          productId: string;
          variantId: string | null;
          saleDate: Date | null;
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
        }> = [];

        for (const item of items) {
          const v = variantById.get(item.variantId)!;
          const row = await tx.broadcastProduct.create({
            data: {
              shopId,
              liveSessionId: liveSessionId ?? null,
              productId: v.product.id,
              variantId: v.id,
              displayCode: item.displayCode,
              displayOrder: nextOrder++,
              priceOverride: item.priceOverride ?? null,
              isPinned: false,
              saleDate: resolvedSaleDate,
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
          results.push(row);
        }
        return results;
      });
      return Object.freeze(created.map(toRow));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Partial unique index (shopId, saleDate, displayCode) WHERE
        // saleDate IS NOT NULL OR live-bound (liveSessionId, displayCode)
        // P2002 doesn't surface target reliably for raw-SQL partial index.
        // Generic friendly message.
        throw new ConflictError(
          'One or more product codes already exist for the selected sale date in this shop. Transaction rolled back; no codes created.'
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
    const { shopId, scope, liveSessionId, q, limit, saleDate } = input;

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

    // Tier 3.9 — Sale Date filter. 'untagged' sentinel matches NULL.
    // YYYY-MM-DD string matches that calendar day. Omitted = no filter
    // (legacy behavior; useful for migration scripts + admin tooling).
    let saleDateFilter: Prisma.BroadcastProductWhereInput = {};
    if (saleDate === 'untagged') {
      saleDateFilter = { saleDate: null };
    } else if (typeof saleDate === 'string' && saleDate.length > 0) {
      const { parseSaleDate } = await import('@/lib/sale/sale-date');
      try {
        const parsed = parseSaleDate(saleDate);
        saleDateFilter = { saleDate: parsed };
      } catch (parseErr) {
        throw new ValidationError(
          parseErr instanceof Error ? parseErr.message : 'Invalid saleDate',
          { saleDate: ['must be YYYY-MM-DD or "untagged"'] }
        );
      }
    }

    const rows = await prisma.broadcastProduct.findMany({
      where: {
        shopId,
        variantId: { not: null },
        ...scopeFilter,
        ...searchFilter,
        ...saleDateFilter,
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
