import { prisma } from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/errors';
import type { CreateCustomerInput, UpdateCustomerInput, CustomerQuery } from '@/lib/validation/customer.schemas';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface CustomerRow {
  readonly id: string;
  readonly shopId: string;
  readonly facebookId: string | null;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly district: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly labels: string[];
  readonly shippingType: string | null;
  readonly notes: string | null;
  readonly isBanned: boolean;
  readonly bannedReason: string | null;
  readonly channel: string;
  readonly lifetimeValue: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly _count?: { readonly orders: number };
}

export interface CustomerOrderRow {
  readonly id: string;
  readonly orderNumber: string | null;
  readonly status: string;
  readonly total: string;
  readonly createdAt: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeCustomer(c: {
  id: string;
  shopId: string;
  facebookId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  labels: string[];
  shippingType: string | null;
  notes: string | null;
  isBanned: boolean;
  bannedReason: string | null;
  channel: string;
  lifetimeValue: { toString(): string };
  createdAt: Date;
  updatedAt: Date;
  _count?: { orders: number };
}): CustomerRow {
  const base = {
    id: c.id,
    shopId: c.shopId,
    facebookId: c.facebookId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    district: c.district,
    province: c.province,
    postalCode: c.postalCode,
    labels: c.labels,
    shippingType: c.shippingType,
    notes: c.notes,
    isBanned: c.isBanned,
    bannedReason: c.bannedReason,
    channel: c.channel,
    lifetimeValue: c.lifetimeValue.toString(),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };

  if (c._count !== undefined) {
    return Object.freeze({ ...base, _count: Object.freeze({ orders: c._count.orders }) });
  }

  return Object.freeze(base);
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const customerRepository = Object.freeze({
  async findMany(
    shopId: string,
    filters: Pick<CustomerQuery, 'search' | 'channel' | 'label' | 'isBanned'>,
    pagination: Pick<CustomerQuery, 'page' | 'limit'>
  ): Promise<{ items: readonly CustomerRow[]; total: number }> {
    const { search, channel, label, isBanned } = filters;
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      shopId,
      ...(isBanned !== undefined ? { isBanned } : {}),
      ...(channel ? { channel } : {}),
      ...(label ? { labels: { hasSome: [label] } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { orders: true } } },
      }),
      prisma.customer.count({ where }),
    ]);

    return Object.freeze({
      items: Object.freeze(items.map(serializeCustomer)),
      total,
    });
  },

  async findById(shopId: string, id: string): Promise<CustomerRow | null> {
    const customer = await prisma.customer.findFirst({
      where: { id, shopId },
      include: { _count: { select: { orders: true } } },
    });

    if (!customer) return null;
    return serializeCustomer(customer);
  },

  async create(shopId: string, data: CreateCustomerInput): Promise<CustomerRow> {
    const customer = await prisma.customer.create({
      data: {
        ...data,
        shopId,
        email: data.email || null,
      },
      include: { _count: { select: { orders: true } } },
    });

    return serializeCustomer(customer);
  },

  async update(shopId: string, id: string, data: UpdateCustomerInput): Promise<CustomerRow> {
    const existing = await prisma.customer.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Customer not found');
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...data,
        email: data.email !== undefined ? (data.email || null) : undefined,
      },
      include: { _count: { select: { orders: true } } },
    });

    return serializeCustomer(customer);
  },

  async remove(shopId: string, id: string): Promise<CustomerRow> {
    const existing = await prisma.customer.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Customer not found');
    }

    const customer = await prisma.customer.delete({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });

    return serializeCustomer(customer);
  },

  async ban(shopId: string, id: string, reason?: string): Promise<CustomerRow> {
    const existing = await prisma.customer.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Customer not found');
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { isBanned: true, bannedReason: reason ?? null },
      include: { _count: { select: { orders: true } } },
    });

    return serializeCustomer(customer);
  },

  async unban(shopId: string, id: string): Promise<CustomerRow> {
    const existing = await prisma.customer.findFirst({ where: { id, shopId } });
    if (!existing) {
      throw new NotFoundError('Customer not found');
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: { isBanned: false, bannedReason: null },
      include: { _count: { select: { orders: true } } },
    });

    return serializeCustomer(customer);
  },

  async findOrders(
    shopId: string,
    customerId: string,
    pagination: { page: number; limit: number }
  ): Promise<{ items: readonly CustomerOrderRow[]; total: number }> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where = { shopId, customerId };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    const items = orders.map((o) =>
      Object.freeze({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.totalAmount.toString(),
        createdAt: o.createdAt,
      })
    );

    return Object.freeze({ items: Object.freeze(items), total });
  },

  async recalculateLifetimeValue(shopId: string, customerId: string): Promise<CustomerRow> {
    const existing = await prisma.customer.findFirst({ where: { id: customerId, shopId } });
    if (!existing) {
      throw new NotFoundError('Customer not found');
    }

    const result = await prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        customerId,
        shopId,
        status: { notIn: ['CANCELLED'] },
      },
    });

    const ltv = result._sum.totalAmount ?? 0;

    const customer = await prisma.customer.update({
      where: { id: customerId },
      data: { lifetimeValue: ltv },
      include: { _count: { select: { orders: true } } },
    });

    return serializeCustomer(customer);
  },
});
