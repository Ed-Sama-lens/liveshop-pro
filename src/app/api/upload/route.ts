import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { saveFile } from '@/lib/upload/storage';

// POST /api/upload — upload a file (product images, payment slips, etc.)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const category = formData.get('category');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(error('No file provided'), { status: 400 });
    }

    // Determine subfolder based on category
    const validCategories = ['products', 'slips', 'branding'] as const;
    const subfolder = validCategories.includes(category as typeof validCategories[number])
      ? (category as string)
      : 'general';

    const result = await saveFile(file, `${user.shopId}/${subfolder}`);
    return NextResponse.json(ok(result), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
