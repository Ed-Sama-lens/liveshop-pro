import { prisma } from '@/lib/db/prisma';
import { AppError } from '@/lib/errors';

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

export async function expireReservations(): Promise<number> {
  const now = new Date();

  const expired = await prisma.stockReservation.findMany({
    where: { releasedAt: null, expiresAt: { lte: now } },
    select: { id: true },
  });

  await Promise.all(expired.map((r) => release(r.id)));

  return expired.length;
}
