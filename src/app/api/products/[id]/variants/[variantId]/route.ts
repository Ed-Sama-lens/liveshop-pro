import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError, NotFoundError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { updateVariantSchema } from '@/lib/validation/product.schemas';
import { productRepository } from '@/server/repositories/product.repository';

interface RouteContext {
  params: Promise<{ id: string; variantId: string }>;
}

// PATCH /api/products/[id]/variants/[variantId] — update variant (OWNER, MANAGER only)
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

    const { id, variantId } = await context.params;

    // Verify product belongs to shop
    const product = await productRepository.findById(user.shopId, id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const bodyResult = await validateBody(request, updateVariantSchema);
    if ('error' in bodyResult) return bodyResult.error;

    // Build the upsert payload: need the current sku if not provided
    const existingVariant = product.variants?.find((v) => v.id === variantId);
    if (!existingVariant) {
      throw new NotFoundError('Variant not found');
    }

    // Merge with current values so upsert uses the existing sku
    const mergedData = {
      sku: bodyResult.data.sku ?? existingVariant.sku,
      attributes: bodyResult.data.attributes ?? existingVariant.attributes,
      price: bodyResult.data.price ?? existingVariant.price,
      costPrice: bodyResult.data.costPrice ?? (existingVariant.costPrice ?? undefined),
      quantity: bodyResult.data.quantity ?? existingVariant.quantity,
      lowStockAt: bodyResult.data.lowStockAt ?? (existingVariant.lowStockAt ?? undefined),
    };

    const variant = await productRepository.upsertVariant(id, mergedData);

    return NextResponse.json(ok(variant));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/products/[id]/variants/[variantId] — delete variant (OWNER, MANAGER only)
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

    const { id, variantId } = await context.params;

    // Verify product belongs to shop
    const product = await productRepository.findById(user.shopId, id);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    await productRepository.removeVariant(id, variantId);

    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
