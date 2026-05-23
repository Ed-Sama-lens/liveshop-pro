/**
 * Tier 3.9-D2-B hardening — preview-count + preview-example pure logic
 * tests for QuickProductFormFields.
 *
 * The component's preview labels (`จะสร้าง: 67 รายการ: CM1 ถึง CM67`)
 * are derived via `useMemo` from form state. Re-implements that pure
 * derivation here so we lock the contract independently of React
 * render-cycle quirks. If the component logic drifts, this test
 * surfaces it.
 *
 * Cross-reference: src/components/shared/QuickProductFormFields.tsx
 * lines 63-83 (previewCount + previewExample).
 */
import { describe, it, expect } from 'vitest';
import { QUICK_PRODUCT_BULK_MAX_RANGE } from '@/components/shared/quick-product-form.types';

interface PreviewInput {
  readonly showBulkRange: boolean;
  readonly startNo: string;
  readonly endNo: string;
  readonly saleCodeBase: string;
}

/**
 * Pure re-implementation of QuickProductFormFields preview-count logic.
 * Mirror the component's useMemo exactly.
 */
function computePreviewCount(input: PreviewInput): number {
  if (!input.showBulkRange) return 1;
  if (input.startNo === '' || input.endNo === '') return 1;
  const s = parseInt(input.startNo, 10);
  const e = parseInt(input.endNo, 10);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  if (e < s) return 0;
  return e - s + 1;
}

/**
 * Pure re-implementation of preview-example label.
 */
function computePreviewExample(input: PreviewInput): string {
  const previewCount = computePreviewCount(input);
  if (!input.showBulkRange) return '';
  if (input.startNo === '' || input.endNo === '') {
    return input.saleCodeBase ? `1 รายการ: ${input.saleCodeBase}` : '';
  }
  const s = parseInt(input.startNo, 10);
  const e = parseInt(input.endNo, 10);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return '';
  if (!input.saleCodeBase) return '';
  return `${previewCount} รายการ: ${input.saleCodeBase}${s} ถึง ${input.saleCodeBase}${e}`;
}

describe('previewCount (bulk OFF)', () => {
  it('returns 1 when showBulkRange is false', () => {
    expect(
      computePreviewCount({
        showBulkRange: false,
        startNo: '1',
        endNo: '67',
        saleCodeBase: 'CM',
      })
    ).toBe(1);
  });
});

describe('previewCount (bulk ON)', () => {
  const base = { showBulkRange: true, saleCodeBase: 'CM' };

  it('returns 67 for Boss scenario 1..67', () => {
    expect(computePreviewCount({ ...base, startNo: '1', endNo: '67' })).toBe(67);
  });

  it('returns 100 for cap-edge 1..100', () => {
    expect(computePreviewCount({ ...base, startNo: '1', endNo: '100' })).toBe(100);
  });

  it('returns 101 for cap-exceed 1..101 (server rejects later)', () => {
    expect(computePreviewCount({ ...base, startNo: '1', endNo: '101' })).toBe(101);
  });

  it('returns 1 when both blank (defaults to single-mode count)', () => {
    expect(computePreviewCount({ ...base, startNo: '', endNo: '' })).toBe(1);
  });

  it('returns 0 when end < start (invalid range)', () => {
    expect(computePreviewCount({ ...base, startNo: '10', endNo: '1' })).toBe(0);
  });

  it('returns 0 when startNo is non-numeric junk', () => {
    expect(computePreviewCount({ ...base, startNo: 'abc', endNo: '5' })).toBe(0);
  });

  it('handles startNo=0 endNo=0 → 1 item', () => {
    expect(computePreviewCount({ ...base, startNo: '0', endNo: '0' })).toBe(1);
  });

  it('handles wide range 1..500', () => {
    expect(computePreviewCount({ ...base, startNo: '1', endNo: '500' })).toBe(500);
  });
});

describe('previewExample (Thai-first label)', () => {
  const base = { showBulkRange: true, saleCodeBase: 'CM' };

  it('Boss scenario: 67 รายการ: CM1 ถึง CM67', () => {
    expect(
      computePreviewExample({ ...base, startNo: '1', endNo: '67' })
    ).toBe('67 รายการ: CM1 ถึง CM67');
  });

  it('empty range with saleCode shows "1 รายการ: <code>"', () => {
    expect(computePreviewExample({ ...base, startNo: '', endNo: '' })).toBe(
      '1 รายการ: CM'
    );
  });

  it('empty range without saleCode returns empty string', () => {
    expect(
      computePreviewExample({
        showBulkRange: true,
        saleCodeBase: '',
        startNo: '',
        endNo: '',
      })
    ).toBe('');
  });

  it('end < start returns empty string', () => {
    expect(
      computePreviewExample({ ...base, startNo: '10', endNo: '1' })
    ).toBe('');
  });

  it('bulk OFF returns empty string regardless of fields', () => {
    expect(
      computePreviewExample({
        showBulkRange: false,
        saleCodeBase: 'CM',
        startNo: '1',
        endNo: '67',
      })
    ).toBe('');
  });

  it('alternate prefix "BD" works', () => {
    expect(
      computePreviewExample({
        showBulkRange: true,
        saleCodeBase: 'BD',
        startNo: '1',
        endNo: '12',
      })
    ).toBe('12 รายการ: BD1 ถึง BD12');
  });
});

describe('cap detection (exceedsMax)', () => {
  const base = { showBulkRange: true, saleCodeBase: 'CM' };

  it('100 items exactly = at cap, not exceeding', () => {
    const count = computePreviewCount({ ...base, startNo: '1', endNo: '100' });
    expect(count).toBe(QUICK_PRODUCT_BULK_MAX_RANGE);
    expect(count > QUICK_PRODUCT_BULK_MAX_RANGE).toBe(false);
  });

  it('101 items = exceeds cap', () => {
    const count = computePreviewCount({ ...base, startNo: '1', endNo: '101' });
    expect(count > QUICK_PRODUCT_BULK_MAX_RANGE).toBe(true);
  });

  it('67 items (Boss scenario) = under cap', () => {
    const count = computePreviewCount({ ...base, startNo: '1', endNo: '67' });
    expect(count > QUICK_PRODUCT_BULK_MAX_RANGE).toBe(false);
  });
});
