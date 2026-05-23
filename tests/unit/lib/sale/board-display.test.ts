import { describe, it, expect } from 'vitest';
import {
  pillWidthChars,
  pillRowMaxWidthChars,
  slotProgressPercent,
  countFilledSlots,
  slotRowDisplayState,
  formatPillLabel,
  formatStockBadge,
  PILL_COLOR_TOKEN,
  SLOT_ROW_COLOR_TOKEN,
  type SlotRowDisplayInput,
} from '@/lib/sale/board-display';

/**
 * Tier 3.10-B-prep — pure-helper tests for board display layer.
 *
 * Covers the visual primitives that 3.10-B (pill row) + 3.10-C
 * (drawer) will consume. Locked here so UI implementation cannot
 * silently drift.
 */

describe('pillWidthChars', () => {
  it('CM1 = 3 chars', () => {
    expect(pillWidthChars('CM1')).toBe(3);
  });

  it('CM10 = 4 chars', () => {
    expect(pillWidthChars('CM10')).toBe(4);
  });

  it('single-char pads to 2 (min)', () => {
    expect(pillWidthChars('A')).toBe(2);
  });

  it('empty string pads to 2 (min, defensive)', () => {
    expect(pillWidthChars('')).toBe(2);
  });

  it('long codes return actual length', () => {
    expect(pillWidthChars('BD123456')).toBe(8);
  });
});

describe('pillRowMaxWidthChars', () => {
  it('returns 2 (min) for empty array', () => {
    expect(pillRowMaxWidthChars([])).toBe(2);
  });

  it('returns max across set', () => {
    expect(pillRowMaxWidthChars(['CM1', 'CM10', 'BD3'])).toBe(4);
  });

  it('mixes prefixes correctly', () => {
    expect(pillRowMaxWidthChars(['BD3', 'CM10', 'A1', 'XYZ123'])).toBe(6);
  });
});

describe('slotProgressPercent', () => {
  it('0 when totalQuantity is 0 (defensive)', () => {
    expect(slotProgressPercent({ filled: 0, totalQuantity: 0 })).toBe(0);
  });

  it('0 when no slots filled', () => {
    expect(slotProgressPercent({ filled: 0, totalQuantity: 10 })).toBe(0);
  });

  it('50 when half filled', () => {
    expect(slotProgressPercent({ filled: 5, totalQuantity: 10 })).toBe(50);
  });

  it('100 when all filled', () => {
    expect(slotProgressPercent({ filled: 10, totalQuantity: 10 })).toBe(100);
  });

  it('clamps to 100 when filled > total (overflow defensive)', () => {
    expect(slotProgressPercent({ filled: 15, totalQuantity: 10 })).toBe(100);
  });

  it('rounds to integer', () => {
    expect(slotProgressPercent({ filled: 1, totalQuantity: 3 })).toBe(33);
    expect(slotProgressPercent({ filled: 2, totalQuantity: 3 })).toBe(67);
  });

  it('treats negative totalQuantity as 0 (defensive)', () => {
    expect(slotProgressPercent({ filled: 5, totalQuantity: -1 })).toBe(0);
  });
});

describe('countFilledSlots', () => {
  it('returns 0 for empty array', () => {
    expect(countFilledSlots([])).toBe(0);
  });

  it('counts only filled, not empty', () => {
    expect(
      countFilledSlots([
        { kind: 'filled' },
        { kind: 'empty' },
        { kind: 'filled' },
        { kind: 'empty' },
      ])
    ).toBe(2);
  });

  it('returns 0 when all empty', () => {
    expect(
      countFilledSlots([{ kind: 'empty' }, { kind: 'empty' }, { kind: 'empty' }])
    ).toBe(0);
  });
});

describe('slotRowDisplayState', () => {
  function input(
    status: SlotRowDisplayInput['status'],
    integrity?: SlotRowDisplayInput['reservationIntegrity']
  ): SlotRowDisplayInput {
    return integrity === undefined
      ? { status }
      : { status, reservationIntegrity: integrity };
  }

  it('null status → empty', () => {
    expect(slotRowDisplayState(input(null))).toBe('empty');
  });

  it('PENDING_REVIEW → pending', () => {
    expect(slotRowDisplayState(input('PENDING_REVIEW'))).toBe('pending');
  });

  it('CONFIRMED + OK reservation → confirmed', () => {
    expect(slotRowDisplayState(input('CONFIRMED', 'OK'))).toBe('confirmed');
  });

  it('CONFIRMED + no integrity field (legacy) → confirmed', () => {
    expect(slotRowDisplayState(input('CONFIRMED'))).toBe('confirmed');
  });

  it('CONFIRMED + MISSING reservation → integrity_warn', () => {
    expect(slotRowDisplayState(input('CONFIRMED', 'MISSING'))).toBe('integrity_warn');
  });

  it('CONFIRMED + MULTIPLE reservations → integrity_warn', () => {
    expect(slotRowDisplayState(input('CONFIRMED', 'MULTIPLE'))).toBe('integrity_warn');
  });

  it('CONFIRMED + NOT_APPLICABLE → confirmed (NA is fine here)', () => {
    expect(slotRowDisplayState(input('CONFIRMED', 'NOT_APPLICABLE'))).toBe('confirmed');
  });

  it('CANCELLED → empty (defensive — never reaches active slot list)', () => {
    expect(slotRowDisplayState(input('CANCELLED'))).toBe('empty');
  });

  it('EXPIRED → empty (defensive)', () => {
    expect(slotRowDisplayState(input('EXPIRED'))).toBe('empty');
  });

  it('CONVERTED_TO_ORDER → empty (defensive)', () => {
    expect(slotRowDisplayState(input('CONVERTED_TO_ORDER'))).toBe('empty');
  });
});

describe('color tokens', () => {
  it('PILL_COLOR_TOKEN covers all 4 pill states', () => {
    expect(PILL_COLOR_TOKEN['in-stock']).toBe('pill.in-stock');
    expect(PILL_COLOR_TOKEN['low-stock']).toBe('pill.low-stock');
    expect(PILL_COLOR_TOKEN['out-of-stock']).toBe('pill.out-of-stock');
    expect(PILL_COLOR_TOKEN.selected).toBe('pill.selected');
  });

  it('SLOT_ROW_COLOR_TOKEN covers all 4 row states', () => {
    expect(SLOT_ROW_COLOR_TOKEN.empty).toBe('slot.empty');
    expect(SLOT_ROW_COLOR_TOKEN.pending).toBe('slot.pending');
    expect(SLOT_ROW_COLOR_TOKEN.confirmed).toBe('slot.confirmed');
    expect(SLOT_ROW_COLOR_TOKEN.integrity_warn).toBe('slot.integrity-warn');
  });

  it('PILL_COLOR_TOKEN is frozen (immutable contract)', () => {
    expect(Object.isFrozen(PILL_COLOR_TOKEN)).toBe(true);
  });

  it('SLOT_ROW_COLOR_TOKEN is frozen', () => {
    expect(Object.isFrozen(SLOT_ROW_COLOR_TOKEN)).toBe(true);
  });
});

describe('formatPillLabel', () => {
  it('returns the displayCode verbatim (V Rich design)', () => {
    expect(formatPillLabel('CM1')).toBe('CM1');
    expect(formatPillLabel('BD12')).toBe('BD12');
  });
});

describe('formatStockBadge', () => {
  it('default mode = compact', () => {
    expect(formatStockBadge({ availableQty: 13, totalQuantity: 13 })).toBe('(13)');
  });

  it('compact shows available count only', () => {
    expect(
      formatStockBadge({ availableQty: 5, totalQuantity: 13, mode: 'compact' })
    ).toBe('(5)');
  });

  it('fraction shows available/total', () => {
    expect(
      formatStockBadge({ availableQty: 5, totalQuantity: 13, mode: 'fraction' })
    ).toBe('(5/13)');
  });

  it('handles zero stock (fraction)', () => {
    expect(
      formatStockBadge({ availableQty: 0, totalQuantity: 0, mode: 'fraction' })
    ).toBe('(0/0)');
  });
});
