import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { updateMemberRoleSchema } from '@/lib/validation/settings.schemas';
import { shopRepository } from '@/server/repositories/shop.repository';

// PATCH /api/settings/team/[memberId] — update member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (user.role !== 'OWNER') {
      return NextResponse.json(error('Only shop owner can modify roles'), { status: 403 });
    }

    const { memberId } = await params;
    const body = await request.json();
    const result = updateMemberRoleSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const member = await shopRepository.updateMemberRole(user.shopId, memberId, result.data);
    return NextResponse.json(ok(member));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// DELETE /api/settings/team/[memberId] — remove member
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (user.role !== 'OWNER') {
      return NextResponse.json(error('Only shop owner can remove members'), { status: 403 });
    }

    const { memberId } = await params;
    await shopRepository.removeMember(user.shopId, memberId);
    return NextResponse.json(ok(null));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
