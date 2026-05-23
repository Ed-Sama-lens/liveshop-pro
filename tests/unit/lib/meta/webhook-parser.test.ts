import { describe, it, expect } from 'vitest';
import { parseMetaWebhookPayload } from '@/lib/meta/webhook-parser';
import messagesText from '../../../fixtures/meta/messages-text.json';
import messagesImage from '../../../fixtures/meta/messages-image.json';
import messagesPostback from '../../../fixtures/meta/messages-postback.json';
import feedComment from '../../../fixtures/meta/feed-comment.json';
import liveVideoComment from '../../../fixtures/meta/live-video-comment.json';

/**
 * Tier 4.1-prep (2026-05-23) — pure parser tests.
 *
 * Uses canned fixtures under tests/fixtures/meta/. No runtime side
 * effects. No webhook subscription. Verifies the unified ParsedEvent
 * shape so Tier 4.1-C route + Tier 4.1-F integration tests can rely
 * on it.
 */

describe('parseMetaWebhookPayload — Page Inbox text', () => {
  const event = parseMetaWebhookPayload(messagesText);

  it('type = PAGE_INBOX_TEXT', () => {
    expect(event.type).toBe('PAGE_INBOX_TEXT');
  });

  it('extracts platformUserId from sender.id', () => {
    expect(event.platformUserId).toBe('FB_USER_ID_12345');
  });

  it('extracts platformMessageId from message.mid', () => {
    expect(event.platformMessageId).toBe('m_FAKE_MESSAGE_ID_text_001');
  });

  it('extracts text body', () => {
    expect(event.text).toBe('+1 CM5');
  });

  it('extracts numeric timestamp', () => {
    expect(typeof event.timestamp).toBe('number');
  });

  it('extracts platformPageId from entry.id', () => {
    expect(event.platformPageId).toBe('PAGE_ID_PLACEHOLDER');
  });

  it('no attachmentUrl on text event', () => {
    expect(event.attachmentUrl).toBeNull();
  });

  it('no postbackPayload on text event', () => {
    expect(event.postbackPayload).toBeNull();
  });
});

describe('parseMetaWebhookPayload — Page Inbox image attachment', () => {
  const event = parseMetaWebhookPayload(messagesImage);

  it('type = PAGE_INBOX_IMAGE', () => {
    expect(event.type).toBe('PAGE_INBOX_IMAGE');
  });

  it('extracts attachmentUrl', () => {
    expect(event.attachmentUrl).toBe('https://example.com/fake-image-attachment.jpg');
  });

  it('still has platformMessageId for dedup', () => {
    expect(event.platformMessageId).toBe('m_FAKE_MESSAGE_ID_image_001');
  });
});

describe('parseMetaWebhookPayload — Page Inbox postback', () => {
  const event = parseMetaWebhookPayload(messagesPostback);

  it('type = PAGE_INBOX_POSTBACK', () => {
    expect(event.type).toBe('PAGE_INBOX_POSTBACK');
  });

  it('extracts postbackPayload', () => {
    expect(event.postbackPayload).toBe('QUICK_REPLY_OPTION_A');
  });

  it('uses postback.title as text', () => {
    expect(event.text).toBe('Yes, confirm my order');
  });

  it('still has platformMessageId from postback.mid', () => {
    expect(event.platformMessageId).toBe('m_FAKE_MESSAGE_ID_postback_001');
  });
});

describe('parseMetaWebhookPayload — Page Post Comment', () => {
  const event = parseMetaWebhookPayload(feedComment);

  it('type = PAGE_POST_COMMENT', () => {
    expect(event.type).toBe('PAGE_POST_COMMENT');
  });

  it('extracts platformUserId from from.id', () => {
    expect(event.platformUserId).toBe('FB_USER_ID_67890');
  });

  it('extracts displayName from from.name', () => {
    expect(event.displayName).toBe('Fixture User');
  });

  it('extracts platformMessageId from comment_id', () => {
    expect(event.platformMessageId).toBe('POST_ID_FAKE_001_comment_001');
  });

  it('extracts text from value.message', () => {
    expect(event.text).toBe('+2 CM10');
  });

  it('extracts postId from value.post_id', () => {
    expect(event.postId).toBe('POST_ID_FAKE_001');
  });
});

describe('parseMetaWebhookPayload — Live Comment polling', () => {
  const event = parseMetaWebhookPayload(liveVideoComment);

  it('type = PAGE_LIVE_COMMENT', () => {
    expect(event.type).toBe('PAGE_LIVE_COMMENT');
  });

  it('extracts liveVideoId', () => {
    expect(event.liveVideoId).toBe('LIVE_VIDEO_FAKE_001');
  });

  it('extracts platformUserId from from.id', () => {
    expect(event.platformUserId).toBe('FB_USER_ID_99999');
  });

  it('extracts displayName', () => {
    expect(event.displayName).toBe('Live Fixture User');
  });

  it('extracts text', () => {
    expect(event.text).toBe('+3 BD3');
  });

  it('extracts platformMessageId from polling id', () => {
    expect(event.platformMessageId).toBe('LIVE_VIDEO_FAKE_001_comment_001');
  });

  it('timestamp is numeric ms from created_time ISO', () => {
    expect(typeof event.timestamp).toBe('number');
    expect((event.timestamp ?? 0) > 0).toBe(true);
  });
});

describe('parseMetaWebhookPayload — defensive edge cases', () => {
  it('returns UNKNOWN for null payload', () => {
    expect(parseMetaWebhookPayload(null).type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for empty object', () => {
    expect(parseMetaWebhookPayload({}).type).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for non-page envelope', () => {
    expect(
      parseMetaWebhookPayload({ object: 'user', entry: [] }).type
    ).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for empty entry array', () => {
    expect(
      parseMetaWebhookPayload({ object: 'page', entry: [] }).type
    ).toBe('UNKNOWN');
  });

  it('returns UNKNOWN for non-comment feed event', () => {
    expect(
      parseMetaWebhookPayload({
        object: 'page',
        entry: [
          {
            id: 'PAGE',
            changes: [{ field: 'feed', value: { item: 'reaction' } }],
          },
        ],
      }).type
    ).toBe('UNKNOWN');
  });
});

describe('parseMetaWebhookPayload — no PII leak', () => {
  it('does NOT expose customer phone/email/address in any event shape', () => {
    const events = [
      parseMetaWebhookPayload(messagesText),
      parseMetaWebhookPayload(messagesImage),
      parseMetaWebhookPayload(messagesPostback),
      parseMetaWebhookPayload(feedComment),
      parseMetaWebhookPayload(liveVideoComment),
    ];
    for (const ev of events) {
      // ParsedEvent type has no phone/email/address fields by design.
      // Defensive runtime check in case payload mistakenly carried them.
      expect(JSON.stringify(ev)).not.toMatch(/phone/i);
      expect(JSON.stringify(ev)).not.toMatch(/email/i);
      expect(JSON.stringify(ev)).not.toMatch(/address/i);
    }
  });
});
