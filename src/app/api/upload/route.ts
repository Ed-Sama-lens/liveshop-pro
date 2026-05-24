import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { saveFile } from '@/lib/upload/storage';
import {
  UPLOAD_VALID_CATEGORIES,
  isValidUploadCategory,
  assertSafeUploadPath,
  type UploadCategory,
} from '@/lib/upload/path-guard';

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

    // Strict category allowlist — reject invalid values with 400 so
    // path traversal / arbitrary subfolder names cannot reach
    // saveFile. Empty / missing category defaults to 'general' per
    // backward compat with existing admin clients.
    let subfolder: UploadCategory;
    if (category === null || category === undefined || category === '') {
      subfolder = 'general';
    } else if (isValidUploadCategory(category)) {
      subfolder = category;
    } else {
      return NextResponse.json(
        error(`Invalid category. Allowed: ${UPLOAD_VALID_CATEGORIES.join(', ')}`),
        { status: 400 }
      );
    }

    // Defense in depth: validate the composed subfolder path before
    // it reaches saveFile. `user.shopId` comes from session and is
    // already strictly-typed (CUID), but pinning here defends future
    // changes to session shape.
    const composedSubfolder = `${user.shopId}/${subfolder}`;
    assertSafeUploadPath(composedSubfolder);

    const result = await saveFile(file, composedSubfolder);
    return NextResponse.json(ok(result), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
