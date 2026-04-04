import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod/v4';
import { logOrderStatusChange } from '@/server/services/activity.service';

const bulkStatusSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(100),
  status: z.enum(['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
});

// PATCH /api/orders/bulk-status — update multiple orders at once
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const result = bulkStatusSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const { orderIds, status } = result.data;

    // Fetch all orders to verify ownership and get current status
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, shopId: user.shopId },
      select: { id: true, orderNumber: true, status: true },
    });

    const found = new Set(orders.map((o) => o.id));
    const notFound = orderIds.filter((id) => !found.has(id));

    const statusTimestamp: Record<string, string> = {
      CONFIRMED: 'confirmedAt',
      SHIPPED: 'shippedAt',
      DELIVERED: 'deliveredAt',
      CANCELLED: 'cancelledAt',
    };

    let updated = 0;
    const errors: { orderId: string; message: string }[] = [];

    for (const order of orders) {
      try {
        const tsField = statusTimestamp[status];
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status,
            ...(tsField ? { [tsField]: new Date() } : {}),
          },
        });

        // Create audit entry
        await prisma.orderAudit.create({
          data: {
            orderId: order.id,
            action: 'BULK_STATUS_CHANGE',
            fromStatus: order.status,
            toStatus: status,
            performedBy: user.id,
          },
        });

        // Activity log (fire-and-forget)
        logOrderStatusChange(
          user.shopId,
          user.id,
          user.name ?? 'Admin',
          order.orderNumber,
          order.id,
          order.status,
          status
        );

        updated++;
      } catch (err: unknown) {
        const appErr = toAppError(err);
        errors.push({ orderId: order.id, message: appErr.message });
      }
    }

    return NextResponse.json(
      ok({
        updated,
        notFound: notFound.length,
        errors,
        total: orderIds.length,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
