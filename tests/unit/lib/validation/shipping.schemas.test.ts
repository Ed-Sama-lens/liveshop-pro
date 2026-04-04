import { describe, it, expect } from 'vitest';
import {
  createShipmentSchema,
  updateShipmentSchema,
  transitionShipmentSchema,
  shipmentQuerySchema,
  VALID_SHIPMENT_TRANSITIONS,
} from '@/lib/validation/shipping.schemas';

describe('createShipmentSchema', () => {
  it('accepts valid shipment with defaults', () => {
    const result = createShipmentSchema.safeParse({ orderId: 'order-1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe('MANUAL');
    }
  });

  it('accepts all providers', () => {
    for (const provider of ['KEX', 'JNT', 'MANUAL'] as const) {
      const result = createShipmentSchema.safeParse({ orderId: 'o1', provider });
      expect(result.success).toBe(true);
    }
  });

  it('accepts with tracking number', () => {
    const result = createShipmentSchema.safeParse({
      orderId: 'o1',
      provider: 'KEX',
      trackingNumber: 'TH123456789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing orderId', () => {
    const result = createShipmentSchema.safeParse({ provider: 'KEX' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid provider', () => {
    const result = createShipmentSchema.safeParse({ orderId: 'o1', provider: 'DHL' });
    expect(result.success).toBe(false);
  });
});

describe('updateShipmentSchema', () => {
  it('accepts tracking number', () => {
    const result = updateShipmentSchema.safeParse({ trackingNumber: 'TH999' });
    expect(result.success).toBe(true);
  });

  it('accepts label URL', () => {
    const result = updateShipmentSchema.safeParse({ labelUrl: 'https://example.com/label.pdf' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateShipmentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects invalid label URL', () => {
    const result = updateShipmentSchema.safeParse({ labelUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('transitionShipmentSchema', () => {
  it.each(['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] as const)(
    'accepts %s',
    (status) => {
      const result = transitionShipmentSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  );

  it('rejects invalid status', () => {
    const result = transitionShipmentSchema.safeParse({ status: 'LOST' });
    expect(result.success).toBe(false);
  });
});

describe('shipmentQuerySchema', () => {
  it('provides defaults', () => {
    const result = shipmentQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts all filters', () => {
    const result = shipmentQuerySchema.safeParse({
      status: 'IN_TRANSIT',
      provider: 'KEX',
      search: 'TH123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit > 100', () => {
    const result = shipmentQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});

describe('VALID_SHIPMENT_TRANSITIONS', () => {
  it('PENDING can go to ASSIGNED', () => {
    expect(VALID_SHIPMENT_TRANSITIONS['PENDING']).toEqual(['ASSIGNED']);
  });

  it('ASSIGNED can go to PICKED_UP or RETURNED', () => {
    expect(VALID_SHIPMENT_TRANSITIONS['ASSIGNED']).toEqual(['PICKED_UP', 'RETURNED']);
  });

  it('IN_TRANSIT can go to DELIVERED or RETURNED', () => {
    expect(VALID_SHIPMENT_TRANSITIONS['IN_TRANSIT']).toEqual(['DELIVERED', 'RETURNED']);
  });

  it('DELIVERED has no transitions', () => {
    expect(VALID_SHIPMENT_TRANSITIONS['DELIVERED']).toEqual([]);
  });

  it('RETURNED has no transitions', () => {
    expect(VALID_SHIPMENT_TRANSITIONS['RETURNED']).toEqual([]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(VALID_SHIPMENT_TRANSITIONS)).toBe(true);
  });
});
