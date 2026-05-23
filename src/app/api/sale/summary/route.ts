import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import {
  saleSummaryQuerySchema,
  saleSummaryRangeQuerySchema,
} from '@/lib/validation/sale.schemas';
import { saleSummaryRepository } from '@/server/repositories/sale-summary.repository';

/**
 * GET /api/sale/summary
 *
 * Two modes:
 *
 *   - Single day: `?saleDate=YYYY-MM-DD`           (Tier 3.9-G3, PR #70)
 *   - Range:      `?from=YYYY-MM-DD&to=YYYY-MM-DD` (Tier 3.9-G5)
 *
 * Auth: OWNER / MANAGER / CHAT_SUPPORT — same read tier as
 * `GET /api/sale/broadcast-products` and `GET /api/sale/bookings`.
 *
 * Mode selection:
 *   - `saleDate` only      → single day
 *   - `from + to`          → range
 *   - `saleDate + (from | to)` (any combination) → 400 (ambiguous input)
 *   - neither              → 400 (missing input)
 *
 * No mutation. No PII. No cross-shop leak (shopId scoped at repo
 * layer). Range cap enforced by `saleSummaryRangeQuerySchema`.
 *
 * Stock fields on range-mode `days[].items[].stock` are point-in-time
 * snapshots (current state), NOT historical state at each saleDate.
 * The `stockSnapshotNote` field in the response documents this.
 *
 * Errors:
 *   400 — params missing / malformed / ambiguous (saleDate + range) / range too large
 *   401 — unauth
 *   403 — wrong role or missing shopId
 *   500 — unexpected
 *
 * Design refs:
 *   - docs/superpowers/2026-05-23-sale-operations-summary-design.md
 *   - docs/superpowers/2026-05-23-sale-summary-date-range-plan.md
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
    const hasSaleDate = typeof rawParams.saleDate === 'string';
    const hasFrom = typeof rawParams.from === 'string';
    const hasTo = typeof rawParams.to === 'string';

    // Ambiguity check: saleDate may not coexist with from/to in any form.
    if (hasSaleDate && (hasFrom || hasTo)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Provide either `saleDate` (single day) or `from` + `to` (range); not both.',
          fields: { saleDate: ['ambiguous with from/to'] },
        },
        { status: 400 }
      );
    }

    // Range mode: both from + to present.
    if (hasFrom || hasTo) {
      const parsed = saleSummaryRangeQuerySchema.safeParse(rawParams);
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

      const result = await saleSummaryRepository.summarizeByRange({
        shopId: user.shopId,
        from: parsed.data.from,
        to: parsed.data.to,
      });
      return NextResponse.json(ok(result), { status: 200 });
    }

    // Single-day mode.
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
