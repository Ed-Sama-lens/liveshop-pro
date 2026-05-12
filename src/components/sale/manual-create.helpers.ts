/**
 * Pure helpers for ManualCreateBookingDialog — extracted to a .ts
 * sibling so vitest can exercise the logic without pulling React,
 * sonner, lucide-react, or the 'use client' module. Same pattern as
 * booking-queue.helpers.ts (Commit 2O-a.1).
 *
 * No DOM. No fetch. No React. Safe to import from anywhere.
 */
import type { SaleBroadcastProductRow } from './SaleProductGridPlaceholder';

/**
 * Client-side product filter for the Manual Create picker.
 *
 * Returns rows whose `displayCode` starts with the typed prefix
 * (case-insensitive). Empty/whitespace prefix returns all rows. Result
 * is capped at 50 to keep render cost predictable — admin can refine
 * the prefix further.
 *
 * Trims surrounding whitespace before matching so a paste with leading
 * spaces still finds the row.
 */
export function filterProductsByCodePrefix(
  products: readonly SaleBroadcastProductRow[],
  prefix: string
): readonly SaleBroadcastProductRow[] {
  const trimmed = prefix.trim();
  if (trimmed.length === 0) {
    return products.slice(0, 50);
  }
  const needle = trimmed.toLowerCase();
  const matches = products.filter((p) =>
    p.displayCode.toLowerCase().startsWith(needle)
  );
  return matches.slice(0, 50);
}

/**
 * Compute display-only line total for the Manual Create summary block.
 *
 * Server is authoritative; this preview parses the Decimal-as-string
 * unitPrice via `Number()`. NaN/non-finite inputs return '0.00' so the
 * UI never renders "NaN" or "Infinity". Returns fixed-2-decimal string.
 */
export function previewManualLineTotal(
  unitPrice: string,
  quantity: number
): string {
  const n = Number(unitPrice);
  if (!Number.isFinite(n)) return '0.00';
  return (n * quantity).toFixed(2);
}

/**
 * Format a customer search hit's secondary line ("phone · email") for
 * the dropdown row. Both fields optional; '—' fallback when empty.
 */
export function formatCustomerSecondaryLine(hit: {
  phone: string | null;
  email: string | null;
}): string {
  const parts: string[] = [];
  if (hit.phone) parts.push(hit.phone);
  if (hit.email) parts.push(hit.email);
  if (parts.length === 0) return '—';
  return parts.join(' · ');
}
