import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { isPublicPath, canAccess } from '@/lib/auth/permissions';
import { logger } from '@/lib/logging/logger';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
