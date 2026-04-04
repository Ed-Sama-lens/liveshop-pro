import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { exchangeRateRepository } from '@/server/repositories/exchange-rate.repository';

// GET /api/exchange-rates/convert?amount=100&from=THB&to=MYR — public conversion
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const amount = Number(request.nextUrl.searchParams.get('amount'));
    const from = request.nextUrl.searchParams.get('from')?.toUpperCase();
    const to = request.nextUrl.searchParams.get('to')?.toUpperCase();

    if (!amount || isNaN(amount) || !from || !to) {
      return NextResponse.json(error('Missing amount, from, or to parameters'), { status: 400 });
    }

    const result = await exchangeRateRepository.convert(amount, from, to);
    if (!result) {
      return NextResponse.json(error('Exchange rate not available for this pair'), { status: 404 });
    }

    return NextResponse.json(ok({
      from,
      to,
      amount,
      converted: result.converted,
      rate: result.rate,
    }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
