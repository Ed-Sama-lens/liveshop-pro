import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { addToCartSchema } from '@/lib/validation/storefront.schemas';
import { cartRepository } from '@/server/repositories/cart.repository';

function getCustomerId(request: NextRequest): string | null {
  return request.headers.get('x-customer-id');
}

// GET /api/storefront/[shopId]/cart — get cart
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId } = await params;
    const customerId = getCustomerId(request);
    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    const cart = await cartRepository.getOrCreate(shopId, customerId);
    return NextResponse.json(ok(cart));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/storefront/[shopId]/cart — add item to cart
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId } = await params;
    const customerId = getCustomerId(request);
    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    const body = await request.json();
    const result = addToCartSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const cart = await cartRepository.addItem(shopId, customerId, result.data);
    return NextResponse.json(ok(cart), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/storefront/[shopId]/cart — clear cart
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId } = await params;
    const customerId = getCustomerId(request);
    if (!customerId) {
      return NextResponse.json(error('Customer identification required'), { status: 401 });
    }

    await cartRepository.clear(shopId, customerId);
    return NextResponse.json(ok(null));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
