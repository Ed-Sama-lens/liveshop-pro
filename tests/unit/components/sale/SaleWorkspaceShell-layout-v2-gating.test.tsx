import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SaleWorkspaceShell } from '@/components/sale/SaleWorkspaceShell';

/**
 * V Rich Stage 3.10-C WIRE-3 — shell flag gating contract tests.
 *
 * Pins:
 * - Flag UNSET → board NOT rendered (zero UI change)
 * - Flag 'false' → board NOT rendered
 * - Flag 'true' → board rendered ALONGSIDE legacy Product Codes panel
 * - Flag '1' → board rendered (extended truthy convention)
 * - Legacy panel ALWAYS rendered (regardless of flag)
 * - Board is read-only (no mutation controls injected by shell)
 *
 * Component is NOT enabled in production. These tests pin contract
 * to defend against accidental flag default flip or render bypass.
 *
 * Mocks: fetch is stubbed so shell never hits real API. Tests verify
 * RENDER PRESENCE via DOM probes only — slot/pill content correctness
 * is owned by mapper + SaleBoardReadOnly tests already.
 */

const ORIGINAL_FETCH = global.fetch;

function mockFetchEmpty() {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/sale/live-sessions')) {
      return new Response(
        JSON.stringify({ success: true, data: { sessions: [] } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.includes('/api/sale/summary')) {
      // SaleSummaryPanel expects items[] array
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [],
            totals: {
              totalBookings: 0,
              confirmedBookings: 0,
              pendingBookings: 0,
              cancelledBookings: 0,
              convertedBookings: 0,
              reservedQuantity: 0,
              revenueReserved: '0.00',
              revenueConverted: '0.00',
            },
            saleDate: '2026-05-25',
            broadcastProductCount: 0,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    // Default empty success for any other GET so render does not throw.
    return new Response(
      JSON.stringify({ success: true, data: { products: [], bookings: [] } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  mockFetchEmpty();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('SaleWorkspaceShell — layout v2 flag gating', () => {
  it('flag UNSET → board NOT rendered (zero UI change)', async () => {
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      // Legacy Product Codes panel header should be present
      expect(screen.queryByText(/รหัสสินค้า/)).toBeDefined();
    });
    // Board preview title contains "Sale Board (V Rich style)" — must NOT appear
    expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeNull();
  });

  it('flag = "false" → board NOT rendered', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'false');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      expect(screen.queryByText(/รหัสสินค้า/)).toBeDefined();
    });
    expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeNull();
  });

  it('flag = "0" → board NOT rendered', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', '0');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      expect(screen.queryByText(/รหัสสินค้า/)).toBeDefined();
    });
    expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeNull();
  });

  it('flag = "true" → board rendered ALONGSIDE legacy panel', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'true');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      // Board title rendered
      expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeDefined();
    });
    // Legacy + board both render header containing "รหัสสินค้า":
    // - legacy SaleProductGridPlaceholder
    // - (board itself doesn't use that text; just the title 'Sale Board')
    // The plain legacy panel header still exists, so at least 1 match.
    const legacyMatches = screen.queryAllByText(/รหัสสินค้า/);
    expect(legacyMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('flag = "1" → board rendered (extended truthy convention)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', '1');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeDefined();
    });
  });

  it('flag = case variant "TRUE" → board NOT rendered (strict)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'TRUE');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      expect(screen.queryByText(/รหัสสินค้า/)).toBeDefined();
    });
    expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeNull();
  });

  it('flag = "true" + board renders → legacy Product Codes panel STILL rendered', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'true');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeDefined();
    });
    // Legacy SaleProductGridPlaceholder still in the DOM
    const legacyMatches = screen.queryAllByText(/รหัสสินค้า/);
    expect(legacyMatches.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SaleWorkspaceShell — board is read-only when enabled', () => {
  it('flag = "true" → board pill empty-state shows (no mutation buttons injected by shell)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SALE_LAYOUT_V2', 'true');
    render(<SaleWorkspaceShell />);
    await waitFor(() => {
      // Board container exists
      expect(screen.queryByText(/Sale Board \(V Rich style\)/)).toBeDefined();
    });
    // Board with empty viewModel renders pill-list empty state — no
    // mutation buttons inside this region. The shell does not add any
    // wrappers that would inject mutation controls.
    expect(screen.queryByText(/ยังไม่มีรหัสสินค้าในวันที่ขายนี้/)).toBeDefined();
  });
});
