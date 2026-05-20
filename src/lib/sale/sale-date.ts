/**
 * Sale Date helpers — Tier 3.9 PR-B.
 *
 * Computes the calendar date in a given IANA timezone, formats and
 * parses YYYY-MM-DD strings, and resolves "today in shop timezone"
 * deterministically on the server.
 *
 * No date library installed (no date-fns / dayjs / luxon). Uses
 * native `Intl.DateTimeFormat` which is locale-aware and timezone-aware
 * since Node 20. Returns plain `Date` (UTC midnight of the target day)
 * for direct Prisma `@db.Date` writes.
 *
 * Design contract:
 *   docs/superpowers/2026-05-21-tier-3-9-sale-date-context-addendum.md
 *
 * Default shop timezone: Asia/Kuala_Lumpur (per D-Date-2 verdict).
 */

export const DEFAULT_SHOP_TIMEZONE = 'Asia/Kuala_Lumpur' as const;

/**
 * Format a Date as YYYY-MM-DD in the given timezone.
 *
 * Uses `Intl.DateTimeFormat` `en-CA` locale which renders ISO-style
 * `YYYY-MM-DD` by default. Avoids constructing manual zero-pad logic.
 *
 * @param date - any Date instance
 * @param timezone - IANA timezone string (e.g. 'Asia/Kuala_Lumpur')
 * @returns ISO-style date string (e.g. '2026-05-21')
 */
export function formatSaleDate(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Get today's sale date in shop timezone as YYYY-MM-DD.
 *
 * @param timezone - IANA timezone string
 * @returns ISO-style date string
 */
export function todaySaleDate(timezone: string = DEFAULT_SHOP_TIMEZONE): string {
  return formatSaleDate(new Date(), timezone);
}

/**
 * Parse YYYY-MM-DD string to a Date at UTC midnight of that calendar
 * day. Suitable for Prisma `@db.Date` writes since Postgres DATE stores
 * just the date component.
 *
 * Validates the input is strict ISO date format. Throws on invalid.
 *
 * @param iso - YYYY-MM-DD string
 * @returns Date at UTC midnight of the target day
 * @throws Error if input is not a valid YYYY-MM-DD string
 */
export function parseSaleDate(iso: string): Date {
  if (typeof iso !== 'string') {
    throw new Error(`saleDate must be a string, got ${typeof iso}`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new Error(`saleDate must match YYYY-MM-DD, got ${iso}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) {
    throw new Error(`saleDate month out of range: ${iso}`);
  }
  if (day < 1 || day > 31) {
    throw new Error(`saleDate day out of range: ${iso}`);
  }
  // Use Date.UTC to avoid local-timezone interpretation. Postgres DATE
  // column ignores time component but Prisma passes a JS Date through;
  // anchoring at UTC midnight is the canonical representation.
  const utcMs = Date.UTC(year, month - 1, day);
  const date = new Date(utcMs);
  // Catch invalid combos like Feb 30
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`saleDate is not a valid calendar date: ${iso}`);
  }
  return date;
}

/**
 * Validate that a string is YYYY-MM-DD without throwing — for Zod
 * superRefine / safeParse use.
 *
 * @param iso - candidate string
 * @returns true if iso parses successfully
 */
export function isValidSaleDate(iso: string): boolean {
  try {
    parseSaleDate(iso);
    return true;
  } catch {
    return false;
  }
}
