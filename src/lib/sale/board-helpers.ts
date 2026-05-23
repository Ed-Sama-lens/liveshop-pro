/**
 * V Rich-style sale board — pure helpers.
 *
 * Tier 3.10-A-prep (2026-05-23). Helpers landed standalone so they can
 * be unit-tested before the UI components (PR 3.10-B / -C / -D) are
 * implemented. UI components will consume these without re-deriving
 * the rules.
 *
 * Per design `docs/superpowers/2026-05-23-tier-3-10-a-vrich-board-design-audit.md`:
 *   - Pills = compact `BroadcastProduct` chips, color-coded by stock
 *   - Slot drawer = read-only projection of `Booking` rows for
 *     (broadcastProductId, saleDate)
 *   - Slot count = `Variant.quantity` (total stock)
 *   - Filled slots = active bookings (PENDING_REVIEW + CONFIRMED);
 *     CANCELLED / EXPIRED / CONVERTED_TO_ORDER excluded from slot list
 *
 * No I/O. No React. No Prisma. Pure functions only.
 */

export type PillBookingStatus =
  | 'PENDING_REVIEW'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CONVERTED_TO_ORDER';

export type PillColorState =
  | 'in-stock'      // availableQty > lowStockAt (or no lowStockAt)
  | 'low-stock'    // 0 < availableQty <= lowStockAt
  | 'out-of-stock' // availableQty <= 0
  | 'selected';    // currently expanded pill in the drawer

/**
 * Compute the color state for a pill from stock + selection.
 *
 * `availableQty` already factors reservations. `selected` always wins
 * for visual contrast in the row.
 */
export function pillColorState(args: {
  availableQty: number;
  lowStockAt: number | null;
  selected: boolean;
}): PillColorState {
  if (args.selected) return 'selected';
  if (args.availableQty <= 0) return 'out-of-stock';
  if (typeof args.lowStockAt === 'number' && args.availableQty <= args.lowStockAt) {
    return 'low-stock';
  }
  return 'in-stock';
}

/**
 * Natural sort comparator for product codes like `CM1`, `CM2`, `CM10`,
 * `FS2`, `TZ1`, `BD3`. Splits the code into letter prefix + numeric
 * suffix and sorts by prefix lexicographically then numeric suffix
 * numerically.
 *
 * Codes without a numeric suffix sort first within their prefix group.
 * Codes that don't match the pattern fall back to plain string compare.
 */
export function compareDisplayCode(a: string, b: string): number {
  const m1 = /^([A-Za-z]+)(\d+)?$/.exec(a);
  const m2 = /^([A-Za-z]+)(\d+)?$/.exec(b);
  if (!m1 || !m2) return a.localeCompare(b);
  const [, prefix1, num1] = m1;
  const [, prefix2, num2] = m2;
  if (prefix1 !== prefix2) return prefix1.localeCompare(prefix2);
  // Same prefix; sort by numeric suffix. Missing suffix sorts first.
  if (num1 === undefined && num2 === undefined) return 0;
  if (num1 === undefined) return -1;
  if (num2 === undefined) return 1;
  return parseInt(num1, 10) - parseInt(num2, 10);
}

/**
 * Sort display codes in V Rich-natural order. Returns a new array;
 * does not mutate the input.
 */
export function sortDisplayCodes<T extends { displayCode: string }>(
  items: readonly T[]
): readonly T[] {
  return [...items].sort((a, b) => compareDisplayCode(a.displayCode, b.displayCode));
}

/**
 * Format the header label rendered above the slot drawer.
 *
 * V Rich reference shows: `BD4 大蜡烛 108 (13)`
 *   = `<displayCode> <productName> <unitPriceRm> (<availableQty>/<totalQuantity>)`
 *
 * `availableQty/totalQuantity` makes it obvious how many slots remain
 * vs the original stock count.
 */
export function formatBoardHeader(args: {
  displayCode: string;
  productName: string;
  unitPriceRm: string;
  availableQty: number;
  totalQuantity: number;
}): string {
  const { displayCode, productName, unitPriceRm, availableQty, totalQuantity } = args;
  return `${displayCode} ${productName} ${unitPriceRm} (${availableQty}/${totalQuantity})`;
}

/**
 * Build slot rows for the drawer. Returns exactly `totalQuantity`
 * entries — empty slots are placeholders the UI can render as
 * dotted-line drop targets (PR 3.10-D will wire manual fill).
 *
 * Active bookings (PENDING_REVIEW + CONFIRMED) fill in creation order
 * (oldest first). Terminal-status bookings (CANCELLED / EXPIRED /
 * CONVERTED_TO_ORDER) are excluded from the slot list per the V Rich
 * board contract — they live in a separate "history" disclosure.
 *
 * Over-allocation defensive: if active bookings exceed `totalQuantity`,
 * additional bookings are kept in `overflow` so callers can flag the
 * data integrity issue (legitimate when admin lowered the stock).
 */
export interface SlotInput {
  readonly bookingId: string;
  readonly status: PillBookingStatus;
  readonly customerId: string;
  readonly customerName: string;
  readonly quantity: number;
  readonly createdAt: Date;
}

export type Slot =
  | { readonly kind: 'empty'; readonly index: number }
  | {
      readonly kind: 'filled';
      readonly index: number;
      readonly bookingId: string;
      readonly status: 'PENDING_REVIEW' | 'CONFIRMED';
      readonly customerId: string;
      readonly customerName: string;
      readonly quantity: number;
      readonly createdAt: Date;
    };

export interface SlotsResult {
  readonly slots: readonly Slot[];
  readonly overflow: readonly SlotInput[];
}

export function buildSlots(
  bookings: readonly SlotInput[],
  totalQuantity: number
): SlotsResult {
  if (totalQuantity < 0) {
    return Object.freeze({ slots: [], overflow: [] });
  }
  // Active = not terminal.
  const active = bookings
    .filter(
      (b) =>
        b.status === 'PENDING_REVIEW' || b.status === 'CONFIRMED'
    )
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const slots: Slot[] = [];
  for (let i = 0; i < totalQuantity; i++) {
    const booking = active[i];
    if (booking !== undefined) {
      slots.push(
        Object.freeze({
          kind: 'filled' as const,
          index: i,
          bookingId: booking.bookingId,
          status: booking.status as 'PENDING_REVIEW' | 'CONFIRMED',
          customerId: booking.customerId,
          customerName: booking.customerName,
          quantity: booking.quantity,
          createdAt: booking.createdAt,
        })
      );
    } else {
      slots.push(Object.freeze({ kind: 'empty' as const, index: i }));
    }
  }
  const overflow = active.slice(totalQuantity);
  return Object.freeze({
    slots: Object.freeze(slots),
    overflow: Object.freeze(overflow),
  });
}

/**
 * Pure helper: derive the "slots remaining" count surfaced on the pill
 * header. This is the same as `availableQty` but expressed as a
 * deliberate UI primitive — pill row code stays clear of stock math.
 */
export function slotsRemaining(args: {
  totalQuantity: number;
  reservedQty: number;
}): number {
  return Math.max(0, args.totalQuantity - args.reservedQty);
}
