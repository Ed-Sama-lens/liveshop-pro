/**
 * R2 (Cloudflare) configuration validator. NOT used at startup —
 * called lazily by storage code or tests so missing R2 env on
 * Vercel preview / dev shells does not crash the entire app.
 *
 * The intent is to surface a CLEAR error message at the moment a
 * caller actually tries to use R2, rather than a confusing
 * `undefined` propagation deep inside the AWS SDK. Per Boss Phase
 * 1C scope: "do NOT add global startup failure".
 *
 * Cross-references:
 * - `src/lib/upload/storage.ts` (consumer)
 * - audit gap G1 in `docs/superpowers/2026-05-24-r2-storage-paths-audit.md`
 */

export const R2_REQUIRED_VARS = Object.freeze([
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const);

export type R2RequiredVarName = typeof R2_REQUIRED_VARS[number];

export type R2ConfigOk = {
  readonly ok: true;
  readonly accountId: string;
  readonly bucketName: string;
  readonly publicUrl: string;
  // accessKeyId + secretAccessKey are deliberately NOT returned in
  // the validation result so caller code cannot accidentally log
  // them. Storage layer reads them directly from process.env when
  // constructing the SDK client.
};

export type R2ConfigFail = {
  readonly ok: false;
  readonly missing: ReadonlyArray<R2RequiredVarName>;
  readonly invalid: ReadonlyArray<R2RequiredVarName>;
  readonly reason: string;
};

export type R2ConfigResult = R2ConfigOk | R2ConfigFail;

export interface R2EnvSource {
  readonly R2_ACCOUNT_ID: string | undefined;
  readonly R2_ACCESS_KEY_ID: string | undefined;
  readonly R2_SECRET_ACCESS_KEY: string | undefined;
  readonly R2_BUCKET_NAME: string | undefined;
  readonly R2_PUBLIC_URL: string | undefined;
}

/**
 * Pure evaluator. Returns `{ ok: true, ... }` when every required
 * R2 var is present + non-empty + (for public URL) parses as URL.
 * Otherwise `{ ok: false, missing, invalid, reason }`.
 *
 * NEVER returns the secret access key in the result — caller code
 * that needs to log the result is safe by construction.
 *
 * Caller decides whether to throw, log, skip, or fall back to a
 * stub. Storage layer SHOULD call this BEFORE the first
 * saveFile / getSignedReadUrl / deleteFile use per request, NOT at
 * module init.
 */
export function evaluateR2Config(source: R2EnvSource): R2ConfigResult {
  const missing: R2RequiredVarName[] = [];
  const invalid: R2RequiredVarName[] = [];

  for (const name of R2_REQUIRED_VARS) {
    const value = source[name];
    if (value === undefined || value === null || value === '') {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      invalid: [],
      reason: `Missing R2 config: ${missing.join(', ')}`,
    };
  }

  // All present — validate shape of fields we know how to check.
  // accessKey + secret are opaque tokens; we cannot verify them
  // without an actual R2 call (don't want side effects in a pure
  // validator).
  const publicUrl = source.R2_PUBLIC_URL!;
  try {
    new URL(publicUrl);
  } catch {
    invalid.push('R2_PUBLIC_URL');
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      missing: [],
      invalid,
      reason: `Invalid R2 config: ${invalid.join(', ')}`,
    };
  }

  return Object.freeze({
    ok: true,
    accountId: source.R2_ACCOUNT_ID!,
    bucketName: source.R2_BUCKET_NAME!,
    publicUrl,
  });
}

/**
 * Thin wrapper that reads `process.env` for the standard 5 R2 vars
 * and forwards to `evaluateR2Config`. Use when caller does not need
 * to inject a custom env source.
 */
export function evaluateR2ConfigFromEnv(): R2ConfigResult {
  return evaluateR2Config({
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  });
}

/**
 * Throwing variant for callers that want a hard error (storage
 * layer entry points). Re-uses the pure evaluator + maps fail to
 * `Error`. Message is safe to log — does NOT contain any secret
 * value.
 */
export function assertR2Config(source?: R2EnvSource): R2ConfigOk {
  const result = source
    ? evaluateR2Config(source)
    : evaluateR2ConfigFromEnv();
  if (!result.ok) {
    throw new Error(`R2 config validation failed: ${result.reason}`);
  }
  return result;
}
