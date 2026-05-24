/**
 * Pure-fn path validators for upload routes. Extracted to its own
 * file so unit tests can import without dragging the Next.js
 * runtime + next-auth + Prisma into the test process.
 *
 * NEVER soften these guards. They are the last line of defense
 * before composed paths reach the storage layer.
 */

/**
 * Strict allowlist of category values accepted by `POST /api/upload`.
 * Anything outside this list is rejected (400) — earlier versions
 * silently defaulted to 'general' which made input validation harder
 * to reason about. Keep this list narrow; future categories should
 * be added explicitly here AND in the test file.
 */
export const UPLOAD_VALID_CATEGORIES = Object.freeze([
  'products',
  'slips',
  'branding',
  'general',
] as const);

export type UploadCategory = typeof UPLOAD_VALID_CATEGORIES[number];

export function isValidUploadCategory(value: unknown): value is UploadCategory {
  return typeof value === 'string'
    && UPLOAD_VALID_CATEGORIES.includes(value as UploadCategory);
}

/**
 * Defense-in-depth path-segment validator. Pure fn. Rejects:
 *  - empty path
 *  - leading slash (absolute path)
 *  - leading or trailing whitespace
 *  - `..` or `.` segments (traversal)
 *  - control characters (NUL through US, plus DEL `\x7F`)
 *
 * Throws Error on rejection (caller maps to 400 via toAppError).
 *
 * Future PR may share more logic with `assertSafeKey` in
 * `src/lib/upload/storage.ts` (Phase 1A).
 */
export function assertSafeUploadPath(path: string): void {
  if (path.length === 0) {
    throw new Error('Upload path is empty');
  }
  if (path.startsWith('/')) {
    throw new Error('Upload path must not start with /');
  }
  if (path !== path.trim()) {
    throw new Error('Upload path must not have leading/trailing whitespace');
  }
  for (const segment of path.split('/')) {
    if (segment === '..' || segment === '.') {
      throw new Error(`Upload path traversal segment "${segment}" rejected`);
    }
  }
  if (/[\x00-\x1F\x7F]/.test(path)) {
    throw new Error('Upload path contains control character');
  }
}
