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

/**
 * V Rich Stage 3.10-C WIRE-1 — accepts an extended truthy set
 * (`'true'` OR `'1'`). Used by NEXT_PUBLIC_* flags where Boss may
 * flip via Vercel Dashboard. Existing `readBool` strict-mode is
 * unchanged for legacy server-only flags.
 *
 * Treats as TRUE: `'true'`, `'1'` (case-sensitive).
 * Treats as FALSE: unset, empty string, `'false'`, `'0'`, any other
 * value. Never throws.
 */
function readBoolExtended(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return false;
  return raw === 'true' || raw === '1';
}

/**
 * V Rich Stage 3.10-C WIRE-1 — sale layout v2 (V Rich board)
 * feature flag.
 *
 * When ENABLED (env `NEXT_PUBLIC_SALE_LAYOUT_V2` is `'true'` or
 * `'1'`):
 *   - `/sale` workspace MAY render the V Rich board ALONGSIDE the
 *     existing Product Codes panel (WIRE-3 will consume this).
 *
 * When DISABLED (env unset, empty, `'false'`, `'0'`, or unknown):
 *   - Zero UI change. Existing Product Codes panel is the only view.
 *
 * Defaults to FALSE when unset → production behavior unchanged after
 * WIRE-1 ships. Boss flips to `'true'` in Vercel only after WIRE-2 +
 * WIRE-3 land + Boss is ready to preview the board.
 *
 * The `NEXT_PUBLIC_` prefix means this value is exposed to the
 * browser bundle at build time. Do NOT use it to gate authorization
 * or secret data — it gates UI render only.
 *
 * Read at call-time (not module-init) so `vi.stubEnv` works in tests.
 *
 * Per design audit:
 * - docs/superpowers/2026-05-25-v-rich-stage-3-10-c-readiness-audit.md
 * - docs/superpowers/2026-05-25-v-rich-3-10-c-boss-decision-packet.md
 */
export function isSaleLayoutV2Enabled(): boolean {
  return readBoolExtended('NEXT_PUBLIC_SALE_LAYOUT_V2');
}
