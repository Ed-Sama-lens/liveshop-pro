import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { exchangeRateRepository } from '@/server/repositories/exchange-rate.repository';
import { SUPPORTED_CURRENCIES } from '@/lib/currency/constants';
import { z } from 'zod';

const upsertRateSchema = z.object({
  baseCurrency: z.enum(['THB', 'MYR', 'SGD']),
  targetCurrency: z.enum(['THB', 'MYR', 'SGD']),
  rate: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET /api/exchange-rates — get latest rates or rates by date
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }

    const date = request.nextUrl.searchParams.get('date');
    const rates = date
      ? await exchangeRateRepository.getRatesByDate(date)
      : await exchangeRateRepository.getLatestRates();

    return NextResponse.json(ok({
      rates,
      currencies: SUPPORTED_CURRENCIES,
    }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/exchange-rates — upsert a rate (admin)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const result = upsertRateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    if (result.data.baseCurrency === result.data.targetCurrency) {
      return NextResponse.json(error('Base and target currency must be different'), { status: 400 });
    }

    const rate = await exchangeRateRepository.upsertRate({
      ...result.data,
      source: 'manual',
    });

    return NextResponse.json(ok(rate), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
