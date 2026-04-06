import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { brandingRepository } from '@/server/repositories/branding.repository';

// GET /api/storefront/[shopId]/branding — public shop branding
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId: identifier } = await params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');

    const branding = await brandingRepository.findByShopId(shopId);
    const defaultCurrency = 'MYR'; // Shop default currency (Malaysian Ringgit)

    if (!branding) {
      return NextResponse.json(ok({ shopId, shopName: null, logo: null, banner: null, primaryColor: null, accentColor: null, description: null, defaultCurrency }));
    }

    return NextResponse.json(ok({ ...branding, defaultCurrency }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
