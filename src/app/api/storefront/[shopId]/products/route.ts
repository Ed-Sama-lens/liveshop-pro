import { NextRequest, NextResponse } from 'next/server';
import { ok, paginated, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { storefrontProductQuerySchema } from '@/lib/validation/storefront.schemas';
import { storefrontRepository } from '@/server/repositories/storefront.repository';

// GET /api/storefront/[shopId]/products — public product listing
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
): Promise<NextResponse> {
  try {
    const { shopId } = await params;
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const queryResult = storefrontProductQuerySchema.safeParse(searchParams);

    if (!queryResult.success) {
      return NextResponse.json(error('Invalid query parameters'), { status: 400 });
    }

    const query = queryResult.data;
    const { items, total } = await storefrontRepository.findPublic(shopId, query);

    return NextResponse.json(
      paginated(items, { total, page: query.page, limit: query.limit })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
