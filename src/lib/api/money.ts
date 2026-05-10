/**
 * Money / decimal formatting helpers for API route responses.
 *
 * Repository methods return Prisma `Decimal.toString()` values which strip
 * trailing zeros (e.g. `'5.5'` instead of `'5.50'`). Route boundary
 * normalizes those to fixed-2-decimal form so customer/admin UI doesn't
 * have to guess.
 *
 * Scope: shared util for /api/sale/* GET routes. Mutation routes that
 * already inline a `formatMoney2` helper (Commit 2N) can adopt this
 * helper in a follow-up TEST-CLEANUP commit — out of scope for the
 * read-only API series.
 *
 * Currency is implicit MYR per liveshop-pro CLAUDE.md. Callers may
 * include `currency: 'MYR'` in response payloads where helpful.
 */

/**
 * Normalize a Decimal-as-string money value to fixed-2-decimal form.
 *
 * Accepts either a string (Prisma Decimal serialization) or a number.
 * Returns the original input when it is not a finite number; this is
 * defensive — the repository contract should always supply numeric
 * strings.
 *
 * Examples:
 * - '5'     → '5.00'
 * - '5.5'   → '5.50'
 * - '5.50'  → '5.50'
 * - '5.555' → '5.56' (Number.toFixed banker-style rounding)
 * - 12      → '12.00'
 * - 'abc'   → 'abc' (unchanged)
 */
export function formatMoney2(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toFixed(2);
}
