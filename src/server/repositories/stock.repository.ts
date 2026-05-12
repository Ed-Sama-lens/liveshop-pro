import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

export interface VariantStock {
  readonly quantity: number;
  readonly reservedQty: number;
  readonly available: number;
  readonly lowStockAt: number | null;
}

export async function getVariantStock(variantId: string): Promise<VariantStock> {
  const variant = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { quantity: true, reservedQty: true, lowStockAt: true },
  });

  return Object.freeze({
    quantity: variant.quantity,
    reservedQty: variant.reservedQty,
    available: variant.quantity - variant.reservedQty,
    lowStockAt: variant.lowStockAt,
  });
}

export interface LowStockVariant {
  readonly id: string;
  readonly sku: string;
  readonly quantity: number;
  readonly reservedQty: number;
  readonly available: number;
  readonly lowStockAt: number;
  readonly productId: string;
  readonly productName: string;
}

export async function getLowStockVariants(shopId: string): Promise<readonly LowStockVariant[]> {
  const variants = await prisma.productVariant.findMany({
    where: {
      lowStockAt: { not: null },
      product: { shopId },
    },
    select: {
      id: true,
      sku: true,
      quantity: true,
      reservedQty: true,
      lowStockAt: true,
      productId: true,
      product: { select: { name: true } },
    },
  });

  return Object.freeze(
    variants
      .filter((v) => v.lowStockAt !== null && v.quantity - v.reservedQty <= v.lowStockAt)
      .map((v) =>
        Object.freeze({
          id: v.id,
          sku: v.sku,
          quantity: v.quantity,
          reservedQty: v.reservedQty,
          available: v.quantity - v.reservedQty,
          lowStockAt: v.lowStockAt as number,
          productId: v.productId,
          productName: v.product.name,
        })
      )
  );
}

export async function adjustQuantity(variantId: string, delta: number): Promise<VariantStock> {
  const current = await prisma.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { quantity: true },
  });

  const newQty = current.quantity + delta;
  if (newQty < 0) {
    throw new AppError('Adjustment would result in negative stock', 'NEGATIVE_STOCK', 422);
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data: { quantity: { increment: delta } },
    select: { quantity: true, reservedQty: true, lowStockAt: true },
  });

  return Object.freeze({
    quantity: updated.quantity,
    reservedQty: updated.reservedQty,
    available: updated.quantity - updated.reservedQty,
    lowStockAt: updated.lowStockAt,
  });
}

export interface StockReservationResult {
  readonly reservationId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly expiresAt: Date;
}

export async function reserve(
  variantId: string,
  quantity: number,
  orderId?: string
): Promise<StockReservationResult> {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { quantity: true, reservedQty: true },
    });

    const available = variant.quantity - variant.reservedQty;
    if (available < quantity) {
      throw new AppError(
        `Insufficient stock: ${available} available, ${quantity} requested`,
        'INSUFFICIENT_STOCK',
        409
      );
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const reservation = await tx.stockReservation.create({
      data: { variantId, quantity, orderId, expiresAt },
      select: { id: true, variantId: true, quantity: true, expiresAt: true },
    });

    await tx.productVariant.update({
      where: { id: variantId },
      data: { reservedQty: { increment: quantity } },
    });

    return Object.freeze({
      reservationId: reservation.id,
      variantId: reservation.variantId,
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt,
    });
  });
}

export interface ReleaseResult {
  readonly reservationId: string;
  readonly releasedAt: Date;
}

export async function release(reservationId: string): Promise<ReleaseResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.stockReservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { id: true, variantId: true, quantity: true, releasedAt: true },
    });

    if (reservation.releasedAt !== null) {
      throw new AppError('Reservation already released', 'ALREADY_RELEASED', 409);
    }

    const releasedAt = new Date();

    await tx.stockReservation.update({
      where: { id: reservationId },
      data: { releasedAt },
    });

    await tx.productVariant.update({
      where: { id: reservation.variantId },
      data: { reservedQty: { decrement: reservation.quantity } },
    });

    return Object.freeze({ reservationId, releasedAt });
  });
}

/**
 * Find all StockReservation rows whose `expiresAt` is in the past and
 * release them. Used as a periodic cron from outside the repo.
 *
 * ORDER-RESERVATION-CLEANUP Commit 3 (2026-05-12) — resilient batch
 * processing:
 *
 * Before this fix, the function used `Promise.all` over `release()`
 * calls. Any per-row failure (FK race, deleted row, reservedQty
 * decrement guard failure, etc.) would abort the entire batch + leave
 * later rows un-released. Cron behavior was all-or-nothing.
 *
 * After this fix:
 * - `Promise.allSettled` processes every row independently.
 * - Failures are logged with reservationId + error code so admin can
 *   investigate, but the batch continues.
 * - Return shape preserved (`Promise<number>` count of rows attempted)
 *   for backward compatibility — no current callers depend on
 *   per-row failure detail, but keeping the shape avoids breaking any
 *   future caller that assumes "row count to attempt."
 *
 * Notes:
 * - Sale-conversion reservations use NO_EXPIRY_SENTINEL (year 2099)
 *   and never match `expiresAt <= now`. Cron does not touch them.
 * - ORDER-RESERVATION-CLEANUP Commit 1 ensures order-confirm path
 *   marks `releasedAt` itself, so post-Commit-1 cron should rarely
 *   encounter orphan rows from order flow.
 * - Storefront-checkout orphans created BEFORE Commit 1 ran may still
 *   exist; the future-only fix doesn't backfill them. They are still
 *   pickable by this cron (`releasedAt: null AND expiresAt <= now`)
 *   and `release()` will set `releasedAt` + decrement `reservedQty`
 *   AGAIN — a known data risk documented in
 *   docs/superpowers/2026-05-12-expire-reservations-cron-resilience.md.
 *   Commit 2 (one-shot backfill) addresses this; until then, cron
 *   resilience prevents one bad row from blocking the rest.
 */
export async function expireReservations(): Promise<number> {
  const now = new Date();

  const expired = await prisma.stockReservation.findMany({
    where: { releasedAt: null, expiresAt: { lte: now } },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  const results = await Promise.allSettled(expired.map((r) => release(r.id)));

  const released = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (failed > 0) {
    const sampleFailures = results
      .map((r, idx) => ({ result: r, reservationId: expired[idx].id }))
      .filter(
        (x): x is { result: PromiseRejectedResult; reservationId: string } =>
          x.result.status === 'rejected'
      )
      .slice(0, 5)
      .map((x) => ({
        reservationId: x.reservationId,
        error:
          x.result.reason instanceof Error
            ? x.result.reason.message
            : String(x.result.reason),
        code:
          x.result.reason instanceof Error && 'code' in x.result.reason
            ? (x.result.reason as { code?: string }).code
            : undefined,
      }));

    logger.warn(
      {
        attempted: expired.length,
        released,
        failed,
        sampleFailures,
      },
      'expireReservations: some releases failed; batch continued'
    );
  }

  return expired.length;
}
