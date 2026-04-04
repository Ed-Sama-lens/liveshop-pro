import { prisma } from '@/lib/db/prisma';
import { NotFoundError, ConflictError } from '@/lib/errors';
import type { PaymentQuery } from '@/lib/validation/payment.schemas';
import type { Prisma } from '@/generated/prisma';

// ─── Serialized Types ────────────────────────────────────────────────────────

export interface PaymentRow {
  readonly id: string;
  readonly orderId: string;
  readonly amount: string;
  readonly status: string;
  readonly method: string;
  readonly slipUrl: string | null;
  readonly ocrAmount: string | null;
  readonly ocrConfidence: number | null;
  readonly idempotencyKey: string | null;
  readonly verifiedAt: Date | null;
  readonly refundedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PaymentDetailRow extends PaymentRow {
  readonly order: {
    readonly id: string;
    readonly orderNumber: string;
    readonly totalAmount: string;
    readonly status: string;
    readonly customer: {
      readonly id: string;
      readonly name: string;
      readonly phone: string | null;
    };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializePayment(p: {
  id: string;
  orderId: string;
  amount: { toString(): string };
  status: string;
  method: string;
  slipUrl: string | null;
  ocrAmount: { toString(): string } | null;
  ocrConfidence: number | null;
  idempotencyKey: string | null;
  verifiedAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PaymentRow {
  return Object.freeze({
    id: p.id,
    orderId: p.orderId,
    amount: p.amount.toString(),
    status: p.status,
    method: p.method,
    slipUrl: p.slipUrl,
    ocrAmount: p.ocrAmount ? p.ocrAmount.toString() : null,
    ocrConfidence: p.ocrConfidence,
    idempotencyKey: p.idempotencyKey,
    verifiedAt: p.verifiedAt,
    refundedAt: p.refundedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  });
}

const DETAIL_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      status: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
  },
} as const;

function serializePaymentDetail(p: {
  id: string;
  orderId: string;
  amount: { toString(): string };
  status: string;
  method: string;
  slipUrl: string | null;
  ocrAmount: { toString(): string } | null;
  ocrConfidence: number | null;
  idempotencyKey: string | null;
  verifiedAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order: {
    id: string;
    orderNumber: string;
    totalAmount: { toString(): string };
    status: string;
    customer: { id: string; name: string; phone: string | null };
  };
}): PaymentDetailRow {
  return Object.freeze({
    ...serializePayment(p),
    order: Object.freeze({
      id: p.order.id,
      orderNumber: p.order.orderNumber,
      totalAmount: p.order.totalAmount.toString(),
      status: p.order.status,
      customer: Object.freeze({
        id: p.order.customer.id,
        name: p.order.customer.name,
        phone: p.order.customer.phone,
      }),
    }),
  });
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const paymentRepository = Object.freeze({
  async findByOrderId(orderId: string): Promise<PaymentRow | null> {
    const payment = await prisma.payment.findUnique({
      where: { orderId },
    });
    if (!payment) return null;
    return serializePayment(payment);
  },

  async create(
    orderId: string,
    data: { method: string; amount: string; idempotencyKey?: string }
  ): Promise<PaymentRow> {
    if (data.idempotencyKey) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return serializePayment(existing);
    }

    const existingPayment = await prisma.payment.findUnique({
      where: { orderId },
    });
    if (existingPayment) {
      throw new ConflictError('Payment already exists for this order');
    }

    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: parseFloat(data.amount),
        method: data.method as 'TRANSFER' | 'QR_CODE' | 'COD',
        idempotencyKey: data.idempotencyKey,
      },
    });

    return serializePayment(payment);
  },

  async uploadSlip(orderId: string, slipUrl: string): Promise<PaymentRow> {
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundError('Payment not found');

    const updated = await prisma.payment.update({
      where: { orderId },
      data: { slipUrl },
    });
    return serializePayment(updated);
  },

  // ─── Admin Methods ──────────────────────────────────────────────────────

  async findManyAdmin(shopId: string, query: PaymentQuery) {
    const where: Prisma.PaymentWhereInput = {
      order: { shopId },
    };

    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: DETAIL_INCLUDE,
      }),
      prisma.payment.count({ where }),
    ]);

    return Object.freeze({
      data: Object.freeze(payments.map(serializePaymentDetail)),
      total,
    });
  },

  async findByIdAdmin(shopId: string, id: string): Promise<PaymentDetailRow | null> {
    const payment = await prisma.payment.findFirst({
      where: { id, order: { shopId } },
      include: DETAIL_INCLUDE,
    });
    if (!payment) return null;
    return serializePaymentDetail(payment);
  },

  async verifyAdmin(shopId: string, id: string, performedBy: string): Promise<PaymentDetailRow> {
    const existing = await prisma.payment.findFirst({
      where: { id, order: { shopId }, status: 'PENDING' },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!existing) throw new NotFoundError('Payment not found or already processed');

    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: { status: 'VERIFIED', verifiedAt: new Date() },
        include: DETAIL_INCLUDE,
      });

      // Auto-confirm order if still RESERVED
      if (existing.order.status === 'RESERVED') {
        await tx.order.update({
          where: { id: existing.orderId },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        });
        await tx.orderAudit.create({
          data: {
            orderId: existing.orderId,
            action: 'STATUS_CHANGE',
            fromStatus: 'RESERVED',
            toStatus: 'CONFIRMED',
            metadata: { reason: 'Payment verified', performedBy },
          },
        });
      }

      return updated;
    });

    return serializePaymentDetail(payment);
  },

  async rejectAdmin(shopId: string, id: string, performedBy: string): Promise<PaymentDetailRow> {
    const existing = await prisma.payment.findFirst({
      where: { id, order: { shopId }, status: 'PENDING' },
    });
    if (!existing) throw new NotFoundError('Payment not found or already processed');

    const payment = await prisma.payment.update({
      where: { id },
      data: { status: 'FAILED' },
      include: DETAIL_INCLUDE,
    });

    await prisma.orderAudit.create({
      data: {
        orderId: existing.orderId,
        action: 'PAYMENT_REJECTED',
        metadata: { reason: 'Rejected by admin', performedBy },
      },
    });

    return serializePaymentDetail(payment);
  },

  async countPending(shopId: string): Promise<number> {
    return prisma.payment.count({
      where: { order: { shopId }, status: 'PENDING' },
    });
  },
});
