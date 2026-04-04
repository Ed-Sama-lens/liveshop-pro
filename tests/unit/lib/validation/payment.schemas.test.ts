import { describe, it, expect } from 'vitest';
import { paymentQuerySchema, verifyPaymentSchema } from '@/lib/validation/payment.schemas';

describe('paymentQuerySchema', () => {
  it('applies defaults when empty', () => {
    const result = paymentQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('accepts valid filters', () => {
    const result = paymentQuerySchema.parse({
      page: '2',
      limit: '50',
      status: 'PENDING',
      method: 'QR_CODE',
    });
    expect(result.page).toBe(2);
    expect(result.status).toBe('PENDING');
    expect(result.method).toBe('QR_CODE');
  });

  it('rejects invalid status', () => {
    const result = paymentQuerySchema.safeParse({ status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid method', () => {
    const result = paymentQuerySchema.safeParse({ method: 'BITCOIN' });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 100', () => {
    const result = paymentQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });
});

describe('verifyPaymentSchema', () => {
  it('accepts VERIFY action', () => {
    const result = verifyPaymentSchema.parse({ action: 'VERIFY' });
    expect(result.action).toBe('VERIFY');
  });

  it('accepts REJECT action', () => {
    const result = verifyPaymentSchema.parse({ action: 'REJECT' });
    expect(result.action).toBe('REJECT');
  });

  it('accepts optional note', () => {
    const result = verifyPaymentSchema.parse({ action: 'VERIFY', note: 'Looks good' });
    expect(result.note).toBe('Looks good');
  });

  it('rejects invalid action', () => {
    const result = verifyPaymentSchema.safeParse({ action: 'APPROVE' });
    expect(result.success).toBe(false);
  });

  it('rejects note over 500 chars', () => {
    const result = verifyPaymentSchema.safeParse({ action: 'VERIFY', note: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
