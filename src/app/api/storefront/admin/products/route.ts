import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { publishProductSchema } from '@/lib/validation/storefront.schemas';
import { storefrontRepository } from '@/server/repositories/storefront.repository';

// GET /api/storefront/admin/products — list all storefront products (admin)
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const items = await storefrontRepository.findAll(user.shopId);
    return NextResponse.json(ok(items));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/storefront/admin/products — publish product to storefront
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const result = publishProductSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const product = await storefrontRepository.publish(user.shopId, result.data);
    return NextResponse.json(ok(product), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
