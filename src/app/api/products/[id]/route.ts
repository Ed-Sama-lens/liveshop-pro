import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { updateProductSchema } from '@/lib/validation/product.schemas';
import { productRepository } from '@/server/repositories/product.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/products/[id]
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const { id } = await context.params;
    const product = await productRepository.findById(user.shopId, id);

    if (!product) {
      return NextResponse.json(error('Product not found'), { status: 404 });
    }

    return NextResponse.json(ok(product));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PATCH /api/products/[id] — update product (OWNER, MANAGER only)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, updateProductSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const product = await productRepository.update(user.shopId, id, bodyResult.data);

    return NextResponse.json(ok(product));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/products/[id] — soft delete (OWNER, MANAGER only)
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const { id } = await context.params;
    const product = await productRepository.remove(user.shopId, id);

    return NextResponse.json(ok(product));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
