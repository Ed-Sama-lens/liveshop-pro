import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { shopBrandingSchema } from '@/lib/validation/storefront.schemas';
import { brandingRepository } from '@/server/repositories/branding.repository';
import { logSettingsUpdated } from '@/server/services/activity.service';

// GET /api/storefront/admin/branding — get shop branding (admin)
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const branding = await brandingRepository.findByShopId(user.shopId);
    return NextResponse.json(ok(branding));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// PUT /api/storefront/admin/branding — upsert shop branding
export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const result = shopBrandingSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const branding = await brandingRepository.upsert(user.shopId, result.data);

    // Activity log (non-blocking)
    logSettingsUpdated(user.shopId, user.id, user.name, 'Branding').catch(() => {});

    return NextResponse.json(ok(branding));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
