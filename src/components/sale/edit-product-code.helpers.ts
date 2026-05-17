/**
 * Pure helpers for EditProductCodeDialog (Tier 3.6).
 *
 * `buildPatchBody` decides which fields to send to the
 * PATCH /api/sale/broadcast-products/[id] route based on what the
 * admin actually changed in the dialog. Empty patch is intentionally
 * NOT sent — the backend rejects it with ValidationError.
 *
 * Pure JS, no React, no fetch. Extracted from EditProductCodeDialog
 * so unit tests can cover the diff logic without mounting the dialog.
 */

export interface BuildPatchInput {
  readonly currentPriceOverrideField: string;
  readonly currentIsPinnedField: boolean;
  readonly initialPriceOverride: string;
  readonly initialIsPinned: boolean;
}

export interface PatchBody {
  readonly priceOverride?: string | null;
  readonly isPinned?: boolean;
}

/**
 * Build a minimal PATCH body containing only fields the admin changed.
 * Returns empty object if nothing changed.
 *
 * priceOverride rules:
 * - field is blank (trimmed) AND initial was non-blank → send `null`
 *   (admin cleared an existing override — backend drops it)
 * - field is non-blank AND differs from initial → send trimmed string
 * - otherwise omit
 *
 * isPinned rule:
 * - differs from initial → send boolean
 * - otherwise omit
 */
export function buildPatchBody(input: BuildPatchInput): PatchBody {
  const {
    currentPriceOverrideField,
    currentIsPinnedField,
    initialPriceOverride,
    initialIsPinned,
  } = input;
  const body: { priceOverride?: string | null; isPinned?: boolean } = {};
  const trimmed = currentPriceOverrideField.trim();
  if (trimmed === '' && initialPriceOverride !== '') {
    body.priceOverride = null;
  } else if (trimmed !== '' && trimmed !== initialPriceOverride) {
    body.priceOverride = trimmed;
  }
  if (currentIsPinnedField !== initialIsPinned) {
    body.isPinned = currentIsPinnedField;
  }
  return Object.freeze(body);
}

/**
 * Decide whether the Save button should be disabled.
 */
export function hasNoChanges(input: BuildPatchInput): boolean {
  return Object.keys(buildPatchBody(input)).length === 0;
}
