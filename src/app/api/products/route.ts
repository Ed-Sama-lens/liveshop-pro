import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, paginated, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody, validateQuery } from '@/lib/validation/middleware';
import { createProductSchema, productQuerySchema } from '@/lib/validation/product.schemas';
import { productRepository } from '@/server/repositories/product.repository';
import { logProductCreated } from '@/server/services/activity.service';

// GET /api/products — list products with pagination
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const queryResult = validateQuery(request, productQuerySchema);
    if ('error' in queryResult) return queryResult.error;

    const { page, limit, search, categoryId, isActive } = queryResult.data;

    const { items, total } = await productRepository.findMany(
      user.shopId,
      { search, categoryId, isActive },
      { page, limit }
    );

    return NextResponse.json(paginated(items, { total, page, limit }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/products — create product (OWNER, MANAGER only)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createProductSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const product = await productRepository.create(user.shopId, bodyResult.data);

    // Activity log (non-blocking)
    logProductCreated(user.shopId, user.id, user.name, product.name, product.id).catch(() => {});

    return NextResponse.json(ok(product), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
