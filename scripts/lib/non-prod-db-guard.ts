/**
 * Production-safety guard for local verifier scripts.
 *
 * Pure-function evaluator extracted from
 * scripts/verify-sale-d4-d6-functional-flow.ts so the guard logic
 * itself is unit-testable without launching a subprocess.
 *
 * The verifier scripts still wrap this with a `process.exit(2)`
 * branch when the guard rejects — see assertNonProdDatabase() at the
 * top of each verifier. Tests target the pure evaluator directly.
 *
 * NEVER soften the deny-list. NEVER add a Railway / production host
 * to ALLOWED_LOCAL_HOSTS. NEVER remove the CONFIRM_NON_PROD_DB gate.
 *
 * NOT exported via npm package. Only consumed by scripts/.
 */

export const PROD_HOST_DENY_LIST = ['junction.proxy.rlwy.net', 'rlwy.net'] as const;
export const ALLOWED_LOCAL_HOSTS = ['localhost', '127.0.0.1'] as const;
export const REQUIRED_DB_NAME = 'liveshop_pro';
export const PROD_URL_MARKERS = ['nazhahatyai'] as const;

export type GuardOk = {
  readonly ok: true;
  readonly url: string;
  readonly sanitizedHost: string;
};

export type GuardFail = {
  readonly ok: false;
  readonly reason: string;
};

export type GuardResult = GuardOk | GuardFail;

export interface GuardInput {
  readonly databaseUrl: string | undefined;
  readonly confirmNonProdDb: string | undefined;
}

/**
 * Pure evaluator. Returns `{ ok: true, ... }` when ALL six layers
 * pass, otherwise `{ ok: false, reason }` with the specific reject
 * reason. Caller decides whether to exit, throw, or skip.
 *
 * Order of checks matters: cheapest + most-likely-fail first.
 */
export function evaluateNonProdDatabase(input: GuardInput): GuardResult {
  // Layer 1 — explicit acknowledgment
  if (input.confirmNonProdDb !== 'true') {
    return { ok: false, reason: 'CONFIRM_NON_PROD_DB must equal "true"' };
  }

  // Layer 2 — DATABASE_URL exists
  const url = input.databaseUrl;
  if (!url) {
    return { ok: false, reason: 'DATABASE_URL is not set' };
  }

  // Layer 3 — DATABASE_URL parses as URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'DATABASE_URL is not a valid URL' };
  }

  // Layer 4 — hostname not in production deny-list
  for (const denied of PROD_HOST_DENY_LIST) {
    if (parsed.hostname.includes(denied)) {
      return {
        ok: false,
        reason: `hostname looks like production (${denied})`,
      };
    }
  }

  // Layer 5 — full URL string does not contain production markers
  for (const marker of PROD_URL_MARKERS) {
    if (url.includes(marker)) {
      return { ok: false, reason: `DATABASE_URL contains "${marker}"` };
    }
  }

  // Layer 6 — hostname in explicit local allowlist
  if (!ALLOWED_LOCAL_HOSTS.some((h) => parsed.hostname === h)) {
    return {
      ok: false,
      reason: `hostname ${parsed.hostname} is not in allowlist ${ALLOWED_LOCAL_HOSTS.join(', ')}`,
    };
  }

  // Layer 7 — DB name equals expected
  const dbName = parsed.pathname.replace(/^\//, '');
  if (dbName !== REQUIRED_DB_NAME) {
    return {
      ok: false,
      reason: `database name ${dbName} != ${REQUIRED_DB_NAME}`,
    };
  }

  const sanitizedHost = parsed.hostname + ':' + (parsed.port || '5432');
  return { ok: true, url, sanitizedHost };
}
