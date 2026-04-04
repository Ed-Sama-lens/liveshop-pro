import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { storefrontRepository } from '@/server/repositories/storefront.repository';

// GET /api/storefront/[shopId]/products/[productId] — public product detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string; productId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId, productId } = await params;
    const product = await storefrontRepository.findPublicById(shopId, productId);
    return NextResponse.json(ok(product));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
