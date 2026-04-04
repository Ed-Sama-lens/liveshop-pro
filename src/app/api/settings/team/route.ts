import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { inviteMemberSchema } from '@/lib/validation/settings.schemas';
import { shopRepository } from '@/server/repositories/shop.repository';

// GET /api/settings/team — list team members
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (!['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const members = await shopRepository.getMembers(user.shopId);
    return NextResponse.json(ok(members));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}

// POST /api/settings/team — invite member
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }
    if (user.role !== 'OWNER') {
      return NextResponse.json(error('Only shop owner can invite members'), { status: 403 });
    }

    const body = await request.json();
    const result = inviteMemberSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(error(result.error.issues[0]?.message ?? 'Invalid input'), { status: 400 });
    }

    const member = await shopRepository.inviteMember(user.shopId, result.data);
    return NextResponse.json(ok(member), { status: 201 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
