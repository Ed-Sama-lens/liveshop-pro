import { describe, it, expect } from 'vitest';
import {
  pillColorState,
  compareDisplayCode,
  sortDisplayCodes,
  formatBoardHeader,
  buildSlots,
  slotsRemaining,
  type SlotInput,
} from '@/lib/sale/board-helpers';

/**
 * Tier 3.10-A-prep unit tests — V Rich board pure helpers.
 *
 * Locks the rules the UI components (PR 3.10-B/C/D) will rely on so
 * the visual implementation can land without re-deriving slot/pill
 * semantics.
 */

describe('pillColorState', () => {
  it('selected always wins', () => {
    expect(
      pillColorState({ availableQty: 0, lowStockAt: 5, selected: true })
    ).toBe('selected');
  });

  it('out-of-stock when availableQty <= 0', () => {
    expect(
      pillColorState({ availableQty: 0, lowStockAt: null, selected: false })
    ).toBe('out-of-stock');
  });

  it('low-stock when 0 < availableQty <= lowStockAt', () => {
    expect(
      pillColorState({ availableQty: 3, lowStockAt: 5, selected: false })
    ).toBe('low-stock');
    expect(
      pillColorState({ availableQty: 5, lowStockAt: 5, selected: false })
    ).toBe('low-stock');
  });

  it('in-stock when availableQty > lowStockAt', () => {
    expect(
      pillColorState({ availableQty: 6, lowStockAt: 5, selected: false })
    ).toBe('in-stock');
  });

  it('in-stock when lowStockAt is null', () => {
    expect(
      pillColorState({ availableQty: 1, lowStockAt: null, selected: false })
    ).toBe('in-stock');
  });
});

describe('compareDisplayCode (natural sort)', () => {
  it('sorts CM1 < CM2 < CM10', () => {
    const arr = ['CM10', 'CM1', 'CM2'];
    arr.sort(compareDisplayCode);
    expect(arr).toEqual(['CM1', 'CM2', 'CM10']);
  });

  it('sorts prefix groups lexicographically', () => {
    const arr = ['TZ1', 'BD3', 'CM10', 'FS2'];
    arr.sort(compareDisplayCode);
    expect(arr).toEqual(['BD3', 'CM10', 'FS2', 'TZ1']);
  });

  it('groups by prefix then numeric', () => {
    const arr = ['BD10', 'BD2', 'AA5', 'AA1'];
    arr.sort(compareDisplayCode);
    expect(arr).toEqual(['AA1', 'AA5', 'BD2', 'BD10']);
  });

  it('codes without numeric suffix sort first within prefix', () => {
    const arr = ['BD1', 'BD'];
    arr.sort(compareDisplayCode);
    expect(arr).toEqual(['BD', 'BD1']);
  });

  it('falls back to string compare for non-pattern codes', () => {
    const arr = ['XYZ-001', 'XYZ-002', '10-X'];
    arr.sort(compareDisplayCode);
    expect(arr[0]).toBe('10-X');
  });

  it('handles single-char prefixes (A1, A2, B1)', () => {
    const arr = ['B1', 'A2', 'A1'];
    arr.sort(compareDisplayCode);
    expect(arr).toEqual(['A1', 'A2', 'B1']);
  });
});

describe('sortDisplayCodes', () => {
  it('returns a new array, does not mutate input', () => {
    const input = [{ displayCode: 'CM2' }, { displayCode: 'CM1' }];
    const result = sortDisplayCodes(input);
    expect(result[0].displayCode).toBe('CM1');
    // Original untouched
    expect(input[0].displayCode).toBe('CM2');
  });

  it('preserves extra properties on each item', () => {
    const input = [
      { displayCode: 'CM2', meta: 'two' },
      { displayCode: 'CM1', meta: 'one' },
    ];
    const result = sortDisplayCodes(input);
    expect(result[0]).toMatchObject({ displayCode: 'CM1', meta: 'one' });
    expect(result[1]).toMatchObject({ displayCode: 'CM2', meta: 'two' });
  });
});

describe('formatBoardHeader', () => {
  it('renders the V Rich `code name price (avail/total)` shape', () => {
    expect(
      formatBoardHeader({
        displayCode: 'BD4',
        productName: '大蜡烛',
        unitPriceRm: 'RM108.00',
        availableQty: 13,
        totalQuantity: 13,
      })
    ).toBe('BD4 大蜡烛 RM108.00 (13/13)');
  });

  it('reflects depleted stock', () => {
    expect(
      formatBoardHeader({
        displayCode: 'CM1',
        productName: 'product',
        unitPriceRm: 'RM10.00',
        availableQty: 0,
        totalQuantity: 5,
      })
    ).toBe('CM1 product RM10.00 (0/5)');
  });
});

describe('slotsRemaining', () => {
  it('returns totalQuantity - reservedQty', () => {
    expect(slotsRemaining({ totalQuantity: 10, reservedQty: 3 })).toBe(7);
  });

  it('never goes negative', () => {
    expect(slotsRemaining({ totalQuantity: 2, reservedQty: 5 })).toBe(0);
  });

  it('handles zero stock', () => {
    expect(slotsRemaining({ totalQuantity: 0, reservedQty: 0 })).toBe(0);
  });
});

describe('buildSlots', () => {
  function booking(
    id: string,
    status: SlotInput['status'],
    createdAtIso: string,
    overrides: Partial<SlotInput> = {}
  ): SlotInput {
    return {
      bookingId: id,
      status,
      customerId: `cust-${id}`,
      customerName: `Customer ${id}`,
      quantity: 1,
      createdAt: new Date(createdAtIso),
      ...overrides,
    };
  }

  it('returns array of length totalQuantity for empty bookings', () => {
    const result = buildSlots([], 5);
    expect(result.slots).toHaveLength(5);
    expect(result.slots.every((s) => s.kind === 'empty')).toBe(true);
    expect(result.overflow).toHaveLength(0);
  });

  it('returns empty result when totalQuantity is 0', () => {
    const result = buildSlots(
      [booking('b1', 'CONFIRMED', '2026-05-23T00:00:00Z')],
      0
    );
    expect(result.slots).toHaveLength(0);
    expect(result.overflow).toHaveLength(1);
  });

  it('returns empty result when totalQuantity is negative (defensive)', () => {
    const result = buildSlots([], -1);
    expect(result.slots).toHaveLength(0);
  });

  it('fills active bookings in creation order (oldest first)', () => {
    const result = buildSlots(
      [
        booking('b2', 'CONFIRMED', '2026-05-23T02:00:00Z'),
        booking('b1', 'CONFIRMED', '2026-05-23T01:00:00Z'),
      ],
      3
    );
    expect(result.slots[0].kind).toBe('filled');
    if (result.slots[0].kind === 'filled') {
      expect(result.slots[0].bookingId).toBe('b1');
    }
    if (result.slots[1].kind === 'filled') {
      expect(result.slots[1].bookingId).toBe('b2');
    }
    expect(result.slots[2].kind).toBe('empty');
  });

  it('excludes CANCELLED bookings from the slot list', () => {
    const result = buildSlots(
      [
        booking('b1', 'CANCELLED', '2026-05-23T01:00:00Z'),
        booking('b2', 'CONFIRMED', '2026-05-23T02:00:00Z'),
      ],
      3
    );
    const filled = result.slots.filter((s) => s.kind === 'filled');
    expect(filled).toHaveLength(1);
    if (filled[0].kind === 'filled') expect(filled[0].bookingId).toBe('b2');
  });

  it('excludes EXPIRED bookings from the slot list', () => {
    const result = buildSlots(
      [booking('b1', 'EXPIRED', '2026-05-23T01:00:00Z')],
      2
    );
    expect(result.slots.every((s) => s.kind === 'empty')).toBe(true);
  });

  it('excludes CONVERTED_TO_ORDER bookings from the slot list', () => {
    const result = buildSlots(
      [booking('b1', 'CONVERTED_TO_ORDER', '2026-05-23T01:00:00Z')],
      2
    );
    expect(result.slots.every((s) => s.kind === 'empty')).toBe(true);
  });

  it('mixes PENDING_REVIEW and CONFIRMED as active', () => {
    const result = buildSlots(
      [
        booking('b1', 'PENDING_REVIEW', '2026-05-23T01:00:00Z'),
        booking('b2', 'CONFIRMED', '2026-05-23T02:00:00Z'),
      ],
      2
    );
    expect(result.slots[0].kind).toBe('filled');
    expect(result.slots[1].kind).toBe('filled');
  });

  it('overflow captures active bookings beyond totalQuantity', () => {
    const result = buildSlots(
      [
        booking('b1', 'CONFIRMED', '2026-05-23T01:00:00Z'),
        booking('b2', 'CONFIRMED', '2026-05-23T02:00:00Z'),
        booking('b3', 'CONFIRMED', '2026-05-23T03:00:00Z'),
      ],
      2
    );
    expect(result.slots).toHaveLength(2);
    expect(result.overflow).toHaveLength(1);
    expect(result.overflow[0].bookingId).toBe('b3');
  });

  it('overflow preserves chronological order (oldest first)', () => {
    const result = buildSlots(
      [
        booking('bnew', 'CONFIRMED', '2026-05-23T03:00:00Z'),
        booking('bmid', 'CONFIRMED', '2026-05-23T02:00:00Z'),
        booking('bold', 'CONFIRMED', '2026-05-23T01:00:00Z'),
      ],
      1
    );
    if (result.slots[0].kind === 'filled') {
      expect(result.slots[0].bookingId).toBe('bold');
    }
    expect(result.overflow.map((b) => b.bookingId)).toEqual(['bmid', 'bnew']);
  });

  it('slots are sequentially indexed', () => {
    const result = buildSlots(
      [booking('b1', 'CONFIRMED', '2026-05-23T01:00:00Z')],
      3
    );
    expect(result.slots.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('terminal status mixed with active still indexes correctly', () => {
    const result = buildSlots(
      [
        booking('b1', 'CANCELLED', '2026-05-23T01:00:00Z'),
        booking('b2', 'CONFIRMED', '2026-05-23T02:00:00Z'),
        booking('b3', 'CONVERTED_TO_ORDER', '2026-05-23T03:00:00Z'),
        booking('b4', 'CONFIRMED', '2026-05-23T04:00:00Z'),
      ],
      4
    );
    expect(result.slots).toHaveLength(4);
    const filled = result.slots.filter((s) => s.kind === 'filled');
    expect(filled).toHaveLength(2);
    if (filled[0].kind === 'filled') expect(filled[0].bookingId).toBe('b2');
    if (filled[1].kind === 'filled') expect(filled[1].bookingId).toBe('b4');
  });
});
