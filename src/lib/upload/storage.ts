import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { assertR2Config } from './r2-config';
import { assertSniffedMimeMatches } from './mime-sniff';

// ─── R2 Client ────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'liveshop-images';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? ''; // e.g. https://images.nazhahatyai.com

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Config ───────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface UploadResult {
  readonly url: string;
  readonly filename: string;
  readonly size: number;
  readonly mimeType: string;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a file to Cloudflare R2.
 * Accepts either a File object or a raw Buffer with mimeType.
 */
export async function saveFile(
  input: File | { buffer: Buffer; mimeType: string },
  subfolder: string
): Promise<UploadResult> {
  // Lazy R2 config check — surfaces a clear error at first use
  // instead of a confusing SDK error deep inside putObject. Does NOT
  // run at module init (per Boss Decision 4 — no startup failure).
  assertR2Config();

  const mimeType = input instanceof File ? input.type : input.mimeType;
  const body = input instanceof File
    ? Buffer.from(await input.arrayBuffer())
    : input.buffer;

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Invalid file type: ${mimeType}. Allowed: JPEG, PNG, WebP, GIF`);
  }

  if (body.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Defense in depth: verify the actual file content matches the
  // declared mime type. Defends against mime-type spoofing where a
  // malicious payload (PHP / HTML / zip) is sent with
  // `Content-Type: image/jpeg`. Per R2 audit gap G6.
  assertSniffedMimeMatches(body, mimeType);

  const ext = getExtension(mimeType);
  const hash = crypto.randomBytes(16).toString('hex');
  const filename = `${hash}${ext}`;
  const key = `${subfolder}/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: mimeType,
    })
  );

  const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;

  return Object.freeze({
    url,
    filename,
    size: body.length,
    mimeType,
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a file from Cloudflare R2 by its URL or key.
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url) return;

  // Lazy R2 config check at first use — see saveFile rationale.
  assertR2Config();

  const key = extractKeyFromPublicUrl(url);

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
  } catch {
    // File may already be deleted, ignore
  }
}

// ─── Signed read URL ──────────────────────────────────────────────────────────

/**
 * Default signed-URL expiry in seconds. Short window favors safety:
 * - 600 seconds = 10 minutes
 * - long enough for admin to open + view + download a slip
 * - short enough that a leaked link expires before serious harm
 *
 * Configurable per call via `expirySeconds` arg, but bounded by
 * SIGNED_URL_MAX_EXPIRY_SECONDS to prevent caller mistakes.
 */
export const SIGNED_URL_DEFAULT_EXPIRY_SECONDS = 600;
export const SIGNED_URL_MAX_EXPIRY_SECONDS = 3600;
export const SIGNED_URL_MIN_EXPIRY_SECONDS = 30;

export interface SignedReadUrlInput {
  /** Either a full public CDN URL or a raw bucket key. */
  readonly publicUrlOrKey: string;
  /**
   * Seconds until expiry. Defaults to 600 (10 min). Clamped to
   * [SIGNED_URL_MIN_EXPIRY_SECONDS, SIGNED_URL_MAX_EXPIRY_SECONDS].
   */
  readonly expirySeconds?: number;
}

export interface SignedReadUrlResult {
  readonly url: string;
  readonly expiresAt: Date;
  readonly key: string;
}

/**
 * Generate a time-limited signed GET URL for reading a private R2
 * object. Use this for sensitive blobs (payment slips, customer ID
 * scans, anything that must NOT live on the public CDN URL forever).
 *
 * Does NOT mutate R2 (read-only signature). Does NOT change DB. Does
 * NOT change bucket policy. Caller is responsible for AUTH + ownership
 * checks BEFORE calling this fn — the signature itself does not
 * authenticate the requester, only the bucket access.
 *
 * Throws if the R2 client cannot sign (missing creds, malformed key).
 */
export async function getSignedReadUrl(
  input: SignedReadUrlInput
): Promise<SignedReadUrlResult> {
  // Lazy R2 config check at first use — see saveFile rationale.
  assertR2Config();

  const key = extractKeyFromPublicUrl(input.publicUrlOrKey);
  if (!key || key.length === 0) {
    throw new Error('getSignedReadUrl: empty key after extraction');
  }
  assertSafeKey(key);

  const requestedExpiry = input.expirySeconds ?? SIGNED_URL_DEFAULT_EXPIRY_SECONDS;
  const clampedExpiry = Math.max(
    SIGNED_URL_MIN_EXPIRY_SECONDS,
    Math.min(SIGNED_URL_MAX_EXPIRY_SECONDS, Math.floor(requestedExpiry))
  );

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: clampedExpiry });
  const expiresAt = new Date(Date.now() + clampedExpiry * 1000);

  return Object.freeze({
    url,
    expiresAt,
    key,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    default: return '.bin';
  }
}

/**
 * Extract the R2 bucket key from a public CDN URL or pass through if
 * the input is already a raw key. Shared by `deleteFile` and
 * `getSignedReadUrl` to ensure both fns treat the same input the same
 * way.
 *
 * If `R2_PUBLIC_URL` is set and the input starts with it, strip the
 * prefix + leading slash. Otherwise treat input as raw key.
 */
export function extractKeyFromPublicUrl(url: string): string {
  if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL)) {
    return url.slice(R2_PUBLIC_URL.length + 1);
  }
  return url;
}

/**
 * Reject keys that look like path-traversal or absolute-path attacks.
 * Safe key characters: alphanumerics, slash, hyphen, underscore, dot,
 * percent-encoded sequences (R2 keys may include them).
 *
 * Throws on:
 * - empty key
 * - leading slash
 * - parent-directory segments (`..`)
 * - leading or trailing whitespace
 * - control characters
 */
export function assertSafeKey(key: string): void {
  if (key.length === 0) {
    throw new Error('assertSafeKey: empty key');
  }
  if (key.startsWith('/')) {
    throw new Error('assertSafeKey: key must not start with /');
  }
  if (key !== key.trim()) {
    throw new Error('assertSafeKey: key must not have leading/trailing whitespace');
  }
  for (const segment of key.split('/')) {
    if (segment === '..' || segment === '.') {
      throw new Error(`assertSafeKey: traversal segment "${segment}" rejected`);
    }
  }
  // Reject control chars (null, newline, tab, etc)
  if (/[\x00-\x1F\x7F]/.test(key)) {
    throw new Error('assertSafeKey: control character in key');
  }
}
