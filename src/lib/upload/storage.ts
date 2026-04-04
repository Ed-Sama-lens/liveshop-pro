import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

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
 * Save an uploaded file to local storage.
 * Returns the public URL path.
 *
 * In production, swap this for S3/Cloudinary/R2.
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

  // Create upload directory
  const dir = path.join(UPLOAD_DIR, subfolder);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Generate unique filename
  const ext = getExtension(file.type);
  const hash = crypto.randomBytes(16).toString('hex');
  const filename = `${hash}${ext}`;
  const filepath = path.join(dir, filename);

  // Write file
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  return Object.freeze({
    url: `/uploads/${subfolder}/${filename}`,
    filename,
    size: file.size,
    mimeType: file.type,
  });
}

/**
 * Delete a previously uploaded file by its URL path.
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url.startsWith('/uploads/')) return;

  const filepath = path.join(process.cwd(), 'public', url);
  try {
    await unlink(filepath);
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
