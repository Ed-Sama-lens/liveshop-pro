import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { categoryRepository } from '@/server/repositories/category.repository';

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

// GET /api/categories — list categories for current shop
export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    const categories = await categoryRepository.findByShop(user.shopId);

    return NextResponse.json(ok(categories));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/categories — create category (OWNER, MANAGER only)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, createCategorySchema);
    if ('error' in bodyResult) return bodyResult.error;

    const category = await categoryRepository.create(user.shopId, bodyResult.data.name);

    return NextResponse.json(ok(category), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
