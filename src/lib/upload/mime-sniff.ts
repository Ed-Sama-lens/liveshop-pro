/**
 * Magic-bytes mime sniffer for uploaded files.
 *
 * Defense against mime-type spoofing: the upload route trusts the
 * client-declared `file.type` header, but an attacker can send a
 * malicious payload (e.g. PHP script, HTML, zip bomb) with
 * `Content-Type: image/jpeg`. This sniffer reads the first few
 * bytes of the actual buffer and verifies they match a known image
 * magic-number signature.
 *
 * Per R2 audit gap G6 (2026-05-24-r2-storage-paths-audit.md).
 *
 * Pure fn. No I/O. No sharp dependency. Easily unit-testable.
 *
 * Signatures sourced from authoritative file-format specs:
 * - JPEG: FF D8 FF
 * - PNG:  89 50 4E 47 0D 0A 1A 0A
 * - WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 ("RIFF...WEBP")
 * - GIF:  47 49 46 38 (37|39) 61  ("GIF87a" / "GIF89a")
 *
 * Use as a defense-in-depth check ALONGSIDE the existing mime-type
 * allowlist + size cap. Never trust a single layer.
 */

/**
 * Result of a sniff call. Includes the detected mime type if known,
 * or `null` if the magic bytes don't match any recognized signature.
 */
export interface MimeSniffResult {
  readonly detectedMime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null;
  readonly matchesDeclaredMime: boolean;
}

/**
 * Sniff the first bytes of a buffer to determine its actual mime
 * type. Returns the detected mime + whether it matches the
 * caller's declared mime.
 *
 * If the declared mime is NOT in the supported image set, returns
 * `{ detectedMime: null, matchesDeclaredMime: false }`.
 *
 * NEVER throws on invalid / short buffers. Returns `null` detected
 * mime so the caller can decide how to react (typically: reject).
 */
export function sniffImageMime(
  buffer: Buffer,
  declaredMime: string
): MimeSniffResult {
  // Guard: declared mime must be one we know how to sniff.
  const SUPPORTED = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);
  if (!SUPPORTED.has(declaredMime)) {
    return Object.freeze({ detectedMime: null, matchesDeclaredMime: false });
  }

  // Guard: buffer must have at least 12 bytes to check all magic
  // numbers. WebP signature spans 12 bytes (RIFF header + WEBP tag).
  if (buffer.length < 12) {
    return Object.freeze({ detectedMime: null, matchesDeclaredMime: false });
  }

  const detected = detectMime(buffer);
  return Object.freeze({
    detectedMime: detected,
    matchesDeclaredMime: detected === declaredMime,
  });
}

/**
 * Core magic-bytes detection. Returns the detected mime or null.
 */
function detectMime(
  buffer: Buffer
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF: 47 49 46 38 (37|39) 61 = "GIF87a" or "GIF89a"
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 = "RIFF????WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Throwing variant for callers (saveFile) that want to fail fast on
 * mime mismatch. Throws with a clear error message; never leaks raw
 * buffer bytes in the message.
 *
 * Use INSIDE the storage layer's `saveFile` after the existing
 * declared-mime allowlist check passes.
 */
export function assertSniffedMimeMatches(
  buffer: Buffer,
  declaredMime: string
): void {
  const result = sniffImageMime(buffer, declaredMime);
  if (!result.matchesDeclaredMime) {
    const detected = result.detectedMime ?? 'unknown';
    throw new Error(
      `File content does not match declared mime type. Declared: ${declaredMime}; detected: ${detected}.`
    );
  }
}
