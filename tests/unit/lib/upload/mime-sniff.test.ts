import { describe, it, expect } from 'vitest';
import {
  sniffImageMime,
  assertSniffedMimeMatches,
} from '@/lib/upload/mime-sniff';

/**
 * Magic-bytes mime sniff tests. Pure-fn coverage — no I/O, no sharp.
 *
 * Pins per R2 G6 (2026-05-24-r2-storage-paths-audit.md):
 * - JPEG magic FF D8 FF
 * - PNG magic 89 50 4E 47 0D 0A 1A 0A
 * - GIF87a / GIF89a magic 47 49 46 38 (37|39) 61
 * - WebP magic RIFF...WEBP (12 bytes)
 * - Spoofed mime → rejected
 * - Short buffer → rejected safely (no throw)
 * - Unknown declared mime → rejected
 * - Throwing variant throws on mismatch with safe message
 */

// Minimal magic-byte fixtures (just signature + padding to 12 bytes).
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const GIF87_MAGIC = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0,
]);
const GIF89_MAGIC = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0,
]);
const WEBP_MAGIC = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const FAKE_PHP = Buffer.from([
  0x3c, 0x3f, 0x70, 0x68, 0x70, 0x20, 0, 0, 0, 0, 0, 0,
]); // "<?php "
const FAKE_HTML = Buffer.from([
  0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45, 0, 0, 0,
]); // "<!DOCTYPE"

describe('sniffImageMime — happy path (correct magic + declared mime)', () => {
  it('detects JPEG magic', () => {
    const r = sniffImageMime(JPEG_MAGIC, 'image/jpeg');
    expect(r.detectedMime).toBe('image/jpeg');
    expect(r.matchesDeclaredMime).toBe(true);
  });

  it('detects PNG magic', () => {
    const r = sniffImageMime(PNG_MAGIC, 'image/png');
    expect(r.detectedMime).toBe('image/png');
    expect(r.matchesDeclaredMime).toBe(true);
  });

  it('detects GIF87a magic', () => {
    const r = sniffImageMime(GIF87_MAGIC, 'image/gif');
    expect(r.detectedMime).toBe('image/gif');
    expect(r.matchesDeclaredMime).toBe(true);
  });

  it('detects GIF89a magic', () => {
    const r = sniffImageMime(GIF89_MAGIC, 'image/gif');
    expect(r.detectedMime).toBe('image/gif');
    expect(r.matchesDeclaredMime).toBe(true);
  });

  it('detects WebP magic', () => {
    const r = sniffImageMime(WEBP_MAGIC, 'image/webp');
    expect(r.detectedMime).toBe('image/webp');
    expect(r.matchesDeclaredMime).toBe(true);
  });
});

describe('sniffImageMime — spoofed mime (mismatch declaration vs reality)', () => {
  it('JPEG declared but PNG content → mismatch', () => {
    const r = sniffImageMime(PNG_MAGIC, 'image/jpeg');
    expect(r.detectedMime).toBe('image/png');
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('PNG declared but PHP content → null detected + mismatch', () => {
    const r = sniffImageMime(FAKE_PHP, 'image/png');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('JPEG declared but HTML content → null detected + mismatch', () => {
    const r = sniffImageMime(FAKE_HTML, 'image/jpeg');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('WebP declared but GIF content → mismatch', () => {
    const r = sniffImageMime(GIF89_MAGIC, 'image/webp');
    expect(r.detectedMime).toBe('image/gif');
    expect(r.matchesDeclaredMime).toBe(false);
  });
});

describe('sniffImageMime — short buffer (safety)', () => {
  it('returns null + mismatch on empty buffer', () => {
    const r = sniffImageMime(Buffer.alloc(0), 'image/jpeg');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('returns null + mismatch on 1-byte buffer', () => {
    const r = sniffImageMime(Buffer.from([0xff]), 'image/jpeg');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('returns null + mismatch on 11-byte buffer (just under WebP threshold)', () => {
    const r = sniffImageMime(Buffer.alloc(11, 0xff), 'image/webp');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('never throws on any input', () => {
    const inputs = [
      Buffer.alloc(0),
      Buffer.from([0]),
      Buffer.from([0xff, 0xd8]),
      Buffer.alloc(1000, 0),
    ];
    for (const buf of inputs) {
      expect(() => sniffImageMime(buf, 'image/jpeg')).not.toThrow();
    }
  });
});

describe('sniffImageMime — unsupported declared mime', () => {
  it('returns null + mismatch when declared mime is not an image type', () => {
    const r = sniffImageMime(JPEG_MAGIC, 'application/pdf');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('returns null + mismatch for text/html', () => {
    const r = sniffImageMime(JPEG_MAGIC, 'text/html');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });

  it('returns null + mismatch for empty declared mime', () => {
    const r = sniffImageMime(JPEG_MAGIC, '');
    expect(r.detectedMime).toBe(null);
    expect(r.matchesDeclaredMime).toBe(false);
  });
});

describe('sniffImageMime — result frozen (immutability)', () => {
  it('result is frozen', () => {
    const r = sniffImageMime(JPEG_MAGIC, 'image/jpeg');
    expect(Object.isFrozen(r)).toBe(true);
  });
});

describe('assertSniffedMimeMatches — throwing variant', () => {
  it('does NOT throw on match', () => {
    expect(() => assertSniffedMimeMatches(JPEG_MAGIC, 'image/jpeg')).not.toThrow();
    expect(() => assertSniffedMimeMatches(PNG_MAGIC, 'image/png')).not.toThrow();
  });

  it('throws on mime mismatch (PNG content declared as JPEG)', () => {
    expect(() => assertSniffedMimeMatches(PNG_MAGIC, 'image/jpeg')).toThrow(
      /does not match declared mime/
    );
  });

  it('throws on PHP content declared as JPEG', () => {
    expect(() => assertSniffedMimeMatches(FAKE_PHP, 'image/jpeg')).toThrow(
      /does not match declared mime/
    );
  });

  it('error message includes both declared and detected', () => {
    try {
      assertSniffedMimeMatches(PNG_MAGIC, 'image/jpeg');
      throw new Error('Expected to throw');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('image/jpeg');
      expect(msg).toContain('image/png');
    }
  });

  it('error message says "unknown" for unrecognized content', () => {
    try {
      assertSniffedMimeMatches(FAKE_PHP, 'image/jpeg');
      throw new Error('Expected to throw');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('unknown');
    }
  });

  it('throws on too-short buffer', () => {
    expect(() => assertSniffedMimeMatches(Buffer.alloc(5), 'image/jpeg')).toThrow(
      /does not match declared mime/
    );
  });

  it('throws on unsupported declared mime', () => {
    expect(() => assertSniffedMimeMatches(JPEG_MAGIC, 'application/pdf')).toThrow(
      /does not match declared mime/
    );
  });

  it('error message does NOT leak buffer contents (security pin)', () => {
    const sensitive = Buffer.from('SENSITIVE_PAYLOAD_CONTENTS_HERE');
    try {
      assertSniffedMimeMatches(sensitive, 'image/jpeg');
      throw new Error('Expected to throw');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain('SENSITIVE_PAYLOAD');
    }
  });
});
