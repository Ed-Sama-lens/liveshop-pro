import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { brandingRepository } from '@/server/repositories/branding.repository';
import { prisma } from '@/lib/db/prisma';

// GET /api/storefront/[shopId]/branding — public shop branding
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId } = await params;
    const [branding, shop] = await Promise.all([
      brandingRepository.findByShopId(shopId),
      prisma.shop.findUnique({ where: { id: shopId }, select: { defaultCurrency: true } }),
    ]);

    const defaultCurrency = shop?.defaultCurrency ?? 'THB';

    if (!branding) {
      return NextResponse.json(ok({ shopId, shopName: null, logo: null, banner: null, primaryColor: null, accentColor: null, description: null, defaultCurrency }));
    }

    return NextResponse.json(ok({ ...branding, defaultCurrency }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
