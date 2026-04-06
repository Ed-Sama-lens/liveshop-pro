import { put, del } from '@vercel/blob';
import crypto from 'crypto';

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

/**
 * Upload a file to Vercel Blob storage.
 * Returns the public URL.
 */
export async function saveFile(
  file: File,
  subfolder: string
): Promise<UploadResult> {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP, GIF`);
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Generate unique filename
  const ext = getExtension(file.type);
  const hash = crypto.randomBytes(16).toString('hex');
  const filename = `${hash}${ext}`;
  const blobPath = `${subfolder}/${filename}`;

  // Upload to Vercel Blob
  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: file.type,
  });

  return Object.freeze({
    url: blob.url,
    filename,
    size: file.size,
    mimeType: file.type,
  });
}

/**
 * Delete a previously uploaded file from Vercel Blob.
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url) return;

  try {
    await del(url);
  } catch {
    // File may already be deleted, ignore
  }
}

function getExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    default: return '.bin';
  }
}
