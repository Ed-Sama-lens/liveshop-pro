import { describe, it, expect } from 'vitest';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookLogQuerySchema,
  WEBHOOK_EVENTS,
} from '@/lib/validation/webhook.schemas';

describe('createWebhookSchema', () => {
  it('accepts valid webhook creation', () => {
    const result = createWebhookSchema.parse({
      url: 'https://example.com/webhook',
      events: ['order.created'],
    });
    expect(result.url).toBe('https://example.com/webhook');
    expect(result.events).toEqual(['order.created']);
  });

  it('accepts multiple events', () => {
    const result = createWebhookSchema.parse({
      url: 'https://example.com/webhook',
      events: ['order.created', 'order.confirmed', 'payment.received'],
    });
    expect(result.events).toHaveLength(3);
  });

  it('rejects invalid URL', () => {
    const result = createWebhookSchema.safeParse({
      url: 'not-a-url',
      events: ['order.created'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty events', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid event names', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: ['invalid.event'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing URL', () => {
    const result = createWebhookSchema.safeParse({
      events: ['order.created'],
    });
    expect(result.success).toBe(false);
  });
});

describe('updateWebhookSchema', () => {
  it('accepts partial update with URL', () => {
    const result = updateWebhookSchema.parse({
      url: 'https://new.example.com/webhook',
    });
    expect(result.url).toBe('https://new.example.com/webhook');
  });

  it('accepts isActive toggle', () => {
    const result = updateWebhookSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('accepts events update', () => {
    const result = updateWebhookSchema.parse({
      events: ['order.shipped', 'shipment.updated'],
    });
    expect(result.events).toHaveLength(2);
  });

  it('accepts empty object (no changes)', () => {
    const result = updateWebhookSchema.parse({});
    expect(result).toBeDefined();
  });
});

describe('webhookLogQuerySchema', () => {
  it('accepts defaults', () => {
    const result = webhookLogQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('coerces string page', () => {
    const result = webhookLogQuerySchema.parse({ page: '3' });
    expect(result.page).toBe(3);
  });

  it('rejects limit > 100', () => {
    const result = webhookLogQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});

describe('WEBHOOK_EVENTS', () => {
  it('contains expected events', () => {
    expect(WEBHOOK_EVENTS).toContain('order.created');
    expect(WEBHOOK_EVENTS).toContain('payment.verified');
    expect(WEBHOOK_EVENTS).toContain('shipment.updated');
    expect(WEBHOOK_EVENTS).toContain('customer.created');
  });

  it('has 10 events', () => {
    expect(WEBHOOK_EVENTS).toHaveLength(10);
  });
});
