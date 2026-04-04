import { describe, it, expect } from 'vitest';
import {
  sendMessageSchema,
  chatQuerySchema,
  messageQuerySchema,
  assignChatSchema,
  chatTemplateSchema,
} from '@/lib/validation/chat.schemas';

describe('sendMessageSchema', () => {
  it('accepts valid message', () => {
    const result = sendMessageSchema.safeParse({ content: 'Hello!' });
    expect(result.success).toBe(true);
  });

  it('accepts message with media URL', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Check this',
      mediaUrl: 'https://example.com/image.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects content over 4000 chars', () => {
    const result = sendMessageSchema.safeParse({ content: 'a'.repeat(4001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid media URL', () => {
    const result = sendMessageSchema.safeParse({
      content: 'Hello',
      mediaUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('chatQuerySchema', () => {
  it('provides defaults', () => {
    const result = chatQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('coerces string page/limit', () => {
    const result = chatQuerySchema.safeParse({ page: '2', limit: '30' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(30);
    }
  });

  it('accepts search filter', () => {
    const result = chatQuerySchema.safeParse({ search: 'John' });
    expect(result.success).toBe(true);
  });

  it('accepts unreadOnly filter', () => {
    const result = chatQuerySchema.safeParse({ unreadOnly: 'true' });
    expect(result.success).toBe(true);
  });

  it('rejects limit > 100', () => {
    const result = chatQuerySchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });
});

describe('messageQuerySchema', () => {
  it('provides defaults', () => {
    const result = messageQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts before cursor', () => {
    const result = messageQuerySchema.safeParse({
      before: '2025-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('assignChatSchema', () => {
  it('accepts userId', () => {
    const result = assignChatSchema.safeParse({ userId: 'user-1' });
    expect(result.success).toBe(true);
  });

  it('accepts missing userId (unassign)', () => {
    const result = assignChatSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBeUndefined();
    }
  });

  it('rejects empty string userId', () => {
    const result = assignChatSchema.safeParse({ userId: '' });
    expect(result.success).toBe(false);
  });
});

describe('chatTemplateSchema', () => {
  it('accepts valid template', () => {
    const result = chatTemplateSchema.safeParse({
      title: 'Greeting',
      content: 'Hello, how can I help you?',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = chatTemplateSchema.safeParse({
      title: '',
      content: 'Content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = chatTemplateSchema.safeParse({
      title: 'Title',
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects title over 100 chars', () => {
    const result = chatTemplateSchema.safeParse({
      title: 'a'.repeat(101),
      content: 'Content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content over 4000 chars', () => {
    const result = chatTemplateSchema.safeParse({
      title: 'Title',
      content: 'a'.repeat(4001),
    });
    expect(result.success).toBe(false);
  });
});
