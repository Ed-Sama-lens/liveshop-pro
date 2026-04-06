import { NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { NotFoundError, toAppError } from '@/lib/errors';
import { resolveShopId } from '@/lib/shop/resolve-shop';
import { prisma } from '@/lib/db/prisma';

// GET /api/storefront/[shopId]/payment-info — public payment info for checkout
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId: identifier } = await params;
    const shopId = await resolveShopId(identifier);
    if (!shopId) throw new NotFoundError('Shop not found');

    const branding = await prisma.shopBranding.findUnique({
      where: { shopId },
      select: {
        promptpayQrUrl: true,
        promptpayNote: true,
        bankName: true,
        bankAccount: true,
        bankAccountName: true,
        bankNote: true,
        shop: { select: { name: true } },
      },
    });

    if (!branding) {
      return NextResponse.json(ok({ shopName: null, methods: [] }));
    }

    const methods: { type: string; label: string; details: Record<string, string | null> }[] = [];

    if (branding.promptpayQrUrl) {
      methods.push({
        type: 'QR_CODE',
        label: 'PromptPay QR',
        details: {
          qrImageUrl: branding.promptpayQrUrl,
          note: branding.promptpayNote,
        },
      });
    }

    if (branding.bankAccount) {
      methods.push({
        type: 'TRANSFER',
        label: branding.bankName ?? 'Bank Transfer',
        details: {
          bankName: branding.bankName,
          accountNumber: branding.bankAccount,
          accountName: branding.bankAccountName,
          note: branding.bankNote,
        },
      });
    }

    return NextResponse.json(
      ok({
        shopName: branding.shop.name,
        methods,
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
