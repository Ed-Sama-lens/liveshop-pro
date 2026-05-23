/**
 * Meta webhook payload parser — Tier 4.1-prep (2026-05-23).
 *
 * Pure functions ONLY. No I/O. No fetch. No prisma. No outbound.
 *
 * Maps Meta webhook payloads to a unified internal `ParsedEvent` shape
 * that the future `/api/meta/webhook` route (Tier 4.1-C) will write
 * into Conversation + Message + ChannelIdentity tables.
 *
 * Lands as parser foundation before the route. Lets Tier 4.1-F
 * integration tests verify the parse logic against canned fixtures
 * without spinning up the route.
 *
 * NOT WIRED to any route or DB writer. Skeleton only.
 */

export type ParsedEventType =
  | 'PAGE_INBOX_TEXT'
  | 'PAGE_INBOX_IMAGE'
  | 'PAGE_INBOX_POSTBACK'
  | 'PAGE_POST_COMMENT'
  | 'PAGE_LIVE_COMMENT'
  | 'UNKNOWN';

export interface ParsedEvent {
  readonly type: ParsedEventType;
  readonly platformPageId: string | null;
  readonly platformUserId: string | null;
  readonly displayName: string | null;
  readonly platformMessageId: string | null;
  readonly text: string | null;
  /** Unix ms timestamp. */
  readonly timestamp: number | null;
  /** Image / attachment URL when present. */
  readonly attachmentUrl: string | null;
  /** Postback payload string when event is a quick-reply postback. */
  readonly postbackPayload: string | null;
  /** Post ID for feed events; null for messaging / live. */
  readonly postId: string | null;
  /** Live video ID for live comment events. */
  readonly liveVideoId: string | null;
}

const EMPTY_EVENT: ParsedEvent = Object.freeze({
  type: 'UNKNOWN',
  platformPageId: null,
  platformUserId: null,
  displayName: null,
  platformMessageId: null,
  text: null,
  timestamp: null,
  attachmentUrl: null,
  postbackPayload: null,
  postId: null,
  liveVideoId: null,
});

/**
 * Type guard: payload looks like a Meta Page webhook envelope.
 */
function isPageEnvelope(p: unknown): p is { object: 'page'; entry: unknown[] } {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as Record<string, unknown>).object === 'page' &&
    Array.isArray((p as Record<string, unknown>).entry)
  );
}

/**
 * Type guard: object that looks like Live Comment polling shape.
 * (Live comments arrive via Graph API polling, not webhook envelope.)
 */
function isLiveCommentShape(p: unknown): p is {
  id: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; name?: string };
  live_video_id?: string;
} {
  if (typeof p !== 'object' || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.live_video_id === 'string'
  );
}

/**
 * Best-effort string read.
 */
function readString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Best-effort number read.
 */
function readNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Parse a single Meta webhook payload into a unified ParsedEvent.
 *
 * Returns the first event extracted from the payload. Multi-event
 * payloads should be split by the caller and `parseMetaWebhookPayload`
 * called per item.
 */
export function parseMetaWebhookPayload(payload: unknown): ParsedEvent {
  // Live Comment polling shape (not wrapped in `entry`).
  if (isLiveCommentShape(payload)) {
    const obj = payload as Record<string, unknown>;
    const from = (obj.from ?? {}) as Record<string, unknown>;
    return Object.freeze({
      ...EMPTY_EVENT,
      type: 'PAGE_LIVE_COMMENT' as const,
      platformUserId: readString(from, 'id'),
      displayName: readString(from, 'name'),
      platformMessageId: readString(obj, 'id'),
      text: readString(obj, 'message'),
      timestamp: parseIsoToMs(readString(obj, 'created_time')),
      liveVideoId: readString(obj, 'live_video_id'),
    });
  }

  // Standard Meta Page envelope.
  if (!isPageEnvelope(payload)) return EMPTY_EVENT;

  const entry = payload.entry[0] as Record<string, unknown> | undefined;
  if (entry === undefined) return EMPTY_EVENT;

  const platformPageId = readString(entry, 'id');

  // Messaging branch (Page Inbox).
  const messaging = entry.messaging as unknown[] | undefined;
  if (Array.isArray(messaging) && messaging.length > 0) {
    const m = messaging[0] as Record<string, unknown>;
    const sender = (m.sender ?? {}) as Record<string, unknown>;
    const timestamp = readNumber(m, 'timestamp');
    const platformUserId = readString(sender, 'id');

    // Postback branch.
    const postback = m.postback as Record<string, unknown> | undefined;
    if (postback !== undefined) {
      return Object.freeze({
        ...EMPTY_EVENT,
        type: 'PAGE_INBOX_POSTBACK' as const,
        platformPageId,
        platformUserId,
        platformMessageId: readString(postback, 'mid'),
        text: readString(postback, 'title'),
        timestamp,
        postbackPayload: readString(postback, 'payload'),
      });
    }

    // Message branch.
    const message = m.message as Record<string, unknown> | undefined;
    if (message !== undefined) {
      const attachments = message.attachments as unknown[] | undefined;
      if (Array.isArray(attachments) && attachments.length > 0) {
        const first = attachments[0] as Record<string, unknown>;
        const payloadObj = (first.payload ?? {}) as Record<string, unknown>;
        return Object.freeze({
          ...EMPTY_EVENT,
          type: 'PAGE_INBOX_IMAGE' as const,
          platformPageId,
          platformUserId,
          platformMessageId: readString(message, 'mid'),
          text: readString(message, 'text'),
          timestamp,
          attachmentUrl: readString(payloadObj, 'url'),
        });
      }
      return Object.freeze({
        ...EMPTY_EVENT,
        type: 'PAGE_INBOX_TEXT' as const,
        platformPageId,
        platformUserId,
        platformMessageId: readString(message, 'mid'),
        text: readString(message, 'text'),
        timestamp,
      });
    }
  }

  // Feed branch (Post Comment).
  const changes = entry.changes as unknown[] | undefined;
  if (Array.isArray(changes) && changes.length > 0) {
    const change = changes[0] as Record<string, unknown>;
    if (change.field === 'feed') {
      const value = (change.value ?? {}) as Record<string, unknown>;
      const from = (value.from ?? {}) as Record<string, unknown>;
      if (value.item === 'comment') {
        return Object.freeze({
          ...EMPTY_EVENT,
          type: 'PAGE_POST_COMMENT' as const,
          platformPageId,
          platformUserId: readString(from, 'id'),
          displayName: readString(from, 'name'),
          platformMessageId: readString(value, 'comment_id'),
          text: readString(value, 'message'),
          timestamp:
            (readNumber(value, 'created_time') ?? 0) * 1000 || null,
          postId: readString(value, 'post_id'),
        });
      }
    }
  }

  return EMPTY_EVENT;
}

/**
 * Pure: ISO8601 → UTC ms. Returns null on parse failure.
 */
function parseIsoToMs(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
