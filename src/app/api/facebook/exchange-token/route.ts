import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { exchangeForLongLivedToken } from '@/lib/facebook/live-comments';

// POST /api/facebook/exchange-token — exchange short-lived token for long-lived (60 days)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId || !['OWNER', 'MANAGER'].includes(user.role)) {
      return NextResponse.json(error('Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const shortToken = body.accessToken as string;

    if (!shortToken) {
      return NextResponse.json(error('Access token is required'), { status: 400 });
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(error('Facebook App credentials not configured'), { status: 500 });
    }

    const result = await exchangeForLongLivedToken(shortToken, appId, appSecret);

    return NextResponse.json(ok({
      message: 'Token exchanged successfully. Copy the token to your .env file as FACEBOOK_PAGE_ACCESS_TOKEN',
      expiresInDays: Math.floor(result.expiresIn / 86400),
      // We return the token to the admin so they can save it in .env
      // This is safe because only OWNER/MANAGER can call this endpoint
      accessToken: result.accessToken,
    }));
  } catch (err) {
    return NextResponse.json(error(err instanceof Error ? err.message : 'Token exchange failed'), { status: 500 });
  }
}
