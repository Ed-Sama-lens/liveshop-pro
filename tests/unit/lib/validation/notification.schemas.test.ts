import { describe, it, expect } from 'vitest';
import {
  notificationQuerySchema,
  markNotificationsReadSchema,
} from '@/lib/validation/notification.schemas';

describe('notificationQuerySchema', () => {
  it('accepts empty object with defaults', () => {
    const result = notificationQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.unreadOnly).toBe(false);
    expect(result.type).toBeUndefined();
  });

  it('accepts valid page and limit', () => {
    const result = notificationQuerySchema.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('coerces string page to number', () => {
    const result = notificationQuerySchema.parse({ page: '2' });
    expect(result.page).toBe(2);
  });

  it('transforms unreadOnly string to boolean', () => {
    const result = notificationQuerySchema.parse({ unreadOnly: 'true' });
    expect(result.unreadOnly).toBe(true);
  });

  it('accepts valid type filter', () => {
    const result = notificationQuerySchema.parse({ type: 'NEW_ORDER' });
    expect(result.type).toBe('NEW_ORDER');
  });

  it('accepts LOW_STOCK type', () => {
    const result = notificationQuerySchema.parse({ type: 'LOW_STOCK' });
    expect(result.type).toBe('LOW_STOCK');
  });

  it('accepts SHIPMENT_UPDATE type', () => {
    const result = notificationQuerySchema.parse({ type: 'SHIPMENT_UPDATE' });
    expect(result.type).toBe('SHIPMENT_UPDATE');
  });

  it('rejects invalid type', () => {
    const result = notificationQuerySchema.safeParse({ type: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('rejects page < 1', () => {
    const result = notificationQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects limit > 100', () => {
    const result = notificationQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });
});

describe('markNotificationsReadSchema', () => {
  it('accepts valid ids array', () => {
    const result = markNotificationsReadSchema.parse({ ids: ['abc', 'def'] });
    expect(result.ids).toEqual(['abc', 'def']);
  });

  it('accepts single id', () => {
    const result = markNotificationsReadSchema.parse({ ids: ['abc'] });
    expect(result.ids).toEqual(['abc']);
  });

  it('rejects empty ids array', () => {
    const result = markNotificationsReadSchema.safeParse({ ids: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing ids', () => {
    const result = markNotificationsReadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects ids with empty strings', () => {
    const result = markNotificationsReadSchema.safeParse({ ids: [''] });
    expect(result.success).toBe(false);
  });

  it('rejects too many ids (> 100)', () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const result = markNotificationsReadSchema.safeParse({ ids });
    expect(result.success).toBe(false);
  });
});
