import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';
import type { CreateShipmentInput, UpdateShipmentInput, ShipmentQuery } from '@/lib/validation/shipping.schemas';
import { VALID_SHIPMENT_TRANSITIONS } from '@/lib/validation/shipping.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface ShipmentRow {
  readonly id: string;
  readonly orderId: string;
  readonly provider: string;
  readonly trackingNumber: string | null;
  readonly status: string;
  readonly labelUrl: string | null;
  readonly shippedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly order?: {
    readonly orderNumber: string;
    readonly customer: { readonly name: string } | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeShipment(s: {
  id: string;
  orderId: string;
  provider: string;
  trackingNumber: string | null;
  status: string;
  labelUrl: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order?: {
    orderNumber: string;
    customer: { name: string } | null;
  };
}): ShipmentRow {
  const base = {
    id: s.id,
    orderId: s.orderId,
    provider: s.provider,
    trackingNumber: s.trackingNumber,
    status: s.status,
    labelUrl: s.labelUrl,
    shippedAt: s.shippedAt,
    deliveredAt: s.deliveredAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };

  const extras: Record<string, unknown> = {};
  if (s.order) {
    extras.order = Object.freeze({
      orderNumber: s.order.orderNumber,
      customer: s.order.customer ? Object.freeze({ name: s.order.customer.name }) : null,
    });
  }

  return Object.freeze({ ...base, ...extras }) as ShipmentRow;
}

// ─── Repository ───────────────────────────────────────────────────────────────

const LIST_INCLUDE = {
  order: {
    select: {
      orderNumber: true,
      customer: { select: { name: true } },
    },
  },
} as const;

interface ShipmentRepository {
  findMany(
    shopId: string,
    filters: Pick<ShipmentQuery, 'status' | 'provider' | 'search'>,
    pagination: Pick<ShipmentQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly ShipmentRow[]; total: number }>;
  findById(shopId: string, id: string): Promise<ShipmentRow | null>;
  findByOrderId(orderId: string): Promise<ShipmentRow | null>;
  create(shopId: string, data: CreateShipmentInput): Promise<ShipmentRow>;
  update(shopId: string, id: string, data: UpdateShipmentInput): Promise<ShipmentRow>;
  transition(shopId: string, id: string, newStatus: string): Promise<ShipmentRow>;
}

export const shipmentRepository: ShipmentRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: Pick<ShipmentQuery, 'status' | 'provider' | 'search'>,
    pagination: Pick<ShipmentQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly ShipmentRow[]; total: number }> {
    const { status, provider, search } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      order: { shopId },
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(search
        ? {
            OR: [
              { trackingNumber: { contains: search, mode: 'insensitive' as const } },
              { order: { orderNumber: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: LIST_INCLUDE,
      }),
      prisma.shipment.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeShipment)),
      total,
    });
  },

  async findById(shopId: string, id: string): Promise<ShipmentRow | null> {
    const shipment = await prisma.shipment.findFirst({
      where: { id, order: { shopId } },
      include: LIST_INCLUDE,
    });

    if (!shipment) return null;
    return serializeShipment(shipment);
  },

  async findByOrderId(orderId: string): Promise<ShipmentRow | null> {
    const shipment = await prisma.shipment.findUnique({
      where: { orderId },
      include: LIST_INCLUDE,
    });

    if (!shipment) return null;
    return serializeShipment(shipment);
  },

  async create(shopId: string, data: CreateShipmentInput): Promise<ShipmentRow> {
    // Verify order belongs to shop
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, shopId },
    });
    if (!order) throw new NotFoundError('Order not found');

    // Check for existing shipment
    const existing = await prisma.shipment.findUnique({
      where: { orderId: data.orderId },
    });
    if (existing) throw new ConflictError('Shipment already exists for this order');

    const shipment = await prisma.shipment.create({
      data: {
        orderId: data.orderId,
        provider: data.provider as 'KEX' | 'JNT' | 'MANUAL',
        trackingNumber: data.trackingNumber ?? null,
      },
      include: LIST_INCLUDE,
    });

    return serializeShipment(shipment);
  },

  async update(shopId: string, id: string, data: UpdateShipmentInput): Promise<ShipmentRow> {
    const existing = await prisma.shipment.findFirst({
      where: { id, order: { shopId } },
    });
    if (!existing) throw new NotFoundError('Shipment not found');

    const updateData: Record<string, unknown> = {};
    if (data.trackingNumber !== undefined) updateData.trackingNumber = data.trackingNumber;
    if (data.labelUrl !== undefined) updateData.labelUrl = data.labelUrl;

    const shipment = await prisma.shipment.update({
      where: { id },
      data: updateData,
      include: LIST_INCLUDE,
    });

    return serializeShipment(shipment);
  },

  async transition(shopId: string, id: string, newStatus: string): Promise<ShipmentRow> {
    const existing = await prisma.shipment.findFirst({
      where: { id, order: { shopId } },
    });
    if (!existing) throw new NotFoundError('Shipment not found');

    const allowed = VALID_SHIPMENT_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new ConflictError(
        `Cannot transition from ${existing.status} to ${newStatus}`
      );
    }

    const timestampData: Record<string, unknown> = {};
    if (newStatus === 'PICKED_UP') timestampData.shippedAt = new Date();
    if (newStatus === 'DELIVERED') timestampData.deliveredAt = new Date();

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        status: newStatus as 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED',
        ...timestampData,
      },
      include: LIST_INCLUDE,
    });

    return serializeShipment(shipment);
  },
});
