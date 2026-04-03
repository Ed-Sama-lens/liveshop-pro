import { describe, it, expect } from 'vitest';
import { ok, error, paginated } from '@/lib/api/response';

describe('ok()', () => {
  it('returns success: true with data', () => {
    const result = ok({ id: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1 });
  });

  it('returns a new object — does not mutate input', () => {
    const input = { id: 1 };
    const result = ok(input);
    expect(result).not.toBe(input);
    expect(result.data).not.toBe(result);
  });

  it('data matches the input value', () => {
    const data = [1, 2, 3];
    const result = ok(data);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('has no error field on success', () => {
    const result = ok('hello');
    expect(result.error).toBeUndefined();
  });
});

describe('error()', () => {
  it('returns success: false with error message', () => {
    const result = error('Something failed');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Something failed');
  });

  it('has no data field on error', () => {
    const result = error('oops');
    expect(result.data).toBeUndefined();
  });
});

describe('paginated()', () => {
  it('returns success: true with data and meta', () => {
    const result = paginated([1, 2, 3], { total: 25, page: 1, limit: 10 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('calculates totalPages correctly', () => {
    const result = paginated([1, 2, 3], { total: 25, page: 1, limit: 10 });
    expect(result.meta?.totalPages).toBe(3);
    expect(result.meta?.total).toBe(25);
    expect(result.meta?.page).toBe(1);
    expect(result.meta?.limit).toBe(10);
  });

  it('rounds up totalPages for partial last page', () => {
    const result = paginated([], { total: 21, page: 1, limit: 10 });
    expect(result.meta?.totalPages).toBe(3);
  });

  it('calculates totalPages = 1 when total equals limit', () => {
    const result = paginated(['a', 'b'], { total: 10, page: 1, limit: 10 });
    expect(result.meta?.totalPages).toBe(1);
  });

  it('returns a frozen object — immutable', () => {
    const result = paginated(['a'], { total: 1, page: 1, limit: 10 });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
