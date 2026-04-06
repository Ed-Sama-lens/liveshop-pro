import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

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
 * Returns the public URL.
 */
export async function saveFile(
  file: File,
  subfolder: string
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, GIF`);
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  const ext = getExtension(file.type);
  const hash = crypto.randomBytes(16).toString('hex');
  const filename = `${hash}${ext}`;
  const key = `${subfolder}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );

  const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : key;

  return Object.freeze({
    url,
    filename,
    size: file.size,
    mimeType: file.type,
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a file from Cloudflare R2 by its URL or key.
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url) return;

  // Extract key from public URL
  const key = R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL)
    ? url.slice(R2_PUBLIC_URL.length + 1)
    : url;

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
