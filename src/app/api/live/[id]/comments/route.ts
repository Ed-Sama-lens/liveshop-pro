import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { ok, error } from '@/lib/api/response';
import { toAppError } from '@/lib/errors';
import { fetchLiveComments, extractVideoId } from '@/lib/facebook/live-comments';

// GET /api/live/[id]/comments?videoUrl=...&after=...
// [id] is the LiveSession ID (for future linking), videoUrl is the FB live video URL
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    if (!user.shopId) {
      return NextResponse.json(error('No shop associated'), { status: 403 });
    }

    await params; // consume params (live session id — for future use)

    const videoUrl = request.nextUrl.searchParams.get('videoUrl') ?? '';
    const afterCursor = request.nextUrl.searchParams.get('after') ?? undefined;

    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(error('Facebook access token not configured'), { status: 500 });
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return NextResponse.json(error('Invalid video URL or ID'), { status: 400 });
    }

    const result = await fetchLiveComments(videoId, accessToken, afterCursor);

    return NextResponse.json(ok({
      comments: result.comments,
      nextCursor: result.nextCursor,
      videoId,
    }));
  } catch (err) {
    const appErr = toAppError(err);
    return NextResponse.json(error(appErr.message), { status: appErr.status });
  }
}
