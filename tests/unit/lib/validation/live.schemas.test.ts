import { describe, it, expect } from 'vitest';
import {
  createLiveSessionSchema,
  updateLiveSessionSchema,
  liveSessionQuerySchema,
  VALID_LIVE_TRANSITIONS,
} from '@/lib/validation/live.schemas';

describe('createLiveSessionSchema', () => {
  it('accepts valid session', () => {
    const result = createLiveSessionSchema.safeParse({ title: 'Flash Sale Friday' });
    expect(result.success).toBe(true);
  });

  it('accepts session with scheduled time', () => {
    const result = createLiveSessionSchema.safeParse({
      title: 'Weekend Live',
      scheduledAt: '2025-12-01T18:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = createLiveSessionSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title over 200 chars', () => {
    const result = createLiveSessionSchema.safeParse({ title: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = createLiveSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('updateLiveSessionSchema', () => {
  it('accepts title update', () => {
    const result = updateLiveSessionSchema.safeParse({ title: 'New Title' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateLiveSessionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts scheduledAt update', () => {
    const result = updateLiveSessionSchema.safeParse({
      scheduledAt: '2025-12-01T18:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('liveSessionQuerySchema', () => {
  it('provides defaults', () => {
    const result = liveSessionQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts status filter', () => {
    const result = liveSessionQuerySchema.safeParse({ status: 'LIVE' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = liveSessionQuerySchema.safeParse({ status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it.each(['SCHEDULED', 'LIVE', 'ENDED'] as const)('accepts %s', (status) => {
    const result = liveSessionQuerySchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  it('rejects limit > 100', () => {
    const result = liveSessionQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});

describe('VALID_LIVE_TRANSITIONS', () => {
  it('SCHEDULED can go to LIVE or ENDED', () => {
    expect(VALID_LIVE_TRANSITIONS['SCHEDULED']).toEqual(['LIVE', 'ENDED']);
  });

  it('LIVE can only go to ENDED', () => {
    expect(VALID_LIVE_TRANSITIONS['LIVE']).toEqual(['ENDED']);
  });

  it('ENDED has no transitions', () => {
    expect(VALID_LIVE_TRANSITIONS['ENDED']).toEqual([]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(VALID_LIVE_TRANSITIONS)).toBe(true);
  });
});
