import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { saleCustomerSearchQuerySchema } from '@/lib/validation/sale.schemas';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/sale/customers/search
 *
 * Minimal PII-safe customer lookup for the /sale Manual Create dialog
 * (Boss 2026-05-13 push-readiness harden). Replaces previous reuse of
 * `/api/customers?search=` which returned the full CustomerRow shape
 * including address / district / province / postalCode / labels /
 * notes / channel / facebookId / bannedReason / shopId / timestamps —
 * none of which the Manual Create dialog renders.
 *
 * Hard PII surface:
 * - `customerId` (= Customer.id; needed for booking creation)
 * - `name`
 * - `phone`        (admin-only context; nullable)
 * - `email`        (admin-only context; nullable)
 * - `isBanned`     (drives non-selectable state in UI)
 * - `orderCount`   (aggregate count; non-PII)
 *
 * NOT returned (vs admin /api/customers):
 * - address, district, province, postalCode
 * - labels, notes, channel
 * - facebookId (raw platform identifier)
 * - bannedReason (admin private context — UI does not show in picker)
 * - shopId (redundant — caller's shopId)
 * - createdAt / updatedAt
 *
 * Auth/RBAC (mirrors /sale page rule):
 * - requireAuth() → 401 on no session
 * - user.shopId required → 403
 * - Roles allowed: OWNER, MANAGER, CHAT_SUPPORT
 *   (CHAT_SUPPORT can READ /sale to assist customers per RBAC §9 in
 *   2026-04-06-sale-mvp-dissent.md.)
 * - WAREHOUSE, CUSTOMER denied
 *
 * Query params (zod via saleCustomerSearchQuerySchema):
 * - q       (REQUIRED, 2..128 chars; trimmed)
 * - limit   (int 1..20, default 20)
 *
 * Search:
 * - case-insensitive `contains` across name / phone / email (mirrors
 *   existing customerRepository.findMany OR-search behavior so admins
 *   see consistent results across the two routes).
 * - Shop-scoped: cross-shop probe returns empty list (NOT 404), so the
 *   route never leaks the existence of a customer in another shop.
 * - Banned customers ARE returned with isBanned=true so the dialog can
 *   render them disabled (audit M2). UI gates selection.
 *
 * Response (200):
 *   {
 *     success: true,
 *     data: { customers: [{ customerId, name, phone, email, isBanned, orderCount }] }
 *   }
 *
 * Errors:
 * - 401 unauthenticated
 * - 403 no shopId / wrong role
 * - 400 zod validation (missing q / q < 2 / limit > 20 / etc.)
 *
 * No mutation. No rate limit on GET. No customer-facing messages.
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
    const parsed = saleCustomerSearchQuerySchema.safeParse(rawParams);
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

    const { q, limit } = parsed.data;

    // Explicit select listing — every field on the wire is whitelisted
    // here. Adding a field elsewhere will NOT leak through this route.
    const rows = await prisma.customer.findMany({
      where: {
        shopId: user.shopId,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isBanned: true,
        _count: { select: { orders: true } },
      },
    });

    const customers = rows.map((r) =>
      Object.freeze({
        customerId: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        isBanned: r.isBanned,
        orderCount: r._count.orders,
      })
    );

    return NextResponse.json(
      Object.freeze({
        success: true,
        data: Object.freeze({ customers }),
      })
    );
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
