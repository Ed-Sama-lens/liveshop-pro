import { describe, it, expect } from 'vitest';
import {
  buildPatchBody,
  hasNoChanges,
} from '@/components/sale/edit-product-code.helpers';

describe('buildPatchBody', () => {
  const base = {
    currentPriceOverrideField: '',
    currentIsPinnedField: false,
    initialPriceOverride: '',
    initialIsPinned: false,
  };

  it('returns empty object when nothing changed', () => {
    const body = buildPatchBody(base);
    expect(Object.keys(body)).toHaveLength(0);
  });

  it('sends string priceOverride when admin enters a value from blank', () => {
    const body = buildPatchBody({
      ...base,
      currentPriceOverrideField: '12.50',
    });
    expect(body.priceOverride).toBe('12.50');
  });

  it('trims whitespace from priceOverride before send', () => {
    const body = buildPatchBody({
      ...base,
      currentPriceOverrideField: '  9.99  ',
    });
    expect(body.priceOverride).toBe('9.99');
  });

  it('sends explicit null when admin clears existing priceOverride', () => {
    const body = buildPatchBody({
      ...base,
      currentPriceOverrideField: '',
      initialPriceOverride: '15.00',
    });
    expect(body.priceOverride).toBeNull();
  });

  it('sends explicit null when admin clears to whitespace', () => {
    const body = buildPatchBody({
      ...base,
      currentPriceOverrideField: '   ',
      initialPriceOverride: '15.00',
    });
    expect(body.priceOverride).toBeNull();
  });

  it('omits priceOverride when value unchanged', () => {
    const body = buildPatchBody({
      ...base,
      currentPriceOverrideField: '12.50',
      initialPriceOverride: '12.50',
    });
    expect(body.priceOverride).toBeUndefined();
  });

  it('omits priceOverride when both initial and current are blank', () => {
    const body = buildPatchBody({
      ...base,
      currentPriceOverrideField: '',
      initialPriceOverride: '',
    });
    expect(body.priceOverride).toBeUndefined();
  });

  it('sends isPinned true when admin pinned a previously unpinned BP', () => {
    const body = buildPatchBody({
      ...base,
      currentIsPinnedField: true,
    });
    expect(body.isPinned).toBe(true);
  });

  it('sends isPinned false when admin unpinned a pinned BP', () => {
    const body = buildPatchBody({
      ...base,
      currentIsPinnedField: false,
      initialIsPinned: true,
    });
    expect(body.isPinned).toBe(false);
  });

  it('omits isPinned when unchanged', () => {
    const body = buildPatchBody({
      ...base,
      currentIsPinnedField: false,
      initialIsPinned: false,
    });
    expect(body.isPinned).toBeUndefined();
  });

  it('combines priceOverride change + isPinned toggle in one body', () => {
    const body = buildPatchBody({
      currentPriceOverrideField: '20.00',
      currentIsPinnedField: true,
      initialPriceOverride: '15.00',
      initialIsPinned: false,
    });
    expect(body.priceOverride).toBe('20.00');
    expect(body.isPinned).toBe(true);
  });

  it('returns a frozen object', () => {
    const body = buildPatchBody(base);
    expect(Object.isFrozen(body)).toBe(true);
  });
});

describe('hasNoChanges', () => {
  const base = {
    currentPriceOverrideField: '',
    currentIsPinnedField: false,
    initialPriceOverride: '',
    initialIsPinned: false,
  };

  it('returns true when nothing changed', () => {
    expect(hasNoChanges(base)).toBe(true);
  });

  it('returns false when priceOverride changed', () => {
    expect(
      hasNoChanges({ ...base, currentPriceOverrideField: '12.50' })
    ).toBe(false);
  });

  it('returns false when isPinned changed', () => {
    expect(hasNoChanges({ ...base, currentIsPinnedField: true })).toBe(false);
  });

  it('returns false when priceOverride cleared', () => {
    expect(
      hasNoChanges({
        ...base,
        currentPriceOverrideField: '',
        initialPriceOverride: '12.50',
      })
    ).toBe(false);
  });
});
