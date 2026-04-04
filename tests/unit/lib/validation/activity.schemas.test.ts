import { describe, it, expect } from 'vitest';
import { activityLogQuerySchema } from '@/lib/validation/activity.schemas';

describe('activityLogQuerySchema', () => {
  it('applies defaults when empty', () => {
    const result = activityLogQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('accepts all filter fields', () => {
    const result = activityLogQuerySchema.parse({
      page: '2',
      limit: '50',
      entity: 'order',
      action: 'STATUS_CHANGE',
      userId: 'user_123',
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
    });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.entity).toBe('order');
    expect(result.action).toBe('STATUS_CHANGE');
    expect(result.userId).toBe('user_123');
    expect(result.from).toBe('2026-01-01T00:00:00Z');
  });

  it('rejects limit above 100', () => {
    const result = activityLogQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects page below 1', () => {
    const result = activityLogQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime for from', () => {
    const result = activityLogQuerySchema.safeParse({ from: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields omitted', () => {
    const result = activityLogQuerySchema.parse({ page: '3' });
    expect(result.page).toBe(3);
    expect(result.entity).toBeUndefined();
    expect(result.action).toBeUndefined();
  });
});
