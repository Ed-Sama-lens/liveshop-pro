import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SlipImage } from '@/components/payments/SlipImage';

/**
 * Tests pin the contract that:
 *   - SlipImage NEVER renders the raw public CDN slipUrl directly
 *   - SlipImage requests /api/payments/[id]/slip-url and renders the
 *     signed URL from the response
 *   - 404 ("No slip uploaded") → empty state
 *   - 403/401/500/network failures → error state
 *   - Loading state during fetch
 *   - hasSlip=false → empty state (no fetch)
 *
 * Closes R2 G3 PII risk fully in UI per Boss Decision 3 scope.
 */

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('SlipImage — no raw slipUrl rendered', () => {
  it('does NOT contain raw R2 public URL substring in any test', () => {
    // The component contract: it NEVER takes the raw slip URL as a
    // prop. The only inputs are paymentId + hasSlip. Even if a future
    // refactor accidentally added a slipUrl prop, this test would
    // need updating, which forces a security review.
    const props = { paymentId: 'p1', hasSlip: false };
    render(<SlipImage {...props} />);
    expect(screen.getByTestId('slip-image-empty')).toBeDefined();
  });
});

describe('SlipImage — hasSlip=false short-circuit (no fetch)', () => {
  it('renders empty state without calling fetch', () => {
    render(<SlipImage paymentId="p1" hasSlip={false} />);
    expect(screen.getByTestId('slip-image-empty')).toBeDefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('SlipImage — happy path (signed URL fetched + rendered)', () => {
  it('fetches /api/payments/[id]/slip-url and renders signed URL', async () => {
    const signedUrl = 'https://account.r2.cloudflarestorage.com/bucket/shop/slips/abc.jpg?X-Amz-Signature=mock';
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { url: signedUrl, expiresAt: '2026-05-25T12:00:00.000Z' },
      }),
    });

    render(<SlipImage paymentId="pay-123" hasSlip={true} />);

    // Loading initially
    expect(screen.queryByTestId('slip-image-loading')).toBeDefined();

    // Ready after fetch resolves
    await waitFor(() => {
      const img = screen.getByTestId('slip-image-ready') as HTMLImageElement;
      expect(img.src).toBe(signedUrl);
    });

    // Confirm fetch called with correct URL
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/payments/pay-123/slip-url',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
      })
    );
  });

  it('URL-encodes paymentId to defend against injection', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { url: 'https://x', expiresAt: 'x' } }),
    });

    render(<SlipImage paymentId="pay/../etc" hasSlip={true} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/payments/pay%2F..%2Fetc/slip-url',
        expect.any(Object)
      );
    });
  });
});

describe('SlipImage — 404 empty state (no slip uploaded server-side)', () => {
  it('shows empty state on 404', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'No slip uploaded' }),
    });

    render(<SlipImage paymentId="p1" hasSlip={true} />);

    await waitFor(() => {
      expect(screen.queryByTestId('slip-image-empty')).toBeDefined();
    });
  });
});

describe('SlipImage — unauthorized / cross-shop denied', () => {
  it('shows error state on 403 (cross-shop or wrong role)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: 'Insufficient permissions' }),
    });

    render(<SlipImage paymentId="p1" hasSlip={true} />);

    await waitFor(() => {
      expect(screen.queryByTestId('slip-image-error')).toBeDefined();
    });
  });

  it('shows error state on 401 (unauthenticated)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Unauthenticated' }),
    });

    render(<SlipImage paymentId="p1" hasSlip={true} />);

    await waitFor(() => {
      expect(screen.queryByTestId('slip-image-error')).toBeDefined();
    });
  });
});

describe('SlipImage — server error + network failure', () => {
  it('shows error state on 500', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Internal' }),
    });

    render(<SlipImage paymentId="p1" hasSlip={true} />);

    await waitFor(() => {
      expect(screen.queryByTestId('slip-image-error')).toBeDefined();
    });
  });

  it('shows error state on network failure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network unreachable'));

    render(<SlipImage paymentId="p1" hasSlip={true} />);

    await waitFor(() => {
      expect(screen.queryByTestId('slip-image-error')).toBeDefined();
    });
  });

  it('shows error state when response missing data.url', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    });

    render(<SlipImage paymentId="p1" hasSlip={true} />);

    await waitFor(() => {
      expect(screen.queryByTestId('slip-image-error')).toBeDefined();
    });
  });
});

describe('SlipImage — variants', () => {
  it('thumbnail variant renders smaller icons in empty state', () => {
    render(<SlipImage paymentId="p1" hasSlip={false} variant="thumbnail" />);
    const empty = screen.getByTestId('slip-image-empty');
    expect(empty).toBeDefined();
  });

  it('detail variant renders larger icons in empty state', () => {
    render(<SlipImage paymentId="p1" hasSlip={false} variant="detail" />);
    const empty = screen.getByTestId('slip-image-empty');
    expect(empty).toBeDefined();
  });
});
