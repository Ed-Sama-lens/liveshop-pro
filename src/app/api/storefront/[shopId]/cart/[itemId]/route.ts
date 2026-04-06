import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { updateCartItemSchema } from '@/lib/validation/storefront.schemas';
import { cartRepository } from '@/server/repositories/cart.repository';

function getCustomerId(request: NextRequest): string | null {
  return request.headers.get('x-customer-id');
}

// PATCH /api/storefront/[shopId]/cart/[itemId] — update cart item quantity
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string; itemId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId: identifier, itemId } = await params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');
    const customerId = getCustomerId(request);
    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    const body = await request.json();
    const result = updateCartItemSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const cart = await cartRepository.updateItem(itemId, customerId, result.data);
    return NextResponse.json(ok(cart));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/storefront/[shopId]/cart/[itemId] — remove cart item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string; itemId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId: identifier, itemId } = await params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');
    const customerId = getCustomerId(request);
    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    const cart = await cartRepository.removeItem(itemId, customerId);
    return NextResponse.json(ok(cart));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
