import { NextRequest, NextResponse } from 'next/server';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { storefrontCheckoutSchema } from '@/lib/validation/settings.schemas';
import { checkoutRepository } from '@/server/repositories/checkout.repository';

function getCustomerId(request: NextRequest): string | null {
  return request.headers.get('x-customer-id');
}

// POST /api/storefront/[shopId]/checkout — checkout cart → create order
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
    const result = storefrontCheckoutSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const order = await checkoutRepository.checkout(shopId, customerId, result.data);
    return NextResponse.json(ok(order), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
