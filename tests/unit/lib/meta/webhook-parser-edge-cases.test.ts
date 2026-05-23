/**
 * Tier 4.1-prep hardening — parser edge cases for Meta webhook events.
 *
 * Existing `webhook-parser.test.ts` (34 tests) covers happy paths.
 * This file adds edge cases identified during Track 11 audit:
 *
 *   - edited comment (verb: edited)
 *   - deleted comment (verb: remove)
 *   - unsupported event type (reactions, etc.)
 *   - missing sender in messaging payload
 *   - malformed envelope (entry not an array)
 *   - duplicate delivery (same platformMessageId twice)
 *   - idempotency-key derivation pattern
 *   - PII minimization assertions
 *
 * Pure tests — no fetch, no Prisma, no I/O.
 */
import { describe, it, expect } from 'vitest';
import { parseMetaWebhookPayload } from '@/lib/meta/webhook-parser';

import editedComment from '../../../fixtures/meta/edited-comment.json';
import deletedComment from '../../../fixtures/meta/deleted-comment.json';
import unsupportedEvent from '../../../fixtures/meta/unsupported-event.json';
import missingSender from '../../../fixtures/meta/missing-sender.json';
import malformedPayload from '../../../fixtures/meta/malformed-payload.json';
import feedComment from '../../../fixtures/meta/feed-comment.json';

describe('parser — edited comment (feed verb=edited)', () => {
  it('still parses as PAGE_POST_COMMENT (no edited-specific event yet)', () => {
    const result = parseMetaWebhookPayload(editedComment);
    expect(result.type).toBe('PAGE_POST_COMMENT');
    expect(result.platformMessageId).toBe('COMMENT_456');
    expect(result.text).toContain('edited:');
  });

  it('preserves comment_id across edit cycles for downstream dedup', () => {
    // Edit cycle: parse same edited fixture twice → same platformMessageId
    const a = parseMetaWebhookPayload(editedComment);
    const b = parseMetaWebhookPayload(editedComment);
    expect(a.platformMessageId).toBe(b.platformMessageId);
    expect(a.platformMessageId).toBe('COMMENT_456');
  });
});

describe('parser — deleted comment (feed verb=remove)', () => {
  it('still maps to PAGE_POST_COMMENT shape (downstream decides verb handling)', () => {
    const result = parseMetaWebhookPayload(deletedComment);
    expect(result.type).toBe('PAGE_POST_COMMENT');
    expect(result.platformMessageId).toBe('COMMENT_456');
  });

  it('parses without throwing on missing message text', () => {
    expect(() => parseMetaWebhookPayload(deletedComment)).not.toThrow();
  });
});

describe('parser — unsupported event types', () => {
  it('returns UNKNOWN for reaction event', () => {
    const result = parseMetaWebhookPayload(unsupportedEvent);
    expect(result.type).toBe('UNKNOWN');
  });

  it('returns frozen empty event on unsupported type (no partial data leak)', () => {
    const result = parseMetaWebhookPayload(unsupportedEvent);
    expect(result.platformPageId).toBeNull();
    expect(result.platformUserId).toBeNull();
    expect(result.text).toBeNull();
    expect(result.postId).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('parser — missing sender in messaging payload', () => {
  it('parses event but platformUserId is null', () => {
    const result = parseMetaWebhookPayload(missingSender);
    expect(result.type).toBe('PAGE_INBOX_TEXT');
    expect(result.platformUserId).toBeNull();
    expect(result.platformMessageId).toBe('m_no_sender_999');
  });

  it('text still extracted when sender missing', () => {
    const result = parseMetaWebhookPayload(missingSender);
    expect(result.text).toBe('ghost message');
  });
});

describe('parser — malformed payloads', () => {
  it('returns UNKNOWN when entry is not an array', () => {
    const result = parseMetaWebhookPayload(malformedPayload);
    expect(result.type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for null', () => {
    expect(parseMetaWebhookPayload(null).type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for undefined', () => {
    expect(parseMetaWebhookPayload(undefined).type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for empty object', () => {
    expect(parseMetaWebhookPayload({}).type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for primitive string', () => {
    expect(parseMetaWebhookPayload('not-json').type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for primitive number', () => {
    expect(parseMetaWebhookPayload(42).type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for array root', () => {
    expect(parseMetaWebhookPayload([1, 2, 3]).type).toBe('UNKNOWN');
  });
});

describe('parser — idempotency-key derivation (duplicate delivery)', () => {
  it('same platformMessageId produces identical parse result (dedup at consumer)', () => {
    const a = parseMetaWebhookPayload(feedComment);
    const b = parseMetaWebhookPayload(feedComment);
    expect(a.platformMessageId).toBe(b.platformMessageId);
    expect(a.text).toBe(b.text);
    expect(a.platformUserId).toBe(b.platformUserId);
    expect(a.timestamp).toBe(b.timestamp);
  });

  it('platformMessageId is the natural idempotency key candidate for feed events', () => {
    const result = parseMetaWebhookPayload(feedComment);
    // platformMessageId == comment_id == feed-event-unique
    expect(result.platformMessageId).toBeTruthy();
    expect(typeof result.platformMessageId).toBe('string');
  });
});

describe('parser — PII minimization', () => {
  it('result shape contains no email field', () => {
    const result = parseMetaWebhookPayload(feedComment);
    expect('email' in result).toBe(false);
  });

  it('result shape contains no phone field', () => {
    const result = parseMetaWebhookPayload(feedComment);
    expect('phone' in result).toBe(false);
  });

  it('result shape contains no address field', () => {
    const result = parseMetaWebhookPayload(feedComment);
    expect('address' in result).toBe(false);
  });

  it('result has bounded key set (no surprise PII leak)', () => {
    const result = parseMetaWebhookPayload(feedComment);
    const ALLOWED_KEYS = new Set([
      'type',
      'platformPageId',
      'platformUserId',
      'displayName',
      'platformMessageId',
      'text',
      'timestamp',
      'attachmentUrl',
      'postbackPayload',
      'postId',
      'liveVideoId',
    ]);
    for (const key of Object.keys(result)) {
      expect(ALLOWED_KEYS.has(key)).toBe(true);
    }
  });
});

describe('parser — empty-string vs missing-field semantics', () => {
  it('empty string in name returns null (best-effort string read)', () => {
    const payload = {
      object: 'page',
      entry: [
        {
          id: 'PAGE_1',
          changes: [
            {
              field: 'feed',
              value: {
                item: 'comment',
                comment_id: 'C1',
                from: { id: 'U1', name: '' },
                message: 'hi',
              },
            },
          ],
        },
      ],
    };
    const result = parseMetaWebhookPayload(payload);
    expect(result.displayName).toBeNull();
  });

  it('null timestamp does not throw', () => {
    const payload = {
      object: 'page',
      entry: [
        {
          id: 'PAGE_1',
          messaging: [
            {
              sender: { id: 'U1' },
              message: { mid: 'm1', text: 'no ts' },
            },
          ],
        },
      ],
    };
    expect(() => parseMetaWebhookPayload(payload)).not.toThrow();
    const result = parseMetaWebhookPayload(payload);
    expect(result.timestamp).toBeNull();
  });
});

describe('parser — output immutability', () => {
  it('returns frozen object', () => {
    const result = parseMetaWebhookPayload(feedComment);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('cannot be mutated by caller', () => {
    const result = parseMetaWebhookPayload(feedComment);
    expect(() => {
      (result as { text: string | null }).text = 'mutated';
    }).toThrow(TypeError);
  });
});
