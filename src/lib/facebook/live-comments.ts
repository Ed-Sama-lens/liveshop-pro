/**
 * Facebook Live Comments service.
 *
 * Fetches comments from a Facebook Live Video using the Graph API.
 * Uses the admin's User Access Token (stored in env) which has
 * implicit access to Pages they administer.
 *
 * Flow:
 * 1. Admin pastes a Facebook Live Video URL
 * 2. We extract the video ID from the URL
 * 3. Poll GET /{video_id}/comments every few seconds
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v25.0';

// ─── Types ────────────────────────────────────────────────────────────────

export interface LiveComment {
  readonly id: string;
  readonly message: string;
  readonly from: {
    readonly id: string;
    readonly name: string;
  };
  readonly created_time: string;
}

interface CommentsResponse {
  data: LiveComment[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

// ─── Extract Video ID ─────────────────────────────────────────────────────

/**
 * Extract Facebook video ID from various URL formats:
 * - https://www.facebook.com/page/videos/123456/
 * - https://www.facebook.com/watch/live/?v=123456
 * - https://fb.watch/xxxxx/
 * - Just the numeric ID itself
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();

  // Already a numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  // URL with ?v= parameter
  try {
    const url = new URL(trimmed);
    const vParam = url.searchParams.get('v');
    if (vParam && /^\d+$/.test(vParam)) return vParam;
  } catch {
    // not a valid URL
  }

  // URL with /videos/ID/ pattern
  const videosMatch = trimmed.match(/\/videos\/(\d+)/);
  if (videosMatch) return videosMatch[1];

  // URL with /reel/ID pattern
  const reelMatch = trimmed.match(/\/reel\/(\d+)/);
  if (reelMatch) return reelMatch[1];

  // Generic numeric ID in URL path
  const genericMatch = trimmed.match(/\/(\d{10,})/);
  if (genericMatch) return genericMatch[1];

  return null;
}

// ─── Fetch Comments ───────────────────────────────────────────────────────

/**
 * Fetch comments from a Facebook Live Video.
 * Returns new comments since `afterCursor` (if provided).
 */
export async function fetchLiveComments(
  videoId: string,
  accessToken: string,
  afterCursor?: string
): Promise<{ comments: readonly LiveComment[]; nextCursor: string | null }> {
  const params = new URLSearchParams({
    fields: 'id,message,from,created_time',
    order: 'chronological',
    limit: '100',
    access_token: accessToken,
  });

  if (afterCursor) {
    params.set('after', afterCursor);
  }

  const res = await fetch(`${GRAPH_API_BASE}/${videoId}/comments?${params.toString()}`);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      `Facebook API error: ${(errorBody as any)?.error?.message ?? res.statusText}`
    );
  }

  const body: CommentsResponse = await res.json();

  return Object.freeze({
    comments: Object.freeze(body.data ?? []),
    nextCursor: body.paging?.cursors?.after ?? null,
  });
}

// ─── Exchange for Long-Lived Token ────────────────────────────────────────

/**
 * Exchange a short-lived User Access Token for a long-lived one (~60 days).
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      `Token exchange failed: ${(errorBody as any)?.error?.message ?? res.statusText}`
    );
  }

  const body = await res.json();

  return Object.freeze({
    accessToken: body.access_token as string,
    expiresIn: (body.expires_in as number) ?? 5184000, // default 60 days
  });
}
