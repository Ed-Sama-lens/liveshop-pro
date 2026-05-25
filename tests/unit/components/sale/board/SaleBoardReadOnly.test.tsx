import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaleBoardReadOnly } from '@/components/sale/board/SaleBoardReadOnly';
import {
  buildBoardViewModel,
  type BoardBroadcastProductInput,
  type BoardBookingInput,
} from '@/lib/sale/build-board-view-model';

/**
 * V Rich Stage 3.10-C WIRE-2 component contract tests.
 *
 * Pins:
 * - Component consumes `BoardViewModel` directly (no re-derive)
 * - Empty view model renders pill-list empty state
 * - Pills render in V Rich natural order (from mapper)
 * - Click pill -> drawer expands with mapper's `drawers[bpId]`
 * - Click expanded pill again -> drawer collapses
 * - Drawer renders mapper's `headerLabel` (no re-derive)
 * - Empty drawer renders "ไม่มี slot" message
 * - Filled slots render with customer name + status from mapper
 * - Overflow badge renders when `hasOverflow=true`
 * - `defaultSelectedDisplayCode` prop drives initial selection
 * - `onSlotCancel` callback wires through to SlotRow cancel
 *
 * Component is NOT rendered in production /sale workspace; these
 * tests pin contract before WIRE-3 wires the shell.
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
    createdAt: overrides.createdAt ?? '2026-05-25T10:00:00.000Z',
  };
}

describe('SaleBoardReadOnly — empty view model', () => {
  it('renders pill-list empty state when pills are empty', () => {
    const vm = buildBoardViewModel({ broadcastProducts: [], bookings: [] });
    render(<SaleBoardReadOnly viewModel={vm} />);
    expect(screen.getByText('ยังไม่มีรหัสสินค้าในวันที่ขายนี้')).toBeDefined();
  });

  it('renders subtitle prompt when no pill selected', () => {
    const vm = buildBoardViewModel({ broadcastProducts: [bp()], bookings: [] });
    render(<SaleBoardReadOnly viewModel={vm} />);
    expect(screen.getByText('คลิกรหัสเพื่อดู slot')).toBeDefined();
  });
});

describe('SaleBoardReadOnly — pills render from mapper', () => {
  it('renders pills in V Rich natural order from mapper output', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ broadcastProductId: 'bp-cm10', displayCode: 'CM10' }),
        bp({ broadcastProductId: 'bp-cm1', displayCode: 'CM1' }),
        bp({ broadcastProductId: 'bp-cm2', displayCode: 'CM2' }),
      ],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    const pills = screen.getAllByRole('button');
    expect(pills).toHaveLength(3);
    expect(pills[0].textContent).toContain('CM1');
    expect(pills[1].textContent).toContain('CM2');
    expect(pills[2].textContent).toContain('CM10');
  });
});

describe('SaleBoardReadOnly — click pill expands drawer', () => {
  it('clicking pill expands drawer with mapper headerLabel', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({
          displayCode: 'BD4',
          productName: 'Big Candle',
          unitPrice: '108.00',
          stockQuantity: 13,
          availableQty: 13,
        }),
      ],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    const pill = screen.getByRole('button', { name: /BD4/ });
    fireEvent.click(pill);
    // Drawer header rendered (includes displayCode + productName + price + counts)
    const header = screen.getByText(/BD4.*Big Candle.*RM108\.00.*13.*13/);
    expect(header).toBeDefined();
    // Subtitle now shows Selected
    expect(screen.getByText(/Selected: BD4/)).toBeDefined();
  });

  it('clicking expanded pill again collapses drawer', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ displayCode: 'CM1' })],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    const pill = screen.getByRole('button', { name: /CM1/ });
    fireEvent.click(pill);
    expect(screen.getByText(/Selected: CM1/)).toBeDefined();
    fireEvent.click(pill);
    expect(screen.getByText('คลิกรหัสเพื่อดู slot')).toBeDefined();
  });
});

describe('SaleBoardReadOnly — drawer renders slots from mapper', () => {
  it('renders empty drawer when stockQuantity is 0', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ displayCode: 'CM1', stockQuantity: 0, availableQty: 0 })],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    fireEvent.click(screen.getByRole('button', { name: /CM1/ }));
    expect(screen.getByText('ไม่มี slot')).toBeDefined();
  });

  it('renders filled slots with customer names from mapper', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 3 })],
      bookings: [
        booking({ customerName: 'Alice', status: 'CONFIRMED' }),
        booking({
          bookingId: 'bk-2',
          customerName: 'Bob',
          status: 'PENDING_REVIEW',
          createdAt: '2026-05-25T10:01:00.000Z',
        }),
      ],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText(/Alice/)).toBeDefined();
    expect(screen.getByText(/Bob/)).toBeDefined();
  });

  it('renders overflow warning when bookings exceed stock', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 1 })],
      bookings: [
        booking({ bookingId: 'bk-1', createdAt: '2026-05-25T10:00:00Z' }),
        booking({
          bookingId: 'bk-2',
          customerName: 'Bob',
          createdAt: '2026-05-25T10:01:00Z',
        }),
      ],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    const warning = screen.getByRole('alert');
    expect(warning).toBeDefined();
    expect(warning.textContent).toContain('1');
    expect(warning.textContent).toContain('booking');
  });

  it('does NOT render overflow warning when no overflow', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 5 })],
      bookings: [booking()],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('SaleBoardReadOnly — defaultSelectedDisplayCode prop', () => {
  it('drawer opens by default when prop matches a pill', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ displayCode: 'CM1' }), bp({ broadcastProductId: 'bp-2', displayCode: 'CM2' })],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} defaultSelectedDisplayCode="CM2" />);
    expect(screen.getByText(/Selected: CM2/)).toBeDefined();
  });

  it('drawer stays closed when prop is null', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ displayCode: 'CM1' })],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} defaultSelectedDisplayCode={null} />);
    expect(screen.getByText('คลิกรหัสเพื่อดู slot')).toBeDefined();
  });

  it('drawer stays closed when prop displayCode does not match any pill', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ displayCode: 'CM1' })],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} defaultSelectedDisplayCode="MISSING" />);
    expect(screen.getByText('คลิกรหัสเพื่อดู slot')).toBeDefined();
  });
});

describe('SaleBoardReadOnly — onSlotCancel callback', () => {
  it('renders cancel button on filled slot when onSlotCancel provided', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 1 })],
      bookings: [booking()],
    });
    const handler = vi.fn();
    render(<SaleBoardReadOnly viewModel={vm} onSlotCancel={handler} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    const cancelButtons = screen.queryAllByRole('button', { name: /cancel|ยกเลิก/i });
    expect(cancelButtons.length).toBeGreaterThan(0);
  });

  it('does NOT render cancel button on empty slots', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [bp({ stockQuantity: 3 })],
      bookings: [],
    });
    const handler = vi.fn();
    render(<SaleBoardReadOnly viewModel={vm} onSlotCancel={handler} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    // No cancel button because all slots empty
    const cancelButtons = screen.queryAllByRole('button', { name: /cancel|ยกเลิก/i });
    expect(cancelButtons.length).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('SaleBoardReadOnly — pill state propagation', () => {
  it('switching pill collapses prior drawer and opens new', () => {
    const vm = buildBoardViewModel({
      broadcastProducts: [
        bp({ displayCode: 'CM1' }),
        bp({ broadcastProductId: 'bp-2', displayCode: 'CM2' }),
      ],
      bookings: [],
    });
    render(<SaleBoardReadOnly viewModel={vm} />);
    fireEvent.click(screen.getByRole('button', { name: /CM1/ }));
    expect(screen.getByText(/Selected: CM1/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /CM2/ }));
    expect(screen.getByText(/Selected: CM2/)).toBeDefined();
    expect(screen.queryByText(/Selected: CM1/)).toBeNull();
  });
});
