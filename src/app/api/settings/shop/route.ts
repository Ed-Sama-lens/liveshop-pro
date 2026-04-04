import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { updateShopSchema } from '@/lib/validation/settings.schemas';
import { shopRepository } from '@/server/repositories/shop.repository';

// GET /api/settings/shop — get shop details
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const shop = await shopRepository.findById(user.shopId);
    return NextResponse.json(ok(shop));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/settings/shop — update shop details
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (user.role !== 'OWNER') {
      return NextResponse.json(error('Only shop owner can modify settings'), { status: 403 });
    }

    const body = await request.json();
    const result = updateShopSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const shop = await shopRepository.update(user.shopId, result.data);
    return NextResponse.json(ok(shop));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
