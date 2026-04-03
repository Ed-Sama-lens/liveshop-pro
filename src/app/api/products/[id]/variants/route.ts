import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError, NotFoundError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { createVariantSchema } from '@/lib/validation/product.schemas';
import { productRepository } from '@/server/repositories/product.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/products/[id]/variants
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

    return NextResponse.json(ok(product.variants ?? []));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/products/[id]/variants — create variant (OWNER, MANAGER only)
export async function POST(
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

    const { id } = await context.params;

    // Verify product exists and belongs to the shop
    const product = await productRepository.findById(user.shopId, id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const bodyResult = await validateBody(request, createVariantSchema);
    if ('error' in bodyResult) return bodyResult.error;

    const variant = await productRepository.upsertVariant(id, bodyResult.data);

    return NextResponse.json(ok(variant), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
