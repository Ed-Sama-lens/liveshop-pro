import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { validateBody } from '@/lib/validation/middleware';
import { categoryRepository } from '@/server/repositories/category.repository';

const updateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// PATCH /api/categories/[id] — update category name (OWNER, MANAGER only)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const bodyResult = await validateBody(request, updateCategorySchema);
    if ('error' in bodyResult) return bodyResult.error;

    const { id } = await context.params;
    const category = await categoryRepository.update(id, bodyResult.data.name);

    return NextResponse.json(ok(category));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/categories/[id] — delete category (OWNER, MANAGER only)
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), { status: 403 });
    }

    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const { id } = await context.params;
    await categoryRepository.remove(id);

    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
