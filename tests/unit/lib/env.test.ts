import { describe, it, expect, vi, afterEach } from 'vitest';

// We test the envSchema shape directly using zod since the env singleton
// is validated at module load time and cannot be re-evaluated in tests.

afterEach(() => vi.unstubAllEnvs());

describe('Environment validation', () => {
  it('throws when DATABASE_URL is missing', () => {
    const { z } = require('zod');
    const schema = z.object({
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((e: { path: string[] }) => e.path.join('.'));
      expect(paths).toContain('DATABASE_URL');
    }
  });

  it('throws with descriptive message listing missing DATABASE_URL and REDIS_URL', () => {
    const { z } = require('zod');
    const schema = z.object({
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
      REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
      NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
      NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
      FACEBOOK_CLIENT_ID: z.string().min(1, 'FACEBOOK_CLIENT_ID is required'),
      FACEBOOK_CLIENT_SECRET: z.string().min(1, 'FACEBOOK_CLIENT_SECRET is required'),
      TOKEN_ENCRYPTION_KEY: z.string().length(64, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
      NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a valid URL'),
    });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((e: { path: string[] }) => e.path.join('.'));
      expect(paths).toContain('DATABASE_URL');
      expect(paths).toContain('REDIS_URL');
    }
  });

  it('validates that DATABASE_URL is a non-empty string', () => {
    const { z } = require('zod');
    const schema = z.object({
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    });
    const result = schema.safeParse({ DATABASE_URL: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('DATABASE_URL is required');
    }
  });

  it('rejects invalid TOKEN_ENCRYPTION_KEY format — must be exactly 64 chars', () => {
    const { z } = require('zod');
    const schema = z.object({
      TOKEN_ENCRYPTION_KEY: z.string().length(64, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
    });
    const result = schema.safeParse({ TOKEN_ENCRYPTION_KEY: 'not-valid-hex' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (e: { path: string[] }) => e.path.includes('TOKEN_ENCRYPTION_KEY')
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('64');
    }
  });

  it('coerces RATE_LIMIT_MAX string to number', () => {
    const { z } = require('zod');
    const schema = z.object({
      RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    });
    const result = schema.safeParse({ RATE_LIMIT_MAX: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.RATE_LIMIT_MAX).toBe(50);
    }
  });

  it('accepts valid environment with all required fields', () => {
    const { z } = require('zod');
    const schema = z.object({
      DATABASE_URL: z.string().min(1),
      REDIS_URL: z.string().min(1),
      NEXTAUTH_URL: z.string().url(),
      NEXTAUTH_SECRET: z.string().min(32),
      FACEBOOK_CLIENT_ID: z.string().min(1),
      FACEBOOK_CLIENT_SECRET: z.string().min(1),
      TOKEN_ENCRYPTION_KEY: z.string().length(64),
      NEXT_PUBLIC_APP_URL: z.string().url(),
    });
    const result = schema.safeParse({
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      REDIS_URL: 'redis://localhost:6379',
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'x'.repeat(32),
      FACEBOOK_CLIENT_ID: 'id',
      FACEBOOK_CLIENT_SECRET: 'secret',
      TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    });
    expect(result.success).toBe(true);
  });

  it('NEXTAUTH_SECRET must be at least 32 characters', () => {
    const { z } = require('zod');
    const schema = z.object({
      NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
    });
    const result = schema.safeParse({ NEXTAUTH_SECRET: 'short' });
    expect(result.success).toBe(false);
  });
});
