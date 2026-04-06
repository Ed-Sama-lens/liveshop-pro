import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { storefrontRepository } from '@/server/repositories/storefront.repository';

// GET /api/storefront/[shopId]/products/[productId] — public product detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string; productId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId: identifier, productId } = await params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');
    const product = await storefrontRepository.findPublicById(shopId, productId);
    return NextResponse.json(ok(product));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
