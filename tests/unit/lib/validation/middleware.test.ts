import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const mockConsume = vi.fn().mockResolvedValue(true);

vi.mock('rate-limiter-flexible', () => {
  function RateLimiterMemory(this: { consume: typeof mockConsume }) {
    this.consume = mockConsume;
  }
  return { RateLimiterMemory };
});

vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost/db');
vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
vi.stubEnv('NEXTAUTH_SECRET', 'x'.repeat(32));
vi.stubEnv('FACEBOOK_CLIENT_ID', 'id');
vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'secret');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'a'.repeat(64));

describe('withRateLimit()', () => {
  beforeEach(() => {
    mockConsume.mockResolvedValue(true);
  });

  it('calls handler when under limit and returns handler result', async () => {
    const { withRateLimit } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost:3000/api/test');
    const handlerResponse = NextResponse.json({ ok: true });
    const handler = vi.fn().mockResolvedValue(handlerResponse);
    const result = await withRateLimit(request, handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toBe(handlerResponse);
  });

  it('returns 429 NextResponse when limit exceeded', async () => {
    mockConsume.mockRejectedValueOnce(new Error('rate limit exceeded'));
    const { withRateLimit } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost:3000/api/test');
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const result = await withRateLimit(request, handler);
    expect(result.status).toBe(429);
  });

  it('429 response includes Retry-After header', async () => {
    mockConsume.mockRejectedValueOnce(new Error('rate limit exceeded'));
    const { withRateLimit } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const result = await withRateLimit(request, handler);
    expect(result.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('getCorsHeaders()', () => {
  it('returns specific origin — never wildcard', async () => {
    const { getCorsHeaders } = await import('@/lib/validation/middleware');
    const headers = getCorsHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
  });

  it('includes required CORS headers', async () => {
    const { getCorsHeaders } = await import('@/lib/validation/middleware');
    const headers = getCorsHeaders();
    expect(headers['Access-Control-Allow-Methods']).toBeTruthy();
    expect(headers['Access-Control-Allow-Headers']).toBeTruthy();
    expect(headers['Access-Control-Max-Age']).toBeTruthy();
  });

  it('Access-Control-Allow-Methods includes GET, POST, PUT, DELETE', async () => {
    const { getCorsHeaders } = await import('@/lib/validation/middleware');
    const headers = getCorsHeaders();
    const methods = headers['Access-Control-Allow-Methods'];
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });
});

describe('validateBody()', () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  it('returns { data } with parsed data on valid body', async () => {
    const { validateBody } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice', age: 30 }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await validateBody(request, schema);
    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.age).toBe(30);
    }
  });

  it('returns { error: NextResponse } with 400 on invalid body', async () => {
    const { validateBody } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ name: 123, age: 'not-a-number' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await validateBody(request, schema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it('returns { error: NextResponse } on malformed JSON body', async () => {
    const { validateBody } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost/api', {
      method: 'POST',
      body: 'not json {{',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await validateBody(request, schema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
      const body = await result.error.json();
      expect(body.error).toBe('Invalid JSON body');
    }
  });

  it('validation error response contains field errors', async () => {
    const { validateBody } = await import('@/lib/validation/middleware');
    const request = new NextRequest('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice' }), // missing age
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await validateBody(request, schema);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      const body = await result.error.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Validation failed');
    }
  });
});
