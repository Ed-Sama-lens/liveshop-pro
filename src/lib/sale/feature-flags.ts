/**
 * Runtime feature flags for the omnichannel booking migration (PR 2).
 *
 * Why a separate module vs reading `env` directly:
 * - `src/lib/env.ts` validates + freezes at import time. Vercel reads
 *   env at boot; flag values are constant for the lifetime of the
 *   process.
 * - Tests need to flip flags between cases without re-importing the
 *   whole env module. Reading `process.env` at call-time via the
 *   helpers below lets `vi.stubEnv()` work per-test.
 * - Production code paths call the helpers; behavior matches the
 *   validated env defaults when nothing is overridden.
 *
 * Boss/ChatGPT 2026-05-13 Q-13 — three separate flags, all default
 * false. Staged rollout per migration plan D1-D6.
 *
 * NEVER call these helpers to short-circuit security checks or
 * tenant guards. They gate behavior, not authorization.
 */

function readBool(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined) return false;
  return raw === 'true';
}

/**
 * Allows creation of evergreen (non-live) BroadcastProduct rows.
 * When false, POST routes that would create a row with
 * `liveSessionId: null` MUST reject the request even if the schema
 * permits it.
 */
export function allowEvergreenBroadcastProduct(): boolean {
  return readBool('ALLOW_EVERGREEN_BROADCAST_PRODUCT');
}

/**
 * Allows creation of non-live bookings (Booking.liveSessionId null).
 * When false, POST /api/sale/bookings MUST require `liveSessionId`
 * even after the schema makes the column nullable.
 */
export function allowNonLiveBooking(): boolean {
  return readBool('ALLOW_NON_LIVE_BOOKING');
}

/**
 * Allows the bookingIds-only conversion path for
 * POST /api/sale/orders/from-bookings (idempotency key v2 namespace).
 * When false, the legacy (liveSessionId + customerId + bookingIds[])
 * path is the only accepted shape.
 */
export function allowBookingIdsOnlyConversion(): boolean {
  return readBool('ALLOW_BOOKINGIDS_ONLY_CONVERSION');
}
