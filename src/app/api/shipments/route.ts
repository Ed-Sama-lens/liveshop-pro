import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error, paginated } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { createShipmentSchema, shipmentQuerySchema } from '@/lib/validation/shipping.schemas';
import { shipmentRepository } from '@/server/repositories/shipment.repository';

// GET /api/shipments — list shipments
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = shipmentQuerySchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(error('Invalid query parameters'), { status: 400 });
    }

    const { page, limit, ...filters } = parsed.data;
    const result = await shipmentRepository.findMany(user.shopId, filters, { page, limit });

    return NextResponse.json(
      paginated(result.items, { total: result.total, page, limit })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/shipments — create shipment (OWNER, MANAGER, WAREHOUSE)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER', 'WAREHOUSE'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createShipmentSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const shipment = await shipmentRepository.create(user.shopId, bodyResult.data);

    return NextResponse.json(ok(shipment), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
