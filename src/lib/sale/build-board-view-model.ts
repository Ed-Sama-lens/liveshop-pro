/**
 * V Rich Stage 3.10-B — Read-only board data mapper.
 *
 * Pure adapter that composes existing `SaleBroadcastProductRow` rows
 * + `SaleBookingRow` rows + (optional) selection state into a single
 * `BoardViewModel` ready for a future read-only board UI. Composes
 * existing helpers (`sortDisplayCodes`, `pillColorState`,
 * `slotsRemaining`, `buildSlots`, `formatBoardHeader`,
 * `formatStockBadge`, `formatPillLabel`) so this mapper stays a thin
 * adapter — no duplicated stock math, no duplicated sort logic.
 *
 * No React. No fetch. No Prisma. No mutation. Caller-supplied
 * timestamps + ids; mapper does not touch the network or the DB.
 *
 * Per design:
 * - `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md`
 * - `docs/superpowers/2026-05-24-v-rich-read-only-implementation-plan.md`
 *
 * Supports:
 * - saleDate-first workflow (BroadcastProduct rows already filtered
 *   by saleDate at the API layer; mapper is agnostic to date).
 * - Evergreen / off-live sale context (rows without `liveSessionId`)
 *   render the same way as live-bound rows.
 * - Empty stock (totalQuantity === 0) → 0 slots, all-empty drawer.
 * - Over-allocation (active bookings > stock) → overflow array
 *   surfaced so future UI can flag integrity warning.
 * - Optional selection of a single `selectedBroadcastProductId` to
 *   surface `selected` pill color state.
 *
 * Output is admin-friendly:
 * - MYR (RM) formatted via `formatCurrency` (CLAUDE.md identity).
 * - Display codes sorted in V Rich natural order (CM1, CM2, CM10).
 * - Terminal bookings (CANCELLED / EXPIRED / CONVERTED_TO_ORDER)
 *   filtered from slot list per existing `buildSlots` semantics.
 */

import { formatCurrency } from '@/lib/currency/constants';
import {
  buildSlots,
  formatBoardHeader,
  pillColorState,
  slotsRemaining,
  sortDisplayCodes,
  type PillBookingStatus,
  type PillColorState,
  type Slot,
  type SlotInput,
} from './board-helpers';
import {
  formatPillLabel,
  formatStockBadge,
} from './board-display';

// ─── Input row shapes (mirror existing API/UI types) ─────────────────────────

/**
 * Mirror of `SaleBroadcastProductRow` from
 * `src/components/sale/SaleProductGridPlaceholder.tsx`. Duplicated as
 * an internal type to keep this mapper independent of the UI layer
 * (mapper lives in `lib/`, UI types live in `components/`).
 */
export interface BoardBroadcastProductInput {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly productId: string;
  readonly productName: string;
  readonly variantId: string;
  readonly variantName: string;
  readonly unitPrice: string;
  /**
   * Optional override; when present takes precedence over `unitPrice`
   * for display + pricing. Matches existing UI behavior.
   */
  readonly priceOverride?: string | null;
  readonly stockQuantity: number;
  readonly reservedQty: number;
  readonly availableQty: number;
  /**
   * Tier 3.9-B-Fix-2 — null = evergreen (no liveSession parent).
   * Mapper treats both null and non-null identically; this field is
   * carried through so future UI can render an "off-live" badge.
   */
  readonly liveSessionId?: string | null;
  /**
   * Tier 3.9 — sale date (YYYY-MM-DD). Optional because pre-3.9
   * rows omit it. Carried through unmodified.
   */
  readonly saleDate?: string | null;
  /**
   * `lowStockAt` threshold used by `pillColorState` to decide
   * `low-stock`. May be absent on older rows; mapper treats absent
   * as `null`.
   */
  readonly lowStockAt?: number | null;
}

/**
 * Subset of `SaleBookingRow` from
 * `src/components/sale/SaleBookingQueuePlaceholder.tsx`. Only the
 * fields the board needs are required; mapper accepts the wider row
 * type via structural compatibility.
 */
export interface BoardBookingInput {
  readonly bookingId: string;
  readonly broadcastProductId: string;
  readonly status: PillBookingStatus;
  readonly customerId: string;
  readonly customerName: string;
  readonly quantity: number;
  /** ISO 8601 string (matches existing `SaleBookingRow.createdAt`). */
  readonly createdAt: string;
}

// ─── Output view model ───────────────────────────────────────────────────────

/**
 * Per-pill projection. Combines BroadcastProduct row + derived
 * presentation strings + slot count. Ready to render in a pill-list
 * UI without further computation.
 */
export interface BoardPillViewModel {
  readonly broadcastProductId: string;
  readonly displayCode: string;
  readonly productName: string;
  readonly unitPriceMyr: string;
  /** `Math.max(0, stockQuantity - reservedQty)` via `slotsRemaining`. */
  readonly slotsRemaining: number;
  readonly totalSlots: number;
  readonly reservedSlots: number;
  readonly availableSlots: number;
  readonly pillColor: PillColorState;
  readonly pillLabel: string;
  readonly stockBadge: string;
  readonly headerLabel: string;
  /** Carried through from input; null = evergreen. */
  readonly liveSessionId: string | null;
  /** Carried through from input; YYYY-MM-DD or null. */
  readonly saleDate: string | null;
}

/**
 * Per-pill slot drawer projection. Built from `buildSlots` so callers
 * never re-derive slot logic. Includes `overflow` for integrity
 * warning when active bookings exceed stock count.
 */
export interface BoardSlotDrawerViewModel {
  readonly broadcastProductId: string;
  readonly slots: readonly Slot[];
  readonly overflow: readonly SlotInput[];
  readonly hasOverflow: boolean;
}

/**
 * Top-level read-only board view model.
 */
export interface BoardViewModel {
  /** Pills in V Rich natural sort order (CM1 < CM2 < CM10). */
  readonly pills: readonly BoardPillViewModel[];
  /**
   * Keyed by broadcastProductId. Drawer state per pill; UI decides
   * which drawer to expand based on `selectedBroadcastProductId`.
   */
  readonly drawers: Readonly<Record<string, BoardSlotDrawerViewModel>>;
  /** Bookings whose broadcastProductId did NOT match any BP row. */
  readonly orphanBookings: readonly BoardBookingInput[];
  /** Currently expanded pill, or null when no pill selected. */
  readonly selectedBroadcastProductId: string | null;
}

// ─── Mapper input ────────────────────────────────────────────────────────────

export interface BuildBoardViewModelInput {
  readonly broadcastProducts: readonly BoardBroadcastProductInput[];
  readonly bookings: readonly BoardBookingInput[];
  /**
   * Optional — when set, the matching pill renders with
   * `pillColor === 'selected'`. When null/undefined no pill is
   * highlighted.
   */
  readonly selectedBroadcastProductId?: string | null;
  /**
   * Currency for `unitPriceMyr` formatting. Defaults to `'MYR'` per
   * liveshop-pro identity (CLAUDE.md). Tests may override.
   */
  readonly currency?: 'MYR' | 'THB' | 'SGD';
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Build the read-only board view model. Deterministic, side-effect
 * free, idempotent.
 *
 * Throws nothing; safe to call with empty arrays / unknown shapes.
 * Returns frozen output to defend against accidental caller mutation.
 */
export function buildBoardViewModel(
  input: BuildBoardViewModelInput
): BoardViewModel {
  const currency = input.currency ?? 'MYR';
  const selectedId = input.selectedBroadcastProductId ?? null;

  // Index bookings by broadcastProductId for O(N) lookup per pill.
  const bookingsByBp = new Map<string, BoardBookingInput[]>();
  for (const booking of input.bookings) {
    const existing = bookingsByBp.get(booking.broadcastProductId);
    if (existing) {
      existing.push(booking);
    } else {
      bookingsByBp.set(booking.broadcastProductId, [booking]);
    }
  }

  // Sort BroadcastProduct rows in V Rich natural order.
  const sortedBps = sortDisplayCodes(input.broadcastProducts);

  const pills: BoardPillViewModel[] = [];
  const drawers: Record<string, BoardSlotDrawerViewModel> = {};

  for (const bp of sortedBps) {
    const lowStockAt = bp.lowStockAt ?? null;
    const isSelected = selectedId !== null && bp.broadcastProductId === selectedId;

    const effectiveUnitPrice = parsePrice(bp.priceOverride ?? bp.unitPrice);
    const unitPriceMyr = formatCurrency(effectiveUnitPrice, currency);

    const slotsRemainingCount = slotsRemaining({
      totalQuantity: bp.stockQuantity,
      reservedQty: bp.reservedQty,
    });

    const pillColor = pillColorState({
      availableQty: bp.availableQty,
      lowStockAt,
      selected: isSelected,
    });

    const pillLabel = formatPillLabel(bp.displayCode);
    // Use fraction mode so admin sees both available + total
    // ("5/13") — compact mode loses the total context which V Rich
    // header uses (per design audit).
    const stockBadge = formatStockBadge({
      availableQty: bp.availableQty,
      totalQuantity: bp.stockQuantity,
      mode: 'fraction',
    });
    const headerLabel = formatBoardHeader({
      displayCode: bp.displayCode,
      productName: bp.productName,
      unitPriceRm: unitPriceMyr,
      availableQty: bp.availableQty,
      totalQuantity: bp.stockQuantity,
    });

    pills.push(
      Object.freeze({
        broadcastProductId: bp.broadcastProductId,
        displayCode: bp.displayCode,
        productName: bp.productName,
        unitPriceMyr,
        slotsRemaining: slotsRemainingCount,
        totalSlots: bp.stockQuantity,
        reservedSlots: bp.reservedQty,
        availableSlots: bp.availableQty,
        pillColor,
        pillLabel,
        stockBadge,
        headerLabel,
        liveSessionId: bp.liveSessionId ?? null,
        saleDate: bp.saleDate ?? null,
      })
    );

    // Build drawer projection for this pill via existing `buildSlots`.
    const bpBookings = bookingsByBp.get(bp.broadcastProductId) ?? [];
    const slotInputs = bpBookings.map<SlotInput>((b) =>
      Object.freeze({
        bookingId: b.bookingId,
        status: b.status,
        customerId: b.customerId,
        customerName: b.customerName,
        quantity: b.quantity,
        createdAt: new Date(b.createdAt),
      })
    );
    const slotResult = buildSlots(slotInputs, bp.stockQuantity);
    drawers[bp.broadcastProductId] = Object.freeze({
      broadcastProductId: bp.broadcastProductId,
      slots: slotResult.slots,
      overflow: slotResult.overflow,
      hasOverflow: slotResult.overflow.length > 0,
    });

    // Mark bookings as matched so we can compute orphans later.
    bookingsByBp.delete(bp.broadcastProductId);
  }

  // Anything left in `bookingsByBp` did not match any BroadcastProduct
  // row — surface as orphans so future UI can flag integrity issue
  // (e.g. BP filtered out by saleDate but booking still active).
  const orphanBookings: BoardBookingInput[] = [];
  for (const remaining of bookingsByBp.values()) {
    for (const b of remaining) {
      orphanBookings.push(b);
    }
  }

  return Object.freeze({
    pills: Object.freeze(pills),
    drawers: Object.freeze(drawers),
    orphanBookings: Object.freeze(orphanBookings),
    selectedBroadcastProductId: selectedId,
  });
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Parse a price string from API into a number. Defensive against
 * empty / invalid input — falls back to 0 so UI never throws on
 * malformed legacy rows.
 */
function parsePrice(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
