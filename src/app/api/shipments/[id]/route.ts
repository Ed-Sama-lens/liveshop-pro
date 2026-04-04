import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { updateShipmentSchema } from '@/lib/validation/shipping.schemas';
import { shipmentRepository } from '@/server/repositories/shipment.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/shipments/[id]
export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const { id } = await context.params;
    const shipment = await shipmentRepository.findById(user.shopId, id);
    if (!shipment) {
      return NextResponse.json(error('Shipment not found'), { status: 404 });
    }

    return NextResponse.json(ok(shipment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/shipments/[id]
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'WAREHOUSE'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, updateShipmentSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const shipment = await shipmentRepository.update(user.shopId, id, bodyResult.data);

    return NextResponse.json(ok(shipment));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
