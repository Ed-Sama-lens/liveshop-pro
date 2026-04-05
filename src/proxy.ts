import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { auth } from '@/lib/auth/auth';
import { isPublicPath, canAccess } from '@/lib/auth/permissions';
import { routing } from '@/i18n/routing';
import { logger } from '@/lib/logging/logger';

const intlMiddleware = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect legacy locale-prefixed URLs (e.g. /th/dashboard → /dashboard)
  const localeMatch = pathname.match(/^\/(en|th|zh)(\/.*)?$/);
  if (localeMatch) {
    const cleanPath = localeMatch[2] || '/';
    return NextResponse.redirect(new URL(cleanPath, request.url));
  }

  // Skip static assets and auth API
  const isStaticOrApi =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.');

  // Run intl middleware for cookie-based locale detection (no URL prefix)
  if (!isStaticOrApi) {
    const intlResponse = intlMiddleware(request);
    if (intlResponse && intlResponse.status !== 200) return intlResponse;
  }

  // API routes have their own auth via requireAuth() — skip middleware RBAC
  if (pathname.startsWith('/api/')) return NextResponse.next();

  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await auth();

  if (!session?.user) {
    const signInUrl = new URL('/auth/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  const { allowed, reason } = canAccess(pathname, session.user.role);

  if (!allowed) {
    logger.warn(
      { userId: session.user.id, role: session.user.role, pathname, reason },
      '[RBAC] Access denied',
    );
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
