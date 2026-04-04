import { describe, it, expect } from 'vitest';
import {
  orderItemSchema,
  createOrderSchema,
  updateOrderSchema,
  transitionOrderSchema,
  createPaymentSchema,
  verifyPaymentSchema,
  orderQuerySchema,
  VALID_TRANSITIONS,
} from '@/lib/validation/order.schemas';

describe('orderItemSchema', () => {
  it('accepts valid item', () => {
    const result = orderItemSchema.safeParse({
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 2,
      unitPrice: '100',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing productId', () => {
    const result = orderItemSchema.safeParse({
      variantId: 'var-1',
      quantity: 1,
      unitPrice: '50',
    });
    expect(result.success).toBe(false);
  });

  it('rejects quantity < 1', () => {
    const result = orderItemSchema.safeParse({
      productId: 'p1',
      variantId: 'v1',
      quantity: 0,
      unitPrice: '50',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    const result = orderItemSchema.safeParse({
      productId: 'p1',
      variantId: 'v1',
      quantity: 1.5,
      unitPrice: '50',
    });
    expect(result.success).toBe(false);
  });
});

describe('createOrderSchema', () => {
  const validOrder = {
    customerId: 'cust-1',
    items: [
      { productId: 'p1', variantId: 'v1', quantity: 1, unitPrice: '100' },
    ],
  };

  it('accepts valid order with defaults', () => {
    const result = createOrderSchema.safeParse(validOrder);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe('MANUAL');
      expect(result.data.shippingFee).toBe('0');
    }
  });

  it('accepts order with all fields', () => {
    const result = createOrderSchema.safeParse({
      ...validOrder,
      channel: 'FACEBOOK',
      shippingFee: '50',
      notes: 'Rush order',
      idempotencyKey: 'key-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty items array', () => {
    const result = createOrderSchema.safeParse({
      customerId: 'cust-1',
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing customerId', () => {
    const result = createOrderSchema.safeParse({
      items: [{ productId: 'p1', variantId: 'v1', quantity: 1, unitPrice: '100' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid channel', () => {
    const result = createOrderSchema.safeParse({
      ...validOrder,
      channel: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateOrderSchema', () => {
  it('accepts notes only', () => {
    const result = updateOrderSchema.safeParse({ notes: 'Updated note' });
    expect(result.success).toBe(true);
  });

  it('accepts shippingFee only', () => {
    const result = updateOrderSchema.safeParse({ shippingFee: '25' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateOrderSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('transitionOrderSchema', () => {
  it('accepts valid status', () => {
    const result = transitionOrderSchema.safeParse({ status: 'CONFIRMED' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = transitionOrderSchema.safeParse({ status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it.each(['RESERVED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const)(
    'accepts %s',
    (status) => {
      const result = transitionOrderSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  );
});

describe('createPaymentSchema', () => {
  it('accepts valid payment with defaults', () => {
    const result = createPaymentSchema.safeParse({ amount: '500' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe('TRANSFER');
    }
  });

  it('accepts all payment methods', () => {
    for (const method of ['TRANSFER', 'QR_CODE', 'COD'] as const) {
      const result = createPaymentSchema.safeParse({ amount: '100', method });
      expect(result.success).toBe(true);
    }
  });

  it('rejects missing amount', () => {
    const result = createPaymentSchema.safeParse({ method: 'TRANSFER' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid method', () => {
    const result = createPaymentSchema.safeParse({ amount: '100', method: 'BITCOIN' });
    expect(result.success).toBe(false);
  });
});

describe('verifyPaymentSchema', () => {
  it('accepts true', () => {
    const result = verifyPaymentSchema.safeParse({ verified: true });
    expect(result.success).toBe(true);
  });

  it('accepts false', () => {
    const result = verifyPaymentSchema.safeParse({ verified: false });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean', () => {
    const result = verifyPaymentSchema.safeParse({ verified: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('orderQuerySchema', () => {
  it('provides defaults', () => {
    const result = orderQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('coerces string page/limit', () => {
    const result = orderQuerySchema.safeParse({ page: '3', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit > 100', () => {
    const result = orderQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });

  it('accepts all filter fields', () => {
    const result = orderQuerySchema.safeParse({
      search: 'ORD-',
      status: 'SHIPPED',
      channel: 'FACEBOOK',
      customerId: 'c1',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    });
    expect(result.success).toBe(true);
  });
});

describe('VALID_TRANSITIONS', () => {
  it('RESERVED can go to CONFIRMED or CANCELLED', () => {
    expect(VALID_TRANSITIONS['RESERVED']).toEqual(['CONFIRMED', 'CANCELLED']);
  });

  it('CONFIRMED can go to PACKED or CANCELLED', () => {
    expect(VALID_TRANSITIONS['CONFIRMED']).toEqual(['PACKED', 'CANCELLED']);
  });

  it('SHIPPED can only go to DELIVERED', () => {
    expect(VALID_TRANSITIONS['SHIPPED']).toEqual(['DELIVERED']);
  });

  it('DELIVERED has no transitions', () => {
    expect(VALID_TRANSITIONS['DELIVERED']).toEqual([]);
  });

  it('CANCELLED has no transitions', () => {
    expect(VALID_TRANSITIONS['CANCELLED']).toEqual([]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(VALID_TRANSITIONS)).toBe(true);
  });
});
