import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { saleSummaryQuerySchema } from '@/lib/validation/sale.schemas';
import { saleSummaryRepository } from '@/server/repositories/sale-summary.repository';

/**
 * Tier 3.9-G3 — GET /api/sale/summary?saleDate=YYYY-MM-DD
 *
 * Read-only daily summary aggregate for the `/sale` admin. Returns per
 * BroadcastProduct on the selected saleDate: stock + reservation +
 * per-status booking counts + order count + ordered quantity + gross
 * RM total, plus a `totals` block.
 *
 * Auth: OWNER / MANAGER / CHAT_SUPPORT — same read tier as
 * `GET /api/sale/broadcast-products` and `GET /api/sale/bookings`.
 *
 * No mutation. No PII. No cross-shop leak (shopId scoped at the
 * repository layer).
 *
 * Errors:
 *   400 — saleDate missing or malformed YYYY-MM-DD
 *   401 — unauth
 *   403 — wrong role or missing shopId
 *   500 — unexpected
 *
 * Design ref: docs/superpowers/2026-05-23-sale-operations-summary-design.md
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
    const parsed = saleSummaryQuerySchema.safeParse(rawParams);
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

    const result = await saleSummaryRepository.summarizeByDate({
      shopId: user.shopId,
      saleDate: parsed.data.saleDate,
    });

    return NextResponse.json(ok(result), { status: 200 });
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
