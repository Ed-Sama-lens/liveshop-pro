import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';
import type { CreateOrderInput, UpdateOrderInput, OrderQuery } from '@/lib/validation/order.schemas';
import { VALID_TRANSITIONS } from '@/lib/validation/order.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface OrderItemRow {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly totalPrice: string;
  readonly product: { readonly name: string; readonly stockCode: string };
  readonly variant: { readonly sku: string; readonly attributes: Record<string, string> };
}

export interface OrderRow {
  readonly id: string;
  readonly shopId: string;
  readonly customerId: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly channel: string;
  readonly totalAmount: string;
  readonly shippingFee: string;
  readonly notes: string | null;
  readonly idempotencyKey: string | null;
  readonly reservedAt: Date;
  readonly confirmedAt: Date | null;
  readonly packedAt: Date | null;
  readonly shippedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly customer?: { readonly id: string; readonly name: string };
  readonly items?: readonly OrderItemRow[];
  readonly _count?: { readonly items: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeOrderItem(item: {
  id: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: { toString(): string };
  totalPrice: { toString(): string };
  product: { name: string; stockCode: string };
  variant: { sku: string; attributes: unknown };
}): OrderItemRow {
  return Object.freeze({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    totalPrice: item.totalPrice.toString(),
    product: Object.freeze({ name: item.product.name, stockCode: item.product.stockCode }),
    variant: Object.freeze({
      sku: item.variant.sku,
      attributes: item.variant.attributes as Record<string, string>,
    }),
  });
}

function serializeOrder(o: {
  id: string;
  shopId: string;
  customerId: string;
  orderNumber: string;
  status: string;
  channel: string;
  totalAmount: { toString(): string };
  shippingFee: { toString(): string };
  notes: string | null;
  idempotencyKey: string | null;
  reservedAt: Date;
  confirmedAt: Date | null;
  packedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer?: { id: string; name: string };
  items?: Array<{
    id: string;
    productId: string;
    variantId: string;
    quantity: number;
    unitPrice: { toString(): string };
    totalPrice: { toString(): string };
    product: { name: string; stockCode: string };
    variant: { sku: string; attributes: unknown };
  }>;
  _count?: { items: number };
}): OrderRow {
  const base = {
    id: o.id,
    shopId: o.shopId,
    customerId: o.customerId,
    orderNumber: o.orderNumber,
    status: o.status,
    channel: o.channel,
    totalAmount: o.totalAmount.toString(),
    shippingFee: o.shippingFee.toString(),
    notes: o.notes,
    idempotencyKey: o.idempotencyKey,
    reservedAt: o.reservedAt,
    confirmedAt: o.confirmedAt,
    packedAt: o.packedAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };

  const extras: Record<string, unknown> = {};

  if (o.customer) {
    extras.customer = Object.freeze({ id: o.customer.id, name: o.customer.name });
  }

  if (o.items) {
    extras.items = Object.freeze(o.items.map(serializeOrderItem));
  }

  if (o._count) {
    extras._count = Object.freeze({ items: o._count.items });
  }

  return Object.freeze({ ...base, ...extras }) as OrderRow;
}

// ─── Order Number Generation ─────────────────────────────────────────────────

async function generateOrderNumber(shopId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  const count = await prisma.order.count({
    where: {
      shopId,
      createdAt: {
        gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
        lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
      },
    },
  });

  const seq = String(count + 1).padStart(4, '0');
  return `ORD-${dateStr}-${seq}`;
}

// ─── Status timestamp field mapping ──────────────────────────────────────────

const STATUS_TIMESTAMP_FIELD: Record<string, string> = {
  CONFIRMED: 'confirmedAt',
  PACKED: 'packedAt',
  SHIPPED: 'shippedAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
};

// ─── Repository ───────────────────────────────────────────────────────────────

const LIST_INCLUDE = {
  customer: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} as const;

const DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { name: true, stockCode: true } },
      variant: { select: { sku: true, attributes: true } },
    },
    orderBy: { id: 'asc' as const },
  },
} as const;

export const orderRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: Pick<OrderQuery, 'search' | 'status' | 'channel' | 'customerId' | 'dateFrom' | 'dateTo'>,
    pagination: Pick<OrderQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly OrderRow[]; total: number }> {
    const { search, status, channel, customerId, dateFrom, dateTo } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      shopId,
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
      ...(customerId ? { customerId } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' as const } },
              { customer: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...((dateFrom || dateTo)
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: LIST_INCLUDE,
      }),
      prisma.order.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeOrder)),
      total,
    });
  },

  async findById(shopId: string, id: string): Promise<OrderRow | null> {
    const order = await prisma.order.findFirst({
      where: { id, shopId },
      include: DETAIL_INCLUDE,
    });

    if (!order) return null;
    return serializeOrder(order);
  },

  async create(shopId: string, data: CreateOrderInput): Promise<OrderRow> {
    // Idempotency check
    if (data.idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: DETAIL_INCLUDE,
      });
      if (existing) return serializeOrder(existing);
    }

    const orderNumber = await generateOrderNumber(shopId);

    // Calculate total
    let totalAmount = 0;
    const itemsData = data.items.map((item) => {
      const unitPrice = parseFloat(item.unitPrice);
      const totalPrice = unitPrice * item.quantity;
      totalAmount += totalPrice;
      return {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
      };
    });

    const shippingFee = parseFloat(data.shippingFee || '0');
    totalAmount += shippingFee;

    const order = await prisma.$transaction(async (tx) => {
      // Reserve stock for each item
      for (const item of data.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
        });

        if (!variant) {
          throw new NotFoundError(`Variant ${item.variantId} not found`);
        }

        const available = variant.quantity - variant.reservedQty;
        if (available < item.quantity) {
          throw new ConflictError(`Insufficient stock for variant ${variant.sku}`);
        }

        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { reservedQty: { increment: item.quantity } },
        });
      }

      // Create order with items
      return tx.order.create({
        data: {
          shopId,
          customerId: data.customerId,
          orderNumber,
          channel: data.channel,
          totalAmount,
          shippingFee,
          notes: data.notes,
          idempotencyKey: data.idempotencyKey,
          items: {
            create: itemsData,
          },
        },
        include: DETAIL_INCLUDE,
      });
    });

    return serializeOrder(order);
  },

  async update(shopId: string, id: string, data: UpdateOrderInput): Promise<OrderRow> {
    const existing = await prisma.order.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Order not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.shippingFee !== undefined) {
      const newShippingFee = parseFloat(data.shippingFee);
      const oldShippingFee = Number(existing.shippingFee);
      const currentTotal = Number(existing.totalAmount);
      updateData.shippingFee = newShippingFee;
      updateData.totalAmount = currentTotal - oldShippingFee + newShippingFee;
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: DETAIL_INCLUDE,
    });

    return serializeOrder(order);
  },

  async transition(shopId: string, id: string, newStatus: string, performedBy?: string): Promise<OrderRow> {
    const existing = await prisma.order.findFirst({
      where: { id, shopId },
      include: { items: true },
    });

    if (!existing) {
      throw new NotFoundError('Order not found');
    }

    const allowed = VALID_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new ConflictError(
        `Cannot transition from ${existing.status} to ${newStatus}`
      );
    }

    const order = await prisma.$transaction(async (tx) => {
      // Release stock if cancelling
      if (newStatus === 'CANCELLED') {
        for (const item of existing.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { reservedQty: { decrement: item.quantity } },
          });
        }
      }

      // Deduct actual stock when confirmed (move from reserved to sold)
      if (newStatus === 'CONFIRMED') {
        for (const item of existing.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              quantity: { decrement: item.quantity },
              reservedQty: { decrement: item.quantity },
            },
          });
        }
      }

      // Update order status with timestamp
      const timestampField = STATUS_TIMESTAMP_FIELD[newStatus];
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: newStatus as 'RESERVED' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED',
          ...(timestampField ? { [timestampField]: new Date() } : {}),
        },
        include: DETAIL_INCLUDE,
      });

      // Create audit log
      await tx.orderAudit.create({
        data: {
          orderId: id,
          action: 'STATUS_CHANGE',
          fromStatus: existing.status,
          toStatus: newStatus,
          performedBy,
        },
      });

      return updated;
    });

    return serializeOrder(order);
  },

  async getAuditLog(
    shopId: string,
    orderId: string
  ): Promise<readonly { readonly id: string; readonly action: string; readonly fromStatus: string | null; readonly toStatus: string | null; readonly performedBy: string | null; readonly createdAt: Date }[]> {
    // Verify order belongs to shop
    const order = await prisma.order.findFirst({ where: { id: orderId, shopId } });
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const logs = await prisma.orderAudit.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return Object.freeze(
      logs.map((l) =>
        Object.freeze({
          id: l.id,
          action: l.action,
          fromStatus: l.fromStatus,
          toStatus: l.toStatus,
          performedBy: l.performedBy,
          createdAt: l.createdAt,
        })
      )
    );
  },
});
