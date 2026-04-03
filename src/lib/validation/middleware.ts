import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { z } from 'zod';
import { error as apiError } from '@/lib/api/response';

// ─── Rate Limiting ─────────────────────────────────────────────────────────

const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '20', 10);
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);

const rateLimiter = new RateLimiterMemory({
  points: rateLimitMax,
  duration: rateLimitWindowMs / 1000,
});

export async function withRateLimit(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  try {
    await rateLimiter.consume(ip);
    return await handler();
  } catch {
    return NextResponse.json(
      apiError('Too many requests. Please try again later.'),
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rateLimitWindowMs / 1000)) },
      }
    );
  }
}

// ─── CORS ──────────────────────────────────────────────────────────────────

export function getCorsHeaders(): Record<string, string> {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCorsPreFlight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

// ─── Zod Validation ────────────────────────────────────────────────────────

export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }

      return {
        error: NextResponse.json(
          { success: false, error: 'Validation failed', fields: fieldErrors },
          { status: 400 }
        ),
      };
    }

    return { data: result.data };
  } catch {
    return {
      error: NextResponse.json(
        apiError('Invalid JSON body'),
        { status: 400 }
      ),
    };
  }
}

export function validateQuery<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): { data: T } | { error: NextResponse } {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = schema.safeParse(params);

  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      if (!fieldErrors[path]) fieldErrors[path] = [];
      fieldErrors[path].push(issue.message);
    }

    return {
      error: NextResponse.json(
        { success: false, error: 'Validation failed', fields: fieldErrors },
        { status: 400 }
      ),
    };
  }

  return { data: result.data };
}
