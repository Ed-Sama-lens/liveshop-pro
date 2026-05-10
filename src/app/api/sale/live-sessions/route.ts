import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { saleLiveSessionsQuerySchema } from '@/lib/validation/sale.schemas';
import { liveRepository } from '@/server/repositories/live.repository';

/**
 * GET /api/sale/live-sessions
 *
 * Read-only list endpoint for the /sale workspace session selector
 * (Commit 2P). Returns live sessions belonging to the authenticated
 * admin's shop. Reuses the existing `liveRepository.findMany` from
 * the general `/api/live` admin track so this route does not
 * duplicate Prisma logic.
 *
 * Why a sale-namespaced route despite /api/live existing
 * - /api/live is the general live-session admin CRUD surface.
 * - /api/sale/live-sessions is the read surface for the /sale workflow
 *   shell. Future Commit 2S wires this directly from server components,
 *   and ChatGPT review (CC-2) prefers REST-canonical splits per workflow.
 * - No behavior overlap risk: both routes use the same repository so the
 *   underlying shop-scoped read is identical.
 *
 * Auth/RBAC (mirrors /sale page middleware whitelist + ChatGPT scope)
 * - requireAuth() → 401 on no session
 * - user.shopId required → 403 "No shop associated"
 * - Roles allowed: OWNER, MANAGER, CHAT_SUPPORT
 *   - CHAT_SUPPORT can READ /sale to assist customers (see RBAC §9 in
 *     2026-04-06-sale-mvp-dissent.md). All mutation routes still deny
 *     CHAT_SUPPORT.
 *   - WAREHOUSE denied to match /sale page permissions.ts rule.
 *
 * Query params (zod via saleLiveSessionsQuerySchema)
 * - page    (int ≥ 1, default 1)
 * - limit   (int 1..100, default 20)
 * - status? (one of 'SCHEDULED' | 'LIVE' | 'ENDED')
 *
 * Response (200)
 *   {
 *     success: true,
 *     data: { sessions: [{ id, title, status, scheduledAt, startedAt,
 *                          endedAt, viewerCount, orderCount,
 *                          totalRevenue, createdAt }] },
 *     meta: { total, page, limit, totalPages }
 *   }
 *
 * Notes
 * - `productCount` / `bookingCount` deliberately omitted per Boss
 *   overnight spec — adding them now would require N+1 queries or a
 *   separate aggregation pass. Can be added in a follow-up commit if
 *   /sale UI ends up needing the totals.
 * - No rate limit applied on GET (matches /api/live read pattern).
 *   Existing IP rate limit on POST mutations stays in place.
 * - No customer-facing message generation. No platform integration.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    if (!user.shopId) {
      return NextResponse.json(error('No shop associated with your account'), {
        status: 403,
      });
    }

    if (!['OWNER', 'MANAGER', 'CHAT_SUPPORT'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = saleLiveSessionsQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return NextResponse.json(
        { success: false, error: 'Validation failed', fields: fieldErrors },
        { status: 400 }
      );
    }

    const { page, limit, status } = parsed.data;
    const result = await liveRepository.findMany(
      user.shopId,
      { status },
      { page, limit }
    );

    const totalPages = Math.ceil(result.total / limit);

    return NextResponse.json(
      Object.freeze({
        success: true,
        data: { sessions: result.items },
        meta: Object.freeze({
          total: result.total,
          page,
          limit,
          totalPages,
        }),
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
