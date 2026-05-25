import { describe, it, expect } from 'vitest';
import {
  buildBoardViewModel,
  type BoardBroadcastProductInput,
  type BoardBookingInput,
} from '@/lib/sale/build-board-view-model';

/**
 * V Rich Stage 3.10-B mapper tests. Pure-fn coverage — no React,
 * no fetch, no Prisma. Tests assert:
 *
 *   - empty state (no BPs / no bookings)
 *   - single BP single booking
 *   - multi BP natural sort
 *   - cancelled bookings filtered from slot list
 *   - terminal statuses (EXPIRED / CONVERTED_TO_ORDER / CANCELLED)
 *     filtered from slots but counted nowhere
 *   - over-allocated state surfaces in overflow array
 *   - orphan bookings (no matching BP) surfaced separately
 *   - selection drives pillColor
 *   - MYR formatting on unitPrice + priceOverride takes precedence
 *   - evergreen rows (no liveSessionId) handled identically
 *   - frozen output (caller cannot mutate)
 *   - empty stock (totalQuantity 0) → zero slots
 *   - lowStockAt drives low-stock pillColor
 */

function bp(overrides: Partial<BoardBroadcastProductInput> = {}): BoardBroadcastProductInput {
  return {
    broadcastProductId: overrides.broadcastProductId ?? 'bp-1',
    displayCode: overrides.displayCode ?? 'CM1',
    productId: overrides.productId ?? 'prod-1',
    productName: overrides.productName ?? 'Test Candle',
    variantId: overrides.variantId ?? 'var-1',
    variantName: overrides.variantName ?? 'Default',
    unitPrice: overrides.unitPrice ?? '108.00',
    priceOverride: overrides.priceOverride,
    stockQuantity: overrides.stockQuantity ?? 13,
    reservedQty: overrides.reservedQty ?? 0,
    availableQty: overrides.availableQty ?? 13,
    liveSessionId: overrides.liveSessionId,
    saleDate: overrides.saleDate,
    lowStockAt: overrides.lowStockAt,
  };
}

function booking(overrides: Partial<BoardBookingInput> = {}): BoardBookingInput {
  return {
    bookingId: overrides.bookingId ?? 'bk-1',
    broadcastProductId: overrides.broadcastProductId ?? 'bp-1',
    status: overrides.status ?? 'CONFIRMED',
    customerId: overrides.customerId ?? 'cust-1',
    customerName: overrides.customerName ?? 'Alice',
    quantity: overrides.quantity ?? 1,
    createdAt: overrides.createdAt ?? '2026-05-24T10:00:00.000Z',
  };
}

describe('buildBoardViewModel — empty state', () => {
  it('returns empty pills + empty drawers + empty orphans when no input', () => {
    const vm = buildBoardViewModel({ broadcastProducts: [], bookings: [] });
    expect(vm.pills).toHaveLength(0);
    expect(Object.keys(vm.drawers)).toHaveLength(0);
    expect(vm.orphanBookings).toHaveLength(0);
    expect(vm.selectedBroadcastProductId).toBe(null);
  });

  it('handles BPs with no bookings (all empty slots)', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 3 })],
      bookings: [],
    });
    expect(vm.pills).toHaveLength(1);
    const drawer = vm.drawers['bp-1'];
    expect(drawer).toBeDefined();
    expect(drawer.slots).toHaveLength(3);
    expect(drawer.slots.every((s) => s.kind === 'empty')).toBe(true);
    expect(drawer.hasOverflow).toBe(false);
  });
});

describe('buildBoardViewModel — single BP single booking', () => {
  it('renders one filled slot + remaining empty for CONFIRMED booking', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 3, reservedQty: 1, availableQty: 2 })],
      bookings: [booking({ status: 'CONFIRMED' })],
    });
    const drawer = vm.drawers['bp-1'];
    expect(drawer.slots).toHaveLength(3);
    expect(drawer.slots[0].kind).toBe('filled');
    expect(drawer.slots[1].kind).toBe('empty');
    expect(drawer.slots[2].kind).toBe('empty');
  });

  it('renders PENDING_REVIEW booking as filled slot', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 2 })],
      bookings: [booking({ status: 'PENDING_REVIEW' })],
    });
    const drawer = vm.drawers['bp-1'];
    expect(drawer.slots[0].kind).toBe('filled');
    if (drawer.slots[0].kind === 'filled') {
      expect(drawer.slots[0].status).toBe('PENDING_REVIEW');
    }
  });
});

describe('buildBoardViewModel — multi BP natural sort', () => {
  it('sorts CM1, CM2, CM10 in V Rich natural order', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ broadcastProductId: 'bp-cm10', displayCode: 'CM10' }),
        bp({ broadcastProductId: 'bp-cm1', displayCode: 'CM1' }),
        bp({ broadcastProductId: 'bp-cm2', displayCode: 'CM2' }),
      ],
      bookings: [],
    });
    expect(vm.pills.map((p) => p.displayCode)).toEqual(['CM1', 'CM2', 'CM10']);
  });

  it('sorts cross-prefix codes lexicographically by prefix then numeric', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ broadcastProductId: 'bp-tz1', displayCode: 'TZ1' }),
        bp({ broadcastProductId: 'bp-bd3', displayCode: 'BD3' }),
        bp({ broadcastProductId: 'bp-cm2', displayCode: 'CM2' }),
        bp({ broadcastProductId: 'bp-bd1', displayCode: 'BD1' }),
      ],
      bookings: [],
    });
    expect(vm.pills.map((p) => p.displayCode)).toEqual(['BD1', 'BD3', 'CM2', 'TZ1']);
  });
});

describe('buildBoardViewModel — terminal booking filter', () => {
  const terminalStatuses = [
    'CANCELLED',
    'EXPIRED',
    'CONVERTED_TO_ORDER',
  ] as const;

  for (const status of terminalStatuses) {
    it(`filters ${status} from slot list (all-empty drawer)`, () => {
      const vm = buildBoardViewModel({
        broadcastProducts: [bp({ stockQuantity: 2 })],
        bookings: [booking({ status })],
      });
      const drawer = vm.drawers['bp-1'];
      expect(drawer.slots.every((s) => s.kind === 'empty')).toBe(true);
    });
  }

  it('mixes terminal + active: only active bookings fill slots', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 3 })],
      bookings: [
        booking({ bookingId: 'bk-a', status: 'CONFIRMED', createdAt: '2026-05-24T10:00:00Z' }),
        booking({ bookingId: 'bk-b', status: 'CANCELLED', createdAt: '2026-05-24T10:01:00Z' }),
        booking({ bookingId: 'bk-c', status: 'PENDING_REVIEW', createdAt: '2026-05-24T10:02:00Z' }),
      ],
    });
    const drawer = vm.drawers['bp-1'];
    const filledIds = drawer.slots
      .filter((s) => s.kind === 'filled')
      .map((s) => (s.kind === 'filled' ? s.bookingId : ''));
    expect(filledIds).toEqual(['bk-a', 'bk-c']);
  });
});

describe('buildBoardViewModel — over-allocation', () => {
  it('surfaces overflow when active bookings exceed stockQuantity', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 1 })],
      bookings: [
        booking({ bookingId: 'bk-1', status: 'CONFIRMED', createdAt: '2026-05-24T10:00:00Z' }),
        booking({ bookingId: 'bk-2', status: 'CONFIRMED', createdAt: '2026-05-24T10:01:00Z' }),
      ],
    });
    const drawer = vm.drawers['bp-1'];
    expect(drawer.slots).toHaveLength(1);
    expect(drawer.hasOverflow).toBe(true);
    expect(drawer.overflow).toHaveLength(1);
    expect(drawer.overflow[0].bookingId).toBe('bk-2');
  });

  it('hasOverflow=false when bookings fit', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 5 })],
      bookings: [booking()],
    });
    expect(vm.drawers['bp-1'].hasOverflow).toBe(false);
  });
});

describe('buildBoardViewModel — orphan bookings', () => {
  it('surfaces bookings whose broadcastProductId does not match any BP', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ broadcastProductId: 'bp-real' })],
      bookings: [
        booking({ bookingId: 'bk-real', broadcastProductId: 'bp-real' }),
        booking({ bookingId: 'bk-orphan', broadcastProductId: 'bp-missing' }),
      ],
    });
    expect(vm.orphanBookings).toHaveLength(1);
    expect(vm.orphanBookings[0].bookingId).toBe('bk-orphan');
  });

  it('handles all-orphan input', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [],
      bookings: [booking()],
    });
    expect(vm.pills).toHaveLength(0);
    expect(vm.orphanBookings).toHaveLength(1);
  });
});

describe('buildBoardViewModel — selection drives pillColor', () => {
  it('marks selected pill with pillColor "selected"', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ broadcastProductId: 'bp-a' }),
        bp({ broadcastProductId: 'bp-b', displayCode: 'CM2' }),
      ],
      bookings: [],
      selectedBroadcastProductId: 'bp-b',
    });
    const pillA = vm.pills.find((p) => p.broadcastProductId === 'bp-a')!;
    const pillB = vm.pills.find((p) => p.broadcastProductId === 'bp-b')!;
    expect(pillA.pillColor).toBe('in-stock');
    expect(pillB.pillColor).toBe('selected');
    expect(vm.selectedBroadcastProductId).toBe('bp-b');
  });

  it('null selection leaves all pills at stock-derived color', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ availableQty: 0 })],
      bookings: [],
      selectedBroadcastProductId: null,
    });
    expect(vm.pills[0].pillColor).toBe('out-of-stock');
  });
});

describe('buildBoardViewModel — currency formatting', () => {
  it('formats unitPrice as MYR by default (RM symbol + 2 decimals)', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ unitPrice: '108.00' })],
      bookings: [],
    });
    expect(vm.pills[0].unitPriceMyr).toBe('RM108.00');
  });

  it('priceOverride takes precedence over unitPrice', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ unitPrice: '108.00', priceOverride: '88.00' })],
      bookings: [],
    });
    expect(vm.pills[0].unitPriceMyr).toBe('RM88.00');
  });

  it('parses invalid price as 0 (defensive)', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ unitPrice: 'not-a-number' })],
      bookings: [],
    });
    expect(vm.pills[0].unitPriceMyr).toBe('RM0.00');
  });

  it('accepts THB / SGD currency override (admin-friendly future)', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ unitPrice: '108.00' })],
      bookings: [],
      currency: 'THB',
    });
    expect(vm.pills[0].unitPriceMyr).toContain('฿');
  });
});

describe('buildBoardViewModel — evergreen vs live-bound', () => {
  it('treats evergreen (liveSessionId=null) identically to live-bound', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ broadcastProductId: 'bp-ever', displayCode: 'CM1', liveSessionId: null }),
        bp({ broadcastProductId: 'bp-live', displayCode: 'CM2', liveSessionId: 'sess-1' }),
      ],
      bookings: [],
    });
    expect(vm.pills).toHaveLength(2);
    expect(vm.pills[0].liveSessionId).toBe(null);
    expect(vm.pills[1].liveSessionId).toBe('sess-1');
    // Both should have same shape (same fields, same color logic)
    expect(vm.pills[0].pillColor).toBe('in-stock');
    expect(vm.pills[1].pillColor).toBe('in-stock');
  });

  it('carries saleDate through unmodified', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ saleDate: '2026-05-24' })],
      bookings: [],
    });
    expect(vm.pills[0].saleDate).toBe('2026-05-24');
  });

  it('absent saleDate normalizes to null (not undefined)', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ saleDate: undefined })],
      bookings: [],
    });
    expect(vm.pills[0].saleDate).toBe(null);
  });
});

describe('buildBoardViewModel — lowStockAt drives pillColor', () => {
  it('availableQty <= lowStockAt → low-stock', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ stockQuantity: 10, reservedQty: 7, availableQty: 3, lowStockAt: 5 }),
      ],
      bookings: [],
    });
    expect(vm.pills[0].pillColor).toBe('low-stock');
  });

  it('availableQty > lowStockAt → in-stock', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ stockQuantity: 10, reservedQty: 2, availableQty: 8, lowStockAt: 5 }),
      ],
      bookings: [],
    });
    expect(vm.pills[0].pillColor).toBe('in-stock');
  });

  it('availableQty <= 0 → out-of-stock (overrides lowStockAt check)', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ stockQuantity: 5, reservedQty: 5, availableQty: 0, lowStockAt: 2 }),
      ],
      bookings: [],
    });
    expect(vm.pills[0].pillColor).toBe('out-of-stock');
  });
});

describe('buildBoardViewModel — empty stock (totalQuantity 0)', () => {
  it('renders zero slots when stockQuantity is 0', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 0, reservedQty: 0, availableQty: 0 })],
      bookings: [],
    });
    expect(vm.drawers['bp-1'].slots).toHaveLength(0);
    expect(vm.pills[0].totalSlots).toBe(0);
    expect(vm.pills[0].slotsRemaining).toBe(0);
  });

  it('counts active bookings as overflow when stockQuantity is 0', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 0 })],
      bookings: [booking({ status: 'CONFIRMED' })],
    });
    expect(vm.drawers['bp-1'].hasOverflow).toBe(true);
    expect(vm.drawers['bp-1'].overflow).toHaveLength(1);
  });
});

describe('buildBoardViewModel — frozen output (immutability)', () => {
  it('root view model is frozen', () => {
    const vm = buildBoardViewModel({ broadcastProducts: [bp()], bookings: [] });
    expect(Object.isFrozen(vm)).toBe(true);
    expect(Object.isFrozen(vm.pills)).toBe(true);
    expect(Object.isFrozen(vm.pills[0])).toBe(true);
    expect(Object.isFrozen(vm.drawers)).toBe(true);
    expect(Object.isFrozen(vm.orphanBookings)).toBe(true);
  });

  it('drawer object is frozen', () => {
    const vm = buildBoardViewModel({ broadcastProducts: [bp()], bookings: [] });
    expect(Object.isFrozen(vm.drawers['bp-1'])).toBe(true);
  });
});

describe('buildBoardViewModel — display formatting passes through helpers', () => {
  it('pillLabel matches formatPillLabel output for short code', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ displayCode: 'CM1' })],
      bookings: [],
    });
    expect(vm.pills[0].pillLabel).toBe('CM1');
  });

  it('headerLabel contains displayCode + productName + price + counts', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({
          displayCode: 'BD4',
          productName: 'Big Candle',
          unitPrice: '108.00',
          stockQuantity: 13,
          availableQty: 11,
        }),
      ],
      bookings: [],
    });
    const header = vm.pills[0].headerLabel;
    expect(header).toContain('BD4');
    expect(header).toContain('Big Candle');
    expect(header).toContain('RM108.00');
    expect(header).toContain('11');
    expect(header).toContain('13');
  });

  it('stockBadge contains availableQty / totalQuantity', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ availableQty: 5, stockQuantity: 13 })],
      bookings: [],
    });
    expect(vm.pills[0].stockBadge).toContain('5');
    expect(vm.pills[0].stockBadge).toContain('13');
  });
});

describe('buildBoardViewModel — booking createdAt parsing', () => {
  it('parses ISO string createdAt into Date for slot ordering', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 3 })],
      bookings: [
        booking({ bookingId: 'bk-late', createdAt: '2026-05-24T12:00:00.000Z' }),
        booking({ bookingId: 'bk-early', createdAt: '2026-05-24T08:00:00.000Z' }),
      ],
    });
    const filled = vm.drawers['bp-1'].slots.filter((s) => s.kind === 'filled');
    expect(filled).toHaveLength(2);
    if (filled[0].kind === 'filled') {
      expect(filled[0].bookingId).toBe('bk-early');
    }
    if (filled[1].kind === 'filled') {
      expect(filled[1].bookingId).toBe('bk-late');
    }
  });
});
