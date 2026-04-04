import { describe, it, expect } from 'vitest';
import {
  createCustomerSchema,
  updateCustomerSchema,
  banCustomerSchema,
  customerQuerySchema,
} from '@/lib/validation/customer.schemas';

describe('createCustomerSchema', () => {
  it('accepts valid minimal input', () => {
    const result = createCustomerSchema.safeParse({ name: 'John Doe' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('John Doe');
      expect(result.data.labels).toEqual([]);
      expect(result.data.channel).toBe('MANUAL');
    }
  });

  it('accepts valid full input', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Jane Smith',
      phone: '0812345678',
      email: 'jane@example.com',
      facebookId: 'fb123',
      address: '123 Main St',
      district: 'Chatuchak',
      province: 'Bangkok',
      postalCode: '10900',
      labels: ['VIP', 'repeat'],
      shippingType: 'EXPRESS',
      notes: 'Good customer',
      channel: 'FACEBOOK',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Jane Smith');
      expect(result.data.channel).toBe('FACEBOOK');
      expect(result.data.shippingType).toBe('EXPRESS');
      expect(result.data.labels).toEqual(['VIP', 'repeat']);
    }
  });

  it('rejects missing name', () => {
    const result = createCustomerSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createCustomerSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = createCustomerSchema.safeParse({ name: 'Test', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('accepts empty email string', () => {
    const result = createCustomerSchema.safeParse({ name: 'Test', email: '' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid channel', () => {
    const result = createCustomerSchema.safeParse({ name: 'Test', channel: 'TWITTER' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid shipping type', () => {
    const result = createCustomerSchema.safeParse({ name: 'Test', shippingType: 'DRONE' });
    expect(result.success).toBe(false);
  });

  it('defaults labels to empty array', () => {
    const result = createCustomerSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.labels).toEqual([]);
    }
  });

  it('defaults channel to MANUAL', () => {
    const result = createCustomerSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe('MANUAL');
    }
  });
});

describe('updateCustomerSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = updateCustomerSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial update', () => {
    const result = updateCustomerSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Updated Name');
    }
  });

  it('accepts labels update', () => {
    const result = updateCustomerSchema.safeParse({ labels: ['VIP', 'wholesale'] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.labels).toEqual(['VIP', 'wholesale']);
    }
  });
});

describe('banCustomerSchema', () => {
  it('accepts empty object', () => {
    const result = banCustomerSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts reason', () => {
    const result = banCustomerSchema.safeParse({ reason: 'Fraud detected' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Fraud detected');
    }
  });
});

describe('customerQuerySchema', () => {
  it('provides defaults for empty input', () => {
    const result = customerQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('coerces page and limit from strings', () => {
    const result = customerQuerySchema.safeParse({ page: '3', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts search filter', () => {
    const result = customerQuerySchema.safeParse({ search: 'john' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe('john');
    }
  });

  it('accepts channel filter', () => {
    const result = customerQuerySchema.safeParse({ channel: 'FACEBOOK' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid channel', () => {
    const result = customerQuerySchema.safeParse({ channel: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('accepts label filter', () => {
    const result = customerQuerySchema.safeParse({ label: 'VIP' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('VIP');
    }
  });

  it('coerces isBanned from string', () => {
    const result = customerQuerySchema.safeParse({ isBanned: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isBanned).toBe(true);
    }
  });

  it('rejects page below 1', () => {
    const result = customerQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 100', () => {
    const result = customerQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });
});
